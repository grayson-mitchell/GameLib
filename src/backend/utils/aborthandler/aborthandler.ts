import { LogPrefix, logError, logInfo } from 'backend/logger'

/**
 * What a registry can be given (Phase 88.2, 88.2-16, D-02): Rust owns the abort table of the runner calls it runs, so an id the
 * TypeScript map does not hold may still name a run there. `forwardAbort` asks Rust to end the run that answers to `id` and
 * answers whether one did (`runnerAbort`, narrowed to a boolean by the boot that passes it). A rejected or lost forward counts as
 * "no run answered". Without it the registry behaves as it always has.
 */
export interface AbortRegistryDeps {
  forwardAbort?: (id: string) => Promise<boolean>
}

/**
 * What `call` writes when neither the local map nor Rust knew the id (quick 261128-935). `'error'`, the default, is for a caller
 * that expects a registration, where a miss is a defect. `'info'` is for a caller whose abort is best-effort because something
 * else ends the work: the Stop path, `dispatch.kill`, where each store's `stop()` ends a running game.
 */
export interface AbortCallOptions {
  ifMissing?: 'error' | 'info'
}

/**
 * The abort-controller registry of one boot (D-05, 66.4-13): the Map lives in this closure, built once by
 * the 'abort-registry' boot step. Every consumer reaches it through a Pick of this type, so quit and stdin
 * EOF (`abortAll`) cancel exactly the jobs the rest of the backend registered.
 */
export function createAbortRegistry(deps?: AbortRegistryDeps) {
  const abortControllers = new Map<string, AbortController>()

  function create(id: string): AbortController {
    const abortController = new AbortController()
    // add or update map entry
    abortControllers.set(id, abortController)
    return abortController
  }

  function logNotFound(id: string, level: 'error' | 'info') {
    if (level === 'info') {
      logInfo(
        ['No abort controller for', id, '- nothing to abort'],
        LogPrefix.Backend
      )
      return
    }
    logError(
      [
        'Aborting not possible. Could not find a matching abort controller for',
        id
      ],
      LogPrefix.Backend
    )
  }

  /** Aborts the local controller for `id`, if the map holds one; answers whether it did. */
  function abortLocal(id: string): boolean {
    const abortController = abortControllers.get(id)
    if (!abortController) return false
    // debug/steam-cancel-abort-thread-a: a controller that was FOUND but is
    // already aborted is an idempotent no-op, not a failure — a caller can
    // legitimately call this twice for the same id in the same cancel
    // (e.g. downloadqueue.ts's stopCurrentDownload() calls
    // callAbortController(appName) directly, then also calls
    // SteamGame.stop(), which calls callAbortController(this.appId) again
    // for the identical id). Previously this fell through to the
    // "Could not find a matching abort controller" error log (`logNotFound`) even
    // though the controller WAS found — a misleading false alarm on every
    // double-abort, observed on real hardware as an [ERROR][Backend] log
    // during an otherwise-successful cancel. Only a GENUINE lookup miss
    // (id never registered, or already deleteAbortController'd) should
    // reach the error log now.
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
    return true
  }

  /** Asks Rust to end the run that answers to `id`; never throws and never rejects. */
  function forward(id: string): Promise<boolean> {
    const { forwardAbort } = deps ?? {}
    if (!forwardAbort) return Promise.resolve(false)
    try {
      return forwardAbort(id).then(
        (found) => found === true,
        () => false
      )
    } catch {
      return Promise.resolve(false)
    }
  }

  function call(id: string, opts?: AbortCallOptions) {
    const ifMissing = opts?.ifMissing ?? 'error'
    const foundLocally = abortLocal(id)
    if (!deps?.forwardAbort) {
      if (!foundLocally) logNotFound(id, ifMissing)
      return
    }
    // D-02: Rust owns the abort table of its runner calls, so the id goes there too, whether or not the map held it. The
    // not-found line is written only when neither side knew the id, which is known once Rust has answered.
    const forwarded = forward(id)
    if (foundLocally) return
    void forwarded.then((foundInRust) => {
      if (!foundInRust) logNotFound(id, ifMissing)
    })
  }

  function abortAll() {
    // debug/steam-install-slow-start (Thread D-1/D-2 investigation): this used to
    // be `for (const key in abortControllers.keys())` — `for...in` enumerates
    // enumerable STRING-KEYED PROPERTIES of an object, not the values a Map
    // iterator yields, and a `MapIterator` has no enumerable own properties. This
    // loop body NEVER ran — `abortAll()` was a complete no-op.
    // Only reachable from `handleExit()` (backend/utils.ts, the app-quit
    // handler), so every in-flight download's AbortController was left
    // un-aborted on quit: `abortController.signal.aborted` stayed `false`, so
    // `callRunner` (launcher.ts)'s `.catch` handler classified an
    // externally-terminated (formerly name-pattern-killed) child process as a genuine
    // `res.error` instead of `res.abort` — a real, if narrow, quit-time status
    // misclassification for every runner (GOG/Legendary/Nile) that goes through
    // `runRunnerCommand`/`callRunner`, independent of the D-1 destroyed-window fix.
    // Iterate a snapshot of the keys (an array), not the live Map iterator, so
    // `call`'s own `abortControllers.delete` calls (via
    // `delete`, invoked from `callRunner`'s `.finally`) can't
    // invalidate iteration.
    // Local controllers only (88.2-16): on quit Rust ends its own runs through the shutdown budget, and a forward here would
    // leave an invoke in flight at exit.
    for (const key of Array.from(abortControllers.keys())) {
      abortLocal(key)
    }
  }

  function remove(id: string) {
    abortControllers.delete(id)
  }

  // 37-05 (REQ-37-04): a read-only registration-state query for a caller that
  // fires UNCONDITIONALLY on every failure (downloadmanager/utils.ts's
  // terminal-error branch) to distinguish "there is nothing registered here to
  // abort" from "something that should be registered is genuinely missing".
  // callAbortController's own ERROR log above is deliberately left untouched
  // for every caller that DOES expect a registration to exist (stopCurrentDownload,
  // SteamGame.stop, abortAll) — this export exists so ONE
  // caller can ask before it tells, not to soften the log for everyone.
  // The Stop path (`dispatch.kill`) does not ask `has` first. It calls with
  // `ifMissing: 'info'`, so the forward to Rust still runs (quick 261128-935).
  function has(id: string): boolean {
    return abortControllers.has(id)
  }

  // 59-21 (WR-11): the signal of an already-registered controller, so a caller
  // that must not replace it (the download queue aborts by id) can still observe
  // the cancel.
  function getSignal(id: string): AbortSignal | undefined {
    return abortControllers.get(id)?.signal
  }

  return { create, call, abortAll, delete: remove, has, getSignal }
}

export type AbortRegistry = ReturnType<typeof createAbortRegistry>
