const {
  SURFACES,
  parsePnr,
  parseTravelDate,
  availabilitySatisfies,
  escapeRegExp,
  detectRuntimeSurfaceFromUrl,
} = require('./utils')
const { selectedTrainEntries, orderedTrainNumbers, trainPriority, pickFirstSatisfied } = require('./selection')
const { findMasterPassenger, passengerIdentityMatches, normalizePassengerValue } = require('./masterPassenger')
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
    this.masterPassengerCache = []
    this.masterPassengerLoaded = false
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

  async detectPreSearchSurface(options = {}) {
    const configuredTimeout = Number(options.timeoutMs)
    const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : Number(process.env.IRCTC_PRESEARCH_DETECTION_TIMEOUT_MS) || 15000

    const startedAt = Date.now()
    let lastDiagnostics = null

    while (Date.now() - startedAt < timeoutMs) {
      const url = this.page.url()
      const routeSurface = detectRuntimeSurfaceFromUrl(url)
      const title = await this.page.title().catch(() => '')
      const body = (await this.bodyText()).replace(/\s+/g, ' ').trim()
      const blocked = /(?:\b403\b|forbidden|access denied|service unavailable|bad gateway|gateway timeout)/i.test(body)

      lastDiagnostics = {
        url,
        title,
        routeSurface,
        blocked,
      }

      if (routeSurface !== SURFACES.UNKNOWN && !blocked) {
        this.runtimeSurface = routeSurface
        return this.runtimeSurface
      }

      if (await this.page.locator('#origin').isVisible().catch(() => false)) {
        this.runtimeSurface = SURFACES.LEGACY
        return this.runtimeSurface
      }

      const newSurfaceSignals = [
        this.page.getByRole('combobox', { name: /from station/i }).first(),
        this.page.locator('input[formcontrolname="origin"]:visible').first(),
        this.page.locator('input[name*="origin" i]:visible').first(),
        this.page.locator('input[placeholder*="from" i]:visible').first(),
        this.page.locator('app-jp-input:visible').first(),
      ]

      for (const signal of newSurfaceSignals) {
        if (await signal.isVisible().catch(() => false)) {
          this.runtimeSurface = SURFACES.NEW
          return this.runtimeSurface
        }
      }

      await this.page.waitForTimeout(250)
    }

    this.emitLog('[SURFACE] Pre-search detection timed out.', lastDiagnostics)
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
    const desired = String(trainNumber).trim()
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

  async preloadMasterData() {
    if (!this.request.useMasterPassenger || this.masterPassengerLoaded) {
      return this.masterPassengerCache
    }

    this.emitLog('[MASTER] Master Passenger mode enabled.')
    const originalUrl = this.page.url()

    try {
      const triggerCandidates = [
        this.page.getByRole('link', { name: /master passenger|master list/i }).first(),
        this.page.getByRole('button', { name: /master passenger|master list/i }).first(),
        this.page.getByText(/master passenger list/i).first(),
      ]

      let trigger = null
      for (const candidate of triggerCandidates) {
        if (await candidate.isVisible().catch(() => false)) {
          trigger = candidate
          break
        }
      }

      if (!trigger) {
        this.emitLog('[MASTER] Master Passenger UI unavailable; local fallback enabled.')
        return []
      }

      const href = await trigger.getAttribute('href').catch(() => null)
      if (href && !/^#|^javascript:/i.test(href)) {
        await this.page.goto(new URL(href, originalUrl).href, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        })
      } else {
        await trigger.click()
        await this.page.locator('body').waitFor({ state: 'visible', timeout: 15000 })
      }

      const rows = this.page.locator(
        'table tbody tr:visible, [role="row"]:visible, .master-passenger-row:visible, .master-passenger-card:visible',
      )
      const count = await rows.count()
      const records = []
      const seen = new Set()

      for (let i = 0; i < count; i += 1) {
        const row = rows.nth(i)
        const cells = row.locator('th, td, [role="gridcell"]')
        const cellCount = await cells.count()
        const values = []

        for (let c = 0; c < cellCount; c += 1) {
          const value = (await cells.nth(c).innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
          if (value) values.push(value)
        }

        const text = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
        const genderMatch = text.match(/\b(male|female|transgender|m|f)\b/i)
        const ageMatch = text.match(/\b(\d{1,3})\b/)
        const age = ageMatch ? Number(ageMatch[1]) : null
        const gender = genderMatch
          ? ({
              m: 'Male',
              f: 'Female',
              male: 'Male',
              female: 'Female',
              transgender: 'Transgender',
            }[genderMatch[1].toLowerCase()] || genderMatch[1])
          : null

        const name = values.find(value =>
          value &&
          !/^\d{1,3}$/.test(value) &&
          !/^(male|female|transgender|m|f)$/i.test(value) &&
          !/^(edit|delete|remove|select|add|action)$/i.test(value),
        ) || null

        if (!name || age == null || !gender || age < 0 || age > 120) continue

        const record = { name, age, gender }
        const key = [
          normalizePassengerValue(record.name),
          Number(record.age),
          normalizePassengerValue(record.gender),
        ].join('|')

        if (!seen.has(key)) {
          seen.add(key)
          records.push(record)
        }
      }

      this.masterPassengerCache = records
      this.emitLog('[MASTER] Loaded ' + records.length + ' records.')

      const close = this.page.getByRole('button', { name: /close|cancel|done/i }).last()
      if (await close.isVisible().catch(() => false) && this.page.url() === originalUrl) {
        await close.click().catch(() => {})
      }

      if (this.page.url() !== originalUrl) {
        await this.page.goto(originalUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        })
        await this.ensureEnglish()
        await this.ensureAuthenticated()
      }

      return records
    } catch (error) {
      this.masterPassengerCache = []
      this.emitLog('[MASTER] Master list unavailable; local fallback enabled.', {
        reason: error.message,
      })
      return []
    } finally {
      this.masterPassengerLoaded = true
    }
  }

  masterPassengerFor(requested) {
    return findMasterPassenger(this.masterPassengerCache, requested)
  }

  async applyMasterPassengerSelections() {
    if (!this.request.useMasterPassenger || !this.masterPassengerCache.length) return new Set()

    const matches = this.request.passengers.map((passenger, index) => ({
      passenger,
      index,
      record: this.masterPassengerFor(passenger),
    }))

    for (const item of matches) {
      if (!item.record) {
        this.emitLog('[MASTER] Passenger ' + (item.index + 1) + ' not found; using local fallback.')
      }
    }

    const matched = matches.filter(item => item.record)
    if (!matched.length) return new Set()

    const triggerCandidates = [
      this.page.getByRole('button', {
        name: /add existing|master passenger|master list|saved passenger|existing passenger/i,
      }).first(),
      this.page.getByRole('link', {
        name: /add existing|master passenger|master list|saved passenger|existing passenger/i,
      }).first(),
      this.page.getByText(/^\+?\s*Add Existing$/i).first(),
    ]

    let trigger = null
    for (const candidate of triggerCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        trigger = candidate
        break
      }
    }

    if (!trigger) {
      for (const item of matched) {
        this.emitLog('[MASTER] Passenger ' + (item.index + 1) + ' could not open Master selection; using local fallback.')
      }
      return new Set()
    }

    await trigger.click()

    const selectableRows = this.page.locator(
      '[role="option"]:visible, [role="row"]:visible, li:visible, tr:visible, .passenger-card:visible, .master-passenger-card:visible',
    )
    const rowCount = await selectableRows.count()
    const selectedIndexes = new Set()

    for (const item of matched) {
      const targetName = normalizePassengerValue(item.record.name)
      let chosen = null

      for (let i = 0; i < rowCount; i += 1) {
        const row = selectableRows.nth(i)
        const text = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
        if (!normalizePassengerValue(text).includes(targetName)) continue

        const hasAge = new RegExp('\\b' + item.record.age + '\\b').test(text)
        const hasGender = new RegExp('\\b' + escapeRegExp(item.record.gender) + '\\b', 'i').test(text)
        if (hasAge && hasGender) {
          chosen = row
          break
        }
      }

      if (!chosen) {
        this.emitLog('[MASTER] Passenger ' + (item.index + 1) + ' Master record could not be selected; using local fallback.')
        continue
      }

      const checkbox = chosen.locator('input[type="checkbox"]').first()
      if (await checkbox.isVisible().catch(() => false)) {
        if (!(await checkbox.isChecked().catch(() => false))) await checkbox.check()
      } else {
        await chosen.click()
      }
      selectedIndexes.add(item.index)
    }

    const add = this.page.getByRole('button', { name: /add passenger|done|apply/i }).last()
    if (await add.isVisible().catch(() => false) && await add.isEnabled().catch(() => false)) {
      await add.click()
    } else {
      const close = this.page.getByRole('button', { name: /close|cancel/i }).last()
      if (await close.isVisible().catch(() => false)) await close.click()
    }

    return selectedIndexes
  }

  async readPassengerIdentity(container) {
    const fieldValue = async candidates => {
      for (const candidate of candidates) {
        if (!(await candidate.isVisible().catch(() => false))) continue
        const value = await candidate.inputValue().catch(() => '')
        if (String(value || '').trim()) return String(value).trim()
        const text = (await candidate.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
        if (text) return text
      }
      return ''
    }

    const name = await fieldValue([
      container.getByLabel(/^name$/i).first(),
      container.locator('input[name*="name" i], input[placeholder*="name" i]').first(),
      container.locator('[data-field*="name" i]').first(),
    ])

    const age = await fieldValue([
      container.getByLabel(/^age$/i).first(),
      container.locator('input[name*="age" i], input[placeholder*="age" i]').first(),
      container.locator('[data-field*="age" i]').first(),
    ])

    let gender = await fieldValue([
      container.getByLabel(/^gender$/i).first(),
      container.locator('select[name*="gender" i], [data-field*="gender" i]').first(),
    ])

    if (!gender) {
      const text = (await container.innerText().catch(() => '')).replace(/\s+/g, ' ')
      const match = text.match(/\b(Male|Female|Transgender)\b/i)
      gender = match ? match[1] : ''
    }

    return { name, age, gender }
  }

  async verifyMasterPassenger(container, requested, index) {
    const actual = await this.readPassengerIdentity(container)
    if (passengerIdentityMatches(actual, requested)) {
      this.emitLog('[MASTER] Passenger ' + (index + 1) + ' verified.')
      return true
    }

    this.emitLog('[MASTER] Passenger ' + (index + 1) + ' MASTER INVALID; using local fallback.')
    return false
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

    const candidateIndex = new Map(
      available.map(candidate => [String(candidate.trainNumber), candidate]),
    )
    const explicit = selectedTrainEntries(this.request)
    const ordered = orderedTrainNumbers(this.request, available)
    let lastReason = 'no candidate satisfied the request'

    for (const numberValue of ordered) {
      const number = String(numberValue).trim()
      const priority = explicit ? trainPriority(this.request, number) : null
      const candidate = candidateIndex.get(number)

      if (!candidate) {
        lastReason = 'train ' + number + ' not found'
        if (explicit) {
          this.emitLog('[TRAIN] Priority ' + priority + ' ' + number + ' not present in results.')
          if (explicit.length === 1) {
            throw new Error('Selected train ' + number + ' was not present in search results.')
          }
        } else if (this.request.trainSelectionPolicy === 'FIXED') {
          break
        }
        continue
      }

      if (explicit) this.emitLog('[TRAIN] Checking priority ' + priority + ': ' + number + '.')

      const evaluation = await this.inspectAvailability(candidate)
      if (!pickFirstSatisfied([evaluation], this.request.availabilityRequirement, availabilitySatisfies)) {
        lastReason = 'train ' + number + ' / ' + this.request.coach + ' returned ' + evaluation.availability.status
        if (explicit) {
          this.emitLog('[TRAIN] ' + number + ' unavailable.')
          if (explicit.length === 1) {
            throw new Error('Selected train ' + number + ' does not satisfy the requested availability.')
          }
        } else if (this.request.trainSelectionPolicy === 'FIXED') {
          break
        }
        continue
      }

      this.selected = {
        trainNumber: evaluation.trainNumber,
        trainName: evaluation.trainName || null,
        class: evaluation.class,
        quota: String(this.request.quota || 'GENERAL').toUpperCase(),
        availability: evaluation.availability,
        priority,
        container: candidate,
      }

      RunStateStore.save(this.jobId, {
        metadata: {
          runtimeSurface: this.runtimeSurface,
          actualSelectedTrainNumber: this.selected.trainNumber,
          actualSelectedTrainName: this.selected.trainName,
          actualSelectedClass: this.selected.class,
          actualSelectedQuota: this.selected.quota,
          actualSelectedPriority: this.selected.priority,
          actualAvailability: this.selected.availability,
        },
      })

      if (explicit) {
        this.emitLog('[TRAIN] Selected priority ' + priority + ': ' + number + '.')
        this.emitLog('[TRAIN] Stopping lower-priority checks.')
      } else {
        this.emitLog('[TRAIN] Selected ' + this.selected.trainNumber + ' ' + (this.selected.trainName || '') + ' ' + this.selected.class + ' ' + this.selected.availability.status)
      }
      return this.selected
    }

    throw new Error(
      explicit && explicit.length > 1
        ? 'No selected train satisfied priority availability requirements: ' + lastReason
        : 'No train satisfied deterministic selection: ' + lastReason,
    )
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

  paymentMethod() {
    return String(this.request.paymentPreference?.method || 'UPI').toUpperCase()
  }

  async clickPaymentContinueIfVisible() {
    const candidates = [
      this.page.getByRole('button', { name: /^Continue$/i }).first(),
      this.page.getByText(/^Continue$/i).first(),
    ]

    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false) &&
          await candidate.isEnabled().catch(() => false)) {
        await candidate.click()
        return true
      }
    }
    return false
  }

  async selectPaymentMethod() {
    const method = this.paymentMethod()
    this.emitLog('[PAYMENT] Payment method: ' + method + '.')

    if (method !== 'UPI' && method !== 'EWALLET') {
      throw new Error('Unsupported payment method: ' + method)
    }

    const outerGatewayText = /pay through credit.*debit.*net banking.*wallets?.*others?/i

    if (method === 'UPI') {
      const direct = [
        this.page.getByRole('radio', { name: /upi|bhim/i }).first(),
        this.page.getByLabel(/upi|bhim/i).first(),
        this.page.getByText(/pay through bhim.*upi/i).first(),
      ]

      for (const candidate of direct) {
        if (await candidate.isVisible().catch(() => false)) {
          await candidate.click()
          await this.clickPaymentContinueIfVisible()
          return
        }
      }

      const gateway = this.page.getByText(outerGatewayText).last()
      if (await gateway.isVisible().catch(() => false)) {
        await gateway.click()
        await this.clickPaymentContinueIfVisible()
        const upi = this.page.getByText(/pay through bhim.*upi/i).first()
        if (await upi.isVisible().catch(() => false)) {
          await upi.click()
          await this.clickPaymentContinueIfVisible()
          return
        }
      }

      // Preserve legacy UPI behavior when no explicit payment selector is rendered.
      return
    }

    const direct = [
      this.page.getByRole('radio', { name: /irctc\s*e[- ]?wallet|e[- ]?wallet/i }).first(),
      this.page.getByLabel(/irctc\s*e[- ]?wallet|e[- ]?wallet/i).first(),
      this.page.getByText(/e[- ]?wallet\s*\(\s*instant payment\s*\)|irctc\s*e[- ]?wallet/i).first(),
    ]

    let selected = false
    for (const candidate of direct) {
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click()
        selected = true
        break
      }
    }

    if (!selected) {
      const gateway = this.page.getByText(outerGatewayText).last()
      if (await gateway.isVisible().catch(() => false)) {
        await gateway.click()
        await this.clickPaymentContinueIfVisible()
      }
      for (const candidate of direct) {
        if (await candidate.isVisible().catch(() => false)) {
          await candidate.click()
          selected = true
          break
        }
      }
    }

    if (!selected) throw new Error('Selected payment method unavailable: IRCTC eWallet.')
    await this.clickPaymentContinueIfVisible()
    this.emitLog('[PAYMENT] eWallet selected.')
  }

  moneyAfter(pattern, text) {
    const match = String(text || '').match(pattern)
    return match ? Number(String(match[1]).replace(/,/g, '')) : null
  }

  async payWithUPI() {
    const upiId = String(this.request.paymentPreference?.upiId || '').trim()
    if (!upiId) throw new Error('UPI ID is required for UPI payment.')

    const fields = [
      this.page.getByLabel(/upi id|upi/i).first(),
      this.page.locator(
        'input[name*="upi" i], input[id*="upi" i], input[placeholder*="upi" i], input[aria-label*="upi" i]',
      ).first(),
    ]

    for (const field of fields) {
      if (await field.isVisible().catch(() => false)) {
        await field.fill(upiId)
        if ((await field.inputValue().catch(() => '')) === upiId) return
      }
    }
  }

  async payWithEWallet() {
    const body = await this.bodyText()
    if (/insufficient\s+(?:irctc\s+)?e[- ]?wallet\s+balance/i.test(body)) {
      throw new Error('IRCTC eWallet balance insufficient.')
    }

    const balance = this.moneyAfter(
      /\bbalance\s*[:\-]?\s*₹?\s*([\d,]+(?:\.\d+)?)\b/i,
      body,
    )
    const payable = this.moneyAfter(
      /(?:total\s+fare|amount\s+payable|payable\s+amount|total\s+amount)\s*[:\-]?\s*₹?\s*([\d,]+(?:\.\d+)?)\b/i,
      body,
    )

    if (balance != null && payable != null && balance < payable) {
      throw new Error('IRCTC eWallet balance insufficient.')
    }
    if (balance != null) this.emitLog('[PAYMENT] Wallet balance verified.')

    const passwordCandidates = [
      this.page.getByLabel(/transaction password|e[- ]?wallet.*password|wallet.*password/i).first(),
      this.page.locator(
        'input[type="password"]:visible[name*="wallet" i], ' +
        'input[type="password"]:visible[id*="wallet" i], ' +
        'input[type="password"]:visible[placeholder*="wallet" i], ' +
        'input[type="password"]:visible[name*="transaction" i], ' +
        'input[type="password"]:visible[id*="transaction" i], ' +
        'input[type="password"]:visible[placeholder*="transaction" i]',
      ).first(),
    ]

    for (const field of passwordCandidates) {
      if (!(await field.isVisible().catch(() => false))) continue
      const credential = this.credentials?.ewalletTransactionPassword
      if (!credential) {
        throw new Error('Selected payment method unavailable: IRCTC eWallet transaction password is required by the current payment flow.')
      }
      await field.fill(credential)
      return
    }
  }

  async clickFinalPaymentControl() {
    const buttons = [
      this.page.getByRole('button', { name: /^Pay\s*&\s*Book$/i }).first(),
      this.page.getByRole('button', { name: /^Proceed to Pay$/i }).first(),
      this.page.getByRole('button', { name: /pay and book/i }).first(),
      this.page.getByRole('button', { name: /confirm booking/i }).first(),
    ]

    let button = null
    for (const candidate of buttons) {
      if (await candidate.isVisible().catch(() => false)) {
        button = candidate
        break
      }
    }

    if (!button) throw new Error('Final payment control is unavailable for the selected payment method.')
    if (!(await button.isEnabled().catch(() => false))) {
      throw new Error('Final payment control is disabled.')
    }

    this.emitLog('[PAYMENT] Payment submission initiated.')
    const popup = this.context.waitForEvent('page', { timeout: 10000 }).catch(() => null)
    await button.click()
    const newPage = await popup
    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded').catch(() => {})
      this.page = newPage
    }
  }

  async verifyPaymentState() {
    await this.waitForSecurityChallenge(180000)
    const body = await this.bodyText()
    if (/transaction\s*(failed|declined)|booking\s*(failed|cancelled)|payment\s*failed|unable to book/i.test(body)) {
      throw new Error('Payment result reports failure or decline.')
    }
    this.emitLog('[PAYMENT] Payment result verified.')
  }

  async submitTransaction() {
    await this.validateBooking()
    await this.selectPaymentMethod()
    if (this.paymentMethod() === 'UPI') await this.payWithUPI()
    else await this.payWithEWallet()
    await this.clickFinalPaymentControl()
    await this.verifyPaymentState()
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
