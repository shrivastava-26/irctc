// ---------------------------------------------------------------------------
// irctc-login.cy.js
// Verifies the authenticated login flow up to the "Book Ticket" home screen.
// Requires: IRCTC_RUN_AUTH_FLOW=true, IRCTC_USERNAME, IRCTC_PASSWORD in cypress.env.json
// Stops at: CAPTCHA, OTP (manual security boundaries — never bypassed)
// ---------------------------------------------------------------------------

describe('IRCTC — Authenticated Login', () => {
  before(function () {
    if (Cypress.env('IRCTC_RUN_AUTH_FLOW') !== true) {
      this.skip();
    }
  });

  it('loads the IRCTC home page in a real browser (not blocked by WAF)', () => {
    cy.visitIrctcEntry();
    cy.dismissLanguageChoiceIfPresent();
    cy.reportCurrentIrctcState();

    // Verify the page has a Login/Register trigger — proof it loaded properly.
    cy.contains('body', /login\s*\/\s*register|book ticket/i, {
      timeout: 30_000,
    }).should('be.visible');
  });

  it('opens the login panel and fills credentials', function () {
    if (Cypress.env('IRCTC_RUN_AUTH_FLOW') !== true) this.skip();

    cy.visitIrctcEntry();
    cy.dismissLanguageChoiceIfPresent();

    // Check for security challenge BEFORE opening login.
    cy.stopForSecurityChallenge();

    cy.openLoginWhenAvailable();

    // Check for CAPTCHA inside the login panel.
    cy.stopForSecurityChallenge();

    cy.loginFromEnvironment();

    // After submitting credentials, IRCTC may show OTP or go straight to home.
    // Stop if OTP/CAPTCHA appears — human must complete.
    cy.stopForSecurityChallenge();

    // Verify authenticated state.
    cy.waitForPostLoginUI();
    cy.reportCurrentIrctcState();
    cy.screenshot('LOGIN-SUCCESS-authenticated-home');
  });
});
