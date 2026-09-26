const fs = require('fs')
const path = require('path')

// Render builds install Chromium into node_modules so the browser binary is
// part of the deploy artifact. Keep the same path at runtime.
if (String(process.env.RENDER || '').toLowerCase() === 'true') {
  process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0'
}

const { chromium } = require('playwright')

const PROFILE_ROOT = path.join(__dirname, '..', '..', '.data', 'playwright-profiles')
const DEFAULT_BROWSER = 'chromium'
const profileLocks = new Map()

function safe(value) {
  return String(value || 'default').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function normalizeBrowser(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized || normalized === 'default') return DEFAULT_BROWSER
  if (normalized === 'system' || normalized === 'auto') return 'auto'
  if (normalized === 'msedge') return 'edge'
  if (normalized === 'chrome-stable') return 'chrome'
  if (['chromium', 'chrome', 'edge'].includes(normalized)) return normalized
  throw new Error('Unsupported Playwright browser: ' + value + '. Use auto, chromium, chrome, or edge.')
}

function resolveBrowserCandidates(requested) {
  const browser = normalizeBrowser(requested)
  if (browser === 'auto') return ['chrome', 'edge', 'chromium']
  if (browser === 'chromium') return ['chromium']
  return [browser, 'chromium']
}


function profileDir(request, browser) {
  return path.join(
    PROFILE_ROOT,
    safe(request.credentialsReference || 'default'),
    safe(browser),
  )
}

function browserConfig(browser) {
  const value = normalizeBrowser(browser)
  if (value === 'chrome') return { channel: 'chrome' }
  if (value === 'edge') return { channel: 'msedge' }
  if (value === 'chromium') return {}
  throw new Error('Browser config requires a concrete browser, got: ' + browser)
}

function configuredBrowser(request) {
  return normalizeBrowser(request.browser || process.env.PLAYWRIGHT_BROWSER || DEFAULT_BROWSER)
}

function isMissingBrowserExecutable(error) {
  const message = String(error?.message || '')
  return /(Chromium distribution .* is not found|Executable .* does not exist|executable.*does not exist|browserType\.launchPersistentContext: .* is not found)/i.test(message)
}

async function acquireProfileLock(key) {
  let releasePrevious = profileLocks.get(key)
  let releaseCurrent
  const current = new Promise(resolve => { releaseCurrent = resolve })
  profileLocks.set(key, current)

  if (releasePrevious) await releasePrevious

  return () => {
    if (profileLocks.get(key) === current) profileLocks.delete(key)
    releaseCurrent()
  }
}

async function launchSession({ request, headless = false, onEvent }) {
  fs.mkdirSync(PROFILE_ROOT, { recursive: true })

  const requestedBrowser = configuredBrowser(request)
  const candidates = resolveBrowserCandidates(requestedBrowser)
  const failures = []

  onEvent?.({
    type: 'LOG',
    message: '[BROWSER] requested=' + requestedBrowser + '; candidates=' + candidates.join(','),
    metadata: { requestedBrowser, candidates },
  })

  for (let index = 0; index < candidates.length; index += 1) {
    const browser = candidates[index]
    const dir = profileDir(request, browser)
    fs.mkdirSync(dir, { recursive: true })

    const release = await acquireProfileLock(dir)
    let context = null

    try {
      context = await chromium.launchPersistentContext(dir, {
        ...browserConfig(browser),
        headless,
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      })

      if (process.env.PLAYWRIGHT_DEBUG === 'true') {
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
      }

      context.setDefaultTimeout(Number(process.env.PLAYWRIGHT_ACTION_TIMEOUT_MS) || 20000)
      context.setDefaultNavigationTimeout(Number(process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS) || 60000)

      const pages = context.pages()
      const page = pages[0] || await context.newPage()

      const existingPages = context.pages()
      for (const extra of existingPages) {
        if (extra !== page && extra.isClosed() === false) {
          extra.on('dialog', dialog => dialog.dismiss().catch(() => {}))
        }
      }

      page.on('pageerror', error => {
        onEvent?.({ type: 'LOG', message: '[BROWSER] pageerror: ' + error.message })
      })
      page.on('console', msg => {
        if (msg.type() === 'error') {
          onEvent?.({ type: 'LOG', message: '[BROWSER] console error: ' + msg.text() })
        }
      })

      const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => null)
      onEvent?.({
        type: 'LOG',
        message: '[BROWSER] selected=' + browser,
        metadata: {
          requestedBrowser,
          actualBrowser: browser,
          playwrightVersion: require('playwright/package.json').version,
          userAgent,
        },
      })

      return {
        context,
        page,
        browser,
        requestedBrowser,
        userDataDir: dir,
        release,
      }
    } catch (error) {
      if (context) await context.close().catch(() => {})
      release()
      const detail = String(error?.message || error)
      failures.push(browser + ': ' + detail)

      const canFallback =
        index < candidates.length - 1 &&
        browser !== 'chromium' &&
        (isMissingBrowserExecutable(error) || requestedBrowser === 'auto')

      if (canFallback) {
        onEvent?.({
          type: 'LOG',
          message: '[BROWSER] ' + browser + ' unavailable; falling back to ' + candidates[index + 1] + '.',
          metadata: {
            requestedBrowser,
            failedBrowser: browser,
            nextBrowser: candidates[index + 1],
            reason: detail,
          },
        })
        continue
      }

      throw error
    }
  }

  throw new Error(
    'No supported Playwright browser could be launched. Tried ' +
    candidates.join(' -> ') +
    '. ' +
    failures.join(' | '),
  )
}

async function closeSession(session) {
  if (!session) return
  try {
    await session.context?.close()
  } finally {
    session.release?.()
  }
}

module.exports = {
  PROFILE_ROOT,
  profileDir,
  normalizeBrowser,
  resolveBrowserCandidates,
  browserConfig,
  configuredBrowser,
  isMissingBrowserExecutable,
  launchSession,
  closeSession,
}
