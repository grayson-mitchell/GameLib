/**
 * Curated Wine execution + DXVK/VKD3D toggle + Wine-version-management channel registration for
 * the Tauri sidecar (Phase 34.5 Plans 34.5-05/34.5-09, REQ-34.5-03).
 *
 * As of plan 34.5-05, this module registers 6 of the 9 declared channels: the `runWineCommand`
 * seam (D-14), the two Wine probe channels (`getAlternativeWine`, `wine.isValidVersion`), and the
 * Wine-version-management trio (`installWineVersion`/`refreshWineVersionInfo`/`removeWineVersion`)
 * plus their co-located `releasesInfoReady` subscription. The remaining 3 (DXVK/VKD3D toggles)
 * land in a later plan (34.5-09 per this module's original scaffold) — do not "fix" this by
 * adding those bodies here; that plan owns them.
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
import type { WineCommandArgs, WineInstallation } from 'common/types'

/**
 * Registers this cluster's 9 invoke-kind channels. Called once from `handlers.ts` — this module
 * owns no side effects at import time; the caller decides when registration onto the handler
 * registry happens.
 *
 * DXVK/VKD3D toggle bodies (`toggleDXVK`/`toggleDXVKNVAPI`/`toggleVKD3D`) are still TODO as of
 * this plan — they land in a later plan per this module's original scaffold.
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
  ipcMain.handle('runWineCommand', async (_event: unknown, ...args: unknown[]) => {
    return runWineCommand(args[0] as WineCommandArgs)
  })

  // ── Wine probe pair (main.ts:973, main.ts:1532) ─────────────────────────────────────────────
  ipcMain.handle('getAlternativeWine', async () => {
    return GlobalConfig.get().getAlternativeWine()
  })

  ipcMain.handle('wine.isValidVersion', async (_event: unknown, ...args: unknown[]) => {
    return validWine(args[0] as WineInstallation)
  })

  // D-13: the platform guards inherited from `tools/index.ts` — `tool.os !== process.platform`
  // (:73), the `-DXMT` flag (:219), macOS permitting only `dxvk` (VKD3D already excluded, :228),
  // `dxvk-macOS` (:245), `isMac ? macEnvs : linuxEnvs` (:642), and the two `if (!isLinux)` guards
  // (:807/:843) — are trusted and UNCHANGED here: the sidecar is a real Node process on the same
  // OS, so `process.platform` behaves identically. They are not re-decided by this port, and no
  // `macEnvs`/`linuxEnvs` construction is duplicated into this module.
}
