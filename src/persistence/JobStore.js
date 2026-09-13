// src/persistence/JobStore.js
// Persists jobs to .data/jobs.json on disk.

const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', '..', '.data')
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readAll() {
  ensureDataDir()
  if (!fs.existsSync(JOBS_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'))
  } catch {
    return []
  }
}

function writeAll(jobs) {
  ensureDataDir()
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8')
}

function save(job) {
  const jobs = readAll()
  const idx = jobs.findIndex(j => j.id === job.id)
  const serialized = job.toJSON ? job.toJSON() : job
  if (idx === -1) {
    jobs.push(serialized)
  } else {
    jobs[idx] = serialized
  }
  writeAll(jobs)
}

function findById(id) {
  return readAll().find(j => j.id === id) || null
}

function findAll() {
  return readAll()
}

module.exports = { save, findById, findAll }
