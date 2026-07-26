/**
 * Curated Humble channel registration (Phase 34.4 Plans 04+05,
 * REQ-34.4-07/08/09).
 *
 * Registers all 16 Chromium-free Humble channels this slice owns, importing
 * the REAL `humble/user.ts`, `humble/library.ts` and `humble/validation.ts`
 * UNCHANGED (mirrors `steamAuthFlowRegistration.ts`'s own objective — prove
 * the real logic runs behind the new transport, not a reimplementation):
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
 * Ownership-override group (`ipcMain.handle`, `humble/ipc_handler.ts:39-65`,
 * Phase 34.4 Plan 05, REQ-34.4-07):
 *   - `humbleSetOwnershipOverride` -> `HumbleLibrary.setOwnershipOverride(machineName)`,
 *     gated by the D-42/T-12-03 server-side re-validation ported verbatim
 *     from `ipc_handler.ts:39-54`: the renderer must never be trusted to have
 *     gated its own button. A `machineName` whose key is missing, OR whose
 *     `matchConfidence` is not `'fuzzy'`, is rejected and logged (machineName
 *     only) WITHOUT calling the mutating method — an exact AppID match is
 *     ground truth (D-44) and is never overridable.
 *   - `humbleClearOwnershipOverride` -> `HumbleLibrary.clearOwnershipOverride(machineName)`.
 *   - `humbleGetOwnershipOverrides` -> `HumbleLibrary.getAllOwnershipOverrides()`.
 *
 * `humbleRecordGiftLinkOpened` (`ipcMain.handle`, Phase 34.4 Plan 05,
 * REQ-34.4-07) — **CORRECTED CLASSIFICATION.** 34.4-CONTEXT.md's Discretion
 * section names this as one of three `send` channels; that claim is WRONG.
 * Confirmed by three independent sources: `humble/ipc_handler.ts:72` is
 * `addHandler`, `common/types/ipc.ts:350` types it `Promise<void>` in the
 * `AsyncIPCFunctions` shape, and `preload/api/humble.ts:31` calls
 * `makeHandlerInvoker` (never a listener-caller). Registering it as a
 * listener would reproduce the exact `sidecar-send-channels-fail-silently`
 * defect class this phase's live gate exists to catch — do NOT "fix" this
 * back to `ipcMain.on` on the strength of the stale CONTEXT.md prose.
 * Carries the D-59/D-57 server-side re-validation ported verbatim from
 * `ipc_handler.ts:72-91`: a `machineName` whose key is missing, OR
 * `!ownedElsewhere`, OR `state !== 'UNREVEALED'`, is rejected and logged
 * (machineName only, never a URL/token per C4) WITHOUT calling
 * `HumbleLibrary.recordGiftLinkOpened`.
 *
 * `humbleDisconnect` (`ipcMain.on` — the ONE genuine `send` in the Humble
 * half, `humble/ipc_handler.ts:121`, Phase 34.4 Plan 05, REQ-34.4-09) —
 * **DECLARED PARTIAL (D-05).** `HumbleUser.disconnect()` (`humble/user.ts:
 * 566-608`) clears the encrypted-cookie store SYNCHRONOUSLY and FIRST
 * (`configStore.clear()`, `humbleLibraryStore.clear()`,
 * `humbleSyncStore.clear()`) — that IS the real sign-out and the actual
 * security boundary, and it is fully functional under Tauri. Only the
 * subsequent best-effort `session.fromPartition(HUMBLE_LOGIN_PARTITION)`
 * wipe loop no-ops, against `electronStub.session`'s accepted Phase 29 D-09
 * stub — and under Tauri that partition never held anything, so surfacing a
 * "your browser session may survive" warning here would be actively FALSE
 * (34.3 D-01's rider against inflating a precautionary no-op into a shipped
 * defect). Once Phase 34.4.1 creates a real browser context, `humbleDisconnect`
 * MUST be revisited to clear it too — otherwise 34.4.1 silently inherits a
 * half-finished sign-out. Never rethrows (`sidecar-dialog-reject-crashes`);
 * the WR-02 rider (never discard the disconnect promise silently) is carried
 * forward via the `.catch(...)` below.
 *
 * `humbleRunValidation` (`ipcMain.handle`, Phase 34.4 Plan 05, REQ-34.4-08) —
 * real Electron gates this behind a negated `app` "already packaged" flag
 * (`main.ts:965-970`), kept out of `humble/ipc_handler.ts`'s always-on
 * registrar specifically so it can never be accidentally exposed in a
 * packaged build (`ipc_handler.ts:13-16`). `electronStub`'s `app` shim
 * hardcodes that same flag to `false` always, so reusing that guard
 * verbatim would register this dev-only trigger in EVERY Tauri build,
 * packaged or not. Resolved via `isPackagedSidecar()` below — see its own
 * docstring for the `node:sea` signal and safe-default rationale.
 *
 * Deliberately does NOT register the six channels Phase 34.4.1 owns
 * (`humbleStartLogin` `ipc_handler.ts:21`, `humbleReconnect` `:23`,
 * `humbleGetLoginUserAgent` `:25`, `humbleRevealKey` `:102`, `humbleStopLogin`
 * `:126`, `humbleLoginNavigated` `:127`) — the embedded-browser login seam
 * (Phase 34.4 D-01/D-02). Those channels stay unregistered on the sidecar and
 * keep rejecting non-fatally with `UNPORTED_CHANNEL_MARKER` per SEAM.md
 * Load-Bearing Invariant B.
 *
 * Why this module curated-imports `humble/user.ts`, `humble/library.ts` and
 * `humble/validation.ts` directly and must NEVER side-effect-import
 * `humble/ipc_handler.ts`: that file registers all 21 Humble channels as an
 * import side effect, so importing it would prematurely claim the six
 * channels Phase 34.4.1 owns and drag `backend/ipc` into the sidecar's
 * module graph.
 */

import { ipcMain } from './electronStub'
// Load-bearing FIRST import (mirrors steamAuthFlowRegistration.ts's Phase 27
// Plan 05 circular-dep fix, copied verbatim per-file): `humble/library.ts`
// (imported below, transitively via `HumbleLibrary`) statically imports
// `steamLibraryStore` from `backend/storeManagers/steam/electronStores` and
// `SteamUser` from `backend/storeManagers/steam/user` at its own top
// (library.ts:41-42) — the SAME storeManagers-under-steam reach that made
// this fix load-bearing in `steamAuthFlowRegistration.ts`. Forcing
// `storeManagers/index.ts` to be the INITIALIZATION ENTRY here, before
// either humble module import below resolves, lets every module under
// `storeManagers/steam` finish defining its class export before this
// module's own steam-touching import chain re-enters it — avoiding the
// esbuild-bundle-only `SteamLibraryManager is not a constructor` hazard.
// This fix is per-file, not "once is enough" — each curated registration
// module is its own independent entry point into the bundle's module graph.
import '../storeManagers'
import { HumbleUser } from '../humble/user'
import { HumbleLibrary } from '../humble/library'
import { runHumbleValidation } from '../humble/validation'

/**
 * Whether this sidecar process is a packaged Node Single Executable
 * Application (SEA), as opposed to the plain dev script run under `node`
 * (Phase 34.4 Plan 05, REQ-34.4-08).
 *
 * Resolves the `humbleRunValidation` dev-vs-packaged divergence that reusing
 * Electron's negated `app` "already packaged" flag guard verbatim cannot:
 * `electronStub`'s `app` shim (see `./electronStub.ts`) hardcodes that same
 * flag to `false` always, so that guard would always pass and register this
 * dev-only trigger in every Tauri build. `main.rs` confirms there is no env
 * var or CLI flag distinguishing the two spawn paths (`use_dev_sidecar()`
 * L737-739 reduces to `cfg!(debug_assertions)`; neither `spawn_sidecar_dev()`
 * L745-767 nor `spawn_sidecar_packaged()` L775-800 calls `.env(...)`) — so
 * this cannot be resolved through the Electron `app` shim or a spawn-time
 * environment signal without a Rust change, which this slice forbids.
 *
 * The genuine Node-only signal used instead: the packaged sidecar is built
 * by `package.json`'s `build:sidecar-sea` script as a Node SEA binary, while
 * the dev sidecar is `build:sidecar`'s plain `build/main/sidecar.js` run
 * under `node`. `require('node:sea').isSea()` distinguishes them with zero
 * Rust change and zero new dependency — `node:sea` is a Node builtin;
 * esbuild's `--packages=external` leaves it as a plain builtin require (this
 * is NOT the alias/relative `sync-require-alias-unresolved-in-build`
 * hazard). Empirically verified at plan/execution time on this machine's
 * Node (v26.2.0): `typeof require('node:sea').isSea === 'function'`, and it
 * returns `false` under the dev sidecar entry (`node build/main/sidecar.js`)
 * — see 34.4-05-SUMMARY.md for the recorded check.
 *
 * Guarded: an older or unavailable Node runtime must not throw at
 * registration time. On any failure to determine, choose the SAFE default —
 * treat the build as packaged (i.e. do NOT register the dev-only channel) —
 * and log the fallback once, mirroring `electronStub.ts`'s own "fails loudly
 * with a clear log line" house style (D-09/D-06).
 */
function isPackagedSidecar(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- node:sea
    // is a Node builtin; a guarded runtime require (not a relative/alias
    // path) is the deliberate mechanism here, not an oversight. See the
    // docstring above.
    const nodeSea = require('node:sea') as { isSea: () => boolean }
    return nodeSea.isSea()
  } catch (err) {
    console.warn(
      '[humbleFlowRegistration] node:sea unavailable -- defaulting humbleRunValidation to PACKAGED (dev-only channel NOT registered):',
      err
    )
    return true
  }
}

/**
 * Registers all 16 Humble channels this slice owns. Called once from
 * `handlers.ts` — this module owns no side effects at import time beyond the
 * imports above; the caller decides when registration onto the handler
 * registry happens.
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

  // ── Ownership-override group (REQ-34.4-07, Plan 05) ──────────────────────
  // D-42/T-12-03: the ONE authoritative server-side check that an override
  // target is actually a fuzzy match — the renderer must never be trusted to
  // have gated its own button. A compromised/buggy renderer calling this on
  // an exact-match machineName is rejected + logged, never persisted (an
  // exact AppID match is ground truth per D-44 and is never overridable).
  // Ported verbatim from humble/ipc_handler.ts:39-54 — do not collapse this
  // guard into a shared helper with humbleRecordGiftLinkOpened's below; the
  // two check different predicates and each carries its own rationale.
  ipcMain.handle(
    'humbleSetOwnershipOverride',
    async (_event: unknown, ...args: unknown[]) => {
      const machineName = args[0] as string
      const targetKey = HumbleLibrary.getKeys().find(
        (key) => key.machineName === machineName
      )
      if (!targetKey || targetKey.matchConfidence !== 'fuzzy') {
        console.warn(
          '[humbleFlowRegistration] rejected humbleSetOwnershipOverride for non-fuzzy machineName:',
          machineName
        )
        return
      }
      HumbleLibrary.setOwnershipOverride(machineName)
    }
  )

  ipcMain.handle(
    'humbleClearOwnershipOverride',
    async (_event: unknown, ...args: unknown[]) => {
      return HumbleLibrary.clearOwnershipOverride(args[0] as string)
    }
  )

  ipcMain.handle('humbleGetOwnershipOverrides', async () => {
    return HumbleLibrary.getAllOwnershipOverrides()
  })

  // ── Gift links (REQ-34.4-07, Plan 05) ─────────────────────────────────────
  // CORRECTED CLASSIFICATION (see module docstring): this is ipcMain.handle,
  // NOT ipcMain.on. Confirmed by three independent sources —
  // humble/ipc_handler.ts:72 (addHandler), common/types/ipc.ts:350
  // (Promise<void>, AsyncIPCFunctions shape), preload/api/humble.ts:31
  // (makeHandlerInvoker, not a listener-caller) — CONTEXT.md's Discretion
  // section is WRONG to name this a `send`; do not "fix" this back.
  // D-59/D-57: mirrors humbleSetOwnershipOverride's non-fuzzy rejection
  // shape above — the renderer must never be trusted to have only shown the
  // gift button on an eligible row. Ported verbatim from
  // humble/ipc_handler.ts:72-91.
  ipcMain.handle(
    'humbleRecordGiftLinkOpened',
    async (_event: unknown, ...args: unknown[]) => {
      const machineName = args[0] as string
      const targetKey = HumbleLibrary.getKeys().find(
        (key) => key.machineName === machineName
      )
      if (
        !targetKey ||
        !targetKey.ownedElsewhere ||
        targetKey.state !== 'UNREVEALED'
      ) {
        console.warn(
          '[humbleFlowRegistration] rejected humbleRecordGiftLinkOpened for ineligible machineName:',
          machineName
        )
        return
      }
      HumbleLibrary.recordGiftLinkOpened(machineName)
    }
  )

  // ── Health / session teardown (REQ-34.4-09, Plan 05) ─────────────────────
  // D-05 declared partial (see module docstring in full):
  //   (a) HumbleUser.disconnect() clears the encrypted-cookie store
  //       SYNCHRONOUSLY and FIRST (configStore.clear(), humbleLibraryStore
  //       .clear(), humbleSyncStore.clear()) -- that IS the real sign-out
  //       and the actual security boundary, and it is fully functional
  //       under Tauri.
  //   (b) only the subsequent best-effort session.fromPartition(...) wipe
  //       loop no-ops, against electronStub.session's accepted Phase 29 D-09
  //       stub -- and under Tauri that partition never held anything, so
  //       surfacing a "your browser session may survive" warning here would
  //       be actively FALSE (34.3 D-01's rider).
  //   (c) once Phase 34.4.1 creates a real browser context, humbleDisconnect
  //       MUST be revisited to clear it too, or 34.4.1 silently inherits a
  //       half-finished sign-out.
  // This is the ONE genuine `send` in the Humble half (addListener at
  // humble/ipc_handler.ts:121). WR-02: never discard the disconnect promise
  // silently -- a rejection here (e.g. session.fromPartition throwing) must
  // not become an unhandled rejection in the main process. Never rethrows
  // (sidecar-dialog-reject-crashes).
  ipcMain.on('humbleDisconnect', () => {
    HumbleUser.disconnect().catch((error) =>
      console.warn('[humbleFlowRegistration] humbleDisconnect failed:', error)
    )
  })

  // ── Dev validation (REQ-34.4-08, Plan 05) ─────────────────────────────────
  // Real Electron gates this behind a negated `app` "already packaged" flag
  // (main.ts:965-970), deliberately kept out of humble/ipc_handler.ts's
  // always-on registrar so it can never be accidentally exposed in a
  // packaged build (ipc_handler.ts:13-16). electronStub's `app` shim
  // hardcodes that same flag to false, so reusing that guard verbatim would
  // register this dev-only trigger in EVERY Tauri build. See
  // isPackagedSidecar()'s own docstring above for the resolved node:sea
  // signal.
  if (!isPackagedSidecar()) {
    ipcMain.handle('humbleRunValidation', async () => runHumbleValidation())
  }
}
