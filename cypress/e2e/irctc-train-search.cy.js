// ---------------------------------------------------------------------------
// irctc-train-search.cy.js
// Authenticates, then performs a train search from SOURCE to DESTINATION.
// Reads journey config from cypress/fixtures/booking.json.
// Requires: IRCTC_RUN_AUTH_FLOW=true, IRCTC_USERNAME, IRCTC_PASSWORD
// Stops at: CAPTCHA, OTP (manual security boundaries — never bypassed)
// ---------------------------------------------------------------------------

describe('IRCTC — Train Search', () => {
  let booking;

  before(function () {
    if (Cypress.env('IRCTC_RUN_AUTH_FLOW') !== true) {
      this.skip();
    }
    cy.fixture('booking').then((data) => {
      booking = data;
    });
  });

  it('authenticates and searches for trains', function () {
    if (Cypress.env('IRCTC_RUN_AUTH_FLOW') !== true) this.skip();

    // Step 1: Load IRCTC and authenticate.
    cy.visitIrctcEntry();
    cy.dismissLanguageChoiceIfPresent();
    cy.stopForSecurityChallenge();
    cy.openLoginWhenAvailable();
    cy.stopForSecurityChallenge();
    cy.loginFromEnvironment();
    cy.stopForSecurityChallenge();
    cy.waitForPostLoginUI();

    cy.screenshot('TRAIN-SEARCH-01-authenticated');

    // Step 2: Fill the train search form.
    cy.searchTrains(booking);

    cy.screenshot('TRAIN-SEARCH-02-results');
    cy.reportCurrentIrctcState();

    // Assert train results are visible.
    cy.get('body').should(($body) => {
      const text = $body.text().replace(/\s+/g, ' ');
      expect(text).to.match(/available trains|no train|train list/i);
    });
  });
});
