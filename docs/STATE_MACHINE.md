# Autonomous Booking State Machine

BOOT -> LOAD_CONFIG -> RESTORE_SESSION -> VALIDATE_SESSION -> PRELOAD_MASTER_DATA -> PREPARE_JOURNEY -> SEARCH -> FILTER -> SELECT_TRAIN -> VERIFY_AVAILABILITY -> LOAD_PASSENGERS -> FILL_PASSENGERS -> VALIDATE_BOOKING -> SUBMIT -> VERIFY_TRANSACTION -> VERIFY_BOOKING -> SUCCESS

## Recovery
Preparation and read states can be retried after transient network errors.

SUBMIT is transactional and is never blindly retried. After a crash or timeout the engine first inspects the current page/result state. If the outcome is unknown it remains UNKNOWN and refuses duplicate submission.

Durable state is stored in .data/automation-runs/<jobId>/state.json and transition history in history.jsonl.

Each checkpoint records current state, phase, message, metadata, updatedAt and bounded history.
