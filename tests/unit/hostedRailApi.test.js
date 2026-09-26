const assert = require('node:assert/strict')
const test = require('node:test')
const { isoDate, normalizeQuota, normalizeGender, normalizeBerth, providerStatus } = require('../../src/engine/rail/HostedRailApi')

test('hosted rail API mappings', () => {
  assert.equal(isoDate('26/11/2026'), '2026-11-26')
  assert.equal(normalizeQuota('GENERAL'), 'GN')
  assert.equal(normalizeQuota('TATKAL'), 'TQ')
  assert.equal(normalizeGender('Male'), 'M')
  assert.equal(normalizeGender('Female'), 'F')
  assert.equal(normalizeBerth('No Preference'), '')
  assert.equal(normalizeBerth('LB'), 'LB')
})

test('provider status does not expose API token', () => {
  const prev = process.env.RAIL_API_TOKEN
  try {
    process.env.RAIL_API_TOKEN = 'secret'
    const status = providerStatus()
    assert.equal(status.configured, true)
    assert.equal(status.token, undefined)
    assert.equal(JSON.stringify(status).includes('secret'), false)
  } finally {
    if (prev == null) delete process.env.RAIL_API_TOKEN
    else process.env.RAIL_API_TOKEN = prev
  }
})
