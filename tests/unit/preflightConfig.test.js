const assert = require('node:assert/strict')
const test = require('node:test')

const { preflightHeadless } = require('../../src/engine/irctc/sessionManager')

test('IRCTC preflight defaults to headed and follows explicit headless override', () => {
  const previous = process.env.SIVA_PREFLIGHT_HEADLESS

  try {
    delete process.env.SIVA_PREFLIGHT_HEADLESS
    assert.equal(preflightHeadless(), false)

    process.env.SIVA_PREFLIGHT_HEADLESS = 'true'
    assert.equal(preflightHeadless(), true)

    process.env.SIVA_PREFLIGHT_HEADLESS = 'false'
    assert.equal(preflightHeadless(), false)
  } finally {
    if (previous == null) delete process.env.SIVA_PREFLIGHT_HEADLESS
    else process.env.SIVA_PREFLIGHT_HEADLESS = previous
  }
})
