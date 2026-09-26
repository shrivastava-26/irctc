// Persists jobs to .data/jobs.json with atomic replacement.
// All filesystem work is synchronous, so read-modify-write sections are
// serialized within the single Node.js process used by this personal app.

const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', '..', '.data')
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json')

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readAll() {
  ensureDataDir()
  if (!fs.existsSync(JOBS_FILE)) return []

  try {
    const raw = fs.readFileSync(JOBS_FILE, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch (error) {
    throw new Error('Job store is unreadable: ' + error.message)
  }
}

function atomicWrite(file, value) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, value, 'utf8')
  fs.renameSync(tmp, file)
}

function writeAll(jobs) {
  ensureDataDir()
  atomicWrite(JOBS_FILE, JSON.stringify(jobs, null, 2))
}

function save(job) {
  const jobs = readAll()
  const serialized = job?.toJSON ? job.toJSON() : job
  const index = jobs.findIndex(item => item.id === serialized.id)

  if (index === -1) jobs.push(serialized)
  else jobs[index] = serialized

  writeAll(jobs)
  return serialized
}

function findById(id) {
  return readAll().find(item => item.id === id) || null
}

function findAll() {
  return readAll()
}

module.exports = {
  save,
  findById,
  findAll,
  JOBS_FILE,
}
