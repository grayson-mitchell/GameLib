/**
 * Curated enrichment-channel registration (Phase 34.2 Plan 06, D-04/D-07/
 * D-10, REQ-34.2-04/REQ-34.2-11/REQ-34.2-12/REQ-34.2-14).
 *
 * Registers the 11 enrichment channels the game-details page and store
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
 *     - `searchStores` / `getStoreSearchDeals` / `getItadSteamGids` ->
 *       `storeSearch/handlers.ts`'s `handleSearchStores(query, country)` /
 *       `handleGetStoreSearchDeals(gameId, country)` /
 *       `handleGetItadSteamGids(appIds)`
 *       (Plan 34.2-13 extraction; imported the same way by
 *       `storeSearch/index.ts` on the Electron side)
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
 * gates). Transitive reach to `electron` DOES exist here and is EXPECTED --
 * this file's own `import { ... } from '../storeSearch/handlers'` below
 * reaches `handlers.ts`'s own import of `cheapshark.ts`, which itself
 * `import { app } from 'electron'`. See
 * `sidecar/__tests__/electronReachLedger.test.ts` for the measured, enforced
 * set of electron-importing modules actually reachable from this slice's
 * four gated entry points. Every import below reaches an
 * UNDERLYING module (`../knownFixes`,
 * `../crossover_index/crossoverRatingMap`, `../storeSearch/handlers`,
 * `../wiki_game_info/wiki_game_info`,
 * `../utils`) — NEVER a feature module's `ipc_handler.ts` and NEVER
 * `storeSearch/index.ts` (which itself calls `addHandler`).
 * `storeSearch/handlers.ts` is the correct import target precisely because
 * it contains no `addHandler` call of its own — the same
 * underlying-module-not-`ipc_handler` rule D-04 already states, applied to
 * the last duplicated surface (Phase 34.2 Plan 13, WR-09).
 *
 * `wiki_game_info/stores` is already registered by
 * `createStores` (Phase 29) — this module needs no new store
 * plumbing for the `getWikiGameInfo` cache self-heal path.
 *
 * Deliberately does NOT wrap the non-storeSearch invoke bodies in
 * try/catch: an invoke rejection travels back to the renderer as a
 * rejected promise, which is the existing Electron contract for every one
 * of these five channels.
 *
 * `itad.*` (2) — Phase 47 D-05/D-06: `itad.getKeyStatus` returns `{ hasKey, rejected }` booleans
 * only, `itad.setApiKey` saves or clears the optional user key through `deps.itadSecrets`. The
 * key value never leaves the sidecar; the adapter (`storeSearch/itad.ts`) reads the same owner
 * through `deps` for its user > env > baked key precedence.
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

import type { MiscRuntimeSlice } from '../miscRuntime'
import type { AppRuntimeSlice } from 'backend/appRuntime'
import type { FrontendMessageDeps } from '../host/frontendMessage'
import type { AppInfo } from '../process/context'
import type { IpcRegistry } from './ipcRegistry'
import { getWikiGameInfo } from '../wiki_game_info/wiki_game_info'
import { readGamelibFixStatus, readKnownFixes } from '../knownFixes'
import { buildCrossoverRatingMap } from '../crossover_index/crossoverRatingMap'
import {
  handleGetStoreSearchDeals,
  handleGetItadSteamGids
} from '../storeSearch/handlers'
import { getRunsForMeMap, setRunsForMeByUser } from '../runsForMe'
import type { ItadSecrets } from '../storeSearch/itadSecrets'
import { getGogDiscounts } from '../discounts/fetchDiscounts'
import { logWarning, LogPrefix } from '../logger'
import type { Runner } from 'common/types'
import type { ManagerDeps, StoreManagers, Stores } from 'backend/services/types'

/** Narrow slice (66.1 D-01): library managers for game lookup. */
export interface EnrichmentFlowDeps
  extends
    FrontendMessageDeps,
    AppRuntimeSlice<'events' | 'crossoverIndex'>,
    MiscRuntimeSlice<'itadGate'> {
  ipc: Pick<IpcRegistry, 'handle'>
  appInfo: Pick<AppInfo, 'version'>
  managers: Pick<StoreManagers, 'library'>
  stores: Pick<
    Stores,
    | 'kvs'
    | 'runsForMe'
    | 'wikiGameInfo'
    | 'crossoverIndex'
    | 'gog'
    | 'storeSearch'
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
  /** The optional ITAD user-key owner (Phase 47 D-05); the key never leaves the sidecar. */
  itadSecrets: ItadSecrets
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
 * Registers the 11 enrichment channels. Called once from `handlers.ts`
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

  // storeSearch trio — `searchStores` has moved to Rust (86-16); the other two delegate to the
  // shared bodies in storeSearch/handlers.ts (Phase 34.2 Plan 13, closes WR-09), which carry the
  // Phase 20 D-14 try/log/RETHROW contract. A bare pass-through would silently change the
  // error-propagation contract the frontend depends on.
  // Phase 86 (86-16, D-17): `searchStores` is a native `info` channel served by Rust
  // (`info_itad_search`, `nativeChannels.json`), so it is no longer registered here.

  deps.ipc.handle(
    'getStoreSearchDeals',
    async (_event: unknown, ...args: unknown[]) =>
      handleGetStoreSearchDeals(
        deps,
        args[0] as string,
        args[1] as string | null | undefined
      )
  )

  deps.ipc.handle(
    'getItadSteamGids',
    async (_event: unknown, ...args: unknown[]) =>
      handleGetItadSteamGids(deps, args[0] as string[])
  )

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

  // ── itad.* (2) — the optional user key (Phase 47 D-05, D-06). The renderer gets two booleans,
  // never the key (T-47-41); the adapter reads the same owner through `deps` for key precedence.

  deps.ipc.handle('itad.getKeyStatus', async () => ({
    hasKey: !!(await deps.itadSecrets.getApiKey()),
    rejected: deps.itadSecrets.isRejected()
  }))

  deps.ipc.handle(
    'itad.setApiKey',
    async (_event: unknown, ...args: unknown[]) => {
      // Same WR-01 boundary guard as steamgriddb.setApiKey: a cast is not a check (T-47-42).
      const key = args[0]
      if (typeof key !== 'string') {
        logWarning(
          'itad.setApiKey: ignored a non-string key',
          LogPrefix.Backend
        )
        return
      }
      await deps.itadSecrets.setApiKey(key)
    }
  )
}
