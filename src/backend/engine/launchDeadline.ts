/**
 * Phase 59 (D-10/D-11): per-key launch deadline.
 *
 * Armed by the launch path before the engine starts; cancelled the moment the
 * game process is seen in the bottle (bottleProcessMonitor's onFirstMatch).
 * Lives outside the monitor so the monitor keeps LD-4 (no deadline): a running
 * game is never subject to this. This module only reports expiry via
 * `onDeadline`; the caller decides what a fired deadline means.
 *
 * Sidecar exit contract: the timer is unref'd and the registry is empty at
 * load.
 */
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isEngineKey } from './gameKey'

/**
 * Discretion choice (CONTEXT Claude's Discretion; RESEARCH Pitfall 5 / A7):
 * must cover a first-run prefix update after an engine switch (5-7 s, spike
 * 059), the shared-redist step (the deadline is armed before that step in
 * 59-10, per D-11), and a cold Wine-Staging start. Running games are never
 * subject to it because it is cancelled at the first process match.
 */
export const LAUNCH_DEADLINE_MS = 180_000

export type DeadlineCancelReason =
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

const active = new Map<string, LaunchDeadline>()

export function armLaunchDeadline(args: {
  key: string
  timeoutMs?: number
  onDeadline: () => void | Promise<void>
  setTimer?: (fn: () => void, ms: number) => { unref?: () => void } & object
  clearTimer?: (handle: unknown) => void
}): LaunchDeadline {
  const { key, onDeadline } = args
  if (typeof key !== 'string' || !isEngineKey(key)) {
    throw new TypeError(`armLaunchDeadline: invalid key "${String(key)}"`)
  }
  const timeoutMs = args.timeoutMs ?? LAUNCH_DEADLINE_MS
  const setTimer =
    args.setTimer ??
    ((fn: () => void, ms: number) =>
      setTimeout(fn, ms) as { unref?: () => void } & object)
  const clearTimer =
    args.clearTimer ?? ((h: unknown) => clearTimeout(h as NodeJS.Timeout))

  active.get(key)?.cancel('superseded')

  const startedAt = Date.now()
  let state: LaunchDeadline['state'] = 'armed'
  // eslint-disable-next-line prefer-const -- assigned after the cancel closure that clears it
  let handle: ({ unref?: () => void } & object) | undefined

  const deadline: LaunchDeadline = {
    key,
    get state() {
      return state
    },
    cancel(reason) {
      if (state !== 'armed') return
      state = 'cancelled'
      clearTimer(handle)
      if (active.get(key) === deadline) active.delete(key)
      logInfo(
        `SteamEngine: launch deadline for key ${key} cancelled (${reason})`,
        LogPrefix.Steam
      )
    }
  }

  handle = setTimer(() => {
    if (state !== 'armed') return
    state = 'fired'
    if (active.get(key) === deadline) active.delete(key)
    logWarning(
      `SteamEngine: launch deadline fired for key ${key} after ${Date.now() - startedAt} ms (no game process seen)`,
      LogPrefix.Steam
    )
    const logFailure = (error: unknown) =>
      logWarning(
        [`SteamEngine: onDeadline for key ${key} failed`, error],
        LogPrefix.Steam
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
  handle.unref?.()

  active.set(key, deadline)
  return deadline
}

export function cancelLaunchDeadline(
  key: string,
  reason: DeadlineCancelReason
): void {
  active.get(key)?.cancel(reason)
}

export function __activeLaunchDeadlineCount(): number {
  return active.size
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
