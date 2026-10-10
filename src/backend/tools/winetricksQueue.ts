import {
  Runner,
  WinetricksApplyResult,
  WinetricksEnvironmentReport,
  WinetricksQueueRun,
  WinetricksQueueState,
  WinetricksVerbOutcome
} from 'common/types'
import { sendFrontendMessage } from '../ipc'
import { sendGameStatusUpdate } from '../utils'
import { logError, LogPrefix } from 'backend/logger'
import { Winetricks, getInstallingComponent } from './index'

// Phase 45 Plan 01 (D-11/D-12/D-13): the backend-resident sequential-install
// queue. Mirrors `installFixes()`'s `for...of` + `await Winetricks.install`
// loop in launcher.ts -- never a multi-verb batch, never parallel, never a
// `break` on a single verb's failure (D-12). `installFixes` itself is left
// untouched; it keeps calling `Winetricks.install` directly, not through this
// module.
//
// Tracer scope (Task 1): one run at a time, process-wide (`currentRun`), a
// deliberately minimal payload guard, and a hardcoded empty environment
// report. Task 2 replaces the guard with `assertWinetricksApplyPayload` and
// the environment report with the real store -- this module's shape (one
// `currentRun`, `apply`/`getState`/`cancelRemaining`) does not change.
let currentRun: WinetricksQueueRun | null = null
let nextRunId = 1

function emptyEnvironmentReport(): WinetricksEnvironmentReport {
  return { unsupportedWineVersion: null, missingDependencies: [] }
}

function pushState(run: WinetricksQueueRun): void {
  sendFrontendMessage(
    'winetricksQueueChanged',
    getState(run.runner, run.appName)
  )
}

function isBusy(): boolean {
  return currentRun?.status === 'running' || getInstallingComponent() !== ''
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
    environment: emptyEnvironmentReport()
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

      const outcome = await Winetricks.install(run.runner, run.appName, verb)
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

function apply(
  runner: Runner,
  appName: string,
  verbs: string[]
): WinetricksApplyResult {
  if (isBusy()) {
    return {
      accepted: false,
      reason: 'busy',
      detail: 'A winetricks install is already running.'
    }
  }

  // Tracer-scope guard: Task 2 replaces this with `assertWinetricksApplyPayload`
  // (max length, verb-shape regex, catalog membership, dedupe).
  if (!Array.isArray(verbs) || verbs.length === 0) {
    return {
      accepted: false,
      reason: 'invalid',
      detail: 'verbs must be a non-empty array of strings.'
    }
  }
  if (!verbs.every((verb) => typeof verb === 'string')) {
    return {
      accepted: false,
      reason: 'invalid',
      detail: 'verbs must be an array of strings.'
    }
  }

  const outcomes: Record<string, WinetricksVerbOutcome> = {}
  for (const verb of verbs) {
    outcomes[verb] = 'pending'
  }

  const run: WinetricksQueueRun = {
    runId: nextRunId++,
    runner,
    appName,
    verbs: [...verbs],
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
    logError(['winetricksQueue run loop failed:', error], LogPrefix.WineTricks)
  })

  return { accepted: true, state }
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
