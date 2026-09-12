const ENTRY_PATH = '/nget/train-search';

const visibleText = ($body) => $body.text().replace(/\s+/g, ' ').trim();

const pageState = ($body) => {
  const text = visibleText($body);

  return {
    url: Cypress.config('baseUrl') + Cypress.state('window').location.pathname,
    title: Cypress.state('window').document.title,
    accessDenied: /access denied|request rejected|forbidden/i.test(text),
    languageChoice: /welcome to irctc/i.test(text) && /please select your preferred language/i.test(text),
    loginTrigger: /login\s*\/\s*register/i.test(text),
    authenticatedBookTicket: /book ticket/i.test(text) && /logout|sign out/i.test(text),
    captcha: /captcha/i.test(text) || $body.find('img[class*="captcha" i], input[id*="captcha" i], input[name*="captcha" i]').length > 0,
  };
};

Cypress.Commands.add('visitIrctcEntry', () => {
  cy.visit(ENTRY_PATH, { failOnStatusCode: false });
  cy.get('body', { timeout: 60_000 }).should('be.visible');
  cy.get('body').then(($body) => {
    const state = pageState($body);
    cy.task('reportIrctcState', state);

    if (state.accessDenied) {
      throw new Error(
        'IRCTC rendered an access-denied page in Cypress. This is an environment/WAF state, not a selector failure.',
      );
    }
  });
});

Cypress.Commands.add('dismissLanguageChoiceIfPresent', () => {
  cy.get('body').then(($body) => {
    const state = pageState($body);
    if (!state.languageChoice) return;

    // “English” is visible in the supplied real-browser evidence. The assertion
    // makes the action fail loudly if the live DOM no longer exposes that control.
    cy.contains('button, [role="button"], a', /^English$/i, { timeout: 10_000 })
      .should('be.visible')
      .click();
    cy.get('body').should(($updatedBody) => {
      expect(visibleText($updatedBody)).not.to.match(/please select your preferred language/i);
    });
  });
});

Cypress.Commands.add('reportCurrentIrctcState', () => {
  cy.get('body').then(($body) => {
    cy.task('reportIrctcState', pageState($body));
  });
});

Cypress.Commands.add('openLoginWhenAvailable', () => {
  cy.contains('button, [role="button"], a, span', /login\s*\/\s*register/i, { timeout: 20_000 })
    .should('be.visible')
    .click();
  cy.get('input[type="password"]', { timeout: 20_000 }).should('be.visible');
});

Cypress.Commands.add('stopForSecurityChallenge', () => {
  cy.get('body').then(($body) => {
    if (pageState($body).captcha) {
      throw new Error(
        'IRCTC presented a CAPTCHA or comparable security challenge. Manual user completion is required; this test will not solve or bypass it.',
      );
    }
  });
});

Cypress.Commands.add('loginFromEnvironment', () => {
  const username = Cypress.env('IRCTC_USERNAME');
  const password = Cypress.env('IRCTC_PASSWORD');

  if (!username || !password) {
    throw new Error('IRCTC_USERNAME and IRCTC_PASSWORD are required only for an explicitly enabled authentication run.');
  }

  cy.stopForSecurityChallenge();
  cy.get('input[type="password"]', { timeout: 10_000 }).then(($password) => {
    const $username = $password.first().closest('form').find('input:not([type="password"])').filter(':visible').first();
    expect($username, 'visible username input in the live login form').to.have.length(1);
    cy.wrap($username).clear().type(username, { log: false });
  });
  cy.get('input[type="password"]').first().clear().type(password, { log: false });
  cy.contains('button, [role="button"]', /^sign in$/i).should('be.enabled').click();
});

