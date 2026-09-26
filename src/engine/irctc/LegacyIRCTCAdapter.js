const { IRCTCAdapter } = require('./IRCTCAdapter')
const {
  classPattern,
  parseTrainNumber,
  normalizeAvailability,
  parseTravelDate,
  escapeRegExp,
} = require('./utils')

class LegacyIRCTCAdapter extends IRCTCAdapter {
  async openEntrySurface() {
    await this.page.goto('https://www.irctc.co.in/nget/train-search', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await this.page.locator('body').waitFor({ state: 'visible', timeout: 60000 })
    await this.ensureEnglish()
  }

  async hasJourneyForm() {
    return await this.page.locator('#origin').isVisible().catch(() => false)
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
    await input.click()
    await input.fill(String(value).slice(0, 10))

    const code = String(value).toUpperCase()
    const suggestion = this.page
      .locator(
        '.ui-autocomplete-panel li:visible, .p-autocomplete-panel li:visible, [role="option"]:visible',
      )
      .filter({ hasText: new RegExp('(^|\\s|-)' + escapeRegExp(code) + '(\\s|$)', 'i') })
      .first()

    await suggestion.waitFor({ state: 'visible', timeout: 15000 })
    await suggestion.click()
  }

  async selectDate() {
    const target = parseTravelDate(this.request.travelDate)
    const input = this.page.locator('#jDate').first()
    await input.waitFor({ state: 'visible', timeout: 15000 })
    await input.click()

    const picker = this.page.locator('.ui-datepicker:visible').first()
    await picker.waitFor({ state: 'visible', timeout: 10000 })

    let matched = false
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const header = (await picker.locator('.ui-datepicker-title').innerText()).replace(/\s+/g, ' ')
      if (header.includes(target.monthName) && header.includes(String(target.year))) {
        matched = true
        break
      }

      const next = picker.locator('.ui-datepicker-next').first()
      await next.waitFor({ state: 'visible', timeout: 5000 })
      await next.click()
    }

    if (!matched) {
      throw new Error('Legacy IRCTC calendar did not reach ' + target.monthName + ' ' + target.year)
    }

    const dayCells = picker
      .locator('td:visible:not(.ui-datepicker-other-month)')
      .filter({ hasText: new RegExp('^' + target.day + '$') })

    const count = await dayCells.count()
    let clicked = false
    for (let index = 0; index < count; index += 1) {
      const cell = dayCells.nth(index)
      const disabled = await cell.getAttribute('aria-disabled').catch(() => null)
      const classes = (await cell.getAttribute('class').catch(() => '')) || ''
      if (disabled === 'true' || /disabled/i.test(classes)) continue
      await cell.click()
      clicked = true
      break
    }

    if (!clicked) throw new Error('Legacy IRCTC calendar did not expose ' + target.raw)

    const actual = await input.inputValue()
    if (actual !== target.raw) {
      throw new Error('Legacy IRCTC date mismatch: expected ' + target.raw + ', saw ' + actual)
    }
  }

  async selectClass() {
    const requested = String(this.request.coach).toUpperCase()
    const field = this.page.locator('#journeyClass').first()
    await field.waitFor({ state: 'visible', timeout: 10000 })
    await field.click()

    const optionCandidates = [
      this.page.getByRole('option').filter({ hasText: classPattern(requested) }).first(),
      this.page.locator('.ui-dropdown-item:visible, .p-dropdown-item:visible').filter({ hasText: classPattern(requested) }).first(),
    ]

    for (const option of optionCandidates) {
      if (await option.isVisible().catch(() => false)) {
        await option.click()
        return
      }
    }

    throw new Error('Legacy IRCTC class option ' + requested + ' was not found.')
  }

  async selectQuota() {
    const requested = String(this.request.quota || 'GENERAL').replace(/_/g, ' ')
    const field = this.page.locator('#journeyQuota').first()
    await field.waitFor({ state: 'visible', timeout: 10000 })
    await field.click()

    const optionCandidates = [
      this.page.getByRole('option').filter({ hasText: new RegExp('^\\s*' + escapeRegExp(requested) + '\\s*$', 'i') }).first(),
      this.page.locator('.ui-dropdown-item:visible, .p-dropdown-item:visible').filter({ hasText: new RegExp('^\\s*' + escapeRegExp(requested) + '\\s*$', 'i') }).first(),
    ]

    for (const option of optionCandidates) {
      if (await option.isVisible().catch(() => false)) {
        await option.click()
        return
      }
    }

    throw new Error('Legacy IRCTC quota option ' + requested + ' was not found.')
  }

  async searchJourney() {
    const searchCandidates = [
      this.page.getByRole('button', { name: /^Search Trains$/i }).first(),
      this.page.getByRole('button', { name: /^Modify Search$/i }).first(),
    ]

    let search = null
    for (const candidate of searchCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        search = candidate
        break
      }
    }

    if (!search) throw new Error('Legacy IRCTC Search Trains control was not found.')
    if (!(await search.isEnabled())) throw new Error('Legacy IRCTC Search Trains control is disabled.')

    await search.click()
    await this.detectRuntimeSurface()
  }

  async inspectAvailability(candidate) {
    const rawText = (await candidate.innerText()).replace(/\s+/g, ' ')
    const trainNumber = parseTrainNumber(rawText)
    if (!trainNumber) throw new Error('Legacy train result has no exact 5-digit train number.')

    const heading = candidate.locator('.train-heading strong').first()
    const headingText = await heading.innerText().catch(() => '')
    const trainName = headingText
      .replace(trainNumber, '')
      .replace(/\s+/g, ' ')
      .trim() || null

    const classTile = candidate
      .locator('div.pre-avl')
      .filter({ hasText: classPattern(this.request.coach) })
      .first()

    if (!(await classTile.isVisible().catch(() => false))) {
      throw new Error(
        'Requested class ' + this.request.coach + ' is absent for train ' + trainNumber,
      )
    }

    let availabilityText = await classTile.innerText()
    let availability = normalizeAvailability(availabilityText)

    if (availability.status === 'UNKNOWN') {
      await classTile.click()
      await this.page.locator('div.pre-avl').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      availabilityText = await classTile.innerText()
      availability = normalizeAvailability(availabilityText)
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
    if (!candidate) throw new Error('No selected legacy train result.')

    const book = candidate.getByRole('button', { name: /^Book Now$/i }).first()
    if (!(await book.isVisible().catch(() => false))) {
      throw new Error('Legacy Book Now control was not available for the selected train/class.')
    }
    if (!(await book.isEnabled().catch(() => false))) {
      throw new Error('Legacy Book Now control is disabled for the selected train/class.')
    }

    const before = this.page.url()
    await book.click()
    await this.page.waitForLoadState('domcontentloaded').catch(() => {})

    if (this.page.url() === before) {
      const bookingHint = /passenger|traveller|booking details/i.test(await this.bodyText())
      if (!bookingHint) {
        throw new Error('Legacy train/class selection did not open passenger booking surface.')
      }
    }
  }

  async selectPassengers() {
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

    const containers = this.page.locator(
      'app-passenger-detail, app-passenger, .passenger-card, .passenger-form, tr.passenger-row',
    )
    const count = await containers.count()
    if (count < this.request.passengers.length) {
      throw new Error('Could not locate scoped passenger containers for all requested passengers.')
    }

    for (let index = 0; index < this.request.passengers.length; index += 1) {
      const passenger = this.request.passengers[index]
      const card = containers.nth(index)

      const nameCandidates = [
        card.getByLabel(/^name$/i).first(),
        card.locator('input[placeholder*="name" i]').first(),
        card.locator('input[name*="name" i]').first(),
      ]
      let name = null
      for (const candidate of nameCandidates) {
        if (await candidate.isVisible().catch(() => false)) {
          name = candidate
          break
        }
      }
      if (!name) throw new Error('Passenger name field missing for passenger ' + (index + 1))
      await name.fill(passenger.name)

      const ageCandidates = [
        card.getByLabel(/^age$/i).first(),
        card.locator('input[placeholder*="age" i]').first(),
        card.locator('input[name*="age" i]').first(),
      ]
      let age = null
      for (const candidate of ageCandidates) {
        if (await candidate.isVisible().catch(() => false)) {
          age = candidate
          break
        }
      }
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
            name: new RegExp(escapeRegExp(passenger.berth), 'i'),
          }).last()
          if (await option.isVisible().catch(() => false)) await option.click()
        }
      }

      if (
        (await name.inputValue().catch(() => '')) !== passenger.name ||
        (await age.inputValue().catch(() => '')) !== String(passenger.age)
      ) {
        throw new Error('Passenger verification failed for ' + passenger.name)
      }
    }
  }

  async validateReview() {
    await this.validateBooking()
  }

  async submitTransaction() {
    await this.validateReview()
    const button = this.page
      .getByRole('button', { name: /pay.*book|confirm booking|submit|proceed/i })
      .last()

    if (!(await button.isVisible().catch(() => false))) {
      throw new Error('Legacy final booking/payment control was not found.')
    }
    if (!(await button.isEnabled().catch(() => false))) {
      throw new Error('Legacy final booking/payment control is disabled.')
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

module.exports = { LegacyIRCTCAdapter }
