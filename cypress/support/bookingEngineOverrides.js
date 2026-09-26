// Runtime-safe overrides for the autonomous engine commands.
//
// These commands intentionally wait for legitimate security challenges instead
// of trying to solve, bypass, or conceal them.

function bodyText($body) {
  return $body.text().replace(/\s+/g, ' ').trim()
}

function challengeIsActive($body) {
  const text = bodyText($body)
  const hasCaptchaControl =
    $body.find(
      'input[id*="captcha" i], input[name*="captcha" i], img[class*="captcha" i]',
    ).length > 0
  const hasOtpControl =
    $body.find(
      'input[autocomplete*="one-time" i], input[name*="otp" i], input[id*="otp" i]',
    ).length > 0

  return (
    hasCaptchaControl ||
    hasOtpControl ||
    /enter.*captcha|captcha.*enter|enter.*otp|otp.*sent|one.?time.?password/i.test(
      text,
    )
  )
}

Cypress.Commands.add('engineWaitForChallenge', (timeoutMs = 120000) => {
  const deadline = Date.now() + timeoutMs

  const poll = () =>
    cy.get('body', { timeout: 10000 }).then(($body) => {
      if (!challengeIsActive($body)) return

      if (Date.now() >= deadline) {
        cy.screenshot('SECURITY-CHALLENGE-timeout')
        throw new Error(
          'Security challenge timeout; the current booking state was not submitted again.',
        )
      }

      cy.wait(250).then(poll)
    })

  return poll()
})

Cypress.Commands.add('engineAssertAuthenticated', () => {
  cy.get('body', { timeout: 30000 }).then(($body) => {
    if (challengeIsActive($body)) {
      throw new Error('A security challenge is still active.')
    }

    const text = bodyText($body)
    const authenticated =
      /logout|sign out/i.test(text) &&
      (/book ticket|home|my account/i.test(text) || text.length > 0)

    if (!authenticated) {
      throw new Error('Authenticated IRCTC state could not be verified.')
    }
  })
})
