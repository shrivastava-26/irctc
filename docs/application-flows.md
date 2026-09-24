# Application Flows

Status: VERIFIED for observed site behavior; PARTIAL for later booking phases.

## 1. Entry Flow

### Purpose

Establish routability to the IRCTC search page and assert the entry UI state without assuming auth or booking completion.

```mermaid
flowchart TD
  A[Start] --> B[Visit https://www.irctc.co.in/nget/train-search]
  B --> C{Access denied / WAF?}
  C -->|Yes| D[Record access denied evidence]
  C -->|No| E{Language modal present?}
  E -->|Yes| F[Select English or dismiss modal]
  E -->|No| G[Check visible app state]
  F --> G
  G --> H{LOGIN / REGISTER or BOOK TICKET visible?}
  H -->|Yes| I[Entry validation passed]
  H -->|No| J[Stop and record DOM evidence]
```

### Evidence

- README and Cypress specs use `/nget/train-search` as the only validated route.
- Language modal and button text are specifically referenced in README and logs.

## 2. Language Selection Flow

### Purpose

Handle the welcome-language choice before continuing to login or booking state.

```mermaid
flowchart TD
  A[Open page] --> B{Language modal visible?}
  B -->|No| C[Proceed to app state validation]
  B -->|Yes| D[Detect English or Hindi button]
  D --> E[Click preferred language]
  E --> F[Hide modal and continue]
```

### Evidence

- README confirms `Hindi` and `English` buttons are visible.
- `cypress/e2e/irctc-entry.cy.js` calls `cy.dismissLanguageChoiceIfPresent()`.

Status: VERIFIED.

## 3. Authentication Flow

### Purpose

Provide a guarded login path only when environment credentials are supplied and auth is explicitly enabled.

```mermaid
flowchart TD
  A[Entry validated] --> B{IRCTC_RUN_AUTH_FLOW=true?}
  B -->|No| C[Stop, do not execute auth]
  B -->|Yes| D[Open login if trigger visible]
  D --> E[Read IRCTC_USERNAME / IRCTC_PASSWORD]
  E --> F{CAPTCHA or OTP challenge?}
  F -->|Yes| G[Stop for security challenge]
  F -->|No| H[Submit login]
  H --> I{Authenticated landing state?}
  I -->|Yes| J[Proceed to search validation]
  I -->|No| K[Log failure evidence]
```

### Evidence

- README: “Authentication flow disabled by default.”
- `irctc-login.cy.js` includes guard logic.
- `CredentialManager.js` uses env variables first.

Status: PARTIAL for live validation; VERIFIED for code presence.

## 4. Search Flow

### Purpose

Populate the train search form and validate the search UI state after auth is established.

```mermaid
flowchart TD
  A[Authenticated landing] --> B[Open search form]
  B --> C[Set source station]
  C --> D[Set destination station]
  D --> E[Set journey date]
  E --> F[Set class]
  F --> G[Set quota]
  G --> H[Click Search]
  H --> I{Results or no-train state?}
  I -->|Results| J[Parse result list]
  I -->|No results| K[Capture evidence, stop]
```

### Evidence

- `commands.js` contains `doPostLoginFlow` with source, destination, date, quota, and search automation.
- Yet the repository explicitly says downstream search DOM is not yet verified in the current live environment.

Status: PARTIAL.

## 5. Error Flow

### Purpose

Recognize access-denied, login failure, and missing-state conditions without assuming progress.

```mermaid
flowchart TD
  A[Any stage] --> B{Page blocks access?}
  B -->|Yes| C[Access denied / WAF path]
  B -->|No| D{Required selector visible?}
  D -->|No| E[State not reached, capture DOM]
  D -->|Yes| F[Continue]
  E --> G[Stop with evidence]
```

### Evidence

- README clearly separates access-denied/WAF from selector failure.
- Logs in `.data/jobs.json` show a failed run after language modal dismissal and login wait, with no validated auth state.

Status: VERIFIED.

## 6. Access Denied Flow

### Purpose

Detect and classify IRCTC blocks before any deeper automation.

```mermaid
flowchart TD
  A[Load site] --> B[Scan body text and response metadata]
  B --> C{Access denied or WAF signature found?}
  C -->|Yes| D[Stop execution]
  C -->|No| E[Continue state validation]
```

### Evidence

- README explicitly notes access-denied/WAF detection.
- Cypress config includes browser launch tweaks to reduce fingerprinting and blocking.

Status: VERIFIED.

## 7. CAPTCHA Detection Flow

### Purpose

Prevent automation when a CAPTCHA challenge is present.

```mermaid
flowchart TD
  A[Login or review step] --> B{Captcha element present?}
  B -->|Yes| C[Stop for CAPTCHA]
  B -->|No| D[Proceed to next step]
```

### Evidence

- `README.md` states: “Makes CAPTCHA handling conditional and stops rather than attempting to solve or bypass it.”
- `commands.js` contains `submitCaptcha` and `solveCaptcha` helper logic, but the repository’s active path intentionally does not execute them as a live production flow.

Status: VERIFIED for stop-policy; PARTIAL for solver implementation.

## 8. Recovery Flow

### Purpose

When a state fails, capture evidence and restart from a safe boundary.

```mermaid
flowchart TD
  A[Failure detected] --> B[Capture DOM + screenshot]
  B --> C[Check page state]
  C --> D{Blocked by access denied?}
  D -->|Yes| E[Stop and report]
  D -->|No| F{Need language modal reset?}
  F -->|Yes| G[Retry page entry]
  F -->|No| H[Return to safe checkpoint]
```

### Evidence

- Screenshot capture is configured in `cypress.config.js`.
- Job artifacts in `artifacts/jobs` are created to capture results.

Status: PARTIAL.

## 9. Diagnostics Flow

### Purpose

Expose state and request details for forensic investigation.

```mermaid
sequenceDiagram
  participant Cypress
  participant JobMgr
  participant ArtifactStore

  Cypress->>Cypress: log current text / challenge state
  Cypress->>JobMgr: POST event payload
  JobMgr->>ArtifactStore: persist screenshots/videos/result
  JobMgr-->>Cypress: state update acknowledgment
```

### Evidence

- `cypress.config.js` uses a `task('log')` handler to emit job events.
- `src/server/index.js` receives `/jobs/:id/events` and stores aggregated logs.

Status: VERIFIED.

## 10. Architectural interpretation

The codebase currently represents a conservative flow model:

- entry validation,
- language handling,
- auth gating,
- challenge detection,
- stop-and-evidence logic.

This is a proper control boundary for a site that actively blocks automation and requires human intervention on security gates.
