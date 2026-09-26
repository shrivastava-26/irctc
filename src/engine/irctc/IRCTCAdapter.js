const {
  SURFACES,
  parsePnr,
  parseTravelDate,
  availabilitySatisfies,
  escapeRegExp,
} = require('./utils')
const RunStateStore = require('../RunStateStore')

class IRCTCAdapter {
  constructor({ page, context, request, credentials, jobId, emit }) {
    this.page = page
    this.context = context
    this.request = request
    this.credentials = credentials
    this.jobId = jobId
    this.emit = emit
    this.runtimeSurface = SURFACES.UNKNOWN
    this.selected = null
    this.currentState = null
  }

  log(message, metadata = null) {
    this.emit?.({ type: 'LOG', state: this.currentState, message, metadata })
  }

  markState(state, phase, message, metadata = null) {
    this.currentState = state
    RunStateStore.save(this.jobId, {
      state,
      phase,
      message,
      metadata: { ...(metadata || {}), runtimeSurface: this.runtimeSurface },
    })
    this.emit?.({ type: 'STATE_CHANGED', state, message, metadata })
  }

  completeState(nextState, completedState, message, metadata = null) {
    RunStateStore.save(this.jobId, {
      state: nextState,
      phase: 'IDLE',
      message,
      metadata: {
        completedState,
        ...(metadata || {}),
        runtimeSurface: this.runtimeSurface,
      },
    })
    this.currentState = nextState
    this.emit?.({ type: 'STATE_CHANGED', state: nextState, message, metadata })
  }

  async bodyText() {
    return (await this.page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  }

  async waitForSecurityChallenge(timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs

    const detected = async () => {
      const text = await this.bodyText()
      if (/captcha|one.?time.?password|\botp\b/i.test(text)) return true

      const inputs = this.page.locator(
        'input[id*="captcha" i], input[name*="captcha" i], input[aria-label*="captcha" i]',
      )
      const count = await inputs.count()
      for (let index = 0; index < count; index += 1) {
        if (await inputs.nth(index).isVisible().catch(() => false)) return true
      }
      return false
    }

    if (!(await detected())) return

    this.log('[SECURITY] CAPTCHA/OTP detected. Waiting for manual completion.')
    while (await detected()) {
      if (Date.now() >= deadline) {
        throw new Error('Security challenge was not completed before timeout.')
      }
      await this.page.waitForTimeout(250)
    }
  }

  async ensureEnglish() {
    const english = this.page.getByRole('button', { name: /^English$/i }).first()
    if (await english.isVisible().catch(() => false)) {
      await english.click()
      await this.page.locator('body').waitFor({ state: 'visible' })
    }
  }

  async isAuthenticated() {
    const body = await this.bodyText()
    return /\blogout\b|\bsign out\b|my account|booked tickets?/i.test(body)
  }

  async ensureAuthenticated() {
    await this.waitForSecurityChallenge()
    if (await this.isAuthenticated()) return true

    const loginCandidates = [
      this.page.getByRole('button', { name: /login|sign in|login \/ register/i }).first(),
      this.page.getByRole('link', { name: /login|sign in|login \/ register/i }).first(),
    ]

    let login = null
    for (const candidate of loginCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        login = candidate
        break
      }
    }

    if (!login) throw new Error('IRCTC login control was not found; authenticated state is not verifiable.')

    const username = this.credentials?.username
    const password = this.credentials?.password
    if (!username || !password) {
      throw new Error('IRCTC credentials are unavailable for an unauthenticated session.')
    }

    await login.click()

    const userCandidates = [
      this.page.getByRole('textbox', { name: /user.?name|username|login|email/i }).first(),
      this.page.locator('input[placeholder*="user" i], input[name*="user" i], input[id*="user" i]').first(),
    ]

    let userInput = null
    for (const candidate of userCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        userInput = candidate
        break
      }
    }

    if (!userInput) throw new Error('IRCTC username field was not found.')
    await userInput.fill(username)

    const passwordInput = this.page.locator('input[type="password"]:visible').first()
    if (!(await passwordInput.isVisible().catch(() => false))) {
      throw new Error('IRCTC password field was not found.')
    }
    await passwordInput.fill(password)

    const submitCandidates = [
      this.page.getByRole('button', { name: /sign in|login/i }).last(),
      this.page.getByRole('button', { name: /continue/i }).last(),
    ]

    let submit = null
    for (const candidate of submitCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        submit = candidate
        break
      }
    }

    if (!submit) throw new Error('IRCTC login submit control was not found.')
    if (!(await submit.isEnabled().catch(() => false))) {
      throw new Error('IRCTC login submit control is disabled.')
    }

    await submit.click()
    await this.waitForSecurityChallenge()

    if (!(await this.isAuthenticated())) {
      const body = await this.bodyText()
      throw new Error(
        /invalid|incorrect|failed/i.test(body)
          ? 'IRCTC login failed according to the page.'
          : 'IRCTC login did not produce a verifiable authenticated state.',
      )
    }

    return true
  }

  async detectRuntimeSurface() {
    await this.page.waitForURL(/train-list/i, { timeout: 45000 }).catch(() => {})
    const url = this.page.url()

    if (/\/nget\/booking\/train-list/i.test(url)) {
      this.runtimeSurface = SURFACES.LEGACY
      return this.runtimeSurface
    }
    if (/\/eticket\/booking\/train-list/i.test(url)) {
      this.runtimeSurface = SURFACES.NEW
      return this.runtimeSurface
    }
    if (await this.page.locator('div.train-result-container').count()) {
      this.runtimeSurface = SURFACES.NEW
      return this.runtimeSurface
    }
    if (await this.page.locator('app-train-avl-enq').count()) {
      this.runtimeSurface = SURFACES.LEGACY
      return this.runtimeSurface
    }

    throw new Error('Could not determine IRCTC runtime surface after search. URL=' + url)
  }

  async detectPreSearchSurface() {
    if (await this.page.locator('#origin').isVisible().catch(() => false)) return SURFACES.LEGACY
    if (await this.page.getByRole('combobox', { name: 'From station' }).isVisible().catch(() => false)) return SURFACES.NEW
    return SURFACES.UNKNOWN
  }

  trainContainers() {
    return this.runtimeSurface === SURFACES.NEW
      ? this.page.locator('div.train-result-container')
      : this.page.locator('app-train-avl-enq')
  }

  async listCandidates() {
    const containers = this.trainContainers()
    const count = await containers.count()
    const result = []

    for (let index = 0; index < count; index += 1) {
      const container = containers.nth(index)
      const text = await container.innerText()
      const match = text.match(/(?:^|\D)(\d{5})(?:\D|$)/)
      if (!match) continue
      result.push({
        index,
        trainNumber: match[1],
        text: text.replace(/\s+/g, ' ').trim(),
      })
    }

    return result
  }

  async findCandidate(trainNumber) {
    const desired = String(trainNumber)
    const containers = this.trainContainers()
    const count = await containers.count()

    for (let index = 0; index < count; index += 1) {
      const candidate = containers.nth(index)
      const text = await candidate.innerText()
      const match = text.match(/(?:^|\D)(\d{5})(?:\D|$)/)
      if (match && match[1] === desired) return candidate
    }

    return null
  }

  async orderedCandidates(available) {
    const req = this.request
    const preferred = Array.isArray(req.preferredTrains) ? req.preferredTrains.map(String) : []
    const backups = Array.isArray(req.backupTrains) ? req.backupTrains.map(String) : []

    if (req.trainSelectionPolicy === 'FIXED') {
      return req.trainNumber ? [String(req.trainNumber)] : []
    }

    if (req.trainNumber) {
      const fixed = String(req.trainNumber)
      return [
        fixed,
        ...preferred.filter(train => train !== fixed),
        ...backups.filter(train => train !== fixed),
      ]
    }

    if (preferred.length || backups.length) return [...preferred, ...backups]
    return available.map(item => item.trainNumber)
  }

  async quotaMatches() {
    const desired = String(this.request.quota || 'GENERAL').replace(/_/g, ' ')
    const body = await this.bodyText()
    const pattern = new RegExp('\\b' + escapeRegExp(desired) + '\\b', 'i')
    return pattern.test(body)
  }

  async inspectAvailability() {
    throw new Error('Runtime adapter must implement inspectAvailability(candidate).')
  }

  async activateSelectedClass() {
    throw new Error('Runtime adapter must implement activateSelectedClass().')
  }

  async openPassengerFlow() {
    throw new Error('Runtime adapter must implement openPassengerFlow().')
  }

  async selectPassengers() {
    throw new Error('Runtime adapter must implement selectPassengers().')
  }

  async selectTrain() {
    const available = await this.listCandidates()
    if (!available.length) throw new Error('No train results were found.')
    if (!(await this.quotaMatches())) {
      throw new Error('Requested quota could not be verified in train results: ' + this.request.quota)
    }

    const explicit = await this.orderedCandidates(available)
    const candidates = explicit.length ? explicit : available.map(item => item.trainNumber)
    const strictFixed = this.request.trainSelectionPolicy === 'FIXED'
    let lastReason = 'no candidate satisfied the requested conditions'

    for (const trainNumber of candidates) {
      const candidate = await this.findCandidate(trainNumber)
      if (!candidate) {
        lastReason = 'train ' + trainNumber + ' not present in current results'
        if (strictFixed) break
        continue
      }

      const evaluation = await this.inspectAvailability(candidate)
      this.log(
        '[TRAIN] ' + evaluation.trainNumber + ' ' + (evaluation.trainName || '') +
        ' / ' + this.request.coach + ' / ' + (this.request.quota || 'GENERAL') +
        ' => ' + evaluation.availability.raw,
        evaluation,
      )

      if (!availabilitySatisfies(evaluation.availability, this.request.availabilityRequirement)) {
        lastReason =
          'train ' + trainNumber + ' failed availability requirement: ' +
          evaluation.availability.status
        if (strictFixed) break
        continue
      }

      this.selected = {
        trainNumber: evaluation.trainNumber,
        trainName: evaluation.trainName || null,
        class: String(this.request.coach).toUpperCase(),
        quota: String(this.request.quota || 'GENERAL').toUpperCase(),
        availability: evaluation.availability,
        container: candidate,
      }

      RunStateStore.save(this.jobId, {
        metadata: {
          runtimeSurface: this.runtimeSurface,
          actualSelectedTrainNumber: this.selected.trainNumber,
          actualSelectedTrainName: this.selected.trainName,
          actualSelectedClass: this.selected.class,
          actualSelectedQuota: this.selected.quota,
          actualAvailability: this.selected.availability,
        },
      })

      return this.selected
    }

    throw new Error('No train satisfied selection/availability requirements: ' + lastReason)
  }

  async verifyAvailability() {
    if (!this.selected) throw new Error('No selected train exists for availability verification.')

    const evaluation = await this.inspectAvailability(this.selected.container)
    if (String(evaluation.trainNumber) !== String(this.selected.trainNumber)) {
      throw new Error('Selected train changed during availability verification.')
    }
    if (String(evaluation.class).toUpperCase() !== String(this.selected.class).toUpperCase()) {
      throw new Error('Selected class changed during availability verification.')
    }
    if (!availabilitySatisfies(evaluation.availability, this.request.availabilityRequirement)) {
      throw new Error(
        'Selected ' + this.selected.trainNumber + '/' + this.selected.class +
        ' no longer satisfies availability: ' + evaluation.availability.raw,
      )
    }

    this.selected.availability = evaluation.availability
    RunStateStore.save(this.jobId, {
      metadata: {
        actualSelectedTrainNumber: this.selected.trainNumber,
        actualSelectedTrainName: this.selected.trainName,
        actualSelectedClass: this.selected.class,
        actualSelectedQuota: this.selected.quota,
        actualAvailability: this.selected.availability,
      },
    })

    await this.openPassengerFlow()
  }

  async validateReview() {
    return this.validateBooking()
  }

  async validateBooking() {
    const body = await this.bodyText()
    const upper = body.toUpperCase()
    const date = parseTravelDate(this.request.travelDate)
    const tokens = [
      String(this.request.source).toUpperCase(),
      String(this.request.destination).toUpperCase(),
      String(this.selected?.trainNumber || ''),
      String(this.selected?.class || this.request.coach).toUpperCase(),
      String(this.selected?.quota || this.request.quota || 'GENERAL').replace(/_/g, ' ').toUpperCase(),
    ].filter(Boolean)

    for (const token of tokens) {
      if (!upper.includes(token)) {
        throw new Error('Pre-submit journey verification failed; missing ' + token)
      }
    }

    if (
      !body.includes(date.raw) &&
      !body.includes(date.iso) &&
      !body.includes(date.displayNew)
    ) {
      throw new Error('Pre-submit journey verification failed; requested travel date is not visible.')
    }

    for (const passenger of this.request.passengers) {
      const name = String(passenger.name).trim()
      const age = String(passenger.age)
      if (!body.includes(name) || !body.includes(age) || !body.includes(passenger.gender)) {
        throw new Error('Pre-submit passenger verification failed for ' + name)
      }
      if (
        passenger.berth &&
        !/no preference|any/i.test(passenger.berth) &&
        !body.includes(passenger.berth)
      ) {
        throw new Error('Pre-submit berth verification failed for ' + name)
      }
    }

    return true
  }

  async verifyTransaction() {
    const timeout = Number(process.env.TRANSACTION_TIMEOUT_MS) || 180000
    const terminal = this.page.waitForFunction(() => {
      const text = document.body?.innerText || ''
      return /transaction\s*(failed|declined)|booking\s*(failed|cancelled)|payment\s*failed|unable to book|pnr|ticket\s*(booked|confirmed)|booking\s*(successful|confirmed)|payment\s*successful/i.test(text) ||
        /payment|gateway|ipay|razorpay|bank/i.test(location.href)
    }, undefined, { timeout })

    await terminal.catch(() => {
      throw new Error('Transaction outcome is unknown; refusing to resubmit.')
    })

    const body = await this.bodyText()
    if (/transaction\s*(failed|declined)|booking\s*(failed|cancelled)|payment\s*failed|unable to book/i.test(body)) {
      throw new Error('Transaction result page reports failure or decline.')
    }

    return true
  }

  async extractAndVerifyBooking() {
    const body = await this.bodyText()
    const pnr = parsePnr(body)
    if (!pnr) {
      throw new Error('Booking result is not authoritative: labeled 10-digit PNR not found.')
    }

    if (!/congratulations|ticket\s*(booked|confirmed)|booking\s*(successful|confirmed)/i.test(body)) {
      throw new Error('PNR is present but booking-success context is missing.')
    }

    const required = [
      String(this.request.source).toUpperCase(),
      String(this.request.destination).toUpperCase(),
      String(this.selected?.class || this.request.coach).toUpperCase(),
    ]

    for (const token of required) {
      if (token && !body.toUpperCase().includes(token)) {
        throw new Error('Booking result consistency check failed; missing ' + token)
      }
    }

    const trainNumber = String(this.selected?.trainNumber || '')
    if (trainNumber && !body.includes(trainNumber)) {
      throw new Error('Booking result consistency check failed; selected train ' + trainNumber + ' missing')
    }

    return {
      pnr,
      selectedTrain: this.selected?.trainNumber || null,
      selectedTrainName: this.selected?.trainName || null,
      coach: this.selected?.class || this.request.coach,
      quota: this.selected?.quota || this.request.quota || 'GENERAL',
      availability: this.selected?.availability || null,
      verifiedAt: new Date().toISOString(),
    }
  }

  async openEntrySurface() { throw new Error('openEntrySurface must be implemented by the concrete adapter.') }
  async prepareJourney() { throw new Error('prepareJourney must be implemented by the concrete adapter.') }
  async searchJourney() { throw new Error('searchJourney must be implemented by the concrete adapter.') }
  async submitTransaction() { throw new Error('submitTransaction must be implemented by the concrete adapter.') }
}

module.exports = { IRCTCAdapter }
