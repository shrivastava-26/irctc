function orderedTrainNumbers(request, available) {
  const preferred = Array.isArray(request.preferredTrains) ? request.preferredTrains.map(String) : []
  const backups = Array.isArray(request.backupTrains) ? request.backupTrains.map(String) : []

  if (request.trainSelectionPolicy === 'FIXED') return request.trainNumber ? [String(request.trainNumber)] : []
  if (request.trainNumber) {
    const fixed = String(request.trainNumber)
    return [fixed, ...preferred.filter(x => x !== fixed), ...backups.filter(x => x !== fixed)]
  }
  if (preferred.length || backups.length) return [...preferred, ...backups]
  return available.map(item => String(item.trainNumber))
}

function pickFirstSatisfied(candidates, requirement, availabilitySatisfies) {
  for (const candidate of candidates) {
    if (availabilitySatisfies(candidate.availability, requirement)) return candidate
  }
  return null
}

module.exports = { orderedTrainNumbers, pickFirstSatisfied }