// ---------------------------------------------------------------------------
// irctc.cy.js — IRCTC Ticket Booking Automation
// ---------------------------------------------------------------------------
// Architecture:
//   - General, Tatkal, Premium Tatkal booking via IRCTC /nget flow
//   - CAPTCHA handling is CONDITIONAL: OCR is invoked only when a CAPTCHA
//     image is actually present in the DOM. If absent, login proceeds without it.
//   - All credentials come from Cypress.env() — never hardcoded.
//   - Payment: UPI ID is entered; user must approve in their UPI app.
//   - SECURITY BOUNDARIES NEVER CROSSED:
//       • CAPTCHA bypass (always uses real OCR or pauses for manual entry)
//       • OTP (test stops and reports boundary)
//       • WAF / rate limits (no workarounds)
//       • Payment authorization (UPI entered, user must approve)
// ---------------------------------------------------------------------------

import {
  PASSENGER_DETAILS,
  SOURCE_STATION,
  DESTINATION_STATION,
  TRAIN_NO,
  TRAIN_COACH,
  TRAVEL_DATE,
  TATKAL,
  PREMIUM_TATKAL,
  BOARDING_STATION,
  UPI_ID_CONFIG,
} from '../fixtures/passenger_data.json';

const username = Cypress.env('USERNAME');
const password = Cypress.env('PASSWORD');

// Suppress uncaught Angular/zone.js exceptions that IRCTC emits constantly.
// This does NOT suppress Cypress assertion failures.
Cypress.on('uncaught:exception', () => false);

describe('IRCTC BOOKING', () => {
  it('Booking Begins......', () => {
    // Mutual exclusion guard
    if (TATKAL && PREMIUM_TATKAL) {
      expect(
        false,
        'Make Sure Either TATKAL or PREMIUM TATKAL is True. Not BOTH',
      ).to.be.true;
    }

    cy.clearCookies();
    cy.clearLocalStorage();
    cy.viewport(1478, 1056);

    cy.visit('https://www.irctc.co.in/nget/train-search', {
      failOnStatusCode: false,
      timeout: 90000,
    });

    cy.task('log', 'Website Fetching completed.........');

    // UPI ID: prefer env var, fall back to fixture value
    const UPI_ID = Cypress.env('UPI_ID') || UPI_ID_CONFIG;
    const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
    const isValidUpiId = upiRegex.test(UPI_ID);

    // ------------------------------------------------------------------
    // STEP 1: Open Login Panel
    // Current live DOM: "LOGIN / REGISTER" link/button in the top nav.
    // Selector verified by real-browser evidence — use text-based match
    // rather than the stale .h_head1 > .search_btn class.
    // ------------------------------------------------------------------
    cy.contains(
      'button, a, span, .search_btn',
      /login\s*\/\s*register/i,
      { timeout: 30000 },
    )
      .should('be.visible')
      .click();

    cy.task('log', 'Login panel opened.');

    // ------------------------------------------------------------------
    // STEP 2: Fill username and password
    // ------------------------------------------------------------------
    cy.get('input[placeholder="User Name"]', { timeout: 15000 })
      .should('be.visible')
      .invoke('val', username)
      .trigger('input');

    cy.get('input[placeholder="Password"]', { timeout: 10000 })
      .invoke('val', password)
      .trigger('input');

    // ------------------------------------------------------------------
    // STEP 3: CONDITIONAL CAPTCHA handling
    // Check whether IRCTC is currently showing a CAPTCHA image.
    // If yes → call submitCaptcha() (OCR or manual).
    // If no  → click Sign In directly.
    // This is the KEY FIX over the original code which always assumed CAPTCHA.
    // ------------------------------------------------------------------
    cy.get('body').then(($body) => {
      const hasCaptcha =
        $body.find('.captcha-img, img[class*="captcha" i], input[id*="captcha" i]')
          .length > 0;

      if (hasCaptcha) {
        cy.task('log', 'CAPTCHA detected — invoking OCR/manual handler.');
        cy.submitCaptcha().then(() => {
          cy.doPostLoginFlow(UPI_ID, isValidUpiId);
        });
      } else {
        cy.task('log', 'No CAPTCHA detected — proceeding to Sign In directly.');
        // Click Sign In
        cy.contains('button', /sign\s*in/i, { timeout: 10000 })
          .should('be.enabled')
          .click();

        // Check for OTP (security boundary — never automated)
        cy.get('body', { timeout: 15000 }).then(($afterLogin) => {
          if (/one.?time.?password|enter.*otp|otp.*sent/i.test($afterLogin.text())) {
            cy.task(
              'log',
              '[SECURITY BOUNDARY] OTP required. Please complete it manually in the browser.',
            );
            cy.screenshot('SECURITY-OTP-required');
            // Wait up to 3 minutes for manual OTP completion
            cy.waitUntilAuthenticated(180000);
          }
        });

        cy.doPostLoginFlow(UPI_ID, isValidUpiId);
      }
    });
  });
});
