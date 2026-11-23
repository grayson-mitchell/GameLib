import { logWarning, LogPrefix } from 'backend/logger'
import type { IpcRegistry } from 'backend/sidecar/ipcRegistry'
import {
  RUST_ENGINE_DEADLINE_ARM,
  RUST_ENGINE_DEADLINE_CANCEL
} from 'common/types/sidecarTransport'
import { sidecarInternalSendArgs } from 'common/types/ipc/sidecarInternal'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * A Steam bridge launch's deadline lives in Rust (Phase 87, `gamelib-engine` `launch::deadline`, D-17): the 180 s timer,
 * its cancel reasons and its firing. What a fired bridge deadline MEANS stays the bridge's (it stops the bottle, the helper
 * and the monitor and shows its own dialog), so Rust does not call back into TypeScript for state: it sends the one
 * `engineDeadlineFired {key, reason}` frame, and the callback the bridge stored when it armed runs. The shims in this file
 * are the only TS path to the arm and the cancel; Phase 96 moves the bridge's launch into Rust and deletes them. Each body
 * is one returned typed call (D-06). The shim schedule in `engineWineShimSchedule.test.ts` pins the shape and the phase
 * that deletes each shim.
 */

/** The closed set of reasons a deadline is cancelled for (the crate's `CancelReason`, which logs it). */
export type BridgeDeadlineCancelReason =
  | 'first-match'
  | 'launcher-exited'
  | 'launch-error'
  | 'superseded'
  | 'monitor-unavailable'

/**
 * Arms the deadline of a Steam bridge launch (no process watch: the bridge's own monitor cancels it). A deadline the key
 * already holds is superseded in Rust. Resolves `null`; rejects with Rust's category word for a key that is not an engine
 * key.
 */
export async function armBridgeDeadline(
  deps: RustInvokeDeps,
  args: { key: string }
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_DEADLINE_ARM, [args])
}

/**
 * Cancels the deadline of a key. Resolves `true` when one was armed; rejects with Rust's category word for a key or a
 * reason outside the closed set.
 */
export async function cancelBridgeDeadline(
  deps: RustInvokeDeps,
  args: { key: string; reason: BridgeDeadlineCancelReason }
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_DEADLINE_CANCEL, [args])
}

/** What a bridge holds for one armed deadline: the synchronous state it reads and the way to stand it down. */
export interface BridgeDeadline {
  readonly key: string
  readonly state: 'armed' | 'cancelled' | 'fired'
  /** Stands the deadline down, here at once and in Rust through `cancelRemote`; a deadline not armed any more ignores it. */
  cancel(reason: BridgeDeadlineCancelReason): void
}

interface Tracked {
  handle: BridgeDeadline
  onDeadline: () => void | Promise<void>
  setState: (state: BridgeDeadline['state']) => void
}

/**
 * The bridge's deadline callbacks, keyed by the engine key it armed (D-24 view, 87-54). Rust owns the timer; this Map holds
 * only what the bridge told it to run when the frame arrives, and the state the bridge reads synchronously
 * (`deadline.state === 'fired'`, `deadline.cancel(reason)`). A frame for a key nothing armed is ignored (T-87-55). A module
 * Map: no timer, no handle, nothing at load (the sidecar exit contract). A reset is for tests.
 */
const tracked = new Map<string, Tracked>()

export const bridgeDeadlines = {
  /**
   * Stores `onDeadline` for `key` and returns the handle the bridge reads, BEFORE the arm goes to Rust so a frame can never
   * beat its own callback. A handle the key already holds is superseded here only: Rust supersedes its own at the arm, and a
   * cancel sent for it would reach Rust after (or race with) the new arm and stand the new deadline down. `cancelRemote`
   * is how a cancel reaches Rust; it is called once, only for an armed handle.
   */
  track(
    key: string,
    onDeadline: () => void | Promise<void>,
    cancelRemote: (reason: BridgeDeadlineCancelReason) => void
  ): BridgeDeadline {
    tracked.get(key)?.setState('cancelled')
    let state: BridgeDeadline['state'] = 'armed'
    const handle: BridgeDeadline = {
      key,
      get state() {
        return state
      },
      cancel(reason) {
        if (state !== 'armed') return
        state = 'cancelled'
        if (tracked.get(key)?.handle === handle) tracked.delete(key)
        cancelRemote(reason)
      }
    }
    tracked.set(key, {
      handle,
      onDeadline,
      setState: (next) => {
        state = next
      }
    })
    return handle
  },
  /**
   * Runs the callback of the armed deadline of `key`, once. Resolves `false` for a key nothing armed (or one already fired
   * or cancelled): the frame is ignored. A callback that throws or rejects is logged, never rethrown into the listener.
   */
  fire(key: string): boolean {
    const entry = tracked.get(key)
    if (!entry || entry.handle.state !== 'armed') return false
    tracked.delete(key)
    entry.setState('fired')
    const logFailure = (error: unknown) =>
      logWarning(
        [`Engine: onDeadline for key ${key} failed`, error],
        LogPrefix.Backend
      )
    try {
      const result = entry.onDeadline()
      if (result && typeof result.catch === 'function') {
        result.catch(logFailure)
      }
    } catch (error) {
      logFailure(error)
    }
    return true
  },
  /** Forgets every tracked deadline (tests). */
  reset(): void {
    tracked.clear()
  }
}

/**
 * Wires Rust's `engineDeadlineFired` frame into {@link bridgeDeadlines}. The frame is shell-originated (it is not in the
 * renderer allow-list, so the renderer cannot fire a bridge deadline, T-87-55) and is validated again here, so a malformed
 * one is dropped. One call from `handlers.ts`; it creates no timer or handle.
 */
export function registerEngineDeadlineFired(
  ipc: Pick<IpcRegistry, 'on'>
): void {
  ipc.on('engineDeadlineFired', (_event: unknown, ...args: unknown[]) => {
    const parsed = sidecarInternalSendArgs.engineDeadlineFired.safeParse(args)
    if (!parsed.success) return
    bridgeDeadlines.fire(parsed.data[0].key)
  })
}
