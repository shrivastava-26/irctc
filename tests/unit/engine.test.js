const test = require('node:test')
const assert = require('node:assert/strict')
const {
  STATES,
  nextState,
  assertTransition,
  classifyState,
} = require('../../src/engine/BookingStateMachine')
const { shouldRetry, backoffMs } = require('../../src/engine/RetryPolicy')

test('state graph is ordered and deterministic', () => {
  assert.equal(STATES[0], 'BOOT')
  assert.equal(nextState('BOOT'), 'LOAD_CONFIG')
  assert.equal(nextState('SUBMIT'), 'VERIFY_TRANSACTION')
  assert.equal(classifyState('SUBMIT'), 'TRANSACTIONAL')
  assert.equal(classifyState('SEARCH'), 'SAFE_RETRY')
})

test('invalid state transitions are rejected', () => {
  assert.throws(
    () => assertTransition('SEARCH', 'SUBMIT'),
    /Non-deterministic booking transition/,
  )
})

test('read retries are bounded', () => {
  assert.equal(shouldRetry('READ_ONLY', 'HTTP_503', 1), true)
  assert.equal(shouldRetry('READ_ONLY', 'HTTP_503', 3), false)
  assert.equal(shouldRetry('TRANSACTIONAL', 'HTTP_503', 1), false)
  assert.ok(backoffMs('READ_ONLY', 2) > backoffMs('READ_ONLY', 1))
  assert.equal(backoffMs('TRANSACTIONAL', 1), 0)
})
