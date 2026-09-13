const { defineConfig } = require('cypress')

module.exports = defineConfig({
  projectId: '7afdkj',

  defaultCommandTimeout: 120000,
  pageLoadTimeout: 90000,
  responseTimeout: 60000,
  requestTimeout: 60000,
  video: true,
  screenshotOnRunFailure: true,

  e2e: {
    // chromeWebSecurity and experimentalModifyObstructiveThirdPartyCode
    // must be in the e2e block for Cypress 13 compatibility.
    chromeWebSecurity: false,
    experimentalModifyObstructiveThirdPartyCode: true,

    setupNodeEvents(on, config) {
      const http = require('http')

      // Post a log event to the Job Manager if JOB_ID is set.
      // This streams live Cypress output to the UI while the job runs.
      function postJobEvent(jobId, body) {
        const payload = Buffer.from(JSON.stringify(body))
        const options = {
          hostname: 'localhost',
          port: process.env.JOB_MANAGER_PORT || 3001,
          path: `/jobs/${jobId}/events`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload.length,
          },
        }
        const req = http.request(options)
        req.on('error', () => { /* non-fatal */ })
        req.write(payload)
        req.end()
      }

      on('task', {
        log(message) {
          console.log(message + '\n')
          const jobId = process.env.JOB_ID
          if (!jobId) return null;

          postJobEvent(jobId, { type: 'LOG', message })

          // Heuristics to update the Job Manager state machine based on logs
          let state = null;
          const msg = message.toLowerCase();
          
          if (msg.includes('login') || msg.includes('captcha') || msg.includes('authenticated')) {
            state = 'LOGIN';
          } else if (msg.includes('station set') || msg.includes('search submitted')) {
            state = 'SEARCH';
          } else if (msg.includes('found train')) {
            state = 'TRAIN_FOUND';
          } else if (msg.includes('tatkal time started') || msg.includes('book now clicked')) {
            state = 'AVAILABILITY';
          } else if (msg.includes('filling name') || msg.includes('passenger data')) {
            state = 'BOOKING_FORM';
          } else if (msg.includes('navigating to review')) {
            state = 'REVIEW';
          } else if (msg.includes('payment') || msg.includes('pay and book') || msg.includes('upi')) {
            state = 'PAYMENT';
          }

          if (state) {
            postJobEvent(jobId, { type: 'STATE_CHANGED', state, message: `Transitioned to ${state}` })
          }

          return null
        },
      })

      // Remove --headless flag so IRCTC WAF doesn't fingerprint and block the browser.
      // This is the primary fix for ESOCKETTIMEDOUT in headless CI.
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium') {
          launchOptions.args = launchOptions.args.filter(
            (arg) => !arg.includes('--headless'),
          )
          launchOptions.args.push('--disable-blink-features=AutomationControlled')
          launchOptions.args.push('--no-sandbox')
          launchOptions.args.push('--disable-web-security')
          launchOptions.args.push('--window-size=1478,1056')
          launchOptions.args.push('--start-maximized')
        }
        return launchOptions
      })

      return config
    },
  },
})
