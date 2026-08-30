/**
 * EOS (Epic Online Services) overlay channel registration for the Tauri sidecar (Phase 34.6
 * Plan 08, REQ-34.6-01/08/13).
 *
 * Electron original (`src/backend/storeManagers/legendary/eos_overlay/ipc_handler.ts` — the file
 * this module REPLACES as the wiring path, and never imports; that file's `addHandler` calls go
 * through `backend/ipc`, an Electron-only path this sidecar's curated import graph must never
 * reach):
 *
 *   addHandler('getEosOverlayStatus', getStatus)
 *   addHandler('getLatestEosOverlayVersion', getLatestVersion)
 *   addHandler('updateEosOverlayInfo', updateInfo)
 *   addHandler('installEosOverlay', install)
 *   addHandler('removeEosOverlay', async (e, confirmed) => remove(confirmed))
 *   addHandler('enableEosOverlay', async (e, appName) => enable(appName))
 *   addHandler('disableEosOverlay', async (e, appName) => disable(appName))
 *   addHandler('isEosOverlayEnabled', async (e, appName?) => isEnabled(appName))
 *
 * All 8 channels are invoke-kind (`ipcMain.handle`); none is send-kind. Ported byte-equivalently
 * from `eos_overlay.ts`'s eight named exports — no argument reshaping, no new guard, no new
 * behaviour.
 *
 * **A-02 (binding — corrects D-05's original citation; historical, pre-Phase-35-plan-26):** the
 * D-05 live-gate round-trip (install -> enable -> disable -> remove) used to traverse the 34.5
 * D-15 crash hazard (a `dialog.showMessageBox` REJECTION crashes the app under the sidecar) at
 * `remove()`'s native confirmation dialog, called UNCONDITIONALLY, at the round-trip's LAST step
 * — not `enable()`'s, which was gated `if (!isInstalled())` and therefore could never fire once
 * the round-trip's preceding install step had already made `isInstalled()` true. Phase 35 plan
 * 26 (REQ-35-17) removed BOTH native dialogs from this file's backend entirely: `remove()` now
 * takes an explicit `confirmed: boolean` gate (the renderer raises `showDialogModal` first), and
 * `enable()`'s not-installed branch unconditionally returns `installNow: true` for the renderer
 * to act on. This note is kept for the historical crash-hazard record; there is no longer any
 * `dialog.showMessageBox` call anywhere in this cluster's backend.
 *
 * `getWinePrefixFolder()` (`eos_overlay.ts:295`) returns `null` on `!isLinux || !appName`, so
 * `enable()`/`disable()`/`isEnabled()` all run prefix-less on macOS. This is genuine, pre-existing
 * upstream behaviour (unlike the winetricks case corrected by A-01) — no platform-decline branch
 * is introduced by this port.
 *
 * D-08 (KEEP `callOrDeclare()`): every `callOrDeclare` wrapper around these 8 channels' call
 * sites in `AdvancedSettings/index.tsx` STAYS after this port lands. Once ported, `spec.call()`
 * resolves and the wrapper returns `{ ok: true, value }` — a harmless pass-through requiring no
 * call-site change. `EosDeclineCallSiteGuard.test.ts` must stay green, unmodified.
 *
 * Curated-import rule (inherited from every prior slice's D-08 -> D-09 -> D-04 -> D-14 -> D-02
 * lineage): this module imports `eos_overlay.ts`'s eight named exports DIRECTLY, and NEVER
 * `eos_overlay/ipc_handler.ts` — that file double-registers these same channels onto Electron's
 * real `ipcMain` via `backend/ipc`'s `addHandler`, an Electron-only path.
 */

import { ipcMain } from '../platform'
import {
  getStatus,
  getLatestVersion,
  updateInfo,
  install,
  remove,
  enable,
  disable,
  isEnabled
} from '../storeManagers/legendary/eos_overlay/eos_overlay'

/**
 * Registers this cluster's 8 channels (8 invoke, 0 send). Called once from `handlers.ts` — this
 * module owns no side effects at import time; the caller decides when registration onto the
 * handler registry happens.
 *
 * No idempotence guard is needed: all 8 registrations are `ipcMain.handle`, which is naturally
 * idempotent (`electronStub.ts`'s `handlerRegistry` is a `Map`, so a second `.set()` for the same
 * channel replaces the prior entry rather than stacking a duplicate — unlike `ipcMain.on`'s
 * array-append semantics, which is what forces the `let registered = false` guard in modules that
 * register a send-kind channel, e.g. `wineToolsFlowRegistration.ts`).
 */
export function registerEosOverlayFlows(): void {
  ipcMain.handle('getEosOverlayStatus', async () => {
    return getStatus()
  })

  ipcMain.handle('getLatestEosOverlayVersion', async () => {
    return getLatestVersion()
  })

  ipcMain.handle('updateEosOverlayInfo', async () => {
    return updateInfo()
  })

  ipcMain.handle('installEosOverlay', async () => {
    return install()
  })

  // Phase 35 plan 26 (REQ-35-17): `remove()` now takes an explicit `confirmed` gate — the
  // renderer's `showDialogModal` confirmation happens before this channel is ever invoked.
  // See A-02 above for the historical native-dialog crash-hazard context this replaces.
  ipcMain.handle(
    'removeEosOverlay',
    async (_event: unknown, ...args: unknown[]) => {
      const confirmed = args[0] as boolean
      return remove(confirmed)
    }
  )

  ipcMain.handle(
    'enableEosOverlay',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      return enable(appName)
    }
  )

  ipcMain.handle(
    'disableEosOverlay',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      return disable(appName)
    }
  )

  // `appName` is OPTIONAL on this one channel alone (Electron original:
  // `async (e, appName?) => isEnabled(appName)`) — must work when called with no argument.
  ipcMain.handle(
    'isEosOverlayEnabled',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string | undefined
      return isEnabled(appName)
    }
  )
}
