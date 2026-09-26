const { preflightIRCTCAccess } = require('../src/engine/irctc/sessionManager')

async function main() {
  const browser = process.env.SIVA_PREFLIGHT_BROWSER || process.env.PLAYWRIGHT_BROWSER || 'auto'
  const headless = String(process.env.SIVA_PREFLIGHT_HEADLESS || '').toLowerCase() === 'true'

  console.log('[DIAGNOSTIC] Browser=' + browser + '; headless=' + headless)
  const result = await preflightIRCTCAccess({
    request: { browser },
    headless,
    onEvent: event => {
      if (event?.message) console.log(event.message)
    },
  })

  console.log(JSON.stringify(result, null, 2))
  if (result.ok) process.exitCode = 0
  else if (result.blocked) process.exitCode = 2
  else process.exitCode = 1
}

main().catch(error => {
  console.error('[DIAGNOSTIC] ' + error.message)
  process.exitCode = 1
})
