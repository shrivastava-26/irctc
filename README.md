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

## Run

```powershell
npm install
npm run validate
npm run test:headed
```

To test login after independently confirming the current DOM and supplying credentials locally (never commit them):

```powershell
$env:CYPRESS_IRCTC_RUN_AUTH_FLOW = 'true'
$env:CYPRESS_IRCTC_USERNAME = '...'
$env:CYPRESS_IRCTC_PASSWORD = '...'
npm run test:headed
```

The test does not include ticket, passenger, UPI, OTP, or payment automation.
