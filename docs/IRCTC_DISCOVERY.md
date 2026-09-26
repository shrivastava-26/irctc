# IRCTC Discovery Notes

Current official Beta entry:
https://www.irctc.co.in/eticket/

The current public page redirects to the train-search surface and exposes source, destination, date, quota and Search Trains controls.

Repository evidence currently validates the entry/login/search surface. Downstream passenger and payment selectors are not guaranteed stable and are isolated in the autonomous spec.

The new engine does not invoke the legacy CAPTCHA OCR helper and does not use browser flags intended to hide automation. Security challenges are treated as legitimate user-completed steps, after which the same execution state resumes.

Booking submission is transactional. An unknown result remains UNKNOWN until verified.
