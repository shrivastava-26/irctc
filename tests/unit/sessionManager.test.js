const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const {
  browserConfig,
  configuredBrowser,
  isMissingBrowserExecutable,
  profileDir,
  launchSession,
  closeSession,
} = require('../../src/engine/irctc/sessionManager')

test('browserConfig maps supported browser targets', () => {
  assert.deepEqual(browserConfig('chromium'), {})
  assert.deepEqual(browserConfig('chrome'), { channel: 'chrome' })
  assert.deepEqual(browserConfig('edge'), { channel: 'msedge' })
})

test('missing branded browser errors are classified for fallback', () => {
  assert.equal(
    isMissingBrowserExecutable(
      new Error("browserType.launchPersistentContext: Chromium distribution 'msedge' is not found at /opt/microsoft/msedge/msedge"),
    ),
    true,
  )
  assert.equal(isMissingBrowserExecutable(new Error('Navigation timeout')), false)
})

test('browser configuration defaults to chromium when no explicit target exists', () => {
  const previous = process.env.PLAYWRIGHT_BROWSER
  delete process.env.PLAYWRIGHT_BROWSER
  try {
    assert.equal(configuredBrowser({}), 'chromium')
  } finally {
    if (previous == null) delete process.env.PLAYWRIGHT_BROWSER
    else process.env.PLAYWRIGHT_BROWSER = previous
  }
})

test('persistent Chromium session launches successfully', async () => {
  const request = {
    credentialsReference: 'session-manager-test',
    browser: 'chromium',
  }
  const dir = profileDir(request, 'chromium')
  fs.rmSync(dir, { recursive: true, force: true })

  const session = await launchSession({ request, headless: true })
  try {
    assert.equal(session.browser, 'chromium')
    assert.equal(session.userDataDir, dir)
    assert.equal(session.page.isClosed(), false)
  } finally {
    await closeSession(session)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
