const fs = require('fs')
const path = require('path')

function parseJsonFile(file) {
  const resolved = path.resolve(file)
  const raw = fs.readFileSync(resolved, 'utf8')
  return JSON.parse(raw)
}

function normalizeRecord(reference, value) {
  if (!value) return null
  if (Array.isArray(value) && value.length >= 2) {
    return { username: String(value[0]), password: String(value[1]) }
  }
  if (typeof value === 'object' && value.username && value.password) {
    return { username: String(value.username), password: String(value.password) }
  }
  throw new Error('Invalid local worker credential record for ' + reference)
}

function loadMap() {
  const file = process.env.SIVA_WORKER_CREDENTIALS_FILE
  if (file) return parseJsonFile(file)

  const raw = process.env.SIVA_WORKER_CREDENTIALS_JSON
  if (raw) return JSON.parse(raw)

  return null
}

async function getLocalWorkerCredentials(reference) {
  const key = String(reference || '').trim()
  if (!key) throw new Error('Job has no credentialsReference')

  const map = loadMap()
  if (map) {
    const record = normalizeRecord(key, map[key])
    if (!record) throw new Error('No local worker credentials configured for account ' + key)
    return record
  }

  const username = process.env.IRCTC_USERNAME
  const password = process.env.IRCTC_PASSWORD
  if (!username || !password) {
    throw new Error(
      'Local worker credentials are missing. Set SIVA_WORKER_CREDENTIALS_FILE, ' +
      'SIVA_WORKER_CREDENTIALS_JSON, or IRCTC_USERNAME + IRCTC_PASSWORD.'
    )
  }

  const account = String(process.env.SIVA_WORKER_ACCOUNT || '').trim()
  if (account && account !== key) {
    throw new Error(
      'Local worker is pinned to account ' + account +
      ' and cannot execute account ' + key
    )
  }

  return { username: String(username), password: String(password) }
}

function localWorkerAccount() {
  return String(process.env.SIVA_WORKER_ACCOUNT || '').trim() || null
}

module.exports = {
  getLocalWorkerCredentials,
  localWorkerAccount,
}
