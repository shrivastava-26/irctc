# Architecture Review

Status: VERIFIED from repository evidence.

## 1. Executive assessment

This repository is a hybrid automation system with a strong safety boundary and an older booking automation codebase still present for reference. The safe baseline is coherent and intentionally narrow. The broader architecture is functional as a prototype and job manager, but it is not yet a clean, production-grade automation architecture.

## 2. Code organization

### Current structure

- Cypress tests and support files are separated by purpose.
- Source modules are organized into engine, models, persistence, scheduler, and security.
- UI code is isolated in `ui/src`.
- Python OCR is isolated in `irctc-captcha-solver`.

### Assessment

Score: 6/10

Rationale:

- The organization is reasonable for a prototype and proof-of-concept.
- The project mixes active safe code and legacy aggressive automation without a clear boundary.
- There is no dedicated page-object layer or a strict contract between DOM selectors and state transitions.

## 3. Maintainability

Score: 5/10

Rationale:

- The code is readable and fairly well commented.
- However, the current logic includes legacy DOM assumptions and duplicated state transitions.
- There is no formal versioned contract for the IRCTC live DOM, which increases maintenance cost.

## 4. Scalability

Score: 4/10

Rationale:

- The Node job manager and file-based persistence are a good starting point.
- The architecture is not yet optimized for multiple concurrent jobs, robust retry logic, or production clustering.
- It assumes a local or desk-based execution environment rather than a resilient distributed runner.

## 5. Observability

Score: 7/10

Rationale:

- The code emits log events and state transitions.
- CI artifacts and screenshots are collected.
- The job manager stores events and updates job state.

Weaknesses:

- No structured evidence schema beyond logs and screenshots.
- No centralized retention policy.
- No explicit correlation IDs or evidence hashing.

## 6. Testability

Score: 6/10

Rationale:

- Cypress tests exist.
- There are support helpers and a fixture layer.
- The project includes a job model and a request schema.

Weaknesses:

- Many tests are tightly coupled to site DOM and behavior.
- There is no separation between environment validation and business automation logic.
- A majority of the advanced flows remain unverified against live DOM.

## 7. Security

Score: 4/10

Rationale:

- The repository avoids direct secret commit by default.
- The workflow masks some secrets.
- Credential retrieval is abstracted.

However:

- secret handling is still distributed across environment variables, OS credential stores, and logs;
- screenshots and artifacts may expose sensitive pages;
- OCR and payment flows are still present as implementation artifacts, creating risk if re-enabled accidentally.

## 8. Reliability

Score: 5/10

Rationale:

- The project is explicit about challenge gates and safe stops.
- The repository documents that CAPTCHA and OTP are hard stops.

Yet:

- DOM drift against IRCTC is a recurring risk.
- Browser fingerprinting and WAF blocking remain major reliability risks.
- The old booking logic is not valid as a reliability foundation.

## 9. CI/CD readiness

Score: 5/10

Rationale:

- GitHub Actions is configured.
- Node and Python steps are included.
- Chrome installation and virtual display setup are present.

Weaknesses:

- The workflow targets a booking scenario that is currently beyond the validated baseline.
- It runs with credentials in CI env, which is acceptable for a controlled environment but not a hardened production path.
- The repository does not yet define a pipeline for safe entry-only validation as a first gate.

## 10. Area-by-area summary

| Area | Score | Rationale |
| --- | --- | --- |
| Code organization | 6 | Reasonable structure but mixed active/legacy logic |
| Maintainability | 5 | Readable but brittle selectors and mixed scope |
| Scalability | 4 | Prototype-level orchestration, not hardened for scale |
| Observability | 7 | Log stream and artifacts are present |
| Testability | 6 | Real browser tests exist, but most advanced flow is unverified |
| Security | 4 | Secret and artifact controls are insufficiently hardened |
| Reliability | 5 | Safe boundaries exist, but site drift and WAF remain high risk |
| CI/CD readiness | 5 | Workflow exists, but not aligned to current safe baseline |

## 11. Final architecture finding

The current architecture is best understood as a safe, evidence-based diagnostic control plane with an untrusted legacy booking layer still present in the same repository. This is acceptable for a transition period, but it is not a clean long-term architecture.

The next architectural step is not to add more features; it is to isolate the safe baseline and define a stricter contract between state validation, challenge detection, and future automation layers.
