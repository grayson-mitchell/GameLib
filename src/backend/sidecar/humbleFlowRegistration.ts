/**
 * Curated Humble library/sync + key-state channel registration (Phase 34.4
 * Plan 04, REQ-34.4-07).
 *
 * Registers the 10 Chromium-free Humble channels this plan owns, importing
 * the REAL `humble/user.ts` and `humble/library.ts` UNCHANGED (mirrors
 * `steamAuthFlowRegistration.ts`'s own objective — prove the real logic runs
 * behind the new transport, not a reimplementation):
 *
 * Library/sync group (`ipcMain.handle`, `humble/ipc_handler.ts:22,24,30-32`):
 *   - `humbleGetUserInfo` -> `HumbleUser.getUserDetails()`.
 *   - `humbleCheckHealth` -> `HumbleUser.checkHealthAndFlagExpiry()`.
 *   - `humbleSync` -> `HumbleLibrary.sync()`.
 *   - `humbleGetKeys` -> `HumbleLibrary.getKeys()`.
 *   - `humbleGetSyncState` -> `HumbleLibrary.getSyncState()`.
 *
 * Key-state group (`ipcMain.handle`, `humble/ipc_handler.ts:92,105-116`):
 *   - `humbleGetGiftedAt` -> `HumbleLibrary.getAllGiftedAt()`.
 *   - `humbleMarkRedeemed` -> `HumbleLibrary.markRedeemed(gamekey, machineName)`.
 *   - `humbleUndoRedeemed` -> `HumbleLibrary.undoRedeemed(gamekey, machineName)`.
 *   - `humbleGetRevealedKeyValue` -> `HumbleLibrary.getRevealedKeyValue(gamekey, machineName)`.
 *     This is the project's declared C4 narrow-exposure channel
 *     (`ipc_handler.ts:96-101`) — the ONLY channel that ever transmits a raw
 *     key value, on explicit on-demand read only, never broadcast. This
 *     registration adds no logging of any kind and is registered on no
 *     generic frontend `storeGet` bridge (WR-09/T-11-02).
 *   - `humbleGetClaimAnnotations` -> `HumbleLibrary.getClaimAnnotations()`.
 *
 * Deliberately does NOT register the six channels Phase 34.4.1 owns
 * (`humbleStartLogin` `ipc_handler.ts:21`, `humbleReconnect` `:23`,
 * `humbleGetLoginUserAgent` `:25`, `humbleRevealKey` `:102`, `humbleStopLogin`
 * `:126`, `humbleLoginNavigated` `:127`) — the embedded-browser login seam
 * (Phase 34.4 D-01/D-02). Those channels stay unregistered on the sidecar and
 * keep rejecting non-fatally with `UNPORTED_CHANNEL_MARKER` per SEAM.md
 * Load-Bearing Invariant B.
 *
 * Why this module curated-imports `humble/user.ts` and `humble/library.ts`
 * directly and must NEVER side-effect-import `humble/ipc_handler.ts`: that
 * file registers all 21 Humble channels as an import side effect, so
 * importing it would prematurely claim the six channels Phase 34.4.1 owns
 * and drag `backend/ipc` into the sidecar's module graph. Plan 34.4-05 (next
 * wave, same two files) adds the remaining six 34.4-owned channels (the
 * three ownership overrides, `humbleRecordGiftLinkOpened`,
 * `humbleDisconnect`, `humbleRunValidation`) to this same file.
 */

import { ipcMain } from './electronStub'
// Load-bearing FIRST import (mirrors steamAuthFlowRegistration.ts's Phase 27
// Plan 05 circular-dep fix, copied verbatim per-file): `humble/library.ts`
// (imported below, transitively via `HumbleLibrary`) statically imports
// `steamLibraryStore` from `backend/storeManagers/steam/electronStores` and
// `SteamUser` from `backend/storeManagers/steam/user` at its own top
// (library.ts:41-42) — the SAME `storeManagers/steam/*` reach that made this
// fix load-bearing in `steamAuthFlowRegistration.ts`. Forcing
// `storeManagers/index.ts` to be the INITIALIZATION ENTRY here, before either
// `humble/*` import below resolves, lets every `steam/*` module finish
// defining its class export before this module's own `steam/*`-touching
// import chain re-enters it — avoiding the esbuild-bundle-only
// `SteamLibraryManager is not a constructor` hazard. This fix is per-file,
// not "once is enough" — each curated registration module is its own
// independent entry point into the bundle's module graph.
import '../storeManagers'
import { HumbleUser } from '../humble/user'
import { HumbleLibrary } from '../humble/library'

/**
 * Registers the 10 library/sync and key-state Humble channels. Called once
 * from `handlers.ts` — this module owns no side effects at import time
 * beyond the imports above; the caller decides when registration onto the
 * handler registry happens.
 */
export function registerHumbleFlows(): void {
  // ── Library/sync group (REQ-34.4-07) ─────────────────────────────────────
  ipcMain.handle('humbleGetUserInfo', async () => {
    return HumbleUser.getUserDetails()
  })

  ipcMain.handle('humbleCheckHealth', async () => {
    return HumbleUser.checkHealthAndFlagExpiry()
  })

  ipcMain.handle('humbleSync', async () => {
    return HumbleLibrary.sync()
  })

  ipcMain.handle('humbleGetKeys', async () => {
    return HumbleLibrary.getKeys()
  })

  ipcMain.handle('humbleGetSyncState', async () => {
    return HumbleLibrary.getSyncState()
  })

  // ── Key-state group (REQ-34.4-07) ────────────────────────────────────────
  ipcMain.handle('humbleGetGiftedAt', async () => {
    return HumbleLibrary.getAllGiftedAt()
  })

  ipcMain.handle(
    'humbleMarkRedeemed',
    async (_event: unknown, ...args: unknown[]) => {
      const { gamekey, machineName } = args[0] as {
        gamekey: string
        machineName: string
      }
      return HumbleLibrary.markRedeemed(gamekey, machineName)
    }
  )

  ipcMain.handle(
    'humbleUndoRedeemed',
    async (_event: unknown, ...args: unknown[]) => {
      const { gamekey, machineName } = args[0] as {
        gamekey: string
        machineName: string
      }
      return HumbleLibrary.undoRedeemed(gamekey, machineName)
    }
  )

  // C4 narrow-exposure channel (ipc_handler.ts:96-101) — never log anything
  // here, never register this on a generic frontend storeGet bridge.
  ipcMain.handle(
    'humbleGetRevealedKeyValue',
    async (_event: unknown, ...args: unknown[]) => {
      const { gamekey, machineName } = args[0] as {
        gamekey: string
        machineName: string
      }
      return HumbleLibrary.getRevealedKeyValue(gamekey, machineName)
    }
  )

  ipcMain.handle('humbleGetClaimAnnotations', async () => {
    return HumbleLibrary.getClaimAnnotations()
  })
}
