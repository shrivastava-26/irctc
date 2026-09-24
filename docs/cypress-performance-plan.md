# Cypress Performance Optimization Plan

Date: 2026-09-24
Based on: `docs/cypress-performance-baseline.md`

Each item lists evidence, measured/estimated duration, root cause, exact files, the
smallest possible fix, expected improvement, regression risk, validation method, and a
classification. Only `REQUIRED` items are implemented in this pass.

---

### Item 1 — Duplicate fixture load in `irctc-booking-flow.cy.js`

- **Evidence**: `cypress/e2e/irctc-booking-flow.cy.js:20-27` loads `cy.fixture('booking')`
  inside `beforeEach`, re-reading the same static file before each of the file's 4 tests.
  `irctc-train-search.cy.js:12-19` already does this correctly (once, in `before`).
- **Current measured duration**: fixture reads are small local JSON files; the cost is a
  few milliseconds per extra read (Cypress fixture reads are disk I/O + JSON.parse of a
  small file), ×3 unnecessary re-reads per run of this file.
- **Root cause**: fixture load was placed in `beforeEach` instead of `before`.
- **Exact files affected**: `cypress/e2e/irctc-booking-flow.cy.js`.
- **Smallest possible fix**: move the `cy.fixture('booking').then(...)` call from
  `beforeEach` into the existing `before` hook; keep the skip-guard in `beforeEach` as is
  (it must still run per-test so `this.skip()` applies to each test individually).
- **Expected improvement**: eliminates 3 of 4 redundant fixture reads per run of this
  spec; small but real and zero-cost to verify.
- **Regression risk**: none — `booking` is read-only across all 4 tests (confirmed by
  reading the full file; no test mutates the object), so loading it once instead of 4
  times is behaviorally identical.
- **Validation method**: confirm `booking` fixture content is identical in every test
  (unchanged), confirm the skip guard still fires per-test when
  `IRCTC_RUN_AUTH_FLOW !== true`.
- **Classification: REQUIRED** — implemented.

---

### Item 2 — Unlabelled fixed `cy.wait()` calls (500ms, 2000ms, 1000ms, 5000ms)

- **Evidence**: `commands.js:388` (500ms), `commands.js:418` (2000ms),
  `commands.js:548` (1000ms), `commands.js:550` (5000ms) — see baseline Section 3.
- **Current measured duration**: not measured (no live run performed this session).
- **Root cause**: unknown whether these are padding against IRCTC/Angular render latency
  or leftover arbitrary waits from the upstream `shivamguys` template. Cannot be
  distinguished without a live, timestamped run.
- **Exact files affected**: `cypress/support/commands.js`.
- **Smallest possible fix**: N/A until live evidence exists. If a live run shows the DOM
  condition being waited for is already true well before the wait elapses, the smallest
  fix would be replacing the specific `cy.wait(n)` with a `cy.get(...).should(...)`
  assertion on the exact condition each wait is protecting, one at a time.
- **Expected improvement**: unknown until measured; upper bound is 8.5 seconds per
  successful login+train-select pass if all four are found to be unnecessary padding.
- **Regression risk**: high without evidence — this is live login/booking timing against a
  WAF-sensitive production site; removing a wait that happens to be masking a real
  Angular re-render delay would break login or train selection intermittently.
- **Validation method**: the project owner's own live run (per their stated decision) with
  the existing `cy.task('log')` timestamps in `.data/jobs.json` diffed around each of
  these four call sites.
- **Classification: EXTERNAL_SITE_DELAY / NOT_RECOMMENDED without live evidence** —
  not implemented. Documented for the owner to revisit after a live-timed run.

---

### Item 3 — Explicit human/business-logic waits (30000ms ×2)

- **Evidence**: `commands.js:505` (manual-CAPTCHA human entry wait),
  `commands.js:579` (Tatkal-not-open poll wait).
- **Root cause**: intentional — one waits for a human to type a CAPTCHA, the other polls
  until the Tatkal booking window opens.
- **Classification: NOT_RECOMMENDED** — these are business logic, not overhead; changing
  them changes booking/Tatkal timing behavior, which the task explicitly preserves.
  Not implemented.

---

### Item 4 — `defaultCommandTimeout: 120000` / other large ceilings

- **Evidence**: `cypress.config.js:6-9`; `cy.wait('@payment', { timeout: 200000 })`
  (`commands.js:330`); `cy.get('body', { timeout: 180000 })` (`commands.js:351`).
- **Current measured duration**: these are ceilings, not fixed costs — on the success path
  they add ~0ms. No live evidence exists on how often the ceiling is actually approached.
- **Root cause**: configured generously, likely to tolerate IRCTC's variable response time
  and the multi-minute UPI approval window; not demonstrated to be miscalibrated.
- **Regression risk**: lowering any of these risks a false failure on a slow-but-successful
  real IRCTC/payment response, which is far worse for a booking automation than a slow
  passing run.
- **Classification: NOT_RECOMMENDED without live evidence** — not implemented. If the
  owner's live run shows selectors consistently resolve in, say, under 5s, a future pass
  could lower `defaultCommandTimeout` specifically (not the payment/UPI ceilings, which
  bound genuine multi-minute external waits, not selector lookups).

---

### Item 5 — Job-event persistence cost (~46ms/event, job-manager server side)

- **Evidence**: benchmarked in baseline Section 5 — `JobStore.save()` does a full
  `JSON.parse`/`JSON.stringify`/`fs.writeFileSync` of the entire `.data/jobs.json` (1.46MB,
  53 jobs today) on every single `POST /jobs/:id/events` call, of which a run can trigger
  ~80–100.
- **Root cause**: `src/persistence/JobStore.js` has no batching or incremental-append
  strategy; every event rewrites the whole file.
- **Exact files affected**: `src/persistence/JobStore.js`, `src/server/index.js`.
- **Why not fixed here**: confirmed in the baseline that `postJobEvent` in
  `cypress.config.js` is fire-and-forget and the `log` task does not await it — this cost
  does **not** add to Cypress's measured run duration. It is real job-manager-server
  overhead that grows with job history size, but it is not a "Cypress execution is slow"
  cause, and it only exists on job-manager-launched runs (not CI, not plain `npm test`).
  Fixing it would mean changing `JobStore`'s internal persistence strategy, which sits
  squarely inside "job-manager contracts" the task says to preserve, for a problem that
  isn't the one being solved (Cypress execution time).
- **Classification: OPTIONAL** (future improvement, out of this task's scope) — not
  implemented. Documented for awareness since `.data/jobs.json` is also tracked in git and
  will keep growing.

---

### Item 6 — Repeated login/entry/search re-execution across `irctc-booking-flow.cy.js`

- **Evidence**: baseline Section 6 — Steps 2–4 each redo entry/session-check/search/select
  from scratch instead of continuing from the prior test's state.
- **Root cause**: test design choice (each `it()` is written to be independently
  resumable), acknowledged in the file's own comments.
- **Why not fixed here**: this file cannot execute at all right now (11 undefined custom
  commands — baseline Section 1), so there is nothing to measure or safely change. Any fix
  here is also a bigger structural change (carrying state across tests, e.g. via
  `cy.session()`) than "smallest possible fix," and the task explicitly gates
  `cy.session()` use on it "preserving the current authentication behavior," which cannot
  be verified without the commands existing and a live run.
- **Classification: NOT_RECOMMENDED for this pass** — blocked on unrelated missing
  commands, which are out of scope to implement here. Documented for whoever implements
  those commands next.

---

### Item 7 — Uncapped recursive retries (`performLogin`, `solveAndRetryLogin`,
### `solveCaptcha`, Tatkal poll)

- **Evidence**: baseline Section 6.
- **Root cause**: retry-by-recursion with no iteration cap.
- **Why not fixed here**: this is a robustness/correctness property (risk of an infinite
  loop on a persistently wrong condition), not a proven timing bottleneck — each pass only
  costs time when it actually re-executes, which is exactly the intended "keep retrying"
  behavior. Adding a cap changes observable behavior (a booking that currently would keep
  retrying might now give up early) — explicitly out of scope ("if a proposed optimization
  changes observable behavior, do not implement it").
- **Classification: NOT_RECOMMENDED** — not implemented.

---

### Item 8 — UI polling intervals (1s / 5s)

- **Evidence**: `ui/src/components/AutomationDialog.jsx:52`,
  `ui/src/components/JobHistory.jsx:27`.
- **Root cause**: fixed-interval polling, not related to Cypress execution time.
- **Why not fixed here**: changing polling cadence changes UI-observable behavior (update
  latency), which the task explicitly preserves ("Do not change UI behavior"). It also has
  no effect on Cypress run duration.
- **Classification: NOT_RECOMMENDED** — not implemented.

---

### Item 9 — Video always on / screenshots

- **Evidence**: `cypress.config.js:10-11`.
- **Root cause**: deliberate configuration for evidence/audit trail of a booking
  automation tool.
- **Why not fixed here**: task explicitly requires preserving "all required screenshots,
  videos, and artifacts"; no evidence was gathered (or sought) that video/screenshots are
  unused, and disabling them changes existing guarantees for a financial/booking tool.
- **Classification: NOT_RECOMMENDED** — not implemented.

---

### Item 10 — Missing `cypress/support/mock-boundary.js` / undefined custom commands

- **Evidence**: baseline Sections 0 and 1.
- **Why not fixed here**: not a performance issue — it's a correctness/test-execution
  blocker, and the task explicitly says "do not fix unrelated test failures." Restoring
  the gitignored local file or implementing 11 missing commands is a feature/bugfix task,
  not a minimal-diff performance change, and guessing at their intended implementation
  risks introducing incorrect business logic into a real booking/payment flow.
- **Classification: NOT_RECOMMENDED for this task** — reported to the owner as a
  correctness blocker they should address separately, since it also currently breaks CI
  on every run.

---

## Summary table

| # | Item | Classification | Implemented |
|---|---|---|---|
| 1 | Duplicate fixture load in `irctc-booking-flow.cy.js` | REQUIRED | Yes |
| 2 | Unlabelled fixed waits (500/2000/1000/5000ms) | EXTERNAL_SITE_DELAY / NOT_RECOMMENDED | No |
| 3 | Explicit human/Tatkal 30s waits | NOT_RECOMMENDED | No |
| 4 | Large timeout ceilings (120000/200000/180000ms) | NOT_RECOMMENDED (no evidence) | No |
| 5 | Job-event persistence cost (~46ms/event) | OPTIONAL (out of scope — job-manager, not Cypress) | No |
| 6 | Repeated login/search across booking-flow tests | NOT_RECOMMENDED (blocked on unrelated bug) | No |
| 7 | Uncapped recursive retries | NOT_RECOMMENDED | No |
| 8 | UI polling intervals | NOT_RECOMMENDED | No |
| 9 | Always-on video/screenshots | NOT_RECOMMENDED | No |
| 10 | Missing mock-boundary.js / undefined commands | NOT_RECOMMENDED (unrelated, report only) | No |
