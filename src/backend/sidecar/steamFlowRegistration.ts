/**
 * Curated Steam E2E flow channel registration (Phase 27 Plan 04).
 *
 * Registers exactly the two invoke handlers the skeleton's real Steam flows
 * need onto electronStub's `ipcMain` recorder, importing the REAL backend
 * code paths unchanged (per the plan's own objective — prove the real logic
 * runs behind the new transport, not a reimplementation):
 *
 *   - `refreshLibrary` -> the real `SteamLibraryManager.refresh()`, which
 *     ALREADY calls `sendFrontendMessage('pushGameToLibrary', gameInfo)`
 *     once per resolved game (backend/storeManagers/steam/library.ts) —
 *     that existing call is what reaches the renderer as a
 *     `SidecarNotification` once `backend/ipc.ts`'s `sendFrontendMessage`
 *     -> `getMainWindow()` -> electronStub's fake
 *     `BrowserWindow.webContents.send` is wired to the RPC transport
 *     (27-02). Nothing here re-implements that push.
 *   - `launch` -> the real `SteamGame.launch()`, whose native branch
 *     already funnels through `buildSteamProtocolUrl` (T-27-08's
 *     numeric-appId guard) + `shell.openExternal` (bridged to the Rust
 *     opener by electronStub's `shell.openExternal` forwarder, 27-02).
 *
 * Deliberately does NOT import `launcher.ts`'s `launchEventCallback` (the
 * full Wine/GameConfig/DownloadManager pipeline the Electron build's own
 * 'launch' handler delegates to) or `storeManagers/index.ts`'s eagerly
 * constructed `libraryManagerMap` (every OTHER store manager) — only
 * `SteamLibraryManager` and `SteamGame` are imported here, holding the
 * sidecar's import graph to exactly what these two flows touch (must_haves:
 * "only the 2–4 channels... not the 220-endpoint surface").
 */

import { ipcMain } from './electronStub'
import SteamLibraryManager from '../storeManagers/steam/library'
import SteamGame from '../storeManagers/steam/games'
import type { LaunchParams, StatusPromise } from 'common/types'
import type LogWriter from '../logger/log_writer'

const steamLibraryManager = new SteamLibraryManager()

/**
 * Registers the read-flow (`refreshLibrary`) and action-flow (`launch`)
 * invoke handlers. Called once from `handlers.ts` — this module owns no
 * side effects at import time beyond constructing the manager instance;
 * the caller decides when registration onto the handler registry happens.
 */
export function registerSteamFlows(): void {
  ipcMain.handle('refreshLibrary', async () => {
    await steamLibraryManager.refresh()
  })

  ipcMain.handle(
    'launch',
    async (
      _event: unknown,
      ...args: unknown[]
    ): Promise<Awaited<StatusPromise>> => {
      const { appName } = (args[0] ?? {}) as LaunchParams
      const game = new SteamGame(appName)
      // The LogWriter parameter is unused by SteamGame.launch()'s native/
      // action-flow branch (retained only for the shared Game interface
      // signature) — a headless sidecar has no per-game log-file lifecycle,
      // which belongs to launcher.ts's full pipeline (explicitly out of
      // scope here, see module docstring above).
      const launched = await game.launch(undefined as unknown as LogWriter)
      return { status: launched ? 'done' : 'error' }
    }
  )
}
