// src/engine/adapter.js
// Launches Cypress with booking request env vars.
// Captures Cypress exit code and copies artifacts into artifacts/jobs/<jobId>/.

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const CYPRESS_ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'artifacts')

function copyArtifacts(jobId, cypressRunDir) {
  const jobArtifactsDir = path.join(CYPRESS_ARTIFACTS_DIR, 'jobs', jobId)
  fs.mkdirSync(jobArtifactsDir, { recursive: true })

  // Copy screenshots and videos produced by this run if they exist
  const screenshotsDir = path.join(cypressRunDir, 'cypress', 'screenshots')
  const videosDir = path.join(cypressRunDir, 'cypress', 'videos')

  if (fs.existsSync(screenshotsDir)) {
    copyDir(screenshotsDir, path.join(jobArtifactsDir, 'screenshots'))
  }
  if (fs.existsSync(videosDir)) {
    copyDir(videosDir, path.join(jobArtifactsDir, 'video'))
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function writeResult(jobId, result) {
  const jobArtifactsDir = path.join(CYPRESS_ARTIFACTS_DIR, 'jobs', jobId)
  fs.mkdirSync(jobArtifactsDir, { recursive: true })
  fs.writeFileSync(
    path.join(jobArtifactsDir, 'result.json'),
    JSON.stringify(result, null, 2),
    'utf8'
  )
}

/**
 * Run a real Cypress booking job.
 * @param {Job} job
 * @param {object} credentials - { username, password }
 * @param {Function} onEvent - called with event objects as Cypress logs arrive
 * @returns {Promise<{success: boolean, pnr: string|null, error: string|null}>}
 */
function runCypress(job, credentials, onEvent) {
  return new Promise((resolve) => {
    const req = job.request
    const browser = req.browser || 'edge'
    const cwd = path.join(__dirname, '..', '..')

    // Pass the entire BookingRequest as BOOKING_REQUEST env var (JSON string).
    // Also pass credentials as USERNAME / PASSWORD for the Cypress spec.
    const env = {
      ...process.env,
      USERNAME: credentials.username,
      PASSWORD: credentials.password,
      BOOKING_REQUEST: JSON.stringify(req),
      JOB_ID: job.id,
      JOB_MANAGER_URL: process.env.JOB_MANAGER_URL || 'http://localhost:3001',
    }

    const args = [
      'cypress', 'run',
      '--browser', browser,
      '--headed',
      '--spec', 'cypress/e2e/irctc.cy.js',
    ]

    const child = spawn('npx', args, { cwd, env, shell: true })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      // Forward each line as a LOG event so the UI shows live output
      text.split('\n').filter(Boolean).forEach(line => {
        if (onEvent) onEvent({ type: 'LOG', state: job.currentState, message: line })
      })
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      const combinedOutput = stdout + '\n' + stderr

      // Try to extract PNR from Cypress output
      const pnrMatch = combinedOutput.match(/PNR[:\s]+([A-Z0-9]{10})/i)
      const pnr = pnrMatch ? pnrMatch[1] : null

      const success = code === 0

      // Copy artifacts produced by this Cypress run
      try {
        copyArtifacts(job.id, cwd)
      } catch {
        // Non-fatal — artifacts may not exist if Cypress crashed early
      }

      const result = {
        jobId: job.id,
        success,
        exitCode: code,
        pnr,
        error: success ? null : (stderr || 'Cypress test run failed'),
      }

      writeResult(job.id, result)

      resolve(result)
    })

    child.on('error', (err) => {
      resolve({
        jobId: job.id,
        success: false,
        exitCode: -1,
        pnr: null,
        error: err.message,
      })
    })
  })
}

/**
 * Run a mock booking job (no browser launched).
 * Simulates the full state machine with delays for UI testing.
 */
async function runMock(job, onEvent) {
  const req = job.request
  const states = [
    ['LOGIN', `Mock: Logging in as ${req.credentialsReference}...`, 1000],
    ['SEARCH', `Mock: Searching trains from ${req.source || 'N/A'}...`, 1000],
    ['TRAIN_FOUND', `Mock: train=${req.trainNumber} found.`, 1000],
    ['PAYMENT', 'Mock: Proceeding to UPI payment.', 1000],
    ['BOOKING_CONFIRMED', 'Mock: Payment successful. Ticket booked.', 1000],
  ]

  for (const [state, message, delay] of states) {
    await sleep(delay)
    if (onEvent) onEvent({ type: 'STATE_CHANGED', state, message })
  }

  return { success: true, pnr: 'MOCKPNR01', error: null }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

module.exports = { runCypress, runMock }
