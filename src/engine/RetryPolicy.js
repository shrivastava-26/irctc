// Centralized retry classification.
// Retries are deliberately asymmetric: reads may retry; transactional writes
// must be reconciled before another attempt.

const POLICIES = Object.freeze({
  READ_ONLY: {
    maxAttempts: 3,
    baseDelayMs: 200,
    maxDelayMs: 1500,
    retryOn: new Set(['NETWORK_TIMEOUT', 'CONNECTION_RESET', 'HTTP_429', 'HTTP_502', 'HTTP_503', 'HTTP_504']),
  },
  SESSION: {
    maxAttempts: 2,
    baseDelayMs: 150,
    maxDelayMs: 1000,
    retryOn: new Set(['NETWORK_TIMEOUT', 'CONNECTION_RESET', 'HTTP_502', 'HTTP_503', 'HTTP_504']),
  },
  TRANSACTIONAL: {
    maxAttempts: 1,
    baseDelayMs: 0,
    maxDelayMs: 0,
    retryOn: new Set(),
  },
})

function policyFor(kind) {
  return POLICIES[kind] || POLICIES.READ_ONLY
}

function shouldRetry(kind, errorCode, attempt) {
  const policy = policyFor(kind)
  return attempt < policy.maxAttempts && policy.retryOn.has(errorCode)
}

function backoffMs(kind, attempt) {
  const policy = policyFor(kind)
  if (policy.maxDelayMs <= 0) return 0
  const exponential = policy.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1))
  return Math.min(policy.maxDelayMs, exponential)
}

module.exports = {
  POLICIES,
  policyFor,
  shouldRetry,
  backoffMs,
}
