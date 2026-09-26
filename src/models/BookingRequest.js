// Booking request validation and normalization for autonomous execution.

const VALID_QUOTAS = ['GENERAL', 'TATKAL', 'PREMIUM_TATKAL']
const VALID_EXECUTION_MODES = ['NOW', 'SCHEDULED']
const VALID_PAYMENT_METHODS = ['UPI', 'EWALLET']
const VALID_GENDERS = ['Male', 'Female', 'Transgender']
const VALID_AVAILABILITY = ['AVAILABLE', 'RAC', 'WL', 'ANY']
const VALID_TRAIN_SELECTION = ['FIXED', 'FIRST_VALID']
const VALID_ENTRY_SURFACES = ['AUTO', 'NEW', 'LEGACY']

function normalizeTrainNumber(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, '')
}

function trainNumberError(value, path) {
  const normalized = normalizeTrainNumber(value)
  if (!/^\d{5}$/.test(normalized)) {
    return path + ' must be exactly a 5-digit train number'
  }
  return null
}

function validateSelectedTrains(data, errors) {
  if (!Array.isArray(data.selectedTrains)) return false

  if (data.selectedTrains.length === 0) {
    errors.push('selectedTrains must contain at least one train in explicit train-selection mode')
    return true
  }

  const numbers = new Set()
  const priorities = new Set()
  let checkedCount = 0

  data.selectedTrains.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push('selectedTrains[' + index + '] must be an object')
      return
    }

    const number = normalizeTrainNumber(entry.trainNumber)
    const numberError = trainNumberError(entry.trainNumber, 'selectedTrains[' + index + '].trainNumber')
    if (numberError) errors.push(numberError)

    if (numbers.has(number)) {
      errors.push('selectedTrains contains duplicate train number: ' + number)
    }
    numbers.add(number)

    const priority = Number(entry.priority)
    if (!Number.isInteger(priority) || priority < 1) {
      errors.push('selectedTrains[' + index + '].priority must be a positive integer')
    } else if (priorities.has(priority)) {
      errors.push('selectedTrains priority values must be unique')
    } else {
      priorities.add(priority)
    }

    if (entry.selected !== false) checkedCount += 1
  })

  if (checkedCount === 0) {
    errors.push('At least one train must be selected in explicit train-selection mode')
  }

  return true
}

function validateLegacyTrainConfiguration(data, errors) {
  const legacyValues = [
    ['trainNumber', data.trainNumber],
    ...(Array.isArray(data.preferredTrains)
      ? data.preferredTrains.map((value, index) => ['preferredTrains[' + index + ']', value])
      : []),
    ...(Array.isArray(data.backupTrains)
      ? data.backupTrains.map((value, index) => ['backupTrains[' + index + ']', value])
      : []),
  ]

  for (const [path, value] of legacyValues) {
    if (value == null || String(value).trim() === '') continue
    const error = trainNumberError(value, path)
    if (error) errors.push(error)
  }
}

function validate(data) {
  const errors = []

  if (!data || typeof data !== 'object') {
    return ['booking request must be an object']
  }

  if (!data.credentialsReference) errors.push('credentialsReference is required')

  if (data.entrySurface && !VALID_ENTRY_SURFACES.includes(String(data.entrySurface).toUpperCase())) {
    errors.push('entrySurface must be one of: AUTO, NEW, LEGACY')
  }
  if (!data.source) errors.push('source station code is required')
  if (!data.destination) errors.push('destination station code is required')
  if (!data.travelDate) errors.push('travelDate is required (DD/MM/YYYY)')
  else if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(data.travelDate))) errors.push('travelDate must use DD/MM/YYYY')
  if (!data.coach) errors.push('coach/class is required (for example SL)')
  if (!Array.isArray(data.passengers) || data.passengers.length === 0) {
    errors.push('passengers must contain at least one passenger')
  }

  const hasExplicitSelection = validateSelectedTrains(data, errors)
  const hasLegacySelection =
    Boolean(data.trainNumber) ||
    (Array.isArray(data.preferredTrains) && data.preferredTrains.length > 0) ||
    (Array.isArray(data.backupTrains) && data.backupTrains.length > 0)

  if (!hasExplicitSelection) {
    validateLegacyTrainConfiguration(data, errors)
  }

  const selectionPolicy = String(data.trainSelectionPolicy || 'FIRST_VALID').toUpperCase()

  if (!VALID_TRAIN_SELECTION.includes(selectionPolicy)) {
    errors.push('trainSelectionPolicy must be one of: ' + VALID_TRAIN_SELECTION.join(', '))
  }

  if (!hasExplicitSelection && !hasLegacySelection && selectionPolicy === 'FIXED') {
    errors.push('trainNumber or preferredTrains/backupTrains is required when trainSelectionPolicy is FIXED')
  }

  if (data.quota && !VALID_QUOTAS.includes(String(data.quota).toUpperCase())) {
    errors.push('quota must be one of: ' + VALID_QUOTAS.join(', '))
  }

  if (data.executionMode && !VALID_EXECUTION_MODES.includes(data.executionMode)) {
    errors.push('executionMode must be one of: ' + VALID_EXECUTION_MODES.join(', '))
  }

  if (data.executionMode === 'SCHEDULED' && !data.scheduledAt) {
    errors.push('scheduledAt is required for SCHEDULED executionMode')
  }

  const payment = data.paymentPreference || null
  if (payment) {
    const method = String(payment.method || '').toUpperCase()
    if (!VALID_PAYMENT_METHODS.includes(method)) {
      errors.push('paymentPreference.method must be one of: ' + VALID_PAYMENT_METHODS.join(', '))
    }
    if (method === 'UPI' && !String(payment.upiId || '').trim()) {
      errors.push('paymentPreference.upiId is required for UPI payment')
    }
    if (method === 'EWALLET' && payment.ewallet?.transactionPasswordReference != null) {
      if (!String(payment.ewallet.transactionPasswordReference).trim()) {
        errors.push('paymentPreference.ewallet.transactionPasswordReference cannot be blank')
      }
    }
  }

  if (
    data.availabilityRequirement &&
    !VALID_AVAILABILITY.includes(String(data.availabilityRequirement).toUpperCase())
  ) {
    errors.push('availabilityRequirement must be one of: ' + VALID_AVAILABILITY.join(', '))
  }

  if (Array.isArray(data.passengers)) {
    data.passengers.forEach((passenger, index) => {
      if (!passenger.name) errors.push('passengers[' + index + '].name is required')
      if (passenger.age == null) errors.push('passengers[' + index + '].age is required')
      if (!passenger.gender) errors.push('passengers[' + index + '].gender is required')
      if (passenger.gender && !VALID_GENDERS.includes(passenger.gender)) {
        errors.push(
          'passengers[' + index + '].gender must be one of: ' +
            VALID_GENDERS.join(', '),
        )
      }
    })
  }

  return errors
}

function normalizeSelectedTrains(entries) {
  return entries
    .map((entry, index) => ({
      trainNumber: normalizeTrainNumber(entry?.trainNumber),
      trainName: entry?.trainName ? String(entry.trainName).trim() : null,
      priority: Number.isInteger(Number(entry?.priority)) && Number(entry.priority) > 0
        ? Number(entry.priority)
        : index + 1,
      selected: entry?.selected !== false,
    }))
    .sort((a, b) => a.priority - b.priority || a.trainNumber.localeCompare(b.trainNumber))
}

function normalize(data) {
  const selectionPolicy = String(data.trainSelectionPolicy || 'FIRST_VALID').toUpperCase()
  const hasExplicitSelection = Array.isArray(data.selectedTrains)

  const normalizedPayment = data.paymentPreference
    ? {
        method: String(data.paymentPreference.method || 'UPI').toUpperCase(),
        upiId: String(data.paymentPreference.upiId || '').trim(),
        ewallet: {
          transactionPasswordReference:
            data.paymentPreference.ewallet?.transactionPasswordReference
              ? String(data.paymentPreference.ewallet.transactionPasswordReference).trim()
              : null,
        },
      }
    : {
        method: 'UPI',
        upiId: '',
        ewallet: {
          transactionPasswordReference: null,
        },
      }

  const result = {
    credentialsReference: data.credentialsReference,
    entrySurface: String(data.entrySurface || 'AUTO').toUpperCase(),
    source: String(data.source).toUpperCase(),
    destination: String(data.destination).toUpperCase(),
    travelDate: data.travelDate,
    quota: String(data.quota || 'GENERAL').toUpperCase(),
    trainNumber: data.trainNumber ? normalizeTrainNumber(data.trainNumber) : null,
    preferredTrains: Array.isArray(data.preferredTrains)
      ? data.preferredTrains.map(normalizeTrainNumber).filter(Boolean)
      : [],
    backupTrains: Array.isArray(data.backupTrains)
      ? data.backupTrains.map(normalizeTrainNumber).filter(Boolean)
      : [],
    trainSelectionPolicy: selectionPolicy,
    coach: String(data.coach).toUpperCase(),
    boardingStation: data.boardingStation
      ? String(data.boardingStation).toUpperCase()
      : null,
    passengers: (data.passengers || []).map((passenger) => ({
      name: String(passenger.name).trim(),
      age: Number(passenger.age),
      gender: passenger.gender,
      berth: passenger.berth || 'No Preference',
      food: passenger.food || 'No Food',
    })),
    availabilityRequirement: String(data.availabilityRequirement || 'AVAILABLE').toUpperCase(),
    paymentPreference: normalizedPayment,
    useMasterPassenger: Boolean(data.useMasterPassenger),
    executionMode: data.executionMode || 'NOW',
    scheduledAt: data.scheduledAt || null,
    isMock: Boolean(data.isMock),
    browser: data.browser || 'edge',
    fastMode: data.fastMode !== false,
    debugMode: Boolean(data.debugMode),
  }

  if (hasExplicitSelection) {
    result.selectedTrains = normalizeSelectedTrains(data.selectedTrains)
  }

  return result
}

module.exports = { validate, normalize, normalizeTrainNumber }
