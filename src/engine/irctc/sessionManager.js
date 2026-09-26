const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const PROFILE_ROOT = path.join(__dirname, '..', '..', '.data', 'playwright-profiles')
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
  const value = String(browser || 'edge').toLowerCase()
  if (value === 'chrome') return { channel: 'chrome' }
  if (value === 'edge' || value === 'msedge') return { channel: 'msedge' }
  if (value === 'chromium') return {}
  throw new Error('Unsupported Playwright browser: ' + value + '. Use chromium, chrome, or edge.')
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

  const browser = String(request.browser || process.env.PLAYWRIGHT_BROWSER || 'edge').toLowerCase()
  const dir = profileDir(request, browser)
  fs.mkdirSync(dir, { recursive: true })

  const lockKey = dir
  const release = await acquireProfileLock(lockKey)
  try {
    const context = await chromium.launchPersistentContext(dir, {
      ...browserConfig(browser),
      headless,
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    })

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
    release()
    throw error
  }
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
  launchSession,
  closeSession,
}
