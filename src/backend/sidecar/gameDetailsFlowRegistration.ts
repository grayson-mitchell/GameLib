/**
 * Curated game-details/settings channel registration (Phase 34.2 Plans 04
 * and 05, D-01/D-03/D-04/D-08, REQ-34.2-01/REQ-34.2-03/REQ-34.2-08/
 * REQ-34.2-09/REQ-34.2-10/REQ-34.2-14).
 *
 * Registers the 19 game-details/settings/override channels (16 invoke + 3
 * send) the game-details page and its settings/override affordances depend
 * on, onto electronStub's `ipcMain` recorder, importing the REAL
 * `backend/gamedetails/dispatch.ts`/`backend/gamedetails/overrides.ts`
 * bodies plans 34.2-02/34.2-05 extracted unchanged (mirrors
 * `appShellFlowRegistration.ts`'s / `downloadQueueFlowRegistration.ts`'s own
 * objective — prove the real logic runs behind the new transport, not a
 * reimplementation, so the Electron and Tauri builds cannot drift apart):
 *
 *   invoke (16, `ipcMain.handle`):
 *     - `getInstallInfo` -> `gamedetails/dispatch` (`main.ts:842`) — arrived
 *       LATE (F-34.5-G6-10, plan 34.5-43): it is a real preload channel that
 *       was registered ONLY on the Electron side until this port. Its 4th
 *       and 5th positional args are build then branch, per
 *       `frontend/helpers/index.ts:88` and `main.ts:844`
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
 *   send (3, `ipcMain.on`, Plan 05):
 *     - `setGameMetadataOverride` -> `gamedetails/overrides` (`main.ts:1445-1447`)
 *     - `changeGameVersionPinnedStatus` -> `gamedetails/dispatch`
 *       (`main.ts:1524-1526`) — takes THREE POSITIONAL arguments (`appName`,
 *       `runner`, `status`), unlike the other two send channels here
 *     - `addNewApp` -> `gamedetails/dispatch` (`main.ts:1443`)
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails
 * 100% SILENTLY at runtime (Phase 31 Pitfall 2) — every registration below
 * was cross-checked against `main.ts`'s own `addHandler`/`addListener` call
 * for that exact channel before being written. `repair` and
 * `setCyberpunkModConfig` are both `addHandler` in `main.ts` (INVOKE)
 * despite feeling fire-and-forget — do not "correct" them to `ipcMain.on`.
 * The 3 send channels above were each opened at their cited `main.ts` line
 * and confirmed to be `addListener`, never `addHandler`, before being
 * written: getting the kind wrong here produces NO runtime signal at all —
 * no reject, no timeout, no `UNPORTED_CHANNEL_MARKER`, no log line (this
 * project's own G-30-01 `logoutSteam` failure class).
 *
 * Every `send`-kind body below is wrapped in `try`/`catch` ->
 * `logSendFailure` (copied from `appShellFlowRegistration.ts`'s own
 * `logSendFailure` helper) — an unhandled throw/rejection from a
 * fire-and-forget listener crashes the sidecar process. `sidecar/
 * processGuards.ts` (Phase 34.2 Plan 09) now installs a process-level
 * `unhandledRejection` guard, but that is defence-in-depth only — it does
 * not replace this try/catch-at-the-body discipline (the
 * `sidecar-dialog-reject-crashes` precedent). `setMetadataChangedNotifier`
 * is installed, wrapped the same way, once at the TOP of
 * `registerGameDetailsFlows()` — before any of the 3 `ipcMain.on`
 * registrations — so no send can ever fire against the default no-op
 * installed by `gamedetails/overrides.ts`. The installed notifier pushes
 * over the EXISTING generic frontend-message relay
 * (`./sidecarRpc`'s `pushFrontendMessage`, the same function
 * `storeWriteHandlers.ts`'s D-06 `STORE_CHANGED_CHANNEL` push and Phase
 * 34.1's `languageChanged` push both ride) — zero new Rust arms, exactly the
 * Phase 29 `storeChanged` precedent this plan's own interfaces required.
 *
 * Deliberately does NOT register:
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
import { pushFrontendMessage } from './sidecarRpc'
import {
  getGameInfo,
  getExtraInfo,
  getGameSettings,
  getInstallInfo,
  isGameAvailable,
  getLaunchOptions,
  kill,
  repair,
  changeInstallPath,
  readConfig,
  getGameOverride,
  getGameSdl,
  getAvailableCyberpunkMods,
  setCyberpunkModConfig,
  changeGameVersionPinnedStatus,
  addNewApp
} from '../gamedetails/dispatch'
import {
  setGameMetadataOverride,
  setMetadataChangedNotifier
} from '../gamedetails/overrides'
import {
  getGameOverrides,
  getAllGameOverrides
} from '../game_overrides'
import type {
  MoveGameArgs,
  GameInfo,
  InstallPlatform,
  Runner
} from 'common/types'

function logSendFailure(channel: string, error: unknown): void {
  console.warn(
    `[gameDetailsFlowRegistration] ${channel} failed:`,
    error instanceof Error ? error.message : String(error)
  )
}

/**
 * Registers the 19 game-details/settings/override channels (16 invoke + 3
 * send). Called once from `handlers.ts` — this module owns no side effects
 * at import time beyond the imports above; the caller decides when
 * registration onto the handler registry happens.
 */
export function registerGameDetailsFlows(): void {
  // Installed FIRST, before any of the 3 send registrations below, so no
  // send can ever fire against gamedetails/overrides.ts's default no-op
  // notifier. Rides the existing generic frontend-message relay
  // (sidecarRpc's pushFrontendMessage) — zero new Rust arms.
  setMetadataChangedNotifier((overrides) => {
    try {
      pushFrontendMessage('metadataChanged', overrides)
    } catch (error) {
      logSendFailure('metadataChanged', error)
    }
  })

  // ── invoke (15) ───────────────────────────────────────────────────────

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

  // F-34.5-G6-10 (34.5-43): late-discovered channel, absent from every
  // inventory bucket until this port. `ipc.ts`'s declared parameter NAMES
  // for positions 4/5 used to read (branch?, build?) -- that was WRONG
  // relative to both real ends and has been corrected in this same plan to
  // (build?, branch?). args[3] is BUILD and args[4] is BRANCH here, matching
  // frontend/helpers/index.ts:88's forwarding order and main.ts:844's own
  // unpacking order -- the two agreeing ground truths.
  ipcMain.handle(
    'getInstallInfo',
    async (_event: unknown, ...args: unknown[]) => {
      const build = args[3] as string | undefined
      const branch = args[4] as string | undefined
      return getInstallInfo(
        args[0] as string,
        args[1] as Runner,
        args[2] as InstallPlatform,
        build,
        branch
      )
    }
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

  // ── send (3) ──────────────────────────────────────────────────────────

  ipcMain.on(
    'setGameMetadataOverride',
    (_event: unknown, ...args: unknown[]) => {
      try {
        setGameMetadataOverride(
          args[0] as {
            appName: string
            title?: string
            art_cover?: string
            art_square?: string
          }
        )
      } catch (error) {
        logSendFailure('setGameMetadataOverride', error)
      }
    }
  )

  // THREE positional arguments (appName, runner, status) — not an object,
  // unlike the other two send channels above.
  ipcMain.on(
    'changeGameVersionPinnedStatus',
    (_event: unknown, ...args: unknown[]) => {
      try {
        changeGameVersionPinnedStatus(
          args[0] as string,
          args[1] as Runner,
          args[2] as boolean
        )
      } catch (error) {
        logSendFailure('changeGameVersionPinnedStatus', error)
      }
    }
  )

  ipcMain.on('addNewApp', (_event: unknown, ...args: unknown[]) => {
    try {
      addNewApp(args[0] as GameInfo)
    } catch (error) {
      logSendFailure('addNewApp', error)
    }
  })
}
