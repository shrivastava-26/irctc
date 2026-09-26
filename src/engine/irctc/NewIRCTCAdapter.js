const { IRCTCAdapter } = require('./IRCTCAdapter')
const {
  SURFACES,
  classPattern,
  parseTrainNumber,
  normalizeAvailability,
  parseTravelDate,
  escapeRegExp,
} = require('./utils')

class NewIRCTCAdapter extends IRCTCAdapter {
  async openEntrySurface() {
    await this.page.goto('https://www.irctc.co.in/eticket/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await this.page.locator('body').waitFor({ state: 'visible', timeout: 60000 })
    await this.ensureEnglish()
  }

  async hasJourneyForm() {
    return await this.page.getByRole('combobox', { name: 'From station' }).isVisible().catch(() => false)
  }

  async prepareJourney() {
    await this.selectStation('From station', this.request.source, 'source')
    await this.selectStation('To station', this.request.destination, 'destination')
    await this.selectDate()
    await this.selectQuota()
  }

  async selectStation(label, value, kind) {
    const combo = this.page.getByRole('combobox', { name: label }).first()
    await combo.waitFor({ state: 'visible', timeout: 15000 })
    await combo.click()

    const inputSelectors = kind === 'source'
      ? [
          'input:visible[placeholder*="source" i]',
          'input:visible[aria-label*="source" i]',
          'input:visible[name*="origin" i]',
        ]
      : [
          'input:visible[placeholder*="destination" i]',
          'input:visible[aria-label*="destination" i]',
          'input:visible[name*="destination" i]',
        ]

    let input = null
    for (const selector of inputSelectors) {
      const candidate = this.page.locator(selector).first()
      if (await candidate.isVisible().catch(() => false)) {
        input = candidate
        break
      }
    }

    if (!input) {
      const visibleInputs = this.page.locator('input:visible')
      const count = await visibleInputs.count()
      if (!count) throw new Error(label + ' station autocomplete input was not found.')
      input = visibleInputs.last()
    }

    await input.fill(String(value).slice(0, 10))

    const code = String(value).toUpperCase()
    const optionPattern = new RegExp('(^|\\s|-)'+ escapeRegExp(code) +'(\\s|$)', 'i')
    const options = [
      this.page.getByRole('option').filter({ hasText: optionPattern }).first(),
      this.page.locator('[role="option"]:visible').filter({ hasText: optionPattern }).first(),
      this.page.locator('.ui-autocomplete-panel li:visible, .p-autocomplete-panel li:visible').filter({ hasText: optionPattern }).first(),
    ]

    for (const option of options) {
      if (await option.isVisible().catch(() => false)) {
        await option.click()
        return
      }
    }

    throw new Error('No station suggestion matched ' + value + ' for ' + label + '.')
  }

  async selectDate() {
    const target = parseTravelDate(this.request.travelDate)
    const control = this.page.locator('[aria-label="Select travel date"]').first()
    await control.waitFor({ state: 'visible', timeout: 15000 })
    await control.click()

    const dialog = this.page.getByRole('dialog').last()
    await dialog.waitFor({ state: 'visible', timeout: 10000 })

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const header = (await dialog.innerText()).replace(/\s+/g, ' ')
      if (header.includes(target.monthName) && header.includes(String(target.year))) break

      const nextCandidates = [
        dialog.getByRole('button', { name: /next month|next/i }).last(),
        dialog.locator('[aria-label*="next month" i], [aria-label*="next" i]').last(),
      ]
      let next = null
      for (const candidate of nextCandidates) {
        if (await candidate.isVisible().catch(() => false)) {
          next = candidate
          break
        }
      }
      if (!next) throw new Error('New IRCTC date picker has no visible next-month control.')
      await next.click()
    }

    const day = dialog
      .locator('[role="gridcell"]:visible, td:visible')
      .filter({ hasText: new RegExp('^' + target.day + '$') })

    const count = await day.count()
    let selected = false
    for (let index = 0; index < count; index += 1) {
      const cell = day.nth(index)
      const ariaDisabled = await cell.getAttribute('aria-disabled').catch(() => null)
      const classes = (await cell.getAttribute('class').catch(() => '')) || ''
      if (ariaDisabled === 'true' || /outside|other-month|disabled/i.test(classes)) continue
      await cell.click()
      selected = true
      break
    }

    if (!selected) throw new Error('New IRCTC date picker did not expose ' + target.raw)

    const selectedText = (await control.innerText()).replace(/\s+/g, ' ')
    if (!selectedText.includes(String(target.day)) || !selectedText.includes(target.monthName.slice(0, 3))) {
      throw new Error('New IRCTC date selection mismatch. Expected ' + target.displayNew + ', saw ' + selectedText)
    }
  }

  async selectQuota() {
    const requested = String(this.request.quota || 'GENERAL').replace(/_/g, ' ')
    const combo = this.page.getByRole('combobox', { name: 'Quota' }).first()
    await combo.waitFor({ state: 'visible', timeout: 10000 })
    const current = (await combo.innerText()).replace(/\s+/g, ' ')
    if (new RegExp('^\\s*' + escapeRegExp(requested) + '\\s*$', 'i').test(current)) return

    await combo.click()
    const option = this.page
      .getByRole('option')
      .filter({ hasText: new RegExp('^\\s*' + escapeRegExp(requested) + '\\s*$', 'i') })
      .first()

    await option.waitFor({ state: 'visible', timeout: 10000 })
    await option.click()
  }

  async searchJourney() {
    const search = this.page.getByRole('button', { name: /^Search Trains$/i }).first()
    await search.waitFor({ state: 'visible', timeout: 15000 })
    if (!(await search.isEnabled())) throw new Error('New IRCTC Search Trains button is disabled.')
    await search.click()
    await this.detectRuntimeSurface()
  }

  async inspectAvailability(candidate) {
    const text = (await candidate.innerText()).replace(/\s+/g, ' ')
    const trainNumber = parseTrainNumber(text)
    if (!trainNumber) throw new Error('New IRCTC result has no exact 5-digit train number.')

    const nameMatch = text.match(/\b\d{5}\s+([A-Z][A-Z0-9 .&'-]+?)\s+(?:SL|3A|2A|1A)\b/i)
    const actionCandidates = [
      candidate.getByRole('button', { name: /check availability/i }).first(),
      candidate.getByRole('button', { name: /refresh availability/i }).first(),
    ]

    for (const action of actionCandidates) {
      if (await action.isVisible().catch(() => false)) {
        const label = await action.innerText().catch(() => '')
        if (/check availability/i.test(label) || /refresh availability/i.test(label)) {
          await action.click()
          break
        }
      }
    }

    const classCard = candidate
      .locator('div.class-card')
      .filter({ hasText: classPattern(this.request.coach) })
      .first()

    if (!(await classCard.isVisible().catch(() => false))) {
      throw new Error(
        'Requested class ' + this.request.coach + ' is not present on train ' + trainNumber,
      )
    }

    const statusCandidates = [
      classCard.locator('.status-row').first(),
      classCard.getByRole('button').first(),
      classCard.locator('span.availability-tooltip').first(),
    ]

    let statusText = ''
    for (const status of statusCandidates) {
      if (await status.isVisible().catch(() => false)) {
        statusText = await status.innerText().catch(() => '')
        if (statusText.trim()) break
      }
    }

    if (!statusText) {
      statusText = await classCard.innerText()
    }

    return {
      trainNumber,
      trainName: nameMatch ? nameMatch[1].trim() : null,
      class: String(this.request.coach).toUpperCase(),
      availability: normalizeAvailability(statusText),
    }
  }

  async openPassengerFlow() {
    const candidate = this.selected?.container
    const actionCandidates = [
      candidate?.getByRole('button', { name: /book now/i }).first(),
      candidate?.locator('button').filter({ hasText: /book now/i }).first(),
    ].filter(Boolean)

    for (const action of actionCandidates) {
      if (await action.isVisible().catch(() => false)) {
        if (!(await action.isEnabled().catch(() => false))) {
          throw new Error('Book Now control is visible but disabled for selected train/class.')
        }
        await action.click()
        await this.page.waitForLoadState('domcontentloaded').catch(() => {})
        return
      }
    }

    const classCard = candidate
      ?.locator('div.class-card')
      .filter({ hasText: classPattern(this.request.coach) })
      .first()

    if (classCard && await classCard.isVisible().catch(() => false)) {
      const status = classCard.getByRole('button').first()
      if (await status.isVisible().catch(() => false)) {
        await status.click()
        await this.page.waitForLoadState('domcontentloaded').catch(() => {})
        return
      }
    }

    throw new Error('Selected new-surface train/class has no actionable booking control.')
  }

  async selectPassengers() {
    return this.fillPassengersScoped()
  }

  passengerContainers() {
    return this.page.locator(
      'app-passenger-detail, app-passenger, .passenger-card, .passenger-form, tr.passenger-row',
    )
  }

  async fillPassengersScoped() {
    const master = this.page
      .getByRole('button', { name: /master passenger|master list|saved passenger|existing passenger/i })
      .first()

    if (await master.isVisible().catch(() => false)) {
      await master.click()
      for (const passenger of this.request.passengers) {
        const saved = this.page
          .getByText(new RegExp('^' + escapeRegExp(passenger.name) + '$', 'i'))
          .first()
        if (await saved.isVisible().catch(() => false)) await saved.click()
      }
      const close = this.page.getByRole('button', { name: /done|close|apply/i }).last()
      if (await close.isVisible().catch(() => false)) await close.click()
    }

    const containers = this.passengerContainers()
    const count = await containers.count()
    if (count < this.request.passengers.length) {
      throw new Error('Could not locate scoped passenger containers for all requested passengers.')
    }

    for (let index = 0; index < this.request.passengers.length; index += 1) {
      const passenger = this.request.passengers[index]
      const card = containers.nth(index)

      const name = card.locator('input').filter({ hasText: '' }).first()
      const nameCandidates = [
        card.getByLabel(/^name$/i).first(),
        card.locator('input[placeholder*="name" i]').first(),
        card.locator('input[name*="name" i]').first(),
      ]
      let nameField = null
      for (const candidate of nameCandidates) {
        if (await candidate.isVisible().catch(() => false)) {
          nameField = candidate
          break
        }
      }
      if (!nameField) throw new Error('Passenger name field missing for passenger ' + (index + 1))
      await nameField.fill(passenger.name)

      const ageCandidates = [
        card.getByLabel(/^age$/i).first(),
        card.locator('input[placeholder*="age" i]').first(),
        card.locator('input[name*="age" i]').first(),
      ]
      let ageField = null
      for (const candidate of ageCandidates) {
        if (await candidate.isVisible().catch(() => false)) {
          ageField = candidate
          break
        }
      }
      if (!ageField) throw new Error('Passenger age field missing for passenger ' + (index + 1))
      await ageField.fill(String(passenger.age))

      const gender = card.getByLabel(/^gender$/i).first()
      if (await gender.isVisible().catch(() => false)) {
        await gender.click()
        const option = this.page
          .getByRole('option', { name: new RegExp('^' + escapeRegExp(passenger.gender) + '$', 'i') })
          .last()
        if (await option.isVisible().catch(() => false)) await option.click()
      }

      if (passenger.berth && !/no preference|any/i.test(passenger.berth)) {
        const berth = card.getByLabel(/^berth$/i).first()
        if (await berth.isVisible().catch(() => false)) {
          await berth.click()
          const option = this.page
            .getByRole('option', { name: new RegExp(escapeRegExp(passenger.berth), 'i') })
            .last()
          if (await option.isVisible().catch(() => false)) await option.click()
        }
      }

      const actualName = await nameField.inputValue().catch(() => '')
      const actualAge = await ageField.inputValue().catch(() => '')
      if (actualName !== passenger.name || actualAge !== String(passenger.age)) {
        throw new Error('Passenger input verification failed for ' + passenger.name)
      }
    }
  }

  async validateReview() {
    await this.validateBooking()
  }

  async submitTransaction() {
    await this.validateReview()
    const button = this.page
      .getByRole('button', { name: /pay.*book|confirm booking|proceed|submit/i })
      .last()
    if (!(await button.isVisible().catch(() => false))) {
      throw new Error('Final booking/payment submit control was not found.')
    }
    if (!(await button.isEnabled().catch(() => false))) {
      throw new Error('Final booking/payment submit control is disabled.')
    }

    const popup = this.context.waitForEvent('page', { timeout: 10000 }).catch(() => null)
    await button.click()
    const newPage = await popup
    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded').catch(() => {})
      this.page = newPage
    }

    await this.waitForSecurityChallenge()
  }
}

module.exports = { NewIRCTCAdapter }
