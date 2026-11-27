import {
  RUST_LAUNCH_FLIGHT_BEGIN,
  RUST_LAUNCH_FLIGHT_END,
  RUST_LAUNCH_FLIGHT_WAIT
} from 'common/types/sidecarTransport'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The launch single-flight transport (Phase 88.3, 88.3-18, D-04, SC4): the one `runner:appName` single-flight table lives in
 * Rust (`gamelib-launch`'s `LaunchFlights`, 88.3-11), and this is the TypeScript end of it for the leader that stays outside the
 * funnel: the Steam dispatch (`dispatchSteamLaunch`, `dispatchSteamLaunchWithoutSteamOnce`, `restartSteamNowForAdoption`) until
 * 90.2 moves it into Rust. The three shims are one returned typed call each (D-06); the schedule in `engineWineShimSchedule.test.ts`
 * pins that and the phase that deletes them.
 *
 * Reply shapes (88.3-11): `begin` answers `{ lead: <flightId> }` or `{ join: true }`; `wait` answers the leader's settled value
 * verbatim or the string `abandoned`, and rejects with `launch_flight_wait:shutdown` when the app shuts down; `end` answers a boolean.
 * Every shim answers `unknown` (the transport is untyped) and {@link createRustLaunchFlights} narrows.
 */

/** The key of one flight, as the `launch_flight_begin` and `launch_flight_wait` zod schemas take it. */
export type LaunchFlightKey = RustInvokeArgsOf<
  typeof RUST_LAUNCH_FLIGHT_BEGIN
>[0]

/** The flight a leader ends, as the `launch_flight_end` zod schema takes it. */
export type LaunchFlightEnd = RustInvokeArgsOf<typeof RUST_LAUNCH_FLIGHT_END>[0]

/**
 * Leads the flight of `key`, or joins the one in flight. Resolves `{ lead: <flightId> }` (the caller now leads and must end it) or
 * `{ join: true }`, as `unknown`. A lookup, inside the 60 s bound. Rejects with Rust's category word when the call could not be made.
 */
export async function launchFlightBegin(
  deps: RustInvokeDeps,
  key: LaunchFlightKey
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_FLIGHT_BEGIN, [key])
}

/**
 * Waits for the leader of `key` to settle. Resolves its value, or `abandoned` when the leader ended without one, was released at
 * sidecar EOF or is no longer in flight, as `unknown`. Rejects with `launch_flight_wait:shutdown` when the app shuts down. The call
 * lasts as long as the leader's dispatch, so the channel is unbounded (`UNBOUNDED_RUST_CHANNELS`); it ends on the leader's settle,
 * the sidecar EOF release or the shutdown token, never on a timer of ours.
 */
export async function launchFlightWait(
  deps: RustInvokeDeps,
  key: LaunchFlightKey
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_FLIGHT_WAIT, [key])
}

/**
 * Settles the flight `flightId` leads: every joiner receives `result`, and the key is released. Resolves `true` when Rust held the
 * id, `false` for a stale or forged one, as `unknown`. A lookup, inside the 60 s bound.
 */
export async function launchFlightEnd(
  deps: RustInvokeDeps,
  flight: LaunchFlightEnd
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_FLIGHT_END, [flight])
}

/** The per `runner:appName` launch single-flight, as the Steam dispatch calls it. */
export interface LaunchFlights {
  singleFlightLaunch<T>(
    runner: string,
    appName: string,
    onJoin: () => void | Promise<void>,
    run: () => Promise<T>
  ): Promise<T>
}

/**
 * What a leader ends its flight with when `run` rejected: every joiner reads it and rejects. A leader's own value is never this
 * shape (the Steam dispatch settles a boolean).
 */
const REJECTED_MARKER = { rejected: true } as const

function isRejectedMarker(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    (value as { rejected?: unknown }).rejected === true
  )
}

/** The lead id of a `begin` reply, or `null` for a join; any other shape is a reply Rust never sends. */
function readBegin(reply: unknown): string | null {
  if (typeof reply === 'object' && reply !== null) {
    const { lead, join } = reply as { lead?: unknown; join?: unknown }
    if (typeof lead === 'string' && lead !== '') return lead
    if (join === true) return null
  }
  throw new Error('launch_flight_begin:bad-reply')
}

/**
 * The boot's launch single-flight over the Rust table. The shape is the TS table's (`singleFlightLaunch(runner, appName, onJoin,
 * run)`): a leader runs `run` once and its value reaches every joiner; `onJoin` runs for a joiner and a throwing or rejecting one never
 * rejects it; a leader's rejection rejects its joiners (with a fixed error: the leader's own error does not cross); the entry is
 * released when the leader settles (`end` runs in a `finally`). A joiner whose leader was `abandoned` (released at sidecar EOF, or
 * gone before the wait arrived) or whose wait met the shutdown rejects by that name.
 *
 * `transport` is read at call time: the host exists only after boot. The glue creates no timer, listener or handle (sidecar exit
 * contract). There is no TypeScript fallback table (D-04, D-18): a `begin` the shell refuses rejects the caller that asked.
 */
export function createRustLaunchFlights(deps: {
  transport: () => RustInvokeDeps
  /** The boot's warning line, injected so the module reaches no logger of its own. */
  warn?: (message: unknown[]) => void
}): LaunchFlights {
  async function lead<T>(
    key: LaunchFlightKey,
    flightId: string,
    run: () => Promise<T>
  ): Promise<T> {
    let result: unknown = REJECTED_MARKER
    try {
      const value = await run()
      result = value
      return value
    } finally {
      try {
        await launchFlightEnd(deps.transport(), { flightId, result })
      } catch (error) {
        // The leader's own outcome wins. Rust releases a sidecar-led flight at sidecar EOF, so a lost `end` is bounded.
        deps.warn?.([
          `launch single flight ${key.runner}:${key.appName}: end failed`,
          error
        ])
      }
    }
  }

  async function join<T>(
    key: LaunchFlightKey,
    onJoin: () => void | Promise<void>
  ): Promise<T> {
    // A throwing or rejecting notifier must never reject the joiner.
    Promise.resolve()
      .then(onJoin)
      .catch(() => undefined)
    let answer: unknown
    try {
      answer = await launchFlightWait(deps.transport(), key)
    } catch (error) {
      if (
        String(error instanceof Error ? error.message : error).includes(
          ':shutdown'
        )
      ) {
        throw new Error(
          `launch single flight ${key.runner}:${key.appName}: the app is shutting down (shutdown)`
        )
      }
      throw error
    }
    if (answer === 'abandoned') {
      throw new Error(
        `launch single flight ${key.runner}:${key.appName}: the leader ended without a result (abandoned)`
      )
    }
    if (isRejectedMarker(answer)) {
      throw new Error(
        `launch single flight ${key.runner}:${key.appName}: the leader's launch rejected (rejected)`
      )
    }
    return answer as T
  }

  async function singleFlightLaunch<T>(
    runner: string,
    appName: string,
    onJoin: () => void | Promise<void>,
    run: () => Promise<T>
  ): Promise<T> {
    const key = { runner, appName }
    const flightId = readBegin(await launchFlightBegin(deps.transport(), key))
    return flightId === null ? join<T>(key, onJoin) : lead(key, flightId, run)
  }

  return { singleFlightLaunch }
}
