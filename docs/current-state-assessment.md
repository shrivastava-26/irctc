# Current State Assessment

Status: VERIFIED for baseline evidence; PARTIAL for legacy automation; ASSUMED for downstream functionality.

## 1. Implemented Features

### Entry and page detection

- VERIFIED: open `/nget/train-search`.
- VERIFIED: detect access denied / WAF responses.
- VERIFIED: detect and dismiss language modal when shown.
- VERIFIED: verify page includes `LOGIN / REGISTER` or `BOOK TICKET` state.
- VERIFIED: stop before CAPTCHA handling.

### Credential handling

- VERIFIED: credentials are read from environment variables or external credential store.
- VERIFIED: `IRCTC_RUN_AUTH_FLOW` must be explicitly enabled.
- VERIFIED: auth flow is disabled by default.

### Job manager / orchestration

- VERIFIED: REST API for jobs exists.
- VERIFIED: job state tracking exists.
- VERIFIED: artifact collection exists for screenshots and videos.
- PARTIAL: the UI and server are available but not yet proven operational across the safe baseline.

### Legacy automation retained for reference

- PARTIAL: old automation includes login, train search, booking form, and payment logic.
- VERIFIED: the repository explicitly excludes these paths from active use.

## 2. Verified Features

The following are backed by code and repository documentation:

- `cy.visitIrctcEntry()` exists and is the canonical entry route.
- `cy.dismissLanguageChoiceIfPresent()` is present.
- `cy.reportCurrentIrctcState()` is used to log live page state.
- `cy.stopForSecurityChallenge()` indicates a mandatory stop on CAPTCHA, OTP, or blocked state.
- `cy.openLoginWhenAvailable()` is present.
- `cy.loginFromEnvironment()` loads credentials from environment variables.
- `cy.waitForPostLoginUI()` is present.
- `cypress.config.js` posts job-state transitions to the job manager.
- Python OCR service exists at `irctc-captcha-solver/app-server.py`.
- The GitHub Actions workflow installs the Python OCR environment and the Chrome browser.

## 3. Assumed Features

The following are referenced but not proven as current live DOM behavior:

- ASSUMED: full login completion on current IRCTC DOM is stable.
- ASSUMED: dynamic search form selectors remain valid across environment and time.
- ASSUMED: the OCR-based CAPTCHA path is functional in this environment.
- ASSUMED: passenger form selectors are valid for current production DOM.
- ASSUMED: payment boundary flows are valid or safe to continue.

These assumptions are explicitly flagged because the repository contains intentionally excluded automation and legacy code that is not trusted without a browser-level revalidation.

## 4. Missing Features

- Missing: verified train-search result parsing against the current live DOM.
- Missing: verified passenger form automation.
- Missing: verified OTP handling strategy.
- Missing: verified payment handling strategy.
- Missing: a mature selector contract or page object model.
- Missing: explicit evidence retention policy beyond screenshots/videos.
- Missing: a production-grade secret rotation and credential lifecycle plan.

## 5. Technical Debt

### High-risk debt

- Legacy automation code in `cypress/e2e/irctc.cy.js` and `cypress/support/commands.js` contains hardcoded assumptions and dynamic CSS selectors.
- The project contains both safe baseline code and legacy aggressive booking code in the same repository.
- There is no clear separation between active safe workflow and migration playground code.
- `configLoader.js` mutates fixture data dynamically and reads environment payloads with fragile parsing.
- A large amount of code depends on DOM text matching and Angular/PrimeNG CSS classes that are unstable.

### Medium-risk debt

- Job state names mix business and implementation terms (`LOGIN`, `SEARCH`, `PAYMENT`) without a formal state taxonomy.
- Multiple files define similar concepts in different ways.
- The repo has an unverified relationship between the UI job manager and the Cypress execution engine.

### Low-risk debt

- Example fixtures are useful but not authoritative live-contract tests.
- The job manager stores data in JSON rather than a database, which is acceptable for a local prototype but not for production-scale operations.

## 6. Risks

### Maintainability

- High risk: selector drift against a dynamic web app.
- High risk: mixed active and legacy code paths.
- Medium risk: no strict page object abstraction.

### Reliability

- High risk: access denial and CAPTCHA are site-controlled.
- Medium risk: browser compatibility and headless fingerprint issues remain active.
- Medium risk: CI/local validation can diverge from live IRCTC DOM behavior.

### Security

- High risk: credential handling is not fully hardened.
- High risk: screenshot and artifact retention may include sensitive pages.
- Medium risk: OCR service is a non-trivial attack surface.

## 7. Security Findings

Status: VERIFIED for current code-level concerns.

- Credentials are not stored in source control by design, but environment variables and OS credential stores are still sensitive material.
- Screenshots and videos are stored under `cypress/screenshots`, `cypress/videos`, and `artifacts/jobs/`.
- The Python OCR service accepts image payloads and stores no explicit retention policy.
- The workflow masks some secrets in logs but the repository still contains broad browser logs and job traces.
- Payment automation is explicitly excluded, but the legacy code still contains payment paths and UPI logic that must remain out of active execution.

## 8. Recommendation summary

1. Treat the current safe baseline as the only active workflow.
2. Freeze or isolate the legacy automation file paths.
3. Validate the live DOM before any new selector additions.
4. Document a state-driven acceptance contract before adding more automation.
5. Apply artifact retention and secret-scoping policy before moving beyond internal testing.

## 9. Final assessment

The project is currently in a safe, intentionally reduced baseline. It clearly documents what is known and what is intentionally excluded. However, the combination of a modern job manager and a large block of legacy booking automation means the repository is not yet a single coherent architecture. It needs a documented boundary between verified baseline automation and future unsupported automation.
