const crypto = require('crypto')

const DEFAULT_BASE_URL = 'https://api.zuelpay.com'
const DEFAULT_SEARCH_PATH = '/v2/train/search'
const DEFAULT_BOOK_PATH = '/v2/train/book'

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error('Hosted rail API is not configured: missing ' + name + '.')
  return value
}

function config() {
  return {
    provider: String(process.env.RAIL_API_PROVIDER || 'zuelpay').trim().toLowerCase(),
    baseUrl: String(process.env.RAIL_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    token: requiredEnv('RAIL_API_TOKEN'),
    timeoutMs: Math.max(5000, Number(process.env.RAIL_API_TIMEOUT_MS) || 30000),
    searchPath: String(process.env.RAIL_API_SEARCH_PATH || DEFAULT_SEARCH_PATH),
    bookPath: String(process.env.RAIL_API_BOOK_PATH || DEFAULT_BOOK_PATH),
  }
}

function isoDate(value) {
  const m = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) throw new Error('travelDate must use DD/MM/YYYY')
  return m[3] + '-' + m[2] + '-' + m[1]
}

function normalizeQuota(value) {
  return { GENERAL: 'GN', TATKAL: 'TQ', PREMIUM_TATKAL: 'PT' }[String(value || 'GENERAL').toUpperCase()] || String(value || 'GN').toUpperCase()
}

function normalizeGender(value) {
  return { Male: 'M', Female: 'F', Transgender: 'T' }[String(value || '')] || String(value || '').slice(0, 1).toUpperCase()
}

function normalizeBerth(value) {
  return String(value || '').toUpperCase() === 'NO PREFERENCE' ? '' : String(value || '')
}

async function postJson(url, body, token, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    let payload = null
    try { payload = await response.json() } catch {}
    if (!response.ok) {
      const error = new Error('Hosted rail API ' + response.status + ': ' + (payload?.message || payload?.error || ('HTTP ' + response.status)))
      error.status = response.status
      throw error
    }
    return payload
  } finally {
    clearTimeout(timer)
  }
}

function responseArray(payload) {
  if (Array.isArray(payload)) return payload
  for (const key of ['trains', 'results', 'items', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key]
    if (Array.isArray(payload?.data?.[key])) return payload.data[key]
  }
  return []
}

function trainNumberOf(item) {
  return String(item?.train_number || item?.trainNumber || item?.number || item?.trainNo || '').trim()
}

function extractPnr(payload) {
  const direct = payload?.pnr || payload?.PNR || payload?.pnr_number || payload?.data?.pnr || payload?.result?.pnr
  if (direct && /\d{10}/.test(String(direct))) return String(direct).match(/\d{10}/)[0]
  const match = JSON.stringify(payload || {}).match(/\b\d{10}\b/)
  return match ? match[0] : null
}

function selectTrain(request, trains) {
  const requested = [
    request.trainNumber,
    ...(Array.isArray(request.preferredTrains) ? request.preferredTrains : []),
    ...(Array.isArray(request.backupTrains) ? request.backupTrains : []),
  ].filter(Boolean).map(String)
  const indexed = new Map(trains.map(item => [trainNumberOf(item), item]))
  if (request.trainSelectionPolicy === 'FIXED' && requested.length) {
    const exact = indexed.get(requested[0])
    if (!exact) throw new Error('Hosted rail API did not return requested train ' + requested[0] + '.')
    return { number: requested[0], details: exact }
  }
  for (const n of requested) if (indexed.has(n)) return { number: n, details: indexed.get(n) }
  const first = trains.find(item => trainNumberOf(item))
  if (!first) throw new Error('Hosted rail API returned no selectable train.')
  return { number: trainNumberOf(first), details: first }
}

async function runHostedRailBooking(job, onEvent) {
  const request = job.request
  const emit = (state, message, metadata = null) => onEvent?.({ type: 'STATE_CHANGED', state, message, metadata })
  const c = config()

  emit('LOAD_CONFIG', 'Validating hosted rail API booking request.')
  if (!request.source || !request.destination || !request.travelDate || !request.coach || !Array.isArray(request.passengers) || !request.passengers.length) {
    throw new Error('Hosted rail API booking requires source, destination, date, class, and at least one passenger.')
  }

  emit('SEARCH', 'Searching trains through the hosted rail API.')
  const search = await postJson(c.baseUrl + c.searchPath, {
    from_station: request.source,
    to_station: request.destination,
    date: isoDate(request.travelDate),
    travel_class: request.coach,
    quota: normalizeQuota(request.quota),
  }, c.token, c.timeoutMs)
  const trains = responseArray(search)
  if (!trains.length) throw new Error('Hosted rail API returned no trains.')

  emit('SELECT_TRAIN', 'Selecting the requested train from hosted availability.')
  const selected = selectTrain(request, trains)

  emit('VERIFY_AVAILABILITY', 'Hosted rail API returned the selected train.', { trainNumber: selected.number })
  emit('SUBMIT', 'Submitting booking to the hosted rail API.', { trainNumber: selected.number })

  const booking = await postJson(c.baseUrl + c.bookPath, {
    train_number: String(selected.number),
    from_station: request.source,
    to_station: request.destination,
    date: isoDate(request.travelDate),
    class: request.coach,
    quota: normalizeQuota(request.quota),
    passengers: request.passengers.map(p => ({
      name: p.name,
      age: Number(p.age),
      gender: normalizeGender(p.gender),
      berth_pref: normalizeBerth(p.berth),
    })),
    ref_id: 'RAILX-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
  }, c.token, c.timeoutMs)

  const pnr = extractPnr(booking)
  if (!pnr) throw new Error('Hosted rail API returned no authoritative 10-digit PNR; no retry was attempted.')

  emit('VERIFY_TRANSACTION', 'Hosted rail API returned a booking response with a PNR.', { pnr })
  emit('SUCCESS', 'Booking completed through hosted rail API.', { pnr })

  return {
    success: true,
    state: 'SUCCESS',
    pnr,
    selectedTrain: selected.number,
    selectedTrainName: selected.details?.train_name || selected.details?.trainName || null,
    selectedClass: request.coach,
    selectedQuota: request.quota,
    provider: c.provider,
    ticketUrl: booking?.ticket_url || booking?.ticketUrl || booking?.data?.ticket_url || null,
  }
}

function providerStatus() {
  try {
    const c = config()
    return { configured: true, provider: c.provider, baseUrl: c.baseUrl }
  } catch (error) {
    return { configured: false, provider: String(process.env.RAIL_API_PROVIDER || 'zuelpay'), error: error.message }
  }
}

module.exports = { runHostedRailBooking, providerStatus, isoDate, normalizeQuota, normalizeGender, normalizeBerth }
