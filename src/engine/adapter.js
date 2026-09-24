// src/engine/adapter.js
// Launches Cypress with booking request env vars.
// Captures Cypress exit code and copies artifacts into artifacts/jobs/<jobId>/.

const { spawn, execFile } = require('child_process')
const path = require('path')
const fs = require('fs')

const CYPRESS_ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'artifacts')

let cypressReadyPromise = null

function execCypress(args, cwd, env) {
  return new Promise((resolve) => {
    execFile('npx', ['--no-install', 'cypress', ...args], {
      cwd,
      env,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout || '',
        stderr: stderr || '',
        error,
      })
    })
  })
}

async function ensureCypressBinary(cwd, env, onEvent) {
  if (cypressReadyPromise) return cypressReadyPromise

  cypressReadyPromise = (async () => {
    const verify = await execCypress(['verify'], cwd, env)

    if (verify.ok) return

    if (onEvent) {
      onEvent({
        type: 'LOG',
        message: 'Cypress binary not ready at runtime — installing the matching binary...',
      })
    }

    const install = await new Promise((resolve) => {
      execFile('npx', ['cypress', 'install'], {
        cwd,
        env,
        windowsHide: true,
      }, (error, stdout, stderr) => {
        resolve({ ok: !error, stdout: stdout || '', stderr: stderr || '' })
      })
    })

    if (!install.ok) {
      throw new Error(
        'Cypress binary installation failed: ' +
        (install.stderr || 'unknown installer error').trim()
      )
    }

    const finalVerify = await execCypress(['verify'], cwd, env)
    if (!finalVerify.ok) {
      throw new Error(
        'Cypress binary verification failed: ' +
        (finalVerify.stderr || finalVerify.stdout || 'unknown verification error').trim()
      )
    }
  })().catch((error) => {
    cypressReadyPromise = null
    throw error
  })

  return cypressReadyPromise
}

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
    const browser = process.env.CYPRESS_BROWSER || req.browser || 'edge'

    await ensureCypressBinary(cwd, env, onEvent)

    // WRITE THE FIXTURE DIRECTLY
    const legacyConfig = {
      TRAIN_NO: req.trainNumber,
      TRAIN_COACH: req.coach,
      TRAVEL_DATE: req.travelDate,
      SOURCE_STATION: req.source,
      DESTINATION_STATION: req.destination,
      BOARDING_STATION: req.boardingStation || null,
      TATKAL: req.quota === 'TATKAL',
      PREMIUM_TATKAL: req.quota === 'PREMIUM_TATKAL',
      UPI_ID_CONFIG: (req.paymentPreference && req.paymentPreference.upiId) || '',
      PASSENGER_DETAILS: req.passengers.map(p => ({
        NAME: p.name,
        AGE: p.age,
        GENDER: p.gender,
        SEAT: p.berth || 'No Preference',
        FOOD: p.food || 'No Food'
      }))
    };
    fs.writeFileSync(path.join(cwd, 'cypress', 'fixtures', 'passenger_data.json'), JSON.stringify(legacyConfig, null, 2));

    const env = {
      ...process.env,
      CYPRESS_USERNAME: credentials.username,
      CYPRESS_PASSWORD: credentials.password,
    }

    const childOptions = { cwd, env, shell: true }
    const args = [
      'cypress', 'run',
      '--browser', browser,
      '--spec', 'cypress/e2e/irctc.cy.js',
    ]

    if (process.env.CYPRESS_HEADED === 'true') {
      args.splice(2, 0, '--headed')
    }

    const child = spawn('npx', args, childOptions)

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      
      const cleanText = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
      cleanText.split('\n').filter(Boolean).forEach(line => {
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

      const cleanStderr = stderr ? stderr.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '') : ''
      const result = {
        jobId: job.id,
        success,
        exitCode: code,
        pnr,
        error: success ? null : (cleanStderr || 'Cypress test run failed'),
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
