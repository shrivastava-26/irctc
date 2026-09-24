# MVP Definition

Status: VERIFIED against repository evidence.

## MVP-1: Reliable entry-state validation

### Goal

Prove the site loads at the correct IRCTC route and that the UI is in an expected entry or auth boundary state before any deeper automation begins.

### Scope

- Open site at `/nget/train-search`
- Detect access denied or WAF response
- Handle language-selection modal if present
- Validate visible page state using live text checks
- Capture evidence as screenshot / logs

### Success criteria

- The page loads without a fatal route failure.
- The script can report access-denied/WAF clearly.
- The script can detect `LOGIN / REGISTER` or `BOOK TICKET` in the page text.
- The script stops before CAPTCHA, OTP, or payment states.

### Out of scope

- Authenticated booking flow
- CAPTCHA solving
- OTP automation
- Payment automation

### Evidence status

VERIFIED. The repository explicitly states this is the current safe baseline.

## MVP-2: Train search validation

### Goal

Validate the booking search form only after the entry/auth gate is passed and a known authenticated state exists.

### Scope

- From station entry
- To station entry
- Journey date selection
- Class selection
- Quota selection
- Search execution

### Success criteria

- The script can fill the search form without crashing on stale selectors.
- It can detect either results display or a no-results state.
- It can stop before any security challenge.

### Out of scope

- Passenger data automation
- Review page automation
- Payment processing
- CAPTCHA solving

### Evidence status

PARTIAL. Code exists for search fields and result detection, but the repository states that the current live DOM is not yet fully verified.

## MVP-3: Search result discovery

### Goal

Discover trains and parse availability information from the search result page at a safe and explicit boundary.

### Scope

- Parse returned trains
- Extract availability metadata
- Report results in a structured format

### Success criteria

- Search results are visible as a valid list or message.
- The script can distinguish between no results and blocked state.
- It records evidence instead of continuing into a challenge boundary.

### Out of scope

- Booking the train
- Passenger form completion
- UPI/payment automation
- CAPTCHA solving
- OTP automation

### Evidence status

PARTIAL. The project contains result-oriented logic, but it is not a validated production requirement yet.

## 4. Hard constraints

These are explicitly out of scope for all MVPs:

- CAPTCHA solving
- OTP automation
- Payment automation

## 5. Conclusion

The repository’s current valid MVP path is entry-state validation, not end-to-end booking. This is the correct product boundary for the project at this stage.
