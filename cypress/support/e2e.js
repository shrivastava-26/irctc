// cypress/support/e2e.js
// Loaded automatically before all test files.
import './commands';
// cypress/support/mock-boundary.js is an optional, developer-local file
// (see .gitignore: "Local mock/test artifacts") — it is never committed.
// Cypress's bundler resolves imports statically, so it cannot be imported
// unconditionally without breaking every spec when the file is absent.
// If you use a local mock boundary, load it from your own local support
// setup rather than importing it here.
