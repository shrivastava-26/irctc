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

import { hasTatkalAlreadyOpened, tatkalOpenTimeForToday } from '../utils/index'
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
} from '../support/configLoader'

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
    'input[placeholder="From"], ' +
      '.ui-autocomplete input[id*="origin"], .ui-autocomplete input',
    { timeout: 20000 },
  )
    .first()
    .should('be.visible')
    .type(SOURCE_STATION, { delay: 600 })

  cy.get('.ui-autocomplete-items li, #p-highlighted-option, .ui-autocomplete-panel li', { timeout: 10000 }).filter(':visible')
    .first()
    .click()

  cy.task('log', `From station set: ${SOURCE_STATION}`)

  // ------------------------------------------------------------------
  // TO station
  // ------------------------------------------------------------------
  cy.get('input[placeholder="To"], .ui-autocomplete input[id*="destination"], .ui-autocomplete input', { timeout: 10000 }).eq(1).should('be.visible').type(DESTINATION_STATION, { delay: 600 })

  cy.get('#p-highlighted-option, .ui-autocomplete-panel li', { timeout: 10000 })
    .first()
    .click()

  cy.task('log', `To station set: ${DESTINATION_STATION}`)

  // ------------------------------------------------------------------
  // Travel date
  // ------------------------------------------------------------------
  cy.get('.ui-calendar, p-calendar input', { timeout: 10000 }).first().should('be.visible').click()
  cy.focused().clear()
  cy.get('.ui-calendar, p-calendar input').first().type(TRAVEL_DATE, { delay: 100 })

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
  cy.get('button.search_btn, button[type="submit"].search_btn, button[label="Find Trains"], button[class*="search"]', { timeout: 10000 }).filter(':visible').first().should('be.visible').click({ force: true })

  cy.task('log', 'Search submitted — waiting for train list...')

  // ------------------------------------------------------------------
  // Train list — iterate and find matching train + coach
  // ------------------------------------------------------------------
  let trainFound = false;
    cy.get(':nth-child(n) > .bull-back', { timeout: 30000 }).each((div) => {
    if (div[0].innerText.includes(TRAIN_NO) && div[0].innerText.includes(TRAIN_COACH)) {
      trainFound = true;
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
          if (pax && pax['SEAT'] && pax['SEAT'].toLowerCase() !== 'no preference') {
            cy.wrap(inputDiv).select(pax['SEAT'])
          } else {
            cy.task('log', `Leaving berth choice untouched/default for passenger ${index + 1}`)
          }
        },
      )

      // Food Choice (optional — only on select trains like Vande Bharat/Rajdhani)
      cy.get('body').then(($body) => {
        if ($body.find('select[formcontrolname="passengerFoodChoice"]').length > 0) {
          cy.get('select[formcontrolname="passengerFoodChoice"]').each((inputDiv, index) => {
            const pax = PASSENGER_DETAILS[index]
            if (pax && pax['FOOD'] && pax['FOOD'].toLowerCase() !== 'no food') {
              cy.wrap(inputDiv).select(pax['FOOD'])
            } else {
              cy.task('log', `Leaving food choice untouched/default for passenger ${index + 1}`)
            }
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
            
cy.get('body', { timeout: 180000 }).should(($b) => {
  const text = $b.text().toUpperCase()
  const success = text.includes('CONGRATULATIONS') || text.includes('PNR NO')
  const failure = text.includes('TRANSACTION DECLINED') || text.includes('TRANSACTION FAILED')
  expect(success || failure, 'Waiting for payment outcome').to.be.true
}).then(($b) => {
  const text = $b.text().toUpperCase()
  if (text.includes('CONGRATULATIONS') || text.includes('PNR NO')) {
    const pnrMatch = text.match(/PNR\s*NO\s*:?\s*(\d{10})/i)
    if (pnrMatch) {
      cy.task('log', 'PNR: ' + pnrMatch[1])
    } else {
      cy.task('log', 'PNR: NOT_FOUND_IN_DOM')
    }
  } else {
    throw new Error('Payment Failed or Declined.')
  }
})

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

        if (bodyText.includes('LOGOUT') || bodyText.includes('MY ACCOUNT') || bodyText.includes('WELCOME')) {
          cy.task('log', 'Logged in successfully.')
          return
        }

        // Login panel is open when "FORGOT ACCOUNT DETAILS" or "Sign In" visible
        const loginPanelOpen =
          bodyText.includes('FORGOT ACCOUNT DETAILS') || bodyText.includes('SIGN IN') ||
          el[0].querySelector('input[placeholder="User Name"]') !== null

        if (loginPanelOpen && !bodyText.includes('PLEASE WAIT...')) {
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
              if (updatedText.toUpperCase().includes('LOGOUT') || updatedText.toUpperCase().includes('MY ACCOUNT')) {
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
              } else if (updatedText.toUpperCase().includes('INVALID PASSWORD')) {
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
  cy.wrap(div).scrollIntoView({ offset: { top: -200, left: 0 } });
  cy.wait(1000);
  cy.wrap(div).find('div, td, li').filter((i, el) => Cypress.$(el).text().includes(TRAIN_COACH) && Cypress.$(el).text().match(/Refresh/i)).last().click();
  cy.wait(5000);
  
  // MINIMAL FIX: Click the date tile to select the class before clicking Book Now
  cy.wrap(div).find('div.pre-avl').first().click();
  
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

// ---------------------------------------------------------------------------
// Entry / authenticated-flow commands used by irctc-entry.cy.js,
// irctc-login.cy.js, irctc-train-search.cy.js, and irctc-booking-flow.cy.js.
//
// RECOVERED from commit efe8699 ("feat: add authenticated login, train
// search, and booking flow specs"), which defined these commands before a
// later commit (8671558) replaced this file with the single-flow
// submitCaptcha/solveCaptcha/doPostLoginFlow architecture above and left the
// four specs referencing them. Both architectures are preserved side by
// side, unmerged, as separate entry points (irctc.cy.js uses the flow above;
// the other four specs use the flow below).
//
// Architecture rules (from the original, unchanged):
//   1. Live DOM is the authority. No stale hardcoded selectors.
//   2. CAPTCHA / OTP / payment must never be automated or bypassed.
//      The commands below stop and screenshot at those boundaries.
//   3. Credentials are read from Cypress.env() — never hardcoded.
//   4. Only non-sensitive page-state facts may be logged.
//
// ADAPTATION: the original visitIrctcEntry() visited a path relative to
// `baseUrl: 'https://www.irctc.co.in'`, which no longer exists in this
// project's cypress.config.js. It now visits the same absolute URL that
// irctc.cy.js already uses, instead of reintroducing a global baseUrl
// (which would add an external-URL preflight check to every spec run).
// Everything else below is unchanged from the recovered original.
// ---------------------------------------------------------------------------

const ENTRY_URL = 'https://www.irctc.co.in/nget/train-search'

const visibleText = ($body) => $body.text().replace(/\s+/g, ' ').trim()

/** Snapshot the key booleans that describe what IRCTC currently shows. */
const pageState = ($body) => {
  const text = visibleText($body)

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
  }
}

// ---------------------------------------------------------------------------
// visitIrctcEntry
// ---------------------------------------------------------------------------
Cypress.Commands.add('visitIrctcEntry', () => {
  // Use on-before-load hook to set a real desktop UA so IRCTC's WAF doesn't
  // serve a 403/ESOCKETTIMEDOUT to the headless Electron/Chrome process.
  cy.visit(ENTRY_URL, {
    failOnStatusCode: false,
    onBeforeLoad(win) {
      Object.defineProperty(win.navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/126.0.0.0 Safari/537.36',
        configurable: true,
      })
    },
  })
  cy.get('body', { timeout: 90_000 }).should('be.visible')
  cy.get('body').then(($body) => {
    const state = pageState($body)
    cy.task('reportIrctcState', state)

    if (state.accessDenied) {
      throw new Error(
        'IRCTC returned an access-denied page. ' +
          'This is a WAF/network state, not a selector failure. ' +
          'Use a headed Chrome run: npx cypress run --headed --browser chrome',
      )
    }
  })
})

// ---------------------------------------------------------------------------
// dismissLanguageChoiceIfPresent
// ---------------------------------------------------------------------------
Cypress.Commands.add('dismissLanguageChoiceIfPresent', () => {
  cy.get('body').then(($body) => {
    const state = pageState($body)
    if (!state.languageChoice) return

    cy.contains('button, [role="button"], a', /^English$/i, {
      timeout: 10_000,
    })
      .should('be.visible')
      .click()

    cy.get('body').should(($updatedBody) => {
      expect(visibleText($updatedBody)).not.to.match(
        /please select your preferred language/i,
      )
    })
  })
})

// ---------------------------------------------------------------------------
// reportCurrentIrctcState
// ---------------------------------------------------------------------------
Cypress.Commands.add('reportCurrentIrctcState', () => {
  cy.get('body').then(($body) => {
    cy.task('reportIrctcState', pageState($body))
  })
})

// ---------------------------------------------------------------------------
// stopForSecurityChallenge
// If CAPTCHA/OTP is present → screenshot + throw (human must act).
// If absent → no-op (do not block the test flow).
// ---------------------------------------------------------------------------
Cypress.Commands.add('stopForSecurityChallenge', () => {
  cy.get('body').then(($body) => {
    const state = pageState($body)

    if (state.captcha) {
      cy.screenshot('SECURITY-CHALLENGE-captcha')
      throw new Error(
        '[SECURITY BOUNDARY] IRCTC is showing a CAPTCHA. ' +
          'A screenshot has been saved. ' +
          'Manual completion is required — this test will not solve or bypass it.',
      )
    }

    if (state.otp) {
      cy.screenshot('SECURITY-CHALLENGE-otp')
      throw new Error(
        '[SECURITY BOUNDARY] IRCTC is asking for an OTP. ' +
          'A screenshot has been saved. ' +
          'Manual completion is required — this test will not solve or bypass it.',
      )
    }

    // No CAPTCHA / OTP detected — log and continue.
    cy.task('log', 'No CAPTCHA or OTP detected — continuing.')
  })
})

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
    .click()

  // After clicking, the login panel opens. Verify by checking for a password
  // input — the most stable evidence of the login form being open.
  cy.get('input[type="password"]', { timeout: 20_000 }).should('be.visible')
})

// ---------------------------------------------------------------------------
// loginFromEnvironment
// Reads IRCTC_USERNAME / IRCTC_PASSWORD from Cypress env (cypress.env.json).
// ---------------------------------------------------------------------------
Cypress.Commands.add('loginFromEnvironment', () => {
  const username = Cypress.env('IRCTC_USERNAME')
  const password = Cypress.env('IRCTC_PASSWORD')

  if (!username || !password) {
    throw new Error(
      'IRCTC_USERNAME and IRCTC_PASSWORD env vars are required. ' +
        'Create cypress.env.json with those keys (it is gitignored).',
    )
  }

  // Find the username field by its proximity to the password field in the
  // same form — avoids hardcoding a selector that IRCTC changes frequently.
  cy.get('input[type="password"]', { timeout: 10_000 }).then(($password) => {
    const $form = $password.first().closest('form, .login-form, [class*="login"]')
    // Try the form first; fall back to any visible text input on the page.
    let $usernameField = $form.find('input:not([type="password"])').filter(':visible').first()
    if (!$usernameField.length) {
      $usernameField = Cypress.$('input[type="text"]:visible, input[type="email"]:visible').first()
    }
    expect($usernameField, 'visible username input in the live login form').to.have.length.greaterThan(0)
    cy.wrap($usernameField).clear().type(username, { log: false })
  })

  cy.get('input[type="password"]').first().clear().type(password, { log: false })

  // "Sign In" button — text-matched for resilience.
  cy.contains('button, [role="button"]', /sign\s*in/i)
    .should('be.enabled')
    .click()
})

// ---------------------------------------------------------------------------
// waitForPostLoginUI
// Asserts that IRCTC has transitioned to the authenticated home screen.
// ---------------------------------------------------------------------------
Cypress.Commands.add('waitForPostLoginUI', () => {
  cy.get('body', { timeout: 45_000 }).should(($body) => {
    const state = pageState($body)
    if (state.captcha || state.otp) return // handled separately by stopForSecurityChallenge
    expect(
      state.authenticatedBookTicket || state.loginTrigger === false,
      'authenticated IRCTC booking UI (Book Ticket visible, Logout visible)',
    ).to.be.true
  })
})

// ---------------------------------------------------------------------------
// searchTrains
// Fills the train-search form with fixture data and submits.
// Reads from the booking fixture: SOURCE_STATION, DESTINATION_STATION,
// TRAVEL_DATE (DD/MM/YYYY), TRAIN_COACH.
// ---------------------------------------------------------------------------
Cypress.Commands.add('searchTrains', (booking) => {
  const { SOURCE_STATION, DESTINATION_STATION, TRAVEL_DATE } = booking

  // --- From station ---
  // IRCTC uses a p-autocomplete component. Type to trigger the dropdown,
  // then pick the first matching suggestion.
  cy.get('input[placeholder*="From" i], input[id*="origin" i], input[aria-label*="from" i]', {
    timeout: 20_000,
  })
    .first()
    .should('be.visible')
    .clear()
    .type(SOURCE_STATION.substring(0, 3))

  cy.get('.ui-autocomplete-panel li, .p-autocomplete-panel li, [class*="autocomplete"] li', {
    timeout: 10_000,
  })
    .first()
    .click()

  // --- To station ---
  cy.get('input[placeholder*="To" i], input[id*="destination" i], input[aria-label*="to" i]', {
    timeout: 10_000,
  })
    .first()
    .should('be.visible')
    .clear()
    .type(DESTINATION_STATION.substring(0, 3))

  cy.get('.ui-autocomplete-panel li, .p-autocomplete-panel li, [class*="autocomplete"] li', {
    timeout: 10_000,
  })
    .first()
    .click()

  // --- Travel date ---
  // Clear then type the date. IRCTC date picker accepts keyboard entry.
  cy.get('input[placeholder*="Date" i], input[id*="jrdate" i], p-calendar input', {
    timeout: 10_000,
  })
    .first()
    .should('be.visible')
    .clear()
    .type(TRAVEL_DATE)

  // Close any open calendar overlay by pressing Escape.
  cy.get('body').type('{esc}')

  // --- Search button ---
  cy.contains('button', /search/i).should('be.enabled').click()

  // Assert train list rendered.
  cy.get('body', { timeout: 30_000 }).should(($body) => {
    const text = visibleText($body)
    expect(text).to.match(/available trains|no train|train list/i)
  })
})

// ---------------------------------------------------------------------------
// selectTrainAndClass
// Selects a specific train by number (or the first available) and a coach class.
// ---------------------------------------------------------------------------
Cypress.Commands.add('selectTrainAndClass', (booking) => {
  const { TRAIN_NO, TRAIN_COACH } = booking

  if (TRAIN_NO) {
    // Click the specific train row.
    cy.contains('[class*="train"], tr', TRAIN_NO, { timeout: 15_000 })
      .should('be.visible')
      .click()
  }

  // Select the class tab/button (e.g. "SL", "3A", "2A").
  cy.contains('button, td, [class*="class"], [class*="quota"]', TRAIN_COACH, {
    timeout: 10_000,
  })
    .should('be.visible')
    .click()

  // Click "Book Now" for that class.
  cy.contains('button', /book now/i, { timeout: 10_000 })
    .first()
    .should('be.enabled')
    .click()
})

// ---------------------------------------------------------------------------
// fillPassengerForm
// Fills one or more passenger rows from the fixture.
// STOPS at the payment page — never clicks Pay.
// ---------------------------------------------------------------------------
Cypress.Commands.add('fillPassengerForm', (booking) => {
  const passengers = booking.PASSENGER_DETAILS || []

  if (!passengers.length) {
    throw new Error(
      'No passengers in booking fixture PASSENGER_DETAILS. ' +
        'Add at least one passenger to cypress/fixtures/booking.json.',
    )
  }

  // Wait for the passenger form to load.
  cy.contains(/passenger.*detail|traveller.*detail|add passenger/i, {
    timeout: 30_000,
  }).should('be.visible')

  passengers.forEach((pax, idx) => {
    // If there is an "Add Passenger" button (after the first), click it.
    if (idx > 0) {
      cy.contains('button', /add passenger|add traveller/i)
        .should('be.visible')
        .click()
    }

    // Name — find the nth passenger name row.
    cy.get('input[placeholder*="Name" i]').eq(idx).clear().type(pax.name)

    // Age
    cy.get('input[placeholder*="Age" i]').eq(idx).clear().type(String(pax.age))

    // Gender — select from dropdown.
    cy.get('select[id*="gender" i], p-dropdown[placeholder*="Gender" i]')
      .eq(idx)
      .then(($el) => {
        if ($el.is('select')) {
          cy.wrap($el).select(pax.gender) // 'Male', 'Female', 'Transgender'
        } else {
          // PrimeNG p-dropdown.
          cy.wrap($el).click()
          cy.contains('.p-dropdown-item', pax.gender).click()
        }
      })

    // Berth preference (optional).
    if (pax.berth) {
      cy.get('select[id*="berth" i], p-dropdown[placeholder*="Berth" i]')
        .eq(idx)
        .then(($el) => {
          if ($el.is('select')) {
            cy.wrap($el).select(pax.berth)
          } else {
            cy.wrap($el).click()
            cy.contains('.p-dropdown-item', pax.berth).click()
          }
        })
    }
  })
})

// ---------------------------------------------------------------------------
// proceedToPaymentBoundary
// Clicks "Continue" / "Proceed" until the payment page is reached,
// then STOPS and takes a screenshot. Never automates payment.
// ---------------------------------------------------------------------------
Cypress.Commands.add('proceedToPaymentBoundary', () => {
  // Click Continue/Proceed on the passenger form to advance to review/payment.
  cy.contains('button', /continue|proceed/i, { timeout: 15_000 })
    .should('be.enabled')
    .click()

  // Stop at security challenges.
  cy.stopForSecurityChallenge()

  // Wait for payment page indicators.
  cy.get('body', { timeout: 30_000 }).should(($body) => {
    const state = pageState($body)
    expect(
      state.paymentPage || state.captcha || state.otp,
      'reached payment boundary (payment page, CAPTCHA, or OTP)',
    ).to.be.true
  })

  // Screenshot the payment boundary — proof of progress without crossing it.
  cy.screenshot('PAYMENT-BOUNDARY-reached')
  cy.task('log', '[PAYMENT BOUNDARY] Reached payment page. Stopping — human must complete payment.')
})
