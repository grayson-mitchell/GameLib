import { addHandler, addListener } from 'backend/ipc'
import { logWarning, LogPrefix } from 'backend/logger'

import { HumbleUser } from './user'
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
  // WR-04 (14-REVIEW): machineName->overriddenAt map so views can render the
  // undo-override affordance wherever the OVERRIDDEN key now appears
  // (Keys-waiting) — the current fuzzy/owned flags can never identify an
  // overridden row (the override itself cleared them). Timestamps only,
  // never a key value.
  addHandler('humbleGetOwnershipOverrides', () =>
    HumbleLibrary.getAllOwnershipOverrides()
  )
  // Phase 13 (Plan 02, D-59/D-57): giftable-spares gift-action confirmation.
  // Mirrors humbleSetOwnershipOverride's non-fuzzy rejection shape — the
  // renderer must never be trusted to have only shown the gift button on an
  // eligible row. Re-validates ownedElsewhere && state === UNREVEALED
  // server-side against the live key set; reject + log (machineName only,
  // never a URL/token per C4) and no-op otherwise.
  addHandler('humbleRecordGiftLinkOpened', async (e, machineName) => {
    const targetKey = HumbleLibrary.getKeys().find(
      (key) => key.machineName === machineName
    )
    if (
      !targetKey ||
      !targetKey.ownedElsewhere ||
      targetKey.state !== 'UNREVEALED'
    ) {
      logWarning(
        [
          'Rejected humbleRecordGiftLinkOpened for ineligible machineName:',
          machineName
        ],
        LogPrefix.Backend
      )
      return
    }
    HumbleLibrary.recordGiftLinkOpened(machineName)
  })
  addHandler('humbleGetGiftedAt', () => HumbleLibrary.getAllGiftedAt())
  // Phase 14 guided claim flow (HCLAIM-01/02/03/04). Each handler is a thin
  // typed delegate to HumbleLibrary — revealKey/markRedeemed/undoRedeemed
  // already perform the authoritative server-side eligibility + C2
  // re-validation internally (T-14-03: the renderer's view is never
  // trusted). humbleGetRevealedKeyValue is the C4 narrow-exposure channel
  // (T-14-02) — the ONLY channel that ever transmits a raw key value, and
  // only on explicit on-demand read while the wizard is open, never
  // broadcast. None of these are registered on any generic frontend
  // storeGet bridge (WR-09, T-11-02 precedent).
  addHandler('humbleRevealKey', async (e, params) =>
    HumbleLibrary.revealKey(params.gamekey, params.machineName)
  )
  addHandler('humbleMarkRedeemed', async (e, params) =>
    HumbleLibrary.markRedeemed(params.gamekey, params.machineName)
  )
  addHandler('humbleUndoRedeemed', async (e, params) =>
    HumbleLibrary.undoRedeemed(params.gamekey, params.machineName)
  )
  addHandler('humbleGetRevealedKeyValue', (e, params) =>
    HumbleLibrary.getRevealedKeyValue(params.gamekey, params.machineName)
  )
  addHandler('humbleGetClaimAnnotations', () =>
    HumbleLibrary.getClaimAnnotations()
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
}
