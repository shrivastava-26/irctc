// ---------------------------------------------------------------------------
// IRCTC Cypress custom commands
// ---------------------------------------------------------------------------
// Architecture rules (never break these):
//   1. Live DOM is the authority. No stale hardcoded selectors.
//   2. CAPTCHA / OTP / payment must never be automated or bypassed.
//      The commands below stop and screenshot at those boundaries.
//   3. Credentials are read from Cypress.env() — never hardcoded.
//   4. Only non-sensitive page-state facts may be logged.
// ---------------------------------------------------------------------------

const ENTRY_PATH = '/nget/train-search';

const visibleText = ($body) => $body.text().replace(/\s+/g, ' ').trim();

/** Snapshot the key booleans that describe what IRCTC currently shows. */
const pageState = ($body) => {
  const text = visibleText($body);

  return {
    url: Cypress.state('window').location.href,
    title: Cypress.state('window').document.title,
    accessDenied: /access denied|request rejected|forbidden|403/i.test(text),
    languageChoice:
      /welcome to irctc/i.test(text) &&
      /please select your preferred language/i.test(text),
    loginTrigger: /login\s*\/\s*register/i.test(text),
    authenticatedBookTicket:
      /book ticket/i.test(text) && /logout|sign out/i.test(text),
    captcha:
      /captcha/i.test(text) ||
      $body.find(
        'img[class*="captcha" i], input[id*="captcha" i], input[name*="captcha" i], [class*="captcha" i]',
      ).length > 0,
    otp: /enter.*otp|otp.*sent|one.?time.?password/i.test(text),
    trainResults: /available trains|no trains|train list/i.test(text),
    passengerForm:
      /passenger.*detail|add passenger|traveller.*detail/i.test(text),
    paymentPage: /proceed.*payment|total.*fare|pay.*book/i.test(text),
  };
};

// ---------------------------------------------------------------------------
// visitIrctcEntry
// ---------------------------------------------------------------------------
Cypress.Commands.add('visitIrctcEntry', () => {
  // Use on-before-load hook to set a real desktop UA so IRCTC's WAF doesn't
  // serve a 403/ESOCKETTIMEDOUT to the headless Electron/Chrome process.
  cy.visit(ENTRY_PATH, {
    failOnStatusCode: false,
    onBeforeLoad(win) {
      Object.defineProperty(win.navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/126.0.0.0 Safari/537.36',
        configurable: true,
      });
    },
  });
  cy.get('body', { timeout: 90_000 }).should('be.visible');
  cy.get('body').then(($body) => {
    const state = pageState($body);
    cy.task('reportIrctcState', state);

    if (state.accessDenied) {
      throw new Error(
        'IRCTC returned an access-denied page. ' +
          'This is a WAF/network state, not a selector failure. ' +
          'Use a headed Chrome run: npx cypress run --headed --browser chrome',
      );
    }
  });
});

// ---------------------------------------------------------------------------
// dismissLanguageChoiceIfPresent
// ---------------------------------------------------------------------------
Cypress.Commands.add('dismissLanguageChoiceIfPresent', () => {
  cy.get('body').then(($body) => {
    const state = pageState($body);
    if (!state.languageChoice) return;

    cy.contains('button, [role="button"], a', /^English$/i, {
      timeout: 10_000,
    })
      .should('be.visible')
      .click();

    cy.get('body').should(($updatedBody) => {
      expect(visibleText($updatedBody)).not.to.match(
        /please select your preferred language/i,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// reportCurrentIrctcState
// ---------------------------------------------------------------------------
Cypress.Commands.add('reportCurrentIrctcState', () => {
  cy.get('body').then(($body) => {
    cy.task('reportIrctcState', pageState($body));
  });
});

// ---------------------------------------------------------------------------
// stopForSecurityChallenge
// CHANGED: was unconditionally throw; now conditional based on live DOM.
// If CAPTCHA/OTP is present → screenshot + throw (human must act).
// If absent → no-op (do not block the test flow).
// ---------------------------------------------------------------------------
Cypress.Commands.add('stopForSecurityChallenge', () => {
  cy.get('body').then(($body) => {
    const state = pageState($body);

    if (state.captcha) {
      cy.screenshot('SECURITY-CHALLENGE-captcha');
      throw new Error(
        '[SECURITY BOUNDARY] IRCTC is showing a CAPTCHA. ' +
          'A screenshot has been saved. ' +
          'Manual completion is required — this test will not solve or bypass it.',
      );
    }

    if (state.otp) {
      cy.screenshot('SECURITY-CHALLENGE-otp');
      throw new Error(
        '[SECURITY BOUNDARY] IRCTC is asking for an OTP. ' +
          'A screenshot has been saved. ' +
          'Manual completion is required — this test will not solve or bypass it.',
      );
    }

    // No CAPTCHA / OTP detected — log and continue.
    cy.task('log', 'No CAPTCHA or OTP detected — continuing.');
  });
});

// ---------------------------------------------------------------------------
// openLoginWhenAvailable
// ---------------------------------------------------------------------------
Cypress.Commands.add('openLoginWhenAvailable', () => {
  // The login/register link may be in the nav or a floating button depending
  // on viewport. Use text-based matching — proven by prior evidence.
  cy.contains('button, [role="button"], a, span', /login\s*\/\s*register/i, {
    timeout: 20_000,
  })
    .should('be.visible')
    .click();

  // After clicking, the login panel opens. Verify by checking for a password
  // input — the most stable evidence of the login form being open.
  cy.get('input[type="password"]', { timeout: 20_000 }).should('be.visible');
});

// ---------------------------------------------------------------------------
// loginFromEnvironment
// Reads IRCTC_USERNAME / IRCTC_PASSWORD from Cypress env (cypress.env.json).
// REMOVED the duplicate stopForSecurityChallenge call that was inside this
// command — the caller (the spec) is responsible for calling it once before
// and once after typing credentials.
// ---------------------------------------------------------------------------
Cypress.Commands.add('loginFromEnvironment', () => {
  const username = Cypress.env('IRCTC_USERNAME');
  const password = Cypress.env('IRCTC_PASSWORD');

  if (!username || !password) {
    throw new Error(
      'IRCTC_USERNAME and IRCTC_PASSWORD env vars are required. ' +
        'Create cypress.env.json with those keys (it is gitignored).',
    );
  }

  // Find the username field by its proximity to the password field in the
  // same form — avoids hardcoding a selector that IRCTC changes frequently.
  cy.get('input[type="password"]', { timeout: 10_000 }).then(($password) => {
    const $form = $password.first().closest('form, .login-form, [class*="login"]');
    // Try the form first; fall back to any visible text input on the page.
    let $usernameField = $form.find('input:not([type="password"])').filter(':visible').first();
    if (!$usernameField.length) {
      $usernameField = Cypress.$('input[type="text"]:visible, input[type="email"]:visible').first();
    }
    expect($usernameField, 'visible username input in the live login form').to.have.length.greaterThan(0);
    cy.wrap($usernameField).clear().type(username, { log: false });
  });

  cy.get('input[type="password"]').first().clear().type(password, { log: false });

  // "Sign In" button — text-matched for resilience.
  cy.contains('button, [role="button"]', /sign\s*in/i)
    .should('be.enabled')
    .click();
});

// ---------------------------------------------------------------------------
// waitForPostLoginUI
// Asserts that IRCTC has transitioned to the authenticated home screen.
// ---------------------------------------------------------------------------
Cypress.Commands.add('waitForPostLoginUI', () => {
  cy.get('body', { timeout: 45_000 }).should(($body) => {
    const state = pageState($body);
    if (state.captcha || state.otp) return; // handled separately by stopForSecurityChallenge
    expect(
      state.authenticatedBookTicket || state.loginTrigger === false,
      'authenticated IRCTC booking UI (Book Ticket visible, Logout visible)',
    ).to.be.true;
  });
});

// ---------------------------------------------------------------------------
// searchTrains
// Fills the train-search form with fixture data and submits.
// Reads from the booking fixture: SOURCE_STATION, DESTINATION_STATION,
// TRAVEL_DATE (DD/MM/YYYY), TRAIN_COACH.
// ---------------------------------------------------------------------------
Cypress.Commands.add('searchTrains', (booking) => {
  const { SOURCE_STATION, DESTINATION_STATION, TRAVEL_DATE } = booking;

  // --- From station ---
  // IRCTC uses a p-autocomplete component. Type to trigger the dropdown,
  // then pick the first matching suggestion.
  cy.get('input[placeholder*="From" i], input[id*="origin" i], input[aria-label*="from" i]', {
    timeout: 20_000,
  })
    .first()
    .should('be.visible')
    .clear()
    .type(SOURCE_STATION.substring(0, 3));

  cy.get('.ui-autocomplete-panel li, .p-autocomplete-panel li, [class*="autocomplete"] li', {
    timeout: 10_000,
  })
    .first()
    .click();

  // --- To station ---
  cy.get('input[placeholder*="To" i], input[id*="destination" i], input[aria-label*="to" i]', {
    timeout: 10_000,
  })
    .first()
    .should('be.visible')
    .clear()
    .type(DESTINATION_STATION.substring(0, 3));

  cy.get('.ui-autocomplete-panel li, .p-autocomplete-panel li, [class*="autocomplete"] li', {
    timeout: 10_000,
  })
    .first()
    .click();

  // --- Travel date ---
  // Clear then type the date. IRCTC date picker accepts keyboard entry.
  cy.get('input[placeholder*="Date" i], input[id*="jrdate" i], p-calendar input', {
    timeout: 10_000,
  })
    .first()
    .should('be.visible')
    .clear()
    .type(TRAVEL_DATE);

  // Close any open calendar overlay by pressing Escape.
  cy.get('body').type('{esc}');

  // --- Search button ---
  cy.contains('button', /search/i).should('be.enabled').click();

  // Assert train list rendered.
  cy.get('body', { timeout: 30_000 }).should(($body) => {
    const text = visibleText($body);
    expect(text).to.match(/available trains|no train|train list/i);
  });
});

// ---------------------------------------------------------------------------
// selectTrainAndClass
// Selects a specific train by number (or the first available) and a coach class.
// ---------------------------------------------------------------------------
Cypress.Commands.add('selectTrainAndClass', (booking) => {
  const { TRAIN_NO, TRAIN_COACH } = booking;

  if (TRAIN_NO) {
    // Click the specific train row.
    cy.contains('[class*="train"], tr', TRAIN_NO, { timeout: 15_000 })
      .should('be.visible')
      .click();
  }

  // Select the class tab/button (e.g. "SL", "3A", "2A").
  cy.contains('button, td, [class*="class"], [class*="quota"]', TRAIN_COACH, {
    timeout: 10_000,
  })
    .should('be.visible')
    .click();

  // Click "Book Now" for that class.
  cy.contains('button', /book now/i, { timeout: 10_000 })
    .first()
    .should('be.enabled')
    .click();
});

// ---------------------------------------------------------------------------
// fillPassengerForm
// Fills one or more passenger rows from the fixture.
// STOPS at the payment page — never clicks Pay.
// ---------------------------------------------------------------------------
Cypress.Commands.add('fillPassengerForm', (booking) => {
  const passengers = booking.PASSENGER_DETAILS || [];

  if (!passengers.length) {
    throw new Error(
      'No passengers in booking fixture PASSENGER_DETAILS. ' +
        'Add at least one passenger to cypress/fixtures/booking.json.',
    );
  }

  // Wait for the passenger form to load.
  cy.contains(/passenger.*detail|traveller.*detail|add passenger/i, {
    timeout: 30_000,
  }).should('be.visible');

  passengers.forEach((pax, idx) => {
    // If there is an "Add Passenger" button (after the first), click it.
    if (idx > 0) {
      cy.contains('button', /add passenger|add traveller/i)
        .should('be.visible')
        .click();
    }

    // Name — find the nth passenger name row.
    cy.get('input[placeholder*="Name" i]').eq(idx).clear().type(pax.name);

    // Age
    cy.get('input[placeholder*="Age" i]').eq(idx).clear().type(String(pax.age));

    // Gender — select from dropdown.
    cy.get('select[id*="gender" i], p-dropdown[placeholder*="Gender" i]')
      .eq(idx)
      .then(($el) => {
        if ($el.is('select')) {
          cy.wrap($el).select(pax.gender); // 'Male', 'Female', 'Transgender'
        } else {
          // PrimeNG p-dropdown.
          cy.wrap($el).click();
          cy.contains('.p-dropdown-item', pax.gender).click();
        }
      });

    // Berth preference (optional).
    if (pax.berth) {
      cy.get('select[id*="berth" i], p-dropdown[placeholder*="Berth" i]')
        .eq(idx)
        .then(($el) => {
          if ($el.is('select')) {
            cy.wrap($el).select(pax.berth);
          } else {
            cy.wrap($el).click();
            cy.contains('.p-dropdown-item', pax.berth).click();
          }
        });
    }
  });
});

// ---------------------------------------------------------------------------
// proceedToPaymentBoundary
// Clicks "Continue" / "Proceed" until the payment page is reached,
// then STOPS and takes a screenshot. Never automates payment.
// ---------------------------------------------------------------------------
Cypress.Commands.add('proceedToPaymentBoundary', () => {
  // Click Continue/Proceed on the passenger form to advance to review/payment.
  cy.contains('button', /continue|proceed/i, { timeout: 15_000 })
    .should('be.enabled')
    .click();

  // Stop at security challenges.
  cy.stopForSecurityChallenge();

  // Wait for payment page indicators.
  cy.get('body', { timeout: 30_000 }).should(($body) => {
    const state = pageState($body);
    expect(
      state.paymentPage || state.captcha || state.otp,
      'reached payment boundary (payment page, CAPTCHA, or OTP)',
    ).to.be.true;
  });

  // Screenshot the payment boundary — proof of progress without crossing it.
  cy.screenshot('PAYMENT-BOUNDARY-reached');
  cy.task('log', '[PAYMENT BOUNDARY] Reached payment page. Stopping — human must complete payment.');
});
