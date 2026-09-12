const { defineConfig } = require('cypress');

module.exports = defineConfig({
  defaultCommandTimeout: 30_000,
  pageLoadTimeout: 60_000,
  video: true,
  screenshotOnRunFailure: true,
  e2e: {
    baseUrl: 'https://www.irctc.co.in',
    supportFile: 'cypress/support/e2e.js',
    setupNodeEvents(on) {
      on('task', {
        reportIrctcState(state) {
          // Deliberately log only non-sensitive page-state facts.
          // Credentials, passenger data, and payment details must never be logged.
          console.log(JSON.stringify(state));
          return null;
        },
      });
    },
  },
});

