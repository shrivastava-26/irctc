const { defineConfig } = require('cypress');

module.exports = defineConfig({
  defaultCommandTimeout: 30_000,
  pageLoadTimeout: 90_000,
  responseTimeout: 60_000,
  requestTimeout: 60_000,
  video: true,
  screenshotOnRunFailure: true,
  // Disable web-security so IRCTC SPA redirects across subdomains don't block the runner.
  chromeWebSecurity: false,
  e2e: {
    baseUrl: 'https://www.irctc.co.in',
    supportFile: 'cypress/support/e2e.js',
    // Credentials are loaded from cypress.env.json (gitignored, never committed).
    env: {
      IRCTC_RUN_AUTH_FLOW: false,
    },
    setupNodeEvents(on, config) {
      on('task', {
        reportIrctcState(state) {
          // Only log non-sensitive page-state facts — never credentials or payment data.
          console.log('[IRCTC-STATE]', JSON.stringify(state));
          return null;
        },
        log(msg) {
          console.log('[CYPRESS]', msg);
          return null;
        },
      });

      // Pass launch arguments to Edge/Chrome to remove headless fingerprints
      // that IRCTC's WAF uses to detect and block automated browsers.
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium') {
          // Remove --headless flag that tells sites the browser is automated.
          const existingArgs = launchOptions.args;
          launchOptions.args = existingArgs.filter(
            (arg) => !arg.includes('--headless'),
          );

          // Disable automation-detection flags.
          launchOptions.args.push('--disable-blink-features=AutomationControlled');
          launchOptions.args.push('--no-sandbox');
          launchOptions.args.push('--disable-web-security');

          // Set a realistic window size.
          launchOptions.args.push('--window-size=1280,720');
        }
        return launchOptions;
      });

      return config;
    },
  },
});
