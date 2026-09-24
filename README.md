# IRCTC Cypress automation — evidence-first baseline

This repository starts with a deliberately narrow, safe diagnostic flow. It validates the real IRCTC entry state before attempting downstream train search or booking.

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

The entry page also displayed a Tatkal eligibility notice. The project does not treat that notice as permission to proceed with Tatkal booking and will not automate beyond any CAPTCHA, OTP, eligibility, or payment challenge.

## What is intentionally not implemented yet

Train search, quota selection, passenger data, and payment handoff have no verified current Cypress DOM evidence in this repository. They must be added one state at a time after the entry/authentication test succeeds in a real headed Cypress browser. The suite must stop for CAPTCHA, OTP, or payment authorization.

`MIGRATION.md` explains which safe portions of the original Cypress project are included and why its CAPTCHA and payment automation are intentionally excluded.

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

None of the flows above include ticket payment automation — every path stops at
CAPTCHA, OTP, or the payment boundary for a human to complete.

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
- **CAPTCHA OCR requests fail**: the Python OCR server must be running first
  (`npm run start-captcha-server`, then wait for `npm run wait-for-captcha-server`
  or the `/health` endpoint) before any flow that calls `submitCaptcha`/`solveCaptcha`.
- **Browser gets blocked or times out (WAF)**: always run headed
  (`--headed --browser chrome`), never headless — this repo intentionally
  strips the `--headless` flag in `cypress.config.js` because IRCTC's WAF
  blocks headless/Electron fingerprints.
