const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const requestFile =
  process.env.BOOKING_REQUEST_FILE || path.join(process.cwd(), 'booking-request.json')

function readRequest() {
  if (process.env.BOOKING_REQUEST_JSON) {
    return JSON.parse(process.env.BOOKING_REQUEST_JSON)
  }
  if (!fs.existsSync(requestFile)) {
    throw new Error('Missing booking request file: ' + requestFile)
  }
  return JSON.parse(fs.readFileSync(requestFile, 'utf8'))
}

function run() {
  const request = readRequest()

  if (!request.executionMode || request.executionMode === 'NOW') {
    return runCypress(request)
  }

  if (request.executionMode === 'SCHEDULED') {
    const target = new Date(request.scheduledAt)
    if (Number.isNaN(target.getTime())) {
      throw new Error('scheduledAt must be a valid ISO 8601 datetime')
    }

    const delay = Math.max(0, target.getTime() - Date.now())
    console.log('[AUTO-BOOK] Scheduled for ' + target.toISOString())

    setTimeout(() => {
      runCypress(request)
    }, delay)
    return
  }

  throw new Error('Unsupported executionMode: ' + request.executionMode)
}

function runCypress(request) {
  const env = {
    ...process.env,
    CYPRESS_BOOKING_REQUEST: JSON.stringify(request),
    CYPRESS_FAST_MODE:
      process.env.FAST_MODE || (request.fastMode === false ? 'false' : 'true'),
    CYPRESS_DEBUG_MODE:
      process.env.DEBUG_MODE || (request.debugMode ? 'true' : 'false'),
  }

  const browser = process.env.CYPRESS_BROWSER || request.browser || 'edge'
  const args = [
    'cypress',
    'run',
    '--headed',
    '--browser',
    browser,
    '--spec',
    'cypress/e2e/autonomous-booking.cy.js',
  ]

  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  })

  child.on('close', (code) => {
    process.exitCode = code === null ? 1 : code
  })
}

try {
  run()
} catch (error) {
  console.error('[AUTO-BOOK] ' + error.message)
  process.exitCode = 1
}
