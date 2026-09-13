// src/scheduler/Scheduler.js
// Executes a job immediately or at a future scheduledAt time.
// Calls the engine adapter and updates the job on each state transition.

const CredentialManager = require('../security/CredentialManager')
const { runCypress, runMock } = require('../engine/adapter')
const JobStore = require('../persistence/JobStore')

/**
 * Schedule and execute a job.
 * @param {Job} job
 */
async function schedule(job) {
  const delayMs = computeDelay(job.scheduledAt)

  if (delayMs > 0) {
    const openAt = new Date(Date.now() + delayMs).toISOString()
    job.addLog(`Job scheduled to run at ${openAt} (${Math.round(delayMs / 1000)}s from now).`)
    JobStore.save(job)
    await sleep(delayMs)
  }

  await execute(job)
}

async function execute(job) {
  job.markRunning()
  JobStore.save(job)

  try {
    if (job.request.isMock) {
      await runMock(job, (event) => onEngineEvent(job, event))
      job.complete(null)
    } else {
      const credentials = await CredentialManager.getCredentials(job.request.credentialsReference)
      const result = await runCypress(job, credentials, (event) => onEngineEvent(job, event))

      if (result.success) {
        job.complete(result.pnr)
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
  const now = Date.now()
  return Math.max(0, target - now)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

module.exports = { schedule }
