# Autonomous Booking Engine Architecture

## Production architecture
React UI
-> Job
-> Scheduler
-> BookingStateMachine
-> RunStateStore
-> Playwright runner
-> IRCTC adapter
-> IRCTC

Cypress remains only for legacy/regression compatibility during migration. Scheduler and Job never depend on Cypress APIs.

## Surfaces
The request stores an entry surface: AUTO, NEW, or LEGACY.
The browser runner detects the runtime surface from the actual URL and DOM after search.
Supported transitions:
- NEW entry -> NEW runtime
- NEW entry -> LEGACY runtime
- LEGACY entry -> LEGACY runtime
This is required because live validation showed the new entry can hand off to a legacy/PrimeNG-style train-list route.

## Reliability
BookingStateMachine remains the durable source of truth. Browser objects are disposable and are never durable state.
RunStateStore and JobStore use atomic file replacement. Recovery never repeats SUBMIT blindly.
Transaction handling remains: VALIDATE_BOOKING -> SUBMIT -> VERIFY_TRANSACTION -> VERIFY_BOOKING -> SUCCESS.
Unknown transaction outcomes remain unknown and are reconciled before any further transactional action.

## Train selection and availability
FIXED selects the exact configured train only.
Preferred/backup selection uses the configured order.
FIRST_VALID enumerates result containers in result order.
Availability is read only from the selected train's selected class container. Page-wide AVAILABLE text is not accepted.
The selected train, train name, class, quota and availability are persisted in runtime metadata.

## Session
Playwright uses a separate persistent browser profile per account/browser combination under .data/playwright-profiles/.
The production runner verifies authentication rather than assuming an existing session is valid. Authentication state is never committed to Git.

## Security
CAPTCHA and OTP are legitimate security challenges. The browser waits for manual completion and resumes the safe state. No OCR, anti-detection flags, guessing or security bypass is used.

## Scheduling
Scheduler persists jobs before waiting. Scheduled jobs start browser preparation during a configurable preparation window and the runner waits only until the exact booking time before the critical sequence.
Restart recovery reloads STARTING/RUNNING jobs and recalculates the remaining delay.

## Performance
The design removes arbitrary sleeps from normal browser flow. Playwright actionability, URL waits and scoped locators provide synchronization. Telemetry records state timings so performance claims are measurement-based.