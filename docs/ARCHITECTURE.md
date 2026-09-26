# Autonomous Booking Engine Architecture

## Layers

UI
-> Job request
-> Scheduler
-> Cypress adapter
-> Persistent browser state
-> IRCTC web application

The UI and scheduler do not contain booking selectors. Cypress owns the browser interaction layer.

## State and persistence

Job lifecycle is stored by JobStore. Fine-grained browser execution checkpoints are stored by RunStateStore under .data/automation-runs.

RunStateStore writes state atomically and keeps bounded history. This allows recovery without replaying completed read-only steps.

## Execution

The autonomous spec is one deterministic state machine. Each state records:
- start
- completion/next state
- telemetry mark
- diagnostic message

## Transaction safety

Search and availability are retryable reads.

Booking submission and payment are transaction-sensitive. If execution stops after a transactional action, the engine verifies current result state before considering another attempt.

An unknown result is preserved as UNKNOWN and is never treated as a safe retry.

## Browser mode

The engine is designed for a normal headed local browser. It does not rely on anti-detection browser flags or CAPTCHA bypass.

Security challenges are legitimate execution boundaries. The browser can wait for challenge completion and then resume the same workflow.

## Performance

FAST_MODE controls artifacts and logging overhead. Telemetry measures each state boundary so optimization work is based on observed latency instead of assumptions.

## Current limitation

The public IRCTC Beta entry page is verified. Downstream booking DOM and all transaction responses are not continuously stable and have not been live-verified from this development environment. Selector logic is therefore isolated so it can be updated without changing the engine architecture.
