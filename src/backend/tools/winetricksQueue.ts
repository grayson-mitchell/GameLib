import {
  Runner,
  WinetricksApplyResult,
  WinetricksQueueRun,
  WinetricksQueueState,
  WinetricksVerbOutcome
} from 'common/types'
import { sendFrontendMessage } from '../ipc'
import { sendGameStatusUpdate } from '../utils'
import { logError, LogPrefix } from 'backend/logger'
import { Winetricks, getInstallingComponent } from './index'
import {
  WinetricksApplyRejected,
  assertWinetricksApplyPayload
} from './winetricksApplyGuard'
import {
  getEnvironmentReport,
  onEnvironmentChanged
} from './winetricksEnvironment'
import { appendLogLine } from './winetricksOutputClassifier'

// Phase 45 Plan 01 (D-11/D-12/D-13): the backend-resident sequential-install
// queue. Mirrors `installFixes()`'s `for...of` + `await Winetricks.install`
// loop in launcher.ts -- never a multi-verb batch, never parallel, never a
// `break` on a single verb's failure (D-12). `installFixes` itself is left
// untouched; it keeps calling `Winetricks.install` directly, not through this
// module.
//
// One run at a time, process-wide (`currentRun`). `applyInFlight` closes the
// race Task 2 introduced: validating against `Winetricks.catalogFor` needs
// an `await`, so two `apply()` calls issued in the same tick would otherwise
// both pass the (now asynchronous) busy check before either sets `currentRun`.
// It is set synchronously as `apply`'s first statement -- before that
// `await` -- and cleared in `finally`; `isBusy()` folds it in so `busy` in
// pushed state reflects it too.
let currentRun: WinetricksQueueRun | null = null
let nextRunId = 1
let applyInFlight = false

// D-16: a single listener, registered once at module load, mirrors an
// environment-report change into a `winetricksQueueChanged` push for that
// game even when there is no run (`pushState` below requires one).
onEnvironmentChanged((runner, appName) => {
  sendFrontendMessage('winetricksQueueChanged', getState(runner, appName))
})

function pushState(run: WinetricksQueueRun): void {
  sendFrontendMessage(
    'winetricksQueueChanged',
    getState(run.runner, run.appName)
  )
}

function isBusy(): boolean {
  return (
    applyInFlight ||
    currentRun?.status === 'running' ||
    getInstallingComponent() !== ''
  )
}

function getState(runner: Runner, appName: string): WinetricksQueueState {
  const run =
    currentRun && currentRun.runner === runner && currentRun.appName === appName
      ? currentRun
      : null
  return {
    runner,
    appName,
    // Copy, not the live object -- callers (IPC handlers, pushes) must never
    // be able to mutate queue-owned state through the value they were handed.
    run: run
      ? {
          ...run,
          verbs: [...run.verbs],
          outcomes: { ...run.outcomes },
          log: [...run.log]
        }
      : null,
    busy: isBusy(),
    environment: getEnvironmentReport(runner, appName)
  }
}

async function runLoop(run: WinetricksQueueRun): Promise<void> {
  try {
    for (const verb of run.verbs) {
      if (run.cancelRequested) {
        run.outcomes[verb] = 'cancelled'
        pushState(run)
        continue
      }
      run.outcomes[verb] = 'installing'
      run.currentVerb = verb
      pushState(run)

      // D-18 / E9: the run keeps the classified lines of the verbs it runs
      // (progress lines replace each other, capped), so a remounted tab can
      // rebuild its log from `getState`. No queue state is pushed per line --
      // the renderer already receives them live via `progressOfWinetricks`.
      const outcome = await Winetricks.install(
        run.runner,
        run.appName,
        verb,
        (line) => appendLogLine(run.log, line)
      )
      run.outcomes[verb] = outcome === 'installed' ? 'installed' : 'failed'
      run.currentVerb = ''
      pushState(run)
    }
  } finally {
    run.status = 'done'
    run.currentVerb = ''
    pushState(run)
    sendGameStatusUpdate({
      appName: run.appName,
      runner: run.runner,
      status: 'done'
    })
  }
}

async function apply(
  runner: Runner,
  appName: string,
  verbs: unknown
): Promise<WinetricksApplyResult> {
  if (isBusy()) {
    return {
      accepted: false,
      reason: 'busy',
      detail: 'A winetricks install is already running.'
    }
  }

  // Set synchronously, before the catalog `await` below -- this is the
  // whole fix for the same-tick race: a second `apply()` call starting
  // before this one resumes sees `applyInFlight` (via `isBusy()`) already
  // true.
  applyInFlight = true
  try {
    const catalog = await Winetricks.catalogFor(runner, appName)

    let verbList: string[]
    try {
      verbList = assertWinetricksApplyPayload(verbs, catalog)
    } catch (error) {
      if (error instanceof WinetricksApplyRejected) {
        return { accepted: false, reason: 'invalid', detail: error.message }
      }
      throw error
    }

    const outcomes: Record<string, WinetricksVerbOutcome> = {}
    for (const verb of verbList) {
      outcomes[verb] = 'pending'
    }

    const run: WinetricksQueueRun = {
      runId: nextRunId++,
      runner,
      appName,
      verbs: verbList,
      outcomes,
      currentVerb: '',
      status: 'running',
      cancelRequested: false,
      log: []
    }
    currentRun = run

    const state = getState(runner, appName)
    sendGameStatusUpdate({ appName, runner, status: 'winetricks' })
    pushState(run)

    // Not awaited: `apply` acks immediately (invoke-kind, D-13 repudiation
    // mitigation) and the install loop continues detached. A bare `void` on a
    // rejecting promise handles NOTHING (project lesson) -- `.catch` is
    // required.
    void runLoop(run).catch((error) => {
      logError(
        ['winetricksQueue run loop failed:', error],
        LogPrefix.WineTricks
      )
    })

    return { accepted: true, state }
  } finally {
    applyInFlight = false
  }
}

function cancelRemaining(
  runner: Runner,
  appName: string
): WinetricksQueueState {
  if (
    currentRun &&
    currentRun.runner === runner &&
    currentRun.appName === appName &&
    currentRun.status === 'running'
  ) {
    currentRun.cancelRequested = true
    for (const verb of currentRun.verbs) {
      if (currentRun.outcomes[verb] === 'pending') {
        currentRun.outcomes[verb] = 'cancelled'
      }
    }
    pushState(currentRun)
  }
  return getState(runner, appName)
}

export const WinetricksQueue = {
  apply,
  getState,
  cancelRemaining
}
