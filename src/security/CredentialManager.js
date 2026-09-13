// src/security/CredentialManager.js
// Retrieves credentials from Windows Credential Manager via keytar.
// Falls back to process.env when running in CI or when keytar is unavailable.

let keytar
try {
  keytar = require('keytar')
} catch {
  keytar = null
}

const SERVICE_NAME = 'irctc-automation'

async function getCredentials(accountName) {
  // Check environment variables first (CI / Docker override)
  const envUser = process.env.IRCTC_USERNAME
  const envPass = process.env.IRCTC_PASSWORD
  if (envUser && envPass) {
    return { username: envUser, password: envPass }
  }

  if (!keytar) {
    throw new Error(
      `keytar not available and no IRCTC_USERNAME/IRCTC_PASSWORD env vars set. ` +
      `Cannot retrieve credentials for account "${accountName}".`
    )
  }

  // Retrieve from Windows Credential Manager
  // Stored under service=irctc-automation, account=<credentialsReference>
  const password = await keytar.getPassword(SERVICE_NAME, accountName)
  if (!password) {
    throw new Error(
      `No credentials found in Windows Credential Manager for service="${SERVICE_NAME}" account="${accountName}". ` +
      `Set them with: keytar.setPassword("${SERVICE_NAME}", "${accountName}", "<password>")`
    )
  }

  return { username: accountName, password }
}

async function setCredentials(accountName, password) {
  if (!keytar) throw new Error('keytar not available')
  await keytar.setPassword(SERVICE_NAME, accountName, password)
}

module.exports = { getCredentials, setCredentials }
