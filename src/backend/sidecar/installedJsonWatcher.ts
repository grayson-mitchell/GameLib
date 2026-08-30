/**
 * `installed.json` watcher — the sidecar port of `main.ts`'s Electron-only file watch.
 * Phase 35 plan 35-10 (Task 1, REQ-35-16, D-18/D-05).
 *
 * WHAT THIS PORTS, AND WHY IT WAS MISSING. `src/backend/main.ts:1036-1048` registers
 * `watch(legendaryInstalled, ...)` at module scope and refreshes the Legendary library 500ms
 * after the last write. That is a side effect, not an IPC handler — so it is invisible to the
 * channel-by-channel port inventory this phase used, and it was carried by a fully green
 * port-coverage gate while never executing under Tauri at all. Plan 35-01's D-17 census
 * established ZERO import edges from the sidecar into `main.ts`, which is why the behaviour is
 * Tauri-only-broken BY CONSTRUCTION rather than by coincidence (`35-AB-RETEST.md` item 2).
 *
 * SURFACED SYMPTOM. `legendary sync-saves` computed a save path from a stale in-memory
 * `installedGames` map and left the Cloud Saves Sync save-path field empty, logging
 * `[Legendary]: Unable to compute default save path <appName>`. It does not self-heal on retry,
 * because nothing short of a full library refresh reloads the map — which is what made it
 * present as "intermittent".
 *
 * THE DEBOUNCE IS LOAD-BEARING AND IS CARRIED ACROSS UNCHANGED. `main.ts`'s own comment, kept
 * verbatim below, records the reason: `watch` fires more than once while legendary is still
 * writing the file in chunks, and refreshing on the first of those events hands
 * `LegendaryLibrary.refreshInstalled()` a truncated document to `JSON.parse` (T-35-41). The
 * delay is exported rather than inlined so a test can pin it to the value `main.ts` ships;
 * there is deliberately NO override parameter, so the shipped 500 is the value every test
 * exercises.
 *
 * WHAT IS ADDED BEYOND THE PORT, AND WHY. `main.ts` never needed teardown — the Electron main
 * process exits and takes the watcher with it. The sidecar can re-enter its library lifecycle,
 * and an accumulating set of `fs.watch` handles would turn one legendary write into N refreshes
 * and N subprocess invocations (T-35-42). So `startInstalledJsonWatcher` is idempotent (a second
 * call while active is a no-op returning `false`) and `stopInstalledJsonWatcher` both closes the
 * handle and clears any refresh still pending inside the debounce window.
 *
 * CURATED-IMPORT DISCIPLINE. This module imports `../storeManagers` and
 * `../storeManagers/legendary/constants` directly, never `../main` — the same rule every other
 * `src/backend/sidecar/` module follows, and the rule whose violation would drag Electron's real
 * `ipcMain` into the sidecar's graph.
 */

import { existsSync, watch } from 'graceful-fs'
import { libraryManagerMap } from '../storeManagers'
import { legendaryInstalled } from '../storeManagers/legendary/constants'
import { logInfo, LogPrefix } from '../logger'
import { sendFrontendMessage } from '../ipc'

/**
 * The debounce window, in milliseconds. Matches `main.ts:1047`'s `setTimeout(..., 500)` exactly.
 */
export const INSTALLED_JSON_REFRESH_DEBOUNCE_MS = 500

export interface InstalledJsonWatcherOptions {
  /** Defaults to the real `legendaryInstalled` path. Overridden only by tests. */
  path?: string
  /** Defaults to the real Legendary library refresh. Overridden only by tests. */
  refresh?: () => void
}

let activeWatcher: ReturnType<typeof watch> | undefined
let refreshTimeout: NodeJS.Timeout | undefined

/** True while a watch handle is open. Exported so teardown is observable to a test. */
export function isInstalledJsonWatcherActive(): boolean {
  return activeWatcher !== undefined
}

/**
 * Arms the watcher.
 *
 * Returns `true` when a new watch handle was opened, and `false` when it was not — either
 * because the file does not exist yet (a fresh profile has no `installed.json` until legendary
 * first writes one, which is exactly why `main.ts` guards with `existsSync`) or because a
 * watcher is already active.
 *
 * Must be called once the sidecar is up, NOT at module load: `legendaryInstalled` resolves
 * through the app-data path shim, and the existence check is only meaningful after startup.
 */
export function startInstalledJsonWatcher(
  options: InstalledJsonWatcherOptions = {}
): boolean {
  if (activeWatcher) {
    return false
  }

  const target = options.path ?? legendaryInstalled
  // D-35-19-09 (live-gate criterion 14, UI half): the backend refresh alone left the renderer
  // with no signal that anything changed, so the Library view never re-rendered without a
  // manual refresh even though `refreshInstalled()` had already rebuilt the in-memory map. The
  // send sits AFTER `refreshInstalled()` resolves, not alongside it — a renderer told to
  // refresh before the backend rebuild lands re-reads the stale set and the user sees nothing
  // change, which is the same defect one layer over. Matches the exact call shape the three
  // peer paths already use (`legendary/games.ts:767,1067`, `sideload/library.ts:77`,
  // `nile/games.ts:512`): `sendFrontendMessage('refreshLibrary', 'legendary')`.
  //
  // This inherits the existing debounce for free and fires once per settled change — the send
  // lives inside the SAME `setTimeout(refresh, ...)` callback the debounce already coalesces,
  // so no second debounce is added here.
  //
  // A rejecting `refreshInstalled()` must NOT send `refreshLibrary`: a failed rebuild has
  // nothing new for the renderer to read, and criterion 14's own probe proved
  // `refreshInstalled()` can throw on a malformed file. The rejection is left to propagate
  // exactly as it did before this change — no catch is added here, which would convert an
  // observable failure into silence.
  const refresh =
    options.refresh ??
    (async () => {
      await libraryManagerMap['legendary'].refreshInstalled()
      sendFrontendMessage('refreshLibrary', 'legendary')
    })

  if (!existsSync(target)) {
    return false
  }

  activeWatcher = watch(target, () => {
    logInfo('installed.json updated, refreshing library', LogPrefix.Legendary)
    // `watch` might fire twice (while Legendary/we are still writing chunks of the file), which
    // would in turn make LegendaryLibrary fail to decode the JSON data. So instead of
    // immediately calling LegendaryLibrary.get().refreshInstalled(), call it only after no
    // writes happen in a 500ms timespan.
    if (refreshTimeout) clearTimeout(refreshTimeout)
    refreshTimeout = setTimeout(refresh, INSTALLED_JSON_REFRESH_DEBOUNCE_MS)
    // Same reason as the watcher's own `unref()` below: a pending debounce must not be the
    // reason the process is still alive when the shell has closed stdin.
    refreshTimeout.unref?.()
  })

  // An `FSWatcher` is a libuv handle and, like any handle, it REFERENCES the event loop -- so
  // while one is open the process cannot exit on its own. That is wrong for the sidecar: its
  // lifetime is owned by stdin (the RPC frame stream), and it must exit when the shell closes
  // it. Without this `unref()` the sidecar started, served, and then HUNG FOREVER on stdin EOF
  // instead of exiting 0 -- the shell's `shutdown_child()` would then have to SIGKILL it on the
  // way out, and anything that ever misses that kill leaves an orphan holding an authenticated
  // session, which is the exact hazard `RunEvent::Exit`'s own comment describes.
  //
  // `unref()` does NOT stop the watcher working. It only says "do not keep the process alive
  // FOR ME". Events still fire for as long as something else holds the loop open, which for the
  // whole of the sidecar's real life is stdin.
  //
  // Found 2026-08-29 by `pnpm smoke:sidecar` and proven by bisection: that gate FAILED with the
  // watcher wired in and PASSED with it removed, on an otherwise identical tree. No jest test
  // could have caught it -- the call site is guarded by `JEST_WORKER_ID`, so the live path is
  // never exercised under jest, and `pnpm build:sidecar` exits 0 because the bundle builds fine,
  // it just cannot exit.
  activeWatcher.unref()

  return true
}

/**
 * Closes the watch handle and drops any refresh still queued inside the debounce window.
 *
 * Clearing the timeout is not incidental tidiness: without it, a stop issued mid-window still
 * lets one refresh land after the watcher is nominally gone, which is the shape that makes
 * "the watcher was torn down" untrue in exactly the case a caller tears it down for.
 */
export function stopInstalledJsonWatcher(): void {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout)
    refreshTimeout = undefined
  }
  if (activeWatcher) {
    activeWatcher.close()
    activeWatcher = undefined
  }
}
