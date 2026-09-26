const SURFACES = Object.freeze({
  AUTO: 'AUTO',
  NEW: 'NEW',
  LEGACY: 'LEGACY',
  UNKNOWN: 'UNKNOWN',
})

const ENTRY_URLS = Object.freeze({
  NEW: 'https://www.irctc.co.in/eticket/',
  LEGACY: 'https://www.irctc.co.in/nget/train-search',
})

const CLASS_LABELS = Object.freeze({
  '1A': /First Class|AC First Class\s*\(1A\)|\b1A\b/i,
  '2A': /AC 2 Tier\s*\(2A\)|\b2A\b/i,
  '3A': /AC 3 Tier\s*\(3A\)|\b3A\b/i,
  '3E': /AC 3 Economy\s*\(3E\)|\b3E\b/i,
  CC: /AC Chair Car\s*\(CC\)|\bCC\b/i,
  SL: /Sleeper(?: \(SL\))?|\bSL\b/i,
  '2S': /Second Sitting\s*\(2S\)|\b2S\b/i,
  FC: /First Class\s*\(FC\)|\bFC\b/i,
})

function normalizeSurface(value) {
  const normalized = String(value || SURFACES.AUTO).trim().toUpperCase()
  return Object.values(SURFACES).includes(normalized) ? normalized : SURFACES.AUTO
}

function detectRuntimeSurfaceFromUrl(url) {
  const value = String(url || '')
  if (/\/nget\/(?:booking\/)?train-(?:list|search)(?:\/|$)/i.test(value)) return SURFACES.LEGACY
  if (/\/eticket\/(?:booking\/)?train-(?:list|search)(?:\/|$)/i.test(value)) return SURFACES.NEW
  return SURFACES.UNKNOWN
}

function entryUrl(surface) {
  return normalizeSurface(surface) === SURFACES.LEGACY
    ? ENTRY_URLS.LEGACY
    : ENTRY_URLS.NEW
}

function parseTravelDate(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) throw new Error('travelDate must use DD/MM/YYYY')

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('travelDate is not a valid calendar date: ' + raw)
  }

  return {
    raw,
    day,
    month,
    year,
    iso: [year, month, day].map((n, i) => i === 0 ? String(n).padStart(4, '0') : String(n).padStart(2, '0')).join('-'),
    monthName: date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
    displayNew: day + ' ' + date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + ' ' + year,
  }
}

function classPattern(classCode) {
  const code = String(classCode || '').toUpperCase()
  return CLASS_LABELS[code] || new RegExp('\\b' + escapeRegExp(code) + '\\b', 'i')
}

function className(classCode) {
  return {
    '1A': 'First Class',
    '2A': 'AC 2 Tier',
    '3A': 'AC 3 Tier',
    '3E': 'AC 3 Economy',
    CC: 'AC Chair Car',
    SL: 'Sleeper',
    '2S': 'Second Sitting',
    FC: 'First Class',
  }[String(classCode || '').toUpperCase()] || String(classCode || '')
}

function normalizeAvailability(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().toUpperCase()
  if (!text) return { status: 'UNKNOWN', raw: '' }
  if (/DATE .*OUTSIDE ADVANCE RESERVATION|BOOKING NOT ALLOWED|NOT AVAILABLE|REGRET|CLASS NOT AVAILABLE|QUOTA NOT AVAILABLE/.test(text)) {
    return { status: 'NOT_AVAILABLE', raw: text }
  }
  if (/\bRAC\b(?:[- :]*(\d+))?/.test(text)) return { status: 'RAC', raw: text }
  if (/\bWL\b(?:[- :]*(\d+))?/.test(text)) return { status: 'WL', raw: text }
  if (/\bAVAILABLE\b|\bAVBL\b|\bAVL\b|\bCNF\b/.test(text)) return { status: 'AVAILABLE', raw: text }
  return { status: 'UNKNOWN', raw: text }
}

function availabilitySatisfies(actual, requirement) {
  const required = String(requirement || 'AVAILABLE').toUpperCase()
  const status = typeof actual === 'string' ? normalizeAvailability(actual).status : (actual?.status || 'UNKNOWN')
  if (required === 'ANY') return ['AVAILABLE', 'RAC', 'WL'].includes(status)
  return status === required
}

function parseTrainNumber(text) {
  const match = String(text || '').match(/(?:^|\D)(\d{5})(?:\D|$)/)
  return match ? match[1] : null
}

function parsePnr(text) {
  const value = String(text || '').replace(/\s+/g, ' ')
  const labeled = value.match(/\bPNR\s*(?:NO\.?|NUMBER\.?)?\s*[:#-]?\s*(\d{10})\b/i)
  return labeled ? labeled[1] : null
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^$()|[\]\\]/g, '\\$&')
}
module.exports = {
  SURFACES,
  ENTRY_URLS,
  CLASS_LABELS,
  normalizeSurface,
  entryUrl,
  detectRuntimeSurfaceFromUrl,
  parseTravelDate,
  classPattern,
  className,
  normalizeAvailability,
  availabilitySatisfies,
  parseTrainNumber,
  parsePnr,
  escapeRegExp,
}
