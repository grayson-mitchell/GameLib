import { backendEvents } from 'backend/backend_events'
import type { GameStatus } from 'common/types'

/**
 * 260817-dib: converts the DownloadManager's install bound from a TOTAL
 * DURATION ceiling to a NO-PROGRESS window. This module is runner-agnostic
 * and governs all six runners in `libraryManagerMap` (sideload, gog,
 * legendary, nile, zoom, steam) equally — it must never import anything from
 * `storeManagers/steam`.
 *
 * `withStallTimeout` re-arms its deadline only on an observed ADVANCE in the
 * `backendEvents` `progressUpdate-${appName}` payload (percent increased, or
 * the formatted `bytes` string changed) — never on event ARRIVAL. This
 * distinction is load-bearing: `steam/depot.ts` runs a 1s
 * `PROGRESS_HEARTBEAT_MS` interval that emits an honest ~0 MB/s
 * `progressUpdate` every second regardless of whether any chunk actually
 * landed. An arrival-armed watchdog would see that heartbeat and never trip
 * for a genuinely wedged Steam install — a non-vacuous, correctly computed
 * watchdog that guards nothing. Re-arming strictly on an advance keeps the
 * watchdog honest for Steam while leaving every other runner unaffected (they
 * never emit a heartbeat-without-progress in the first place).
 *
 * A runner that never reports progress at all (sideload today) degrades
 * exactly to the OLD fixed-ceiling behavior: the deadline is armed once, at
 * call time, and is never re-armed absent an observed advance.
 */
export const INSTALL_NO_PROGRESS_TIMEOUT_MS = 8 * 60 * 1000

/** Marker property stamped on the Error `withStallTimeout` rejects with. */
export interface StallError extends Error {
  isStall: true
  /** ms of no observed progress at the moment of the trip. */
  msSinceProgress: number
}

export function isStallError(err: unknown): err is StallError {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { isStall?: unknown }).isStall === true
  )
}

/**
 * Rejects with a {@link StallError} once `stallMs` elapses with no OBSERVED
 * ADVANCE in `backendEvents`'s `progressUpdate-${appName}` payloads. Any
 * advance (a higher `percent`, or a changed `bytes` string) re-arms the full
 * window. Transparent pass-through otherwise — resolves/rejects exactly as
 * `promise` would if it settles first. Always removes its listener and
 * clears its timer, on BOTH the resolve and the reject path.
 */
export async function withStallTimeout<T>(
  promise: Promise<T>,
  appName: string,
  stallMs: number,
  label: string
): Promise<T> {
  const eventName = `progressUpdate-${appName}` as const

  let timer: ReturnType<typeof setTimeout> | undefined
  let lastPercent = -1
  let lastBytes: string | undefined
  let armedAt = Date.now()
  let rejectStall: (err: StallError) => void = () => {}

  const trip = () => {
    const msSinceProgress = Date.now() - armedAt
    const seconds = Math.round(msSinceProgress / 1000)
    rejectStall(
      Object.assign(
        new Error(
          `${label}: no progress observed for ${seconds}s (no-progress bound ${Math.round(
            stallMs / 1000
          )}s)`
        ),
        {
          isStall: true as const,
          msSinceProgress
        }
      )
    )
  }

  const rearm = () => {
    clearTimeout(timer)
    armedAt = Date.now()
    timer = setTimeout(trip, stallMs)
  }

  const listener = (progress: GameStatus) => {
    const p = progress.progress
    if (!p) return
    const advanced =
      (p.percent !== undefined && p.percent > lastPercent) ||
      (p.bytes !== undefined && p.bytes !== lastBytes)
    if (!advanced) return
    if (p.percent !== undefined) lastPercent = p.percent
    if (p.bytes !== undefined) lastBytes = p.bytes
    rearm()
  }

  const stallPromise = new Promise<never>((_resolve, reject) => {
    rejectStall = reject
    backendEvents.on(eventName, listener)
    // Arm the initial timer at call time — a runner that never reports
    // progress (sideload) behaves exactly as the old fixed ceiling.
    rearm()
  })

  try {
    return await Promise.race([promise, stallPromise])
  } finally {
    clearTimeout(timer)
    backendEvents.off(eventName, listener)
  }
}
