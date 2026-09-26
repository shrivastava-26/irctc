// Compatibility adapter.
// Playwright is the production browser execution layer.
// The Cypress name remains only so older callers/tests do not break during migration.

const { runBooking, runMock, writeResult } = require('./playwrightRunner')

module.exports = {
  runBooking,
  runMock,
  writeResult,
  runCypress: runBooking,
}
