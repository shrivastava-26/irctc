// src/server/index.js
// Job Manager HTTP API. This module can also be required by render-start.js.

const express = require('express')
const path = require('path')
const cors = require('cors')
const { Job } = require('../models/Job')
const { validate, normalize } = require('../models/BookingRequest')
const JobStore = require('../persistence/JobStore')
const Scheduler = require('../scheduler/Scheduler')
const { searchTrains } = require('./trainSearch')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '1mb' }))

// Keep the existing API paths compatible with both Vite dev proxy and the production SPA.
app.use((req, res, next) => {
  if (req.url === '/api' || req.url.startsWith('/api/')) req.url = req.url.slice(4) || '/'
  next()
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

function toPublicJob(job) {
  if (!job) return null
  const req = job.request || {}

  return {
    id: job.id,
    createdAt: job.createdAt,
    scheduledAt: job.scheduledAt,
    status: job.status,
    request: {
      source: req.source,
      destination: req.destination,
      travelDate: req.travelDate,
      quota: req.quota,
      entrySurface: req.entrySurface || 'AUTO',
      trainSelectionPolicy: req.trainSelectionPolicy || 'FIRST_VALID',
      trainNumber: req.trainNumber,
      coach: req.coach,
      boardingStation: req.boardingStation || null,
      executionMode: req.executionMode,
      scheduledAt: req.scheduledAt || null,
      isMock: Boolean(req.isMock),
      browser: req.browser || null,
      availabilityRequirement: req.availabilityRequirement || 'AVAILABLE',
      passengerCount: Array.isArray(req.passengers) ? req.passengers.length : 0,
      paymentMethod: req.paymentPreference && req.paymentPreference.method
        ? req.paymentPreference.method
        : null,
    },
    currentState: job.currentState,
    progressEvents: job.progressEvents || [],
    errorInformation: job.errorInformation,
    completedAt: job.completedAt,
  }
}

app.post('/jobs', (req, res) => {
  const errors = validate(req.body)

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors,
    })
  }

  const normalized = normalize(req.body)
  const job = new Job(normalized)
  JobStore.save(job)

  Scheduler.schedule(job).catch(err => {
    console.error('[JOB ' + job.id + '] Unhandled scheduler error:', err.message)
  })

  res.status(201).json(toPublicJob(job))
})

app.get('/jobs', (req, res) => {
  res.json(JobStore.findAll().map(toPublicJob))
})

app.get('/jobs/:id', (req, res) => {
  const job = JobStore.findById(req.params.id)

  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }

  res.json(toPublicJob(job))
})

app.post('/jobs/:id/events', (req, res) => {
  const jobData = JobStore.findById(req.params.id)

  if (!jobData) {
    return res.status(404).json({ error: 'Job not found' })
  }

  const event = req.body || {}
  jobData.progressEvents = jobData.progressEvents || []
  jobData.progressEvents.push(Object.assign({}, event, {
    timestamp: new Date().toISOString(),
  }))

  if (event.type === 'STATE_CHANGED' && event.state) {
    jobData.currentState = event.state
  }

  JobStore.save(jobData)
  res.status(201).json({ ok: true })
})

// Serve the production Vite build from the same origin as the API.
// This is required for the Render web service, which runs only the Node server.
const uiDistPath = path.join(__dirname, '../../ui/dist')

app.get('/trains', async (req, res) => {
  const { from, to, date, class: travelClass } = req.query
  if (!from || !to || !date) {
    return res.status(400).json({ error: 'from, to and date are required' })
  }

  try {
    const result = await searchTrains({ from, to, date, travelClass })
    res.json(result)
  } catch (error) {
    res.status(502).json({
      error: error.message || 'Train search unavailable',
      trains: [],
    })
  }
})

app.get('/credentials', async (req, res) => {
  const { listCredentialReferences } = require('../security/CredentialManager')
  res.json({ accounts: await listCredentialReferences() })
})

app.post('/credentials', async (req, res) => {
  const { accountName, password } = req.body || {}

  if (!accountName || !password) {
    return res.status(400).json({
      error: 'accountName and password are required',
    })
  }

  try {
    const { setCredentials } = require('../security/CredentialManager')
    await setCredentials(accountName, password)

    res.json({
      ok: true,
      message: 'Credentials stored for the active server session.',
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Static UI and SPA fallback must come after API routes.
app.use(express.static(uiDistPath))
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/jobs') || req.path.startsWith('/credentials')) {
    return next()
  }
  res.sendFile(path.join(uiDistPath, 'index.html'))
})

if (require.main === module || process.env.RUN_JOB_MANAGER !== 'false') {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('[Job Manager] Listening on http://0.0.0.0:' + PORT)
    Scheduler.recoverPendingJobs().catch((error) => {
      console.error('[Job Manager] Failed to recover pending jobs:', error.message)
    })
  })

  server.on('error', (error) => {
    console.error('[Job Manager] Server error:', error.message)
  })
}

module.exports = app
