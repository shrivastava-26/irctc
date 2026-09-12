# Source migration

This repository incorporates the safe, reusable parts of the original
[`shivamguys/irctc-cypress-automation`](https://github.com/shivamguys/irctc-cypress-automation)
project:

- Cypress layout and configuration conventions;
- date and Tatkal-time utilities;
- a booking-configuration example with no personal or historical booking data.

The following original components are deliberately not imported as executable
automation:

- OCR CAPTCHA solver and model files;
- automatic CAPTCHA submission/retry paths;
- automatic UPI entry, Pay-and-Book actions, and payment-gateway handling;
- the stale 2024 passenger fixture.

They would bypass or automate security/financial boundaries and conflict with
this project's rules. The active Cypress suite therefore stops on CAPTCHA,
OTP, eligibility, and payment states. Train search and passenger-form steps
will be migrated only after their current live DOM is verified.
