const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('playwright')
const {
  launchSession,
  closeSession,
  profileDir,
} = require('../../src/engine/irctc/sessionManager')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.setContent('<main><button type="button">Ready</button><input aria-label="Name" /></main>')
  await page.getByRole('button', { name: 'Ready' }).click()
  await page.getByLabel('Name').fill('Playwright smoke')
  assert.equal(await page.getByLabel('Name').inputValue(), 'Playwright smoke')
  await browser.close()

  const request = {
    credentialsReference: 'playwright-smoke',
    browser: 'chromium',
  }
  const userDataDir = profileDir(request, 'chromium')
  fs.rmSync(userDataDir, { recursive: true, force: true })

  const session = await launchSession({ request, headless: true })
  try {
    assert.equal(session.browser, 'chromium')
    assert.equal(session.userDataDir, userDataDir)
    assert.equal(session.page.isClosed(), false)
  } finally {
    await closeSession(session)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }

  console.log('[SMOKE] Playwright browser launch and persistent session checks passed.')
})().catch(error => {
  console.error('[SMOKE] ' + error.stack)
  process.exitCode = 1
})
