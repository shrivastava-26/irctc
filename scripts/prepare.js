const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function fail(message) {
  console.error('[PREPARE-BOOKING] ' + message)
  process.exitCode = 1
}

function parseRequest() {
  const raw = process.env.BOOKING_REQUEST_JSON
  if (raw) return JSON.parse(raw)

  const file = process.env.BOOKING_REQUEST_FILE ||
    path.join(process.cwd(), 'booking-request.json')
  if (!fs.existsSync(file)) {
    throw new Error(
      'No booking request found. Set BOOKING_REQUEST_JSON or create booking-request.json.',
    )
  }

  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function main() {
  let request

  try {
    request = parseRequest()
    const { validate, normalize } = require('../src/models/BookingRequest')
    const errors = validate(request)

    if (errors.length) {
      throw new Error(errors.join('; '))
    }

    const normalized = normalize(request)
    console.log('[PREPARE-BOOKING] Route:', normalized.source, '->', normalized.destination)
    console.log('[PREPARE-BOOKING] Date:', normalized.travelDate)
    console.log('[PREPARE-BOOKING] Class:', normalized.coach)
    console.log('[PREPARE-BOOKING] Quota:', normalized.quota)
    console.log('[PREPARE-BOOKING] Entry surface:', normalized.entrySurface)
    console.log('[PREPARE-BOOKING] Train policy:', normalized.trainSelectionPolicy)
    console.log('[PREPARE-BOOKING] Passengers:', normalized.passengers.length)
  } catch (error) {
    fail(error.message)
    return
  }

  const requirePlaywright = spawnSync(
    process.execPath,
    ['-e', "const {chromium}=require('playwright'); if(!chromium) process.exit(1)"],
    { stdio: 'inherit', cwd: process.cwd() },
  )

  if (requirePlaywright.status !== 0) {
    fail('Playwright package is unavailable.')
    return
  }

  if (String(process.env.PLAYWRIGHT_INSTALL || 'false').toLowerCase() === 'true') {
    const install = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['playwright', 'install', 'chromium'],
      { stdio: 'inherit', cwd: process.cwd() },
    )
    if (install.status !== 0) {
      fail('Playwright Chromium installation failed.')
      return
    }
  }

  console.log('[PREPARE-BOOKING] Playwright production runner ready.')
}

main()
