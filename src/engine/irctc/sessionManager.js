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

function profileDir(request, browser) {
  return path.join(
    PROFILE_ROOT,
    safe(request.credentialsReference || 'default'),
    safe(browser),
  )
}

function browserConfig(browser) {
  const value = String(browser || DEFAULT_BROWSER).toLowerCase()
  if (value === 'chrome') return { channel: 'chrome' }
  if (value === 'edge' || value === 'msedge') return { channel: 'msedge' }
  if (value === 'chromium') return {}
  throw new Error('Unsupported Playwright browser: ' + value + '. Use chromium, chrome, or edge.')
}

function configuredBrowser(request) {
  return String(request.browser || process.env.PLAYWRIGHT_BROWSER || DEFAULT_BROWSER).toLowerCase()
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
  const candidates = requestedBrowser === 'chromium'
    ? ['chromium']
    : [requestedBrowser, 'chromium']

  let lastError = null

  for (const browser of candidates) {
    const dir = profileDir(request, browser)
    fs.mkdirSync(dir, { recursive: true })

    const lockKey = dir
    const release = await acquireProfileLock(lockKey)
    let context = null

    try {
      context = await chromium.launchPersistentContext(dir, {
        ...browserConfig(browser),
        headless,
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      })

      if (browser !== requestedBrowser) {
        onEvent?.({
          type: 'LOG',
          message: '[BROWSER] ' + requestedBrowser +
            ' is unavailable; falling back to bundled Chromium.',
        })
      }

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

      return {
        context,
        page,
        browser,
        userDataDir: dir,
        release,
      }
    } catch (error) {
      if (context) await context.close().catch(() => {})
      release()
      lastError = error

      const canFallback =
        browser === requestedBrowser &&
        requestedBrowser !== 'chromium' &&
        isMissingBrowserExecutable(error)

      if (canFallback) continue
      throw error
    }
  }

  throw lastError || new Error('No supported Playwright browser could be launched.')
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
  browserConfig,
  configuredBrowser,
  isMissingBrowserExecutable,
  launchSession,
  closeSession,
}
