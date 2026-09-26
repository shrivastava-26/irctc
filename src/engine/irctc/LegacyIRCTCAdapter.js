const { IRCTCAdapter } = require('./IRCTCAdapter')
const { classPattern, parseTrainNumber, normalizeAvailability, parseTravelDate, escapeRegExp } = require('./utils')

class LegacyIRCTCAdapter extends IRCTCAdapter {
  async openEntrySurface() {
    await this.page.goto('https://www.irctc.co.in/nget/train-search', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await this.page.locator('body').waitFor({ state: 'visible', timeout: 60000 })
    await this.ensureEnglish()
  }

  async hasJourneyForm() {
    return this.page.locator('#origin').isVisible().catch(() => false)
  }

  async prepareJourney() {
    await this.selectStation('#origin', this.request.source)
    await this.selectStation('#destination', this.request.destination)
    await this.selectDate()
    await this.selectClass()
    await this.selectQuota()
  }

  async selectStation(selector, value) {
    const input = this.page.locator(selector).first()
    await input.waitFor({ state: 'visible', timeout: 15000 })
    await input.fill(String(value).slice(0, 10))

    const pattern = new RegExp('(^|\\s|-)' + escapeRegExp(String(value).toUpperCase()) + '(\\s|$)', 'i')
    const suggestion = this.page.locator(
      '.ui-autocomplete-panel li:visible, .p-autocomplete-panel li:visible, [role="option"]:visible',
    ).filter({ hasText: pattern }).first()

    await suggestion.waitFor({ state: 'visible', timeout: 15000 })
    await suggestion.click()
  }

  async selectDate() {
    const target = parseTravelDate(this.request.travelDate)
    const input = this.page.locator('#jDate').first()
    await input.click()
    const picker = this.page.locator('.ui-datepicker:visible').first()
    await picker.waitFor({ state: 'visible', timeout: 10000 })

    let reached = false
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const title = (await picker.locator('.ui-datepicker-title').innerText()).replace(/\s+/g, ' ')
      if (title.includes(target.monthName) && title.includes(String(target.year))) {
        reached = true
        break
      }
      await picker.locator('.ui-datepicker-next').first().click()
    }
    if (!reached) throw new Error('Legacy calendar did not reach ' + target.monthName + ' ' + target.year)

    const cells = picker.locator('td:visible:not(.ui-datepicker-other-month)').filter({
      hasText: new RegExp('^' + target.day + '$'),
    })
    const count = await cells.count()
    for (let i = 0; i < count; i += 1) {
      const cell = cells.nth(i)
      const cls = await cell.getAttribute('class').catch(() => '')
      const disabled = await cell.getAttribute('aria-disabled').catch(() => null)
      if (disabled === 'true' || /disabled/i.test(cls || '')) continue
      await cell.click()
      const actual = await input.inputValue()
      if (actual === target.raw) return
    }
    throw new Error('Legacy calendar did not select ' + target.raw)
  }

  async selectClass() {
    const field = this.page.locator('#journeyClass').first()
    await field.click()
    const requested = String(this.request.coach).toUpperCase()
    const candidates = [
      this.page.getByRole('option').filter({ hasText: classPattern(requested) }).first(),
      this.page.locator('.ui-dropdown-item:visible, .p-dropdown-item:visible').filter({ hasText: classPattern(requested) }).first(),
    ]
    for (const option of candidates) {
      if (await option.isVisible().catch(() => false)) {
        await option.click()
        return
      }
    }
    throw new Error('Legacy class option ' + requested + ' not found.')
  }

  async selectQuota() {
    const field = this.page.locator('#journeyQuota').first()
    await field.click()
    const requested = String(this.request.quota || 'GENERAL').replace(/_/g, ' ')
    const pattern = new RegExp('^\\s*' + escapeRegExp(requested) + '\\s*$', 'i')
    const candidates = [
      this.page.getByRole('option').filter({ hasText: pattern }).first(),
      this.page.locator('.ui-dropdown-item:visible, .p-dropdown-item:visible').filter({ hasText: pattern }).first(),
    ]
    for (const option of candidates) {
      if (await option.isVisible().catch(() => false)) {
        await option.click()
        return
      }
    }
    throw new Error('Legacy quota option ' + requested + ' not found.')
  }

  async searchJourney() {
    const candidates = [
      this.page.getByRole('button', { name: /^Search Trains$/i }).first(),
      this.page.getByRole('button', { name: /^Modify Search$/i }).first(),
    ]
    let search = null
    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        search = candidate
        break
      }
    }
    if (!search || !(await search.isEnabled())) throw new Error('Legacy Search Trains control unavailable.')
    await search.click()
    await this.detectRuntimeSurface()
  }

  async inspectAvailability(candidate) {
    const rawText = (await candidate.innerText()).replace(/\s+/g, ' ')
    const trainNumber = parseTrainNumber(rawText)
    if (!trainNumber) throw new Error('Legacy result has no exact 5-digit train number.')

    const heading = candidate.locator('.train-heading strong').first()
    const headingText = await heading.innerText().catch(() => '')
    const trainName = headingText.replace(trainNumber, '').replace(/\s+/g, ' ').trim() || null

    const classTile = candidate.locator('div.pre-avl').filter({
      hasText: classPattern(this.request.coach),
    }).first()
    await classTile.waitFor({ state: 'visible', timeout: 15000 })

    let text = await classTile.innerText()
    let availability = normalizeAvailability(text)

    if (availability.status === 'UNKNOWN') {
      await classTile.click()
      await this.page.waitForLoadState('domcontentloaded').catch(() => {})
      text = await classTile.innerText()
      availability = normalizeAvailability(text)
    }

    return {
      trainNumber,
      trainName,
      class: String(this.request.coach).toUpperCase(),
      availability,
    }
  }

  async openPassengerFlow() {
    const candidate = this.selected?.container
    const book = candidate?.getByRole('button', { name: /^Book Now$/i }).first()
    if (!book || !(await book.isVisible().catch(() => false))) {
      throw new Error('Legacy Book Now control is not available for selected train/class.')
    }
    if (!(await book.isEnabled())) throw new Error('Legacy Book Now control is disabled.')
    await book.click()
    await this.page.waitForLoadState('domcontentloaded').catch(() => {})
  }

  async selectPassengers() {
    const masterSelections = await this.applyMasterPassengerSelections()
    const rows = this.page.locator(
      'app-passenger-detail, app-passenger, .passenger-card, .passenger-form, tr.passenger-row',
    )
    const count = await rows.count()
    if (count < this.request.passengers.length) {
      throw new Error('Could not locate scoped passenger containers.')
    }

    const identities = []
    const used = new Set()
    for (let index = 0; index < count; index += 1) {
      identities.push(await this.readPassengerIdentity(rows.nth(index)))
    }

    const requestedIdentities = new Set(
      this.request.passengers.map(passenger => [
        passenger.name,
        passenger.age,
        passenger.gender,
      ].map(String).join('|').toLowerCase()),
    )

    for (let requestIndex = 0; requestIndex < this.request.passengers.length; requestIndex += 1) {
      const passenger = this.request.passengers[requestIndex]
      let rowIndex = -1

      for (let index = 0; index < count; index += 1) {
        if (used.has(index)) continue
        if (!passengerIdentityMatches(identities[index], passenger)) continue
        rowIndex = index
        break
      }

      if (rowIndex >= 0) {
        used.add(rowIndex)
        if (masterSelections.has(requestIndex) &&
            await this.verifyMasterPassenger(rows.nth(rowIndex), passenger, requestIndex)) {
          continue
        }
        if (!masterSelections.has(requestIndex)) continue
      } else if (masterSelections.has(requestIndex)) {
        this.emitLog('[MASTER] Passenger ' + (requestIndex + 1) + ' Master selection was not reflected in the form; using local fallback.')
      }

      rowIndex = -1
      for (let index = 0; index < count; index += 1) {
        if (used.has(index)) continue
        const identity = identities[index]
        const isEmpty = !String(identity.name || '').trim() &&
          !String(identity.age || '').trim() &&
          !String(identity.gender || '').trim()
        const belongsToAnotherRequestedPassenger = requestedIdentities.has([
          identity.name,
          identity.age,
          identity.gender,
        ].map(String).join('|').toLowerCase())

        if (isEmpty || !belongsToAnotherRequestedPassenger) {
          rowIndex = index
          break
        }
      }

      if (rowIndex < 0) {
        throw new Error('No safe passenger slot available for passenger ' + (requestIndex + 1))
      }

      const row = rows.nth(rowIndex)
      await this.fillLocalPassengerRow(row, passenger, requestIndex)
      used.add(rowIndex)
      identities[rowIndex] = {
        name: passenger.name,
        age: passenger.age,
        gender: passenger.gender,
      }
      if (this.request.useMasterPassenger) {
        this.emitLog('[MASTER] Passenger ' + (requestIndex + 1) + ' using local passenger data.')
      }
    }
  }

  async fillLocalPassengerRow(row, passenger, index) {
    const findVisible = async candidates => {
      for (const candidate of candidates) {
        if (await candidate.isVisible().catch(() => false)) return candidate
      }
      return null
    }

    const nameField = await findVisible([
      row.getByLabel(/^name$/i).first(),
      row.locator('input[placeholder*="name" i]').first(),
      row.locator('input[name*="name" i]').first(),
    ])
    const ageField = await findVisible([
      row.getByLabel(/^age$/i).first(),
      row.locator('input[placeholder*="age" i]').first(),
      row.locator('input[name*="age" i]').first(),
    ])

    if (!nameField || !ageField) {
      throw new Error('Passenger fields missing for passenger ' + (index + 1))
    }

    await nameField.fill(passenger.name)
    await ageField.fill(String(passenger.age))

    const gender = row.getByLabel(/^gender$/i).first()
    if (await gender.isVisible().catch(() => false)) {
      await gender.click()
      const option = this.page.getByRole('option', {
        name: new RegExp('^' + escapeRegExp(passenger.gender) + '$', 'i'),
      }).last()
      if (await option.isVisible().catch(() => false)) await option.click()
    }

    if (passenger.berth && !/no preference|any/i.test(passenger.berth)) {
      const berth = row.getByLabel(/^berth$/i).first()
      if (await berth.isVisible().catch(() => false)) {
        await berth.click()
        const option = this.page.getByRole('option', {
          name: new RegExp(escapeRegExp(passenger.berth), 'i'),
        }).last()
        if (await option.isVisible().catch(() => false)) await option.click()
      }
    }

    if (
      (await nameField.inputValue()) !== passenger.name ||
      (await ageField.inputValue()) !== String(passenger.age)
    ) {
      throw new Error('Passenger verification failed for ' + passenger.name)
    }
  }

  async submitTransaction() {
    return super.submitTransaction()
  }
  async submitTransaction() {
    return super.submitTransaction()
  }
  async submitTransaction() {
    await this.validateReview()
    const button = this.page.getByRole('button', {
      name: /pay.*book|confirm booking|submit|proceed/i,
    }).last()
    await button.waitFor({ state: 'visible', timeout: 20000 })
    if (!(await button.isEnabled())) throw new Error('Legacy transaction control is disabled.')
    const popup = this.context.waitForEvent('page', { timeout: 10000 }).catch(() => null)
    await button.click()
    const newPage = await popup
    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded').catch(() => {})
      this.page = newPage
    }
    await this.waitForSecurityChallenge()
  }

  async validateReview() {
    return this.validateBooking()
  }
}

module.exports = { LegacyIRCTCAdapter }
