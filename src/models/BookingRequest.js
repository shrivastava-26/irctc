// src/models/BookingRequest.js
// Validates and normalizes an incoming booking request payload.

const VALID_QUOTAS = ['GENERAL', 'TATKAL', 'PREMIUM_TATKAL']
const VALID_EXECUTION_MODES = ['NOW', 'SCHEDULED']
const VALID_PAYMENT_METHODS = ['UPI']
const VALID_GENDERS = ['Male', 'Female', 'Transgender']

function validate(data) {
  const errors = []

  if (!data.credentialsReference) errors.push('credentialsReference is required')
  if (!data.source) errors.push('source (station code) is required')
  if (!data.destination) errors.push('destination (station code) is required')
  if (!data.travelDate) errors.push('travelDate is required (format: DD/MM/YYYY)')
  if (!data.trainNumber) errors.push('trainNumber is required')
  if (!data.coach) errors.push('coach is required (e.g. 3A, SL)')
  if (!data.passengers || !Array.isArray(data.passengers) || data.passengers.length === 0) {
    errors.push('passengers array with at least one entry is required')
  }

  if (data.quota && !VALID_QUOTAS.includes(data.quota)) {
    errors.push(`quota must be one of: ${VALID_QUOTAS.join(', ')}`)
  }
  if (data.executionMode && !VALID_EXECUTION_MODES.includes(data.executionMode)) {
    errors.push(`executionMode must be one of: ${VALID_EXECUTION_MODES.join(', ')}`)
  }
  if (data.executionMode === 'SCHEDULED' && !data.scheduledAt) {
    errors.push('scheduledAt (ISO 8601 datetime) is required for SCHEDULED execution mode')
  }
  if (data.paymentPreference) {
    if (!VALID_PAYMENT_METHODS.includes(data.paymentPreference.method)) {
      errors.push(`paymentPreference.method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`)
    }
    if (data.paymentPreference.method === 'UPI' && !data.paymentPreference.upiId) {
      errors.push('paymentPreference.upiId is required for UPI payment')
    }
  }

  if (Array.isArray(data.passengers)) {
    data.passengers.forEach((p, i) => {
      if (!p.name) errors.push(`passengers[${i}].name is required`)
      if (p.age === undefined || p.age === null) errors.push(`passengers[${i}].age is required`)
      if (!p.gender) errors.push(`passengers[${i}].gender is required`)
      if (p.gender && !VALID_GENDERS.includes(p.gender)) {
        errors.push(`passengers[${i}].gender must be one of: ${VALID_GENDERS.join(', ')}`)
      }
    })
  }

  return errors
}

function normalize(data) {
  return {
    credentialsReference: data.credentialsReference,
    source: data.source,
    destination: data.destination,
    travelDate: data.travelDate,
    quota: data.quota || 'GENERAL',
    trainNumber: String(data.trainNumber),
    coach: data.coach,
    boardingStation: data.boardingStation || null,
    passengers: (data.passengers || []).map(p => ({
      name: p.name,
      age: Number(p.age),
      gender: p.gender,
      berth: p.berth || 'No Preference',
      food: p.food || 'No Food',
    })),
    paymentPreference: data.paymentPreference || { method: 'UPI', upiId: '' },
    executionMode: data.executionMode || 'NOW',
    scheduledAt: data.scheduledAt || null,
    isMock: Boolean(data.isMock),
    browser: data.browser || 'edge',
  }
}

module.exports = { validate, normalize }
