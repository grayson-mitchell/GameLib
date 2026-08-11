/**
 * Curated Steam E2E flow channel registration (Phase 27 Plan 04).
 *
 * Registers exactly the two invoke handlers the skeleton's real Steam flows
 * need onto electronStub's `ipcMain` recorder, importing the REAL backend
 * code paths unchanged (per the plan's own objective — prove the real logic
 * runs behind the new transport, not a reimplementation):
 *
 *   - `refreshLibrary` -> the real `libraryManagerMap[runner].refresh()`
 *     (Gap cycle 4, plan 34.5-33 — see below), which for `steam` ALREADY
 *     calls `sendFrontendMessage('pushGameToLibrary', gameInfo)` once per
 *     resolved game (backend/storeManagers/steam/library.ts) — that
 *     existing call is what reaches the renderer as a `SidecarNotification`
 *     once `backend/ipc.ts`'s `sendFrontendMessage` -> `getMainWindow()` ->
 *     electronStub's fake `BrowserWindow.webContents.send` is wired to the
 *     RPC transport (27-02). Nothing here re-implements that push.
 *   - `launch` -> runner-aware dispatch through `libraryManagerMap` (GAP
 *     CYCLE 6, plan 34.5-46 — see below). `runner === 'steam'` keeps the
 *     curated native path — `libraryManagerMap.steam.getGame(appName)` +
 *     `SteamGame.launch()`'s native branch, which already funnels through
 *     `buildSteamProtocolUrl` (T-27-08's numeric-appId guard) +
 *     `shell.openExternal` (bridged to the Rust opener by electronStub's
 *     `shell.openExternal` forwarder, 27-02). Every other runner delegates
 *     to `launcher.ts`'s `launchEventCallback`, the same dispatch this
 *     module already reproduces for `refreshLibrary` below.
 *
 * Curated-import rule (unchanged in spirit, narrowed in scope by GAP CYCLE
 * 6): this module's import graph is held to exactly what its two flows
 * touch, and nothing is added without a stated reason. `launcher.ts` is
 * ALREADY in this bundle's graph — `wineToolsFlowRegistration.ts:39` imports
 * `runWineCommand`/`validWine` from it, and `handlers.ts` registers that
 * module's flows — so importing `launchEventCallback` from the same module
 * here adds zero new files to the bundle. The `SteamGame` DIRECT import this
 * paragraph used to defend is gone (see GAP CYCLE 6 below); `libraryManagerMap`
 * (already this file's load-bearing first import) is the single source of
 * dispatch truth for every runner, Steam included.
 *
 * GAP CYCLE 4 (34.5-33, Routing item 1): `refreshLibrary` used to be an
 * argument-less Phase 27 walking-skeleton stub that unconditionally called
 * `new SteamLibraryManager().refresh()` regardless of which runner the
 * renderer asked for — so a GOG/legendary/nile/zoom refresh request under
 * Tauri silently refreshed Steam instead, with no error and no log line
 * naming the mismatch. The handler below reproduces `main.ts:1051`'s
 * dispatch semantics (single-runner / all-runners / Humble ownership
 * recompute tail) against the SAME `libraryManagerMap` singleton every
 * other store manager consumer in this codebase uses (see the import note
 * immediately below) instead of a locally-constructed, second
 * `SteamLibraryManager` instance.
 *
 * LIVE REGRESSION FIX (2026-08-01, follow-up to 34.5-33): 34.5-33's dispatch
 * gate (`rawRunner !== undefined && rawRunner !== 'all'`) only excluded
 * `undefined`, and a live `pnpm tauri:dev` session proved the mount-time
 * "refresh everything" call arrives here as `rawRunner === null` (JSON
 * transport, not structured clone) — so it fell into the single-runner
 * branch and threw `unknown runner 'null'`, failing the refresh outright.
 * `handleRefreshLibrary`'s gate now excludes `null` alongside `undefined`;
 * see the comment directly above that gate for the full mechanism.
 *
 * GAP CYCLE 6 (34.5-46): `handleLaunch` was runner-BLIND — it unconditionally
 * did `const game = new SteamGame(appName)`, ignoring the `runner` field
 * already present on `LaunchParams`, so ANY runner's launch reached the Steam
 * native path and tried to build a `steam://rungameid/<appName>` URL for it.
 * Live-observed twice in `gamelib.log`: `[Steam]: SteamGame: launching appId
 * 1207659037 via steam://rungameid/1207659037` for a title whose `runner` is
 * `gog`. Structurally the same shape 34.5-33 fixed for `refreshLibrary` above,
 * left behind because that plan's routing item named only the read flow.
 * `handleLaunch` below now dispatches on `runner` through `libraryManagerMap`
 * with the same own-property fail-closed guard as `handleRefreshLibrary`
 * (T-34.5-C4-10 mitigation, restated as T-34.5-46-01) — an unrecognised
 * runner returns `{ status: 'error' }` and is structurally incapable of
 * falling through to the Steam branch.
 */

// Load-bearing FIRST import (Phase 27 Plan 05 circular-dep fix, refined by
// gap cycle 4 / plan 34.5-33): force `storeManagers/index.ts` to be the
// INITIALIZATION ENTRY before anything in this file's import graph could
// reach `steam/library.ts` a second, different way. `storeManagers/index.ts`
// imports `steam/library` at its OWN top and only THEN constructs its eager
// `libraryManagerMap` (`new SteamLibraryManager()` ...). Entering through
// `steam/library` DIRECTLY instead (as an earlier version of this file did,
// via its own `import SteamLibraryManager from '../storeManagers/steam/
// library'`) makes `steam/library`'s transitive `utils.ts ->
// storeManagers/index.ts` chain re-enter `index.ts` while `steam/library` is
// still mid-evaluation — so `index.ts`'s `new SteamLibraryManager()` sees an
// undefined class and throws `SteamLibraryManager is not a constructor`,
// crashing the sidecar on boot (only in the esbuild bundle's init order;
// ts-jest's differs, which is why 27-04's own tests passed). This module no
// longer imports `steam/library` directly at all — the handler below reads
// the steam manager (and every other manager) off THIS named import instead
// — so the direct-import hazard this docstring describes cannot recur here
// by construction, not merely by convention.
import { libraryManagerMap } from '../storeManagers'

import { ipcMain } from './electronStub'
// launchEventCallback: the real Wine/GameConfig/DownloadManager pipeline
// every non-Steam runner's launch must go through (GAP CYCLE 6, 34.5-46).
// Reasons this is safe to import here: (a) `launcher.ts` is ALREADY in this
// bundle's graph via `wineToolsFlowRegistration.ts:39`'s `runWineCommand`/
// `validWine` import, so this adds no new module; (b) the non-Steam managers
// dereference their `logWriter` argument unconditionally (e.g.
// `gog/games.ts:542,545` — `prepareLaunch`/`logWriter.logError`), and
// `launchEventCallback`'s own `createGameLogWriter(appName, runner)` call is
// the only thing in the tree that produces a real one; (c) it also supplies
// `sendGameStatusUpdate`, the install-path existence precheck, save sync and
// the before/after-launch scripts, all of which the renderer's tile state
// depends on. Steam does NOT go through this path — see the `runner ===
// 'steam'` branch in `handleLaunch` below for why.
import { launchEventCallback } from '../launcher'
import { HumbleLibrary } from '../humble/library'
import { logInfo, logWarning, LogPrefix, RunnerToLogPrefixMap } from '../logger'
import type { LaunchParams, Runner, StatusPromise } from 'common/types'
import type LogWriter from '../logger/log_writer'

/**
 * The `refreshLibrary` handler body, extracted to a named function (rather
 * than inlined into the `ipcMain.handle` call) so the single registration
 * of this channel in `registerSteamFlows()` below fits on one line,
 * matching this task's own acceptance-criteria grep for a single-line,
 * single-occurrence registration.
 *
 * Reproduces `main.ts:1051`'s dispatch semantics:
 *   - a named runner (not `undefined`/`'all'`) refreshes ONLY that runner's
 *     manager, and rethrows (unsettled) if that refresh rejects;
 *   - `undefined`/`'all'` refreshes every manager via `Promise.allSettled`,
 *     so one rejecting manager never wedges the others;
 *   - a Steam-inclusive refresh (`undefined`/`'all'`/`'steam'`) triggers the
 *     Humble ownership recompute tail (Phase 12, D-47/D-48).
 */
async function handleRefreshLibrary(
  _event: unknown,
  ...args: unknown[]
): Promise<void> {
  // LIVE REGRESSION (2026-08-01, fix/34.5-33): `GlobalState.tsx`'s
  // `refreshLibrary()` calls `window.api.refreshLibrary(library)` with
  // `library` genuinely `undefined` for the mount-time "refresh everything"
  // call. Under Electron, structured-clone IPC preserves that `undefined`
  // untouched. Under the Tauri sidecar, RPC request args cross the wire
  // JSON-encoded — `JSON.stringify([undefined])` produces `[null]` — so the
  // SAME call arrives here as `rawRunner === null`, never `undefined`. A
  // strict `!== undefined` gate treats `null` as a "named runner", falls
  // into the single-runner branch below, fails the `hasOwnProperty` check,
  // and throws `unknown runner 'null'` — silently breaking the mount-time
  // refresh under Tauri (live-observed: `~/Library/Logs/GameLib/gamelib.log`
  // 2026-08-01 22:37:44, `refreshLibrary failed runner=null: unknown
  // runner`). `null` must be treated exactly like `undefined` here — do NOT
  // "simplify" this back to a single `!== undefined` check; the JSON
  // transport is the reason both need to be excluded.
  const rawRunner = args[0] as string | undefined | null

  // Single-runner branch — reproduces main.ts:1051-1053's
  // `library !== undefined && library !== 'all'` gate, extended to also
  // exclude `null` (see comment above).
  if (rawRunner !== undefined && rawRunner !== null && rawRunner !== 'all') {
    // T-34.5-C4-10 mitigation: an own-property check (never `in`, which
    // would also match inherited names like `constructor`/`toString`) — an
    // unknown runner throws naming itself and NEVER falls through to the
    // all-branch, and NEVER silently refreshes Steam. That silent fallback
    // is the exact defect this gap-cycle plan exists to close.
    if (!Object.prototype.hasOwnProperty.call(libraryManagerMap, rawRunner)) {
      logWarning(
        `refreshLibrary failed runner=${rawRunner}: unknown runner`,
        LogPrefix.Backend
      )
      throw new Error(`refreshLibrary: unknown runner '${rawRunner}'`)
    }

    const runner = rawRunner as Runner

    // T-34.5-C4-11 mitigation: a rejecting single-runner refresh must still
    // log before rethrowing — an un-logged rejection is indistinguishable
    // from a hang. Matches main.ts's own un-settled `await
    // libraryManagerMap[library].refresh()` — a throw here exits the
    // handler immediately, so neither the Humble tail below nor a
    // "complete" line ever fires on this path (parity with main.ts, which
    // has no try/catch around this specific await either).
    try {
      await libraryManagerMap[runner].refresh()
    } catch (err) {
      logWarning(
        [`refreshLibrary failed runner=${runner}:`, err],
        RunnerToLogPrefixMap[runner]
      )
      throw err
    }

    logInfo(
      `refreshLibrary complete runner=${runner} managers=1`,
      RunnerToLogPrefixMap[runner]
    )

    // Phase 12 (Plan 04, D-47/D-48) tail, ported from main.ts:1070-1079: a
    // Steam-inclusive refresh triggers the Humble ownership recompute.
    // `HumbleLibrary` is already in this sidecar bundle's import graph (via
    // `humbleFlowRegistration.ts`, registered separately in `handlers.ts`)
    // and has no dependency on `storeManagers`/`steam/library`, so
    // importing it here directly adds no new module to the bundle and
    // carries none of this file's circular-import risk.
    if (runner === 'steam') {
      try {
        HumbleLibrary.recomputeOwnership()
      } catch (err) {
        logWarning(
          ['Humble ownership recompute after Steam refresh failed:', err],
          LogPrefix.Backend
        )
      }
    }

    // WR-05 CrossOver rating re-resolve (main.ts:1081-1086) is DELIBERATELY
    // NOT PORTED to this handler. `refreshCrossoverRatingMap()` is a
    // module-PRIVATE function in `main.ts` (never exported), built on
    // `buildCrossoverRatingMap()` — a filesystem/network-scanning helper
    // with its own import graph entirely unrelated to anything already
    // loaded by this sidecar bundle. Porting it would mean either exporting
    // a new cross-cutting helper out of an Electron-only entry file or
    // duplicating its logic here — both are out of scope for a defect fix
    // whose blocking behaviour is "GOG library never lands", not "CrossOver
    // badges go stale by one session". Left as a deliberate,
    // explicitly-recorded follow-up rather than an unexplained omission
    // (per this task's own instruction: never import a module into the
    // sidecar bundle without saying why it is there — the converse holds
    // too, an omission needs the same explicit reasoning).
    return
  }

  // All-runners branch — reproduces main.ts:1054-1060's
  // `Promise.allSettled` fan-out. Runs for `rawRunner === undefined`,
  // `rawRunner === null` (the JSON-transport shape of the same call under
  // Tauri — see the comment above this function), and `rawRunner === 'all'`,
  // matching main.ts's `undefined`/`'all'` semantics.
  const managers = Object.entries(libraryManagerMap)
  const results = await Promise.allSettled(
    managers.map(([, manager]) => manager.refresh())
  )

  // T-34.5-C4-14 mitigation: one rejecting manager must never wedge the
  // others — Promise.allSettled already guarantees that; this only logs the
  // count for observability.
  const failedCount = results.filter(
    (result) => result.status === 'rejected'
  ).length
  if (failedCount > 0) {
    logWarning(
      `refreshLibrary: ${failedCount}/${managers.length} manager(s) failed during runner=all refresh`,
      LogPrefix.Backend
    )
  }

  logInfo(
    `refreshLibrary complete runner=all managers=${managers.length}`,
    LogPrefix.Backend
  )

  // Phase 12 (Plan 04, D-47/D-48) tail — undefined/'all' both include Steam
  // via libraryManagerMap, so this always runs on this branch, matching
  // main.ts:1070's `library === undefined || library === 'all'`.
  try {
    HumbleLibrary.recomputeOwnership()
  } catch (err) {
    logWarning(
      ['Humble ownership recompute after Steam refresh failed:', err],
      LogPrefix.Backend
    )
  }

  // WR-05 CrossOver re-resolve — see the single-runner branch's comment
  // above; the same deliberate-scope decision applies here.
}

/**
 * The `launch` handler body, extracted for the same one-line-registration
 * reason as `handleRefreshLibrary` above.
 *
 * GAP CYCLE 6 (34.5-46): dispatches on `runner` through `libraryManagerMap`
 * — the map, not `new SteamGame(...)`, so the map is the single source of
 * dispatch truth for every runner, matching `handleRefreshLibrary`'s own
 * pattern. Guards `runner` FIRST, before touching the map at all: an
 * unrecognised, absent, or prototype-chain runner returns `{ status: 'error'
 * }` and is structurally incapable of reaching the Steam branch — silently
 * launching Steam for an unrecognised runner is the exact confused-deputy
 * shape (T-34.5-46-03) this fix exists to close.
 */
async function handleLaunch(
  _event: unknown,
  ...args: unknown[]
): Promise<Awaited<StatusPromise>> {
  const params = (args[0] ?? {}) as Partial<LaunchParams>
  const { appName, runner: rawRunner, launchArguments, args: launchArgs, skipVersionCheck } =
    params

  // Guard first, dispatch second (T-34.5-46-01 mitigation — own-property
  // form only, never `in` and never a bare index truth test; see the
  // identical reasoning at `handleRefreshLibrary`'s T-34.5-C4-10 guard
  // above). A bare `libraryManagerMap[rawRunner]` index resolves through
  // `Object.prototype`, so `constructor`/`toString`/`valueOf`/
  // `hasOwnProperty` come back as FUNCTIONS rather than `undefined` and
  // would slip past a truthiness check.
  if (
    typeof appName !== 'string' ||
    appName.length === 0 ||
    typeof rawRunner !== 'string' ||
    !Object.prototype.hasOwnProperty.call(libraryManagerMap, rawRunner)
  ) {
    logWarning(
      `launch failed runner=${rawRunner} appName=${appName}: unknown runner`,
      LogPrefix.Backend
    )
    return { status: 'error' }
  }

  const runner = rawRunner as Runner

  // Steam keeps TODAY'S curated behaviour byte-for-byte: SteamGame.launch()'s
  // native branch already funnels through buildSteamProtocolUrl (T-27-08's
  // numeric-appId guard) + shell.openExternal. The LogWriter parameter is
  // unused by that branch (retained only for the shared Game interface
  // signature) — a headless sidecar has no per-game log-file lifecycle,
  // which belongs to launcher.ts's full pipeline. This is now load-bearing
  // in a SECOND way: it documents exactly why the OTHER branch (below)
  // cannot reuse this `undefined` LogWriter — the non-Steam managers
  // dereference it unconditionally and would throw.
  //
  // Steam deliberately does NOT go through `launchEventCallback`: the Steam
  // native path hands off to the Steam client via `steam://rungameid`
  // instead of running a local binary, so `launchEventCallback`'s
  // `existsSync(gameInfo.install.install_path)` precheck and its
  // `askForceUninstall` branch would abort a perfectly valid Steam launch.
  // That branch is live-proven working and is preserved on purpose, not by
  // omission.
  if (runner === 'steam') {
    const game = libraryManagerMap.steam.getGame(appName)
    const launched = await game.launch(undefined as unknown as LogWriter)
    return { status: launched ? 'done' : 'error' }
  }

  // Every other runner delegates to launchEventCallback — see the import
  // comment above for why this is safe and what it supplies beyond a bare
  // Game.launch() call. Caught here (T-34.5-46-04 mitigation) so an
  // unhandled rejection inside a sidecar invoke handler — the exact shape
  // `sidecarRejectionGuard.test.ts` exists to catch — cannot escape this
  // handler.
  try {
    return await launchEventCallback({
      appName,
      runner,
      launchArguments,
      args: launchArgs,
      skipVersionCheck
    })
  } catch (err) {
    logWarning(
      [`launch failed runner=${runner} appName=${appName}:`, err],
      RunnerToLogPrefixMap[runner]
    )
    return { status: 'error' }
  }
}

/**
 * Registers the read-flow (`refreshLibrary`) and action-flow (`launch`)
 * invoke handlers. Called once from `handlers.ts` — this module owns no
 * side effects at import time beyond registration; the caller decides when
 * registration onto the handler registry happens.
 */
export function registerSteamFlows(): void {
  ipcMain.handle('refreshLibrary', handleRefreshLibrary)
  ipcMain.handle('launch', handleLaunch)
}
