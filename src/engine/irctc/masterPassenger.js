function normalizePassengerValue(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function passengerIdentityMatches(actual, requested) {
  if (!actual || !requested) return false

  return (
    normalizePassengerValue(actual.name) === normalizePassengerValue(requested.name) &&
    Number(actual.age) === Number(requested.age) &&
    normalizePassengerValue(actual.gender) === normalizePassengerValue(requested.gender)
  )
}

function findMasterPassenger(records, requested) {
  if (!Array.isArray(records)) return null
  return records.find(record => passengerIdentityMatches(record, requested)) || null
}

module.exports = {
  normalizePassengerValue,
  passengerIdentityMatches,
  findMasterPassenger,
}
