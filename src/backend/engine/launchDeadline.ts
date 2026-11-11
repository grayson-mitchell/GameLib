/**
 * Phase 59 (D-10/D-11): per-key launch deadline.
 *
 * Armed by the launch path before the engine starts; cancelled the moment the
 * game process is seen in the bottle (bottleProcessMonitor's onFirstMatch).
 * Lives outside the monitor so the monitor keeps LD-4 (no deadline): a running
 * game is never subject to this. This module only reports expiry via
 * `onDeadline`; the caller decides what a fired deadline means.
 *
 * Sidecar exit contract: the timer runs on the injected clock (unref'd by default) and
 * the registry is empty at construction.
 */
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { Clock } from 'backend/process/types'
import { isEngineKey } from './gameKey'

/**
 * Discretion choice (CONTEXT Claude's Discretion; RESEARCH Pitfall 5 / A7):
 * must cover a first-run prefix update after an engine switch (5-7 s, spike
 * 059), the shared-redist step (the deadline is armed before that step in
 * 59-10, per D-11), and a cold Wine-Staging start. Running games are never
 * subject to it because it is cancelled at the first process match.
 */
export const LAUNCH_DEADLINE_MS = 180_000

type DeadlineCancelReason =
  | 'first-match'
  | 'launcher-exited'
  | 'launch-error'
  | 'superseded'
  | 'monitor-unavailable'

export interface LaunchDeadline {
  readonly key: string
  readonly state: 'armed' | 'cancelled' | 'fired'
  cancel(reason: DeadlineCancelReason): void
}

interface ArmLaunchDeadlineArgs {
  key: string
  timeoutMs?: number
  onDeadline: () => void | Promise<void>
}

export interface LaunchDeadlines {
  armLaunchDeadline: (args: ArmLaunchDeadlineArgs) => LaunchDeadline
  cancelLaunchDeadline: (key: string, reason: DeadlineCancelReason) => void
  /** Number of armed deadlines (tests). */
  activeCount: () => number
}

/** One registry per boot; deadlines run on the injected clock, whose timers are unref'd by default. */
export function createLaunchDeadlines(deps: { clock: Clock }): LaunchDeadlines {
  const { clock } = deps
  const active = new Map<string, LaunchDeadline>()

  function armLaunchDeadline(args: ArmLaunchDeadlineArgs): LaunchDeadline {
    const { key, onDeadline } = args
    if (typeof key !== 'string' || !isEngineKey(key)) {
      throw new TypeError(`armLaunchDeadline: invalid key "${String(key)}"`)
    }
    const timeoutMs = args.timeoutMs ?? LAUNCH_DEADLINE_MS

    active.get(key)?.cancel('superseded')

    const startedAt = clock.now()
    let state: LaunchDeadline['state'] = 'armed'
    // eslint-disable-next-line prefer-const -- assigned after the cancel closure that clears it
    let handle: ReturnType<Clock['setTimeout']> | undefined

    const deadline: LaunchDeadline = {
      key,
      get state() {
        return state
      },
      cancel(reason) {
        if (state !== 'armed') return
        state = 'cancelled'
        if (handle) clock.clear(handle)
        if (active.get(key) === deadline) active.delete(key)
        logInfo(
          `Engine: launch deadline for key ${key} cancelled (${reason})`,
          LogPrefix.Backend
        )
      }
    }

    handle = clock.setTimeout(() => {
      if (state !== 'armed') return
      state = 'fired'
      if (active.get(key) === deadline) active.delete(key)
      logWarning(
        `Engine: launch deadline fired for key ${key} after ${clock.now() - startedAt} ms (no game process seen)`,
        LogPrefix.Backend
      )
      const logFailure = (error: unknown) =>
        logWarning(
          [`Engine: onDeadline for key ${key} failed`, error],
          LogPrefix.Backend
        )
      try {
        const result = onDeadline()
        if (result && typeof result.catch === 'function') {
          result.catch(logFailure)
        }
      } catch (error) {
        logFailure(error)
      }
    }, timeoutMs)

    active.set(key, deadline)
    return deadline
  }

  return {
    armLaunchDeadline,
    cancelLaunchDeadline(key, reason) {
      active.get(key)?.cancel(reason)
    },
    activeCount: () => active.size
  }
}

/**
 * 59-REVIEW CR-01: nothing but a live process monitor can cancel the deadline
 * at first match, and on the built-in engine the wine launcher lives as long
 * as the game, so an unwatched deadline kills a running game. When no monitor
 * started (`handle === null`) an armed deadline is stood down at once.
 */
export function bindDeadlineToMonitor<H>(
  deadline: LaunchDeadline | undefined,
  handle: H | null,
  log: (msg: string) => void
): H | null {
  if (handle === null && deadline?.state === 'armed') {
    deadline.cancel('monitor-unavailable')
    log(
      'no process monitor started; launch deadline stood down (monitor-unavailable)'
    )
  }
  return handle
}
