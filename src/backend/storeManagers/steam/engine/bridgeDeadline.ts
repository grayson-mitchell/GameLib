/**
 * The Steam bridge's launch deadline over Rust (Phase 59 D-10/D-11; Phase 87, 87-54, D-17).
 *
 * Armed by the launch path before the engine starts; cancelled the moment the game process is seen. The timer is Rust's
 * (`enginewine/deadline.ts` shims); the bridge keeps the synchronous handle its launch reads (`deadline.state`,
 * `deadline.cancel(reason)`) and the callback Rust's `engineDeadlineFired` frame runs. Lives outside the monitor so the
 * monitor keeps LD-4 (no deadline): a running game is never subject to it.
 */
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  armBridgeDeadline,
  bridgeDeadlines,
  cancelBridgeDeadline
} from 'backend/enginewine/deadline'
import type {
  BridgeDeadline,
  BridgeDeadlineCancelReason
} from 'backend/enginewine/deadline'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * Arms the deadline of `key` and returns the handle. The callback is stored before the arm goes out, so a frame can never
 * beat it. A refused arm (a key that is not an engine key, the shutdown) stands the handle down and resolves it anyway: a
 * launch with no deadline is the launch as it was before the deadline existed, and it must not fail for it.
 */
export async function armBridgeLaunchDeadline(
  deps: RustInvokeDeps,
  args: { key: string; onDeadline: () => void | Promise<void> }
): Promise<BridgeDeadline> {
  const { key } = args
  const handle = bridgeDeadlines.track(
    key,
    args.onDeadline,
    (reason: BridgeDeadlineCancelReason) => {
      logInfo(
        `Engine: launch deadline for key ${key} cancelled (${reason})`,
        LogPrefix.Backend
      )
      void Promise.resolve(cancelBridgeDeadline(deps, { key, reason })).catch(
        (error: unknown) =>
          logWarning(
            `Engine: launch deadline for key ${key} could not be cancelled in Rust: ${String(error)}`,
            LogPrefix.Backend
          )
      )
    }
  )
  try {
    await armBridgeDeadline(deps, { key })
  } catch (error) {
    logWarning(
      `Engine: launch deadline for key ${key} could not be armed, launching without one: ${String(error)}`,
      LogPrefix.Backend
    )
    handle.cancel('launch-error')
  }
  return handle
}

/**
 * 59-REVIEW CR-01: nothing but a live process monitor can cancel the deadline at first match, and on the built-in engine
 * the wine launcher lives as long as the game, so an unwatched deadline kills a running game. When no monitor started
 * (`handle === null`) an armed deadline is stood down at once.
 */
export function bindDeadlineToMonitor<H>(
  deadline: BridgeDeadline | undefined,
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
