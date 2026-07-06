import { addHandler, addListener } from 'backend/ipc'
import { logWarning, LogPrefix } from 'backend/logger'

import { HumbleUser, standardBrowserUserAgent } from './user'
import { HumbleLibrary } from './library'

/**
 * Registers all Humble IPC channels (typed in common/types/ipc.ts) against
 * the matching HumbleUser methods. Mirrors the Steam block in main.ts
 * (lines ~860-874), but grouped into its own function per the phase's
 * pattern map (10-PATTERNS.md) given Humble's larger IPC surface.
 *
 * The dev-only D-12 `humbleRunValidation` trigger is NOT registered here —
 * it is wired directly in backend/main.ts behind an explicit
 * `!app.isPackaged` guard (T-10-16), kept out of this always-on function so
 * it can never be accidentally exposed in a packaged build.
 *
 * Called exactly once from backend/main.ts during startup.
 */
export function registerHumbleIpcHandlers(): void {
  addHandler('humbleStartLogin', async () => HumbleUser.startLogin())
  addHandler('humbleGetUserInfo', () => HumbleUser.getUserDetails())
  addHandler('humbleReconnect', async () => HumbleUser.reconnect())
  addHandler('humbleCheckHealth', () => HumbleUser.checkHealthAndFlagExpiry())
  addHandler('humbleGetLoginUserAgent', () => standardBrowserUserAgent())
  // Phase 11 (library.ts, Plan 02): sync IPC surface. These delegate to
  // HumbleLibrary and return ONLY the display-safe HumbleKey[]/HumbleSyncState
  // projections — never register humbleLibraryStore/humbleRevealedStore on
  // any generic frontend storeGet bridge (WR-09, T-11-02).
  addHandler('humbleSync', async () => HumbleLibrary.sync())
  addHandler('humbleGetKeys', () => HumbleLibrary.getKeys())
  addHandler('humbleGetSyncState', () => HumbleLibrary.getSyncState())
  // Phase 12 (Plan 04, D-42/T-12-03): "Not the same game" override. This is
  // the ONE authoritative server-side check that an override target is
  // actually a fuzzy match — the renderer must never be trusted to have
  // gated its own button. A compromised/buggy renderer calling this on an
  // exact-match machineName is rejected + logged, never persisted (an exact
  // AppID match is ground truth per D-44 and is never overridable).
  addHandler('humbleSetOwnershipOverride', async (e, machineName) => {
    const targetKey = HumbleLibrary.getKeys().find(
      (key) => key.machineName === machineName
    )
    if (!targetKey || targetKey.matchConfidence !== 'fuzzy') {
      logWarning(
        [
          'Rejected humbleSetOwnershipOverride for non-fuzzy machineName:',
          machineName
        ],
        LogPrefix.Backend
      )
      return
    }
    HumbleLibrary.setOwnershipOverride(machineName)
  })
  addHandler('humbleClearOwnershipOverride', async (e, machineName) =>
    HumbleLibrary.clearOwnershipOverride(machineName)
  )
  // WR-02: never discard the disconnect promise silently — a rejection here
  // (e.g. session.fromPartition throwing) must not become an unhandled
  // rejection in the main process. The credential wipe itself runs first
  // inside disconnect() and is synchronous.
  addListener('humbleDisconnect', () => {
    HumbleUser.disconnect().catch((err) =>
      logWarning(['Humble disconnect failed:', err], LogPrefix.Backend)
    )
  })
  addListener('humbleStopLogin', () => HumbleUser.stopLogin())
  addListener('humbleLoginNavigated', () => HumbleUser.notifyLoginNavigated())
}
