import { InstallResult } from 'common/types/game_manager'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { steamMetadataStore } from './electronStores'

/**
 * A single tracked native depot-download run for one appId — the value type
 * for nativeInstallsInFlight below. `promise` is the in-flight
 * installDepotDownload() run's own settlement (joined by a second concurrent
 * caller for the same appId, T-23-12); `aborted` is flipped true by stop()
 * alongside callAbortController() so a subsequent installDepotDownload() call
 * can distinguish a genuinely LIVE run (join it) from one that is merely
 * TEARING DOWN after a pause/cancel (await its settlement first, then start a
 * fresh run — T-23-15, no stacking). aborthandler.ts itself exposes no
 * external "is this id's controller aborted" query, so this flag is games.ts's
 * own bookkeeping layer on top of createAbortController/deleteAbortController's
 * create-call-delete lifecycle.
 */
interface NativeInstallEntry {
  promise: Promise<InstallResult>
  aborted: boolean
}

/**
 * appIds with an in-flight native depot download (SNI-07/D-02) — the single
 * source of truth stop() consults to decide whether to abort a real download
 * or stay the historic no-op, AND (T-23-12) the single-flight guard
 * installDepotDownload() consults on entry so a second concurrent call for the
 * same appId never starts a second downloadSteamDepots. Populated for the
 * duration of a native depot-download run only; released in a fail-safe
 * `finally` on success, error, or cancel (T-23-13) so a crashed/aborted run
 * can never permanently block a later re-install of that appId.
 */
export const nativeInstallsInFlight = new Map<string, NativeInstallEntry>()

/**
 * G26: a second Play during bridge pre-flight joined nothing and ran a
 * concurrent engine switch in the same bottle (UAT 38: DXVK removal failed,
 * marker dxvk:"failed"). One launch per appId at a time, released when it
 * settles.
 */
export const bridgeLaunchesInFlight = new Map<string, Promise<boolean>>()

/**
 * quick 261024-urq: appId -> the bridge bottle a live bridge launch was fired
 * into. The single source `SteamGame.stop()` consults to detect the bridge
 * route: the process monitor alone is insufficient (none starts when the
 * install root is unresolved, and it does not carry the bottle name). The
 * value is an object so a late settlement of an earlier launch can tell its
 * own record from a superseding relaunch's (identity compare). Cleared when
 * the game ends on its own, when the launch fails, and by stop().
 */
export const bridgeLaunchBottles = new Map<string, { bottle: string }>()

/**
 * Test-only reset for bridgeLaunchBottles — mirrors
 * `__resetBridgeFailedSessionForTests()`'s convention below. Call in a
 * `beforeEach` so one test's recorded bridge launch cannot make a later
 * test's stop() take the bridge branch.
 */
export function __resetBridgeLaunchBottlesForTests(): void {
  bridgeLaunchBottles.clear()
}

/**
 * Phase 24 Plan 08 (R7, review finding #3 — fallback-bypass): appIds whose
 * bridge path has already failed THIS SESSION (bridge-bottle provisioning
 * failure, depot/shim placement failure, or an unreachable/not-inited
 * helper at launch). `isBridgeEligible()` below consults this set so a
 * user's D-05 fallback re-invocation of install()/launch() routes to the
 * existing bottled-Steam branch instead of looping back into the SAME
 * failing bridge (T-24-17). Session-scoped only (never persisted) — a fresh
 * GameLib process gets a clean slate to retry the bridge for an appId whose
 * earlier failure may have been transient (e.g. Steam not yet signed in).
 */
export const bridgeFailedThisSession = new Set<string>()

/**
 * Quick task 260905-luf (D-01): appIds for which `getGameInfo()`'s double
 * cache miss (both the in-memory `library` Map AND the persisted
 * `steamLibraryStore` missed) has already been logged THIS PROCESS.
 * `getGameInfo()` runs on every library render, so an ungated warning would
 * flood `gamelib.log` on a cold boot with a large, not-yet-hydrated
 * library (T-luf-02). Session-scoped only, per appId — a later miss for a
 * DIFFERENT appId still warns.
 */
export const loggedEmptyGameInfoMisses = new Set<string>()

/**
 * Test-only reset for loggedEmptyGameInfoMisses — mirrors
 * `__resetBridgeFailedSessionForTests()`'s convention above. Unit tests that
 * deliberately drive the double-miss branch for a reused appId must call
 * this (in a `beforeEach`) so one test's miss does not silence the warning
 * for a later test asserting the same appId still warns.
 */
export function __resetLoggedEmptyGameInfoMissesForTests(): void {
  loggedEmptyGameInfoMisses.clear()
}

/**
 * Marks appId as bridge-failed for the remainder of this GameLib process.
 * Called from every terminal bridge-failure branch in install()/launch()
 * (installBridgeGame below; launch()'s bridge branch, Task 3) — never
 * reset except by process restart.
 */
export function markBridgeFailedThisSession(appId: string): void {
  bridgeFailedThisSession.add(appId)
}

/**
 * Test-only reset for bridgeFailedThisSession — mirrors helperProcess.ts's
 * `__resetBridgeHelperStateForTests()` convention (24-06). Unit tests that
 * deliberately drive a bridge failure (BLOCKER 1 provisioning failure,
 * launch readiness failure, etc.) mark real module-scoped state that would
 * otherwise leak into every later test sharing the same appId; call this in
 * a `beforeEach`/`afterEach` rather than relying on every test picking a
 * never-reused dedicated appId.
 */
export function __resetBridgeFailedSessionForTests(): void {
  bridgeFailedThisSession.clear()
}

/**
 * D-UAT-24-03 cascade (a) — un-poisons the session for appId after a
 * successful bridge (re)install. `isBridgeEligible()` consults
 * `bridgeFailedThisSession` for BOTH install() and launch() routing, so a
 * single earlier recoverable failure (e.g. a transient depot-download
 * error) previously stayed sticky for the rest of the process even after a
 * later install attempt actually succeeded — permanently routing that
 * appId's install AND launch down the native/bottled fallback instead of
 * the now-working bridge. Called from installBridgeGame's success path
 * only; a FAILED install still calls markBridgeFailedThisSession and must
 * NOT call this.
 */
export function clearBridgeFailedThisSession(appId: string): void {
  bridgeFailedThisSession.delete(appId)
}

/**
 * T-23-14 read seam: true if a native depot download is currently tracked
 * (live OR tearing down) for this appId. Exposes a minimal boolean over
 * nativeInstallsInFlight — never the mutable registry itself — so library.ts's
 * startup-resume loop can skip an appId already owned by a live in-process
 * install, so a stale on-disk StateFlags=1026 manifest can never spawn a
 * phantom concurrent install racing it.
 */
export function isNativeInstallInFlight(appId: string): boolean {
  return nativeInstallsInFlight.has(appId)
}

/**
 * D-17 (34.13-14) durability writer pair — the write and the erase of
 * `steamMetadataStore`'s `forcedWindowsViaBottle` field, kept next to each
 * other so they read as one contract. Both use a read-modify-write spread
 * (the GAP-B idiom, games.ts's `is_delisted` branch above) rather than a
 * bare `steamMetadataStore.set` with a fresh object literal: `.set()`
 * REPLACES the whole entry (T-18-02-04), so a bare write here would wipe the
 * game's art/extra/platformsCaptured/mac_arch in one call.
 *
 * Called ONLY from install()'s bottle-committing terminal, on a proven
 * success — never on a deferral, a rejected dispatch, or a failed depot
 * download (see install()'s own JSDoc for the exact call site).
 *
 * 34.13 review A-09 / A-14: the fabrication fallback
 * `?? { art_cover: '', art_square: '', extra: { reqs: [] } }` is REMOVED and
 * replaced by an early return. It was unreachable — the only caller is
 * install()'s bottle terminal, reached through
 * `routeThroughBottle = forceWindowsViaBottle || steamGame.isBottleEligible()`,
 * every arm of which requires a `steamMetadataStore` entry to already exist —
 * and it was also WRONG: the entry it fabricated would carry no
 * `platformsCaptured`, i.e. a strictly worse state than the missing read it
 * was compensating for, which `getGameInfo`'s self-heal would then have to
 * undo. Refusing loudly is the correct behaviour for a precondition that
 * cannot legitimately fail.
 */
export function markForcedWindowsViaBottle(appId: string): void {
  const existing = steamMetadataStore.get(appId)
  if (!existing) {
    logWarning(
      `SteamGame: appId ${appId} — refusing to fabricate a metadata entry to record the forced Windows-via-bottle verdict (no entry exists; this call site cannot be reached without one)`,
      LogPrefix.Steam
    )
    return
  }
  steamMetadataStore.set(appId, {
    ...existing,
    forcedWindowsViaBottle: true
  })
  logInfo(
    `SteamGame: appId ${appId} — persisted forced Windows-via-bottle verdict after a committed install`,
    LogPrefix.Steam
  )
}

/**
 * The reversibility half of the pair above — cleared only on an
 * ACF-CONFIRMED bottle uninstall (library.ts's pollUninstallOnce, Task 3),
 * never at dispatch time. Early-returns when no metadata entry exists at
 * all: without that guard, every native uninstall of a never-forced game
 * would fabricate a metadata entry purely to record `false`.
 *
 * 34.13 review A-09 / A-14: it ALSO early-returns when the flag was never
 * set. The previous shape computed `wasForced` and then used it only to gate
 * the LOG LINE — the `steamMetadataStore.set` ran regardless. Since `.set()`
 * REPLACES the whole entry (T-18-02-04), every confirmed-absent bottle tick
 * performed a full read-rewrite of a game's metadata to write a value it
 * already had. A-09 noted this was moot until A-01 landed, because nothing
 * ever set the flag; A-01 landed in 996c192d1, so it is live.
 */
export function clearForcedWindowsViaBottle(appId: string): void {
  const existing = steamMetadataStore.get(appId)
  if (!existing || existing.forcedWindowsViaBottle !== true) return
  steamMetadataStore.set(appId, {
    ...existing,
    forcedWindowsViaBottle: false
  })
  logInfo(
    `SteamGame: appId ${appId} — cleared forced Windows-via-bottle verdict (bottle ACF confirmed absent)`,
    LogPrefix.Steam
  )
}
