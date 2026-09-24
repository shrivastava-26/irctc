# Target Architecture

Status: RECOMMENDATION only. This is a structural target for future development after the current evidence-first baseline is locked down.

## 1. Recommended final structure

```text
project/
├── cypress/
│   ├── e2e/
│   │   ├── smoke/
│   │   │   └── entry-validation.cy.js
│   │   ├── auth/
│   │   │   └── login-guarded.cy.js
│   │   ├── search/
│   │   │   └── search-validation.cy.js
│   │   └── legacy/
│   │       └── archive-not-executable/
│   ├── fixtures/
│   │   ├── bookings/
│   │   ├── selectors/
│   │   └── evidence/
│   ├── pages/
│   │   ├── EntryPage.js
│   │   ├── LoginPage.js
│   │   ├── SearchPage.js
│   │   └── ResultsPage.js
│   ├── support/
│   │   ├── commands/
│   │   ├── assertions/
│   │   ├── environment.js
│   │   └── evidence.js
│   └── config/
│       ├── cypress.config.js
│       └── env.example.json
├── pages/
│   ├── contracts/
│   └── selectors/
├── support/
│   ├── security/
│   ├── state/
│   └── evidence/
├── fixtures/
│   ├── sample-jobs/
│   └── test-data/
├── evidence/
│   ├── screenshots/
│   ├── videos/
│   └── reports/
├── python/
│   └── captcha/
│       ├── __init__.py
│       ├── server.py
│       └── extractors/
├── reports/
│   ├── summary/
│   └── state-traces/
├── docs/
│   └── architecture/
├── config/
│   ├── app.env.example
│   ├── ci.env.example
│   └── secrets.md
└── README.md
```

## 2. Why this architecture is recommended

### Separation of concerns

- Tests are separated from domain logic.
- Page objects define the DOM contract.
- Support modules handle evidence, state checks, and environment configuration.
- Legacy automation is archived and explicitly not executable.

### Clear state boundaries

- Entry validation is isolated from auth.
- Auth is isolated from search and booking stages.
- Search is isolated from passenger and payment phases.
- A challenge boundary is represented as a first-class stop state.

### Safer security posture

- Secrets are not mixed with application code.
- Artifact handling is centralized.
- A dedicated evidence layer makes retention and review easier.

## 3. Proposed migration plan

### Phase 1: freeze and isolate legacy code

- Move old booking automation out of active execution paths.
- Mark legacy files as reference-only.
- Preserve the current safe baseline as the only active flow.

### Phase 2: define explicit page contracts

- Create a page object or selector contract per UI state.
- Replace brittle selectors with stable, visible-text and label-based assertions.
- Document validation status per selector.

### Phase 3: formalize state machine

- Represent each visible state in a single state model.
- Convert `JOB_CREATED`, `LOGIN`, `SEARCH`, and `PAYMENT` flows into a formal state machine with entry and exit conditions.

### Phase 4: centralize evidence capture

- Store screenshots and logs under a dedicated evidence tree.
- Add an evidence manifest with timestamps, state names, and route context.

### Phase 5: guard security boundaries

- Implement explicit mandatory stop points at CAPTCHA, OTP, and payment.
- Require a review gate before any feature crosses a security boundary.

## 4. Architectural principles

1. Evidence before automation.
2. Stop at security boundaries.
3. No hidden automation beyond the verified contract.
4. Live DOM validation before selector adoption.
5. Legacy code is archived, not active.

## 5. Final recommendation

The target architecture should not be a fully end-to-end booking system immediately. It should be a clear, evidence-driven control architecture with explicit state boundaries and a safe baseline that is proven before every new automation capability is introduced.
