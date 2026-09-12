describe('IRCTC entry and authentication boundary', () => {
  it('captures the first actionable UI state without assuming a stale selector', () => {
    cy.visitIrctcEntry();
    cy.dismissLanguageChoiceIfPresent();
    cy.reportCurrentIrctcState();

    // This is intentionally the first proven UI boundary. It replaces the
    // historical .h_head1 > .search_btn assumption with a live text-based check.
    cy.contains('body', /login\s*\/\s*register|book ticket/i).should('be.visible');
  });

  it('does not attempt authentication unless explicitly enabled and configured', function () {
    if (Cypress.env('IRCTC_RUN_AUTH_FLOW') !== true) {
      this.skip();
    }

    cy.visitIrctcEntry();
    cy.dismissLanguageChoiceIfPresent();
    cy.openLoginWhenAvailable();
    cy.stopForSecurityChallenge();
    cy.loginFromEnvironment();
    cy.get('body', { timeout: 30_000 }).should(($body) => {
      const state = $body.text().replace(/\s+/g, ' ');
      expect(state, 'authenticated IRCTC booking UI').to.match(/book ticket/i);
    });
  });
});

