# IRCTC Live RCA and Migration Findings — 2026-09-26

## Scope
Live public browser validation was performed against both IRCTC entry URLs for SMVB → PNBE on 26/11/2026, General quota. No passenger submission, payment, or security-bypass action was performed.

## Confirmed live surfaces

### New entry
Entry URL: https://www.irctc.co.in/eticket/
Controls: From station combobox, To station combobox, Select travel date, Quota combobox, Search Trains.
The new entry has been observed resolving to both /eticket/booking/train-list and /nget/booking/train-list. Entry surface and runtime surface are therefore independent.

### Legacy entry
Entry URL: https://www.irctc.co.in/nget/train-search
Confirmed controls: #origin, #destination, #jDate, #journeyClass, #journeyQuota, Search Trains / Modify Search.
Live selection succeeded for SMVT BENGALURU - SMVB, PATNA JN. - PNBE, 26/11/2026, Sleeper (SL), General, reaching /nget/booking/train-list.

## Runtime train-list observations
New runtime: div.train-result-container. Observed 12295 SANGHAMITRA EXP and 22366 SMVB DNR SF EXP. Initial public train cards expose class codes but final availability requires the train-specific Check Availability / Refresh Availability action. Class status is inside a class-card/status-row structure.
Legacy runtime: app-train-avl-enq. Train heading uses .train-heading strong. Class/availability uses div.pre-avl. Book Now is scoped inside the train result.
For 26/11/2026, the runtime correctly reported that the date is outside the advance reservation period, so real seat counts were unavailable. This is a valid availability-state observation.

## RCA of previous implementation
1. Train selection used first/shortest matching DOM elements instead of deterministic candidate enumeration.
2. Availability was inferred from page-wide body text.
3. /eticket/ was treated as permanently new even when runtime became /nget/.
4. PNR extraction accepted arbitrary 10-digit page text.
5. Passenger filling used global indexed inputs.
6. Production execution remained Cypress-specific.
7. Scheduled execution had a separate in-memory timer path instead of the persistent Scheduler.
8. npm install could execute the prepare lifecycle hook and require booking data.
9. Job persistence writes were not atomic.
10. VERIFY_TRANSACTION was classified as retryable even though transaction outcome can be ambiguous.
11. The feature branch had no verified CI run.
12. No authenticated booking with an authoritative PNR was executed in this environment.

## Migration decision
Playwright becomes the production browser execution layer. Cypress remains temporarily for legacy/regression compatibility.
Durable architecture: React UI → Job → Scheduler → BookingStateMachine → RunStateStore → Playwright → IRCTC adapters.
No new distributed infrastructure is required.

## Security
CAPTCHA and OTP remain hard security boundaries. Production automation pauses for manual completion and resumes the same safe state. No OCR, guessing, evasion, or anti-detection flags are used.

## Verification levels
LIVE PUBLIC SEARCH: verified for New and Legacy entry paths.
LIVE RUNTIME SURFACE HANDOFF: verified for New → New and New → Legacy.
REAL AUTHENTICATED BOOKING + PNR: not executed here and must not be represented as verified.