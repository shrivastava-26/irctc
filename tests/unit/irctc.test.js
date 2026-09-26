const test = require('node:test')
const assert = require('node:assert/strict')
const { STATES, classifyState } = require('../../src/engine/BookingStateMachine')
const { shouldRetry, backoffMs } = require('../../src/engine/RetryPolicy')
const BookingRequest = require('../../src/models/BookingRequest')
const { orderedTrainNumbers, pickFirstSatisfied } = require('../../src/engine/irctc/selection')
const { normalizeSurface, detectRuntimeSurfaceFromUrl, parseTravelDate, normalizeAvailability, availabilitySatisfies, parsePnr } = require('../../src/engine/irctc/utils')

test('credential registration preserves the eWallet secret in the server session', async () => {
  const {
    setCredentials,
    setEwalletTransactionPassword,
    getCredentials,
  } = require('../../src/security/CredentialManager')

  await setEwalletTransactionPassword('wallet-test-user', 'SECRET-123')
  await setCredentials('wallet-test-user', 'LOGIN-456')

  const credentials = await getCredentials('wallet-test-user')
  assert.equal(credentials.username, 'wallet-test-user')
  assert.equal(credentials.password, 'LOGIN-456')
  assert.equal(credentials.ewalletTransactionPassword, 'SECRET-123')
})

test('production IRCTC adapters load without syntax errors', () => {
  assert.ok(require('../../src/engine/irctc/NewIRCTCAdapter'))
  assert.ok(require('../../src/engine/irctc/LegacyIRCTCAdapter'))
})

test('surface model supports Auto, New, Legacy and runtime handoff', () => {
  assert.equal(normalizeSurface(undefined), 'AUTO')
  assert.equal(normalizeSurface('new'), 'NEW')
  assert.equal(normalizeSurface('LEGACY'), 'LEGACY')
  assert.equal(detectRuntimeSurfaceFromUrl('https://www.irctc.co.in/eticket/booking/train-list'), 'NEW')
  assert.equal(detectRuntimeSurfaceFromUrl('https://www.irctc.co.in/nget/booking/train-list'), 'LEGACY')
  assert.equal(detectRuntimeSurfaceFromUrl('https://www.irctc.co.in/eticket/'), 'UNKNOWN')
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

const { selectedTrainEntries: explicitSelectedTrainEntries } = require('../../src/engine/irctc/selection')
const { normalizePassengerValue, passengerIdentityMatches, findMasterPassenger } = require('../../src/engine/irctc/masterPassenger')

test('explicit selected trains are validated, normalized by priority, and exclude unchecked candidates', () => {
  const request = {
    credentialsReference: 'account',
    source: 'SMVB',
    destination: 'PNBE',
    travelDate: '26/11/2026',
    coach: 'SL',
    quota: 'GENERAL',
    passengers: [{ name: 'Prince Raj', age: 24, gender: 'Male' }],
    selectedTrains: [
      { trainNumber: ' 12301 ', priority: 2, selected: true },
      { trainNumber: '12951', priority: 1, selected: true },
      { trainNumber: '12424', priority: 3, selected: false },
    ],
    trainSelectionPolicy: 'FIRST_VALID',
  }

  assert.deepEqual(BookingRequest.validate(request), [])
  const normalized = BookingRequest.normalize(request)
  assert.deepEqual(
    normalized.selectedTrains.map(item => [item.trainNumber, item.priority, item.selected]),
    [['12951', 1, true], ['12301', 2, true], ['12424', 3, false]],
  )
  assert.deepEqual(explicitSelectedTrainEntries(normalized).map(item => item.trainNumber), ['12951', '12301'])
  assert.deepEqual(orderedTrainNumbers(normalized, [{ trainNumber: '12424' }]), ['12951', '12301'])
})

test('single explicit train remains a hard constraint', () => {
  const request = {
    selectedTrains: [{ trainNumber: '12951', priority: 1, selected: true }],
    trainSelectionPolicy: 'FIRST_VALID',
  }
  assert.deepEqual(orderedTrainNumbers(request, [{ trainNumber: '12301' }]), ['12951'])
})

test('explicit selected trains reject malformed, duplicate, and all-unchecked values', () => {
  const malformed = {
    credentialsReference: 'account',
    source: 'SMVB',
    destination: 'PNBE',
    travelDate: '26/11/2026',
    coach: 'SL',
    passengers: [{ name: 'Prince Raj', age: 24, gender: 'Male' }],
    selectedTrains: [{ trainNumber: '1234', priority: 1, selected: true }],
  }
  assert.match(BookingRequest.validate(malformed).join(' '), /5-digit train number/)

  const duplicate = {
    ...malformed,
    selectedTrains: [
      { trainNumber: '12951', priority: 1, selected: false },
      { trainNumber: '12951', priority: 2, selected: false },
    ],
  }
  const duplicateErrors = BookingRequest.validate(duplicate).join(' ')
  assert.match(duplicateErrors, /duplicate train number/)
  assert.match(duplicateErrors, /At least one train must be selected/)
})

test('master passenger identity requires normalized name, age, and gender', () => {
  assert.equal(normalizePassengerValue('  Prince   Raj '), 'prince raj')
  assert.equal(
    passengerIdentityMatches(
      { name: 'Prince  Raj', age: '24', gender: 'Male' },
      { name: 'prince raj', age: 24, gender: 'male' },
    ),
    true,
  )
  assert.equal(
    passengerIdentityMatches(
      { name: 'Prince Raj', age: 25, gender: 'Male' },
      { name: 'Prince Raj', age: 24, gender: 'Male' },
    ),
    false,
  )
  assert.deepEqual(
    findMasterPassenger(
      [{ name: 'Prince Raj', age: 24, gender: 'Male' }],
      { name: 'Prince Raj', age: 24, gender: 'Male' },
    ),
    { name: 'Prince Raj', age: 24, gender: 'Male' },
  )
})

test('eWallet configuration stores only a reference, not a raw password', () => {
  const request = {
    credentialsReference: 'account',
    source: 'SMVB',
    destination: 'PNBE',
    travelDate: '26/11/2026',
    coach: 'SL',
    passengers: [{ name: 'Prince Raj', age: 24, gender: 'Male' }],
    selectedTrains: [{ trainNumber: '12951', priority: 1, selected: true }],
    paymentPreference: {
      method: 'EWALLET',
      ewallet: { transactionPasswordReference: 'session' },
      transactionPassword: 'DO_NOT_STORE',
    },
  }

  assert.deepEqual(BookingRequest.validate(request), [])
  const normalized = BookingRequest.normalize(request)
  assert.equal(normalized.paymentPreference.method, 'EWALLET')
  assert.equal(normalized.paymentPreference.ewallet.transactionPasswordReference, 'session')
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.paymentPreference, 'transactionPassword'), false)
})

test('availability selection still respects the configured requirement', () => {
  const candidate = {
    trainNumber: '12301',
    availability: { status: 'AVAILABLE', raw: 'AVAILABLE-0010' },
  }
  assert.equal(
    pickFirstSatisfied([candidate], 'AVAILABLE', availabilitySatisfies),
    candidate,
  )
})
