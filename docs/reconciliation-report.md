# Reconciliation Report

## 1. Scope

This report reconciles the architecture documentation and product documentation against the actual repository code and runtime entry points. The purpose is to separate:

- code that is executable today,
- code that is present but not active,
- documentation that is only descriptive,
- and claims that are not live-verified.

The standard classification is:

- CODE_VERIFIED: the behavior is implemented in repository code and is directly evidenced in source.
- LIVE_VERIFIED: a browser-level behavior was observed and validated in a real live run.
- DOCUMENTED_ONLY: the claim exists in docs but no code or live evidence proves it.
- PARTIAL: code exists but the active behavior is only partially implemented or gated.
- UNVERIFIED: there is no reliable evidence proving it in this repository or environment.
- CONFLICTING: the repo contains direct contradictions between documentation, code, or runtime paths.
- OBSOLETE: outdated code or assumptions are retained but are not the current active execution model.

## 2. Summary

The repository contains a safe, narrow baseline and a separate legacy automation layer. The documentation is broadly directionally correct, but several statements are not strong enough to stand as implementation proof. The central reconciliation issue is that active MVP-1 safety rules and legacy automation coexist in the same repository without a strict execution boundary.

## 3. Material findings

### Finding 1: The repo currently defines an entry-state validation baseline.
Classification: CODE_VERIFIED
Evidence: The README documents a deliberately narrow flow, and the Cypress entry spec implements it with route visit and state checks. The code explicitly validates the live page state instead of assuming a stale login selector.
Source files:
- [README.md](../README.md#L1-L37)
- [cypress/e2e/irctc-entry.cy.js](../cypress/e2e/irctc-entry.cy.js#L1-L24)
- [cypress/e2e/irctc-login.cy.js](../cypress/e2e/irctc-login.cy.js#L1-L49)
Relevant symbols: `describe('IRCTC entry and authentication boundary')`, `cy.visitIrctcEntry()`, `cy.dismissLanguageChoiceIfPresent()`, `cy.reportCurrentIrctcState()`
Risk: Low, because this is the intended active baseline.
Required action: Keep this as the mandatory MVP-1 execution boundary and avoid superseding it with legacy flows.

### Finding 2: The project says authentication is disabled by default.
Classification: CODE_VERIFIED
Evidence: The tests skip unless `Cypress.env('IRCTC_RUN_AUTH_FLOW') === true`, and the README states the auth flow is disabled unless explicitly enabled.
Source files:
- [README.md](../README.md#L9-L33)
- [cypress/e2e/irctc-entry.cy.js](../cypress/e2e/irctc-entry.cy.js#L7-L15)
- [cypress/e2e/irctc-login.cy.js](../cypress/e2e/irctc-login.cy.js#L8-L15)
Relevant symbols: `Cypress.env('IRCTC_RUN_AUTH_FLOW') !== true`, `this.skip()`
Risk: Low, because it is a deliberate safety gate.
Required action: Preserve this guard and require explicit opt-in for any login attempt beyond MVP-1 state validation.

### Finding 3: CAPTCHAs are documented as excluded, but solver code exists.
Classification: CONFLICTING
Evidence: The repository documentation says CAPTCHA solving is not implemented, but the Python OCR server and Cypress CAPTCHA helper functions are present and executable as code paths.
Source files:
- [README.md](../README.md#L11-L19)
- [MIGRATION.md](../MIGRATION.md#L1-L18)
- [cypress/support/commands.js](../cypress/support/commands.js#L38-L59)
- [cypress/support/commands.js](../cypress/support/commands.js#L404-L530)
- [irctc-captcha-solver/app-server.py](../irctc-captcha-solver/app-server.py#L1-L53)
- [irctc-captcha-solver/app.py](../irctc-captcha-solver/app.py#L1-L19)
Relevant symbols: `submitCaptcha`, `solveCaptcha`, `solveAndRetryLogin`, `extract_text()`, `health()`
Risk: High. The presence of solver code creates accidental execution risk and contradicts the documented safety posture.
Required action: Treat the solver code as archived or behind an explicit security review gate. It must not be in the active MVP-1 execution surface.

### Finding 4: Payment automation is documented as excluded, but legacy UPI/payment selectors and command flows remain in the codebase.
Classification: CONFLICTING
Evidence: `MIGRATION.md` explicitly excludes automatic payment-gateway handling, but the legacy Cypress command file still contains UPI selector and payment flow code.
Source files:
- [MIGRATION.md](../MIGRATION.md#L1-L18)
- [cypress/support/commands.js](../cypress/support/commands.js#L260-L401)
- [cypress/e2e/irctc-booking-flow.cy.js](../cypress/e2e/irctc-booking-flow.cy.js#L1-L116)
- [cypress/e2e/irctc.cy.js](../cypress/e2e/irctc.cy.js#L1-L140)
Relevant symbols: `cy.doPostLoginFlow`, `cy.submitCaptcha`, `cy.solveCaptcha`, `cy.proceedToPaymentBoundary`, `cy.get('#\\32  > .ui-radiobutton > .ui-radiobutton-box')`
Risk: High. This is the most direct contradiction between the documented policy and the code kept in the repo.
Required action: Disable or archive the legacy payment and UPI paths. They must not be part of active execution or future MVP-1 scope.

### Finding 5: The repo has a mixed active-safe baseline and legacy automation layer.
Classification: CONFLICTING
Evidence: The project includes narrow, safe specs and also a legacy monolithic spec that attempts a full booking flow. Since Cypress discovers all spec files under `cypress/e2e`, the whole collection is potentially vulnerable to accidental execution.
Source files:
- [cypress/e2e/irctc-entry.cy.js](../cypress/e2e/irctc-entry.cy.js#L1-L24)
- [cypress/e2e/irctc-login.cy.js](../cypress/e2e/irctc-login.cy.js#L1-L49)
- [cypress/e2e/irctc-train-search.cy.js](../cypress/e2e/irctc-train-search.cy.js#L1-L44)
- [cypress/e2e/irctc-booking-flow.cy.js](../cypress/e2e/irctc-booking-flow.cy.js#L1-L116)
- [cypress/e2e/irctc.cy.js](../cypress/e2e/irctc.cy.js#L1-L140)
Relevant symbols: `describe('IRCTC TATKAL BOOKING')`, `it('Tatkal Booking Begins......')`
Risk: Medium. Spec discovery can expand execution scope unexpectedly.
Required action: Explicitly exclude legacy specs from the MVP-1 run surface and move them to an `archive` or `legacy` path outside Cypress discovery.

### Finding 6: Search is described as requiring authentication, but the codebase also treats entry and search UI as distinct public states.
Classification: PARTIAL
Evidence: The entry spec validates a page state before login, and the code includes a public route check independent of auth. The train-search spec later assumes an authenticated search flow; this is a valid later-stage assumption, but not a universal requirement.
Source files:
- [cypress/e2e/irctc-entry.cy.js](../cypress/e2e/irctc-entry.cy.js#L1-L24)
- [cypress/e2e/irctc-train-search.cy.js](../cypress/e2e/irctc-train-search.cy.js#L1-L44)
- [cypress/support/commands.js](../cypress/support/commands.js#L76-L126)
Relevant symbols: `cy.visitIrctcEntry()`, `cy.reportCurrentIrctcState()`, `cy.searchTrains(booking)`
Risk: Medium. It is easy to overgeneralize auth as a required gate for every search form when the current evidence only proves a public entry route and a guarded authenticated search flow.
Required action: Define `PUBLIC_SEARCH_FORM` and `AUTHENTICATED_SEARCH_FORM` as separate states in the canonical MVP-1 model, without assuming one is required for the other.

### Finding 7: Several claims marked as VERIFIED are only code-level verification, not browser-level proof.
Classification: PARTIAL
Evidence: The code clearly implements helper functions and state checks, but the repo itself notes that Cypress local environment limitations prevented full live verification of some selectors, and the safe baseline is explicitly narrower than the old automation code.
Source files:
- [README.md](../README.md#L5-L37)
- [cypress/support/commands.js](../cypress/support/commands.js#L1-L59)
- [cypress.config.js](../cypress.config.js#L1-L83)
Relevant symbols: `cy.dismissLanguageChoiceIfPresent()`, `cy.openLoginWhenAvailable()`, `cy.loginFromEnvironment()`, `setupNodeEvents()`
Risk: Medium. Code presence does not equal live browser correctness.
Required action: Ascribe implementation status conservatively and separate code existence from browser proof. Use `CODE_VERIFIED` and `PARTIAL` rather than `LIVE_VERIFIED` unless the run actually proves it.

### Finding 8: The browser configuration is compatibility configuration, not a WAF bypass.
Classification: PARTIAL
Evidence: The Cypress config disables headless mode and injects browser launch arguments for compatibility, but the docs should describe these as browser compatibility adjustments rather than anti-WAF evasion. The project still treats access denial as a stop condition and not a bypass case.
Source files:
- [cypress.config.js](../cypress.config.js#L13-L63)
- [README.md](../README.md#L5-L19)
Relevant symbols: `on('before:browser:launch', ...)`, `--disable-blink-features=AutomationControlled`, `--disable-web-security`
Risk: Medium, because the wording should not imply evasion or bypass of anti-bot controls.
Required action: Reframe the config as compatibility tuning and preserve `ACCESS_BLOCKED` as a hard stop in the canonical state model.

### Finding 9: The repo contains a job-manager and UI that can trigger automation, but the active MVP-1 scope must not use them for booking or search flows.
Classification: CODE_VERIFIED
Evidence: The Node server exposes a job API and UI triggers jobs. The runtime surfaces exist, but the safety boundaries are controlled by the Cypress specs and environment flags rather than the job manager itself.
Source files:
- [src/server/index.js](../src/server/index.js#L1-L97)
- [src/engine/adapter.js](../src/engine/adapter.js#L1-L129)
- [src/scheduler/Scheduler.js](../src/scheduler/Scheduler.js#L1-L65)
- [ui/src/App.jsx](../ui/src/App.jsx#L1-L118)
Relevant symbols: `app.post('/jobs')`, `runCypress(job, credentials, onEvent)`, `schedule(job)`, `startAutomation`
Risk: Medium. The orchestration layer can launch legacy flows unless the execution surface is restricted.
Required action: Keep the job manager but restrict job creation to MVP-1 entry-validation tasks only until a validated contract exists.

### Finding 10: Some older claims are obsolete because they reflect the pre-safety migration state.
Classification: OBSOLETE
Evidence: The repo includes legacy monolithic automation and original booking logic that is explicitly not imported as executable automation. This code remains for migration reference only and should not guide current active implementation.
Source files:
- [MIGRATION.md](../MIGRATION.md#L1-L18)
- [cypress/e2e/irctc.cy.js](../cypress/e2e/irctc.cy.js#L1-L140)
- [cypress/support/commands.js](../cypress/support/commands.js#L1-L59)
Relevant symbols: `Tatkal Booking Begins......`, `BOOK_UNTIL_TATKAL_OPENS`, `solveAndRetryLogin`
Risk: High if treated as active behavior.
Required action: Archive as a reference implementation, not as current product logic.

## 4. Reconciled conclusion

The repository is best explained as a controlled, narrow baseline plus retained legacy automation. The safety-positioned docs are mostly correct, but the codebase still contains older automation paths that are contrary to the intended active scope. The implementation-ready MVP-1 surface should be the entry-state validator and challenge detector only, with all legacy solver, payer, booking, and advanced search logic removed from execution, isolated, or gated behind explicit architecture review.
