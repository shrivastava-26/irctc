// Persists jobs to .data/jobs.json with atomic replacement.
// All filesystem work is synchronous, so read-modify-write sections are
// serialized within the single Node.js process used by this personal app.

const fs = require('fs')
const path = require('path')
const { Job } = require('../models/Job')

const DATA_DIR = path.resolve(process.env.SIVA_DATA_DIR || path.join(__dirname, '..', '..', '.data'))
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json')

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readAll() {
  ensureDataDir()
  if (!fs.existsSync(JOBS_FILE)) return []

  try {
    const raw = fs.readFileSync(JOBS_FILE, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch (error) {
    throw new Error('Job store is unreadable: ' + error.message)
  }
}

function atomicWrite(file, value) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, value, 'utf8')
  fs.renameSync(tmp, file)
}

function writeAll(jobs) {
  ensureDataDir()
  atomicWrite(JOBS_FILE, JSON.stringify(jobs, null, 2))
}

function save(job) {
  const jobs = readAll()
  const serialized = job?.toJSON ? job.toJSON() : job
  const index = jobs.findIndex(item => item.id === serialized.id)

  if (index === -1) jobs.push(serialized)
  else jobs[index] = serialized

  writeAll(jobs)
  return serialized
}

function findById(id) {
  return readAll().find(item => item.id === id) || null
}

function findAll() {
  return readAll()
}

function executionDue(job, preparationWindowMs, now = Date.now()) {
  if (job.request?.executionMode !== 'SCHEDULED' || !job.scheduledAt) return true
  const target = new Date(job.scheduledAt).getTime()
  if (Number.isNaN(target)) return false
  return now >= target - preparationWindowMs
}

function transactionalState(state) {
  return ['SUBMIT', 'VERIFY_TRANSACTION', 'VERIFY_BOOKING', 'SUCCESS'].includes(state)
}

function claimNextAvailable({
  executionTarget = 'LOCAL',
  workerId,
  accountReference = null,
  leaseMs = 60000,
  preparationWindowMs = 60000,
} = {}) {
  if (!workerId) throw new Error('workerId is required')

  const jobs = readAll()
  const now = Date.now()
  const lease = Math.max(10000, Number(leaseMs) || 60000)

  for (const raw of jobs) {
    if (String(raw.request?.executionTarget || '').toUpperCase() !== String(executionTarget).toUpperCase()) continue
    if (accountReference && String(raw.request?.credentialsReference || '') !== String(accountReference)) continue
    if (!executionDue(raw, preparationWindowMs, now)) continue

    if (raw.status === 'STARTING') {
      if (raw.claimedBy && raw.claimedBy !== workerId) {
        const stale = !raw.leaseExpiresAt || new Date(raw.leaseExpiresAt).getTime() <= now
        if (!stale) continue
        continue
      }

      const job = Job.fromJSON(raw)
      job.claim(workerId, lease)
      const serialized = job.toJSON()
      const index = jobs.findIndex(item => item.id === serialized.id)
      jobs[index] = serialized
      writeAll(jobs)
      return serialized
    }

    if (raw.status === 'RUNNING' && raw.claimedBy === workerId) {
      const expires = raw.leaseExpiresAt ? new Date(raw.leaseExpiresAt).getTime() : 0
      if (expires > now) continue
      if (transactionalState(raw.currentState)) continue

      const job = Job.fromJSON(raw)
      job.claim(workerId, lease)
      job.addLog('[WORKER] Reclaimed expired local execution lease on the same worker.')
      const serialized = job.toJSON()
      const index = jobs.findIndex(item => item.id === serialized.id)
      jobs[index] = serialized
      writeAll(jobs)
      return serialized
    }
  }

  return null
}

function authenticateClaim(jobId, workerId) {
  const job = findById(jobId)
  if (!job) return { ok: false, status: 404, error: 'Job not found' }
  if (job.request?.executionTarget !== 'LOCAL') return { ok: false, status: 409, error: 'Job is not assigned to the local execution plane' }
  if (job.claimedBy !== workerId) return { ok: false, status: 409, error: 'Worker does not own this job' }
  return { ok: true, job }
}

function heartbeat(jobId, workerId, leaseMs = 60000) {
  const auth = authenticateClaim(jobId, workerId)
  if (!auth.ok) return auth

  const jobs = readAll()
  const job = Job.fromJSON(auth.job)
  job.heartbeat(Math.max(10000, Number(leaseMs) || 60000))
  const index = jobs.findIndex(item => item.id === job.id)
  jobs[index] = job.toJSON()
  writeAll(jobs)
  return { ok: true, job: jobs[index] }
}

function appendWorkerEvent(jobId, workerId, event, leaseMs = 60000) {
  const auth = authenticateClaim(jobId, workerId)
  if (!auth.ok) return auth

  const jobs = readAll()
  const job = Job.fromJSON(auth.job)
  const safeEvent = event && typeof event === 'object' ? event : { type: 'LOG', message: String(event || '') }

  if (safeEvent.type === 'STATE_CHANGED' && safeEvent.state) {
    job.transition(safeEvent.state, safeEvent.message)
  } else {
    job._addEvent({
      type: safeEvent.type || 'LOG',
      state: safeEvent.state || job.currentState,
      message: safeEvent.message || '',
      metadata: safeEvent.metadata || null,
      pnr: safeEvent.pnr || null,
    })
  }

  job.heartbeat(Math.max(10000, Number(leaseMs) || 60000))
  const index = jobs.findIndex(item => item.id === job.id)
  jobs[index] = job.toJSON()
  writeAll(jobs)
  return { ok: true, job: jobs[index] }
}

function completeFromWorker(jobId, workerId, success, result, errorMessage) {
  const auth = authenticateClaim(jobId, workerId)
  if (!auth.ok) return auth

  const jobs = readAll()
  const job = Job.fromJSON(auth.job)

  if (success && result?.pnr) {
    job.complete(result.pnr, result)
  } else {
    job.fail(errorMessage || result?.error || 'Local worker execution failed.')
  }

  const index = jobs.findIndex(item => item.id === job.id)
  jobs[index] = job.toJSON()
  writeAll(jobs)
  return { ok: true, job: jobs[index] }
}

module.exports = {
  save,
  findById,
  findAll,
  claimNextAvailable,
  heartbeat,
  appendWorkerEvent,
  completeFromWorker,
  JOBS_FILE,
}
