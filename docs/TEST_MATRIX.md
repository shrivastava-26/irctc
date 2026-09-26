# Test Matrix

Unit:
- state ordering
- invalid transition rejection
- retry limits and backoff

Fixture scenarios:
- available
- RAC
- waitlist
- no availability
- server error
- session expired
- fare changed
- booking success
- booking failure
- transaction unknown

Browser scenarios:
- authenticated entry
- session restore
- language modal
- train search
- preferred and backup train selection
- passenger selection/fill
- review validation
- transaction success/failure
- unknown transaction state
- browser crash/restart
- CAPTCHA/OTP waiting
- access-denied classification

Never use repeated live production traffic as a stress test.
