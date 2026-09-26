const fs = require('fs')
const path = require('path')
const { Job } = require('../src/models/Job')
const { validate, normalize } = require('../src/models/BookingRequest')
const JobStore = require('../src/persistence/JobStore')
const Scheduler = require('../src/scheduler/Scheduler')

function readRequest() {
  if (process.env.BOOKING_REQUEST_JSON) {
    return JSON.parse(process.env.BOOKING_REQUEST_JSON)
  }

  const file = process.env.BOOKING_REQUEST_FILE ||
    path.join(process.cwd(), 'booking-request.json')

  if (!fs.existsSync(file)) {
    throw new Error('Missing booking request file: ' + file)
  }

  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

async function main() {
  const raw = readRequest()
  const errors = validate(raw)
  if (errors.length) throw new Error(errors.join('; '))

  const request = normalize(raw)
  const job = new Job(request)
  JobStore.save(job)

  console.log('[AUTO-BOOK] Created job ' + job.id)
  console.log('[AUTO-BOOK] Mode: ' + request.executionMode)
  console.log('[AUTO-BOOK] Entry surface: ' + request.entrySurface)

  await Scheduler.schedule(job)
}

main().catch(error => {
  console.error('[AUTO-BOOK] ' + error.message)
  process.exitCode = 1
})
