// Render is the control plane only. Browser execution is owned by the outbound local worker.
// There is intentionally no hosted browser execution path.

const CredentialManager = require('../security/CredentialManager')
const { runBooking, runMock } = require('../engine/playwrightRunner')
const JobStore = require('../persistence/JobStore')
const { Job } = require('../models/Job')
const { JourneyWorkerPool } = require('./JourneyWorkerPool')

let recovered = false
const activeJobs = new Set()
const workerPool = JourneyWorkerPool.fromEnvironment()

function preparationWindowMs() {
  const configured = Number(process.env.BOOKING_PREPARATION_WINDOW_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : 60000
}

function targetTimeMs(scheduledAt) {
  if (!scheduledAt) return null
  const value = new Date(scheduledAt).getTime()
  return Number.isNaN(value) ? null : value
}

function executionStartDelayMs(scheduledAt) {
  const target = targetTimeMs(scheduledAt)
  if (target == null) return 0
  return Math.max(0, target - preparationWindowMs() - Date.now())
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function schedule(job) {
  if (String(job.request?.executionTarget || '').toUpperCase() !== 'LOCAL') {
    job.fail('Hosted browser execution is disabled. Start the local browser worker to execute this job.')
    JobStore.save(job)
    return
  }

  job.addLog('[SCHEDULER] Local execution selected; waiting for the outbound local browser worker.')
  JobStore.save(job)
  return

  /*

  const delayMs = executionStartDelayMs(job.scheduledAt)

  if (delayMs > 0) {
    job.addLog(
      'Job scheduled. Browser preparation begins in ' +
      Math.round(delayMs / 1000) +
      's.',
    )
    JobStore.save(job)
    await sleep(delayMs)
  }

  await execute(job)
  */
}

async function execute(job) {
  if (activeJobs.has(job.id)) return

  const persisted = JobStore.findById(job.id)
  if (persisted?.status === 'COMPLETED' || persisted?.request?.executionTarget === 'LOCAL') return

  activeJobs.add(job.id)
  let releaseWorker = null

  try {
    job.addLog('[SCHEDULER] Waiting for an execution slot for account ' + workerPool.accountKey(job) + '.')
    releaseWorker = await workerPool.acquire(job, stats => {
      job.addLog('[SCHEDULER] Execution slot acquired. active=' + stats.concurrency.active + '/' + stats.concurrency.maxConcurrent + ', queued=' + stats.concurrency.queued + '.')
    })

    job.markRunning()
    JobStore.save(job)
    let result

    if (job.request.isMock) {
      result = await runMock(job, event => onEngineEvent(job, event))
      if (result.success && result.pnr) job.complete(result.pnr, result)
      else job.fail(result.error || 'Mock execution did not verify a result.')
    } else {
      const credentials = await CredentialManager.getCredentials(job.request.credentialsReference)
      result = await runBooking(job, credentials, event => onEngineEvent(job, event))

      if (result.success && result.pnr && result.state === 'SUCCESS') {
        job.complete(result.pnr, result)
      } else if (result.success) {
        job.fail('Execution finished without an authoritative SUCCESS state.')
      } else {
        job.fail(result.error || 'Playwright booking execution failed.')
      }
    }
  } catch (error) {
    job.fail(error.message)
  } finally {
    JobStore.save(job)
    releaseWorker?.()
    activeJobs.delete(job.id)
  }
}

function onEngineEvent(job, event) {
  if (event.type === 'STATE_CHANGED' && event.state) {
    job.transition(event.state, event.message)
  } else if (event.type === 'LOG') {
    job.addLog(event.message)
  }
  JobStore.save(job)
}

async function recoverPendingJobs() {
  if (recovered) return
  recovered = true

  const pending = JobStore.findAll()
    .filter(data => (data.status === 'STARTING' || data.status === 'RUNNING'))
    .filter(data => String(data.request?.executionTarget || 'LOCAL').toUpperCase() !== 'LOCAL')
    .map(data => Job.fromJSON(data))

  for (const job of pending) {
    schedule(job).catch(error => {
      job.fail('Recovery scheduler error: ' + error.message)
      JobStore.save(job)
    })
  }
}

module.exports = {
  schedule,
  recoverPendingJobs,
  executionStartDelayMs,
  preparationWindowMs,
}
