# Failure Matrix

| Failure | Classification | Action |
|---|---|---|
| Search timeout | SAFE_RETRY | Retry with bounded backoff |
| Availability timeout | SAFE_RETRY | Retry read |
| 5xx on read | SAFE_RETRY | Retry bounded times |
| Session expired | RECOVERABLE | Restore/login then continue |
| No acceptable train | SELECTION | Use configured fallback or stop |
| Availability changed | RECOVERABLE | Re-read candidate and fallback |
| Fare changed | REVIEW | Re-validate before submission |
| Booking submit timeout | TRANSACTION_UNKNOWN | Verify result; never blindly resubmit |
| Payment declined | TRANSACTION_FAILED | Report; do not duplicate payment |
| Browser crash before submit | SAFE_RESUME | Resume from persisted state |
| Browser crash after submit | UNKNOWN | Reconcile before retry |
| CAPTCHA/OTP | SECURITY_CHALLENGE | Wait in headed browser; no bypass |
| Access Denied/WAF | ACCESS_BLOCK | Stop and report; do not evade |
