/**
 * Per-game "Runs for me" override (quick 261029-mkz).
 *
 * CrossOver ratings are crowd evidence about other people's Macs. Once a game
 * is shown to run on this Mac, the user (or GameLib, after a long enough
 * session) can say so, and the library stops calling it "Won't run".
 *
 * Persistence is tri-state; an absent key means "unset". Effective "on" is
 * 'auto' or 'user-on'.
 *
 * U-2: auto-set NEVER overrides an explicit user choice. A user 'off' wins
 * over any number of long sessions until the user switches it on again.
 */
import type { Runner } from 'common/types'

export type RunsForMeState = 'auto' | 'user-on' | 'user-off'

/** A game that stayed running this long (ms) is marked runs-for-me. */
export const RUNS_FOR_ME_AUTO_THRESHOLD_MS = 60_000

/** Same shape as `gameKey()` in the Library filter engine. */
export function runsForMeKey(appName: string, runner: Runner): string {
  return `${appName}_${runner}`
}

export function isRunsForMeOn(state: RunsForMeState | undefined): boolean {
  return state === 'auto' || state === 'user-on'
}

/**
 * State after a game session of `elapsedMs`. Only an unset game can become
 * 'auto'; 'user-off' (and 'user-on') are never overwritten.
 */
export function nextRunsForMeAfterSession(
  current: RunsForMeState | undefined,
  elapsedMs: number
): RunsForMeState | undefined {
  if (current === undefined && elapsedMs >= RUNS_FOR_ME_AUTO_THRESHOLD_MS) {
    return 'auto'
  }
  return current
}

export function nextRunsForMeAfterUserToggle(on: boolean): RunsForMeState {
  return on ? 'user-on' : 'user-off'
}
