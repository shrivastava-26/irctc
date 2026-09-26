const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

loadLocalWorkerEnv()

function loadLocalWorkerEnv() {
  const file = path.resolve(process.env.SIVA_WORKER_ENV_FILE || '.env.local-worker')
  if (!fs.existsSync(file)) return

  const raw = fs.readFileSync(file, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) process.env[key] = value
  }
}


const { runBooking, runMock } = require('../src/engine/playwrightRunner')
const { preflightIRCTCAccess } = require('../src/engine/irctc/sessionManager')
const { JourneyWorkerPool } = require('../src/scheduler/JourneyWorkerPool')
const { getLocalWorkerCredentials, localWorkerAccount } = require('../src/security/LocalWorkerCredentials')

const CONTROL_URL = normalizeControlUrl(process.env.SIVA_CONTROL_URL || 'http://127.0.0.1:3001')
const WORKER_TOKEN = String(process.env.SIVA_WORKER_TOKEN || '')
const WORKER_ID = String(
  process.env.SIVA_WORKER_ID ||
  crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0, 16)
)
const POLL_MS = positiveInt(process.env.SIVA_WORKER_POLL_MS, 2000)
const HEARTBEAT_MS = positiveInt(process.env.SIVA_WORKER_HEARTBEAT_MS, 15000)
const LEASE_MS = Math.max(HEARTBEAT_MS * 3, positiveInt(process.env.SIVA_WORKER_LEASE_MS, 60000))
const CONCURRENCY = positiveInt(process.env.SIVA_WORKER_CONCURRENCY, 1)

if (!WORKER_TOKEN) {
  console.error('[LOCAL-WORKER] Missing SIVA_WORKER_TOKEN.')
  process.exit(1)
}

function normalizeControlUrl(value) {
  const raw = String(value || '').replace(/\/$/, '')
  if (/\/api$/i.test(raw)) return raw
  return raw + '/api'
}

function positiveInt(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function endpoint(pathname) {
  return CONTROL_URL + pathname
}

async function requestJson(pathname, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.SIVA_WORKER_HTTP_TIMEOUT_MS) || 15000)

  try {
    const response = await fetch(endpoint(pathname), {
      ...options,
      headers: {
        'content-type': 'application/json',
        'x-worker-token': WORKER_TOKEN,
        ...(options.headers || {}),
      },
      signal: controller.signal,
    })

    let body = {}
    try { body = await response.json() } catch {}

    if (!response.ok) {
      const detail = body.error || body.details || ('HTTP ' + response.status)
      const error = new Error(detail)
      error.status = response.status
      throw error
    }

    return body
  } finally {
    clearTimeout(timeout)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const pool = new JourneyWorkerPool()
const running = new Map()
const preflightCache = new Map()
let stopping = false
let presenceStopSignal = null

async function claimOne() {
  const body = await requestJson('/worker/claim', {
    method: 'POST',
    body: JSON.stringify({
      workerId: WORKER_ID,
      executionTarget: 'LOCAL',
      accountReference: localWorkerAccount(),
      leaseMs: LEASE_MS,
    }),
  })
  return body.job || null
}

async function workerHeartbeatLoop(stopSignal) {
  while (!stopSignal.stopped) {
    try {
      await requestJson('/worker/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          workerId: WORKER_ID,
          accountReference: localWorkerAccount(),
          concurrency: CONCURRENCY,
          activeJobs: running.size,
        }),
      })
    } catch (error) {
      console.error('[LOCAL-WORKER] Presence heartbeat failed: ' + error.message)
    }
    await sleep(Math.min(HEARTBEAT_MS, 10000))
  }
}

async function heartbeatLoop(jobId, stopSignal) {
  while (!stopSignal.stopped) {
    await sleep(HEARTBEAT_MS)
    if (stopSignal.stopped) break
    try {
      await requestJson('/worker/jobs/' + encodeURIComponent(jobId) + '/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ workerId: WORKER_ID, leaseMs: LEASE_MS }),
      })
    } catch (error) {
      console.error('[LOCAL-WORKER] Heartbeat failed for ' + jobId + ': ' + error.message)
    }
  }
}

async function emitEvent(job, event) {
  try {
    await requestJson('/worker/jobs/' + encodeURIComponent(job.id) + '/events', {
      method: 'POST',
      body: JSON.stringify({ workerId: WORKER_ID, event }),
    })
  } catch (error) {
    console.error('[LOCAL-WORKER] Event sync failed for ' + job.id + ': ' + error.message)
  }
}

async function completeJob(job, result) {
  await requestJson('/worker/jobs/' + encodeURIComponent(job.id) + '/complete', {
    method: 'POST',
    body: JSON.stringify({
      workerId: WORKER_ID,
      success: Boolean(result?.success && result?.pnr && result?.state === 'SUCCESS'),
      result: result || null,
      error: result?.success ? null : (result?.error || 'Local worker execution failed.'),
    }),
  })
}


async function ensureIRCTCAccess(request, emit) {
  const key = String(request?.browser || 'auto')
  const cached = preflightCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.result

  const result = await preflightIRCTCAccess({
    request,
    onEvent: emit,
  })

  preflightCache.set(key, {
    result,
    expiresAt: Date.now() + 30000,
  })

  return result
}

async function runJob(job) {
  const release = await pool.acquire(job, stats => {
    console.log(
      '[LOCAL-WORKER] Job ' + job.id +
      ' acquired. active=' + stats.concurrency.active +
      '/' + stats.concurrency.maxConcurrent + '.'
    )
  })

  const stopSignal = { stopped: false }
  const heartbeat = heartbeatLoop(job.id, stopSignal)
  running.set(job.id, true)

  try {
    await emitEvent(job, {
      type: 'LOG',
      message: '[LOCAL-WORKER] Claimed by ' + WORKER_ID + ' on the local execution plane.',
    })

    if (!job.request.isMock) {
      const preflight = await ensureIRCTCAccess(job.request, event => emitEvent(job, event))
      if (!preflight.ok) {
        throw new Error(preflight.reason)
      }
    }

    const credentials = job.request.isMock
      ? null
      : await getLocalWorkerCredentials(job.request.credentialsReference)

    const result = job.request.isMock
      ? await runMock(job, event => emitEvent(job, event))
      : await runBooking(job, credentials, event => emitEvent(job, event))

    await completeJob(job, result)
    console.log('[LOCAL-WORKER] Job ' + job.id + ' completed with ' + (result.pnr || result.error || 'unknown result') + '.')
  } catch (error) {
    const failure = {
      success: false,
      state: 'LOCAL_WORKER',
      error: error.message,
    }
    try {
      await completeJob(job, failure)
    } catch (syncError) {
      console.error('[LOCAL-WORKER] Completion sync failed for ' + job.id + ': ' + syncError.message)
    }
    console.error('[LOCAL-WORKER] Job ' + job.id + ' failed: ' + error.message)
  } finally {
    stopSignal.stopped = true
    await heartbeat.catch(() => {})
    running.delete(job.id)
    release()
  }
}

async function fillSlots() {
  while (!stopping && running.size < CONCURRENCY) {
    let job
    try {
      job = await claimOne()
    } catch (error) {
      if (error.status !== 404 && error.status !== 204) {
        console.error('[LOCAL-WORKER] Claim failed: ' + error.message)
      }
      return
    }

    if (!job) return

    void runJob(job).catch(error => {
      console.error('[LOCAL-WORKER] Unhandled job error: ' + error.message)
    })
  }
}

async function main() {
  console.log('[LOCAL-WORKER] Control plane: ' + CONTROL_URL)
  console.log('[LOCAL-WORKER] Worker ID: ' + WORKER_ID)
  console.log('[LOCAL-WORKER] Account: ' + (localWorkerAccount() || 'credential map'))
  console.log('[LOCAL-WORKER] Concurrency: ' + CONCURRENCY)

  presenceStopSignal = { stopped: false }
  const presence = workerHeartbeatLoop(presenceStopSignal)

  while (!stopping) {
    await fillSlots()
    if (!stopping) await sleep(POLL_MS)
  }

  presenceStopSignal.stopped = true
  await presence.catch(() => {})
}

function stop(signal) {
  if (stopping) return
  stopping = true
  if (presenceStopSignal) presenceStopSignal.stopped = true
  console.log('[LOCAL-WORKER] Received ' + signal + '; finishing active jobs without claiming new work.')
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

main().catch(error => {
  console.error('[LOCAL-WORKER] Fatal: ' + error.message)
  process.exitCode = 1
})
