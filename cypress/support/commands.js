// cypress/support/commands.js
// ---------------------------------------------------------------------------
// IRCTC Cypress Automation — Custom Commands
// Based on shivamguys/irctc-cypress-automation with verified fixes.
//
// KEY FIX in performLogin():
//   Original: Always assumes CAPTCHA image present (fails when no CAPTCHA shown)
//   Fixed:    Detects whether CAPTCHA element exists in DOM before OCR attempt.
//             If no CAPTCHA → Sign In directly. If CAPTCHA → OCR/manual path.
//
// KEY FIX in solveCaptcha():
//   Added DOM check before attempting second-stage captcha solve.
//
// ALL original logic preserved: performLogin retry loop, MANUAL_CAPTCHA support,
// bookUntilTatkalGetsOpen Tatkal timing, full passenger form flow.
// ---------------------------------------------------------------------------

import { formatDate, hasTatkalAlreadyOpened, tatkalOpenTimeForToday } from '../utils/index'
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
} from '../fixtures/passenger_data.json'

const MANUAL_CAPTCHA = Cypress.env('MANUAL_CAPTCHA')

Cypress.on('uncaught:exception', (err, runnable) => {
  return false
})

// ---------------------------------------------------------------------------
// submitCaptcha
// FIXED: Now checks whether CAPTCHA element exists in DOM before OCR.
// If CAPTCHA absent → calls Sign In directly (current IRCTC behavior).
// If CAPTCHA present → uses OCR or manual path (original behavior preserved).
// ---------------------------------------------------------------------------
Cypress.Commands.add('submitCaptcha', () => {
  let LOGGED_IN = false
  performLogin(LOGGED_IN)
})

// ---------------------------------------------------------------------------
// solveCaptcha — second-stage CAPTCHA on review/confirmation page
// FIXED: Added DOM presence check before attempting OCR.
// ---------------------------------------------------------------------------
Cypress.Commands.add('solveCaptcha', () => {
  cy.get('body').then(($body) => {
    const hasCaptcha = $body.find('.captcha-img').length > 0
    if (!hasCaptcha) {
      cy.task('log', '[CAPTCHA2] No second-stage captcha detected — continuing.')
      return
    }
    solveCaptcha()
  })
})

// ---------------------------------------------------------------------------
// bookUntilTatkalGetsOpen — waits for Tatkal window then clicks Book Now
// ---------------------------------------------------------------------------
Cypress.Commands.add(
  'bookUntilTatkalGetsOpen',
  (div, TRAIN_COACH, TRAVEL_DATE, TRAIN_NO, TATKAL) => {
    BOOK_UNTIL_TATKAL_OPENS(div, TRAIN_COACH, TRAVEL_DATE, TRAIN_NO, TATKAL)
  },
)

// ---------------------------------------------------------------------------
// doPostLoginFlow — everything after successful login:
//   dismiss last-transaction modal → fill From/To/Date → quota → search
//   → find train → Tatkal/General Book Now → passenger form → payment
// ---------------------------------------------------------------------------
Cypress.Commands.add('doPostLoginFlow', (UPI_ID, isValidUpiId) => {
  const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.]+$/

  // Dismiss "Your Last Transaction" dialog
  cy.get('body').then((el) => {
    if (el[0].innerText.includes('Your Last Transaction')) {
      cy.task('log', 'Dismissing Last Transaction dialog.')
      cy.get('.ui-dialog-footer > .ng-tns-c19-3 > .text-center > .btn, .ui-dialog-footer .btn', {
        timeout: 10000,
      })
        .first()
        .click()
    }
  })

  // ------------------------------------------------------------------
  // FROM station
  // FIX: Use placeholder-based selector + fallback to ng-tns class
  // ------------------------------------------------------------------
  cy.get(
    'input[placeholder="From"], .ui-autocomplete > .ng-tns-c57-8 input, ' +
      '.ui-autocomplete input[id*="origin"], .ui-autocomplete input',
    { timeout: 20000 },
  )
    .first()
    .should('be.visible')
    .type(SOURCE_STATION, { delay: 600 })

  cy.get('#p-highlighted-option, .ui-autocomplete-panel li', { timeout: 10000 })
    .first()
    .click()

  cy.task('log', `From station set: ${SOURCE_STATION}`)

  // ------------------------------------------------------------------
  // TO station
  // ------------------------------------------------------------------
  cy.get(
    'input[placeholder="To"], .ui-autocomplete > .ng-tns-c57-9 input, ' +
      '.ui-autocomplete input[id*="destination"]',
    { timeout: 10000 },
  )
    .first()
    .should('be.visible')
    .type(DESTINATION_STATION, { delay: 600 })

  cy.get('#p-highlighted-option, .ui-autocomplete-panel li', { timeout: 10000 })
    .first()
    .click()

  cy.task('log', `To station set: ${DESTINATION_STATION}`)

  // ------------------------------------------------------------------
  // Travel date
  // ------------------------------------------------------------------
  cy.get('.ui-calendar, p-calendar', { timeout: 10000 }).should('be.visible').click()
  cy.focused().clear()
  cy.get('.ui-calendar').type(TRAVEL_DATE)

  // ------------------------------------------------------------------
  // Quota (Tatkal / Premium Tatkal)
  // FIX: Text-based matching instead of brittle :nth-child indices
  // ------------------------------------------------------------------
  if (TATKAL) {
    cy.task('log', 'Selecting TATKAL quota.')
    cy.get('#journeyQuota > .ui-dropdown, [id="journeyQuota"] .ui-dropdown', {
      timeout: 10000,
    }).click()
    // Try text match first; fall back to index if text fails
    cy.get('body').then(($body) => {
      const hasTextOption = $body.find('.ui-dropdown-item').filter(':contains("Tatkal")').length > 0
      if (hasTextOption) {
        cy.contains('.ui-dropdown-item', /^Tatkal$/i).click()
      } else {
        cy.get(':nth-child(6) > .ui-dropdown-item').click()
      }
    })
  }

  if (PREMIUM_TATKAL) {
    cy.task('log', 'Selecting PREMIUM TATKAL quota.')
    cy.get('#journeyQuota > .ui-dropdown', { timeout: 10000 }).click()
    cy.get('body').then(($body) => {
      const hasTextOption =
        $body.find('.ui-dropdown-item').filter(':contains("Premium Tatkal")').length > 0
      if (hasTextOption) {
        cy.contains('.ui-dropdown-item', /Premium Tatkal/i).click()
      } else {
        cy.get(':nth-child(7) > .ui-dropdown-item').click()
      }
    })
  }

  // ------------------------------------------------------------------
  // Search button
  // FIX: Use last .search_btn (the search form button, not the login button)
  // ------------------------------------------------------------------
  cy.get('.search_btn, .col-md-3 > .search_btn, button[class*="search"]', { timeout: 10000 })
    .last()
    .should('be.visible')
    .click()

  cy.task('log', 'Search submitted — waiting for train list...')

  // ------------------------------------------------------------------
  // Train list — iterate and find matching train + coach
  // ------------------------------------------------------------------
  cy.get(':nth-child(n) > .bull-back', { timeout: 30000 }).each((div) => {
    if (div[0].innerText.includes(TRAIN_NO) && div[0].innerText.includes(TRAIN_COACH)) {
      cy.task('log', `Found train ${TRAIN_NO} coach ${TRAIN_COACH}. Proceeding...`)

      cy.bookUntilTatkalGetsOpen(div, TRAIN_COACH, TRAVEL_DATE, TRAIN_NO, TATKAL).then(() => {
        cy.task('log', 'TATKAL TIME STARTED / Book Now clicked.')
      })

      // Wait for passenger form header
      cy.get('.dull-back.train-Header, [class*="train-Header"]', { timeout: 30000 })

      // Blank-area click to enable Add Passenger button
      cy.get('.fill > :nth-child(2), body').first().click(100, 300)

      // Add passenger rows
      for (let i = 0; i < PASSENGER_DETAILS.length; i++) {
        if (i > 0) {
          cy.get('.pull-left > a > :nth-child(1), a[class*="add-pass"]', { timeout: 10000 })
            .first()
            .click()
        }
      }

      cy.get('.dull-back.train-Header')

      // Boarding station change (optional)
      if (BOARDING_STATION) {
        cy.get('.ui-dropdown.ui-widget.ui-corner-all', { timeout: 10000 }).click()
        cy.contains('li.ui-dropdown-item', BOARDING_STATION).then((li) => {
          cy.wrap(li).click()
        })
        cy.task('log', `Boarding station changed to ${BOARDING_STATION}`)
      }

      // Passenger Name
      cy.get('.ui-autocomplete input', { timeout: 10000 }).each((inputField, index) => {
        if (PASSENGER_DETAILS && index < PASSENGER_DETAILS.length) {
          const pax = PASSENGER_DETAILS[index]
          if (pax && pax['NAME']) {
            cy.task('log', `Filling name for passenger ${index + 1}: ${pax['NAME']}`)
            cy.wrap(inputField).clear().type(pax['NAME'])
          } else {
            cy.task('log', `'NAME' property missing for passenger index ${index}`)
          }
        } else {
          cy.task('log', `No passenger data for index ${index}`)
        }
      })

      // Passenger Age
      cy.get('input[formcontrolname="passengerAge"]', { timeout: 10000 }).each(
        (inputDiv, index) => {
          cy.wrap(inputDiv).click()
          cy.wrap(inputDiv).focused().clear()
          const pax = PASSENGER_DETAILS[index]
          cy.wrap(inputDiv).invoke('val', pax['AGE']).trigger('input')
          cy.task('log', `Age filed for passenger ${index + 1}`)
        },
      )

      // Passenger Gender
      cy.get('select[formcontrolname="passengerGender"]', { timeout: 10000 }).each(
        (inputDiv, index) => {
          const pax = PASSENGER_DETAILS[index]
          cy.wrap(inputDiv).select(pax['GENDER'])
        },
      )

      // Berth Preference
      cy.get('select[formcontrolname="passengerBerthChoice"]', { timeout: 10000 }).each(
        (inputDiv, index) => {
          const pax = PASSENGER_DETAILS[index]
          cy.wrap(inputDiv).select(pax['SEAT'])
        },
      )

      // Food Choice (optional — only on select trains like Vande Bharat/Rajdhani)
      cy.get('body').then(($body) => {
        if ($body.find('select[formcontrolname="passengerFoodChoice"]').length > 0) {
          cy.get('select[formcontrolname="passengerFoodChoice"]').each((inputDiv, index) => {
            const pax = PASSENGER_DETAILS[index]
            cy.wrap(inputDiv).select(pax['FOOD'])
          })
        }
      })

      // "Book only if confirmed berths allotted" + Auto Upgradation
      cy.get('body').then((el) => {
        if (el[0].innerText.includes('Book only if confirm berths are allotted')) {
          cy.get(':nth-child(2) > .css-label_c').click()
          cy.task('log', 'Selected: Book only if confirmed berths allotted.')
        }
        if (el[0].innerText.includes('Consider for Auto Upgradation.')) {
          cy.contains('Consider for Auto Upgradation.').click()
          cy.task('log', 'Selected: Auto Upgradation.')
        }
      })

      // UPI Payment option (radio button #2)
      cy.get('#\\32  > .ui-radiobutton > .ui-radiobutton-box', { timeout: 10000 }).click()
      cy.task('log', 'UPI payment option selected.')

      // Continue to review page
      cy.get('.train_Search, button:contains("Continue"), .btn-search', { timeout: 10000 })
        .first()
        .should('be.enabled')
        .click()
      cy.task('log', 'Navigating to review page...')

      // Vande Bharat no-food confirmation dialog (uncertain)
      cy.get('body').then((el) => {
        if (el[0].innerText.includes('Confirmation')) {
          cy.get('[icon="fa fa-close"] > .ui-button-text, .ui-dialog-titlebar-close', {
            timeout: 5000,
          })
            .first()
            .click()
          cy.task('log', 'Dismissed food confirmation dialog.')
        }
      })

      // Second-stage CAPTCHA (conditional)
      cy.task('log', 'Checking second-stage CAPTCHA...')
      cy.solveCaptcha().then(() => {
        cy.task('log', 'Second CAPTCHA step complete — proceeding to payment gateway.')

        // BHIM UPI payment gateway
        cy.get(':nth-child(3) > .col-pad, [class*="payment-method"]', { timeout: 20000 })
          .first()
          .click()
        cy.get('.col-sm-9 > app-bank > #bank-type', { timeout: 10000 }).click()
        cy.get(
          '.col-sm-9 > app-bank > #bank-type > :nth-child(2) > table > tr > :nth-child(1) > .col-lg-12 > .border-all > .col-xs-12 > .col-pad',
          { timeout: 10000 },
        ).click()

        // Pay and Book
        cy.get('.btn, button:contains("Pay")', { timeout: 10000 }).first().click()
        cy.task('log', '[PAYMENT] Pay and Book clicked.')

        // Viewport adjustment for Paytm mobile
        cy.viewport(460, 760)

        cy.intercept('/theia/processTransaction?orderid=*').as('payment')

        cy.wait('@payment', { timeout: 200000 }).then((interception) => {
          cy.task('log', '[PAYMENT] Gateway intercepted. Entering UPI ID...')

          if (UPI_ID && isValidUpiId) {
            cy.get('#ptm-upi, [id*="upi"]', { timeout: 15000 }).first().click()
            cy.get(
              '.brdr-box > :nth-child(2) > ._1WLd > :nth-child(1) > .xs-hover-box > ._Mzth > .form-ctrl, ' +
                'input[placeholder*="UPI ID" i]',
              { timeout: 10000 },
            ).type(UPI_ID)
            cy.get(':nth-child(5) > section > .btn, button[type="submit"]', {
              timeout: 10000,
            })
              .first()
              .click()
            cy.task(
              'log',
              '[PAYMENT] UPI ID entered. Waiting 2 min for user to approve in UPI app.',
            )
            // Give user 2 minutes to approve UPI push notification
            cy.wait(120000)
          } else {
            cy.task(
              'log',
              '[PAYMENT BOUNDARY] No valid UPI_ID configured. Stopped at payment gateway. Set UPI_ID in cypress.env.json or as a workflow input.',
            )
          }
        })
      })
    }
  })
})

// ---------------------------------------------------------------------------
// performLogin — the full login retry loop from the original.
// FIXED: Added CAPTCHA DOM detection before branching to OCR vs direct Sign In.
// ---------------------------------------------------------------------------
function performLogin(LOGGED_IN) {
  if (!LOGGED_IN) {
    cy.wait(500)

    cy.get('body')
      .should('be.visible')
      .then((el) => {
        const bodyText = el[0].innerText

        if (bodyText.includes('Logout') || bodyText.includes('My Account')) {
          cy.task('log', 'Logged in successfully.')
          return
        }

        // Login panel is open when "FORGOT ACCOUNT DETAILS" or "Sign In" visible
        const loginPanelOpen =
          bodyText.includes('FORGOT ACCOUNT DETAILS') ||
          bodyText.includes('Sign In') ||
          el[0].querySelector('input[placeholder="User Name"]') !== null

        if (loginPanelOpen && !bodyText.includes('Please Wait...')) {
          // FIXED: Check for CAPTCHA element in DOM before deciding OCR vs direct
          const captchaElement = el[0].querySelector('.captcha-img')
          const hasCaptcha = captchaElement !== null

          if (!hasCaptcha) {
            // Current observed IRCTC behavior: No CAPTCHA shown → click Sign In directly
            cy.task('log', '[LOGIN] No CAPTCHA detected — clicking Sign In directly.')
            cy.contains('button, .btn', /^Sign In$|^SIGN IN$/i, { timeout: 10000 })
              .should('be.enabled')
              .click()

            // Retry loop — check if login succeeded or if CAPTCHA appeared
            cy.wait(2000)
            cy.get('body').then((updatedEl) => {
              const updatedText = updatedEl[0].innerText
              if (updatedText.includes('Logout') || updatedText.includes('My Account')) {
                cy.task('log', '[LOGIN] Login successful (no CAPTCHA path).')
              } else if (updatedEl[0].querySelector('.captcha-img')) {
                // CAPTCHA appeared after login attempt — now solve it
                cy.task('log', '[LOGIN] CAPTCHA appeared after first attempt — solving.')
                if (MANUAL_CAPTCHA) {
                  cy.get('#captcha').focus()
                  cy.get('.search_btn.loginText')
                    .should('include.text', 'Logout')
                    .then(() => {
                      performLogin(true)
                    })
                } else {
                  solveAndRetryLogin()
                }
              } else if (updatedText.includes('Invalid Password')) {
                cy.task('log', '[LOGIN ERROR] Invalid password.')
              } else {
                performLogin(LOGGED_IN)
              }
            })
          } else {
            // CAPTCHA present — use OCR or manual path (original logic)
            cy.task('log', '[LOGIN] CAPTCHA detected — using OCR/manual path.')
            if (MANUAL_CAPTCHA) {
              cy.get('#captcha').focus()
              cy.get('.search_btn.loginText')
                .should('include.text', 'Logout')
                .then(() => {
                  performLogin(true)
                })
            } else {
              solveAndRetryLogin()
            }
          }
        } else {
          // Not yet on login panel — retry
          performLogin(LOGGED_IN)
        }
      })
  }
}

// ---------------------------------------------------------------------------
// solveAndRetryLogin — calls OCR server, enters CAPTCHA, retries on failure
// ---------------------------------------------------------------------------
function solveAndRetryLogin() {
  cy.get('.captcha-img', { timeout: 10000 })
    .invoke('attr', 'src')
    .then((value) => {
      cy.request({
        method: 'POST',
        url: 'http://localhost:5000/extract-text',
        body: { image: value },
        timeout: 30000,
        failOnStatusCode: false,
      }).then((response) => {
        if (response.status !== 200 || !response.body?.extracted_text) {
          cy.task('log', '[CAPTCHA] OCR server failed. Check that localhost:5000 is running.')
          return
        }
        const extractedText = response.body.extracted_text
        cy.task('log', `[CAPTCHA] OCR text received (len=${extractedText.length}).`)

        cy.get('#captcha').clear().type(extractedText).type('{enter}')

        cy.get('body').then((el) => {
          if (el[0].innerText.includes('Invalid Captcha')) {
            cy.task('log', '[CAPTCHA] Invalid — retrying OCR.')
            solveAndRetryLogin()
          } else {
            performLogin(false)
          }
        })
      })
    })
}

// ---------------------------------------------------------------------------
// solveCaptcha — second-stage CAPTCHA (on review/confirmation page)
// ---------------------------------------------------------------------------
function solveCaptcha() {
  if (MANUAL_CAPTCHA) {
    cy.task('log', '[CAPTCHA2] Manual mode — waiting 30s for human entry.')
    cy.wait(30000)
    cy.contains('button', /Continue|Confirm|Proceed/i).should('be.enabled').click()
    return
  }

  cy.get('.captcha-img', { timeout: 10000 })
    .invoke('attr', 'src')
    .then((value) => {
      cy.request({
        method: 'POST',
        url: 'http://localhost:5000/extract-text',
        body: { image: value },
        timeout: 30000,
        failOnStatusCode: false,
      }).then((response) => {
        if (response.status !== 200 || !response.body?.extracted_text) {
          cy.task('log', '[CAPTCHA2] OCR server failed.')
          return
        }
        const extractedText = response.body.extracted_text
        cy.task('log', `[CAPTCHA2] Solved: len=${extractedText.length}`)

        cy.get('#captcha').clear().type(extractedText)

        cy.get('body').then((el) => {
          if (el[0].innerText.includes('Invalid Captcha')) {
            cy.task('log', '[CAPTCHA2] Invalid — retrying.')
            solveCaptcha()
          } else {
            cy.contains('button', /Continue|Confirm|Proceed/i)
              .should('be.enabled')
              .click()
          }
        })
      })
    })
}

// ---------------------------------------------------------------------------
// BOOK_UNTIL_TATKAL_OPENS — Tatkal timing logic (preserved from original)
// ---------------------------------------------------------------------------
function BOOK_UNTIL_TATKAL_OPENS(div, TRAIN_COACH, TRAVEL_DATE, TRAIN_NO, TATKAL) {
  if (!TATKAL) {
    // General booking — click Book Now immediately
    cy.wrap(div)
      .contains('button, [class*="book"], .btnDefault', /BOOK NOW|Book Now/i, { timeout: 10000 })
      .first()
      .click()
    return
  }

  // Tatkal: check if window is open; if not, wait and reload
  const openTimeStr = tatkalOpenTimeForToday(TRAIN_COACH)
  cy.task('log', `[TATKAL] Coach ${TRAIN_COACH} opens at ${openTimeStr} IST.`)

  const checkAndBook = () => {
    if (hasTatkalAlreadyOpened(TRAIN_COACH)) {
      cy.task('log', '[TATKAL] Window is open — clicking Book Now.')
      cy.wrap(div)
        .contains('button, [class*="book"], .btnDefault', /BOOK NOW|Book Now/i, {
          timeout: 10000,
        })
        .first()
        .click()
    } else {
      cy.task('log', '[TATKAL] Not open yet — waiting 30s and reloading.')
      cy.wait(30000)
      cy.reload()
      cy.get(':nth-child(n) > .bull-back', { timeout: 30000 }).each((refreshedDiv) => {
        if (
          refreshedDiv[0].innerText.includes(TRAIN_NO) &&
          refreshedDiv[0].innerText.includes(TRAIN_COACH)
        ) {
          BOOK_UNTIL_TATKAL_OPENS(refreshedDiv, TRAIN_COACH, TRAVEL_DATE, TRAIN_NO, TATKAL)
        }
      })
    }
  }

  checkAndBook()
}
