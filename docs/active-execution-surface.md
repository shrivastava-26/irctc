# Active Execution Surface

## 1. Purpose

This document maps the actual code paths that can execute in the repository today. The goal is to bound the active execution surface to the MVP-1 baseline and identify every path that could reach CAPTCHA, OTP, booking, passenger, UPI, or payment logic.

## 2. Execution map

| Execution path | Entry point | Files imported / triggered | Environment flags / config | Credentials consumed | Artifacts written | External action | In MVP-1 scope | Can reach CAPTCHA / OTP / booking / UPI / payment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cypress entry-safety test | [package.json](../package.json#L1-L28), [cypress/e2e/irctc-entry.cy.js](../cypress/e2e/irctc-entry.cy.js#L1-L24) | `cypress/support/e2e.js` loads `commands.js` only (an optional, gitignored `mock-boundary.js` is no longer imported unconditionally — see `docs/final-release-readiness.md`) | none required beyond normal Cypress settings | no login credentials required | screenshots, video, test run status | load `/nget/train-search` and classify page state | Yes | No; it stops at state validation and challenge detection |
| Guarded auth test | [cypress/e2e/irctc-login.cy.js](../cypress/e2e/irctc-login.cy.js#L1-L49) | `cypress/support/e2e.js` + `commands.js` | `CYPRESS_IRCTC_RUN_AUTH_FLOW` or `Cypress.env('IRCTC_RUN_AUTH_FLOW')` | `IRCTC_USERNAME`, `IRCTC_PASSWORD` via env or OS credential manager path | screenshots, video | login attempt only if explicitly enabled | Yes, only as guarded entry/auth validation | Can reach login challenge states, but must stop at CAPTCHA or OTP |
| Legacy booking spec | [cypress/e2e/irctc.cy.js](../cypress/e2e/irctc.cy.js#L1-L140) | `../support/configLoader`, `../support/e2e` | `USERNAME`, `PASSWORD`, `UPI_ID`, `MANUAL_CAPTCHA` | credentials used directly in spec | screenshots, video, Cypress output | full booking attempt path, including login and payment logic | No | Yes, includes CAPTCHA, UPI, booking, and payment trajectories |
| Full booking flow test | [cypress/e2e/irctc-booking-flow.cy.js](../cypress/e2e/irctc-booking-flow.cy.js#L1-L116) | `cy.fixture('booking')`, support commands, config loader | `IRCTC_RUN_AUTH_FLOW`, env credentials | login credentials and booking data | screenshots, video | auth→search→booking form→payment boundary | No | Yes, explicitly reaches payment boundary |
| Train-search test | [cypress/e2e/irctc-train-search.cy.js](../cypress/e2e/irctc-train-search.cy.js#L1-L44) | config loader, `searchTrains`, `waitForPostLoginUI` | `IRCTC_RUN_AUTH_FLOW` | login credentials | screenshots, video | auth and search stage only | No for MVP-1 | Potentially reaches CAPTCHA or challenge states but not yet validated as a safe endpoint |
| Node job manager API | [src/server/index.js](../src/server/index.js#L1-L97) | `src/models/Job.js`, `src/models/BookingRequest.js`, `src/persistence/JobStore.js`, `src/scheduler/Scheduler.js` | `PORT`, env-based credentials, `JOB_ID`, `JOB_MANAGER_PORT` in Cypress config | credentials via `CredentialManager` | `.data/jobs.json`, artifacts under `artifacts/jobs` | HTTP endpoints to create and track jobs | No for MVP-1 execution | Can trigger Cypress jobs that reach deeper flows if the invoked spec does |
| Scheduler / engine adapter | [src/scheduler/Scheduler.js](../src/scheduler/Scheduler.js#L1-L65), [src/engine/adapter.js](../src/engine/adapter.js#L1-L129) | `CredentialManager`, `spawn('npx', ['cypress', 'run', ...])` | `IRCTC_USERNAME`, `IRCTC_PASSWORD`, browser selection | runtime credentials passed to Cypress | screenshot + video artifacts copied to `artifacts/jobs/<jobId>` | Executes Cypress job with real browser | No for MVP-1 | Yes, if the selected spec includes booking or payment logic |
| Python OCR service | [irctc-captcha-solver/app-server.py](../irctc-captcha-solver/app-server.py#L1-L53), [irctc-captcha-solver/app.py](../irctc-captcha-solver/app.py#L1-L19) | EasyOCR, Flask | none beyond host/port | no direct credentials | none by default | OCR extraction of CAPTCHA image | No | Can enable CAPTCHA solving logic if invoked |
| GitHub Actions workflow | [.github/workflows/irctc.yml](../.github/workflows/irctc.yml#L1-L120) | Node setup, Python setup, Cypress run | `IRCTC_USERNAME`, `IRCTC_PASSWORD`, `UPI_ID`, `DISPLAY` | workflow secrets or inputs | screenshots, videos | runs browser automation in CI | No | Yes, it currently targets a booking automation pipeline |
| UI-triggered jobs | [ui/src/App.jsx](../ui/src/App.jsx#L1-L118), [ui/src/components/AutomationDialog.jsx](../ui/src/components/AutomationDialog.jsx#L1-L198) | `/api/jobs` POST, polling `/jobs/:id` | local storage data and selected account | credentials reference only; runtime resolves at server | job tracking UI state | starts automation jobs | No for MVP-1 | Potentially reaches deeper logic depending on job definition |

## 3. Execution paths that are inside the MVP-1 boundary

These are the only execution pathways that should remain active for MVP-1:

1. [cypress/e2e/irctc-entry.cy.js](../cypress/e2e/irctc-entry.cy.js#L1-L24)
2. [cypress/config] or any future `mvp1` directory if created, but not current legacy specs
3. A strict, env-gated auth-check path that is explicitly disabled unless `IRCTC_RUN_AUTH_FLOW=true`

These paths must do only the following:

- load the site,
- check access denial / WAF,
- handle the language modal,
- validate the visible entry state,
- detect CAPTCHA / OTP / challenge,
- capture sanitized evidence,
- stop safely.

## 4. Execution paths that must be removed from the active surface

The following are not part of the active MVP-1 surface and should be isolated or archived:

- [cypress/e2e/irctc.cy.js](../cypress/e2e/irctc.cy.js#L1-L140)
- [cypress/e2e/irctc-booking-flow.cy.js](../cypress/e2e/irctc-booking-flow.cy.js#L1-L116)
- [cypress/e2e/irctc-train-search.cy.js](../cypress/e2e/irctc-train-search.cy.js#L1-L44)
- [cypress/support/commands.js](../cypress/support/commands.js#L260-L401)
- [irctc-captcha-solver/app-server.py](../irctc-captcha-solver/app-server.py#L1-L53)
- the legacy UPI and payment path in [cypress/support/commands.js](../cypress/support/commands.js#L260-L401)

## 5. Environment flags and credentials in scope

The active MVP-1 path should use only:

- `IRCTC_RUN_AUTH_FLOW` as a strict opt-in gate
- `IRCTC_USERNAME` and `IRCTC_PASSWORD` only when a login-check is explicitly allowed
- sanitized logging and no passenger or payment values in job output

The repo currently has additional credentials-related usage in:

- [src/security/CredentialManager.js](../src/security/CredentialManager.js#L1-L41)
- [.github/workflows/irctc.yml](../.github/workflows/irctc.yml#L12-L83)
- [src/server/index.js](../src/server/index.js#L41-L68)

These are not automatically part of MVP-1 but they must remain isolated behind a security review if any deeper auth or booking flow is re-enabled.

## 6. Artifacts and external effects

The code writes the following artifacts when executed:

- screenshots and video under `cypress/screenshots` and `cypress/videos`
- JSON job results under `.data/jobs.json`
- job artifacts under `artifacts/jobs/<jobId>/`
- Python OCR model cache under `EasyOCR/` when requested by the Python service

The active MVP-1 scope must be limited to sanitized evidence capture only.

## 7. Conclusion

The active execution surface is wider than the intended MVP-1 boundary because the repository still contains legacy spec files and automation helpers that can reach billing, passenger, OTP, or booking logic. For the implementation-ready MVP-1 baseline, the executed surface should be reduced to the safe and explicitly gated entry-state validation paths and challenge detection only.
