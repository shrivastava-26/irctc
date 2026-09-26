const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function fail(message) {
  console.error('[PREPARE] ' + message)
  process.exitCode = 1
}

function parseRequest() {
  const env = process.env.BOOKING_REQUEST_JSON || process.env.CYPRESS_BOOKING_REQUEST
  if (env) return typeof env === 'string' ? JSON.parse(env) : env

  const file = process.env.BOOKING_REQUEST_FILE || path.join(process.cwd(), 'booking-request.json')
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))

  throw new Error(
    'No booking request found. Set BOOKING_REQUEST_JSON/CYPRESS_BOOKING_REQUEST or create booking-request.json.',
  )
}

function main() {
  let request
  try {
    request = parseRequest()
  } catch (error) {
    fail(error.message)
    return
  }

  const required = ['source', 'destination', 'travelDate', 'coach']
  const missing = required.filter((key) => !request[key])
  const hasTrain =
    request.trainNumber ||
    (Array.isArray(request.preferredTrains) && request.preferredTrains.length) ||
    (Array.isArray(request.backupTrains) && request.backupTrains.length)
  const firstValid = (request.trainSelectionPolicy || 'FIRST_VALID') === 'FIRST_VALID'

  if (missing.length || (!hasTrain && !firstValid) || !Array.isArray(request.passengers) || !request.passengers.length) {
    fail('Booking request is incomplete: source, destination, travelDate, coach, train selection and passengers are required.')
    return
  }

  const verify = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--no-install', 'cypress', 'verify'],
    { stdio: 'inherit', cwd: process.cwd() },
  )

  if (verify.status !== 0) {
    fail('Cypress binary verification failed.')
    return
  }

  console.log('[PREPARE] Cypress ready.')
  console.log('[PREPARE] Route:', request.source, '->', request.destination)
  console.log('[PREPARE] Date:', request.travelDate)
  console.log('[PREPARE] Class:', request.coach)
  console.log('[PREPARE] Quota:', request.quota || 'GENERAL')
  console.log('[PREPARE] Passengers:', request.passengers.length)
  console.log('[PREPARE] FAST_MODE:', process.env.FAST_MODE || 'true')
  console.log('[PREPARE] DEBUG_MODE:', process.env.DEBUG_MODE || 'false')
  console.log('[PREPARE] Ready for npm run book / npm run auto-book.')
}

main()
