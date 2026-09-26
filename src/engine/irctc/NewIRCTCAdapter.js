const { IRCTCAdapter } = require('./IRCTCAdapter')
const { classPattern, parseTrainNumber, normalizeAvailability, parseTravelDate, escapeRegExp } = require('./utils')

class NewIRCTCAdapter extends IRCTCAdapter {
  async openEntrySurface() {
    const response = await this.page.goto('https://www.irctc.co.in/eticket/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    this.entryHttpStatus = response?.status?.() || null
    await this.page.locator('body').waitFor({ state: 'visible', timeout: 60000 })
    await this.ensureEnglish()
  }

  async hasJourneyForm() {
    return this.page.getByRole('combobox', { name: 'From station' }).isVisible().catch(() => false)
  }

  async prepareJourney() {
    await this.selectStation('From station', this.request.source, 'source')
    await this.selectStation('To station', this.request.destination, 'destination')
    await this.selectDate()
    await this.selectQuota()
  }

  async selectStation(label, value, kind) {
    const combo = this.page.getByRole('combobox', { name: label })
    await combo.waitFor({ state: 'visible', timeout: 15000 })
    await combo.click()

    const selectors = kind === 'source'
      ? ['input:visible[placeholder*="source" i]', 'input:visible[aria-label*="source" i]', 'input:visible[name*="origin" i]', '[role="listbox"] input:visible']
      : ['input:visible[placeholder*="destination" i]', 'input:visible[aria-label*="destination" i]', 'input:visible[name*="destination" i]', '[role="listbox"] input:visible']

    let input = null
    for (const selector of selectors) {
      const candidate = this.page.locator(selector).first()
      if (await candidate.isVisible().catch(() => false)) {
        input = candidate
        break
      }
    }
    if (!input) throw new Error(label + ' station input not found.')

    await input.fill(String(value).slice(0, 10))
    const code = String(value).toUpperCase()
    const pattern = new RegExp('(^|\\s|-)' + escapeRegExp(code) + '(\\s|$)', 'i')

    const options = [
      this.page.getByRole('option').filter({ hasText: pattern }).first(),
      this.page.locator('[role="option"]:visible').filter({ hasText: pattern }).first(),
      this.page.locator('.ui-autocomplete-panel li:visible, .p-autocomplete-panel li:visible').filter({ hasText: pattern }).first(),
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
    const control = this.page.getByLabel('Select travel date')
    await control.waitFor({ state: 'visible', timeout: 15000 })
    await control.click()

    const dialog = this.page.getByRole('dialog').last()
    await dialog.waitFor({ state: 'visible', timeout: 10000 })

    let reached = false
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const heading = (await dialog.innerText()).replace(/\s+/g, ' ')
      if (heading.includes(target.monthName) && heading.includes(String(target.year))) {
        reached = true
        break
      }
      const next = dialog.getByRole('button', { name: /next month|next/i }).last()
      if (!(await next.isVisible().catch(() => false))) throw new Error('New IRCTC calendar next-month control not found.')
      await next.click()
    }
    if (!reached) throw new Error('New IRCTC calendar did not reach ' + target.monthName + ' ' + target.year)

    const cells = dialog.locator('[role="gridcell"]:visible, td:visible').filter({
      hasText: new RegExp('^' + target.day + '$'),
    })
    const count = await cells.count()
    for (let index = 0; index < count; index += 1) {
      const cell = cells.nth(index)
      const disabled = await cell.getAttribute('aria-disabled').catch(() => null)
      const cls = await cell.getAttribute('class').catch(() => '')
      if (disabled === 'true' || /outside|other-month|disabled/i.test(cls || '')) continue
      await cell.click()
      const selected = (await control.innerText()).replace(/\s+/g, ' ')
      if (selected.includes(String(target.day)) && selected.includes(target.monthName.slice(0, 3))) return
    }
    throw new Error('New IRCTC calendar did not select ' + target.raw)
  }

  async selectQuota() {
    const requested = String(this.request.quota || 'GENERAL').replace(/_/g, ' ')
    const combo = this.page.getByRole('combobox', { name: 'Quota' })
    await combo.waitFor({ state: 'visible', timeout: 10000 })
    const current = (await combo.innerText()).replace(/\s+/g, ' ')
    if (new RegExp('^\\s*' + escapeRegExp(requested) + '\\s*$', 'i').test(current)) return
    await combo.click()
    const option = this.page.getByRole('option', {
      name: new RegExp('^\\s*' + escapeRegExp(requested) + '\\s*$', 'i'),
    }).first()
    await option.waitFor({ state: 'visible', timeout: 10000 })
    await option.click()
  }

  async searchJourney() {
    const search = this.page.getByRole('button', { name: /^Search Trains$/i }).first()
    await search.waitFor({ state: 'visible', timeout: 15000 })
    await search.click()
    await this.detectRuntimeSurface()
  }

  async inspectAvailability(candidate, { readOnly = false } = {}) {
    const text = (await candidate.innerText()).replace(/\s+/g, ' ')
    const trainNumber = parseTrainNumber(text)
    if (!trainNumber) throw new Error('New IRCTC train card has no 5-digit train number.')

    const nameMatch = text.match(/\b\d{5}\s+([A-Z][A-Z0-9 .&'-]+?)\s+(?:SL|3A|2A|1A)\b/i)

    const action = candidate.getByRole('button', { name: /check availability|refresh availability/i }).first()
    if (!readOnly && await action.isVisible().catch(() => false)) {
      await action.click()
      await candidate.locator('div.class-card').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
    }

    const classCard = candidate.locator('div.class-card').filter({
      hasText: classPattern(this.request.coach),
    }).first()
    await classCard.waitFor({ state: 'visible', timeout: 15000 })

    const statusCandidates = [
      classCard.locator('.status-row').first(),
      classCard.locator('.availability-tooltip').first(),
      classCard.getByRole('button').first(),
    ]

    let statusText = ''
    for (const locator of statusCandidates) {
      if (await locator.isVisible().catch(() => false)) {
        statusText = await locator.innerText().catch(() => '')
        if (statusText.trim()) break
      }
    }

    const availability = normalizeAvailability(statusText || await classCard.innerText())
    return {
      trainNumber,
      trainName: nameMatch ? nameMatch[1].trim() : null,
      class: String(this.request.coach).toUpperCase(),
      availability,
    }
  }

  async openPassengerFlow() {
    const candidate = this.selected?.container
    if (!candidate) throw new Error('No selected new-surface train card.')

    const book = candidate.getByRole('button', { name: /^Book Now$/i }).first()
    if (await book.isVisible().catch(() => false)) {
      if (!(await book.isEnabled())) throw new Error('Book Now is disabled for the selected new-surface train/class.')
      await book.click()
      await this.page.waitForLoadState('domcontentloaded').catch(() => {})
      return
    }

    const card = candidate.locator('div.class-card').filter({ hasText: classPattern(this.request.coach) }).first()
    const statusButton = card.getByRole('button').first()
    if (await statusButton.isVisible().catch(() => false) && await statusButton.isEnabled().catch(() => false)) {
      await statusButton.click()
      await this.page.waitForLoadState('domcontentloaded').catch(() => {})
      return
    }

    throw new Error('Selected new-surface train/class has no actionable booking control.')
  }

  async selectPassengers() {
    const master = this.page.getByRole('button', {
      name: /master passenger|master list|saved passenger|existing passenger/i,
    }).first()

    if (await master.isVisible().catch(() => false)) {
      await master.click()
      for (const passenger of this.request.passengers) {
        const saved = this.page.getByText(
          new RegExp('^' + escapeRegExp(passenger.name) + '$', 'i'),
        ).first()
        if (await saved.isVisible().catch(() => false)) await saved.click()
      }
      const close = this.page.getByRole('button', { name: /done|close|apply/i }).last()
      if (await close.isVisible().catch(() => false)) await close.click()
    }

    const containers = this.page.locator('app-passenger-detail, app-passenger, .passenger-card, .passenger-form, tr.passenger-row')
    const count = await containers.count()
    if (count < this.request.passengers.length) {
      throw new Error('Could not locate scoped passenger containers for every passenger.')
    }

    for (let index = 0; index < this.request.passengers.length; index += 1) {
      const passenger = this.request.passengers[index]
      const card = containers.nth(index)
      await this.fillPassengerCard(card, passenger, index)
    }
  }

  async fillPassengerCard(card, passenger, index) {
    const findVisible = async candidates => {
      for (const candidate of candidates) {
        if (await candidate.isVisible().catch(() => false)) return candidate
      }
      return null
    }

    const name = await findVisible([
      card.getByLabel(/^name$/i).first(),
      card.locator('input[placeholder*="name" i]').first(),
      card.locator('input[name*="name" i]').first(),
    ])
    if (!name) throw new Error('Passenger name field missing for passenger ' + (index + 1))
    await name.fill(passenger.name)

    const age = await findVisible([
      card.getByLabel(/^age$/i).first(),
      card.locator('input[placeholder*="age" i]').first(),
      card.locator('input[name*="age" i]').first(),
    ])
    if (!age) throw new Error('Passenger age field missing for passenger ' + (index + 1))
    await age.fill(String(passenger.age))

    const gender = card.getByLabel(/^gender$/i).first()
    if (await gender.isVisible().catch(() => false)) {
      await gender.click()
      const option = this.page.getByRole('option', {
        name: new RegExp('^' + escapeRegExp(passenger.gender) + '$', 'i'),
      }).last()
      if (await option.isVisible().catch(() => false)) await option.click()
    }

    if (passenger.berth && !/no preference|any/i.test(passenger.berth)) {
      const berth = card.getByLabel(/^berth$/i).first()
      if (await berth.isVisible().catch(() => false)) {
        await berth.click()
        const option = this.page.getByRole('option', {
          name: new RegExp('^' + escapeRegExp(passenger.berth) + '$', 'i'),
        }).last()
        if (await option.isVisible().catch(() => false)) await option.click()
      }
    }

    if (
      (await name.inputValue()) !== passenger.name ||
      (await age.inputValue()) !== String(passenger.age)
    ) {
      throw new Error('Passenger verification failed for ' + passenger.name)
    }
  }

  async validateReview() {
    return this.validateBooking()
  }

  async submitTransaction() {
    await this.validateReview()
    const button = this.page.getByRole('button', {
      name: /pay.*book|confirm booking|submit|proceed/i,
    }).last()
    await button.waitFor({ state: 'visible', timeout: 20000 })
    if (!(await button.isEnabled())) throw new Error('Final new-surface transaction control is disabled.')

    const popupPromise = this.context.waitForEvent('page', { timeout: 10000 }).catch(() => null)
    await button.click()
    const popup = await popupPromise
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {})
      this.page = popup
    }
    await this.waitForSecurityChallenge(180000)
  }
}

module.exports = { NewIRCTCAdapter }
