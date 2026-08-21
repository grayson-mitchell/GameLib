/**
 * Curated Wine execution + DXVK/VKD3D toggle + Wine-version-management channel registration for
 * the Tauri sidecar (Phase 34.5 Plans 34.5-05/34.5-09, REQ-34.5-03).
 *
 * As of plan 34.5-09, this module registers all 9 declared channels: the `runWineCommand` seam
 * (D-14), the two Wine probe channels (`getAlternativeWine`, `wine.isValidVersion`), the
 * Wine-version-management trio (`installWineVersion`/`refreshWineVersionInfo`/`removeWineVersion`)
 * plus their co-located wine-releases-ready event subscription (see the comment above that
 * subscription below for the exact event name), and the DXVK/VKD3D toggle trio
 * (`toggleDXVK`/`toggleDXVKNVAPI`/`toggleVKD3D`) added by plan 34.5-09.
 *
 * Declared channel list (9 total, all invoke — verified against `main.ts` and the
 * `wine/manager/ipc_handler.ts` source by 34.5-RESEARCH.md and this plan's own `<interfaces>`
 * block; no send-kind channels in this cluster):
 *
 *   invoke (ipcMain.handle, 9):
 *     - `runWineCommand`         -> main.ts:766
 *     - `getAlternativeWine`     -> main.ts:973
 *     - `wine.isValidVersion`    -> main.ts:1532
 *     - `toggleDXVK`             -> main.ts:999
 *     - `toggleDXVKNVAPI`        -> main.ts:1007
 *     - `toggleVKD3D`            -> main.ts:1015
 *     - `installWineVersion`     -> wine/manager/ipc_handler.ts:14
 *     - `refreshWineVersionInfo` -> wine/manager/ipc_handler.ts:46
 *     - `removeWineVersion`      -> wine/manager/ipc_handler.ts:56
 *
 * Curated-import rule (inherited from every prior slice's D-08 -> D-09 -> D-04 -> D-14 -> D-02
 * lineage): the cluster plan that fills this module in imports the underlying logic modules
 * directly (`tools/index.ts`'s exported functions, `wine/manager/manager.ts` or equivalent), and
 * NEVER `main.ts`, `tools/ipc_handler.ts`, or `wine/manager/ipc_handler.ts` — those double-
 * register these same channels onto Electron's real `ipcMain` via `backend/ipc`'s
 * `addHandler`/`addListener`, an Electron-only path this sidecar's curated import graph must
 * never reach. `tools/ipc_handler.ts` in particular also registers `runWineCommandForGame` and
 * the three DEFERRED winetricks channels (`winetricksInstall`/`winetricksAvailable`/
 * `winetricksInstalled`) that belong to Phase 34.6, not this slice.
 */

import { ipcMain } from './electronStub'
import { runWineCommand, validWine } from '../launcher'
import { GlobalConfig } from '../config'
import { GameConfig } from '../game_config'
import {
  installWineVersion as installWineVersionForRelease,
  removeWineVersion as removeWineVersionForRelease,
  updateWineVersionInfos,
  updateWineListsIfOutdated
} from '../wine/manager/utils'
import { DXVK } from '../tools'
import { sendFrontendMessage } from '../ipc'
import { notify } from '../dialog/dialog'
import { logDebug, logError, LogPrefix } from '../logger'
import { backendEvents } from '../backend_events'
import { t } from 'i18next'
import type {
  WineCommandArgs,
  WineInstallation,
  WineManagerStatus,
  WineVersionInfo
} from 'common/types'

/**
 * Registers this cluster's 9 invoke-kind channels (all 9, as of plan 34.5-09). Called once from
 * `handlers.ts` — this module owns no side effects at import time; the caller decides when
 * registration onto the handler registry happens.
 */
export function registerWineToolsFlows(): void {
  // ── D-14 seam 3: `runWineCommand` (main.ts:766) ─────────────────────────────────────────────
  //
  // This is D-14's seam, not a new construction: `runWineCommand` is pure Node `child_process`
  // logic that already exists at `launcher.ts:1504` and is already exercised transitively by the
  // ported Steam `install`/`launch` channels (`storeManagers/storeManagerCommon/games.ts:254`).
  // Its Steam path is therefore already proven under the sidecar. Its NON-Steam path (Epic/GOG/
  // Amazon/sideload calling this same function) has never run under the sidecar — that is
  // live-gate item 5 (34.5-LIVE-GATE.md), not something this registration can prove by itself.
  //
  // Wave placement: D-07 lists `runWineCommand` among "the three wave-1 seams", but this
  // registration lands in wave 2, deliberately, for three reasons: (1) research Pitfall 2 — this
  // is pre-existing plumbing needing a live proof, not new construction, unlike seams 1/2 (which
  // MODIFY existing files and genuinely build something in wave 1); (2) a registration cannot
  // precede plan 34.5-04, which creates this module as an empty declared contract and is itself
  // wave 1 — no channel registration in this slice can be wave 1; (3) no wave-2 plan depends on
  // this one, so D-06's mid-execution-seam-discovery failure mode (the 34.4→34.4.1 carve-out)
  // cannot recur here — the seam was fully scoped at planning time.
  //
  // Pass-through only: no wine-environment reconstruction, no platform branch, no retry logic.
  // `runWineCommand` itself owns all of that (D-13, below).
  ipcMain.handle(
    'runWineCommand',
    async (_event: unknown, ...args: unknown[]) => {
      return runWineCommand(args[0] as WineCommandArgs)
    }
  )

  // ── Wine probe pair (main.ts:973, main.ts:1532) ─────────────────────────────────────────────
  ipcMain.handle('getAlternativeWine', async () => {
    return GlobalConfig.get().getAlternativeWine()
  })

  ipcMain.handle(
    'wine.isValidVersion',
    async (_event: unknown, ...args: unknown[]) => {
      return validWine(args[0] as WineInstallation)
    }
  )

  // ── Wine-version-management trio (wine/manager/ipc_handler.ts:14,46,56) ─────────────────────
  //
  // Ported verbatim from `wine/manager/ipc_handler.ts` — behaviour preserved exactly, including
  // the `onProgress` push, the `notify()` calls, and the swallow-and-return-undefined shape of
  // `refreshWineVersionInfo`'s catch. Never imports `wine/manager/ipc_handler.ts` itself (that
  // file double-registers these same channels onto Electron's real `ipcMain`); the underlying
  // logic is imported directly from `wine/manager/utils.ts`.
  ipcMain.handle(
    'installWineVersion',
    async (_event: unknown, ...args: unknown[]) => {
      const release = args[0] as WineVersionInfo

      const onProgress = (state: WineManagerStatus) => {
        sendFrontendMessage('progressOfWineManager', release.version, state)
      }

      notify({ title: release.version, body: t('notify.install.startInstall') })
      onProgress({
        status: 'downloading',
        percentage: 0,
        avgSpeed: 0,
        eta: '00:00:00'
      })

      const result = await installWineVersionForRelease(release, onProgress)

      let notifyBody: string | null = null
      switch (result) {
        case 'error':
          notifyBody = t('notify.install.error')
          break
        case 'abort':
          notifyBody = t('notify.install.canceled')
          break
        case 'success':
          notifyBody = t('notify.install.finished')
      }
      if (notifyBody) notify({ title: release.version, body: notifyBody })
      onProgress({
        status: 'idle'
      })
    }
  )

  // Source: wine/manager/ipc_handler.ts:46 — the swallow-and-return-undefined shape on both the
  // success and catch paths is inherited behaviour, kept as-is (not this port's decision to make).
  ipcMain.handle(
    'refreshWineVersionInfo',
    async (_event: unknown, ...args: unknown[]) => {
      const fetch = args[0] as boolean | undefined
      try {
        await updateWineVersionInfos(fetch)
        return
      } catch (error) {
        logError(error, LogPrefix.WineDownloader)
        return
      }
    }
  )

  ipcMain.handle(
    'removeWineVersion',
    async (_event: unknown, ...args: unknown[]) => {
      const release = args[0] as WineVersionInfo
      const result = await removeWineVersionForRelease(release)
      if (result)
        notify({ title: release.version, body: t('notify.uninstalled') })
    }
  )

  // Source: wine/manager/ipc_handler.ts:61-64 — NOT an IPC channel (no entry in the declared 9),
  // but co-located with the trio above and the only caller of `updateWineListsIfOutdated`. The
  // sidecar has no other init path that subscribes to this backend event, so omitting it would
  // silently drop wine-list refresh behaviour the Electron build has, with nothing failing
  // (T-34.5-16). Registered inside `registerWineToolsFlows()` so it is subject to plan 34.5-04's
  // idempotence assertion.
  backendEvents.on('releasesInfoReady', (releasesInfo) => {
    logDebug('Releases info ready, checking wine releases', LogPrefix.Backend)
    void updateWineListsIfOutdated(releasesInfo)
  })

  // ── DXVK/VKD3D toggle trio (main.ts:999,1007,1015) — the cluster's final 3 channels ─────────
  //
  // Ported verbatim: unpack `{ appName, action }`, resolve `GameConfig.get(appName).getSettings()`,
  // and delegate to `DXVK.installRemove(gameSettings, <tool>, action)`. `DXVK` is imported by name
  // from `../tools` (never `tools/ipc_handler.ts`, which also registers `runWineCommandForGame` and
  // the DEFERRED winetricks trio).
  //
  // T-34.5-30 / D-15 (verified, not assumed — see 34.5-09-SUMMARY.md for the full file:line trace):
  // the one dialog these three channels can reach is `showDialogBoxModalAuto`
  // (`tools/index.ts:137`, via `DXVK.installRemove` -> `DXVK.getLatest()` -> `installOrUpdateTool`
  // on a download failure). Its primary path is the fire-and-forget
  // `sendFrontendMessage('showDialog', ...)` push; its `catch` fallback lands on
  // `electronStub.dialog.showErrorBox`/`showMessageBox`, both async and non-throwing by
  // construction (each has its own internal try/catch that never rethrows). No fix was built here
  // — the existing wiring already satisfies the concern this plan set out to verify.
  ipcMain.handle('toggleDXVK', async (_event: unknown, ...args: unknown[]) => {
    const { appName, action } = args[0] as {
      appName: string
      action: 'backup' | 'restore'
    }
    const gameSettings = await GameConfig.get(appName).getSettings()
    return DXVK.installRemove(gameSettings, 'dxvk', action)
  })

  ipcMain.handle(
    'toggleDXVKNVAPI',
    async (_event: unknown, ...args: unknown[]) => {
      const { appName, action } = args[0] as {
        appName: string
        action: 'backup' | 'restore'
      }
      const gameSettings = await GameConfig.get(appName).getSettings()
      return DXVK.installRemove(gameSettings, 'dxvk-nvapi', action)
    }
  )

  // D-13: on macOS, `tools/index.ts:228` (`if (isMac && tool !== 'dxvk') return true`) already
  // permits `dxvk` only and already excludes `vkd3d` before any file I/O runs — VKD3D is therefore
  // registered unconditionally here too, and the platform decision stays exactly where upstream
  // Heroic made it. No `process.platform`/`isMac`/`isLinux` branch is introduced in this
  // registration module — that would duplicate and eventually diverge from the guard.
  ipcMain.handle('toggleVKD3D', async (_event: unknown, ...args: unknown[]) => {
    const { appName, action } = args[0] as {
      appName: string
      action: 'backup' | 'restore'
    }
    const gameSettings = await GameConfig.get(appName).getSettings()
    return DXVK.installRemove(gameSettings, 'vkd3d', action)
  })

  // D-13: the platform guards inherited from `tools/index.ts` — `tool.os !== process.platform`
  // (:73), the `-DXMT` flag (:219), macOS permitting only `dxvk` (VKD3D already excluded, :228),
  // `dxvk-macOS` (:245), `isMac ? macEnvs : linuxEnvs` (:642), and the two `if (!isLinux)` guards
  // (:807/:843) — are trusted and UNCHANGED here: the sidecar is a real Node process on the same
  // OS, so `process.platform` behaves identically. They are not re-decided by this port, and no
  // `macEnvs`/`linuxEnvs` construction is duplicated into this module.
}
