const assert = require('node:assert/strict')
const test = require('node:test')
const { IRCTCAdapter } = require('../../src/engine/irctc/IRCTCAdapter')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

class FakeAdapter extends IRCTCAdapter {
  constructor(request, statuses) {
    super({
      page: {},
      context: {},
      request,
      credentials: {},
      jobId: 'parallel-selection-test-' + Date.now(),
      emit: () => {},
    })
    this.statuses = statuses
    this.candidates = Object.keys(statuses).map((trainNumber, index) => ({ trainNumber, index }))
    this.active = 0
    this.maxActive = 0
    this.mutatingActive = 0
    this.maxMutatingActive = 0
    this.readOnlyCalls = []
  }

  async bodyText() { return 'GENERAL' }

  trainContainers() {
    return { nth: index => this.candidates[index] }
  }

  async listCandidates() { return this.candidates }

  async inspectAvailability(candidate, { readOnly = false } = {}) {
    this.readOnlyCalls.push({ trainNumber: candidate.trainNumber, readOnly })
    this.active += 1
    if (!readOnly) {
      this.mutatingActive += 1
      this.maxMutatingActive = Math.max(this.maxMutatingActive, this.mutatingActive)
    }
    this.maxActive = Math.max(this.maxActive, this.active)
    await delay(8)
    this.active -= 1
    if (!readOnly) this.mutatingActive -= 1
    return {
      trainNumber: candidate.trainNumber,
      trainName: 'TEST',
      class: 'SL',
      availability: { status: this.statuses[candidate.trainNumber], raw: this.statuses[candidate.trainNumber] },
    }
  }
}

test('safe availability probes run concurrently but priority remains deterministic', async () => {
  const adapter = new FakeAdapter({
    credentialsReference: 'account',
    source: 'SMVB',
    destination: 'PNBE',
    coach: 'SL',
    quota: 'GENERAL',
    trainSelectionPolicy: 'FIRST_VALID',
    preferredTrains: ['11111', '22222', '33333'],
    availabilityRequirement: 'AVAILABLE',
  }, { '11111': 'AVAILABLE', '22222': 'AVAILABLE', '33333': 'AVAILABLE' })

  const selected = await adapter.selectTrain()
  assert.equal(selected.trainNumber, '11111')
  assert.ok(adapter.maxActive >= 2)
  assert.ok(adapter.readOnlyCalls.length >= 2)
  assert.ok(adapter.readOnlyCalls.every(call => call.readOnly === true))
})

test('an unknown higher-priority result is resolved before accepting a lower-priority match', async () => {
  const adapter = new FakeAdapter({
    credentialsReference: 'account',
    source: 'SMVB',
    destination: 'PNBE',
    coach: 'SL',
    quota: 'GENERAL',
    trainSelectionPolicy: 'FIRST_VALID',
    preferredTrains: ['11111', '22222'],
    availabilityRequirement: 'AVAILABLE',
  }, { '11111': 'UNKNOWN', '22222': 'AVAILABLE' })

  const selected = await adapter.selectTrain()
  assert.equal(selected.trainNumber, '22222')
  const fallback = adapter.readOnlyCalls.filter(call => call.trainNumber === '11111')
  assert.ok(fallback.some(call => call.readOnly === false))
})
test('mutating availability fallbacks never overlap on one page', async () => {
  const adapter = new FakeAdapter({
    credentialsReference: 'account',
    source: 'SMVB',
    destination: 'PNBE',
    coach: 'SL',
    quota: 'GENERAL',
    trainSelectionPolicy: 'FIRST_VALID',
    preferredTrains: ['11111', '22222'],
    availabilityRequirement: 'AVAILABLE',
  }, { '11111': 'UNKNOWN', '22222': 'UNKNOWN' })

  await assert.rejects(() => adapter.selectTrain(), /No train satisfied deterministic selection/)
  assert.equal(adapter.maxMutatingActive, 1)
})