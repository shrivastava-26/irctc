// Hosted credential manager.
// Render is a Linux web service, so Windows keytar/Secret Service is not used.
// Credentials are held only in this process. Use a managed secrets store for
// durable production multi-account storage.

const sessionCredentials = new Map()

function normalizeAccountName(accountName) {
  return String(accountName || '').trim()
}

async function getCredentials(accountName) {
  const envUser = process.env.IRCTC_USERNAME
  const envPass = process.env.IRCTC_PASSWORD

  if (envUser && envPass) {
    const stored = sessionCredentials.get(normalizeAccountName(accountName))
    return {
      username: envUser,
      password: envPass,
      ewalletTransactionPassword: stored?.ewalletTransactionPassword || null,
    }
  }

  const key = normalizeAccountName(accountName)
  const stored = sessionCredentials.get(key)

  if (!stored) {
    throw new Error(
      'No credentials available for this account in the current server session. ' +
      'Save the account again after a server restart.'
    )
  }

  return Object.assign({}, stored)
}

async function setCredentials(accountName, password) {
  const key = normalizeAccountName(accountName)

  if (!key || !password) {
    throw new Error('accountName and password are required')
  }

  sessionCredentials.set(key, {
    username: key,
    password: String(password),
  })
}

async function setEwalletTransactionPassword(accountName, transactionPassword) {
  const key = normalizeAccountName(accountName)
  if (!key || !transactionPassword) {
    throw new Error('accountName and transactionPassword are required')
  }

  const previous = sessionCredentials.get(key) || {}
  sessionCredentials.set(key, {
    ...previous,
    username: previous.username || key,
    ewalletTransactionPassword: String(transactionPassword),
  })
}

async function listCredentialReferences() {
  return Array.from(sessionCredentials.keys())
}

module.exports = {
  getCredentials,
  setCredentials,
  setEwalletTransactionPassword,
  listCredentialReferences,
}
