// Bounded semaphore for browser-heavy journey execution.
const os = require('os')

function positiveInt(value, fallback, max = 32) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

function defaultMaxConcurrentJourneys() {
  const configured = process.env.SIVA_MAX_CONCURRENT_JOURNEYS
  if (configured != null) return positiveInt(configured, 1)
  return String(process.env.RENDER || '').toLowerCase() === 'true' ? 1 : 2
}

function defaultMaxRssMb() {
  const configured = Number(process.env.SIVA_MAX_RSS_MB)
  if (Number.isFinite(configured) && configured > 0) return configured
  return String(process.env.RENDER || '').toLowerCase() === 'true' ? 380 : 8192
}

function defaultMinAvailableMemoryMb() {
  const configured = Number(process.env.SIVA_MIN_AVAILABLE_MEMORY_MB)
  if (Number.isFinite(configured) && configured > 0) return configured
  return String(process.env.RENDER || '').toLowerCase() === 'true' ? 64 : 1024
}

function availableMemoryBytes() {
  if (typeof process.availableMemory === 'function') return process.availableMemory()
  return os.freemem()
}

function defaultResourceCheck() {
  const rss = process.memoryUsage().rss / (1024 * 1024)
  const available = availableMemoryBytes() / (1024 * 1024)
  return rss < defaultMaxRssMb() && available > defaultMinAvailableMemoryMb()
}

class ConcurrencyGovernor {
  constructor({
    maxConcurrent = defaultMaxConcurrentJourneys(),
    resourceCheck = defaultResourceCheck,
    retryDelayMs = positiveInt(process.env.SIVA_RESOURCE_RETRY_MS, 250, 5000),
  } = {}) {
    this.maxConcurrent = positiveInt(maxConcurrent, 1)
    this.resourceCheck = typeof resourceCheck === 'function' ? resourceCheck : () => true
    this.retryDelayMs = retryDelayMs
    this.active = 0
    this.queue = []
    this.retryTimer = null
  }

  acquire(label = 'job') {
    return new Promise(resolve => {
      this.queue.push({ label: String(label), resolve })
      this._drain()
    })
  }

  _drain() {
    if (this.queue.length === 0 || this.active >= this.maxConcurrent) return
    if (!this.resourceCheck()) {
      this._scheduleRetry()
      return
    }

    const waiter = this.queue.shift()
    this.active += 1
    let released = false
    waiter.resolve(() => {
      if (released) return
      released = true
      this.active = Math.max(0, this.active - 1)
      this._drain()
    })

    this._drain()
  }

  _scheduleRetry() {
    if (this.retryTimer != null) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this._drain()
    }, this.retryDelayMs)
    this.retryTimer.unref?.()
  }

  stats() {
    return {
      active: this.active,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      resourceAvailable: this.resourceCheck(),
    }
  }
}

module.exports = {
  ConcurrencyGovernor,
  defaultMaxConcurrentJourneys,
  defaultMaxRssMb,
  defaultMinAvailableMemoryMb,
}