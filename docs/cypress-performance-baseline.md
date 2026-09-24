# Cypress Performance Baseline

Date: 2026-09-24
Scope: `cypress/`, `cypress.config.js`, `package.json`, `src/engine`, `src/scheduler`,
`src/server`, `src/persistence`, `ui/src/components/{AutomationDialog,JobHistory}.jsx`,
`irctc-captcha-solver/`, `.github/workflows/irctc.yml`.

This document records what was actually found and measured before any code was changed,
per the "evidence before changes" requirement. It does not propose fixes — see
`docs/cypress-performance-plan.md` for that.

## 0. Blocking issue found (not a performance item, but gates everything below)

`cypress/support/e2e.js` (Cypress's global support file, auto-loaded before every spec)
contains:

```js
import './commands';
import './mock-boundary';
```

`cypress/support/mock-boundary.js` does not exist anywhere in the repository or git
history. It is listed in `.gitignore` (`# Local mock/test artifacts` section,
`cypress/support/mock-boundary.js`), so it is meant to be a local, never-committed file —
it is simply absent from this checkout. The import was added in the most recent commit
(`d410579 "next phase"`).

**Effect**: every spec under `cypress/e2e/` fails at module-resolution time before any
`before`/`beforeEach`/test body runs — including in CI. `.github/workflows/irctc.yml`
runs `npx cypress run --spec cypress/e2e/irctc.cy.js` on every push to `main` and on every
PR, and does not create `mock-boundary.js` anywhere in the workflow, so **CI has been
failing on every run since commit `d410579`**, independent of anything else in this
report. This was confirmed by reading `cypress/support/e2e.js`, `git log --all -- cypress/support/mock-boundary.js`
(no results), `.gitignore` line 67, and the full CI workflow file.

This is out of scope for this performance task per the instructions ("do not fix
unrelated test failures"), but it is reported here because it directly affects whether
any of the timing evidence below can be reproduced by running the suite, and because the
project owner needs to know before relying on CI or attempting their own live-timing run.

## 1. Only one spec is currently executable at all

Separately from the above: `cypress/support/commands.js` defines exactly four custom
commands via `Cypress.Commands.add`: `submitCaptcha`, `solveCaptcha`,
`bookUntilTatkalGetsOpen`, `doPostLoginFlow`. The specs `irctc-entry.cy.js`,
`irctc-login.cy.js`, `irctc-train-search.cy.js`, and `irctc-booking-flow.cy.js` call
eleven commands that are not defined anywhere in the codebase: `visitIrctcEntry`,
`dismissLanguageChoiceIfPresent`, `stopForSecurityChallenge`, `openLoginWhenAvailable`,
`loginFromEnvironment`, `waitForPostLoginUI`, `reportCurrentIrctcState`, `searchTrains`,
`selectTrainAndClass`, `fillPassengerForm`, `proceedToPaymentBoundary`. Confirmed via
`grep -n "Cypress.Commands.add" cypress/support/commands.js` (4 matches) against every
`cy.<command>(` call site across `cypress/e2e/*.cy.js`.

`docs/current-state-assessment.md` and `docs/active-execution-surface.md` describe these
commands as present/verified — those documents describe an intended or prior state, not
the code currently on disk.

Only `cypress/e2e/irctc.cy.js` is self-contained and runnable (after the item-0 import is
worked around), and it is the only spec CI and `src/engine/adapter.js:94` actually invoke
(`--spec cypress/e2e/irctc.cy.js`). **All timing evidence about a live run in this report
is therefore scoped to `irctc.cy.js` + `commands.js` — the other four specs cannot execute
at all right now, independent of performance.**

## 2. Live-timing measurement was not performed in this session

`irctc.cy.js` performs a real login against production IRCTC
(`win.location.href = 'https://www.irctc.co.in/nget/train-search'`, then fills
`Cypress.env('USERNAME')`/`PASSWORD` into the live login form). No `.env` or
`cypress.env.json` exists in this checkout, so those are currently unset. The project
owner decided that any live run against IRCTC — even one that only fails at credential
entry — should be performed by them directly with real credentials, not triggered from
this session, given the code's own comments about avoiding IRCTC WAF fingerprinting
(`cypress.config.js:78-79`: "so IRCTC WAF doesn't fingerprint and block the browser").

Consequently, all IRCTC-side timings below (page load, WAF/network latency, per-step
render time, CAPTCHA OCR round-trip against a live CAPTCHA image, payment gateway
callback latency) are **not measured** and are marked `EXTERNAL_SITE_DELAY / NOT MEASURED`
in the plan document. Everything that could be measured locally, without touching IRCTC or
requiring credentials, was measured directly (Section 5).

The existing instrumentation already provides what's needed for the owner to fill this
gap without any code changes: every `cy.task('log', …)` call in `commands.js`/`irctc.cy.js`
that fires while `JOB_ID` is set (i.e. runs launched via the UI/job-manager, not raw
`npx cypress run`) is posted to `POST /jobs/:id/events` (`cypress.config.js:24-76`) and
stored with a server-side ISO timestamp (`src/server/index.js:73-76`,
`jobData.progressEvents.push({...event, timestamp: new Date().toISOString()})`). After one
job-manager-launched run, `.data/jobs.json` already contains a timestamped log of every
named milestone (`Navigating to IRCTC portal...`, `Dismissing language modal...`,
`[LOGIN] No CAPTCHA detected...`, `Search submitted...`, `Found train ...`, `TATKAL TIME
STARTED...`, `[PAYMENT] ...`, etc.) — sufficient to derive stage timings by diffing
consecutive event timestamps. One caveat: the log line `Website Fetching completed.........`
(`irctc.cy.js:79`) fires immediately after issuing `win.location.href = ...`, which does not
wait for navigation — that line's timestamp is not a real "page loaded" marker; the first
reliable post-navigation marker is whichever log line follows the first `cy.get('body', {
timeout: 30000 })` resolution at `irctc.cy.js:88`.

## 3. Fixed `cy.wait(<ms>)` calls (evidence, `commands.js` only — none in any spec file)

| Location | Wait | Context |
|---|---|---|
| `commands.js:388` | 500ms | First line of `performLogin()`, before reading body text to branch on login-panel state. Runs on every call/recursion of `performLogin`. |
| `commands.js:418` | 2000ms | After clicking "Sign In" (no-CAPTCHA path), before re-reading body to check login result. |
| `commands.js:505` | 30000ms | `solveCaptcha()`, `MANUAL_CAPTCHA` branch: `'[CAPTCHA2] Manual mode — waiting 30s for human entry.'` — explicit, documented human-interaction wait. |
| `commands.js:548` | 1000ms | In `BOOK_UNTIL_TATKAL_OPENS`, immediately after `scrollIntoView` on the train row. |
| `commands.js:550` | 5000ms | Immediately after clicking the train row's "Refresh" control (fare/availability refresh). |
| `commands.js:579` | 30000ms | Tatkal not-yet-open branch: `'[TATKAL] Not open yet — waiting 30s and reloading.'`, then `cy.reload()` and a recursive re-search — explicit, documented Tatkal-timing poll. |

Two of the six (30000ms manual-CAPTCHA wait, 30000ms Tatkal-poll wait) are explicitly
documented, intentional business-logic waits, not incidental overhead. The other four
(500ms, 2000ms, 1000ms, 5000ms) are unlabelled settle waits around live IRCTC page
reactions; whether they are longer than IRCTC's real render/response time cannot be
determined without a live, timestamped run (see Section 2) — replacing any of them with a
deterministic assertion changes the login/booking timing behavior on a real booking
automation and is exactly the kind of change the task says not to make on assumption.

## 4. Command/page timeouts

Global config (`cypress.config.js:6-9`): `defaultCommandTimeout: 120000` (Cypress default
is 4000ms), `pageLoadTimeout: 90000` (default 60000ms), `responseTimeout: 60000` (default
30000ms), `requestTimeout: 60000` (default 5000ms). Any `cy.get(...)` without an explicit
`{ timeout }` override inherits the 120000ms ceiling.

48 explicit per-command `{ timeout: … }` overrides exist across `irctc.cy.js` (8) and
`commands.js` (37), plus 3 in the non-runnable specs. Two outliers:
`cy.wait('@payment', { timeout: 200000 })` (`commands.js:330`, payment gateway intercept)
and `cy.get('body', { timeout: 180000 })` (`commands.js:351`, payment-outcome poll — the
adjacent comment says "2 minutes" but the value is 180000ms/3 minutes, a
comment/code mismatch, not a bug).

These are ceilings, not fixed costs: on the success path (element found immediately) they
cost ~0ms; they only matter when a selector is genuinely slow or absent, in which case
`docs/selector-audit.md`'s FRAGILE/HIGH-RISK selectors (e.g. `.ui-autocomplete-panel li`,
`.ui-dropdown-item`, `:nth-child(...)`) could stall for up to 120s before failing. No live
run was performed, so there is no measured evidence of how often this ceiling is actually
hit in practice.

## 5. Local, IRCTC-independent benchmark: job-event persistence cost

`cypress.config.js`'s `cy.task('log', …)` handler posts to `POST /jobs/:id/events`
whenever `JOB_ID` is set (only true for job-manager-launched runs, not plain
`npx cypress run` or CI). `src/server/index.js:66-85` handles that route by loading the
full job list, appending one event, and rewriting the full file:
`JobStore.save()` → `readAll()` (`JSON.parse` of the whole file) → `writeAll()`
(`JSON.stringify` + `fs.writeFileSync` of the whole array) — `src/persistence/JobStore.js:16-41`.
This runs synchronously on the job-manager's Node process for every single event.

Benchmarked directly against a copy of the real `.data/jobs.json` (not the live file) in
an isolated scratch directory:

```
jobs count: 53
file size: 1464 KB
JSON.parse:      26.4 ms
JSON.stringify:   11.4 ms
fs.writeFileSync:  8.1 ms
total per save(): 45.9 ms
```

Per spec count, `irctc.cy.js` alone contains 7 `cy.task('log', …)` call sites, and
`commands.js` contains roughly 40 more across `submitCaptcha`/`solveCaptcha`/
`doPostLoginFlow` (all of which `irctc.cy.js` invokes) — each can post up to 2 events (a
`LOG` event and, when a state-keyword matches, a `STATE_CHANGED` event,
`cypress.config.js:50-73`). That is on the order of 40–50 `cy.task('log')` calls per
successful run, i.e. up to ~80–100 `POST /jobs/:id/events` calls, each paying the ~46ms
measured above **on the job-manager server**, growing linearly with `.data/jobs.json`'s
size (already 1.46MB/53 jobs, and the file is tracked in git —
`git ls-files .data/` confirms `.data/jobs.json` is committed, not gitignored).

Important qualifier: `postJobEvent` in `cypress.config.js:24-40` builds the HTTP request
and calls `req.write()`/`req.end()` without waiting for or handling the response, and the
`log` task handler returns `null` synchronously without awaiting `postJobEvent`
(`cypress.config.js:74`). **This means the ~46ms-per-event cost does not block Cypress's
own command queue or add to the measured Cypress run duration.** It is real cost, but it
is job-manager-server overhead, not Cypress-execution overhead, and it only occurs on
job-manager-launched runs (never in CI, never in plain `npm test`).

## 6. Other evidence gathered (static, no live run needed)

- **Repeated fixture loading**: `cypress/e2e/irctc-booking-flow.cy.js:20-27` loads
  `cy.fixture('booking')` inside `beforeEach`, so it is read from disk once per `it()` in
  that file (4 times for 4 tests) even though the fixture content never changes within a
  run. By contrast `irctc-train-search.cy.js:12-19` already loads it once in `before`.
  Neither `booking` variable is ever mutated by a test body (only read via
  `cy.searchTrains(booking)`, `cy.selectTrainAndClass(booking)`,
  `cy.fillPassengerForm(booking)`), confirmed by reading the full file.
- **Repeated navigation/setup across `irctc-booking-flow.cy.js`'s 4 tests**: each of Steps
  2–4 re-runs `cy.visitIrctcEntry()` + `cy.stopForSecurityChallenge()` +
  `cy.waitForPostLoginUI()` from scratch (lines 48-50, 63-65, 85-87), and Steps 3–4
  additionally redo `cy.searchTrains(booking)` + `cy.selectTrainAndClass(booking)` to get
  back to a state a prior test already reached (comments at lines 47, 67 acknowledge this:
  "Re-visit to use the persisted session," "Redo search to get back to the results page").
  This file cannot currently run at all (Section 1), so this pattern has no measurable
  cost today, but it is the file's designed structure.
- **Uncapped recursive retries**: `performLogin()` (`commands.js:386-461`),
  `solveAndRetryLogin()` (`commands.js:467-497`), `solveCaptcha()`
  (`commands.js:502-541`), and the Tatkal-not-open branch of `BOOK_UNTIL_TATKAL_OPENS`
  (`commands.js:568-592`) all retry via direct recursive function calls with no attempt
  cap. This is a correctness/robustness property, not a fixed time cost by itself; each
  recursive pass re-pays whatever fixed waits are inside it (e.g. `performLogin`'s 500ms +
  2000ms per pass).
- **UI polling** (not Cypress, but requested for measurement): `ui/src/components/AutomationDialog.jsx:52`
  polls `GET /jobs/:id` once per second per active job while the dialog is open
  (`setInterval(fetchJobs, 1000)`, fanned out via `Promise.all` over active job IDs).
  `ui/src/components/JobHistory.jsx:27` separately polls the full job list every 5 seconds
  for the component's lifetime. Both hit the same job-manager Express process that also
  absorbs the event-persistence cost from Section 5 during a run.
- **Video/screenshots**: `video: true` and `screenshotOnRunFailure: true` are always on
  (`cypress.config.js:10-11`). `irctc.cy.js` (the only runnable spec) has zero explicit
  `cy.screenshot()` calls; the four non-runnable specs together have 7.
- **Chrome launch**: `cypress.config.js:80-92` strips `--headless` (headed Chrome is
  required — "the primary fix for ESOCKETTIMEDOUT in headless CI," also stated in
  `.github/workflows/irctc.yml:71` "the only browser that bypasses IRCTC WAF") and adds
  `--disable-blink-features=AutomationControlled`, `--no-sandbox`,
  `--disable-web-security`, fixed window size/maximize flags. Headed Chrome has an
  inherently higher launch cost than headless, but this was a deliberate, documented
  tradeoff to avoid WAF blocking, not incidental overhead.
- **Python CAPTCHA-solver startup**: correctly implemented as polling, not a fixed sleep,
  in both `package.json:8` (`wait-on http://localhost:5000/health`) and
  `.github/workflows/irctc.yml:96-98` (`until curl -sf .../health; do sleep 2; done`,
  60s cap). The real cost is EasyOCR's model load inside `app-server.py`, which the
  `/health` route can't answer until it completes; CI pre-warms this in a separate step
  (`.github/workflows/irctc.yml:46-47`). This is a one-time per-process-lifetime cost, not
  a per-test cost.

## 7. Summary of what this baseline does and does not establish

**Established by direct evidence (safe to act on):**
- The `mock-boundary.js` import breaks every spec, including CI, right now (Section 0).
- Only `irctc.cy.js` can execute; the other four specs call undefined commands (Section 1).
- `irctc-booking-flow.cy.js` reloads an unchanging fixture on every test unnecessarily,
  and this is a zero-behavior-change fix (Section 6).
- Job-event persistence costs ~46ms/event server-side today and grows with job history
  size, but does not block Cypress's measured run time because it's fire-and-forget
  (Section 5).

**Not established (would require a live run the owner will perform separately):**
- Whether any of the four unlabelled fixed waits (500ms/2000ms/1000ms/5000ms) exceed
  IRCTC's actual render/response time, and by how much.
- How often the 120000ms default timeout or the 200000ms/180000ms payment timeouts are
  actually approached versus resolving near-instantly.
- Real end-to-end wall-clock time for a full run, and the split between Cypress overhead,
  IRCTC network delay, and evidence-capture overhead.

The plan document classifies each candidate change accordingly.
