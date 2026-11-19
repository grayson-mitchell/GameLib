import { InstallResult } from 'common/types/game_manager'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SteamStoresDeps } from './library/installRoot'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMPOLL_NATIVE_IN_FLIGHT } from 'common/types/sidecarTransport'
import { invokeSteamPoll } from './pollRust/rustSteamPoll'

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

export interface SteamGameSessionState {
  /**
   * appIds with an in-flight native depot download (SNI-07/D-02) -- the single
   * source of truth stop() consults to decide whether to abort a real download
   * or stay the historic no-op, AND (T-23-12) the single-flight guard
   * installDepotDownload() consults on entry so a second concurrent call for the
   * same appId never starts a second downloadSteamDepots. Populated for the
   * duration of a native depot-download run only; released in a fail-safe
   * `finally` on success, error, or cancel (T-23-13) so a crashed/aborted run
   * can never permanently block a later re-install of that appId.
   */
  nativeInstallsInFlight: Map<string, NativeInstallEntry>
  /**
   * G26: a second Play during bridge pre-flight joined nothing and ran a
   * concurrent engine switch in the same bottle (UAT 38: DXVK removal failed,
   * marker dxvk:"failed"). One launch per appId at a time, released when it
   * settles. Also feeds the Steam restart guards (runningBridgedAppId, quick
   * 261119-se9).
   */
  bridgeLaunchesInFlight: Map<string, Promise<boolean>>
  /**
   * quick 261024-urq: appId -> the bridge bottle a live bridge launch was fired
   * into. The single source `SteamGame.stop()` consults to detect the bridge
   * route: the process monitor alone is insufficient (none starts when the
   * install root is unresolved, and it does not carry the bottle name). The
   * value is an object so a late settlement of an earlier launch can tell its
   * own record from a superseding relaunch's (identity compare). Cleared when
   * the game ends on its own, when the launch fails, and by stop(). Also feeds
   * the Steam restart guards (runningBridgedAppId, quick 261119-se9).
   */
  bridgeLaunchBottles: Map<string, { bottle: string }>
  /**
   * Phase 24 Plan 08 (R7, review finding #3 -- fallback-bypass): appIds whose
   * bridge path has already failed THIS SESSION (bridge-bottle provisioning
   * failure, depot/shim placement failure, or an unreachable/not-inited
   * helper at launch). `isBridgeEligible()` consults this set so a user's D-05
   * fallback re-invocation of install()/launch() routes to the existing
   * bottled-Steam branch instead of looping back into the SAME failing bridge
   * (T-24-17). Session-scoped only (never persisted) -- a fresh GameLib process
   * gets a clean slate to retry the bridge for an appId whose earlier failure
   * may have been transient (e.g. Steam not yet signed in).
   */
  bridgeFailedThisSession: Set<string>
  /**
   * Quick task 260905-luf (D-01): appIds for which `getGameInfo()`'s double
   * cache miss (both the in-memory `library` Map AND the persisted
   * `steamLibraryStore` missed) has already been logged THIS PROCESS.
   * `getGameInfo()` runs on every library render, so an ungated warning would
   * flood `gamelib.log` on a cold boot with a large, not-yet-hydrated library
   * (T-luf-02). Session-scoped only, per appId -- a later miss for a DIFFERENT
   * appId still warns.
   */
  loggedEmptyGameInfoMisses: Set<string>
  /**
   * Marks appId as bridge-failed for the remainder of this GameLib process.
   * Called from every terminal bridge-failure branch in install()/launch() --
   * never reset except by process restart.
   */
  markBridgeFailedThisSession(appId: string): void
  /**
   * D-UAT-24-03 cascade (a) -- un-poisons the session for appId after a
   * successful bridge (re)install. Called from installBridgeGame's success path
   * only; a FAILED install still calls markBridgeFailedThisSession and must NOT
   * call this.
   */
  clearBridgeFailedThisSession(appId: string): void
  /**
   * T-23-14 read seam: true if a native depot download is currently tracked
   * (live OR tearing down) for this appId. Exposes a minimal boolean over
   * nativeInstallsInFlight so library.ts's startup-resume loop can skip an
   * appId already owned by a live in-process install, so a stale on-disk
   * StateFlags=1026 manifest can never spawn a phantom concurrent install
   * racing it.
   */
  isNativeInstallInFlight(appId: string): boolean
}

/**
 * R7: every change to the in-flight set is pushed to Rust (fire and forget), so Rust
 * never calls back into TS per tick. The read API is a plain Map's.
 *
 * The pushes are serialised on one promise chain (80-REVIEW C-WR-06): the shell answers each
 * rustInvoke on its own worker thread, so two independent invokes for a fast set -> delete could
 * land in Rust as false-then-true and leave the app marked in flight. Each push is sent only
 * after the previous one settled, so Rust applies them in call order.
 */
class MirroredInFlightMap extends Map<string, NativeInstallEntry> {
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly rust?: Partial<RustInvokeDeps>) {
    super()
  }

  private push(appId: string, inFlight: boolean): void {
    const requestRustInvoke = this.rust?.requestRustInvoke
    if (!requestRustInvoke) return
    this.tail = this.tail.then(() =>
      invokeSteamPoll({ requestRustInvoke }, RUST_STEAMPOLL_NATIVE_IN_FLIGHT, {
        appId,
        inFlight
      }).then(
        () => undefined,
        (error: unknown) => {
          logWarning(
            [
              `steampoll native in-flight push failed (${RUST_STEAMPOLL_NATIVE_IN_FLIGHT}, appId ${appId}):`,
              error
            ],
            LogPrefix.Steam
          )
        }
      )
    )
  }

  override set(appId: string, entry: NativeInstallEntry): this {
    const isNew = !this.has(appId)
    super.set(appId, entry)
    if (isNew) this.push(appId, true)
    return this
  }

  override delete(appId: string): boolean {
    const had = super.delete(appId)
    if (had) this.push(appId, false)
    return had
  }

  // A plain Map.clear() would skip the mirror and leave Rust's set stale (80-REVIEW C-WR-06).
  override clear(): void {
    const appIds = [...this.keys()]
    super.clear()
    for (const appId of appIds) this.push(appId, false)
  }
}

/**
 * The appId of a bridged session GameLib launched that is still active, or 0 (quick
 * 261119-se9). Counts every appId in `bridgeLaunchesInFlight` (Play through pre-flight, until the
 * wine spawn settles) and `bridgeLaunchBottles` (spawned, not yet seen to end), and returns the
 * lowest positive one so the answer is deterministic. The Mac Steam restart guards treat it as a
 * game running in Steam: quitting Mac Steam mid-session breaks the bridge's connection to it.
 *
 * It is launch bookkeeping, not a process scan, because a bridged game's processes are wine
 * binaries that no path scan can map to an appId, and no helper, HELLO marker, engine ledger or
 * monitor phase covers the whole session (a no-steam-api launch spawns no helper; HELLO arrives
 * after pre-flight; the monitor also covers bottled Steam). The bookkeeping lives for one boot, so
 * a session left over from a previous GameLib process is not counted.
 */
export function runningBridgedAppId(
  session: Pick<
    SteamGameSessionState,
    'bridgeLaunchBottles' | 'bridgeLaunchesInFlight'
  >
): number {
  let lowest = 0
  for (const key of [
    ...session.bridgeLaunchBottles.keys(),
    ...session.bridgeLaunchesInFlight.keys()
  ]) {
    const id = Number(key)
    if (!Number.isSafeInteger(id) || id <= 0) continue
    if (lowest === 0 || id < lowest) lowest = id
  }
  return lowest
}

/** One instance per boot (D-05, D-66.3-13): every map and set is per-instance, so two boots never share a session. */
export function createSteamGameSessionState(
  rust?: Partial<RustInvokeDeps>
): SteamGameSessionState {
  const nativeInstallsInFlight = new MirroredInFlightMap(rust)
  const bridgeFailedThisSession = new Set<string>()
  return {
    nativeInstallsInFlight,
    bridgeLaunchesInFlight: new Map<string, Promise<boolean>>(),
    bridgeLaunchBottles: new Map<string, { bottle: string }>(),
    bridgeFailedThisSession,
    loggedEmptyGameInfoMisses: new Set<string>(),
    markBridgeFailedThisSession: (appId) => {
      bridgeFailedThisSession.add(appId)
    },
    clearBridgeFailedThisSession: (appId) => {
      bridgeFailedThisSession.delete(appId)
    },
    isNativeInstallInFlight: (appId) => nativeInstallsInFlight.has(appId)
  }
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
export function markForcedWindowsViaBottle(
  deps: SteamStoresDeps,
  appId: string
): void {
  const { steamMetadataStore } = deps.stores.steam
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
 * ACF-CONFIRMED bottle or bridge-bottle uninstall (library.ts's
 * pollUninstallOnce, Task 3; bridge added by quick 261107-lum),
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
export function clearForcedWindowsViaBottle(
  deps: SteamStoresDeps,
  appId: string
): void {
  const { steamMetadataStore } = deps.stores.steam
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
