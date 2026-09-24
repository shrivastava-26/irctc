# Selector Audit

Status: VERIFIED for the current codebase; risk classification reflects the likelihood of selector drift against a dynamic Angular/PrimeNG DOM.

## 1. Audit methodology

The repository contains a mix of:

- text-based live selectors,
- Angular/PrimeNG class selectors,
- placeholder selectors,
- and legacy positional selectors.

The current safe baseline prefers text matching, but the older booking logic still uses brittle positional selectors and DOM assumptions.

## 2. Selector inventory

| Selector | Type | Location | Purpose | Stability | Risk | Recommended replacement |
| --- | --- | --- | --- | --- | --- | --- |
| `button, a, span` filtered by `/english/i` | Text-based | `README.md`, `cypress/e2e/*.cy.js` | Detect language modal | MODERATE | MODERATE | Prefer explicit button text `English` and `हिंदी` with visible filtering |
| `input[placeholder="From"]` | Attribute selector | `cypress/support/commands.js` | Source station input | MODERATE | MODERATE | Use an explicit stable `data-testid` or stable label binding if available |
| `input[placeholder="To"]` | Attribute selector | `cypress/support/commands.js` | Destination input | MODERATE | MODERATE | Same as above |
| `.ui-autocomplete-panel li` | Class selector | `cypress/support/commands.js` | Station suggestion list | FRAGILE | HIGH RISK | Use label-driven or ARIA-based selectors when the app exposes them |
| `.ui-calendar, p-calendar input` | Mixed selector | `cypress/support/commands.js` | Journey date input | MODERATE | MODERATE | Prefer stable datetime field or label-based control |
| `#journeyQuota > .ui-dropdown` | ID/class composite | `cypress/support/commands.js` | Quota dropdown | MODERATE | MODERATE | Text-based `contains` on option list with explicit stable IDs |
| `.ui-dropdown-item` | Class selector | `cypress/support/commands.js` | Quota option list | FRAGILE | HIGH RISK | Prefer list item text and explicit role semantics |
| `button.search_btn` | legacy class | `cypress/e2e/irctc.cy.js` | Search trigger | FRAGILE | HIGH RISK | Prefer text-based `Search Trains` button with visible filtering |
| `.search_btn, .loginText, [class*="login"]` | Regex/class blend | `cypress/e2e/irctc.cy.js` | Login button | FRAGILE | HIGH RISK | Prefer explicit visible text `LOGIN / REGISTER` |
| `input[placeholder="User Name"]` | Attribute selector | `cypress/e2e/irctc.cy.js` | Username input | MODERATE | MODERATE | Prefer an input label or stable field identifier |
| `input[placeholder="Password"]` | Attribute selector | `cypress/e2e/irctc.cy.js` | Password input | MODERATE | MODERATE | Prefer an input label or stable field identifier |
| `.captcha-img` | Class selector | `cypress/support/commands.js` | CAPTCHA detection | MODERATE | MODERATE | Prefer actual challenge container with role or label |
| `#captcha` | ID selector | `cypress/support/commands.js` | CAPTCHA input field | MODERATE | MODERATE | Prefer explicit challenge field name when available |
| `:nth-child(...)` selectors | positional selector | `cypress/support/commands.js` | Legacy fail-prone selection | FRAGILE | HIGH RISK | Remove in favor of text and label-based selection |
| `#\32  > .ui-radiobutton > .ui-radiobutton-box` | generated CSS selector | `cypress/support/commands.js` | UPI option selection | FRAGILE | HIGH RISK | Replace with a semantic payment option label or visible text |
| `.btn, button:contains("Pay")` | mixed selector | `cypress/support/commands.js` | Payment button | FRAGILE | HIGH RISK | Replace with explicit payment action button and step gating |

## 3. Selector risk classification

### SAFE

- `cy.contains('body', /login\s*\/\s*register|book ticket/i)`
- Visible text filtering on the language modal
- Page-body state assertions in the safe baseline

### MODERATE

- `input[placeholder="From"]`
- `input[placeholder="To"]`
- `.captcha-img` when used only for challenge detection
- `button` / `a` / `span` text based selectors when visible and low-risk

### FRAGILE

- `.ui-autocomplete-panel li`
- `.ui-dropdown-item`
- `.search_btn`
- `.loginText`

### HIGH RISK

- Positional selectors such as `:nth-child(...)`
- Generated CSS IDs and class chains from Angular/PrimeNG dynamic rendering
- Payment selectors that interact with financial boundaries

## 4. Selector migration strategy

1. Freeze the current safe baseline selectors and keep them isolated from legacy logic.
2. Replace positional selectors with text-first assertions.
3. Introduce page objects or a minimal selector contract for each meaningful state.
4. Add a rule that no selector interacting with security or payment is allowed without an evidence-backed DOM validation.
5. Treat dynamic Angular/PrimeNG class names as temporary and not as a contract.
6. Prefer accessibility roles, stable labels, and explicit visible text over CSS chains.

## 5. Recommended migration rules

- Use live text matching before class-based selection.
- Avoid DOM traversal by `nth-child` unless no alternative exists.
- Use one selector contract per state boundary.
- Require a state-check before any action to prevent accidental interaction with a hidden overlay.
- Treat any selector that touches CAPTCHA, OTP, or payment as a hard stop and not an automation path.

## 6. Conclusion

The current repository is still too dependent on dynamic CSS selectors and positional logic to be considered stable automation. The narrow evidence-first baseline is acceptable for diagnosis and state validation, but any future production-grade automation requires a selector contract that is validated against live DOM behavior before use.
