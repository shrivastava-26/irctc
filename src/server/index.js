// src/server/index.js
// Job Manager HTTP API — Express server on :3001
// Exposes REST endpoints for the React UI and for Cypress log forwarding.

const express = require('express')
const cors = require('cors')
const { Job } = require('../models/Job')
const { validate, normalize } = require('../models/BookingRequest')
const JobStore = require('../persistence/JobStore')
const Scheduler = require('../scheduler/Scheduler')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ---------------------------------------------------------------------------
// POST /jobs — Create and enqueue a new booking job
// ---------------------------------------------------------------------------
app.post('/jobs', (req, res) => {
  const errors = validate(req.body)
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors })
  }

  const normalized = normalize(req.body)
  const job = new Job(normalized)
  JobStore.save(job)

  // Run asynchronously — do not await so the HTTP response returns immediately
  Scheduler.schedule(job).catch(err => {
    console.error(`[JOB ${job.id}] Unhandled scheduler error:`, err.message)
  })

  res.status(201).json(job.toJSON())
})

// ---------------------------------------------------------------------------
// GET /jobs — List all jobs
// ---------------------------------------------------------------------------
app.get('/jobs', (req, res) => {
  res.json(JobStore.findAll())
})

// ---------------------------------------------------------------------------
// GET /jobs/:id — Get a single job
// ---------------------------------------------------------------------------
app.get('/jobs/:id', (req, res) => {
  const job = JobStore.findById(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  res.json(job)
})

// ---------------------------------------------------------------------------
// POST /jobs/:id/events — Cypress posts log events here during execution.
// This endpoint is called from cypress.config.js setupNodeEvents log task.
// ---------------------------------------------------------------------------
app.post('/jobs/:id/events', (req, res) => {
  const jobData = JobStore.findById(req.params.id)
  if (!jobData) return res.status(404).json({ error: 'Job not found' })

  // Reconstruct a plain object and append the event
  const event = req.body
  jobData.progressEvents = jobData.progressEvents || []
  jobData.progressEvents.push({
    ...event,
    timestamp: new Date().toISOString(),
  })

  // Update currentState if the event changes it
  if (event.type === 'STATE_CHANGED' && event.state) {
    jobData.currentState = event.state
  }

  JobStore.save(jobData)
  res.status(201).json({ ok: true })
})

// ---------------------------------------------------------------------------
// GET /credentials — List stored credential references (account names only)
// ---------------------------------------------------------------------------
app.get('/credentials', async (req, res) => {
  // We return only account names, never passwords
  const { getCredentials } = require('../security/CredentialManager')
  // Since we store by account name, we can only confirm if one exists
  res.json({ message: 'Use POST /credentials to store a new credential pair.' })
})

// ---------------------------------------------------------------------------
// POST /credentials — Store a credential pair in Windows Credential Manager
// ---------------------------------------------------------------------------
app.post('/credentials', async (req, res) => {
  const { accountName, password } = req.body
  if (!accountName || !password) {
    return res.status(400).json({ error: 'accountName and password are required' })
  }
  try {
    const { setCredentials } = require('../security/CredentialManager')
    await setCredentials(accountName, password)
    res.json({ ok: true, message: `Credentials stored for account "${accountName}"` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[Job Manager] Listening on http://localhost:${PORT}`)
})

module.exports = app
