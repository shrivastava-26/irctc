const test = require('node:test')
const assert = require('node:assert/strict')
const { STATES, classifyState } = require('../../src/engine/BookingStateMachine')
const { shouldRetry, backoffMs } = require('../../src/engine/RetryPolicy')
const BookingRequest = require('../../src/models/BookingRequest')
const { orderedTrainNumbers, pickFirstSatisfied } = require('../../src/engine/irctc/selection')
const { normalizeSurface, detectRuntimeSurfaceFromUrl, detectPreSearchSurfaceFromUrl, parseTravelDate, normalizeAvailability, availabilitySatisfies, parsePnr } = require('../../src/engine/irctc/utils')

test('surface model supports Auto, New, Legacy and runtime handoff', () => {
  assert.equal(normalizeSurface(undefined), 'AUTO')
  assert.equal(normalizeSurface('new'), 'NEW')
  assert.equal(normalizeSurface('LEGACY'), 'LEGACY')
  assert.equal(detectRuntimeSurfaceFromUrl('https://www.irctc.co.in/eticket/booking/train-list'), 'NEW')
  assert.equal(detectRuntimeSurfaceFromUrl('https://www.irctc.co.in/nget/booking/train-list'), 'LEGACY')
  assert.equal(detectPreSearchSurfaceFromUrl('https://www.irctc.co.in/eticket/train-search'), 'NEW')
  assert.equal(detectPreSearchSurfaceFromUrl('https://www.irctc.co.in/nget/train-search'), 'LEGACY')
  assert.equal(detectPreSearchSurfaceFromUrl('https://www.irctc.co.in/eticket/'), 'UNKNOWN')
})

test('travel date validation is exact and calendar-safe', () => {
  assert.equal(parseTravelDate('26/11/2026').iso, '2026-11-26')
  assert.throws(() => parseTravelDate('26/11/202x'), /DD\/MM\/YYYY/)
  assert.throws(() => parseTravelDate('31/02/2026'), /valid calendar date/)
})

test('availability is scoped by the selected class result', () => {
  const available = normalizeAvailability('Sleeper (SL) AVAILABLE-0059')
  const rac = normalizeAvailability('Sleeper (SL) RAC 4')
  const wl = normalizeAvailability('Sleeper (SL) WL 12')
  const regret = normalizeAvailability('Sleeper (SL) REGRET')
  const apr = normalizeAvailability('Booking not allowed as the Date given is outside Advance Reservation Period')
  assert.equal(available.status, 'AVAILABLE')
  assert.equal(rac.status, 'RAC')
  assert.equal(wl.status, 'WL')
  assert.equal(regret.status, 'NOT_AVAILABLE')
  assert.equal(apr.status, 'NOT_AVAILABLE')
  assert.equal(availabilitySatisfies(available, 'AVAILABLE'), true)
  assert.equal(availabilitySatisfies(rac, 'AVAILABLE'), false)
  assert.equal(availabilitySatisfies(wl, 'ANY'), true)
})

test('deterministic train ordering honors fixed, preferred, backup and first-valid rules', () => {
  const available = [{ trainNumber: '12295' }, { trainNumber: '22366' }]
  assert.deepEqual(orderedTrainNumbers({ trainSelectionPolicy: 'FIXED', trainNumber: '22366' }, available), ['22366'])
  assert.deepEqual(orderedTrainNumbers({ trainSelectionPolicy: 'FIRST_VALID', preferredTrains: ['12295'], backupTrains: ['22366'] }, available), ['12295','22366'])
  assert.deepEqual(orderedTrainNumbers({ trainSelectionPolicy: 'FIRST_VALID' }, available), ['12295','22366'])
  const selected = pickFirstSatisfied([
    { trainNumber:'12295', availability:{status:'WL'} },
    { trainNumber:'22366', availability:{status:'AVAILABLE'} },
  ], 'AVAILABLE', availabilitySatisfies)
  assert.equal(selected.trainNumber, '22366')
  assert.equal(pickFirstSatisfied([{ trainNumber:'12295', availability:{status:'AVAILABLE'} }], 'WL', availabilitySatisfies), null)
})

test('strict PNR parser rejects unrelated ten-digit numbers', () => {
  assert.equal(parsePnr('Transaction ID: 100006349505530'), null)
  assert.equal(parsePnr('PNR No. : 8744060742 Train: 22162'), '8744060742')
})

test('transaction verification is not retryable', () => {
  assert.equal(classifyState('VERIFY_TRANSACTION'), 'TRANSACTIONAL')
  assert.equal(shouldRetry('TRANSACTIONAL', 'HTTP_503', 1), false)
  assert.equal(backoffMs('TRANSACTIONAL', 1), 0)
})

test('booking request supports Auto surface and FIRST_VALID without a train number', () => {
  const request = { credentialsReference:'account', entrySurface:'AUTO', source:'SMVB', destination:'PNBE', travelDate:'26/11/2026', coach:'SL', quota:'GENERAL', passengers:[{name:'Prince Raj',age:24,gender:'Male'}], trainSelectionPolicy:'FIRST_VALID' }
  assert.deepEqual(BookingRequest.validate(request), [])
  const normalized = BookingRequest.normalize(request)
  assert.equal(normalized.entrySurface, 'AUTO')
  assert.equal(normalized.trainSelectionPolicy, 'FIRST_VALID')
  assert.equal(normalized.trainNumber, null)
})
test('entry route detection is URL-first and independent of exact ARIA names', async () => {
  const { IRCTCAdapter } = require('../../src/engine/irctc/IRCTCAdapter')

  const makePage = url => ({
    url: () => url,
    locator: () => ({
      innerText: async () => '',
      isVisible: async () => false,
      first() { return this },
    }),
    getByRole: () => ({
      isVisible: async () => false,
      first() { return this },
    }),
  })

  const legacy = new IRCTCAdapter({ page: makePage('https://www.irctc.co.in/nget/train-search'), context: {}, request: {}, credentials: {} })
  assert.equal(await legacy.detectPreSearchSurface(), 'LEGACY')

  const modern = new IRCTCAdapter({ page: makePage('https://www.irctc.co.in/eticket/train-search'), context: {}, request: {}, credentials: {} })
  assert.equal(await modern.detectPreSearchSurface({ timeoutMs: 50 }), 'NEW')
})

test('access-denied pages are classified separately from missing-form pages', async () => {
  const { IRCTCAdapter } = require('../../src/engine/irctc/IRCTCAdapter')
  const page = {
    url: () => 'https://www.irctc.co.in/nget/train-search',
    locator: () => ({
      innerText: async () => "Access Denied You don't have permission to access this server Reference #18.123",
    }),
  }
  const adapter = new IRCTCAdapter({ page, context: {}, request: {}, credentials: {} })
  const problem = await adapter.detectEntryAccessProblem()
  assert.equal(problem.blocked, true)
})

