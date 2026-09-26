const KEYS = {
  accounts: 'irctc_mvp_accounts',
  journeys: 'irctc_mvp_journeys',
  selectedAccount: 'irctc_mvp_selected_account',
  jobs: 'irctc_mvp_jobs',
}

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(KEYS[key])
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  window.localStorage.setItem(KEYS[key], JSON.stringify(value))
}

function readLegacy(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function loadAccounts() {
  const current = read('accounts', null)
  if (Array.isArray(current)) return current
  const legacy = readLegacy('irctc_accounts', [])
  return Array.isArray(legacy) ? legacy : []
}

export function saveAccounts(accounts) {
  write('accounts', accounts)
}

export function loadJourneys() {
  const current = read('journeys', null)
  if (Array.isArray(current)) return current
  const legacy = readLegacy('irctc_journeys', [])
  return Array.isArray(legacy) ? legacy : []
}

export function saveJourneys(journeys) {
  write('journeys', journeys)
}

export function loadSelectedAccount() {
  return window.localStorage.getItem(KEYS.selectedAccount) || ''
}

export function saveSelectedAccount(id) {
  if (id) window.localStorage.setItem(KEYS.selectedAccount, id)
  else window.localStorage.removeItem(KEYS.selectedAccount)
}

export function loadJobs() {
  const jobs = read('jobs', [])
  return Array.isArray(jobs) ? jobs : []
}

export function saveJobs(jobs) {
  write('jobs', jobs)
}

export function buildJob(account, journey) {
  const method = String(journey.paymentPreference?.method || (journey.upiId ? 'UPI' : 'UPI')).toUpperCase()

  return {
    id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    status: 'READY',
    mode: 'LOCAL_MVP',
    accountId: account.id,
    username: account.username,
    journey: {
      source: journey.source,
      destination: journey.destination,
      trainNumber: journey.trainNumber || '',
      selectedTrains: Array.isArray(journey.selectedTrains) ? journey.selectedTrains : undefined,
      travelDate: journey.travelDate,
      coach: journey.coach,
      quota: journey.quota,
      boardingStation: journey.boardingStation || '',
      passengers: journey.passengers || [],
      useMasterPassenger: Boolean(journey.useMasterPassenger),
      paymentPreference: {
        method,
        upiId: method === 'UPI' ? (journey.paymentPreference?.upiId || journey.upiId || '') : '',
        ewallet: {
          transactionPasswordReference: journey.paymentPreference?.ewallet?.transactionPasswordReference || null,
        },
      },
      executionMode: journey.executionMode || 'NOW',
      scheduledAt: journey.scheduledAt || null,
    },
    logs: [{
      at: new Date().toISOString(),
      message: 'Job prepared locally. No backend or server runner was used.',
    }],
  }
}

export function exportBackup() {
  const data = {
    exportedAt: new Date().toISOString(),
    version: 1,
    accounts: loadAccounts(),
    journeys: loadJourneys(),
    jobs: loadJobs(),
    selectedAccountId: loadSelectedAccount(),
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'irctc-mvp-backup.json'
  anchor.click()
  URL.revokeObjectURL(url)
}
