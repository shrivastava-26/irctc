// Serializes work that shares the same persistent Playwright profile/account.
class AccountMutex {
  constructor() {
    this.locks = new Map()
  }

  acquire(accountKey = 'default') {
    const key = String(accountKey || 'default')
    const state = this.locks.get(key) || { pending: 0, tail: Promise.resolve() }
    const previous = state.tail
    let releaseCurrent
    state.pending += 1
    state.tail = new Promise(resolve => { releaseCurrent = resolve })
    this.locks.set(key, state)

    return previous.then(() => {
      let released = false
      return () => {
        if (released) return
        released = true
        state.pending -= 1
        releaseCurrent()
        if (state.pending === 0 && this.locks.get(key) === state) this.locks.delete(key)
      }
    })
  }

  stats() {
    return {
      accounts: this.locks.size,
      pending: Array.from(this.locks.values()).reduce((sum, state) => sum + state.pending, 0),
    }
  }
}

module.exports = { AccountMutex }