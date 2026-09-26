const { ConcurrencyGovernor } = require('./ConcurrencyGovernor')
const { AccountMutex } = require('./AccountMutex')

class JourneyWorkerPool {
  constructor({ governor = new ConcurrencyGovernor(), accountMutex = new AccountMutex() } = {}) {
    this.governor = governor
    this.accountMutex = accountMutex
  }

  accountKey(job) {
    return String(job?.request?.credentialsReference || 'default')
  }

  async acquire(job, onQueue = null) {
    const accountKey = this.accountKey(job)
    const releaseAccount = await this.accountMutex.acquire(accountKey)
    try {
      const releaseConcurrency = await this.governor.acquire(job?.id || 'job')
      onQueue?.({ accountKey, ...this.stats() })
      let released = false
      return () => {
        if (released) return
        released = true
        releaseConcurrency()
        releaseAccount()
      }
    } catch (error) {
      releaseAccount()
      throw error
    }
  }

  stats() {
    return { concurrency: this.governor.stats(), accounts: this.accountMutex.stats() }
  }

  static fromEnvironment() {
    return new JourneyWorkerPool()
  }
}

module.exports = { JourneyWorkerPool }