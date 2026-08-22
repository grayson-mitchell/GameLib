import { LogPrefix, logError } from 'backend/logger'

const abortControllers = new Map<string, AbortController>()

function createAbortController(id: string): AbortController {
  const abortController = new AbortController()
  // add or update map entry
  abortControllers.set(id, abortController)
  return abortController
}

function callAbortController(id: string) {
  if (abortControllers.has(id)) {
    const abortController = abortControllers.get(id)!
    if (abortController) {
      // debug/steam-cancel-abort-thread-a: a controller that was FOUND but is
      // already aborted is an idempotent no-op, not a failure — a caller can
      // legitimately call this twice for the same id in the same cancel
      // (e.g. downloadqueue.ts's stopCurrentDownload() calls
      // callAbortController(appName) directly, then also calls
      // SteamGame.stop(), which calls callAbortController(this.appId) again
      // for the identical id). Previously this fell through to the
      // "Could not find a matching abort controller" error log below even
      // though the controller WAS found — a misleading false alarm on every
      // double-abort, observed on real hardware as an [ERROR][Backend] log
      // during an otherwise-successful cancel. Only a GENUINE lookup miss
      // (id never registered, or already deleteAbortController'd) should
      // reach the error log now.
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
      return
    }
  }

  logError(
    [
      'Aborting not possible. Could not find a matching abort controller for',
      id
    ],
    LogPrefix.Backend
  )
}

function callAllAbortControllers() {
  // debug/steam-install-slow-start (Thread D-1/D-2 investigation): this used to
  // be `for (const key in abortControllers.keys())` — `for...in` enumerates
  // enumerable STRING-KEYED PROPERTIES of an object, not the values a Map
  // iterator yields, and a `MapIterator` has no enumerable own properties. This
  // loop body NEVER ran — `callAllAbortControllers()` was a complete no-op.
  // Only reachable from `handleExit()` (backend/utils.ts, the app-quit
  // handler), so every in-flight download's AbortController was left
  // un-aborted on quit: `abortController.signal.aborted` stayed `false`, so
  // `callRunner` (launcher.ts)'s `.catch` handler classified an
  // externally-`killPattern`/`pkill`-terminated child process as a genuine
  // `res.error` instead of `res.abort` — a real, if narrow, quit-time status
  // misclassification for every runner (GOG/Legendary/Nile) that goes through
  // `runRunnerCommand`/`callRunner`, independent of the D-1 destroyed-window fix.
  // Iterate a snapshot of the keys (an array), not the live Map iterator, so
  // `callAbortController`'s own `abortControllers.delete` calls (via
  // `deleteAbortController`, invoked from `callRunner`'s `.finally`) can't
  // invalidate iteration.
  for (const key of Array.from(abortControllers.keys())) {
    callAbortController(key)
  }
}

function deleteAbortController(id: string) {
  abortControllers.delete(id)
}

// 37-05 (REQ-37-04): a read-only registration-state query for a caller that
// fires UNCONDITIONALLY on every failure (downloadmanager/utils.ts's
// terminal-error branch) to distinguish "there is nothing registered here to
// abort" from "something that should be registered is genuinely missing".
// callAbortController's own ERROR log above is deliberately left untouched
// for every caller that DOES expect a registration to exist (stopCurrentDownload,
// SteamGame.stop, callAllAbortControllers) — this export exists so ONE
// caller can ask before it tells, not to soften the log for everyone.
function hasAbortController(id: string): boolean {
  return abortControllers.has(id)
}

export {
  createAbortController,
  callAbortController,
  callAllAbortControllers,
  deleteAbortController,
  hasAbortController
}
