# Cypress Performance Optimization — Result

Date: 2026-09-24
Inputs: `docs/cypress-performance-baseline.md`, `docs/cypress-performance-plan.md`

## Bottlenecks found

- Six fixed `cy.wait()` calls in `cypress/support/commands.js` (two are intentional
  human/Tatkal-timing waits; four are unlabelled settle waits with unknown necessity).
- A 120000ms default command timeout (30x Cypress's default) applied to any un-overridden
  selector query, plus 48 explicit per-command timeout overrides up to 200000ms.
- A job-manager event-persistence path (`JobStore.save()`) that rewrites the entire
  `.data/jobs.json` file (currently 1.46MB/53 jobs) on every one of the ~80–100 job events
  a single run can generate — measured at ~46ms per rewrite today, growing with job-history
  size — but confirmed non-blocking to Cypress's own run time since the HTTP post is
  fire-and-forget.
- A duplicated fixture load in `irctc-booking-flow.cy.js` (fixed — see below).
- A repeated login/search/select sequence designed into `irctc-booking-flow.cy.js`'s 4
  tests (currently unreachable — see blocker below).
- Uncapped recursive retry loops in login/CAPTCHA/Tatkal-poll code (robustness property,
  not a proven timing cost).

## External delays that cannot be fixed locally

- IRCTC page load, WAF response time, and Angular render latency after each interaction —
  no live-timed run was performed this session (project owner elected to run this
  themselves with real credentials rather than have this session hit production IRCTC).
- CAPTCHA OCR round-trip time against a real CAPTCHA image (the local EasyOCR server's
  cold-start is already handled correctly via health-check polling, not a fixed sleep).
- UPI payment gateway callback latency (bounded by an intentional 200000ms/180000ms
  ceiling, not a fixed cost).

## Files inspected

`package.json`, `cypress.config.js`, all 5 files in `cypress/e2e/*.cy.js`,
`cypress/support/{commands.js,configLoader.js,e2e.js}`, `cypress/utils/index.js`,
`cypress/fixtures/*.json`, `src/engine/adapter.js`, `src/scheduler/Scheduler.js`,
`src/server/index.js`, `src/persistence/JobStore.js`, `src/models/{Job,BookingRequest}.js`,
`src/security/CredentialManager.js`, `.github/workflows/irctc.yml`,
`ui/src/components/{AutomationDialog,JobHistory}.jsx`, `irctc-captcha-solver/app-server.py`,
and the relevant `docs/*.md` files.

## Files modified

- `cypress/e2e/irctc-booking-flow.cy.js` — moved `cy.fixture('booking').then(...)` from
  `beforeEach` into the existing `before` hook; `beforeEach` keeps only its skip-guard.

## Reason for the modification

The fixture never changes within a run and is only read (never mutated) by any of the
file's 4 tests, so loading it once in `before` instead of once per test in `beforeEach`
removes 3 redundant fixture reads per run with no behavior change — this matches the
task's own example of an acceptable fix ("reuse loaded fixtures within a test run").

## Before / after timing

Not independently timed — fixture reads of a small local JSON file are on the order of a
few milliseconds each, and this file cannot currently execute at all (see "remaining
gaps" below), so there is no live run to time before/after. The change was validated
structurally instead (see "validation results").

## Tests executed

None of the 5 specs could be executed end-to-end this session:
- `cypress/support/e2e.js` imports `./mock-boundary`, a gitignored local file that is
  absent from this checkout — every spec fails at module load before any test runs. This
  also means CI (`.github/workflows/irctc.yml`) has been failing on every run since commit
  `d410579`.
- Independently, `irctc-entry.cy.js`, `irctc-login.cy.js`, `irctc-train-search.cy.js`, and
  `irctc-booking-flow.cy.js` call 11 custom commands that are not defined anywhere in
  `cypress/support/commands.js`.
- The one spec that is otherwise self-contained, `irctc.cy.js`, performs a real login
  against production IRCTC; the project owner chose to run any live verification
  themselves with real credentials rather than have this session trigger it.

Given that, validation of the one applied change was done statically:
- Confirmed via string/regex inspection of the edited file that `before` now loads the
  fixture and `beforeEach` still contains its skip-guard (`this.skip()` check), unchanged.
- Confirmed by re-reading the full file that no test body mutates the `booking` object, so
  moving the load earlier cannot change what any test observes.
- `node --check` on the edited file completed without a syntax error.

## Validation results

- Execution order unchanged: the skip-guard still runs before every test via
  `beforeEach`; the fixture is now loaded once before the first test instead of before
  every test, which is observably identical since the fixture's content never changes and
  nothing depends on it being re-read.
- Old/new IRCTC UI selector paths: untouched — no selector was modified.
- Screenshots/videos/logs/artifacts: untouched — no config or capture code was modified.
- Environment variables and fixtures: `IRCTC_RUN_AUTH_FLOW`,`booking.json` behave exactly
  as before; only the load-frequency changed, not the loaded value or its usage.

## Remaining bottlenecks (not fixed, documented for the owner)

1. **`cypress/support/mock-boundary.js` is missing** (gitignored local file), breaking
   every spec including CI. Needs to be restored or the import removed/guarded by whoever
   owns that local mock-testing setup. This is the single highest-priority item to resolve
   before any further performance work can be measured live.
2. **11 custom commands referenced by 4 of the 5 specs are undefined** in
   `cypress/support/commands.js` (`visitIrctcEntry`, `dismissLanguageChoiceIfPresent`,
   `stopForSecurityChallenge`, `openLoginWhenAvailable`, `loginFromEnvironment`,
   `waitForPostLoginUI`, `reportCurrentIrctcState`, `searchTrains`, `selectTrainAndClass`,
   `fillPassengerForm`, `proceedToPaymentBoundary`). Until implemented, those specs
   (including the repeated-navigation pattern in `irctc-booking-flow.cy.js`) cannot run or
   be optimized against real timing data.
3. **Four unlabelled fixed waits** (`commands.js:388,418,548,550` — 500/2000/1000/5000ms)
   have unknown necessity without a live, timestamped run.
4. **Large timeout ceilings** (`defaultCommandTimeout: 120000`, plus 200000ms/180000ms
   payment waits) have not been shown to be miscalibrated; changing them without evidence
   risks false failures on a real booking/payment flow.
5. **Job-event persistence** rewrites the full `.data/jobs.json` per event (~46ms today,
   growing with file size); confirmed not to block Cypress run time, so left as a
   job-manager-side improvement for a separate task.

## Optional future improvements

- Once the owner performs a live, credentialed run via the job-manager (so `JOB_ID` is
  set), diff consecutive `progressEvents` timestamps in `.data/jobs.json` to get real stage
  timings — no new instrumentation is needed for this; the existing `cy.task('log')` call
  sites already provide adequate milestone coverage (see baseline Section 2 for the one
  caveat about the `Website Fetching completed` log line firing before navigation
  actually completes).
- If that data shows any of the four unlabelled fixed waits consistently completing well
  before real content changes, replace that specific wait with a `cy.get(...).should(...)`
  assertion on the exact condition it was guarding — one at a time, re-validated against a
  live run each time.
- Consider moving `.data/jobs.json` out of git tracking (it is currently committed and
  will keep growing) and/or batching `JobStore.save()` writes — out of scope for this
  Cypress-performance task, but relevant to overall system health.

## Final verdict

**NO_SAFE_OPTIMIZATION_FOUND** for the core "Cypress execution is slow" question — no
live timing evidence was available this session to distinguish genuine Cypress/code
overhead from IRCTC network/render latency, and the task's own rules forbid changing
timing-sensitive login/booking/payment behavior without such evidence. One small,
zero-risk, evidence-backed cleanup was applied (**IMPROVED** in isolation: duplicate
fixture load removed in `irctc-booking-flow.cy.js`), but it cannot be verified to
"improve Cypress execution" in a running suite because that file — and 3 of the other 4
specs — cannot currently execute at all due to an unrelated missing file
(`mock-boundary.js`) and 11 undefined custom commands, both pre-existing and out of scope
for this task.

## Manual validation commands

For the owner, once `mock-boundary.js` is restored:

```
# Confirm the suite loads at all (no module-resolution error):
npx cypress run --spec cypress/e2e/irctc.cy.js --headed

# Once the 11 missing commands exist, confirm the fixture-load fix specifically:
npx cypress run --spec cypress/e2e/irctc-booking-flow.cy.js --env IRCTC_RUN_AUTH_FLOW=true

# To derive real stage timings from an already-instrumented job-manager run:
#   1. Launch a booking job via the UI/job-manager as usual (sets JOB_ID).
#   2. After it completes, inspect .data/jobs.json for that job's `progressEvents` array
#      and diff consecutive `timestamp` fields.
```
