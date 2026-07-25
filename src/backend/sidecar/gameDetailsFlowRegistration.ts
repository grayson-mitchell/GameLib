/**
 * Curated game-details/settings channel registration (Phase 34.2 Plan 04,
 * D-01/D-03/D-04, REQ-34.2-01/REQ-34.2-03/REQ-34.2-08/REQ-34.2-09/
 * REQ-34.2-10/REQ-34.2-14).
 *
 * Registers the 15 invoke-kind per-game channels the game-details page and
 * its settings/override affordances depend on, onto electronStub's
 * `ipcMain` recorder, importing the REAL `backend/gamedetails/dispatch.ts`
 * bodies plan 34.2-02 extracted unchanged (mirrors `appShellFlowRegistration.ts`'s
 * / `downloadQueueFlowRegistration.ts`'s own objective — prove the real logic
 * runs behind the new transport, not a reimplementation, so the Electron and
 * Tauri builds cannot drift apart):
 *
 *   invoke (15, `ipcMain.handle`):
 *     - `getGameInfo` -> `gamedetails/dispatch` (`main.ts:821-823`)
 *     - `getExtraInfo` -> `gamedetails/dispatch` (`main.ts:832-834`)
 *     - `getGameSettings` -> `gamedetails/dispatch` (`main.ts:836-838`)
 *     - `isGameAvailable` -> `gamedetails/dispatch` (`main.ts:819`) — takes a
 *       single `{appName, runner}` OBJECT argument, not positional args
 *     - `getLaunchOptions` -> `gamedetails/dispatch` (`main.ts:1259-1261`)
 *     - `kill` -> `gamedetails/dispatch` (`main.ts:1247`)
 *     - `repair` -> `gamedetails/dispatch` (`main.ts:1110`) — INVOKE despite
 *       feeling fire-and-forget
 *     - `changeInstallPath` -> `gamedetails/dispatch` (`main.ts:1249`) —
 *       takes a single `{appName, path, runner}` OBJECT argument
 *     - `readConfig` -> `gamedetails/dispatch` (`main.ts:977`)
 *     - `getGameOverride` -> `gamedetails/dispatch` (`main.ts:778`)
 *     - `getGameSdl` -> `gamedetails/dispatch` (`main.ts:779`)
 *     - `getAvailableCyberpunkMods` -> `gamedetails/dispatch` (`main.ts:1517-1519`)
 *     - `setCyberpunkModConfig` -> `gamedetails/dispatch` (`main.ts:1520-1522`) —
 *       INVOKE despite feeling fire-and-forget
 *     - `getGameMetadataOverride` -> `game_overrides`'s `getGameOverrides`,
 *       an already-clean pass-through, never extracted (`main.ts:1449-1451`)
 *     - `getAllGameOverrides` -> `game_overrides`'s `getAllGameOverrides`,
 *       an already-clean pass-through, never extracted (`main.ts:1453-1455`)
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails
 * 100% SILENTLY at runtime (Phase 31 Pitfall 2) — every registration below
 * was cross-checked against `main.ts`'s own `addHandler`/`addListener` call
 * for that exact channel before being written. `repair` and
 * `setCyberpunkModConfig` are both `addHandler` in `main.ts` (INVOKE)
 * despite feeling fire-and-forget — do not "correct" them to `ipcMain.on`.
 *
 * Deliberately does NOT register:
 *   - The 3 send-kind channels (`setGameMetadataOverride`,
 *     `changeGameVersionPinnedStatus`, `addNewApp`) — plan 34.2-05 owns
 *     these, added to this same file as a follow-on registration function.
 *   - The 8 enrichment channels (`getKnownFixes`, `getCrossoverIndex`,
 *     `getWikiGameInfo`, `getAnticheatInfo`, `searchStores`,
 *     `getStoreSearchDeals`, `getStoreSearchStoreMap`, `removeRecent`) —
 *     plan 34.2-06's own `enrichmentFlowRegistration.ts`.
 *   - `requestGameSettings` — already registered by
 *     `settingsFlowRegistration.ts:113` with a Steam bottle-launch fix that
 *     `getGameSettings` does not have (D-09): registering it again here
 *     would double-register the channel AND reverse a deliberate decision.
 *     `getGameSettings` and `requestGameSettings` are near-duplicates by
 *     Electron's own design; deduping them is a recorded Phase 35 cutover
 *     cleanup, not this slice's work.
 *
 * Uses electronStub's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`/`addListener`) — `backend/ipc.ts` itself imports the real
 * `electron` module, and no file under `src/backend/sidecar/` may import it
 * either directly or transitively.
 *
 * D-01 declaration rider: for the Steam runner, `repair`, `changeInstallPath`,
 * `getLaunchOptions` and `changeGameVersionPinnedStatus` reach upstream
 * stubs in Electron ALREADY: `SteamGame.repair()` logs "SteamGame.repair not
 * implemented until Phase 2" (`storeManagers/steam/games.ts:1610`), and
 * `SteamLibrary.changeGameInstallPath` (`library.ts:790`),
 * `changeVersionPinnedStatus` (`library.ts:797`) and `getLaunchOptions`
 * (`library.ts:907`) are underscore-arg no-ops. Registering them here is
 * correct — porting the real (stubbed) behavior faithfully — but a later
 * reader must not take it for "repair works for Steam games".
 */

import { ipcMain } from './electronStub'
import {
  getGameInfo,
  getExtraInfo,
  getGameSettings,
  isGameAvailable,
  getLaunchOptions,
  kill,
  repair,
  changeInstallPath,
  readConfig,
  getGameOverride,
  getGameSdl,
  getAvailableCyberpunkMods,
  setCyberpunkModConfig
} from '../gamedetails/dispatch'
import {
  getGameOverrides,
  getAllGameOverrides
} from '../game_overrides'
import type { MoveGameArgs, Runner } from 'common/types'

/**
 * Registers the 15 invoke-kind game-details/settings/override channels.
 * Called once from `handlers.ts` — this module owns no side effects at
 * import time beyond the imports above; the caller decides when
 * registration onto the handler registry happens.
 */
export function registerGameDetailsFlows(): void {
  ipcMain.handle(
    'getGameInfo',
    async (_event: unknown, ...args: unknown[]) =>
      getGameInfo(args[0] as string, args[1] as Runner)
  )

  ipcMain.handle(
    'getExtraInfo',
    async (_event: unknown, ...args: unknown[]) =>
      getExtraInfo(args[0] as string, args[1] as Runner)
  )

  ipcMain.handle(
    'getGameSettings',
    async (_event: unknown, ...args: unknown[]) =>
      getGameSettings(args[0] as string, args[1] as Runner)
  )

  // Single {appName, runner} OBJECT argument, not positional args.
  ipcMain.handle(
    'isGameAvailable',
    async (_event: unknown, ...args: unknown[]) =>
      isGameAvailable(args[0] as { appName: string; runner: Runner })
  )

  ipcMain.handle(
    'getLaunchOptions',
    async (_event: unknown, ...args: unknown[]) =>
      getLaunchOptions(args[0] as string, args[1] as Runner)
  )

  ipcMain.handle(
    'kill',
    async (_event: unknown, ...args: unknown[]) =>
      kill(args[0] as string, args[1] as Runner)
  )

  // INVOKE despite feeling fire-and-forget — main.ts:1110 is addHandler.
  ipcMain.handle(
    'repair',
    async (_event: unknown, ...args: unknown[]) =>
      repair(args[0] as string, args[1] as Runner)
  )

  // Single {appName, path, runner} OBJECT argument, not positional args.
  ipcMain.handle(
    'changeInstallPath',
    async (_event: unknown, ...args: unknown[]) =>
      changeInstallPath(args[0] as MoveGameArgs)
  )

  ipcMain.handle(
    'readConfig',
    async (_event: unknown, ...args: unknown[]) =>
      readConfig(args[0] as 'library' | 'user')
  )

  ipcMain.handle('getGameOverride', async () => getGameOverride())

  ipcMain.handle(
    'getGameSdl',
    async (_event: unknown, ...args: unknown[]) =>
      getGameSdl(args[0] as string)
  )

  ipcMain.handle('getAvailableCyberpunkMods', async () =>
    getAvailableCyberpunkMods()
  )

  // INVOKE despite feeling fire-and-forget — main.ts:1520 is addHandler.
  ipcMain.handle(
    'setCyberpunkModConfig',
    async (_event: unknown, ...args: unknown[]) =>
      setCyberpunkModConfig(
        args[0] as { enabled: boolean; modsToLoad: string[] }
      )
  )

  // Already-clean pass-through to game_overrides/index.ts, never extracted
  // into gamedetails/dispatch.ts (main.ts:1449-1451).
  ipcMain.handle(
    'getGameMetadataOverride',
    async (_event: unknown, ...args: unknown[]) =>
      getGameOverrides(args[0] as string)
  )

  // Already-clean pass-through to game_overrides/index.ts, never extracted
  // into gamedetails/dispatch.ts (main.ts:1453-1455).
  ipcMain.handle('getAllGameOverrides', async () => getAllGameOverrides())
}
