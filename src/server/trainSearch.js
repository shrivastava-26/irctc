const DEFAULT_API_URL = 'https://indian-railway-api.onrender.com/api/trains'
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE = new Map()

function parseJourneyDate(raw) {
  const value = String(raw || '').trim()
  let day
  let month
  let year

  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (ddmmyyyy) {
    ;[, day, month, year] = ddmmyyyy
  } else if (iso) {
    ;[, year, month, day] = iso
  } else {
    throw new Error('date must use DD/MM/YYYY or YYYY-MM-DD')
  }

  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error('date is invalid')
  }
  return year + '-' + month + '-' + day
}

function normalizeStationCode(value, field) {
  const code = String(value || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{2,5}$/.test(code)) throw new Error(field + ' must be a valid station code')
  return code
}

function normalizeTrain(raw) {
  if (!raw) return null
  const trainNumber = String(raw.trainNumber || raw.number || '').trim()
  if (!/^\d{5}$/.test(trainNumber)) return null

  const availableClasses = Array.isArray(raw.availableClasses)
    ? raw.availableClasses.map(value => String(value).toUpperCase())
    : []

  return {
    trainNumber,
    trainName: String(raw.trainName || raw.name || 'Unknown Train').trim(),
    trainType: raw.trainType ? String(raw.trainType).trim() : null,
    fromStation: String(raw.fromStation || raw.source || '').toUpperCase(),
    toStation: String(raw.toStation || raw.destination || '').toUpperCase(),
    departureTime: raw.departureTime || null,
    arrivalTime: raw.arrivalTime || null,
    duration: raw.duration || null,
    availableClasses,
    runsOn: Array.isArray(raw.runsOn) ? raw.runsOn : [],
  }
}

async function searchTrains({ from, to, date, travelClass, fetchImpl = globalThis.fetch }) {
  const fromCode = normalizeStationCode(from, 'from')
  const toCode = normalizeStationCode(to, 'to')
  const isoDate = parseJourneyDate(date)
  const classCode = travelClass ? String(travelClass).trim().toUpperCase() : ''
  const key = [fromCode, toCode, isoDate, classCode].join('|')
  const cached = CACHE.get(key)

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { trains: cached.trains, cached: true }
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Train search provider is unavailable')
  }

  const baseUrl = process.env.TRAIN_SEARCH_API_URL || DEFAULT_API_URL
  const url = new URL(baseUrl)
  url.searchParams.set('from', fromCode)
  url.searchParams.set('to', toCode)
  url.searchParams.set('date', isoDate)

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.TRAIN_SEARCH_TIMEOUT_MS || 8000),
  )

  let response
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
  } catch (error) {
    throw new Error(
      error && error.name === 'AbortError'
        ? 'Train search timed out'
        : 'Train search provider unavailable',
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) throw new Error('Train search provider returned HTTP ' + response.status)

  const payload = await response.json()
  const rawTrains = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.trains)
      ? payload.trains
      : []

  const seen = new Set()
  const trains = rawTrains
    .map(normalizeTrain)
    .filter(Boolean)
    .filter(train => {
      if (seen.has(train.trainNumber)) return false
      seen.add(train.trainNumber)
      return (
        !classCode ||
        train.availableClasses.length === 0 ||
        train.availableClasses.includes(classCode)
      )
    })
    .sort((a, b) =>
      String(a.departureTime || '99:99').localeCompare(
        String(b.departureTime || '99:99'),
      ),
    )

  CACHE.set(key, { at: Date.now(), trains })
  return { trains, cached: false }
}

module.exports = {
  parseJourneyDate,
  normalizeStationCode,
  normalizeTrain,
  searchTrains,
}
