// ---------------------------------------------------------------------------
// irctc-booking-flow.cy.js
// Full booking automation: authenticate → search → select train+class →
// fill passenger form → reach payment page → STOP (never pay).
//
// Reads from: cypress/fixtures/booking.json
// Requires:   IRCTC_RUN_AUTH_FLOW=true, IRCTC_USERNAME, IRCTC_PASSWORD
// Hard stops: CAPTCHA, OTP, payment page (human must complete these)
// ---------------------------------------------------------------------------

describe('IRCTC — Booking Flow (stops at payment)', () => {
  let booking;

  before(function () {
    if (Cypress.env('IRCTC_RUN_AUTH_FLOW') !== true) {
      this.skip();
    }
    cy.fixture('booking').then((data) => {
      booking = data;
    });
  });

  beforeEach(function () {
    if (Cypress.env('IRCTC_RUN_AUTH_FLOW') !== true) {
      this.skip();
    }
  });

  // --------------------------------------------------------------------------
  it('Step 1 — Authenticate and reach the home screen', () => {
    cy.visitIrctcEntry();
    cy.dismissLanguageChoiceIfPresent();
    cy.stopForSecurityChallenge();
    cy.openLoginWhenAvailable();
    cy.stopForSecurityChallenge();
    cy.loginFromEnvironment();
    cy.stopForSecurityChallenge();
    cy.waitForPostLoginUI();
    cy.screenshot('BOOKING-01-authenticated');

    // Preserve session state for subsequent steps in this spec run.
    // (Each Cypress test gets a fresh page but cookies/localStorage persist.)
  });

  // --------------------------------------------------------------------------
  it('Step 2 — Search for trains on the specified route', () => {
    // Re-visit to use the persisted session.
    cy.visitIrctcEntry();
    cy.stopForSecurityChallenge();
    cy.waitForPostLoginUI();

    cy.searchTrains(booking);
    cy.screenshot('BOOKING-02-train-search-results');

    cy.get('body').should(($body) => {
      const text = $body.text().replace(/\s+/g, ' ');
      expect(text).to.match(/available trains|no train|train list/i);
    });
  });

  // --------------------------------------------------------------------------
  it('Step 3 — Select the train and class, then click Book Now', () => {
    cy.visitIrctcEntry();
    cy.stopForSecurityChallenge();
    cy.waitForPostLoginUI();

    // Redo search to get back to the results page.
    cy.searchTrains(booking);

    cy.selectTrainAndClass(booking);
    cy.stopForSecurityChallenge();
    cy.screenshot('BOOKING-03-book-now-clicked');

    // Should now be on the passenger form or a security challenge.
    cy.get('body', { timeout: 30_000 }).should(($body) => {
      const text = $body.text().replace(/\s+/g, ' ');
      expect(text).to.match(
        /passenger.*detail|traveller.*detail|add passenger|captcha|otp/i,
      );
    });
  });

  // --------------------------------------------------------------------------
  it('Step 4 — Fill passenger details and reach payment boundary', () => {
    cy.visitIrctcEntry();
    cy.stopForSecurityChallenge();
    cy.waitForPostLoginUI();

    // Re-run search + selection to arrive at passenger form.
    cy.searchTrains(booking);
    cy.selectTrainAndClass(booking);
    cy.stopForSecurityChallenge();

    // Fill the passenger form.
    cy.fillPassengerForm(booking);
    cy.screenshot('BOOKING-04-passenger-form-filled');

    // Proceed to payment page — then STOP.
    cy.proceedToPaymentBoundary();

    // This is the terminal assertion: test confirms payment page was reached
    // without crossing it. A screenshot named PAYMENT-BOUNDARY-reached is saved.
    cy.get('body').should(($body) => {
      const text = $body.text().replace(/\s+/g, ' ');
      // Payment page must show fare / payment method selection.
      expect(text).to.match(/proceed.*payment|total.*fare|payment.*option|pay.*book/i);
    });

    cy.task(
      'log',
      '[COMPLETE] Booking flow reached the payment boundary. ' +
        'Human must complete payment. No automated payment attempted.',
    );
  });
});
