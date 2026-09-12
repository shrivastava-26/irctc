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
      on('task', {
        log(message) {
          // NEVER log credentials, PAN, payment details or passenger PII here.
          // Only log page-state facts and status messages.
          console.log(message + '\n')
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
