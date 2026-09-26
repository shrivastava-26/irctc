// src/scheduler/Scheduler.js
// Executes jobs immediately or at their scheduled time and can recover jobs
// that were persisted as STARTING/RUNNING when the server restarted.

const CredentialManager = require('../security/CredentialManager')
const { runCypress, runMock } = require('../engine/adapter')
const JobStore = require('../persistence/JobStore')
const { Job } = require('../models/Job')

let recovered = false

/**
 * Schedule and execute a job.
 * @param {Job} job
 */
async function schedule(job) {
  const delayMs = computeDelay(job.scheduledAt)

  if (delayMs > 0) {
    const openAt = new Date(Date.now() + delayMs).toISOString()
    job.addLog(
      'Job scheduled to run at ' +
        openAt +
        ' (' +
        Math.round(delayMs / 1000) +
        's from now).',
    )
    JobStore.save(job)
    await sleep(delayMs)
  }

  await execute(job)
}

async function execute(job) {
  // Prevent duplicate execution if another recovery/scheduler already owns it.
  const persisted = JobStore.findById(job.id)
  if (
    persisted &&
    persisted.status === 'COMPLETED'
  ) {
    return
  }

  job.markRunning()
  JobStore.save(job)

  try {
    if (job.request.isMock) {
      await runMock(job, (event) => onEngineEvent(job, event))
      job.complete(null)
    } else {
      const credentials = await CredentialManager.getCredentials(
        job.request.credentialsReference,
      )
      const result = await runCypress(job, credentials, (event) =>
        onEngineEvent(job, event),
      )

      if (result.success && result.pnr) {
        job.complete(result.pnr)
      } else if (result.success && !result.pnr) {
        job.fail(
          'Execution finished but no PNR was extracted. Booking not confirmed.',
        )
      } else {
        job.fail(result.error || 'Cypress test run failed')
      }
    }
  } catch (err) {
    job.fail(err.message)
  }

  JobStore.save(job)
}

function onEngineEvent(job, event) {
  if (event.type === 'STATE_CHANGED') {
    job.transition(event.state, event.message)
  } else if (event.type === 'LOG') {
    job.addLog(event.message)
  }
  JobStore.save(job)
}

function computeDelay(scheduledAt) {
  if (!scheduledAt) return 0
  const target = new Date(scheduledAt).getTime()
  if (Number.isNaN(target)) return 0
  const now = Date.now()
  return Math.max(0, target - now)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function recoverPendingJobs() {
  if (recovered) return
  recovered = true

  const pending = JobStore.findAll()
    .filter(
      (data) =>
        data.status === 'STARTING' ||
        data.status === 'RUNNING',
    )
    .map((data) => Job.fromJSON(data))

  for (const job of pending) {
    schedule(job).catch((error) => {
      try {
        job.fail('Recovery scheduler error: ' + error.message)
        JobStore.save(job)
      } catch {}
    })
  }
}

module.exports = { schedule, recoverPendingJobs }
