/**
 * Curated enrichment-channel registration (Phase 34.2 Plan 06, D-04/D-07/
 * D-10, REQ-34.2-04/REQ-34.2-11/REQ-34.2-12/REQ-34.2-14).
 *
 * Registers the 7 enrichment channels the game-details page and store
 * search container depend on, onto platformApi's own `ipcMain` recorder,
 * importing the REAL underlying bodies plans 34.2-01/34.2-03 already
 * extracted or wired unchanged (mirrors `gameDetailsFlowRegistration.ts`'s
 * own objective — prove the real logic runs behind the new transport, not a
 * reimplementation, so the Electron and Tauri builds cannot drift apart):
 *
 *   invoke (7, `ipcMain.handle`, all confirmed `addHandler` in their current
 *   Electron homes):
 *     - `getWikiGameInfo` -> `wiki_game_info/wiki_game_info.ts`'s
 *       `getWikiGameInfo(game, forceRefresh)`, `game` resolved via
 *       `backend/utils`'s `deps.managers.library[runner].getGame(appName)`
 *       (`wiki_game_info/ipc_handler.ts:5`)
 *     - (Phase 86, 86-12) `getAnticheatInfo` is now a native `info` channel.
 *     - `getKnownFixes` -> `backend/knownFixes.ts`'s
 *       `readKnownFixes(appName, runner)` (Plan 34.2-03 extraction;
 *       registered at `main.ts:1615` today)
 *     - `getGamelibFixStatus` -> `backend/knownFixes.ts`'s
 *       `readGamelibFixStatus(appName, runner)` (quick 261027-ch9; brand new,
 *       local + bundled layers only)
 *     - `getRunsForMeMap` / `setRunsForMe` -> `runsForMe/index.ts`'s
 *       `getRunsForMeMap()` / `setRunsForMeByUser(appName, runner, on)`
 *       (quick 261029-mkz; brand new, backend-persisted per-game override)
 *     - `getCrossoverIndex` -> `crossover_index/crossoverRatingMap.ts`'s
 *       `buildCrossoverRatingMap()` (Plan 34.2-03 extraction; registered at
 *       `crossover_index/ipc_handler.ts:47` today)
 *     - `searchStores` / `getStoreSearchDeals` / `getItadSteamGids`
 *       Phase 86 (86-16, D-17): these three are native `info` channels served by Rust now and are
 *       no longer registered here; the TS bodies (`backend/storeSearch`) were deleted in 86-17.
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails
 * 100% SILENTLY at runtime (Phase 31 Pitfall 2) — all seven registrations
 * below were cross-checked against their current homes' own `addHandler`
 * call for that exact channel before being written: every one of the seven
 * is INVOKE.
 *
 * `getWikiGameInfo` note: the `title` argument is accepted and INTENTIONALLY
 * IGNORED, exactly as `wiki_game_info/ipc_handler.ts:5` does today — the
 * game's real title is read off the resolved `Game` via `getGameInfo()`
 * inside `getWikiGameInfo` itself. This is not a bug in this registration;
 * it reproduces the existing Electron contract byte-for-byte.
 *
 * `getAnticheatInfo` (Phase 86, 86-12, D-17): served natively by the Rust `info` slice, so it is not
 * registered here. Its D-07 declaration rider (null for every Steam title on every platform, as the
 * lookup matches only an Epic namespace, and null for everything on Windows) now lives in
 * `gamelib-info`'s `anticheat.rs`. The `releasesInfoReady` listener stays in `bootstrap.ts` and is
 * deliberately NOT registered a second time here (a double registration double-fires the download).
 *
 * `searchStores` / `getStoreSearchDeals` / `getItadSteamGids` error
 * contract: this registration now IMPORTS the three shared handler bodies
 * from `storeSearch/handlers.ts` instead of hand-copying the try / `logError`
 * / `throw err` shape (Phase 34.2 Plan 13, closes code-review finding
 * WR-09 — before this, the shape existed in two hand-copied places with
 * nothing pinning them equal, so an Electron-side edit could silently
 * diverge on Tauri). A bare `async () => searchGames(query)` remains
 * explicitly wrong here — the rethrow is deliberate and load-bearing (Phase
 * 20 D-14): the frontend container is exclusively responsible for turning a
 * rejected promise into the "provider failed" state, and a swallowed error
 * would be indistinguishable from "no results".
 *
 * `getCrossoverIndex` D-10 note: this channel is exempted from the 60s
 * invoke bound in `src-tauri/src/main.rs`'s `LONG_RUNNING_CHANNELS` (Task 2
 * of this plan) because `buildCrossoverRatingMap()` fans out over every
 * game in every library manager AND calls `loadIndex`/`buildMaps`
 * (`crossover_index/index.ts:99`) once PER GAME rather than once overall —
 * hoisting that build out of the per-game loop is a recorded deferred
 * optimization (34.2-03-SUMMARY.md), not a fix this slice makes.
 *
 * Phase 86 (86-08, D-17): `removeRecent` is no longer registered here. It is a
 * native `info` channel served by Rust (`nativeChannels.json`), so it has exactly
 * one owner.
 *
 * Uses platformApi's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`/`addListener`) — `backend/ipc.ts` itself imports the real
 * `electron` module, and no file under `src/backend/sidecar/` may import
 * `electron`, `backend/ipc`, `../ipc`, `../launcher`, or `main_window`
 * DIRECTLY (enforced by `gameDetailsImportGate.test.ts`'s comment-stripped
 * gates). Transitive reach to `electron` is accounted for in
 * `sidecar/__tests__/electronReachLedger.test.ts`, the measured, enforced
 * set of electron-importing modules actually reachable from this slice's
 * four gated entry points. Every import below reaches an
 * UNDERLYING module (`../knownFixes`,
 * `../crossover_index/crossoverRatingMap`,
 * `../wiki_game_info/wiki_game_info`,
 * `../utils`) — NEVER a feature module's `ipc_handler.ts`.
 *
 * `wiki_game_info/stores` is already registered by
 * `createStores` (Phase 29) — this module needs no new store
 * plumbing for the `getWikiGameInfo` cache self-heal path.
 *
 * Deliberately does NOT wrap the invoke bodies in
 * try/catch: an invoke rejection travels back to the renderer as a
 * rejected promise, which is the existing Electron contract for every one
 * of these five channels.
 *
 * `itad.*` (2) — Phase 47 D-05/D-06: Phase 86 (86-16, D-17) moved `itad.getKeyStatus` and
 * `itad.setApiKey` to the native `info` slice (a `{ hasKey, rejected }` pair of booleans and the key
 * write over the Rust Keychain owner), so they are no longer registered here.
 *
 * Phase 86 (86-15, D-17): the five `steamgriddb.*` channels are no longer registered here. They
 * are native `info` channels served by Rust (`nativeChannels.json`), so each has exactly one owner.
 *
 * `getGogDiscounts` (1) — Phase 34.6 Plan 09, REQ-34.6-08: `discounts/fetchDiscounts.ts`'s
 * `getGogDiscounts(locale, hideOwned, wishlistOnly)` (Plan 34.6-09
 *     extraction out of `discounts/index.ts`'s previously-inline
 *     `addHandler` body — that file had no separate underlying module
 *     before this plan, exactly like every other feature ported into this
 *     registration module). NOTE this channel is NOT byte-equivalent in
 *     one respect the plan's own draft got wrong: `fetchDiscounts.ts`
 *     DOES reach `app.getVersion()` from `electron` (for the catalog
 *     request's User-Agent header) — this is unchanged behavior, ported
 *     verbatim, and is accounted for in `electronReachLedger.test.ts`.
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails
 * 100% SILENTLY at runtime (Phase 31 Pitfall 2) — all six registrations
 * below were cross-checked against their current homes' own `addHandler`
 * call for that exact channel before being written: every one of the six
 * is INVOKE.
 */

import type { AppRuntimeSlice } from 'backend/appRuntime'
import type { FrontendMessageDeps } from '../host/frontendMessage'
import type { AppInfo } from '../process/context'
import type { IpcRegistry } from './ipcRegistry'
import { getWikiGameInfo } from '../wiki_game_info/wiki_game_info'
import { readGamelibFixStatus, readKnownFixes } from '../knownFixes'
import { buildCrossoverRatingMap } from '../crossover_index/crossoverRatingMap'
import { getRunsForMeMap, setRunsForMeByUser } from '../runsForMe'
import { getGogDiscounts } from '../discounts/fetchDiscounts'
import { logWarning, LogPrefix } from '../logger'
import type { Runner } from 'common/types'
import type { ManagerDeps, StoreManagers, Stores } from 'backend/services/types'

/** Narrow slice (66.1 D-01): library managers for game lookup. */
export interface EnrichmentFlowDeps
  extends FrontendMessageDeps, AppRuntimeSlice<'events' | 'crossoverIndex'> {
  ipc: Pick<IpcRegistry, 'handle'>
  appInfo: Pick<AppInfo, 'version'>
  managers: Pick<StoreManagers, 'library'>
  stores: Pick<
    Stores,
    'kvs' | 'runsForMe' | 'wikiGameInfo' | 'crossoverIndex' | 'gog'
  >
  onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
  /** The boot-owned HowLongToBeat credentials cache (66.4-12). */
  infoCaches: Pick<ManagerDeps['infoCaches'], 'hltb'>
  /** The GOG credential cache and path roots the discounts handler reads (66.4-10). */
  gogRuntime: Pick<ManagerDeps['gogRuntime'], 'credentials'>
  paths: Pick<
    ManagerDeps['paths'],
    | 'appFolder'
    | 'toolsPath'
    | 'userData'
    | 'fixesPath'
    | 'bundledFixesPath'
    | 'localFixesPath'
  >
  /**
   * Always `undefined`: see `BootServices['itadSecrets']` (Phase 86 Plan 17). Inert; the foreign-dirty
   * `sidecar/handlers.ts` still passes it. OWED: delete with `miscRuntime` below and
   * `steamGridSecrets` once `handlers.ts` is clean.
   */
  itadSecrets?: undefined
  /** Inert: `handlers.ts` still passes the boot's misc runtime; nothing here reads it any more (86-17). */
  miscRuntime?: unknown
  /** Always `undefined`: see `BootServices['steamGridSecrets']` (Phase 86 Plan 15). */
  steamGridSecrets?: undefined
}
import type { CatalogLocaleSettings } from 'common/types/discounts'
import type { OnlineMonitor } from '../online_monitor'

const RUNS_FOR_ME_RUNNERS: readonly string[] = Object.freeze([
  'legendary',
  'gog',
  'sideload',
  'nile',
  'steam'
] as const)

/**
 * Registers the 7 enrichment channels. Called once from `handlers.ts`
 * — this module owns no side effects at import time beyond the imports
 * above; the caller decides when registration onto the handler registry
 * happens.
 */
export function registerEnrichmentFlows(deps: EnrichmentFlowDeps): void {
  // The `title` argument is accepted and intentionally IGNORED — see the
  // module docstring above. `getWikiGameInfo` re-derives the title off the
  // resolved `Game` itself.
  deps.ipc.handle(
    'getWikiGameInfo',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[1] as string
      const runner = args[2] as Runner
      const forceRefresh = (args[3] as boolean | null | undefined) ?? undefined
      const game = deps.managers.library[runner].getGame(appName)
      return getWikiGameInfo(
        {
          libraryManagers: deps.managers.library,
          stores: deps.stores,
          infoCaches: deps.infoCaches,
          appRuntime: deps.appRuntime
        },
        game,
        forceRefresh
      )
    }
  )

  // Phase 86 (86-12, D-17): `getAnticheatInfo` is a native `info` channel served by Rust from
  // `<appFolder>/areweanticheatyet.json`, so it is no longer registered here and has one owner. The
  // D-07 rider on it (null for Steam titles and for everything on Windows) now lives in Rust.

  deps.ipc.handle(
    'getKnownFixes',
    async (_event: unknown, ...args: unknown[]) =>
      readKnownFixes(deps, args[0] as string, args[1] as Runner)
  )

  // Quick 261027-ch9: GameLib row on the game page. Local + bundled only.
  deps.ipc.handle(
    'getGamelibFixStatus',
    async (_event: unknown, ...args: unknown[]) =>
      readGamelibFixStatus(deps, args[0] as string, args[1] as Runner)
  )

  // Quick 261029-mkz: per-game "Runs for me" override. Untrusted payload:
  // validated before any write (T-mkz-01).
  deps.ipc.handle('getRunsForMeMap', async () => getRunsForMeMap(deps))

  deps.ipc.handle(
    'setRunsForMe',
    async (_event: unknown, ...args: unknown[]) => {
      const payload = args[0] as
        | { appName?: unknown; runner?: unknown; on?: unknown }
        | null
        | undefined
      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof payload.appName !== 'string' ||
        payload.appName.length === 0 ||
        typeof payload.runner !== 'string' ||
        !RUNS_FOR_ME_RUNNERS.includes(payload.runner) ||
        typeof payload.on !== 'boolean'
      ) {
        logWarning(
          'setRunsForMe: rejected malformed payload (appName/runner/on)',
          LogPrefix.Backend
        )
        return getRunsForMeMap(deps)
      }
      return setRunsForMeByUser(
        deps,
        payload.appName,
        payload.runner as Runner,
        payload.on
      )
    }
  )

  // D-10: exempted from the 60s invoke bound in main.rs's
  // LONG_RUNNING_CHANNELS (Task 2) — fans out over every game in every
  // manager AND calls loadIndex/buildMaps per game. See module docstring.
  deps.ipc.handle('getCrossoverIndex', async () =>
    buildCrossoverRatingMap({
      libraryManagers: deps.managers.library,
      stores: deps.stores,
      appRuntime: deps.appRuntime
    })
  )

  // Phase 86 (86-16, D-17): the storeSearch trio (`searchStores`, `getStoreSearchDeals`,
  // `getItadSteamGids`) are native `info` channels served by Rust (`info_itad_search`,
  // `info_itad_deals`, `info_itad_gids`, `nativeChannels.json`), so they are no longer registered here.

  deps.ipc.handle(
    'getGogDiscounts',
    async (_event: unknown, ...args: unknown[]) =>
      getGogDiscounts(
        {
          stores: deps.stores,
          libraryManagers: deps.managers.library,
          appInfo: deps.appInfo,
          onlineMonitor: deps.onlineMonitor,
          gogRuntime: deps.gogRuntime,
          paths: deps.paths
        },
        args[0] as CatalogLocaleSettings,
        (args[1] as boolean | null | undefined) ?? undefined,
        (args[2] as boolean | null | undefined) ?? undefined
      )
  )

  // Phase 86 (86-16, D-17): `itad.getKeyStatus` and `itad.setApiKey` are native `info` channels served
  // by Rust over the Keychain owner (`info_itad_key_status`, `info_itad_set_key`), so they are no
  // longer registered here. `deps.itadSecrets` and `deps.miscRuntime` are left on `EnrichmentFlowDeps` as
  // inert optionals only because the foreign-dirty `handlers.ts` still passes them (owed cleanup).
}
