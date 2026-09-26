const assert = require('node:assert/strict')
const { chromium } = require('playwright')

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
  console.log('[SMOKE] Playwright ' + requested + ' launch and locator/actionability check passed.')
})().catch(error => {
  console.error('[SMOKE] ' + error.stack)
  process.exitCode = 1
})