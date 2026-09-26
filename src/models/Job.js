// src/models/Job.js
// Job entity: tracks lifecycle and progress of a single booking job.

const { v4: uuidv4 } = require('uuid')

const JOB_STATUS = {
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
}

class Job {
  constructor(request) {
    this.id = uuidv4()
    this.createdAt = new Date().toISOString()
    this.scheduledAt = request.scheduledAt || null
    this.status = JOB_STATUS.STARTING
    this.request = request
    this.currentState = 'JOB_CREATED'
    this.progressEvents = []
    this.errorInformation = null
    this.completedAt = null

    this._addEvent({
      type: 'STATUS_CHANGED',
      state: 'JOB_CREATED',
      jobStatus: JOB_STATUS.STARTING,
    })
  }

  static fromJSON(data) {
    const job = Object.create(Job.prototype)
    job.id = data.id
    job.createdAt = data.createdAt
    job.scheduledAt = data.scheduledAt || null
    job.status = data.status || JOB_STATUS.STARTING
    job.request = data.request || {}
    job.currentState = data.currentState || 'JOB_CREATED'
    job.progressEvents = Array.isArray(data.progressEvents) ? data.progressEvents : []
    job.errorInformation = data.errorInformation || null
    job.completedAt = data.completedAt || null
    return job
  }

  addLog(message) {
    this._addEvent({ type: 'LOG', state: this.currentState, message })
  }

  transition(newState, message) {
    this.currentState = newState
    this._addEvent({ type: 'STATE_CHANGED', state: newState, message })
  }

  complete(pnr) {
    this.status = JOB_STATUS.COMPLETED
    this.completedAt = new Date().toISOString()
    this.currentState = 'BOOKING_CONFIRMED'
    this._addEvent({
      type: 'STATUS_CHANGED',
      state: 'BOOKING_CONFIRMED',
      jobStatus: JOB_STATUS.COMPLETED,
      pnr: pnr || null,
    })
  }

  fail(reason) {
    this.status = JOB_STATUS.FAILED
    this.errorInformation = reason || 'Unknown error'
    this.completedAt = new Date().toISOString()
    this._addEvent({
      type: 'STATUS_CHANGED',
      state: this.currentState,
      jobStatus: JOB_STATUS.FAILED,
      message: this.errorInformation,
    })
  }

  markRunning() {
    this.status = JOB_STATUS.RUNNING
  }

  _addEvent(fields) {
    this.progressEvents.push({
      ...fields,
      timestamp: new Date().toISOString(),
    })
  }

  toJSON() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      scheduledAt: this.scheduledAt,
      status: this.status,
      request: this.request,
      currentState: this.currentState,
      progressEvents: this.progressEvents,
      errorInformation: this.errorInformation,
      completedAt: this.completedAt,
    }
  }
}

module.exports = { Job, JOB_STATUS }
