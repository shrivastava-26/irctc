// ---------------------------------------------------------------------------
// cypress/support/commands.js
// ---------------------------------------------------------------------------
// Custom Cypress commands for IRCTC booking automation.
//
// CAPTCHA rules:
//   submitCaptcha() — calls the OCR server if MANUAL_CAPTCHA=false (default).
//                     If MANUAL_CAPTCHA=true, pauses for human entry.
//   solveCaptcha()  — same, for the second-stage CAPTCHA on the review page.
//   Both are only called when the DOM confirms a CAPTCHA is present.
//
// Security boundaries never crossed:
//   - CAPTCHA: OCR or manual (never blindly skipped)
//   - OTP: test pauses and screenshots
//   - Payment: UPI entered + user must approve; cy.wait() gives time
// ---------------------------------------------------------------------------

import { formatDate, hasTatkalAlreadyOpened, tatkalOpenTimeForToday } from '../utils/index';
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
} from '../fixtures/passenger_data.json';

// ---------------------------------------------------------------------------
// submitCaptcha — handles the LOGIN page CAPTCHA (conditional call only)
// ---------------------------------------------------------------------------
Cypress.Commands.add('submitCaptcha', () => {
  const MANUAL_CAPTCHA = Cypress.env('MANUAL_CAPTCHA') === true;

  if (MANUAL_CAPTCHA) {
    // Manual mode: human types the captcha. Wait 30s for manual entry.
    cy.task('log', '[CAPTCHA] Manual mode — waiting 30s for human entry.');
    cy.wait(30000);
    cy.contains('button', /sign\s*in/i).should('be.enabled').click();
    return;
  }

  // Automatic mode: call the local OCR server (must be running).
  cy.task('log', '[CAPTCHA] Auto mode — fetching image for OCR.');

  cy.get('.captcha-img, img[class*="captcha" i]', { timeout: 10000 })
    .invoke('attr', 'src')
    .then((src) => {
      // The captcha src is a relative URL like /captchaEnq — prepend base.
      const captchaUrl = src.startsWith('http')
        ? src
        : `https://www.irctc.co.in${src}`;

      cy.request({
        method: 'POST',
        url: 'http://localhost:5000/get-captcha-string',
        body: { url: captchaUrl },
        failOnStatusCode: false,
        timeout: 30000,
      }).then((response) => {
        if (response.status !== 200 || !response.body?.captcha_string) {
          cy.task(
            'log',
            '[CAPTCHA] OCR server failed — falling back to manual. Set MANUAL_CAPTCHA=true.',
          );
          cy.screenshot('CAPTCHA-OCR-failed');
          throw new Error(
            '[CAPTCHA] OCR server at localhost:5000 did not return a captcha_string. ' +
              'Either start the captcha server or set MANUAL_CAPTCHA=true in cypress.env.json.',
          );
        }

        const captchaText = response.body.captcha_string;
        cy.task('log', `[CAPTCHA] OCR result received (length: ${captchaText.length}).`);

        cy.get('input#captcha, input[formcontrolname="captcha"], input[placeholder*="captcha" i]', {
          timeout: 10000,
        })
          .clear()
          .type(captchaText);

        cy.contains('button', /sign\s*in/i).should('be.enabled').click();
      });
    });
});

// ---------------------------------------------------------------------------
// solveCaptcha — second-stage CAPTCHA on the review/confirmation page
// ---------------------------------------------------------------------------
Cypress.Commands.add('solveCaptcha', () => {
  const MANUAL_CAPTCHA = Cypress.env('MANUAL_CAPTCHA') === true;

  cy.get('body').then(($body) => {
    const hasCaptcha =
      $body.find('.captcha-img, img[class*="captcha" i], input[id*="captcha" i]').length > 0;

    if (!hasCaptcha) {
      cy.task('log', '[CAPTCHA2] No second-stage CAPTCHA detected — continuing.');
      return;
    }

    if (MANUAL_CAPTCHA) {
      cy.task('log', '[CAPTCHA2] Manual mode — waiting 30s for human entry.');
      cy.wait(30000);
      cy.contains('button', /continue|confirm|proceed/i).should('be.enabled').click();
      return;
    }

    cy.task('log', '[CAPTCHA2] Auto mode — fetching second-stage CAPTCHA for OCR.');

    cy.get('.captcha-img, img[class*="captcha" i]')
      .invoke('attr', 'src')
      .then((src) => {
        const captchaUrl = src.startsWith('http')
          ? src
          : `https://www.irctc.co.in${src}`;

        cy.request({
          method: 'POST',
          url: 'http://localhost:5000/get-captcha-string',
          body: { url: captchaUrl },
          failOnStatusCode: false,
          timeout: 30000,
        }).then((response) => {
          if (response.status !== 200 || !response.body?.captcha_string) {
            cy.screenshot('CAPTCHA2-OCR-failed');
            throw new Error('[CAPTCHA2] OCR server failed on second stage.');
          }

          const captchaText = response.body.captcha_string;
          cy.task('log', `[CAPTCHA2] OCR result received.`);

          cy.get(
            'input#captcha, input[formcontrolname="captcha"], input[placeholder*="captcha" i]',
            { timeout: 10000 },
          )
            .clear()
            .type(captchaText);

          cy.contains('button', /continue|confirm|proceed/i)
            .should('be.enabled')
            .click();
        });
      });
  });
});

// ---------------------------------------------------------------------------
// waitUntilAuthenticated — waits for "Book Ticket"/"Logout" post-login UI
// ---------------------------------------------------------------------------
Cypress.Commands.add('waitUntilAuthenticated', (timeoutMs = 60000) => {
  cy.get('body', { timeout: timeoutMs }).should(($body) => {
    const text = $body.text().replace(/\s+/g, ' ');
    expect(text).to.match(/logout|sign out|my account/i);
  });
  cy.task('log', 'Authenticated — Logout/My Account visible.');
});

// ---------------------------------------------------------------------------
// bookUntilTatkalGetsOpen
// For Tatkal: clicks Book Now and retries until the Tatkal window opens.
// For General: clicks immediately.
// ---------------------------------------------------------------------------
Cypress.Commands.add(
  'bookUntilTatkalGetsOpen',
  (div, trainCoach, travelDate, trainNo, isTatkal) => {
    if (!isTatkal) {
      // General booking — click Book Now directly.
      cy.wrap(div)
        .contains('button, [class*="book"]', /book now/i, { timeout: 10000 })
        .click();
      return;
    }

    // Tatkal: wait until the correct opening time then click.
    const tatkalOpenTime = tatkalOpenTimeForToday(trainCoach);
    cy.task(
      'log',
      `[TATKAL] Opening time for ${trainCoach}: ${tatkalOpenTime}. Waiting...`,
    );

    const clickWhenOpen = () => {
      if (hasTatkalAlreadyOpened(trainCoach)) {
        cy.task('log', '[TATKAL] Window is now open — clicking Book Now.');
        cy.wrap(div)
          .contains('button, [class*="book"]', /book now/i, { timeout: 10000 })
          .click();
      } else {
        // Reload and retry every 30 seconds.
        cy.wait(30000);
        cy.reload();
        // Re-find the train div after reload.
        cy.get(':nth-child(n) > .bull-back').each((refreshedDiv) => {
          if (
            refreshedDiv[0].innerText.includes(trainNo) &&
            refreshedDiv[0].innerText.includes(trainCoach)
          ) {
            cy.bookUntilTatkalGetsOpen(
              refreshedDiv,
              trainCoach,
              travelDate,
              trainNo,
              isTatkal,
            );
          }
        });
      }
    };

    clickWhenOpen();
  },
);

// ---------------------------------------------------------------------------
// doPostLoginFlow — everything after successful login:
//   check last transaction modal → station search → quota → search trains
//   → find train → Book Now → passenger form → payment
// ---------------------------------------------------------------------------
Cypress.Commands.add('doPostLoginFlow', (UPI_ID, isValidUpiId) => {
  // ------------------------------------------------------------------
  // Wait for authenticated state
  // ------------------------------------------------------------------
  cy.waitUntilAuthenticated(45000);
  cy.screenshot('01-authenticated-home');

  // ------------------------------------------------------------------
  // Dismiss "Your Last Transaction" dialog if present
  // ------------------------------------------------------------------
  cy.get('body').then(($body) => {
    if ($body[0].innerText.includes('Your Last Transaction')) {
      cy.task('log', 'Dismissing Last Transaction dialog.');
      cy.get(
        '.ui-dialog-footer button, .modal-footer button, .ui-dialog-footer .btn',
        { timeout: 10000 },
      )
        .first()
        .click();
    }
  });

  // ------------------------------------------------------------------
  // FROM station
  // ------------------------------------------------------------------
  cy.get(
    '.ui-autocomplete input[placeholder*="From" i], ' +
      'input[placeholder*="From Station" i], ' +
      '.ng-tns-c57-8 input',
    { timeout: 20000 },
  )
    .first()
    .should('be.visible')
    .clear()
    .type(SOURCE_STATION, { delay: 200 });

  cy.get('#p-highlighted-option, .ui-autocomplete-panel li, .p-autocomplete-panel li', {
    timeout: 10000,
  })
    .first()
    .click();

  cy.task('log', `From station set: ${SOURCE_STATION}`);

  // ------------------------------------------------------------------
  // TO station
  // ------------------------------------------------------------------
  cy.get(
    '.ui-autocomplete input[placeholder*="To" i], ' +
      'input[placeholder*="To Station" i], ' +
      '.ng-tns-c57-9 input',
    { timeout: 10000 },
  )
    .first()
    .should('be.visible')
    .clear()
    .type(DESTINATION_STATION, { delay: 200 });

  cy.get('#p-highlighted-option, .ui-autocomplete-panel li, .p-autocomplete-panel li', {
    timeout: 10000,
  })
    .first()
    .click();

  cy.task('log', `To station set: ${DESTINATION_STATION}`);

  // ------------------------------------------------------------------
  // Travel date
  // ------------------------------------------------------------------
  cy.get('p-calendar input, .ui-calendar input, input[placeholder*="DD/MM/YYYY" i]', {
    timeout: 10000,
  })
    .first()
    .should('be.visible')
    .click();

  cy.focused().clear();

  cy.get('p-calendar input, .ui-calendar input', { timeout: 5000 })
    .first()
    .type(TRAVEL_DATE);

  cy.get('body').type('{esc}');
  cy.task('log', `Travel date set: ${TRAVEL_DATE}`);

  // ------------------------------------------------------------------
  // Quota selection (Tatkal / Premium Tatkal / General)
  // ------------------------------------------------------------------
  if (TATKAL) {
    cy.task('log', 'Selecting TATKAL quota.');
    cy.get('#journeyQuota .ui-dropdown, [formcontrolname="journeyQuota"]', {
      timeout: 10000,
    }).click();
    cy.contains('li.ui-dropdown-item, .p-dropdown-item', /tatkal/i)
      .not(/:contains("premium")/i)
      .first()
      .click();
  }

  if (PREMIUM_TATKAL) {
    cy.task('log', 'Selecting PREMIUM TATKAL quota.');
    cy.get('#journeyQuota .ui-dropdown, [formcontrolname="journeyQuota"]', {
      timeout: 10000,
    }).click();
    cy.contains('li.ui-dropdown-item, .p-dropdown-item', /premium.*tatkal/i)
      .first()
      .click();
  }

  // ------------------------------------------------------------------
  // Search trains
  // ------------------------------------------------------------------
  cy.contains('button', /search|find trains/i, { timeout: 10000 })
    .should('be.enabled')
    .click();

  cy.task('log', 'Searching trains...');
  cy.screenshot('02-train-search-submitted');

  // ------------------------------------------------------------------
  // Train list — find matching train + coach
  // ------------------------------------------------------------------
  cy.get(':nth-child(n) > .bull-back', { timeout: 30000 }).each((div) => {
    if (
      div[0].innerText.includes(TRAIN_NO) &&
      div[0].innerText.includes(TRAIN_COACH)
    ) {
      cy.task('log', `Found train ${TRAIN_NO} with coach ${TRAIN_COACH}.`);

      cy.bookUntilTatkalGetsOpen(div, TRAIN_COACH, TRAVEL_DATE, TRAIN_NO, TATKAL).then(
        () => {
          cy.task('log', 'Book Now clicked / Tatkal window confirmed open.');
        },
      );

      // Wait for passenger form to load
      cy.get('.dull-back.train-Header, .passenger-header, [class*="passenger"]', {
        timeout: 30000,
      }).should('be.visible');

      cy.screenshot('03-passenger-form-loaded');

      // Blank-space click to activate add-passenger button
      cy.get('body').click(100, 300);

      // Add passenger rows for each passenger beyond the first
      for (let i = 1; i < PASSENGER_DETAILS.length; i++) {
        cy.get(
          '.pull-left > a > :nth-child(1), button[class*="add-passenger"], a[class*="add"]',
          { timeout: 10000 },
        )
          .first()
          .click();
      }

      // Wait for form to be stable
      cy.get('.dull-back.train-Header, [class*="passenger"]').should('be.visible');

      // ------------------------------------------------------------------
      // Boarding station change (optional)
      // ------------------------------------------------------------------
      if (BOARDING_STATION) {
        cy.get('.ui-dropdown.ui-widget.ui-corner-all', { timeout: 10000 }).click();
        cy.contains('li.ui-dropdown-item', BOARDING_STATION).click();
        cy.task('log', `Boarding station changed to ${BOARDING_STATION}.`);
      }

      // ------------------------------------------------------------------
      // Passenger Name
      // ------------------------------------------------------------------
      cy.get('.ui-autocomplete input', { timeout: 10000 }).each(
        (inputField, index) => {
          if (PASSENGER_DETAILS && index < PASSENGER_DETAILS.length) {
            const pax = PASSENGER_DETAILS[index];
            if (pax && pax['NAME']) {
              cy.wrap(inputField).clear().type(pax['NAME']);
              cy.task('log', `Passenger ${index + 1} name: ${pax['NAME']}`);
            }
          }
        },
      );

      // ------------------------------------------------------------------
      // Passenger Age
      // ------------------------------------------------------------------
      cy.get('input[formcontrolname="passengerAge"]', { timeout: 10000 }).each(
        (inputDiv, index) => {
          const pax = PASSENGER_DETAILS[index];
          cy.wrap(inputDiv).click().focused().clear();
          cy.wrap(inputDiv).invoke('val', String(pax['AGE'])).trigger('input');
          cy.task('log', `Passenger ${index + 1} age: ${pax['AGE']}`);
        },
      );

      // ------------------------------------------------------------------
      // Passenger Gender
      // ------------------------------------------------------------------
      cy.get('select[formcontrolname="passengerGender"]', { timeout: 10000 }).each(
        (inputDiv, index) => {
          const pax = PASSENGER_DETAILS[index];
          cy.wrap(inputDiv).select(pax['GENDER']);
        },
      );

      // ------------------------------------------------------------------
      // Passenger Berth Preference
      // ------------------------------------------------------------------
      cy.get('select[formcontrolname="passengerBerthChoice"]', { timeout: 10000 }).each(
        (inputDiv, index) => {
          const pax = PASSENGER_DETAILS[index];
          cy.wrap(inputDiv).select(pax['SEAT']);
        },
      );

      // ------------------------------------------------------------------
      // Food Preference (optional — only present on select trains)
      // ------------------------------------------------------------------
      cy.get('body').then(($body) => {
        if ($body.find('select[formcontrolname="passengerFoodChoice"]').length > 0) {
          cy.get('select[formcontrolname="passengerFoodChoice"]').each(
            (inputDiv, index) => {
              const pax = PASSENGER_DETAILS[index];
              cy.wrap(inputDiv).select(pax['FOOD']);
            },
          );
        }
      });

      cy.screenshot('04-passenger-form-filled');

      // ------------------------------------------------------------------
      // "Book only if confirmed berths allotted" + Auto Upgradation
      // ------------------------------------------------------------------
      cy.get('body').then(($body) => {
        if (
          $body[0].innerText.includes('Book only if confirm berths are allotted')
        ) {
          cy.get(':nth-child(2) > .css-label_c').click();
          cy.task('log', 'Selected: Book only if confirmed berths allotted.');
        }
        if ($body[0].innerText.includes('Consider for Auto Upgradation.')) {
          cy.contains('Consider for Auto Upgradation.').click();
          cy.task('log', 'Selected: Consider for Auto Upgradation.');
        }
      });

      // ------------------------------------------------------------------
      // Payment option: UPI (radio button 2)
      // ------------------------------------------------------------------
      cy.get('#\\32  > .ui-radiobutton > .ui-radiobutton-box, input[value="UPI"]', {
        timeout: 10000,
      })
        .first()
        .click();

      cy.task('log', 'UPI payment option selected.');

      // ------------------------------------------------------------------
      // Click "Continue" to go to review/confirmation page
      // ------------------------------------------------------------------
      cy.get('.train_Search, button[class*="continue"], button:contains("Continue")', {
        timeout: 10000,
      })
        .first()
        .should('be.enabled')
        .click();

      cy.task('log', 'Navigating to review page...');
      cy.screenshot('05-review-page');

      // ------------------------------------------------------------------
      // Vande Bharat / No-food confirmation dialog (uncertain, may not appear)
      // ------------------------------------------------------------------
      cy.get('body').then(($body) => {
        if ($body[0].innerText.includes('Confirmation')) {
          cy.get(
            '[icon="fa fa-close"] > .ui-button-text, button.ui-dialog-titlebar-close',
            { timeout: 5000 },
          )
            .first()
            .click();
          cy.task('log', 'Dismissed food confirmation dialog.');
        }
      });

      // ------------------------------------------------------------------
      // Second-stage CAPTCHA (conditional — only if present on review page)
      // ------------------------------------------------------------------
      cy.task('log', 'Checking for second-stage CAPTCHA...');

      cy.solveCaptcha().then(() => {
        cy.task('log', 'Second-stage CAPTCHA step complete.');
        cy.screenshot('06-payment-gateway');

        // ------------------------------------------------------------------
        // Payment gateway — BHIM UPI
        // ------------------------------------------------------------------
        cy.get(':nth-child(3) > .col-pad, [class*="payment-option"]', {
          timeout: 20000,
        })
          .first()
          .click();

        cy.get('.col-sm-9 > app-bank > #bank-type', { timeout: 10000 }).click();

        cy.get(
          '.col-sm-9 > app-bank > #bank-type > :nth-child(2) > table > tr > :nth-child(1) > .col-lg-12 > .border-all > .col-xs-12 > .col-pad',
          { timeout: 10000 },
        ).click();

        // Pay and Book
        cy.get('.btn:contains("Pay"), button[class*="pay"]', { timeout: 10000 })
          .first()
          .click();

        cy.task('log', '[PAYMENT] Pay and Book clicked — waiting for payment gateway.');
        cy.viewport(460, 760);

        // Intercept the Paytm/payment gateway transaction
        cy.intercept('/theia/processTransaction?orderid=*').as('payment');

        cy.wait('@payment', { timeout: 200000 }).then(() => {
          cy.task('log', '[PAYMENT] Payment gateway intercepted.');
          cy.screenshot('07-payment-upi-entry');

          // Enter UPI ID on the gateway page
          if (UPI_ID && isValidUpiId) {
            cy.get('#ptm-upi, input[placeholder*="UPI" i]', { timeout: 15000 })
              .first()
              .click();

            cy.get(
              '.brdr-box > :nth-child(2) > ._1WLd > :nth-child(1) > .xs-hover-box > ._Mzth > .form-ctrl, ' +
                'input[placeholder*="UPI ID" i]',
              { timeout: 10000 },
            )
              .type(UPI_ID);

            cy.get(':nth-child(5) > section > .btn, button[type="submit"]', {
              timeout: 10000,
            })
              .first()
              .click();

            cy.task(
              'log',
              '[PAYMENT] UPI ID entered. Waiting 2 minutes for user to approve in UPI app.',
            );

            // Wait 2 minutes for the user to approve the UPI payment in their app.
            // This is the legitimate payment boundary — user must act.
            cy.wait(120000);

            cy.screenshot('08-payment-awaiting-approval');
          } else {
            cy.task(
              'log',
              '[PAYMENT BOUNDARY] No valid UPI ID configured. Stopping at payment gateway. Set UPI_ID in cypress.env.json.',
            );
            cy.screenshot('PAYMENT-BOUNDARY-no-upi-id');
          }
        });
      });
    }
  });
});
