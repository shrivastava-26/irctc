// Durable execution state for one booking job.
// Writes are atomic (temp file + rename) so a process crash does not leave a
// partially-written state file.

const fs = require('fs')
const path = require('path')

const RUNS_DIR = path.join(__dirname, '..', '..', '.data', 'automation-runs')

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function safeJobId(jobId) {
  return String(jobId || '').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function runDir(jobId) {
  return path.join(RUNS_DIR, safeJobId(jobId))
}

function stateFile(jobId) {
  return path.join(runDir(jobId), 'state.json')
}

function historyFile(jobId) {
  return path.join(runDir(jobId), 'history.jsonl')
}

function atomicWrite(file, value) {
  const dir = path.dirname(file)
  ensureDir(dir)
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, value, 'utf8')
  fs.renameSync(tmp, file)
}

function load(jobId) {
  const file = stateFile(jobId)
  if (!fs.existsSync(file)) return null

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error('Booking state is unreadable for job ' + jobId + ': ' + error.message)
  }
}

function save(jobId, patch) {
  const previous = load(jobId) || {
    version: 1,
    jobId: String(jobId),
    state: 'BOOT',
    data: {},
    history: [],
  }

  const event = {
    at: new Date().toISOString(),
    from: previous.state,
    to: patch.state || previous.state,
    type: patch.type || 'STATE_CHANGED',
    message: patch.message || null,
    metadata: patch.metadata || null,
  }

  const next = {
    ...previous,
    ...patch,
    jobId: String(jobId),
    version: 1,
    updatedAt: new Date().toISOString(),
    history: [...(previous.history || []).slice(-99), event],
  }

  atomicWrite(stateFile(jobId), JSON.stringify(next, null, 2))
  atomicWrite(
    historyFile(jobId),
    (next.history || []).map((item) => JSON.stringify(item)).join('\n') + '\n',
  )

  return next
}

function clear(jobId) {
  const dir = runDir(jobId)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

function listRuns() {
  ensureDir(RUNS_DIR)
  return fs
    .readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

module.exports = {
  load,
  save,
  clear,
  listRuns,
  RUNS_DIR,
}
