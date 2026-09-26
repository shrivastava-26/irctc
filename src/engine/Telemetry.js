// Lightweight persistent timing telemetry.
// Keep this out of the browser hot path unless DEBUG_MODE is enabled.

const RunStateStore = require('./RunStateStore')

function mark(jobId, name, metadata = null) {
  const current = RunStateStore.load(jobId)
  const marks = Array.isArray(current?.telemetry) ? current.telemetry : []

  const entry = {
    name,
    at: new Date().toISOString(),
    epochMs: Date.now(),
    metadata,
  }

  RunStateStore.save(jobId, {
    telemetry: [...marks.slice(-199), entry],
  })

  return entry
}

function snapshot(jobId) {
  const current = RunStateStore.load(jobId)
  const marks = current?.telemetry || []

  const durations = {}
  for (let i = 1; i < marks.length; i += 1) {
    const previous = marks[i - 1]
    const currentMark = marks[i]
    durations[currentMark.name] = Math.max(0, currentMark.epochMs - previous.epochMs)
  }

  return {
    marks,
    durations,
    totalTimeMs:
      marks.length >= 2
        ? Math.max(0, marks[marks.length - 1].epochMs - marks[0].epochMs)
        : 0,
  }
}

module.exports = { mark, snapshot }
