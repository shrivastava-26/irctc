# Performance and Latency

Telemetry marks each booking-state transition and records elapsed time between marks.

Tracked phases include startup, session, search, selection, availability, passenger load/fill, review, submit, transaction verification and final booking verification.

FAST_MODE=true is intended to reduce screenshots/video, keep logging concise, reuse safe persisted state, avoid redundant navigation and use condition-based synchronization.

Do not claim an optimization is faster until equivalent before/after timing is measured. Do not hammer production endpoints for benchmarking; use fixtures or controlled mocks.
