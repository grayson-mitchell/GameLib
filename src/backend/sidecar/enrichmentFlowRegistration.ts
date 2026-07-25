/**
 * Curated enrichment-channel registration (Phase 34.2 Plan 06, D-04/D-07/
 * D-10, REQ-34.2-04/REQ-34.2-11/REQ-34.2-12/REQ-34.2-14).
 *
 * Registers the eight enrichment channels the game-details page and store
 * search container depend on, onto electronStub's own `ipcMain` recorder,
 * importing the REAL underlying bodies plans 34.2-01/34.2-03 already
 * extracted or wired unchanged (mirrors `gameDetailsFlowRegistration.ts`'s
 * own objective — prove the real logic runs behind the new transport, not a
 * reimplementation, so the Electron and Tauri builds cannot drift apart):
 *
 *   invoke (8, `ipcMain.handle`, all confirmed `addHandler` in their current
 *   Electron homes):
 *     - `getWikiGameInfo` -> `wiki_game_info/wiki_game_info.ts`'s
 *       `getWikiGameInfo(game, forceRefresh)`, `game` resolved via
 *       `backend/utils`'s `getGame(appName, runner)`
 *       (`wiki_game_info/ipc_handler.ts:5`)
 *     - `getAnticheatInfo` -> `anticheat/utils.ts`'s
 *       `gameAnticheatInfo(appNamespace)` (`anticheat/ipc_handler.ts:8`)
 *     - `getKnownFixes` -> `backend/knownFixes.ts`'s
 *       `readKnownFixes(appName, runner)` (Plan 34.2-03 extraction;
 *       registered at `main.ts:1615` today)
 *     - `getCrossoverIndex` -> `crossover_index/crossoverRatingMap.ts`'s
 *       `buildCrossoverRatingMap()` (Plan 34.2-03 extraction; registered at
 *       `crossover_index/ipc_handler.ts:47` today)
 *     - `searchStores` / `getStoreSearchDeals` / `getStoreSearchStoreMap` ->
 *       `storeSearch/handlers.ts`'s `handleSearchStores(query)` /
 *       `handleGetStoreSearchDeals(gameId)` / `handleGetStoreSearchStoreMap()`
 *       (Plan 34.2-13 extraction; imported the same way by
 *       `storeSearch/index.ts` on the Electron side)
 *     - `removeRecent` -> `recent_games/recent_games.ts`'s
 *       `removeRecentGame(appName)` (`recent_games/ipc_handler.ts:4`)
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails
 * 100% SILENTLY at runtime (Phase 31 Pitfall 2) — all eight registrations
 * below were cross-checked against their current homes' own `addHandler`
 * call for that exact channel before being written: every one of the eight
 * is INVOKE.
 *
 * `getWikiGameInfo` note: the `title` argument is accepted and INTENTIONALLY
 * IGNORED, exactly as `wiki_game_info/ipc_handler.ts:5` does today — the
 * game's real title is read off the resolved `Game` via `getGameInfo()`
 * inside `getWikiGameInfo` itself. This is not a bug in this registration;
 * it reproduces the existing Electron contract byte-for-byte.
 *
 * `getAnticheatInfo` D-07 declaration rider: even fully primed by plan
 * 34.2-01's bootstrap wiring (which re-homed `fetchLastestReleases()` and
 * the `releasesInfoReady` -> `downloadAntiCheatData` listener into
 * `bootstrap.ts`), `gameAnticheatInfo` returns `null` for EVERY Steam title
 * on EVERY platform — it matches exclusively on `info.storeIds.epic?.namespace`
 * (`anticheat/utils.ts:76`), and Steam games have no Epic namespace to match
 * against — and returns `null` for EVERYTHING on Windows regardless of
 * namespace (`anticheat/utils.ts:70`'s `isWindows` early-return). "Ported
 * and primed" must not be read as "anticheat badges appear for Steam games
 * on any platform, or for anything at all on Windows". The `releasesInfoReady`
 * listener is deliberately NOT registered a second time here: plan 34.2-01
 * already re-homed it into `bootstrap.ts` because `anticheat/ipc_handler.ts`
 * itself cannot be imported (it calls `addHandler`, which imports the real
 * `electron`) — registering it again here would double-fire
 * `downloadAntiCheatData` per `releasesInfoReady` event.
 *
 * `searchStores` / `getStoreSearchDeals` / `getStoreSearchStoreMap` error
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
 * `removeRecent` imports ONLY `removeRecentGame` from
 * `recent_games/recent_games.ts` — that module's single `export {}`
 * statement also names `getRecentGames`, `addRecentGame` and
 * `maxRecentGames`, none of which this channel needs (curated-import
 * discipline, D-04).
 *
 * Uses electronStub's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`/`addListener`) — `backend/ipc.ts` itself imports the real
 * `electron` module, and no file under `src/backend/sidecar/` may import
 * `electron`, `backend/ipc`, `../ipc`, `../launcher`, or `main_window`
 * DIRECTLY (enforced by `gameDetailsImportGate.test.ts`'s comment-stripped
 * gates). Transitive reach to `electron` DOES exist here and is EXPECTED --
 * this file's own `import { ... } from '../storeSearch/handlers'` below
 * reaches `handlers.ts`'s own import of `cheapshark.ts`, which itself
 * `import { app } from 'electron'` -- and is safe at runtime because
 * `electronStub`'s `Module._load` interception rewrites every
 * `require('electron')` inside the sidecar process. See
 * `sidecar/__tests__/electronReachLedger.test.ts` for the measured, enforced
 * set of electron-importing modules actually reachable from this slice's
 * four gated entry points. Every import below reaches an
 * UNDERLYING module (`anticheat/utils`, `../knownFixes`,
 * `../crossover_index/crossoverRatingMap`, `../storeSearch/handlers`,
 * `../recent_games/recent_games`, `../wiki_game_info/wiki_game_info`,
 * `../utils`) — NEVER a feature module's `ipc_handler.ts` and NEVER
 * `storeSearch/index.ts` (which itself calls `addHandler`).
 * `storeSearch/handlers.ts` is the correct import target precisely because
 * it contains no `addHandler` call of its own — the same
 * underlying-module-not-`ipc_handler` rule D-04 already states, applied to
 * the last duplicated surface (Phase 34.2 Plan 13, WR-09).
 *
 * `wiki_game_info/electronStore` is already registered by
 * `storeRegistration.ts:104` (Phase 29) — this module needs no new store
 * plumbing for the `getWikiGameInfo` cache self-heal path.
 *
 * Deliberately does NOT wrap the non-storeSearch invoke bodies in
 * try/catch: an invoke rejection travels back to the renderer as a
 * rejected promise, which is the existing Electron contract for every one
 * of these five channels.
 */

import { ipcMain } from './electronStub'
import { getGame } from '../utils'
import { getWikiGameInfo } from '../wiki_game_info/wiki_game_info'
import { gameAnticheatInfo } from '../anticheat/utils'
import { readKnownFixes } from '../knownFixes'
import { buildCrossoverRatingMap } from '../crossover_index/crossoverRatingMap'
import {
  handleSearchStores,
  handleGetStoreSearchDeals,
  handleGetStoreSearchStoreMap
} from '../storeSearch/handlers'
import { removeRecentGame } from '../recent_games/recent_games'
import type { Runner } from 'common/types'

/**
 * Registers the eight enrichment channels. Called once from `handlers.ts`
 * — this module owns no side effects at import time beyond the imports
 * above; the caller decides when registration onto the handler registry
 * happens.
 */
export function registerEnrichmentFlows(): void {
  // The `title` argument is accepted and intentionally IGNORED — see the
  // module docstring above. `getWikiGameInfo` re-derives the title off the
  // resolved `Game` itself.
  ipcMain.handle(
    'getWikiGameInfo',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[1] as string
      const runner = args[2] as Runner
      const forceRefresh = args[3] as boolean | undefined
      const game = getGame(appName, runner)
      return getWikiGameInfo(game, forceRefresh)
    }
  )

  // D-07 rider: returns null for every Steam title on every platform
  // (matches only on `info.storeIds.epic?.namespace`) and null for
  // everything on Windows (`isWindows` early-return) — see module
  // docstring. `releasesInfoReady` is NOT registered here; it lives in
  // `bootstrap.ts` (plan 34.2-01).
  ipcMain.handle(
    'getAnticheatInfo',
    async (_event: unknown, ...args: unknown[]) =>
      gameAnticheatInfo(args[0] as string)
  )

  ipcMain.handle(
    'getKnownFixes',
    async (_event: unknown, ...args: unknown[]) =>
      readKnownFixes(args[0] as string, args[1] as Runner)
  )

  // D-10: exempted from the 60s invoke bound in main.rs's
  // LONG_RUNNING_CHANNELS (Task 2) — fans out over every game in every
  // manager AND calls loadIndex/buildMaps per game. See module docstring.
  ipcMain.handle('getCrossoverIndex', async () => buildCrossoverRatingMap())

  // storeSearch trio — delegates to the shared bodies in
  // storeSearch/handlers.ts (Phase 34.2 Plan 13, closes WR-09), which carry
  // the Phase 20 D-14 try/log/RETHROW contract. A bare pass-through would
  // silently change the error-propagation contract the frontend depends on.
  ipcMain.handle(
    'searchStores',
    async (_event: unknown, ...args: unknown[]) =>
      handleSearchStores(args[0] as string)
  )

  ipcMain.handle(
    'getStoreSearchDeals',
    async (_event: unknown, ...args: unknown[]) =>
      handleGetStoreSearchDeals(args[0] as string)
  )

  ipcMain.handle('getStoreSearchStoreMap', async () =>
    handleGetStoreSearchStoreMap()
  )

  // Imports ONLY removeRecentGame from recent_games.ts — not
  // getRecentGames/addRecentGame/maxRecentGames (curated-import
  // discipline, D-04).
  ipcMain.handle(
    'removeRecent',
    async (_event: unknown, ...args: unknown[]) =>
      removeRecentGame(args[0] as string)
  )
}
