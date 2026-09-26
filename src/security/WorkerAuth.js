const crypto = require('crypto')

function configuredToken() {
  return String(process.env.SIVA_WORKER_TOKEN || '')
}

function constantTimeMatch(supplied, expected) {
  const a = Buffer.from(String(supplied || ''))
  const b = Buffer.from(String(expected || ''))
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b)
}

function authorizeWorker(req) {
  const expected = configuredToken()
  if (!expected) return { ok: false, status: 503, error: 'Local worker authentication is not configured.' }

  const supplied = req.get('x-worker-token') || ''
  if (!constantTimeMatch(supplied, expected)) {
    return { ok: false, status: 401, error: 'Invalid local worker token.' }
  }

  return { ok: true }
}

module.exports = { configuredToken, constantTimeMatch, authorizeWorker }
