const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('playwright')
const {
  launchSession,
  closeSession,
  profileDir,
} = require('../../src/engine/irctc/sessionManager')

;(async () => {
  const requested = String(process.env.BROWSER_CHANNEL || 'chromium').trim().toLowerCase()
  const channel = requested === 'chromium' ? undefined : requested

  const browser = await chromium.launch({
    ...(channel ? { channel } : {}),
    headless: true,
  })
  const page = await browser.newPage()
  await page.setContent('<main><button type="button">Ready</button><input aria-label="Name" /></main>')
  await page.getByRole('button', { name: 'Ready' }).click()
  await page.getByLabel('Name').fill('Playwright smoke')
  assert.equal(await page.getByLabel('Name').inputValue(), 'Playwright smoke')
  await browser.close()

  const request = {
    credentialsReference: 'playwright-smoke-' + requested,
    browser: requested,
  }
  const userDataDir = profileDir(request, requested)
  fs.rmSync(userDataDir, { recursive: true, force: true })

  const session = await launchSession({ request, headless: true })
  try {
    assert.equal(session.browser, requested)
    assert.equal(session.userDataDir, userDataDir)
    assert.equal(session.page.isClosed(), false)
  } finally {
    await closeSession(session)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }

  console.log('[SMOKE] Playwright ' + requested + ' launch, locators, and persistent session checks passed.')
})().catch(error => {
  console.error('[SMOKE] ' + error.stack)
  process.exitCode = 1
})
