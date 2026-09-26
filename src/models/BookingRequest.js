// Booking request validation and normalization for autonomous execution.

const VALID_QUOTAS = ['GENERAL', 'TATKAL', 'PREMIUM_TATKAL']
const VALID_EXECUTION_MODES = ['NOW', 'SCHEDULED']
const VALID_PAYMENT_METHODS = ['UPI', 'EWALLET']
const VALID_GENDERS = ['Male', 'Female', 'Transgender']
const VALID_AVAILABILITY = ['AVAILABLE', 'RAC', 'WL', 'ANY']
const VALID_TRAIN_SELECTION = ['FIXED', 'FIRST_VALID']

function validate(data) {
  const errors = []

  if (!data.credentialsReference) errors.push('credentialsReference is required')
  if (!data.source) errors.push('source station code is required')
  if (!data.destination) errors.push('destination station code is required')
  if (!data.travelDate) errors.push('travelDate is required (DD/MM/YYYY)')
  if (!data.coach) errors.push('coach/class is required (for example SL)')
  if (
    !Array.isArray(data.passengers) ||
    data.passengers.length === 0
  ) {
    errors.push('passengers must contain at least one passenger')
  }

  const hasTrainSelection =
    data.trainNumber ||
    (Array.isArray(data.preferredTrains) && data.preferredTrains.length > 0) ||
    (Array.isArray(data.backupTrains) && data.backupTrains.length > 0)
  const selectionPolicy = data.trainSelectionPolicy || 'FIRST_VALID'

  if (!VALID_TRAIN_SELECTION.includes(selectionPolicy)) {
    errors.push('trainSelectionPolicy must be one of: ' + VALID_TRAIN_SELECTION.join(', '))
  }

  if (!hasTrainSelection && selectionPolicy === 'FIXED') {
    errors.push('trainNumber or preferredTrains/backupTrains is required when trainSelectionPolicy is FIXED')
  }

  if (data.quota && !VALID_QUOTAS.includes(data.quota)) {
    errors.push('quota must be one of: ' + VALID_QUOTAS.join(', '))
  }

  if (data.executionMode && !VALID_EXECUTION_MODES.includes(data.executionMode)) {
    errors.push(
      'executionMode must be one of: ' + VALID_EXECUTION_MODES.join(', '),
    )
  }

  if (data.executionMode === 'SCHEDULED' && !data.scheduledAt) {
    errors.push('scheduledAt is required for SCHEDULED executionMode')
  }

  if (data.paymentPreference) {
    if (!VALID_PAYMENT_METHODS.includes(data.paymentPreference.method)) {
      errors.push(
        'paymentPreference.method must be one of: ' +
          VALID_PAYMENT_METHODS.join(', '),
      )
    }
    if (
      data.paymentPreference.method === 'UPI' &&
      !data.paymentPreference.upiId
    ) {
      errors.push('paymentPreference.upiId is required for UPI payment')
    }
  }

  if (
    data.availabilityRequirement &&
    !VALID_AVAILABILITY.includes(data.availabilityRequirement)
  ) {
    errors.push(
      'availabilityRequirement must be one of: ' +
        VALID_AVAILABILITY.join(', '),
    )
  }

  if (Array.isArray(data.passengers)) {
    data.passengers.forEach((passenger, index) => {
      if (!passenger.name) {
        errors.push('passengers[' + index + '].name is required')
      }
      if (passenger.age == null) {
        errors.push('passengers[' + index + '].age is required')
      }
      if (!passenger.gender) {
        errors.push('passengers[' + index + '].gender is required')
      }
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

function normalize(data) {
  return {
    credentialsReference: data.credentialsReference,
    source: String(data.source).toUpperCase(),
    destination: String(data.destination).toUpperCase(),
    travelDate: data.travelDate,
    quota: data.quota || 'GENERAL',
    trainNumber: data.trainNumber ? String(data.trainNumber) : null,
    preferredTrains: Array.isArray(data.preferredTrains)
      ? data.preferredTrains.map(String)
      : [],
    backupTrains: Array.isArray(data.backupTrains)
      ? data.backupTrains.map(String)
      : [],
    trainSelectionPolicy: data.trainSelectionPolicy || 'FIRST_VALID',
    coach: String(data.coach).toUpperCase(),
    boardingStation: data.boardingStation
      ? String(data.boardingStation).toUpperCase()
      : null,
    passengers: (data.passengers || []).map((passenger) => ({
      name: passenger.name,
      age: Number(passenger.age),
      gender: passenger.gender,
      berth: passenger.berth || 'No Preference',
      food: passenger.food || 'No Food',
    })),
    availabilityRequirement: data.availabilityRequirement || 'AVAILABLE',
    paymentPreference:
      data.paymentPreference || { method: 'UPI', upiId: '' },
    executionMode: data.executionMode || 'NOW',
    scheduledAt: data.scheduledAt || null,
    isMock: Boolean(data.isMock),
    browser: data.browser || 'edge',
    fastMode: data.fastMode !== false,
    debugMode: Boolean(data.debugMode),
  }
}

module.exports = { validate, normalize }
