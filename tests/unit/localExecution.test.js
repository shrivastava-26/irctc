const assert = require('node:assert/strict')
const test = require('node:test')

const BookingRequest = require('../../src/models/BookingRequest')
const sessionManager = require('../../src/engine/irctc/sessionManager')

test('new booking defaults to API execution and auto browser selection remains available for LOCAL jobs', () => {
  const request = BookingRequest.normalize({
    credentialsReference: 'primary',
    source: 'BTH',
    destination: 'PNBE',
    travelDate: '01/10/2026',
    coach: 'SL',
    passengers: [{ name: 'Test User', age: 30, gender: 'Male' }],
  })

  assert.equal(request.executionTarget, 'API')
  assert.equal(request.browser, 'auto')
})

test('explicit LOCAL execution remains local', () => {
  const request = BookingRequest.normalize({
    credentialsReference: 'primary',
    executionTarget: 'LOCAL',
    source: 'BTH',
    destination: 'PNBE',
    travelDate: '01/10/2026',
    coach: 'SL',
    passengers: [{ name: 'Test User', age: 30, gender: 'Male' }],
  })

  assert.equal(request.executionTarget, 'LOCAL')
})

test('browser auto resolution prefers installed branded browsers before bundled Chromium', () => {
  assert.deepEqual(
    sessionManager.resolveBrowserCandidates('auto'),
    ['chrome', 'edge', 'chromium'],
  )
})
