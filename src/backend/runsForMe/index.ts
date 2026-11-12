import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SendFrontendMessage } from 'backend/host/frontendMessage'
import {
  nextRunsForMeAfterSession,
  nextRunsForMeAfterUserToggle,
  runsForMeKey,
  type RunsForMeState
} from 'common/runsForMe'
import type { Runner } from 'common/types'
import type { Stores } from 'backend/services/types'

/** The store slice the runs-for-me map reads (66.1, R1). */
export interface RunsForMeDeps {
  stores: Pick<Stores, 'runsForMe'>
  sendFrontendMessage: SendFrontendMessage
}

const VALID_STATES: ReadonlySet<string> = Object.freeze(
  new Set(['auto', 'user-on', 'user-off'])
)

/**
 * The persisted map. Values outside the three-state set are dropped so a
 * hand-edited store cannot leak garbage to the UI (T-mkz-02).
 */
export function getRunsForMeMap(
  deps: RunsForMeDeps
): Record<string, RunsForMeState> {
  const raw = deps.stores.runsForMe.runsForMeStore.get('games', {}) as Record<
    string,
    unknown
  >
  const out: Record<string, RunsForMeState> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && VALID_STATES.has(value)) {
      out[key] = value as RunsForMeState
    }
  }
  return out
}

function writeAndPush(
  deps: RunsForMeDeps,
  key: string,
  state: RunsForMeState
): Record<string, RunsForMeState> {
  // Whole-record read/write: never `get('games.' + key)` (dots in appNames).
  const next = { ...getRunsForMeMap(deps), [key]: state }
  deps.stores.runsForMe.runsForMeStore.set('games', next)
  deps.sendFrontendMessage('runsForMeChanged', next)
  return next
}

/** U-1: explicit user toggle. Wins over auto until toggled again. */
export function setRunsForMeByUser(
  deps: RunsForMeDeps,
  appName: string,
  runner: Runner,
  on: boolean
): Record<string, RunsForMeState> {
  return writeAndPush(
    deps,
    runsForMeKey(appName, runner),
    nextRunsForMeAfterUserToggle(on)
  )
}

/**
 * U-2: record a finished play session. Auto-sets once the session lasted the
 * threshold; never overrides a user choice. macOS only. Never throws: a store
 * failure must not break a game-stop path (T-mkz-03).
 */
export function recordPlaySession(
  deps: RunsForMeDeps,
  appName: string,
  runner: Runner,
  elapsedMs: number,
  platform: string = process.platform
): void {
  if (platform !== 'darwin') return
  try {
    const key = runsForMeKey(appName, runner)
    const current = getRunsForMeMap(deps)[key]
    const next = nextRunsForMeAfterSession(current, elapsedMs)
    if (next === current || next === undefined) return
    writeAndPush(deps, key, next)
    logInfo(
      `Runs for me: auto-set for ${appName} (${runner}) after ${Math.round(
        elapsedMs / 1000
      )}s of play`,
      LogPrefix.Backend
    )
  } catch (error) {
    logWarning(
      `Runs for me: could not record play session for ${appName}: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}
