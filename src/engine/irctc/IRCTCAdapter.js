const {
  SURFACES,
  parsePnr,
  parseTravelDate,
  availabilitySatisfies,
  escapeRegExp,
  detectRuntimeSurfaceFromUrl,
} = require('./utils')
const { orderedTrainNumbers, pickFirstSatisfied } = require('./selection')
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
  }

  emitLog(message, metadata = null) {
    this.emit?.({ type: 'LOG', state: this.state || null, message, metadata })
  }

  bodyText() {
    return this.page.locator('body').innerText().catch(() => '')
  }

  async waitForSecurityChallenge(timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs
    const challengeVisible = async () => {
      const body = (await this.bodyText()).replace(/\s+/g, ' ')
      if (/enter.*captcha|captcha.*enter|enter.*otp|otp.*sent|one[- ]?time[- ]?password/i.test(body)) return true
      const locator = this.page.locator(
        'input[id*="captcha" i], input[name*="captcha" i], input[aria-label*="captcha" i], input[name*="otp" i], input[id*="otp" i], input[aria-label*="otp" i]',
      )
      const count = await locator.count()
      for (let i = 0; i < count; i += 1) {
        if (await locator.nth(i).isVisible().catch(() => false)) return true
      }
      return false
    }

    if (!(await challengeVisible())) return
    this.emitLog('[SECURITY] CAPTCHA/OTP detected; waiting for manual completion.')

    while (await challengeVisible()) {
      if (Date.now() >= deadline) {
        throw new Error('Security challenge was not completed before timeout.')
      }
      await this.page.waitForTimeout(250)
    }
  }

  async ensureEnglish() {
    const english = this.page.getByRole('button', { name: /^English$/i }).first()
    if (await english.isVisible().catch(() => false)) await english.click()
  }

  async isAuthenticated() {
    const body = (await this.bodyText()).replace(/\s+/g, ' ')
    return /\blogout\b|\bsign out\b|my account|booked ticket/i.test(body) &&
      !/\blogin\s*\/\s*register\b/i.test(body)
  }

  async ensureAuthenticated() {
    await this.waitForSecurityChallenge()
    if (await this.isAuthenticated()) return true

    const login = [
      this.page.getByRole('button', { name: /login|sign in/i }).first(),
      this.page.getByRole('link', { name: /login|sign in/i }).first(),
    ]

    let trigger = null
    for (const candidate of login) {
      if (await candidate.isVisible().catch(() => false)) {
        trigger = candidate
        break
      }
    }
    if (!trigger) throw new Error('IRCTC login control is not visible and authenticated state is not verified.')

    if (!this.credentials?.username || !this.credentials?.password) {
      throw new Error('IRCTC credentials are unavailable for login.')
    }

    await trigger.click()

    const username = [
      this.page.getByRole('textbox', { name: /username|user.?name|login/i }).first(),
      this.page.locator('input[placeholder*="user" i], input[name*="user" i], input[id*="user" i]').first(),
    ]
    let userInput = null
    for (const candidate of username) {
      if (await candidate.isVisible().catch(() => false)) {
        userInput = candidate
        break
      }
    }
    if (!userInput) throw new Error('IRCTC username input was not found.')
    await userInput.fill(this.credentials.username)

    const password = this.page.locator('input[type="password"]:visible').first()
    await password.waitFor({ state: 'visible', timeout: 15000 })
    await password.fill(this.credentials.password)

    const submit = this.page.getByRole('button', { name: /login|sign in|continue/i }).last()
    await submit.waitFor({ state: 'visible', timeout: 15000 })
    if (!(await submit.isEnabled())) throw new Error('IRCTC login submit control is disabled.')
    await submit.click()

    await this.waitForSecurityChallenge()
    if (!(await this.isAuthenticated())) throw new Error('IRCTC authenticated state could not be verified after login.')
    return true
  }

  async detectRuntimeSurface() {
    await this.page.waitForURL(/train-list/i, { timeout: 45000 }).catch(() => {})
    const byUrl = detectRuntimeSurfaceFromUrl(this.page.url())
    if (byUrl !== SURFACES.UNKNOWN) {
      this.runtimeSurface = byUrl
      return byUrl
    }
    if (await this.page.locator('div.train-result-container').count()) {
      this.runtimeSurface = SURFACES.NEW
      return this.runtimeSurface
    }
    if (await this.page.locator('app-train-avl-enq').count()) {
      this.runtimeSurface = SURFACES.LEGACY
      return this.runtimeSurface
    }
    throw new Error('Could not determine IRCTC runtime surface. URL=' + this.page.url())
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
    const results = []
    const containers = this.trainContainers()
    const count = await containers.count()
    for (let i = 0; i < count; i += 1) {
      const container = containers.nth(i)
      const text = (await container.innerText()).replace(/\s+/g, ' ').trim()
      const match = text.match(/(?:^|\D)(\d{5})(?:\D|$)/)
      if (match) results.push({ trainNumber: match[1], text, index: i })
    }
    return results
  }

  async findCandidate(trainNumber) {
    const desired = String(trainNumber)
    const containers = this.trainContainers()
    const count = await containers.count()
    for (let i = 0; i < count; i += 1) {
      const candidate = containers.nth(i)
      const text = await candidate.innerText()
      const match = text.match(/(?:^|\D)(\d{5})(?:\D|$)/)
      if (match?.[1] === desired) return candidate
    }
    return null
  }


  async verifyQuota() {
    const desired = String(this.request.quota || 'GENERAL').replace(/_/g, ' ')
    const body = (await this.bodyText()).replace(/\s+/g, ' ')
    if (!new RegExp('\\b' + escapeRegExp(desired) + '\\b', 'i').test(body)) {
      throw new Error('Requested quota is not visible in current train results: ' + desired)
    }
  }

  async selectTrain() {
    const available = await this.listCandidates()
    if (!available.length) throw new Error('No train candidates found.')
    await this.verifyQuota()

    const ordered = orderedTrainNumbers(this.request, available)
    let lastReason = 'no candidate satisfied the request'

    for (const number of ordered) {
      const candidate = await this.findCandidate(number)
      if (!candidate) {
        lastReason = 'train ' + number + ' not found'
        if (this.request.trainSelectionPolicy === 'FIXED') break
        continue
      }

      const evaluation = await this.inspectAvailability(candidate)
      if (!pickFirstSatisfied([evaluation], this.request.availabilityRequirement, availabilitySatisfies)) {
        lastReason = 'train ' + number + ' / ' + this.request.coach + ' returned ' + evaluation.availability.status
        if (this.request.trainSelectionPolicy === 'FIXED') break
        continue
      }

      this.selected = {
        trainNumber: evaluation.trainNumber,
        trainName: evaluation.trainName || null,
        class: evaluation.class,
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
      this.emitLog('[TRAIN] Selected ' + this.selected.trainNumber + ' ' + (this.selected.trainName || '') + ' ' + this.selected.class + ' ' + this.selected.availability.status)
      return this.selected
    }

    throw new Error('No train satisfied deterministic selection: ' + lastReason)
  }

  async verifyAvailability() {
    if (!this.selected) throw new Error('No selected train exists.')
    const evaluation = await this.inspectAvailability(this.selected.container)
    if (String(evaluation.trainNumber) !== String(this.selected.trainNumber)) throw new Error('Selected train changed during availability verification.')
    if (String(evaluation.class).toUpperCase() !== String(this.selected.class).toUpperCase()) throw new Error('Selected class changed during availability verification.')
    if (!availabilitySatisfies(evaluation.availability, this.request.availabilityRequirement)) {
      throw new Error('Selected train/class no longer satisfies availability: ' + evaluation.availability.raw)
    }
    this.selected.availability = evaluation.availability
    RunStateStore.save(this.jobId, { metadata: { actualSelectedTrainNumber: this.selected.trainNumber, actualSelectedTrainName: this.selected.trainName, actualSelectedClass: this.selected.class, actualSelectedQuota: this.selected.quota, actualAvailability: this.selected.availability } })
    await this.openPassengerFlow()
  }

  async validateBooking() {
    const body = (await this.bodyText()).replace(/\s+/g, ' ')
    const upper = body.toUpperCase()
    const date = parseTravelDate(this.request.travelDate)

    for (const token of [
      String(this.request.source).toUpperCase(),
      String(this.request.destination).toUpperCase(),
      String(this.selected?.trainNumber || ''),
      String(this.selected?.class || this.request.coach).toUpperCase(),
      String(this.selected?.quota || this.request.quota || 'GENERAL').replace(/_/g, ' ').toUpperCase(),
    ]) {
      if (token && !upper.includes(token)) throw new Error('Pre-submit journey verification failed; missing ' + token)
    }

    if (!body.includes(date.raw) && !body.includes(date.iso) && !body.includes(date.displayNew)) {
      throw new Error('Pre-submit journey verification failed; requested date is not visible.')
    }

    for (const passenger of this.request.passengers) {
      const name = String(passenger.name)
      const age = String(passenger.age)
      if (!upper.includes(name.toUpperCase()) || !body.includes(age) || !upper.includes(String(passenger.gender).toUpperCase())) {
        throw new Error('Pre-submit passenger verification failed for ' + name)
      }
      if (passenger.berth && !/no preference|any/i.test(passenger.berth) && !upper.includes(String(passenger.berth).toUpperCase())) {
        throw new Error('Pre-submit berth verification failed for ' + name)
      }
    }
  }

  async reconcileTransaction() {
    const pages = this.context.pages()
    for (const page of pages) {
      if (page.isClosed()) continue
      const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ')
      if (/transaction\s*(failed|declined)|booking\s*(failed|cancelled)|payment\s*failed|unable to book/i.test(body)) {
        return { status: 'FAILED', page }
      }
      if (parsePnr(body) && /congratulations|ticket\s*(booked|confirmed)|booking\s*(successful|confirmed)/i.test(body)) {
        this.page = page
        return { status: 'SUCCESS', page, pnr: parsePnr(body) }
      }
    }

    const links = this.page.getByRole('link', { name: /booked ticket history|booked tickets|booking history|my transactions/i })
      .or(this.page.getByRole('button', { name: /booked ticket history|booked tickets|booking history|my transactions/i }))
      .first()
    if (await links.isVisible().catch(() => false)) {
      await links.click()
      await this.page.waitForLoadState('domcontentloaded').catch(() => {})
      const body = (await this.bodyText()).replace(/\s+/g, ' ')
      const pnr = parsePnr(body)
      if (pnr) return { status: 'SUCCESS', pnr }
    }

    return { status: 'UNKNOWN' }
  }

  async verifyTransaction() {
    const timeout = Number(process.env.TRANSACTION_TIMEOUT_MS) || 180000
    try {
      await this.page.waitForFunction(() => {
        const text = document.body?.innerText || ''
        return /transaction\s*(failed|declined)|booking\s*(failed|cancelled)|payment\s*failed|unable to book|pnr\s*(?:no|number)?\s*[:#-]?\s*\d{10}|ticket\s*(booked|confirmed)|booking\s*(successful|confirmed)|payment\s*successful/i.test(text)
      }, undefined, { timeout })
    } catch {
      throw new Error('Transaction outcome is unknown; refusing to resubmit.')
    }

    const body = await this.bodyText()
    if (/transaction\s*(failed|declined)|booking\s*(failed|cancelled)|payment\s*failed|unable to book/i.test(body)) {
      throw new Error('Transaction result page reports failure or decline.')
    }
  }

  async extractAndVerifyBooking() {
    const body = (await this.bodyText()).replace(/\s+/g, ' ')
    const pnr = parsePnr(body)
    if (!pnr) throw new Error('Booking result is not authoritative: labeled 10-digit PNR not found.')
    if (!/congratulations|ticket\s*(booked|confirmed)|booking\s*(successful|confirmed)/i.test(body)) {
      throw new Error('PNR is present but booking-success context is missing.')
    }

    const date = parseTravelDate(this.request.travelDate)
    const dateOk = body.includes(date.raw) || body.includes(date.iso) || body.includes(date.displayNew)
    if (!dateOk) throw new Error('Booking result consistency check failed; journey date missing.')

    for (const token of [this.request.source, this.request.destination, this.selected?.class || this.request.coach]) {
      if (token && !body.toUpperCase().includes(String(token).toUpperCase())) {
        throw new Error('Booking result consistency check failed; missing ' + token)
      }
    }
    if (this.selected?.trainNumber && !body.includes(this.selected.trainNumber)) {
      throw new Error('Booking result consistency check failed; selected train missing.')
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
}

module.exports = { IRCTCAdapter }
