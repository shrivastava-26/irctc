// Persistent booking state machine.
//
// The browser is only the execution layer. Durable state lives outside Cypress
// so a browser/process crash can resume from the last safely persisted point.

const STATES = Object.freeze([
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
])

const TERMINAL_STATES = new Set(['SUCCESS'])

const SAFE_RETRY_STATES = new Set([
  'SEARCH',
  'VERIFY_AVAILABILITY',
  'LOAD_PASSENGERS',
  'VALIDATE_BOOKING',
  'VERIFY_BOOKING',
])

const MUTATING_STATES = new Set([
  'SUBMIT',
  'VERIFY_TRANSACTION',
])

function indexOfState(state) {
  return STATES.indexOf(state)
}

function isState(state) {
  return indexOfState(state) !== -1
}

function isAtLeast(currentState, targetState) {
  const current = indexOfState(currentState)
  const target = indexOfState(targetState)
  if (current === -1 || target === -1) return false
  return current >= target
}

function nextState(state) {
  const index = indexOfState(state)
  if (index < 0) throw new Error('Unknown booking state: ' + state)
  return STATES[index + 1] || 'SUCCESS'
}

function assertTransition(from, to) {
  if (from === to) return
  if (!isState(from) || !isState(to)) {
    throw new Error('Invalid booking state transition: ' + from + ' -> ' + to)
  }

  // Recovery may jump forward to the verified state returned by the browser.
  // Normal execution still uses the declared linear state graph.
  const expected = nextState(from)
  if (expected !== to) {
    throw new Error(
      'Non-deterministic booking transition: expected ' + expected + ', got ' + to
    )
  }
}

function classifyState(state) {
  if (MUTATING_STATES.has(state)) return 'TRANSACTIONAL'
  if (SAFE_RETRY_STATES.has(state)) return 'SAFE_RETRY'
  if (TERMINAL_STATES.has(state)) return 'TERMINAL'
  return 'PREPARATION'
}

module.exports = {
  STATES,
  TERMINAL_STATES,
  SAFE_RETRY_STATES,
  MUTATING_STATES,
  isState,
  isAtLeast,
  nextState,
  assertTransition,
  classifyState,
}
