const assert = require('node:assert/strict')
const test = require('node:test')
const { ConcurrencyGovernor } = require('../../src/scheduler/ConcurrencyGovernor')
const { AccountMutex } = require('../../src/scheduler/AccountMutex')
const { JourneyWorkerPool } = require('../../src/scheduler/JourneyWorkerPool')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

test('concurrency governor never exceeds its configured parallelism', async () => {
  const governor = new ConcurrencyGovernor({ maxConcurrent: 2, resourceCheck: () => true })
  const releaseA = await governor.acquire('a')
  const releaseB = await governor.acquire('b')
  let acquiredC = false
  const third = governor.acquire('c').then(release => { acquiredC = true; return release })
  await delay(10)
  assert.equal(acquiredC, false)
  assert.equal(governor.stats().active, 2)
  releaseA()
  const releaseC = await third
  assert.equal(acquiredC, true)
  assert.equal(governor.stats().active, 2)
  releaseB()
  releaseC()
  assert.equal(governor.stats().active, 0)
})

test('account mutex serializes jobs using the same credential reference', async () => {
  const mutex = new AccountMutex()
  const releaseA = await mutex.acquire('account')
  let secondAcquired = false
  const second = mutex.acquire('account').then(release => { secondAcquired = true; return release })
  await delay(10)
  assert.equal(secondAcquired, false)
  releaseA()
  const releaseB = await second
  assert.equal(secondAcquired, true)
  releaseB()
  assert.equal(mutex.stats().accounts, 0)
})

test('worker pool can run different accounts concurrently while serializing one account', async () => {
  const pool = new JourneyWorkerPool({
    governor: new ConcurrencyGovernor({ maxConcurrent: 2, resourceCheck: () => true }),
    accountMutex: new AccountMutex(),
  })
  const a = { id: 'a', request: { credentialsReference: 'one' } }
  const b = { id: 'b', request: { credentialsReference: 'two' } }
  const a2 = { id: 'a2', request: { credentialsReference: 'one' } }
  const releaseA = await pool.acquire(a)
  const releaseB = await pool.acquire(b)
  let a2Acquired = false
  const waitA2 = pool.acquire(a2).then(release => { a2Acquired = true; return release })
  await delay(10)
  assert.equal(a2Acquired, false)
  assert.equal(pool.stats().concurrency.active, 2)
  releaseA()
  const releaseA2 = await waitA2
  assert.equal(a2Acquired, true)
  releaseB()
  releaseA2()
  assert.equal(pool.stats().concurrency.active, 0)
})