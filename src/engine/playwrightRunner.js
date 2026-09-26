const fs = require('fs')
const path = require('path')
const { launchSession, closeSession } = require('./irctc/sessionManager')
const { NewIRCTCAdapter } = require('./irctc/NewIRCTCAdapter')
const { LegacyIRCTCAdapter } = require('./irctc/LegacyIRCTCAdapter')
const { SURFACES, normalizeSurface, entryUrl } = require('./irctc/utils')
const { STATES } = require('./BookingStateMachine')
const RunStateStore = require('./RunStateStore')
const Telemetry = require('./Telemetry')

const ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'artifacts', 'jobs')

function stateIndex(state) {
  const index = STATES.indexOf(state)
  return index < 0 ? 0 : index
}

function shouldRun(current, target) {
  return stateIndex(current) <= stateIndex(target)
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, value, 'utf8')
  fs.renameSync(tmp, file)
}

function emitEvent(onEvent, event) {
  try {
    onEvent?.(event)
  } catch {}
}

function adapterFor(surface, args) {
  if (surface === SURFACES.NEW) return new NewIRCTCAdapter(args)
  if (surface === SURFACES.LEGACY) return new LegacyIRCTCAdapter(args)
  throw new Error('Unsupported IRCTC runtime surface: ' + surface)
}

function makeAdapterArgs(session, request, credentials, jobId, onEvent) {
  return {
    page: session.page,
    context: session.context,
    request,
    credentials,
    jobId,
    emit: onEvent,
  }
}

async function waitUntil(targetIso, onEvent) {
  if (!targetIso) return
  const target = new Date(targetIso).getTime()
  if (Number.isNaN(target) || target <= Date.now()) return

  const remaining = target - Date.now()
  emitEvent(onEvent, {
    type: 'LOG',
    message: '[SCHEDULE] Browser/session prepared. Waiting ' + remaining + 'ms for booking execution time.',
  })

  await new Promise(resolve => setTimeout(resolve, remaining))
}

function preparationWindowMs() {
  const value = Number(process.env.BOOKING_PREPARATION_WINDOW_MS)
  return Number.isFinite(value) && value > 0 ? value : 60000
}

function setState(jobId, state, phase, message, metadata = null) {
  return RunStateStore.save(jobId, {
    state,
    phase,
    message,
    metadata,
  })
}

async function runBooking(job, credentials, onEvent) {
  const request = job.request
  const startedAt = Date.now()
  const persistedBefore = RunStateStore.load(job.id)
  let currentState = persistedBefore?.state || 'BOOT'
  let recoveryMode = false

  if (!STATES.includes(currentState)) currentState = 'BOOT'

  if (
    persistedBefore &&
    (persistedBefore.state === 'SUBMIT' || persistedBefore.state === 'VERIFY_TRANSACTION') &&
    persistedBefore.phase === 'RUNNING'
  ) {
    currentState = 'VERIFY_TRANSACTION'
    recoveryMode = true
  } else if (
    persistedBefore &&
    stateIndex(currentState) >= stateIndex('SEARCH') &&
    stateIndex(currentState) < stateIndex('SUBMIT')
  ) {
    // Browser tabs/pages are not durable state. Rebuild the deterministic,
    // non-transactional path from journey preparation on process restart.
    currentState = 'PREPARE_JOURNEY'
    recoveryMode = true
  }

  const headless =
    process.env.PLAYWRIGHT_HEADED == null
      ? false
      : String(process.env.PLAYWRIGHT_HEADED).toLowerCase() !== 'true'
  let session = null
  let adapter = null
  let verification = null

  const step = async (state, nextState, message, action, metadata = null) => {
    if (!shouldRun(currentState, state)) return

    setState(job.id, state, 'RUNNING', message, metadata)
    emitEvent(onEvent, { type: 'STATE_CHANGED', state, message, metadata })
    const mark = Telemetry.mark(job.id, state + '_START', metadata)

    try {
      const result = await action()
      setState(job.id, nextState, 'IDLE', message, metadata)
      emitEvent(onEvent, { type: 'STATE_CHANGED', state: nextState, message, metadata })
      Telemetry.mark(job.id, nextState + '_READY', {
        previous: mark.name,
        ...(metadata || {}),
      })
      currentState = nextState
      return result
    } catch (error) {
      setState(job.id, state, 'FAILED', error.message, {
        ...(metadata || {}),
        recoveryMode,
      })
      throw error
    }
  }

  try {
    setState(job.id, currentState, 'RUNNING', recoveryMode ? 'Resuming persisted workflow.' : 'Starting Playwright booking workflow.', {
      recoveryMode,
    })

    await step(
      'LOAD_CONFIG',
      'RESTORE_SESSION',
      'Booking request validated.',
      async () => {
        const BookingRequest = require('../models/BookingRequest')
        const errors = BookingRequest.validate(request)
        if (errors.length) throw new Error(errors.join('; '))
        if (!request.source || !request.destination || !request.travelDate || !request.coach) {
          throw new Error('source, destination, travelDate and coach are required')
        }
      },
    )

    const requestedEntry = normalizeSurface(request.entrySurface)
    const entryOrder = requestedEntry === SURFACES.LEGACY
      ? [SURFACES.LEGACY]
      : requestedEntry === SURFACES.NEW
        ? [SURFACES.NEW]
        : [SURFACES.NEW, SURFACES.LEGACY]

    await step(
      'RESTORE_SESSION',
      'VALIDATE_SESSION',
      'Opening selected IRCTC entry surface.',
      async () => {
        let opened = false
        let lastError = null

        for (const surface of entryOrder) {
          const candidate = adapterFor(surface, {
            page: null,
            context: null,
            request,
            credentials,
            jobId: job.id,
            emit: onEvent,
          })

          if (!session) {
            session = await launchSession({
              request: {
                ...request,
                browser: request.browser || 'edge',
              },
              headless,
              onEvent,
            })
          }

          candidate.page = session.page
          candidate.context = session.context

          try {
            await candidate.openEntrySurface()
            adapter = candidate
            opened = true
            emitEvent(onEvent, {
              type: 'LOG',
              message: '[SURFACE] Entry surface opened: ' + surface + ' (' + entryUrl(surface) + ')',
            })
            break
          } catch (error) {
            lastError = error
            if (requestedEntry !== SURFACES.AUTO) throw error
            emitEvent(onEvent, {
              type: 'LOG',
              message: '[SURFACE] New entry failed; AUTO is falling back to Legacy IRCTC: ' + error.message,
            })
          }
        }

        if (!opened) throw lastError || new Error('No IRCTC entry surface could be opened.')
      },
    )

    const preSearch = await adapter.detectPreSearchSurface()
    if (preSearch !== SURFACES.UNKNOWN && preSearch !== adapter.constructor.name.replace('IRCTCAdapter', '').toUpperCase()) {
      adapter = adapterFor(preSearch, makeAdapterArgs(session, request, credentials, job.id, onEvent))
    } else {
      adapter = adapterFor(
        preSearch === SURFACES.UNKNOWN ? entryOrder[0] : preSearch,
        makeAdapterArgs(session, request, credentials, job.id, onEvent),
      )
    }

    setState(job.id, currentState, 'IDLE', 'Pre-search runtime surface resolved.', {
      entrySurface: requestedEntry,
      preSearchSurface: preSearch,
    })

    await step(
      'VALIDATE_SESSION',
      'PRELOAD_MASTER_DATA',
      'Verifying authenticated IRCTC session.',
      async () => {
        await adapter.ensureEnglish()
        await adapter.ensureAuthenticated()
      },
      { entrySurface: requestedEntry, preSearchSurface: preSearch },
    )

    await step(
      'PRELOAD_MASTER_DATA',
      'PREPARE_JOURNEY',
      'Preparing passenger repository and local configuration.',
      async () => {
        if (!Array.isArray(request.passengers) || request.passengers.length === 0) {
          throw new Error('At least one passenger is required.')
        }
      },
    )

    await step(
      'PREPARE_JOURNEY',
      'SEARCH',
      'Filling route, date, class and quota inputs.',
      async () => {
        await adapter.prepareJourney()
      },
    )

    if (request.executionMode === 'SCHEDULED') {
      await waitUntil(request.scheduledAt, onEvent)
    }

    await step(
      'SEARCH',
      'FILTER',
      'Searching trains.',
      async () => {
        await adapter.searchJourney()
      },
    )

    let runtimeSurface = await adapter.detectRuntimeSurface()
    adapter = adapterFor(runtimeSurface, makeAdapterArgs(session, request, credentials, job.id, onEvent))

    setState(job.id, currentState, 'IDLE', 'Runtime surface detected after search.', {
      runtimeSurface,
      entrySurface: requestedEntry,
    })

    await step(
      'FILTER',
      'SELECT_TRAIN',
      'Enumerating deterministic train candidates.',
      async () => {
        const candidates = await adapter.listCandidates()
        if (!candidates.length) throw new Error('No train candidates were found.')
        emitEvent(onEvent, {
          type: 'LOG',
          message: '[FILTER] Found ' + candidates.length + ' train candidate(s) on ' + runtimeSurface + ' runtime surface.',
        })
      },
      { runtimeSurface },
    )

    let selected = await step(
      'SELECT_TRAIN',
      'VERIFY_AVAILABILITY',
      'Selecting the first candidate that satisfies train/class/quota/availability requirements.',
      async () => adapter.selectTrain(),
      { runtimeSurface },
    )

    selected = selected || adapter.selected

    await step(
      'VERIFY_AVAILABILITY',
      'LOAD_PASSENGERS',
      'Rechecking selected train/class availability and opening passenger flow.',
      async () => adapter.verifyAvailability(),
      {
        runtimeSurface,
        actualSelectedTrainNumber: selected?.trainNumber || null,
      },
    )

    await step(
      'LOAD_PASSENGERS',
      'FILL_PASSENGERS',
      'Loading Master Passenger data and passenger fields.',
      async () => adapter.selectPassengers(),
    )

    await step(
      'FILL_PASSENGERS',
      'VALIDATE_BOOKING',
      'Passenger information populated and verified.',
      async () => adapter.selectPassengers(),
    )

    await step(
      'VALIDATE_BOOKING',
      'SUBMIT',
      'Running strict pre-submission validation.',
      async () => adapter.validateReview(),
    )

    if (currentState === 'SUBMIT') {
      await step(
        'SUBMIT',
        'VERIFY_TRANSACTION',
        'Submitting exactly once at the transactional boundary.',
        async () => adapter.submitTransaction(),
      )
    }

    if (currentState === 'VERIFY_TRANSACTION') {
      if (recoveryMode && persistedBefore?.state === 'VERIFY_TRANSACTION') {
        const reconciliation = await adapter.reconcileTransaction?.() || { status: 'UNKNOWN' }
        if (reconciliation.status === 'SUCCESS') {
          emitEvent(onEvent, {
            type: 'LOG',
            message: '[RECONCILE] Existing booking result found; no transaction was resubmitted.',
            metadata: reconciliation,
          })
        } else if (reconciliation.status === 'FAILED') {
          throw new Error('Transaction reconciliation found a failed booking.')
        } else {
          throw new Error('Transaction outcome is unknown after recovery; no duplicate submission was attempted.')
        }
      } else {
        await adapter.verifyTransaction()
      }

      setState(job.id, 'VERIFY_BOOKING', 'IDLE', 'Transaction outcome reconciled.', {
        runtimeSurface: adapter.runtimeSurface,
      })
      currentState = 'VERIFY_BOOKING'
      emitEvent(onEvent, {
        type: 'STATE_CHANGED',
        state: 'VERIFY_BOOKING',
        message: 'Transaction outcome reconciled.',
      })
    }

    if (shouldRun(currentState, 'VERIFY_BOOKING')) {
      setState(job.id, 'VERIFY_BOOKING', 'RUNNING', 'Verifying authoritative booking result.')
      verification = await adapter.extractAndVerifyBooking()

      if (!verification?.pnr) {
        throw new Error('Booking cannot be marked successful without an authoritative PNR.')
      }

      setState(job.id, 'SUCCESS', 'IDLE', 'Booking result verified.', verification)
      currentState = 'SUCCESS'
      emitEvent(onEvent, {
        type: 'STATE_CHANGED',
        state: 'SUCCESS',
        message: 'Booking result verified.',
        metadata: verification,
        pnr: verification.pnr,
      })
    }

    const telemetry = Telemetry.snapshot(job.id)
    const result = {
      jobId: job.id,
      success: currentState === 'SUCCESS' && Boolean(verification?.pnr),
      exitCode: 0,
      pnr: verification?.pnr || null,
      state: currentState,
      entrySurface: requestedEntry,
      runtimeSurface: adapter.runtimeSurface,
      selectedTrain: verification?.selectedTrain || adapter.selected?.trainNumber || null,
      selectedTrainName: verification?.selectedTrainName || adapter.selected?.trainName || null,
      selectedClass: verification?.coach || adapter.selected?.class || request.coach,
      selectedQuota: verification?.quota || adapter.selected?.quota || request.quota || 'GENERAL',
      selectedAvailability: verification?.availability || adapter.selected?.availability || null,
      elapsedMs: Date.now() - startedAt,
      telemetry,
      error: null,
    }

    writeResult(job.id, result)
    return result
  } catch (error) {
    const finalState = RunStateStore.load(job.id)?.state || currentState
    setState(job.id, finalState, 'FAILED', error.message, {
      recoveryMode,
      entrySurface: normalizeSurface(request.entrySurface),
      runtimeSurface: adapter?.runtimeSurface || SURFACES.UNKNOWN,
      elapsedMs: Date.now() - startedAt,
    })

    const failureDir = path.join(ARTIFACTS_DIR, job.id)
    fs.mkdirSync(failureDir, { recursive: true })

    try {
      if (session?.page) await session.page.screenshot({ path: path.join(failureDir, 'failure.png'), fullPage: true })
    } catch {}

    const result = {
      jobId: job.id,
      success: false,
      exitCode: -1,
      pnr: null,
      state: finalState,
      entrySurface: normalizeSurface(request.entrySurface),
      runtimeSurface: adapter?.runtimeSurface || SURFACES.UNKNOWN,
      elapsedMs: Date.now() - startedAt,
      telemetry: Telemetry.snapshot(job.id),
      error: error.message,
    }
    writeResult(job.id, result)
    return result
  } finally {
    if (session) {
      try {
        const trace = Boolean(request.debugMode)
        if (trace) {
          const tracePath = path.join(ARTIFACTS_DIR, job.id, 'playwright-trace.zip')
          fs.mkdirSync(path.dirname(tracePath), { recursive: true })
          await session.context.tracing.stop({ path: tracePath }).catch(() => {})
        }
      } finally {
        await closeSession(session)
      }
    }
  }
}

function writeResult(jobId, result) {
  const file = path.join(ARTIFACTS_DIR, jobId, 'result.json')
  atomicWrite(file, JSON.stringify(result, null, 2))
}

async function runMock(job, onEvent) {
  const states = [
    ['LOAD_CONFIG', 'Mock: configuration validated.'],
    ['SEARCH', 'Mock: searching trains.'],
    ['SELECT_TRAIN', 'Mock: train selected.'],
    ['VERIFY_AVAILABILITY', 'Mock: availability verified.'],
    ['FILL_PASSENGERS', 'Mock: passenger data verified.'],
    ['VERIFY_BOOKING', 'Mock: booking result verified.'],
    ['SUCCESS', 'Mock: booking confirmed.'],
  ]

  for (const [state, message] of states) {
    emitEvent(onEvent, { type: 'STATE_CHANGED', state, message })
  }

  return {
    success: true,
    pnr: '0000000000',
    state: 'SUCCESS',
    selectedTrain: '00000',
    selectedClass: job.request.coach,
    selectedQuota: job.request.quota || 'GENERAL',
    error: null,
  }
}

module.exports = {
  runBooking,
  runMock,
  writeResult,
  preparationWindowMs,
}
