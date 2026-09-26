// src/server/index.js
// Job Manager HTTP API. This module can also be required by render-start.js.

const express = require('express')
const path = require('path')
const cors = require('cors')
const { Job } = require('../models/Job')
const { validate, normalize } = require('../models/BookingRequest')
const JobStore = require('../persistence/JobStore')
const Scheduler = require('../scheduler/Scheduler')
const { authorizeWorker, configuredToken } = require('../security/WorkerAuth')

const app = express()
const PORT = process.env.PORT || 3001
const workerPresence = new Map()
const WORKER_PRESENCE_TTL_MS = Math.max(30000, Number(process.env.SIVA_WORKER_PRESENCE_TTL_MS) || 45000)

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
      executionTarget: req.executionTarget || 'LOCAL',
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

function workerAuth(req, res) {
  const auth = authorizeWorker(req)
  if (auth.ok) return true
  res.status(auth.status).json({ error: auth.error })
  return false
}

app.post('/jobs', (req, res) => {
  const errors = validate(req.body)

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors,
    })
  }

  if (String(req.body?.executionTarget || 'LOCAL').toUpperCase() !== 'LOCAL') {
    return res.status(409).json({ error: 'Hosted browser execution is disabled. RAILX browser jobs must run on the local execution worker.', code: 'LOCAL_EXECUTION_REQUIRED' })
  }

  const normalized = normalize(req.body)

  // Live IRCTC browser execution must stay on the user's local execution plane.
  // Render remains the control plane; hosted browser execution is blocked by default.
  if (!normalized.isMock && normalized.executionTarget === 'HOSTED' && String(process.env.SIVA_ALLOW_HOSTED_BOOKING || '').toLowerCase() !== 'true') {
    normalized.executionTarget = 'LOCAL'
  }

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

// Local execution worker API.
// Credentials are never accepted by these endpoints; the worker resolves them locally.
app.post('/worker/heartbeat', (req, res) => {
  if (!workerAuth(req, res)) return

  const { workerId, accountReference = null, concurrency = 1, activeJobs = 0 } = req.body || {}
  if (!workerId) return res.status(400).json({ error: 'workerId is required' })

  const now = Date.now()
  workerPresence.set(String(workerId), {
    workerId: String(workerId),
    accountReference: accountReference ? String(accountReference) : null,
    concurrency: Number(concurrency) || 1,
    activeJobs: Number(activeJobs) || 0,
    lastSeenAt: new Date(now).toISOString(),
  })

  res.json({ ok: true, serverTime: new Date(now).toISOString() })
})

app.post('/worker/claim', (req, res) => {
  if (!workerAuth(req, res)) return

  const { workerId, executionTarget = 'LOCAL', accountReference = null, leaseMs } = req.body || {}
  if (!workerId) return res.status(400).json({ error: 'workerId is required' })
  if (String(executionTarget).toUpperCase() !== 'LOCAL') {
    return res.status(400).json({ error: 'executionTarget must be LOCAL' })
  }

  try {
    const job = JobStore.claimNextAvailable({
      executionTarget: 'LOCAL',
      workerId: String(workerId),
      accountReference: accountReference ? String(accountReference) : null,
      leaseMs,
      preparationWindowMs: Number(process.env.BOOKING_PREPARATION_WINDOW_MS) || 60000,
    })

    if (!job) return res.status(204).end()
    return res.json({ job })
  } catch (error) {
    console.error('[WORKER] Claim error:', error.message)
    return res.status(500).json({ error: error.message })
  }
})

app.post('/worker/jobs/:id/heartbeat', (req, res) => {
  if (!workerAuth(req, res)) return

  const { workerId, leaseMs } = req.body || {}
  if (!workerId) return res.status(400).json({ error: 'workerId is required' })

  const result = JobStore.heartbeat(req.params.id, String(workerId), leaseMs)
  if (!result.ok) return res.status(result.status).json({ error: result.error })

  res.json({ job: result.job })
})

app.post('/worker/jobs/:id/events', (req, res) => {
  if (!workerAuth(req, res)) return

  const { workerId, event, leaseMs } = req.body || {}
  if (!workerId) return res.status(400).json({ error: 'workerId is required' })

  const result = JobStore.appendWorkerEvent(
    req.params.id,
    String(workerId),
    event,
    leaseMs,
  )
  if (!result.ok) return res.status(result.status).json({ error: result.error })

  res.status(201).json({ job: result.job })
})

app.post('/worker/jobs/:id/complete', (req, res) => {
  if (!workerAuth(req, res)) return

  const { workerId, success, result, error } = req.body || {}
  if (!workerId) return res.status(400).json({ error: 'workerId is required' })

  const completed = JobStore.completeFromWorker(
    req.params.id,
    String(workerId),
    Boolean(success),
    result || null,
    error || null,
  )
  if (!completed.ok) return res.status(completed.status).json({ error: completed.error })

  res.json({ job: completed.job })
})

app.get('/worker/status', (req, res) => {
  const now = Date.now()
  const workers = Array.from(workerPresence.values())
    .filter(worker => now - new Date(worker.lastSeenAt).getTime() <= WORKER_PRESENCE_TTL_MS)
    .map(worker => ({ ...worker, online: true }))

  res.json({
    configured: Boolean(configuredToken()),
    online: workers.length > 0,
    workers,
    timestamp: new Date(now).toISOString(),
  })
})

// Serve the production Vite build from the same origin as the API.
// This is required for the Render web service, which runs only the Node server.
const uiDistPath = path.join(__dirname, '../../ui/dist')

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
// HTML is intentionally never cached so an already-open mobile browser cannot
// keep an old Vite entrypoint after a Render deployment. Hashed Vite assets can
// remain immutable because their filenames change whenever their contents do.
app.use(express.static(uiDistPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
  },
}))
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/jobs') || req.path.startsWith('/credentials') || req.path.startsWith('/worker')) {
    return next()
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
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
