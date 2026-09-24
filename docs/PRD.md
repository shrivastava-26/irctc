# Product Requirements Document

## 1. Executive Summary

This project is an IRCTC automation framework designed to operate under strict evidence-first principles. It focuses on safe validation and evidence capture before any deeper automation is attempted. The current repository makes a deliberate architectural decision to stop at challenge boundaries such as CAPTCHA, OTP, and payment steps.

This is not a general-purpose booking automate-it-all system. It is a controlled validation and monitoring framework for a hostile and dynamically changing web environment.

## 2. Problem Statement

IRCTC’s public site frequently blocks automated browser activity with WAF restrictions, anti-bot checks, CAPTCHAs, and multi-step security gates. A repository that attempts to automate ticket booking without validating each stage risks brittle code, site drift, and insecure handling of credentials, PII, and payment data.

The project therefore prioritizes proving the page state and stopping at security boundaries before any direct booking automation.

## 3. Goals

- Validate the live entry route at `/nget/train-search`.
- Detect WAF or access denied conditions early.
- Handle the language modal if present.
- Verify login or authenticated state using current page evidence.
- Stop on CAPTCHA, OTP, or payment boundaries.
- Gather evidence and logs for diagnosis.

## 4. Non Goals

- CAPTCHA solving
- OTP automation
- Payment automation
- UPI automation
- Full end-to-end booking as an immediate target

## 5. Target Users

- QA engineers validating IRCTC page behavior.
- Automation engineers building isolated browser evidence flows.
- Security reviewers and architecture teams evaluating safe automation boundaries.
- Internal stakeholders who need a controlled, low-risk automation baseline.

## 6. Functional Requirements

1. The system must load the IRCTC train-search route.
2. The system must detect page-level access restrictions or WAF responses.
3. The system must detect and close the language modal when present.
4. The system must determine whether the page is in an entry, login, or authenticated state.
5. The system must stop when CAPTCHA or OTP challenges appear.
6. The system must be configurable through environment variables and explicit feature flags.
7. The system must capture evidence such as screenshots and logs.
8. The system must support job tracking and state reporting through the job manager.

## 7. Non Functional Requirements

- The system must prefer visible text checks over stale CSS selectors.
- The system must be resilient to selector drift and dynamic Angular/PrimeNG DOM generation.
- The system must record evidence for every blocked or failed state.
- The system must run with a secure-by-default posture.
- The system must minimize hidden automation and avoid bypassing visible safety gates.

## 8. Security Requirements

- No secrets may be committed to source control.
- Authentication must require explicit opt-in.
- Payment paths must never be executed as default automation.
- Screenshots and job artifacts must be considered sensitive and retained only as needed.
- PII must be minimized and logged only when absolutely necessary.

## 9. Observability Requirements

- Console logs for each state transition must be emitted.
- Cypress tasks must forward job progress to the job manager.
- Job state transitions must be persisted.
- Screenshots and videos must be attached to job artifacts where possible.

## 10. Acceptance Criteria

### Entry validation

- Given an IRCTC page load, the system reports whether the route is accessible or blocked.
- Given a language modal, the system recognizes and dismisses it.
- Given a valid page state, the system can detect a login or booking trigger.

### Auth guard

- Given `IRCTC_RUN_AUTH_FLOW` is false, the system does not attempt login.
- Given credentials are supplied and the flag is true, the system may attempt login only if a valid state is present.

### Challenge boundary

- Given a CAPTCHA or OTP challenge, the system stops and records evidence.
- Given a payment boundary, the system does not continue into payment processing.

## 11. Success Metrics

- 100% of successful runs end in a safe boundary rather than a forced automated bypass.
- 100% of blocked states are captured with evidence.
- 0 active automations crossing CAPTCHA, OTP, or payment handling.
- Reduced reliance on brittle selectors through text-based validation.

## 12. MVP Roadmap

### MVP-1

- Entry-state validation only.

### MVP-2

- Search-form validation after auth gate.

### MVP-3

- Search result discovery and reporting.

### Deferred beyond MVP

- Full booking automation
- OCR solving
- OTP automation
- Payment automation

## 13. Risks

- DOM drift against the live site.
- WAF and bot-protection responses.
- Credential and PII exposure in screenshots or logs.
- Legacy automation code still present in the same repo.

## 14. Assumptions

- IRCTC’s live DOM will continue to change.
- The project will remain bounded by challenge stops and manual intervention.
- Browser automation without a valid page-state contract remains inherently fragile.

## 15. Constraints

- No CAPTCHA bypass.
- No OTP automation.
- No payment automation.
- No reliance on stale selectors or historical assumptions.

## 16. Future Enhancements

Future enhancements are only valid after a new live DOM contract is validated and the relevant security review is completed. That includes:

- stronger page object abstractions,
- a real evidence schema,
- stricter artifact retention policy,
- and a formal state-driven automation contract.

## 17. Conclusion

The product direction is intentionally conservative and security-aware. The repository’s current requirements are not to automate booking end-to-end; they are to prove page state, detect blockers, and maintain a safe boundary around automation that is actively challenged by the target website.
