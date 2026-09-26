const fs = require('fs')
const path = require('path')
const { launchSession, closeSession } = require('./irctc/sessionManager')
const { NewIRCTCAdapter } = require('./irctc/NewIRCTCAdapter')
const { LegacyIRCTCAdapter } = require('./irctc/LegacyIRCTCAdapter')
const { SURFACES, normalizeSurface, entryUrl, parseTravelDate } = require('./irctc/utils')
const RunStateStore = require('./RunStateStore')
const Telemetry = require('./Telemetry')
const BookingRequest = require('../models/BookingRequest')

const ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'artifacts', 'jobs')

function stateIndex(state) {
  const states = require('./BookingStateMachine').STATES
  const index = states.indexOf(state)
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

function writeResult(jobId, result) {
  atomicWrite(
    path.join(ARTIFACTS_DIR, jobId, 'result.json'),
    JSON.stringify(result, null, 2),
  )
}

function emit(onEvent, event) {
  try { onEvent?.(event) } catch {}
}

function adapterFor(surface, args) {
  if (surface === SURFACES.NEW) return new NewIRCTCAdapter(args)
  if (surface === SURFACES.LEGACY) return new LegacyIRCTCAdapter(args)
  throw new Error('Unsupported IRCTC runtime surface: ' + surface)
}

function argsFor(session, request, credentials, jobId, onEvent) {
  return {
    page: session.page,
    context: session.context,
    request,
    credentials,
    jobId,
    emit: onEvent,
  }
}

function headless() {
  if (process.env.PLAYWRIGHT_HEADED == null) return false
  return String(process.env.PLAYWRIGHT_HEADED).toLowerCase() !== 'true'
}

async function waitUntil(targetIso, onEvent) {
  if (!targetIso) return
  const target = new Date(targetIso).getTime()
  if (Number.isNaN(target) || target <= Date.now()) return

  const remaining = target - Date.now()
  emit(onEvent, {
    type: 'LOG',
    message: '[SCHEDULE] Preparation complete; waiting for booking time.',
    metadata: { remainingMs: remaining },
  })
  await new Promise(resolve => setTimeout(resolve, remaining))
}

function preparationWindowMs() {
  const configured = Number(process.env.BOOKING_PREPARATION_WINDOW_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : 60000
}

async function runBooking(job, credentials, onEvent) {
  const request = job.request
  const startedAt = Date.now()

  const requestErrors = BookingRequest.validate(request)
  if (requestErrors.length) {
    return finalizeFailure(job.id, 'LOAD_CONFIG', requestErrors.join('; '), startedAt, onEvent)
  }

  const persisted = RunStateStore.load(job.id)
  let currentState = persisted?.state || 'BOOT'
  let recoveryMode = false

  if (persisted?.state === 'SUCCESS') {
    const result = persisted.metadata?.result
    return {
      jobId: job.id,
      success: Boolean(result?.pnr),
      exitCode: 0,
      pnr: result?.pnr || null,
      state: 'SUCCESS',
      entrySurface: normalizeSurface(request.entrySurface),
      runtimeSurface: persisted.metadata?.runtimeSurface || SURFACES.UNKNOWN,
      selectedTrain: result?.selectedTrain || null,
      selectedTrainName: result?.selectedTrainName || null,
      selectedClass: result?.coach || request.coach,
      selectedQuota: result?.quota || request.quota || 'GENERAL',
      selectedAvailability: result?.availability || null,
      elapsedMs: Date.now() - startedAt,
      telemetry: Telemetry.snapshot(job.id),
      error: null,
    }
  }

  if (
    persisted &&
    (persisted.state === 'SUBMIT' || persisted.state === 'VERIFY_TRANSACTION') &&
    persisted.phase === 'RUNNING'
  ) {
    currentState = 'VERIFY_TRANSACTION'
    recoveryMode = true
  } else if (
    persisted &&
    stateIndex(persisted.state) >= stateIndex('SEARCH') &&
    stateIndex(persisted.state) < stateIndex('SUBMIT')
  ) {
    // DOM objects are not durable. Rebuild the safe journey/search path.
    currentState = 'PREPARE_JOURNEY'
    recoveryMode = true
  }

  let session = null
  let adapter = null
  let verification = null
  let masterPassengerCache = null

  const save = (state, phase, message, metadata = null) => {
    return RunStateStore.save(job.id, {
      state,
      phase,
      message,
      metadata: {
        ...(metadata || {}),
        recoveryMode,
        runtimeSurface: adapter?.runtimeSurface || SURFACES.UNKNOWN,
      },
    })
  }

  const step = async (state, nextState, message, action, metadata = null) => {
    if (!shouldRun(currentState, state)) return undefined

    save(state, 'RUNNING', message, metadata)
    emit(onEvent, { type: 'STATE_CHANGED', state, message, metadata })
    Telemetry.mark(job.id, state + '_START', metadata)

    try {
      const value = await action()
      save(nextState, 'IDLE', message, metadata)
      emit(onEvent, { type: 'STATE_CHANGED', state: nextState, message, metadata })
      Telemetry.mark(job.id, nextState + '_READY', metadata)
      currentState = nextState
      return value
    } catch (error) {
      save(state, 'FAILED', error.message, metadata)
      throw error
    }
  }

  try {
    save(currentState, 'RUNNING', recoveryMode ? 'Resuming persisted booking workflow.' : 'Starting Playwright booking workflow.')

    if (recoveryMode && currentState === 'VERIFY_TRANSACTION') {
      session = await launchSession({
        request: { ...request, browser: request.browser || 'edge' },
        headless: headless(),
        onEvent,
      })

      const persistedRuntime = persisted?.metadata?.runtimeSurface
      const recoverySurface =
        persistedRuntime === SURFACES.LEGACY
          ? SURFACES.LEGACY
          : persistedRuntime === SURFACES.NEW
            ? SURFACES.NEW
            : normalizeSurface(request.entrySurface) === SURFACES.LEGACY
              ? SURFACES.LEGACY
              : SURFACES.NEW

      adapter = adapterFor(
        recoverySurface,
        argsFor(session, request, credentials, job.id, onEvent),
      )

      const currentUrl = session.page.url()
      const onKnownBookingPage = /train-list|booking|payment|gateway|transaction/i.test(currentUrl)

      if (!onKnownBookingPage) {
        await adapter.openEntrySurface()
      }

      await adapter.ensureEnglish()
      await adapter.ensureAuthenticated()

      const reconciliation = await adapter.reconcileTransaction()
      if (reconciliation.status === 'FAILED') {
        throw new Error('Transaction reconciliation found a failed booking.')
      }
      if (reconciliation.status !== 'SUCCESS') {
        throw new Error('Transaction outcome is unknown after recovery; no duplicate submission was attempted.')
      }

      verification = await adapter.extractAndVerifyBooking()
      if (!verification?.pnr) {
        throw new Error('Transaction reconciliation found a success-looking state without an authoritative PNR.')
      }

      save('SUCCESS', 'IDLE', 'Recovered and verified authoritative booking result.', verification)
      currentState = 'SUCCESS'
      emit(onEvent, {
        type: 'STATE_CHANGED',
        state: 'SUCCESS',
        message: 'Recovered and verified authoritative booking result.',
        metadata: verification,
        pnr: verification.pnr,
      })

      const result = {
        jobId: job.id,
        success: true,
        exitCode: 0,
        pnr: verification.pnr,
        state: 'SUCCESS',
        entrySurface: normalizeSurface(request.entrySurface),
        runtimeSurface: adapter.runtimeSurface,
        selectedTrain: verification.selectedTrain,
        selectedTrainName: verification.selectedTrainName,
        selectedClass: verification.coach,
        selectedQuota: verification.quota,
        selectedAvailability: verification.availability,
        elapsedMs: Date.now() - startedAt,
        telemetry: Telemetry.snapshot(job.id),
        error: null,
      }

      RunStateStore.save(job.id, {
        metadata: {
          result: verification,
          runtimeSurface: adapter.runtimeSurface,
          entrySurface: normalizeSurface(request.entrySurface),
        },
      })
      writeResult(job.id, result)
      return result
    }

    await step(
      'LOAD_CONFIG',
      'RESTORE_SESSION',
      'Validating booking request.',
      async () => {
        parseTravelDate(request.travelDate)
        if (!Array.isArray(request.passengers) || request.passengers.length === 0) {
          throw new Error('At least one passenger is required.')
        }
      },
    )

    const requestedEntry = normalizeSurface(request.entrySurface)
    const requestedOrder =
      requestedEntry === SURFACES.LEGACY
        ? [SURFACES.LEGACY]
        : requestedEntry === SURFACES.NEW
          ? [SURFACES.NEW]
          : [SURFACES.NEW, SURFACES.LEGACY]

    await step(
      'RESTORE_SESSION',
      'VALIDATE_SESSION',
      'Opening selected IRCTC entry surface and restoring persistent browser session.',
      async () => {
        session = await launchSession({
          request: { ...request, browser: request.browser || 'edge' },
          headless: headless(),
          onEvent,
        })

        let lastError = null

        for (const entrySurface of requestedOrder) {
          const candidate = adapterFor(
            entrySurface,
            argsFor(session, request, credentials, job.id, onEvent),
          )

          try {
            await candidate.openEntrySurface()
            const visibleSurface = await candidate.detectPreSearchSurface()
            if (visibleSurface === SURFACES.UNKNOWN) {
              throw new Error('Entry page opened but the journey form surface could not be detected.')
            }

            adapter = visibleSurface === SURFACES.NEW || visibleSurface === SURFACES.LEGACY
              ? adapterFor(visibleSurface, argsFor(session, request, credentials, job.id, onEvent))
              : candidate

            emit(onEvent, {
              type: 'LOG',
              message: '[SURFACE] Entry=' + requestedEntry +
                ' opened via ' + entrySurface +
                ' at ' + entryUrl(entrySurface) +
                '; pre-search runtime=' + visibleSurface,
            })
            return
          } catch (error) {
            lastError = error
            if (requestedEntry !== SURFACES.AUTO) throw error
          }
        }

        throw lastError || new Error('No IRCTC entry surface could be opened.')
      },
    )

    await step(
      'VALIDATE_SESSION',
      'PRELOAD_MASTER_DATA',
      'Verifying authenticated session.',
      async () => {
        await adapter.ensureEnglish()
        await adapter.ensureAuthenticated()
      },
    )

    await step(
      'PRELOAD_MASTER_DATA',
      'PREPARE_JOURNEY',
      'Preparing passenger source configuration.',
      async () => {
        await adapter.preloadMasterData()
        masterPassengerCache = Array.isArray(adapter.masterPassengerCache)
          ? adapter.masterPassengerCache.slice()
          : []
      },
    )

    await step(
      'PREPARE_JOURNEY',
      'SEARCH',
      'Preparing route, requested date, class and quota.',
      async () => adapter.prepareJourney(),
    )

    if (request.executionMode === 'SCHEDULED') {
      await waitUntil(request.scheduledAt, onEvent)
    }

    await step(
      'SEARCH',
      'FILTER',
      'Searching trains.',
      async () => adapter.searchJourney(),
    )

    const runtimeSurface = adapter.runtimeSurface
    adapter = adapterFor(
      runtimeSurface,
      argsFor(session, request, credentials, job.id, onEvent),
    )
    adapter.masterPassengerCache = masterPassengerCache || []
    adapter.masterPassengerLoaded = Boolean(request.useMasterPassenger)

    save(currentState, 'IDLE', 'Runtime surface resolved.', {
      entrySurface: requestedEntry,
      runtimeSurface,
    })

    await step(
      'FILTER',
      'SELECT_TRAIN',
      'Enumerating deterministic train candidates.',
      async () => {
        const candidates = await adapter.listCandidates()
        if (!candidates.length) throw new Error('No train candidates were found.')
        emit(onEvent, {
          type: 'LOG',
          message: '[FILTER] ' + candidates.length + ' train candidate(s) found on ' + runtimeSurface + ' runtime surface.',
        })
      },
      { runtimeSurface },
    )

    let selected = await step(
      'SELECT_TRAIN',
      'VERIFY_AVAILABILITY',
      'Selecting train by configured policy and class-specific availability.',
      async () => adapter.selectTrain(),
      { runtimeSurface },
    )

    selected = selected || adapter.selected

    await step(
      'VERIFY_AVAILABILITY',
      'LOAD_PASSENGERS',
      'Rechecking the selected train/class and entering the passenger flow.',
      async () => adapter.verifyAvailability(),
      {
        runtimeSurface,
        actualSelectedTrainNumber: selected?.trainNumber || null,
      },
    )

    await step(
      'LOAD_PASSENGERS',
      'FILL_PASSENGERS',
      'Preparing passenger entry.',
      async () => true,
    )

    await step(
      'FILL_PASSENGERS',
      'VALIDATE_BOOKING',
      'Selecting Master Passenger data and filling scoped passenger fields.',
      async () => adapter.selectPassengers(),
      {
        passengerCount: request.passengers.length,
      },
    )

    await step(
      'VALIDATE_BOOKING',
      'SUBMIT',
      'Running strict pre-submission verification.',
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
      if (recoveryMode) {
        const reconciliation = await adapter.reconcileTransaction()
        if (reconciliation.status === 'SUCCESS') {
          verification = await adapter.extractAndVerifyBooking()
          if (!verification?.pnr) throw new Error('Transaction reconciliation found success without a verified PNR.')
        } else if (reconciliation.status === 'FAILED') {
          throw new Error('Transaction reconciliation found a failed booking.')
        } else {
          throw new Error('Transaction outcome is unknown after recovery; no duplicate submission was attempted.')
        }
      } else {
        await adapter.verifyTransaction()
      }
    }

    if (!verification && shouldRun(currentState, 'VERIFY_BOOKING')) {
      save('VERIFY_BOOKING', 'RUNNING', 'Verifying authoritative booking result.')
      verification = await adapter.extractAndVerifyBooking()
    }

    if (!verification?.pnr) {
      throw new Error('Booking cannot be marked successful without an authoritative PNR.')
    }

    save('SUCCESS', 'IDLE', 'Booking result verified.', verification)
    currentState = 'SUCCESS'
    emit(onEvent, {
      type: 'STATE_CHANGED',
      state: 'SUCCESS',
      message: 'Booking result verified.',
      metadata: verification,
      pnr: verification.pnr,
    })

    const result = {
      jobId: job.id,
      success: true,
      exitCode: 0,
      pnr: verification.pnr,
      state: 'SUCCESS',
      entrySurface: requestedEntry,
      runtimeSurface,
      selectedTrain: verification.selectedTrain,
      selectedTrainName: verification.selectedTrainName,
      selectedClass: verification.coach,
      selectedQuota: verification.quota,
      selectedAvailability: verification.availability,
      elapsedMs: Date.now() - startedAt,
      telemetry: Telemetry.snapshot(job.id),
      error: null,
    }

    // Preserve the authoritative result for recovery/reconciliation.
    RunStateStore.save(job.id, {
      metadata: {
        result: verification,
        runtimeSurface,
        entrySurface: requestedEntry,
      },
    })

    writeResult(job.id, result)
    return result
  } catch (error) {
    return finalizeFailure(
      job.id,
      RunStateStore.load(job.id)?.state || currentState,
      error.message,
      startedAt,
      onEvent,
      {
        entrySurface: normalizeSurface(request.entrySurface),
        runtimeSurface: adapter?.runtimeSurface || SURFACES.UNKNOWN,
        recoveryMode,
      },
      session,
    )
  } finally {
    if (session) {
      if (request.debugMode && request.paymentPreference?.method !== 'EWALLET') {
        const tracePath = path.join(ARTIFACTS_DIR, job.id, 'playwright-trace.zip')
        fs.mkdirSync(path.dirname(tracePath), { recursive: true })
        await session.context.tracing.stop({ path: tracePath }).catch(() => {})
      }
      await closeSession(session)
    }
  }
}

async function finalizeFailure(jobId, state, error, startedAt, onEvent, metadata = {}, session = null) {
  RunStateStore.save(jobId, {
    state,
    phase: 'FAILED',
    message: error,
    metadata: { ...metadata, runtimeSurface: metadata.runtimeSurface || SURFACES.UNKNOWN },
  })

  const dir = path.join(ARTIFACTS_DIR, jobId)
  fs.mkdirSync(dir, { recursive: true })

  if (session?.page) {
    // Never persist secrets in failure screenshots. Clear visible password inputs
    // before capturing the page; the browser session is discarded immediately after.
    await session.page.locator('input[type="password"]:visible').evaluateAll(inputs => {
      for (const input of inputs) input.value = ''
    }).catch(() => {})

    await session.page.screenshot({
      path: path.join(dir, 'failure.png'),
      fullPage: true,
    }).catch(() => {})
  }

  const result = {
    jobId,
    success: false,
    exitCode: -1,
    pnr: null,
    state,
    entrySurface: metadata.entrySurface || SURFACES.UNKNOWN,
    runtimeSurface: metadata.runtimeSurface || SURFACES.UNKNOWN,
    elapsedMs: Date.now() - startedAt,
    telemetry: Telemetry.snapshot(jobId),
    error,
  }

  writeResult(jobId, result)
  emit(onEvent, { type: 'LOG', state, message: '[FAILED] ' + error })
  return result
}

async function runMock(job, onEvent) {
  const verification = {
    pnr: '0000000000',
    selectedTrain: '00000',
    selectedTrainName: 'MOCK',
    coach: job.request.coach,
    quota: job.request.quota || 'GENERAL',
    availability: { status: 'AVAILABLE', raw: 'MOCK AVAILABLE' },
    verifiedAt: new Date().toISOString(),
  }

  emit(onEvent, { type: 'STATE_CHANGED', state: 'SUCCESS', message: 'Mock booking result verified.', pnr: verification.pnr })
  return {
    success: true,
    pnr: verification.pnr,
    state: 'SUCCESS',
    selectedTrain: verification.selectedTrain,
    selectedClass: verification.coach,
    selectedQuota: verification.quota,
    error: null,
  }
}

module.exports = {
  runBooking,
  runMock,
  writeResult,
  preparationWindowMs,
}
