/**
 * Curated runner-CLI-version + misc-tool + saves-sync + runtime-download channel registration for
 * the Tauri sidecar (Phase 34.5 Plans 34.5-07/34.5-12, REQ-34.5-06/REQ-34.5-07/REQ-34.5-08/
 * REQ-34.5-09).
 *
 * Plan 34.5-07 fills in 6 of this module's 11 declared channels: the four runner-CLI version
 * probes and the two Wine-runtime channels. Both clusters were chosen for this earlier plan
 * specifically because neither has ANY wave-1 precondition — they are independent, cheap, and
 * unblock nothing else. The remaining 5 channels (`callTool`, `egsSync`,
 * `getGOGLinuxInstallersLangs`, `syncSaves`, `syncGOGSaves`) are left for plan 34.5-12; do not add
 * their bodies here.
 *
 * D-04 correction, recorded here because this is where a future reader will actually find it:
 * `getCometVersion` is GOG's channel, not Zoom's. `comet` is the GOG Galaxy Communication
 * replacement, gated on `gameInfo.runner === 'gog'` at `launcher.ts:973`. An option label during
 * the 34.5 phase discussion wrongly bundled it with Zoom; Zoom is exactly three channels
 * (`authZoom`, `getZoomUserInfo`, `logoutZoom`), all DROPPED permanently by D-02 — `getCometVersion`
 * was never part of that drop.
 *
 * Declared channel list (11 total, all invoke — verified against `main.ts`,
 * `utils/ipc_handler.ts`, `tools/ipc_handler.ts`, and `wine/runtimes/ipc_handler.ts` by
 * 34.5-RESEARCH.md and this plan's own `<interfaces>` block; no send-kind channels in this
 * cluster):
 *
 *   invoke (ipcMain.handle, 11):
 *     - `getLegendaryVersion`         -> utils/ipc_handler.ts:18 (DONE — plan 34.5-07)
 *     - `getGogdlVersion`             -> utils/ipc_handler.ts:19 (DONE — plan 34.5-07)
 *     - `getCometVersion`             -> utils/ipc_handler.ts:20 (DONE — plan 34.5-07; D-04's channel)
 *     - `getNileVersion`              -> utils/ipc_handler.ts:21 (DONE — plan 34.5-07)
 *     - `callTool`                    -> tools/ipc_handler.ts:25 (plan 34.5-12)
 *     - `egsSync`                     -> main.ts:1251 (plan 34.5-12)
 *     - `getGOGLinuxInstallersLangs`  -> main.ts:840 (plan 34.5-12)
 *     - `syncSaves`                   -> main.ts:1263 (plan 34.5-12)
 *     - `syncGOGSaves`                -> main.ts:1255 (plan 34.5-12)
 *     - `downloadRuntime`             -> wine/runtimes/ipc_handler.ts:4 (DONE — plan 34.5-07)
 *     - `isRuntimeInstalled`          -> wine/runtimes/ipc_handler.ts:6 (DONE — plan 34.5-07)
 *
 * Curated-import rule (inherited from every prior slice's D-08 -> D-09 -> D-04 -> D-14 -> D-02
 * lineage): the cluster plan that fills this module in imports the underlying logic modules
 * directly (`utils` runner-version getters, `tools/index.ts`, `wine/runtimes/runtimes.ts`, the
 * saves-sync module), and NEVER `main.ts`, `utils/ipc_handler.ts`, `tools/ipc_handler.ts`, or
 * `wine/runtimes/ipc_handler.ts` — those double-register these same channels onto Electron's real
 * `ipcMain` via `backend/ipc`'s `addHandler`/`addListener`, an Electron-only path this sidecar's
 * curated import graph must never reach. `utils/ipc_handler.ts` in particular ALSO registers
 * `abort`, `getSystemInfo`, `copySystemInfoToClipboard` and `hasExecutable` — those already belong
 * to already-completed slices and must never be double-registered from here.
 */

import { ipcMain } from './electronStub'
import {
  getCometVersion,
  getGogdlVersion,
  getLegendaryVersion,
  getNileVersion
} from '../utils/helperBinaries'
import { download, isInstalled } from '../wine/runtimes/runtimes'
import type { RuntimeName } from 'common/types'

/**
 * Registers this cluster's 11 invoke-kind channels. Called once from `handlers.ts` — this module
 * owns no side effects at import time; the caller decides when registration onto the handler
 * registry happens.
 *
 * As of plan 34.5-07, 6 of the 11 are registered: the four runner-CLI-version probes and the two
 * runtime channels. The "other" bodies (`callTool`, `egsSync`, `getGOGLinuxInstallersLangs`) and
 * the saves-sync bodies (`syncSaves`, `syncGOGSaves`) land in plan 34.5-12.
 */
export function registerRunnerMiscFlows(): void {
  // ── Runner CLI version probes (main.ts / utils/ipc_handler.ts:18-21) ──────
  // Pure pass-through reads, exactly as the Electron source registers them — no caching, no
  // timeouts, no error wrapping the Electron path does not already have.
  ipcMain.handle('getLegendaryVersion', getLegendaryVersion)
  ipcMain.handle('getGogdlVersion', getGogdlVersion)
  // D-04: `comet` is GOG's Galaxy Communication replacement, gated on
  // `gameInfo.runner === 'gog'` at `launcher.ts:973`. An option label during the 34.5 phase
  // discussion wrongly bundled it with Zoom; Zoom is exactly three channels (`authZoom`,
  // `getZoomUserInfo`, `logoutZoom`), all DROPPED permanently by D-02 — `getCometVersion` was
  // never part of that drop and is ported here unchanged.
  ipcMain.handle('getCometVersion', getCometVersion)
  ipcMain.handle('getNileVersion', getNileVersion)

  // ── Wine runtime channels (wine/runtimes/ipc_handler.ts:4,6) ──────────────
  // No wave-1 precondition: `runtimePath` (`backend/constants/paths.ts`) resolves from
  // `toolsPath`, which in turn resolves through `pathShim`'s ALREADY-implemented `userData` case
  // — a reader should not add a spurious dependency on plan 34.5-01 for this cluster.
  ipcMain.handle(
    'downloadRuntime',
    async (_event: unknown, ...args: unknown[]) =>
      download(args[0] as RuntimeName)
  )
  ipcMain.handle(
    'isRuntimeInstalled',
    async (_event: unknown, ...args: unknown[]) =>
      isInstalled(args[0] as RuntimeName)
  )
}
