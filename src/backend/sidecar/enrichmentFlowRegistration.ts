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
 *   invoke (`ipcMain.handle`, all confirmed `addHandler` in their current
 *   Electron homes):
 *     - (Phase 86, 86-22) `getWikiGameInfo` is now a native `info` channel.
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
 *     - `getCrossoverIndex` -> `info/crossover.ts`'s `getCrossoverIndex(deps)` (Phase 86, 86-19, D-24: a
 *       resolver that gathers every library manager's games and makes the one `info_crossover_rating_map`
 *       call; the index, its cache and the three-state map are Rust)
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
 * `getWikiGameInfo` (Phase 86, 86-22, D-17, D-23): served natively by the Rust `info` slice. The TS read
 * the title off the resolved `Game` and ignored the renderer's; Rust uses the renderer's own (the two
 * are the same text for every game the renderer shows).
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
 * `getCrossoverIndex` D-10 note: this channel stays exempt from the 60s invoke bound in `src-tauri/src/main.rs`'s
 * `LONG_RUNNING_CHANNELS`: the resolver enumerates every game in every library manager, and the first call after a
 * stale cache fetches the index. Phase 86 (86-19) moved the index fetch, the lookups and the rating map to Rust
 * (`gamelib-info` `crossover`), which loads the index once per call and memoizes its lookup maps; the TS
 * `crossover_index/` module stays only for the TS wiki that still reads it, and goes with it (86-24).
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
 * `../info/crossover`,
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
 * `getGogDiscounts` (1) — Phase 34.6 Plan 09, REQ-34.6-08. Phase 86 (86-18) moved the catalog fetch to
 * Rust (`info_gog_discounts`, `gamelib-info` `discounts`). The channel stays registered here (D-24)
 * because its one TS-only input, the GOG access token, needs the `gogdl` child process: the handler
 * forwards to the resolver `info/discounts.ts` `getGogDiscounts(deps, locale, hideOwned, wishlistOnly)`,
 * which reads the token and makes the one Rust call. Scheduled for deletion with phase 92's GOG auth.
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails
 * 100% SILENTLY at runtime (Phase 31 Pitfall 2) — all six registrations
 * below were cross-checked against their current homes' own `addHandler`
 * call for that exact channel before being written: every one of the six
 * is INVOKE.
 */

import type { AppRuntimeSlice } from 'backend/appRuntime'
import type { MiscRuntimeSlice } from 'backend/miscRuntime'
import type { FrontendMessageDeps } from '../host/frontendMessage'
import type { AppInfo } from '../process/context'
import type { IpcRegistry } from './ipcRegistry'
import { readGamelibFixStatus, readKnownFixes } from '../knownFixes'
import { getCrossoverIndex } from '../info/crossover'
import { getRunsForMeMap, setRunsForMeByUser } from '../runsForMe'
import { getGogDiscounts } from '../info/discounts'
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
  /**
   * The boot's misc runtime. Only its `requestRustInvoke` is read, for the GOG discounts resolver
   * (86-18): `handlers.ts` (foreign-dirty then) passed this bundle and no other member holds the
   * transport. OWED: pass `requestRustInvoke` directly and drop this with the two inert fields above.
   */
  miscRuntime: MiscRuntimeSlice<'requestRustInvoke'>['miscRuntime']
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
 * Registers the 6 enrichment channels. Called once from `handlers.ts`
 * — this module owns no side effects at import time beyond the imports
 * above; the caller decides when registration onto the handler registry
 * happens.
 */
export function registerEnrichmentFlows(deps: EnrichmentFlowDeps): void {
  // Phase 86 (86-22, D-17): `getWikiGameInfo` is a native `info` channel served by Rust
  // (`info_wiki_get`, `nativeChannels.json`), so it is no longer registered here and has one owner. The
  // TS `wiki_game_info.ts` stays only for the non-Steam shortcut resolver and `clearCache` until 86-23/24.

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

  // D-10: stays in main.rs's LONG_RUNNING_CHANNELS (its resolver still enumerates every library
  // manager, and the first call after a stale cache may fetch the index). Phase 86 (86-19, D-24): the
  // rating map is Rust's (`info_crossover_rating_map`); this forwards to the resolver
  // `info/crossover.ts` `getCrossoverIndex`, which only gathers the games. See module docstring.
  deps.ipc.handle('getCrossoverIndex', async () =>
    getCrossoverIndex({
      libraryManagers: deps.managers.library,
      requestRustInvoke: deps.miscRuntime.requestRustInvoke
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
          paths: deps.paths,
          requestRustInvoke: deps.miscRuntime.requestRustInvoke
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
