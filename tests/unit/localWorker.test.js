const assert = require('node:assert/strict')
const test = require('node:test')

const { normalize, validate } = require('../../src/models/BookingRequest')
const { constantTimeMatch } = require('../../src/security/WorkerAuth')

test('booking requests accept explicit LOCAL execution target', () => {
  const base = {
    credentialsReference: 'account',
    source: 'SMVB',
    destination: 'PNBE',
    travelDate: '26/11/2026',
    coach: 'SL',
    passengers: [{ name: 'Test User', age: 30, gender: 'Male' }],
  }

  assert.deepEqual(validate({ ...base, executionTarget: 'LOCAL' }), [])
  assert.equal(normalize({ ...base, executionTarget: 'LOCAL' }).executionTarget, 'LOCAL')
  assert.match(
    validate({ ...base, executionTarget: 'REMOTE' }).join(' '),
    /executionTarget must be one of/,
  )
})

test('worker token comparison requires a non-empty exact match', () => {
  assert.equal(constantTimeMatch('secret-token', 'secret-token'), true)
  assert.equal(constantTimeMatch('secret-token', 'other-token'), false)
  assert.equal(constantTimeMatch('', ''), false)
  assert.equal(constantTimeMatch('short', 'longer'), false)
})
