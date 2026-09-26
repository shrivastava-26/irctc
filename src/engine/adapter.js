// src/engine/adapter.js
// Launches Cypress with booking request env vars and captures its artifacts.

const { spawn, execFile } = require('child_process')
const path = require('path')
const fs = require('fs')

const CYPRESS_ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'artifacts')
let cypressReadyPromise = null

function execCypress(args, cwd, env) {
  return new Promise((resolve) => {
    execFile(
      'npx',
      ['--no-install', 'cypress', ...args],
      { cwd, env, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stdout || '',
          stderr: stderr || '',
        })
      },
    )
  })
}

async function ensureCypressBinary(cwd, env, onEvent) {
  if (cypressReadyPromise) return cypressReadyPromise

  cypressReadyPromise = (async () => {
    const verify = await execCypress(['verify'], cwd, env)
    if (verify.ok) return

    onEvent?.({
      type: 'LOG',
      message: 'Cypress binary missing at runtime; installing the matching binary...',
    })

    const install = await new Promise((resolve) => {
      execFile(
        'npx',
        ['cypress', 'install'],
        { cwd, env, windowsHide: true },
        (error, stdout, stderr) => {
          resolve({
            ok: !error,
            stdout: stdout || '',
            stderr: stderr || '',
          })
        },
      )
    })

    if (!install.ok) {
      throw new Error(
        'Cypress binary installation failed: ' +
        (install.stderr || 'unknown installer error').trim(),
      )
    }

    const finalVerify = await execCypress(['verify'], cwd, env)
    if (!finalVerify.ok) {
      throw new Error(
        'Cypress binary verification failed: ' +
        (finalVerify.stderr || finalVerify.stdout || 'unknown verification error').trim(),
      )
    }
  })().catch((error) => {
    cypressReadyPromise = null
    throw error
  })

  return cypressReadyPromise
}

function copyArtifacts(jobId, runDir) {
  const jobArtifactsDir = path.join(CYPRESS_ARTIFACTS_DIR, 'jobs', jobId)
  fs.mkdirSync(jobArtifactsDir, { recursive: true })

  const screenshotsDir = path.join(runDir, 'cypress', 'screenshots')
  const videosDir = path.join(runDir, 'cypress', 'videos')

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
    'utf8',
  )
}

function runCypress(job, credentials, onEvent) {
  return new Promise((resolve) => {
    const req = job.request
    const cwd = path.join(__dirname, '..', '..')

    const env = {
      ...process.env,
      CYPRESS_USERNAME: credentials.username,
      CYPRESS_PASSWORD: credentials.password,
      CYPRESS_IRCTC_USERNAME: credentials.username,
      CYPRESS_IRCTC_PASSWORD: credentials.password,
      CYPRESS_BOOKING_REQUEST: JSON.stringify(req),
      CYPRESS_JOB_ID: job.id,
      CYPRESS_FAST_MODE:
        req.fastMode === false ? 'false' : String(process.env.FAST_MODE || 'true'),
      CYPRESS_DEBUG_MODE:
        req.debugMode === true ? 'true' : String(process.env.DEBUG_MODE || 'false'),
    }

    const browser = env.CYPRESS_BROWSER || req.browser || 'edge'
    const headed =
      env.CYPRESS_HEADED == null
        ? true
        : String(env.CYPRESS_HEADED).toLowerCase() === 'true'

    ensureCypressBinary(cwd, env, onEvent)
      .then(() => {
        const args = [
          'cypress',
          'run',
          '--browser',
          browser,
          '--spec',
          'cypress/e2e/autonomous-booking.cy.js',
        ]

        if (headed) args.splice(2, 0, '--headed')

        const startedAt = Date.now()
        const child = spawn('npx', args, {
          cwd,
          env,
          shell: true,
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data) => {
          const chunk = data.toString()
          stdout += chunk

          const clean = chunk.replace(
            /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
            '',
          )

          clean
            .split('\n')
            .filter(Boolean)
            .forEach((line) => {
              onEvent?.({
                type: 'LOG',
                state: job.currentState,
                message: line,
              })
            })
        })

        child.stderr.on('data', (data) => {
          stderr += data.toString()
        })

        child.on('close', (code) => {
          let persisted = null
          try {
            persisted = require('./RunStateStore').load(job.id)
          } catch {
            // Best-effort state read after Cypress exits.
          }

          const combinedOutput = stdout + '\n' + stderr
          const pnrMatch = combinedOutput.match(
            /PNR\s*(?:NO|NUMBER)?\s*[:#-]?\s*(\d{10})/i,
          )
          const pnr =
            persisted?.metadata?.pnr ||
            persisted?.metadata?.result?.pnr ||
            (pnrMatch ? pnrMatch[1] : null)

          const success =
            code === 0 &&
            (Boolean(pnr) || persisted?.state === 'SUCCESS')

          const result = {
            jobId: job.id,
            success,
            exitCode: code,
            pnr: pnr || null,
            state: persisted?.state || job.currentState,
            elapsedMs: Date.now() - startedAt,
            telemetry: (() => {
              try {
                return require('./Telemetry').snapshot(job.id)
              } catch {
                return null
              }
            })(),
            error: success
              ? null
              : (persisted?.message ||
                stderr.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim() ||
                'Cypress automation did not reach a verified success state'),
          }

          try {
            copyArtifacts(job.id, cwd)
          } catch {}

          writeResult(job.id, result)
          resolve(result)
        })

        child.on('error', (err) => {
          resolve({
            jobId: job.id,
            success: false,
            exitCode: -1,
            pnr: null,
            state: job.currentState,
            error: err.message,
          })
        })
      })
      .catch((err) => {
        resolve({
          jobId: job.id,
          success: false,
          exitCode: -1,
          pnr: null,
          state: job.currentState,
          error: err.message,
        })
      })
  })
}

async function runMock(job, onEvent) {
  const req = job.request
  const states = [
    ['LOGIN', 'Mock: Logging in...', 1000],
    ['SEARCH', 'Mock: Searching trains...', 1000],
    ['TRAIN_FOUND', 'Mock: train found.', 1000],
    ['PAYMENT', 'Mock: Proceeding to UPI payment.', 1000],
    ['BOOKING_CONFIRMED', 'Mock: Payment successful. Ticket booked.', 1000],
  ]

  for (const [state, message, delay] of states) {
    await sleep(delay)
    onEvent?.({ type: 'STATE_CHANGED', state, message })
  }

  return { success: true, pnr: 'MOCKPNR01', error: null }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = { runCypress, runMock }
