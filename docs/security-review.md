# Security Review

Status: VERIFIED for code-level concerns; PARTIAL for operational security posture.

## 1. Scope reviewed

- Credentials
- Environment variables
- Logging
- Screenshots and artifacts
- PII exposure
- CAPTCHA handling
- OTP handling
- Payment handling
- Data retention
- Secrets management

## 2. Current risks

### Credentials

- VERIFIED: credentials are intended to remain out of source control.
- VERIFIED: `CredentialManager.js` supports environment variables and Windows Credential Manager.
- PARTIAL: the repo still exposes credential-dependent flows in CI and local execution.
- RISK: if logs or screenshots include a password field or auto-filled form, the secret may leak.

### Environment variables

- VERIFIED: the project uses env-based credential injection.
- VERIFIED: `.gitignore` excludes `.env` and `cypress.env.json`.
- RISK: CI secrets are still passed through workflow environments and command-line arguments, which can be visible in logs if mishandled.

### Logging

- VERIFIED: `cypress.config.js` logs events to the console and to the job manager.
- VERIFIED: the server stores progress events to JSON.
- RISK: logs may include sensitive page state and user data, especially if later login forms or booking details are populated.

### Screenshots / artifacts

- VERIFIED: screenshots and videos are captured automatically.
- VERIFIED: the artifact directory stores job results.
- RISK: screenshots can capture sensitive pages, PII, or payment-related state if the automation proceeds beyond the safe baseline.

### PII exposure

- VERIFIED: the source includes passenger example data in fixtures.
- VERIFIED: the runtime model includes passenger names and ages.
- RISK: if any future automation captures or persists passenger data, it must be treated as regulated personal data and subject to minimal retention.

### CAPTCHA handling

- VERIFIED: the baseline design intentionally stops on CAPTCHA.
- PARTIAL: the Python OCR service shows an implementation path for solving CAPTCHAs.
- RISK: if the OCR path is re-enabled without a strong policy boundary, it can become a bypass of anti-automation protections.

### OTP handling

- VERIFIED: OTP automation is explicitly not implemented.
- RISK: future automation that touches OTP flows must be treated as high-risk secure-intervention logic and should not be automated without strong human-in-the-loop controls.

### Payment handling

- VERIFIED: payment automation is excluded from the active path.
- PARTIAL: legacy code contains UPI and payment logic.
- RISK: these paths remain dangerous if accidentally reactivated or if the repo is used outside the documented boundary.

### Data retention

- VERIFIED: job results are stored in a JSON file under `.data/jobs.json` and artifacts under `artifacts/jobs/`.
- RISK: no retention schedule or cleanup policy is defined.

### Secrets management

- VERIFIED: the repo prefers `.env` and OS credential stores rather than repository secrets.
- RISK: no formal secret rotation policy is documented.
- RISK: no explicit encryption requirement is defined for local JSON job data.

## 3. Future risks

- Future search and booking automation will create more PII and page-content exposure.
- Running login or booking via CI without strict masking and artifact isolation could surface credentials or booking data in logs.
- CAPTCHA and OTP flows are the highest-risk security boundaries in the system.
- Any attempt to automate payment or UPI is a material compliance and security concern.

## 4. Recommendations

1. Keep the current safe baseline as the only active automation path.
2. Treat all screenshots and artifacts as sensitive and apply retention management.
3. Add a hard block in CI to prevent any payment-related selectors or OCR solver paths from being enabled unless separately reviewed.
4. Ensure logs redact or omit credential-bearing text and sensitive passenger details.
5. Require explicit human approval before any route crosses CAPTCHA, OTP, or payment boundaries.
6. Build a policy that no automation may store PII beyond the minimal ephemeral scope needed for execution.

## 5. Hardening checklist

- [ ] Restrict active automation to the validated entry/search boundary.
- [ ] Redact credentials from logs.
- [ ] Mask or purge screenshots after a limited retention period.
- [ ] Prevent storing passenger details beyond required session lifetimes.
- [ ] Require explicit environment flag for auth flows.
- [ ] Separate the legacy booking code from active code execution paths.
- [ ] Keep CAPTCHA, OTP, and payment boundaries as hard stop points.
- [ ] Introduce a documented security review gate before any future expansion.

## 6. Security conclusion

The repository is aligned with a cautious and security-respecting baseline, but it remains vulnerable to accidental scope creep. The major challenge is not just secret storage—it is the fact that both legacy automation and future-facing automation remain in the same codebase. This should be treated as a serious architecture risk until the active workflow is isolated and the legacy payment/CAPTCHA paths are no longer executable.
