const { defineConfig } = require('cypress');

module.exports = defineConfig({
  projectId: '7afdkj',
  defaultCommandTimeout: 120000,
  pageLoadTimeout: 90000,
  responseTimeout: 60000,
  requestTimeout: 60000,
  video: true,
  screenshotOnRunFailure: true,

  e2e: {
    baseUrl: 'https://www.irctc.co.in',
    supportFile: 'cypress/support/e2e.js',

    // chromeWebSecurity and experimentalModifyObstructiveThirdPartyCode
    // are set at the top level for Cypress 13 compatibility.
    // These allow IRCTC's Angular SPA to work across its subdomains.
    chromeWebSecurity: false,
    experimentalModifyObstructiveThirdPartyCode: true,

    setupNodeEvents(on, config) {
      on('task', {
        log(message) {
          // IMPORTANT: Never log credentials or payment data here.
          // Only log page-state facts and status messages.
          console.log(message + '\n');
          return null;
        },
        reportIrctcState(state) {
          console.log('[IRCTC-STATE]', JSON.stringify(state));
          return null;
        },
      });

      // Remove headless detection signals so IRCTC's WAF doesn't block the
      // browser. This is the primary fix for ESOCKETTIMEDOUT in CI.
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium') {
          launchOptions.args = launchOptions.args.filter(
            (arg) => !arg.includes('--headless'),
          );
          launchOptions.args.push('--disable-blink-features=AutomationControlled');
          launchOptions.args.push('--no-sandbox');
          launchOptions.args.push('--disable-web-security');
          launchOptions.args.push('--window-size=1478,1056');
        }
        return launchOptions;
      });

      return config;
    },
  },
});
