# IRCTC Cypress automation — autonomous booking engine

This repository contains a persistent, state-aware Cypress booking engine plus the legacy diagnostic specs retained for compatibility.

## What is implemented

- Visits only the observed entry route: `/nget/train-search`.
- Detects and reports an access-denied/WAF response separately from a selector failure.
- Handles the observed language-choice state only when it appears.
- Replaces the historical `.h_head1 > .search_btn` dependency with a live `LOGIN / REGISTER` or `BOOK TICKET` state check.
- Makes CAPTCHA handling conditional and stops rather than attempting to solve or bypass it.
- Keeps credentials out of source control and Cypress logs.
- Keeps the authentication test disabled unless `IRCTC_RUN_AUTH_FLOW=true` is explicitly provided.

## Current browser evidence (12 September 2026)

The real IRCTC `/nget/train-search` page rendered in a Chromium browser with:

- the Welcome/language modal;
- two `button.btn.btn-primary` controls whose rendered text is `हिंदी` and `English`;
- booking-search fields for From, To, date, class, quota, and `Search Trains`.

The language buttons have a malformed, generated accessible name, so the test intentionally matches their rendered `English` text rather than their ARIA name. This has not yet been verified inside Cypress because the local environment prevents Cypress from completing its post-install executable setup.

The entry page also displayed a Tatkal eligibility notice. The Beta booking flow is now implemented in the autonomous spec. Downstream selectors are isolated so they can be updated without changing the engine/persistence layers. CAPTCHA/OTP remains a legitimate security challenge rather than an automation-bypass target.

The legacy migration notes and legacy specs remain available for backward compatibility.

## Run

Install dependencies once:

```powershell
npm install
```

Entry validation only — visits the live entry page and classifies its state, no
credentials required:

```powershell
npx cypress run --headed --browser chrome --spec "cypress/e2e/irctc-entry.cy.js"
```

Headed execution of the full spec suite as Cypress discovers it (`cypress/e2e/**/*.cy.js`).
`irctc.cy.js` always runs (it performs a real login using `USERNAME`/`PASSWORD`
Cypress env vars); the other four specs skip themselves unless
`IRCTC_RUN_AUTH_FLOW=true` is set:

```powershell
npm test
```

Guarded authentication flow — supply credentials locally (never commit them) and
opt in explicitly:

```powershell
$env:CYPRESS_IRCTC_RUN_AUTH_FLOW = 'true'
$env:CYPRESS_IRCTC_USERNAME = '...'
$env:CYPRESS_IRCTC_PASSWORD = '...'
npx cypress run --headed --browser chrome --spec "cypress/e2e/irctc-login.cy.js"
```

Full configured automation (search → select → passenger form → payment boundary,
stops before paying) once the guarded login flow above has been independently
verified:

```powershell
$env:CYPRESS_IRCTC_RUN_AUTH_FLOW = 'true'
$env:CYPRESS_IRCTC_USERNAME = '...'
$env:CYPRESS_IRCTC_PASSWORD = '...'
npx cypress run --headed --browser chrome --spec "cypress/e2e/irctc-booking-flow.cy.js"
```

Job-manager + React UI (starts the CAPTCHA OCR server, the job-manager API, and
the UI dev server together):

```powershell
npm run start-ui
```

Legacy flows retain their original guarded behavior. The autonomous engine can navigate the configured payment UI and waits for the authoritative transaction outcome; it does not bypass external bank/UPI authorization or security challenges.

### Troubleshooting

- **Every spec fails immediately with a module-resolution error mentioning
  `mock-boundary`**: `cypress/support/mock-boundary.js` is an optional,
  gitignored, developer-local file (see `.gitignore`) — it is never imported
  unconditionally. If you have a local copy, load it from your own local setup
  rather than `cypress/support/e2e.js`.
- **`cy.<commandName> is not a function`**: confirm the command is defined in
  `cypress/support/commands.js` (`grep "Cypress.Commands.add" cypress/support/commands.js`)
  and that `cypress/support/e2e.js` still imports `./commands`.
- **Login/search/booking specs report "skipped"**: they require
  `IRCTC_RUN_AUTH_FLOW=true` (via `CYPRESS_IRCTC_RUN_AUTH_FLOW=true` or
  `cypress.env.json`) plus `IRCTC_USERNAME`/`IRCTC_PASSWORD` — this is
  intentional; they never run unattended.
- **Legacy CAPTCHA OCR requests fail**: the old legacy specs still depend on the optional OCR service. The autonomous engine does not invoke it.
- **Browser gets blocked or times out**: record the current state and stop rather than trying to evade the site's security controls. Retry from the persisted state when the access condition is resolved.


## Autonomous booking engine

The feature branch adds a persistent, state-aware Cypress execution path in cypress/e2e/autonomous-booking.cy.js.

Run preparation:

    npm run prepare

Run the current configured booking request:

    npm run book

Run the scheduler/one-command wrapper:

    npm run auto-book

The autonomous path persists execution checkpoints under .data/automation-runs/<jobId>/state.json, records bounded transition history, and writes timing telemetry.

Configure the request from booking-request.example.json using BOOKING_REQUEST_FILE or BOOKING_REQUEST_JSON. Credentials are supplied through environment variables or the existing server credential reference; do not commit real passwords or payment secrets.

FAST_MODE=true keeps the normal hot path lightweight. DEBUG_MODE=true enables additional diagnostics.

The production workflow treats CAPTCHA/OTP as security challenges rather than attempting to bypass them. A headed browser can remain on the same state while a user completes the challenge, then resume.

Transactional booking and payment states are reconciled before any retry. An unknown outcome is never treated as a safe failure and is never blindly resubmitted.

The existing legacy specs remain in place for backward compatibility.
