const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('fs')

const JobStore = require('../../src/persistence/JobStore')
const { Job } = require('../../src/models/Job')

function cleanup() {
  try { fs.rmSync('.data/jobs.json', { force: true }) } catch {}
}

test('local worker claims only LOCAL jobs and preserves account affinity', () => {
  cleanup()

  const localJob = new Job({
    executionTarget: 'LOCAL',
    credentialsReference: 'primary',
    scheduledAt: null,
  })
  const hostedJob = new Job({
    executionTarget: 'HOSTED',
    credentialsReference: 'primary',
    scheduledAt: null,
  })
  JobStore.save(localJob)
  JobStore.save(hostedJob)

  const claimed = JobStore.claimNextAvailable({
    executionTarget: 'LOCAL',
    workerId: 'worker-a',
    accountReference: 'primary',
    leaseMs: 60000,
  })

  assert.equal(claimed.id, localJob.id)
  assert.equal(JobStore.findById(hostedJob.id).status, 'STARTING')
  assert.equal(JobStore.findById(localJob.id).claimedBy, 'worker-a')
  cleanup()
})

test('local worker cannot steal an expired job owned by another worker', () => {
  cleanup()

  const job = new Job({
    executionTarget: 'LOCAL',
    credentialsReference: 'primary',
    scheduledAt: null,
  })
  JobStore.save(job)

  const first = JobStore.claimNextAvailable({
    executionTarget: 'LOCAL',
    workerId: 'worker-a',
    leaseMs: 1000,
  })
  assert.equal(first.id, job.id)

  const stale = JobStore.findById(job.id)
  stale.leaseExpiresAt = new Date(Date.now() - 1).toISOString()
  JobStore.save(stale)

  const second = JobStore.claimNextAvailable({
    executionTarget: 'LOCAL',
    workerId: 'worker-b',
    leaseMs: 1000,
  })
  assert.equal(second, null)
  cleanup()
})


test('local worker keeps account affinity when an account is pinned', () => {
  cleanup()

  const job = new Job({
    executionTarget: 'LOCAL',
    credentialsReference: 'primary',
    scheduledAt: null,
  })
  JobStore.save(job)

  const claimed = JobStore.claimNextAvailable({
    executionTarget: 'LOCAL',
    workerId: 'worker-a',
    accountReference: 'secondary',
    leaseMs: 1000,
  })

  assert.equal(claimed, null)
  assert.equal(JobStore.findById(job.id).status, 'STARTING')
  cleanup()
})
