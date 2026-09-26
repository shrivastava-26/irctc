const { defineConfig } = require('cypress')
const RunStateStore = require('./src/engine/RunStateStore')
const Telemetry = require('./src/engine/Telemetry')

module.exports = defineConfig({
  projectId: '7afdkj',
  defaultCommandTimeout: 30000,
  pageLoadTimeout: 60000,
  responseTimeout: 45000,
  requestTimeout: 45000,
  video: String(process.env.DEBUG_MODE || 'false').toLowerCase() === 'true',
  screenshotOnRunFailure: true,

  e2e: {
    chromeWebSecurity: false,
    experimentalModifyObstructiveThirdPartyCode: true,

    setupNodeEvents(on, config) {
      const http = require('http')

      function postJobEvent(jobId, body) {
        if (!jobId) return
        const payload = Buffer.from(JSON.stringify(body))
        const options = {
          hostname: 'localhost',
          port: Number(process.env.JOB_MANAGER_PORT || 3001),
          path: '/jobs/' + jobId + '/events',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload.length,
          },
        }
        const req = http.request(options)
        req.on('error', () => {})
        req.write(payload)
        req.end()
      }

      on('task', {
        log(message) {
          const safeMessage = String(message || '')
          console.log(safeMessage + '\n')
          const jobId = process.env.JOB_ID
          postJobEvent(jobId, { type: 'LOG', message: safeMessage })
          return null
        },

        reportIrctcState(state) {
          const safeState = state || {}
          console.log('[IRCTC-STATE]', JSON.stringify(safeState))
          const jobId = process.env.JOB_ID
          postJobEvent(jobId, {
            type: 'IRCTC_STATE',
            state: safeState,
          })
          return null
        },

        bookingStateLoad({ jobId }) {
          return RunStateStore.load(jobId)
        },

        bookingStateSave({ jobId, state, phase, message, metadata }) {
          const saved = RunStateStore.save(jobId, {
            state,
            phase,
            message: message || null,
            metadata: metadata || null,
          })
          const event = {
            type: 'STATE_CHANGED',
            state: saved.state,
            message: message || null,
          }
          if (metadata && metadata.pnr) event.pnr = String(metadata.pnr)
          postJobEvent(jobId, event)
          return saved
        },

        telemetryMark({ jobId, name, metadata }) {
          return Telemetry.mark(jobId, name, metadata || null)
        },

        telemetrySnapshot({ jobId }) {
          return Telemetry.snapshot(jobId)
        },
      })

      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium') {
          launchOptions.args.push('--no-sandbox')
          launchOptions.args.push('--disable-web-security')
          launchOptions.args.push('--window-size=1478,1056')
          if (process.env.CYPRESS_HEADED === 'true') {
            launchOptions.args.push('--start-maximized')
          }
        }
        return launchOptions
      })

      return config
    },
  },
})
