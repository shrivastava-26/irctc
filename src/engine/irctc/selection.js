function selectedTrainEntries(request) {
  if (!Array.isArray(request.selectedTrains)) return null

  return request.selectedTrains
    .filter(entry => entry && entry.selected !== false)
    .slice()
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0))
}

function orderedTrainNumbers(request, available) {
  const explicit = selectedTrainEntries(request)
  if (explicit) return explicit.map(entry => String(entry.trainNumber).trim())

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

function trainPriority(request, trainNumber) {
  const explicit = selectedTrainEntries(request)
  if (!explicit) return null
  const entry = explicit.find(item => String(item.trainNumber) === String(trainNumber))
  return entry ? Number(entry.priority) : null
}

function pickFirstSatisfied(candidates, requirement, availabilitySatisfies) {
  for (const candidate of candidates) {
    if (availabilitySatisfies(candidate.availability, requirement)) return candidate
  }
  return null
}

module.exports = {
  selectedTrainEntries,
  orderedTrainNumbers,
  trainPriority,
  pickFirstSatisfied,
}
