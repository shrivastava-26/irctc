# Network Map

Traffic is classified by purpose.

SESSION: login, validation, session restoration.
READ_ONLY: train search, availability, Master Passenger reads and static configuration.
MUTATING: non-transactional form state changes.
TRANSACTIONAL: booking submission.
PAYMENT: payment navigation and payment result.

Read operations may use bounded retries for transient network errors. Transactional and payment operations require reconciliation before any retry.

The project does not rely on undocumented private production API contracts. Browser synchronization is used through Cypress. Never log passwords, OTPs, card details or other payment secrets.
