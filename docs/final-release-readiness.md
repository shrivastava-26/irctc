# Final Release Readiness

Date: 2026-09-24

## Blockers resolved

1. **`cypress/support/e2e.js` imported a missing file.** It statically imported
   `./mock-boundary`, a file listed in `.gitignore` as a developer-local, never-committed
   artifact that was simply absent from this checkout. Since Cypress's bundler resolves
   imports statically, this broke every spec at load time — including CI
   (`.github/workflows/irctc.yml`, which has been failing on every run since commit
   `d410579`). **Fix**: removed the unconditional import; added a comment explaining why
   (the file is optional and per-developer, so it cannot be a hard dependency of a
   committed file). No mock behavior was fabricated — the file still does not exist, and
   nothing depends on it existing.
2. **11 custom commands referenced by 4 of the 5 specs were undefined.**
   `visitIrctcEntry`, `dismissLanguageChoiceIfPresent`, `stopForSecurityChallenge`,
   `openLoginWhenAvailable`, `loginFromEnvironment`, `waitForPostLoginUI`,
   `reportCurrentIrctcState`, `searchTrains`, `selectTrainAndClass`, `fillPassengerForm`,
   `proceedToPaymentBoundary` were called by `irctc-entry.cy.js`, `irctc-login.cy.js`,
   `irctc-train-search.cy.js`, and `irctc-booking-flow.cy.js` but not defined anywhere in
   `cypress/support/commands.js`. **Fix**: recovered, not reinvented — full history search
   found the original implementations in commit `efe8699` ("feat: add authenticated login,
   train search, and booking flow specs"), which a later commit (`8671558`, "complete
   shivamguys architecture port") overwrote with a different single-flow architecture
   without updating or removing the four specs that depended on the original commands. The
   recovered implementations were appended to `cypress/support/commands.js`, verbatim,
   with one necessary adaptation (see "Recovered versus newly implemented code").
3. **`cy.task('reportIrctcState', ...)` was not registered.** Two of the recovered
   commands (`visitIrctcEntry`, `reportCurrentIrctcState`) call this task, which existed in
   the same historical commit but was removed from `cypress.config.js` in the same
   `8671558` rewrite. **Fix**: re-registered it in the existing `on('task', {...})` block,
   verbatim from the recovered version, alongside the existing `log` task (unchanged).

## Files changed

- `cypress/support/e2e.js` — removed the unconditional `mock-boundary` import; added an
  explanatory comment.
- `cypress.config.js` — added the `reportIrctcState` task handler to the existing
  `setupNodeEvents`/`on('task', ...)` block. Nothing else in this file changed.
- `cypress/support/commands.js` — appended the 11 recovered commands and their shared
  private helpers (`ENTRY_URL`, `visibleText`, `pageState`) after the existing
  `submitCaptcha`/`solveCaptcha`/`bookUntilTatkalGetsOpen`/`doPostLoginFlow` architecture.
  Nothing in the existing (Era-B) code was modified, reordered, or removed.
- `cypress/e2e/irctc-booking-flow.cy.js` — unchanged in this pass (the fixture-load fix
  from the prior performance pass is preserved).
- `docs/active-execution-surface.md` — corrected one table cell that stated
  `cypress/support/e2e.js` loads `mock-boundary.js`, which is no longer true.
- `README.md` — replaced the stale Run section (which referenced non-existent
  `npm run validate`/`npm run test:headed` scripts) with commands that exist and work
  today, plus a troubleshooting section.
- `docs/final-release-readiness.md` — this document (new).

`ui/src/components/AutomationDialog.jsx` has pre-existing local, uncommitted changes from
before this task (comment removals) — confirmed untouched.

## Recovered versus newly implemented code

Everything under "Blockers resolved" item 2 and 3 is **recovered**, not newly designed —
sourced verbatim from `git show efe8699:cypress/support/commands.js` and
`git show efe8699:cypress.config.js`. One line of adaptation was necessary and is called
out in a comment at its call site: the recovered `visitIrctcEntry()` originally called
`cy.visit(ENTRY_PATH, ...)` relying on `baseUrl: 'https://www.irctc.co.in'`, which no
longer exists in this project's `cypress.config.js` (removed by the same later rewrite).
Reintroducing a global `baseUrl` would add an external-URL preflight check ahead of every
spec run, including `irctc.cy.js`, which does not need it. Instead, `visitIrctcEntry()` now
visits the same absolute URL (`https://www.irctc.co.in/nget/train-search`) that
`irctc.cy.js` already uses via `win.location.href`. No selector, wait, timeout, or
assertion in the recovered code was changed from the historical original. No new command
was invented — nothing outside these 11 was needed once the recovery was found.

## Old UI / new UI support status

Both existing selector strategies remain intact and unmerged:

- The Era-B flow (`irctc.cy.js` + `submitCaptcha`/`solveCaptcha`/`bookUntilTatkalGetsOpen`/
  `doPostLoginFlow` in `commands.js`) — its class-based and `:nth-child`-based selectors
  with documented FIX 1–5 adjustments for the current DOM are untouched.
- The recovered Era-A flow (`irctc-entry.cy.js`, `irctc-login.cy.js`,
  `irctc-train-search.cy.js`, `irctc-booking-flow.cy.js` +
  `visitIrctcEntry`/`searchTrains`/etc.) — its independent, text-based/attribute-based
  selector strategy (`pageState()`, `cy.contains(..., /regex/i)`) is appended, not
  interleaved with Era-B's selectors. Neither flow's selectors were combined into a shared
  or ambiguous chain; they remain two separate, independently-resolvable command sets, per
  the requirement to keep old and new UI handling separate.

## Commands and flows validated

Statically verified (no live network access performed — see "Unresolved external
limitations"):

- **Syntax**: `node --check` passed with no errors on `cypress.config.js`,
  `cypress/support/e2e.js`, `cypress/support/commands.js`, and all 5 spec files.
- **Support-import resolution**: `cypress/support/e2e.js` now imports only `./commands`,
  which exists.
- **Every called custom command is defined**: cross-referenced every `cy.<name>(` call
  site across all 5 specs (via `grep`) against every `Cypress.Commands.add('<name>', ...)`
  definition in `commands.js`. All resolve — `submitCaptcha`, `doPostLoginFlow`,
  `visitIrctcEntry`, `dismissLanguageChoiceIfPresent`, `reportCurrentIrctcState`,
  `stopForSecurityChallenge`, `openLoginWhenAvailable`, `loginFromEnvironment`,
  `waitForPostLoginUI`, `searchTrains`, `selectTrainAndClass`, `fillPassengerForm`,
  `proceedToPaymentBoundary`. No undefined-command gaps remain.
- **Fixture-reference validation**: `cypress/fixtures/booking.json`'s keys
  (`SOURCE_STATION`, `DESTINATION_STATION`, `TRAVEL_DATE`, `TRAIN_NO`, `TRAIN_COACH`,
  `PASSENGER_DETAILS[].{name,age,gender,berth}`) match exactly what `searchTrains`,
  `selectTrainAndClass`, and `fillPassengerForm` read.
- **Spec discovery**: all 5 files under `cypress/e2e/` match Cypress's default
  `specPattern` (`cypress/e2e/**/*.cy.{js,jsx,ts,tsx}`); `cypress.config.js` does not
  override `specPattern`, so no spec is excluded.

Not executed this pass: a live `cypress run` (entry-flow, guarded login, search, or
booking-flow tests) and the one headed timing pass. `npx cypress` attempted to fetch a
fresh Cypress binary because this checkout has no `node_modules` installed (`npm install`
had not been run), and the environment owner elected to run `npm install` and any live,
credentialed, or network-touching Cypress execution themselves rather than have it
triggered from this session — consistent with the same preference stated earlier for any
run that contacts production IRCTC. See "Manual verification commands" below for the exact
commands to run.

## Tests executed

None (see above). All validation in this pass was static (syntax, import graph, symbol
resolution, fixture schema, spec discovery).

## Unresolved external limitations

- **Live DOM verification.** The recovered selectors (`pageState()`'s regex/attribute
  checks, `openLoginWhenAvailable`, `searchTrains`, etc.) have not been re-verified against
  IRCTC's current live DOM in this pass. They are recovered as-is from working history, not
  guessed, but IRCTC's markup can change independently of this repository.
- **Credentials and dependency install.** No `node_modules`, `.env`, or `cypress.env.json`
  exist in this checkout. The guarded login/search/booking flows cannot run until the
  owner installs dependencies and supplies `IRCTC_USERNAME`/`IRCTC_PASSWORD`.
- **CAPTCHA OCR server.** Not started or verified reachable in this pass; required before
  `submitCaptcha`/`solveCaptcha` (Era-B) can complete a real login.
- **Performance evidence.** `docs/cypress-performance-baseline.md` and
  `docs/cypress-performance-plan.md` (from the prior pass) still reflect the fact that no
  live-timed run has been performed; that remains true after this pass.

## Exact local run commands

```powershell
# 1. Install dependencies
npm install

# 2. Entry validation only (no credentials, no login attempted)
npx cypress run --headed --browser chrome --spec "cypress/e2e/irctc-entry.cy.js"

# 3. Guarded authenticated login (requires cypress.env.json or CYPRESS_ env vars)
$env:CYPRESS_IRCTC_RUN_AUTH_FLOW = 'true'
$env:CYPRESS_IRCTC_USERNAME = '...'
$env:CYPRESS_IRCTC_PASSWORD = '...'
npx cypress run --headed --browser chrome --spec "cypress/e2e/irctc-login.cy.js"

# 4. Search + booking flow (stops at payment boundary)
npx cypress run --headed --browser chrome --spec "cypress/e2e/irctc-train-search.cy.js"
npx cypress run --headed --browser chrome --spec "cypress/e2e/irctc-booking-flow.cy.js"

# 5. Full suite as Cypress discovers it (irctc.cy.js always runs; the other 4 skip
#    themselves without IRCTC_RUN_AUTH_FLOW=true)
npm test

# 6. Job-manager + UI
npm run start-ui
```

## Final release decision

**READY_FOR_MANUAL_LIVE_VALIDATION.**

Every blocker that prevented the suite from loading or resolving is fixed with recovered
(not invented) code, and every check that can be performed without installing
dependencies or touching production IRCTC has passed. What remains — confirming the
recovered selectors still match IRCTC's live DOM, and a real login/search/booking run with
credentials — requires the dependency install and live network access the owner has asked
to perform themselves.
