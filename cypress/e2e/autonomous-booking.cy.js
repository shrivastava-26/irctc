// Autonomous, state-aware booking flow for the current IRCTC web surface.
//
// The browser is the execution layer. Durable checkpoints live outside
// Cypress so a process/browser crash can resume from the last known state.
// Security challenges are not bypassed: in headed mode the run waits for
// the challenge to be completed and then resumes the same state.

import { requestFromEnv, STATE_ORDER } from '../support/bookingEngine'

const BETA_URL =
  Cypress.env('IRCTC_ENTRY_URL') || 'https://www.irctc.co.in/eticket/'
const SECURITY_TIMEOUT =
  Number(Cypress.env('SECURITY_CHALLENGE_TIMEOUT_MS')) || 120000
const TRANSACTION_TIMEOUT =
  Number(Cypress.env('TRANSACTION_TIMEOUT_MS')) || 180000

function stateIndex(state) {
  const index = STATE_ORDER.indexOf(state)
  return index < 0 ? 0 : index
}

function textOf($body) {
  return $body.text().replace(/\s+/g, ' ').trim()
}

function jobId() {
  return Cypress.env('JOB_ID') || 'local-autonomous-run'
}

function debugMode() {
  return String(Cypress.env('DEBUG_MODE') || 'false').toLowerCase() === 'true'
}

function saveState(state, phase, message, metadata) {
  return cy.task('bookingStateSave', {
    jobId: jobId(),
    state,
    phase,
    message: message || null,
    metadata: metadata || null,
  })
}

function beginState(state, message, metadata) {
  cy.task('log', '[STATE] ' + state + ' — ' + message)
  saveState(state, 'RUNNING', message, metadata)
  cy.task('telemetryMark', {
    jobId: jobId(),
    name: state + '_START',
    metadata: metadata || null,
  })
}

function completeState(nextState, completedState, message, metadata) {
  saveState(nextState, 'IDLE', message, {
    ...(metadata || {}),
    completedState,
  })
  cy.task('telemetryMark', {
    jobId: jobId(),
    name: nextState + '_READY',
    metadata: metadata || null,
  })
}

function shouldRun(currentState, targetState) {
  return stateIndex(currentState) <= stateIndex(targetState)
}

function challengePresent($body) {
  const body = textOf($body)
  return (
    /captcha/i.test(body) ||
    /enter.*otp|otp.*sent|one.?time.?password/i.test(body) ||
    $body.find(
      'img[class*="captcha" i], input[id*="captcha" i], input[name*="captcha" i]',
    ).length > 0
  )
}

function successPresent($body) {
  const body = textOf($body)
  return (
    /pnr\s*(no|number)?\s*[:#-]?\s*\d{10}/i.test(body) ||
    /congratulations/i.test(body) ||
    /ticket.*booked/i.test(body)
  )
}

function failurePresent($body) {
  return /transaction (failed|declined)|booking failed|payment failed|unable to book/i.test(
    textOf($body),
  )
}

function extractPnr(value) {
  const text = String(value || '')
  const direct = text.match(/PNR\s*(?:NO|NUMBER)?\s*[:#-]?\s*(\d{10})/i)
  if (direct) return direct[1]
  const anyTenDigits = text.match(/\b\d{10}\b/)
  return anyTenDigits ? anyTenDigits[0] : null
}

function visibleInputsMatching(patterns) {
  return cy.get('input:visible').filter((_, el) => {
    const haystack = [
      el.getAttribute('placeholder'),
      el.getAttribute('aria-label'),
      el.getAttribute('name'),
      el.getAttribute('id'),
    ]
      .filter(Boolean)
      .join(' ')
    return patterns.some((pattern) => pattern.test(haystack))
  })
}

function chooseAutocomplete(patterns, value) {
  visibleInputsMatching(patterns)
    .first()
    .should('be.visible')
    .clear()
    .type(String(value).slice(0, 4))

  cy.get(
    '.ui-autocomplete-panel li:visible, .p-autocomplete-panel li:visible, [class*="autocomplete" i] li:visible, [role="option"]:visible',
    { timeout: 15000 },
  )
    .first()
    .click()
}

function waitForSearchResult() {
  cy.get('body', { timeout: 45000 }).should(($body) => {
    expect(
      /available trains|no trains|train list|search result/i.test(textOf($body)),
      'train-search result state',
    ).to.be.true
  })
}

function availabilityStatus(value) {
  const body = String(value || '').toUpperCase()
  if (/REGRET|NOT AVAILABLE|CLASS NOT AVAILABLE|QUOTA NOT AVAILABLE/.test(body)) {
    return 'NOT_AVAILABLE'
  }
  if (/RAC\s*[-:]?\s*\d+/.test(body)) return 'RAC'
  if (/WL\s*[-:]?\s*\d+/.test(body)) return 'WL'
  if (/AVAILABLE|AVBL|AVL|CNF/.test(body)) return 'AVAILABLE'
  return 'UNKNOWN'
}

describe('IRCTC — Autonomous Booking Engine', () => {
  let request = null
  let persisted = null
  let currentState = 'BOOT'

  before(() => {
    request = requestFromEnv()

    if (!request.source || !request.destination || !request.travelDate) {
      throw new Error('source, destination and travelDate are required')
    }
    if (!request.coach) throw new Error('coach/class is required')
    if (!Array.isArray(request.passengers) || request.passengers.length === 0) {
      throw new Error('at least one passenger is required')
    }

    return cy.engineLoadState().then((state) => {
      persisted = state || null
      currentState = state?.state || 'BOOT'
      // A crash during SUBMIT/VERIFY_TRANSACTION makes the transaction outcome
      // ambiguous. Never replay the submit step blindly on resume.
      if (
        state &&
        (state.state === 'SUBMIT' || state.state === 'VERIFY_TRANSACTION') &&
        state.phase === 'RUNNING'
      ) {
        currentState = 'VERIFY_TRANSACTION'
      }
      cy.task('log', '[RESUME] persisted state = ' + currentState)
    })
  })

  it('runs the configured workflow and verifies the final booking result', () => {
    if (shouldRun(currentState, 'LOAD_CONFIG')) {
      beginState('LOAD_CONFIG', 'Validating booking request')
      expect(request.source).to.be.a('string').and.not.empty
      expect(request.destination).to.be.a('string').and.not.empty
      expect(request.travelDate).to.match(/^\d{2}\/\d{2}\/\d{4}$/)
      completeState('RESTORE_SESSION', 'LOAD_CONFIG', 'Configuration validated')
      currentState = 'RESTORE_SESSION'
    }

    if (shouldRun(currentState, 'RESTORE_SESSION')) {
      beginState('RESTORE_SESSION', 'Opening official IRCTC Beta booking surface')
      cy.visit(BETA_URL, { failOnStatusCode: false })
      cy.get('body', { timeout: 60000 }).should('be.visible')
      completeState('VALIDATE_SESSION', 'RESTORE_SESSION', 'IRCTC surface loaded')
      currentState = 'VALIDATE_SESSION'
    }

    if (shouldRun(currentState, 'VALIDATE_SESSION')) {
      beginState('VALIDATE_SESSION', 'Checking or restoring authenticated session')

      cy.get('body').then(($body) => {
        if (challengePresent($body)) {
          return cy.engineWaitForChallenge(SECURITY_TIMEOUT)
        }

        const body = textOf($body)
        const needsLogin =
          /login|sign in|login \/ register/i.test(body) &&
          !/logout|sign out|my account/i.test(body)

        if (!needsLogin) return

        const username = Cypress.env('IRCTC_USERNAME')
        const password = Cypress.env('IRCTC_PASSWORD')
        if (!username || !password) {
          throw new Error(
            'IRCTC session is not authenticated and IRCTC_USERNAME/IRCTC_PASSWORD are unavailable.',
          )
        }

        cy.contains(
          'button, a, [role="button"]',
          /login\s*\/\s*register|sign in|login/i,
          { timeout: 15000 },
        )
          .first()
          .click()

        visibleInputsMatching([/user.?name/i, /login/i, /email/i])
          .first()
          .should('be.visible')
          .clear()
          .type(username, { log: false })

        cy.get('input[type="password"]:visible')
          .first()
          .clear()
          .type(password, { log: false })

        cy.contains('button, [role="button"]', /sign in|login/i)
          .should('be.enabled')
          .click()

        return cy.engineWaitForChallenge(SECURITY_TIMEOUT)
      })

      cy.engineAssertAuthenticated()
      completeState(
        'PRELOAD_MASTER_DATA',
        'VALIDATE_SESSION',
        'Session validated or restored',
      )
      currentState = 'PRELOAD_MASTER_DATA'
    }

    if (shouldRun(currentState, 'PRELOAD_MASTER_DATA')) {
      beginState(
        'PRELOAD_MASTER_DATA',
        'Preparing passenger repository and cached local configuration',
      )
      cy.wrap(request.passengers).should('have.length.greaterThan', 0)
      completeState(
        'PREPARE_JOURNEY',
        'PRELOAD_MASTER_DATA',
        'Passenger configuration ready',
      )
      currentState = 'PREPARE_JOURNEY'
    }

    if (shouldRun(currentState, 'PREPARE_JOURNEY')) {
      beginState('PREPARE_JOURNEY', 'Preparing journey inputs')

      cy.get('body').then(($body) => {
        if (/please select your preferred language/i.test(textOf($body))) {
          cy.contains('button, [role="button"], a', /^English$/i, {
            timeout: 10000,
          })
            .first()
            .click()
        }
      })

      chooseAutocomplete(
        [/from/i, /source/i, /origin/i, /select source/i],
        request.source,
      )

      chooseAutocomplete(
        [/to/i, /destination/i, /select destination/i],
        request.destination,
      )

      visibleInputsMatching([
        /journey.*date/i,
        /^date$/i,
        /jrdate/i,
        /select date/i,
      ])
        .first()
        .should('be.visible')
        .clear()
        .type(request.travelDate)

      if (String(request.quota || 'GENERAL').toUpperCase() !== 'GENERAL') {
        cy.get(
          '#journeyQuota .ui-dropdown, [id="journeyQuota"] .ui-dropdown, p-dropdown',
          { timeout: 10000 },
        )
          .filter(':visible')
          .first()
          .click()

        cy.contains(
          '[role="option"], .ui-dropdown-item, .p-dropdown-item, li',
          String(request.quota),
          { timeout: 10000 },
        )
          .filter(':visible')
          .first()
          .click()
      }

      completeState('SEARCH', 'PREPARE_JOURNEY', 'Journey inputs prepared')
      currentState = 'SEARCH'
    }

    if (shouldRun(currentState, 'SEARCH')) {
      beginState('SEARCH', 'Submitting one train search')
      cy.contains('button, [role="button"]', /^Search Trains$/i, {
        timeout: 15000,
      })
        .should('be.enabled')
        .click()
      waitForSearchResult()
      completeState('FILTER', 'SEARCH', 'Train search result received')
      currentState = 'FILTER'
    }

    if (shouldRun(currentState, 'FILTER')) {
      beginState('FILTER', 'Filtering preferred and backup candidates')

      const preferred = Array.isArray(request.preferredTrains)
        ? request.preferredTrains.map(String)
        : []
      const backups = Array.isArray(request.backupTrains)
        ? request.backupTrains.map(String)
        : []
      const candidates = [
        ...preferred,
        ...(request.trainNumber ? [String(request.trainNumber)] : []),
        ...backups,
      ]

      cy.get('body').then(($body) => {
        const body = textOf($body)

        if (!candidates.length) {
          cy.task(
            'log',
            '[FILTER] No fixed train configured; first valid Sleeper candidate will be evaluated.',
          )
          return
        }

        const found = candidates.find((candidate) => body.includes(candidate))
        if (!found) {
          throw new Error(
            'None of the configured preferred/backup trains is present in search results.',
          )
        }
      })

      completeState('SELECT_TRAIN', 'FILTER', 'Candidate set validated')
      currentState = 'SELECT_TRAIN'
    }

    if (shouldRun(currentState, 'SELECT_TRAIN')) {
      beginState('SELECT_TRAIN', 'Selecting train and configured class')

      const trainNumber =
        request.trainNumber ||
        request.preferredTrains?.[0] ||
        request.backupTrains?.[0] ||
        null

      cy.get('body').then(($body) => {
        const elements = [
          ...$body.find('tr'),
          ...$body.find('[class*="train" i]'),
        ]
          .filter((_, el) => {
            const body = textOf(Cypress.$(el))
            return trainNumber ? body.includes(String(trainNumber)) : true
          })
          .sort(
            (a, b) =>
              textOf(Cypress.$(a)).length - textOf(Cypress.$(b)).length,
          )

        if (!elements.length) {
          throw new Error('No train candidate row/container was found.')
        }

        cy.wrap(elements[0]).within(() => {
          cy.contains(
            'button, a, [role="button"], td',
            /SL|Sleeper|Book Now|Availability/i,
          )
            .first()
            .click()
        })
      })

      completeState(
        'VERIFY_AVAILABILITY',
        'SELECT_TRAIN',
        'Train/class selection submitted',
      )
      currentState = 'VERIFY_AVAILABILITY'
    }

    if (shouldRun(currentState, 'VERIFY_AVAILABILITY')) {
      beginState('VERIFY_AVAILABILITY', 'Evaluating current availability')

      cy.get('body', { timeout: 30000 }).then(($body) => {
        const status = availabilityStatus(textOf($body))
        cy.task('log', '[AVAILABILITY] ' + status)

        if (status !== 'AVAILABLE') {
          throw new Error(
            'Selected train/class did not meet availability requirement: ' +
              status,
          )
        }
      })

      completeState(
        'LOAD_PASSENGERS',
        'VERIFY_AVAILABILITY',
        'Availability accepted',
      )
      currentState = 'LOAD_PASSENGERS'
    }

    if (shouldRun(currentState, 'LOAD_PASSENGERS')) {
      beginState('LOAD_PASSENGERS', 'Loading Master Passenger selection surface')

      cy.get('body').then(($body) => {
        if (/master passenger|master list|add existing/i.test(textOf($body))) {
          cy.contains(
            'button, a, [role="button"]',
            /master passenger|master list|add existing/i,
            { timeout: 10000 },
          )
            .first()
            .click()
        }
      })

      completeState(
        'FILL_PASSENGERS',
        'LOAD_PASSENGERS',
        'Passenger repository loaded',
      )
      currentState = 'FILL_PASSENGERS'
    }

    if (shouldRun(currentState, 'FILL_PASSENGERS')) {
      beginState(
        'FILL_PASSENGERS',
        'Selecting saved passengers or filling required fields',
      )

      request.passengers.forEach((passenger, index) => {
        cy.get('body').then(($body) => {
          const body = textOf($body)

          if (body.includes(String(passenger.name))) {
            cy.contains(
              'button, [role="button"], li, div',
              String(passenger.name),
              { timeout: 5000 },
            )
              .first()
              .click()
            return
          }

          if (index > 0) {
            cy.contains(
              'button, a, [role="button"]',
              /add passenger|add traveller/i,
              { timeout: 10000 },
            )
              .first()
              .click()
          }

          cy.get(
            'input[placeholder*="Name" i], input[name*="name" i], input[id*="name" i]',
            { timeout: 10000 },
          )
            .filter(':visible')
            .eq(index)
            .clear()
            .type(passenger.name)

          cy.get(
            'input[placeholder*="Age" i], input[name*="age" i], input[id*="age" i]',
            { timeout: 10000 },
          )
            .filter(':visible')
            .eq(index)
            .clear()
            .type(String(passenger.age))

          cy.get(
            'select[id*="gender" i], select[name*="gender" i], p-dropdown[placeholder*="Gender" i], [aria-label*="Gender" i]',
            { timeout: 10000 },
          )
            .filter(':visible')
            .eq(index)
            .then(($el) => {
              if ($el.is('select')) {
                cy.wrap($el).select(passenger.gender)
              } else {
                cy.wrap($el).click()
                cy.contains(
                  '[role="option"], .p-dropdown-item, li',
                  passenger.gender,
                  { timeout: 10000 },
                )
                  .filter(':visible')
                  .first()
                  .click()
              }
            })

          if (passenger.berth && !/no preference|any/i.test(passenger.berth)) {
            cy.get(
              'select[id*="berth" i], select[name*="berth" i], p-dropdown[placeholder*="Berth" i], [aria-label*="Berth" i]',
              { timeout: 10000 },
            )
              .filter(':visible')
              .eq(index)
              .then(($el) => {
                if ($el.is('select')) {
                  cy.wrap($el).select(passenger.berth)
                } else {
                  cy.wrap($el).click()
                  cy.contains(
                    '[role="option"], .p-dropdown-item, li',
                    passenger.berth,
                    { timeout: 10000 },
                  )
                    .filter(':visible')
                    .first()
                    .click()
                }
              })
          }
        })
      })

      completeState(
        'VALIDATE_BOOKING',
        'FILL_PASSENGERS',
        'Passenger data populated',
      )
      currentState = 'VALIDATE_BOOKING'
    }

    if (shouldRun(currentState, 'VALIDATE_BOOKING')) {
      beginState(
        'VALIDATE_BOOKING',
        'Validating booking form before submission',
      )

      cy.get('body', { timeout: 30000 }).then(($body) => {
        if (challengePresent($body)) {
          return cy.engineWaitForChallenge(SECURITY_TIMEOUT)
        }

        const body = textOf($body)
        expect(
          body.toUpperCase().includes(String(request.coach).toUpperCase()),
          'configured class visible before submission',
        ).to.be.true
      })

      cy.contains(
        'button, [role="button"]',
        /continue|review|proceed/i,
        { timeout: 20000 },
      )
        .filter(':visible')
        .first()
        .should('be.enabled')
        .click()

      completeState(
        'SUBMIT',
        'VALIDATE_BOOKING',
        'Booking form validated and review submitted',
      )
      currentState = 'SUBMIT'
    }

    if (shouldRun(currentState, 'SUBMIT')) {
      beginState('SUBMIT', 'Submitting booking transaction')

      cy.get('body').then(($body) => {
        if (successPresent($body)) {
          const pnr = extractPnr(textOf($body))
          completeState(
            'VERIFY_TRANSACTION',
            'SUBMIT',
            'Existing successful booking detected; duplicate submission prevented',
            { pnr },
          )
          currentState = 'VERIFY_TRANSACTION'
          return
        }

        if (failurePresent($body)) {
          throw new Error(
            'Current page already reports a failed booking; refusing duplicate submission.',
          )
        }

        if (challengePresent($body)) {
          return cy.engineWaitForChallenge(SECURITY_TIMEOUT)
        }

        cy.contains(
          'button, [role="button"]',
          /pay.*book|confirm booking|proceed.*payment|submit booking/i,
          { timeout: 20000 },
        )
          .filter(':visible')
          .first()
          .should('be.enabled')
          .click()
      })

      completeState(
        'VERIFY_TRANSACTION',
        'SUBMIT',
        'Booking transaction dispatched',
      )
      currentState = 'VERIFY_TRANSACTION'
    }

    if (shouldRun(currentState, 'VERIFY_TRANSACTION')) {
      beginState(
        'VERIFY_TRANSACTION',
        'Waiting for transaction outcome without resubmitting',
      )

      cy.get('body', { timeout: TRANSACTION_TIMEOUT }).should(($body) => {
        expect(
          successPresent($body) ||
            failurePresent($body) ||
            challengePresent($body),
          'transaction outcome or security challenge',
        ).to.be.true
      })

      cy.get('body').then(($body) => {
        if (challengePresent($body)) {
          return cy.engineWaitForChallenge(SECURITY_TIMEOUT)
        }

        if (failurePresent($body)) {
          throw new Error('Transaction result page reports failure or decline.')
        }

        if (!successPresent($body)) {
          throw new Error(
            'Transaction outcome is unknown; refusing to retry a transactional operation.',
          )
        }
      })

      completeState(
        'VERIFY_BOOKING',
        'VERIFY_TRANSACTION',
        'Transaction outcome received',
      )
      currentState = 'VERIFY_BOOKING'
    }

    if (shouldRun(currentState, 'VERIFY_BOOKING')) {
      beginState('VERIFY_BOOKING', 'Extracting and verifying final booking result')

      cy.get('body', { timeout: 30000 }).then(($body) => {
        const body = textOf($body)
        const pnr = extractPnr(body)

        if (!pnr && !successPresent($body)) {
          throw new Error(
            'No verifiable PNR or booking-success indicator was found.',
          )
        }

        return cy.engineRecordResult({
          pnr,
          route: {
            source: request.source,
            destination: request.destination,
            travelDate: request.travelDate,
          },
          trainNumber: request.trainNumber || null,
          coach: request.coach,
          quota: request.quota || 'GENERAL',
          verifiedAt: new Date().toISOString(),
        })
      })

      completeState('SUCCESS', 'VERIFY_BOOKING', 'Booking result verified')
      currentState = 'SUCCESS'
    }

    if (currentState === 'SUCCESS' && debugMode()) {
      cy.screenshot('ENGINE-success')
    }

    cy.task('telemetryMark', {
      jobId: jobId(),
      name: 'RUN_COMPLETE',
      metadata: {
        state: currentState,
        resumedFrom: persisted?.state || null,
      },
    })
  })
})
