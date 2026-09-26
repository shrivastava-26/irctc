// Shared commands for the autonomous booking engine.
//
// Important: security challenges are not bypassed. When a CAPTCHA/OTP appears,
// the headed browser stays on the current page and the engine waits for the
// challenge to be completed, then resumes the same state.

const STATE_ORDER = [
  'BOOT',
  'LOAD_CONFIG',
  'RESTORE_SESSION',
  'VALIDATE_SESSION',
  'PRELOAD_MASTER_DATA',
  'PREPARE_JOURNEY',
  'SEARCH',
  'FILTER',
  'SELECT_TRAIN',
  'VERIFY_AVAILABILITY',
  'LOAD_PASSENGERS',
  'FILL_PASSENGERS',
  'VALIDATE_BOOKING',
  'SUBMIT',
  'VERIFY_TRANSACTION',
  'VERIFY_BOOKING',
  'SUCCESS',
]

function stateIndex(state) {
  return STATE_ORDER.indexOf(state)
}

function requestFromEnv() {
  const raw = Cypress.env('BOOKING_REQUEST')
  if (!raw) throw new Error('BOOKING_REQUEST is required for autonomous execution.')
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

function jobIdFromEnv() {
  return Cypress.env('JOB_ID') || 'local-autonomous-run'
}

function visibleText($body) {
  return $body.text().replace(/\\s+/g, ' ').trim()
}

function looksLikeSecurityChallenge($body) {
  const text = visibleText($body)
  return (
    /captcha/i.test(text) ||
    /enter.*otp|otp.*sent|one.?time.?password/i.test(text) ||
    $body.find('input[id*="captcha" i], input[name*="captcha" i], img[class*="captcha" i]').length > 0
  )
}

function looksAuthenticated($body) {
  const text = visibleText($body)
  return /logout|sign out/i.test(text) && /book ticket/i.test(text)
}

function markState(state, phase, message, metadata) {
  return cy.task('bookingStateSave', {
    jobId: jobIdFromEnv(),
    state,
    phase,
    message: message || null,
    metadata: metadata || null,
  })
}

function markTelemetry(name, metadata) {
  return cy.task('telemetryMark', {
    jobId: jobIdFromEnv(),
    name,
    metadata: metadata || null,
  })
}

Cypress.Commands.add('engineLoadState', () =>
  cy.task('bookingStateLoad', { jobId: jobIdFromEnv() }),
)

Cypress.Commands.add('engineBegin', (state, message, metadata) =>
  markState(state, 'RUNNING', message, metadata),
)

Cypress.Commands.add('engineComplete', (state, message, metadata) =>
  markState(state, 'COMPLETED', message, metadata),
)

Cypress.Commands.add('engineTelemetry', (name, metadata) =>
  markTelemetry(name, metadata),
)

Cypress.Commands.add('engineShouldRun', (currentState, targetState) => {
  const current = stateIndex(currentState || 'BOOT')
  const target = stateIndex(targetState)
  return current < target
})

Cypress.Commands.add('engineWaitForChallenge', (timeoutMs = 120000) => {
  const deadline = Date.now() + timeoutMs

  const poll = () => {
    return cy.get('body', { timeout: 10000 }).then(($body) => {
      if (!looksLikeSecurityChallenge($body)) return

      if (Date.now() >= deadline) {
        cy.screenshot('SECURITY-CHALLENGE-timeout')
        throw new Error(
          'Security challenge was not completed before the configured timeout.',
        )
      }

      cy.task(
        'log',
        '[SECURITY] CAPTCHA/OTP detected. Waiting for completion in the headed browser.',
      )

      return cy.wait(250).then(poll)
    })
  }

  return poll()
})

Cypress.Commands.add('engineAssertAuthenticated', () => {
  cy.get('body', { timeout: 30000 }).then(($body) => {
    if (looksLikeSecurityChallenge($body)) {
      throw new Error('Security challenge is still active.')
    }

    const text = visibleText($body)
    if (!looksAuthenticated($body) && !/login\\s*\\/\\s*register/i.test(text)) {
      throw new Error('Could not determine authenticated IRCTC state.')
    }
  })
})

Cypress.Commands.add('engineRecordResult', (result) =>
  cy.task('bookingStateSave', {
    jobId: jobIdFromEnv(),
    state: 'SUCCESS',
    phase: 'COMPLETED',
    message: 'Verified booking result.',
    metadata: result || null,
  }),
)

Cypress.Commands.add('enginePersistConfig', (config) =>
  cy.task('bookingStateSave', {
    jobId: jobIdFromEnv(),
    state: 'LOAD_CONFIG',
    phase: 'COMPLETED',
    message: 'Booking configuration validated.',
    metadata: {
      source: config.source,
      destination: config.destination,
      travelDate: config.travelDate,
      quota: config.quota,
      trainNumber: config.trainNumber || null,
      coach: config.coach,
      passengerCount: Array.isArray(config.passengers) ? config.passengers.length : 0,
    },
  }),
)

export { STATE_ORDER, requestFromEnv }
