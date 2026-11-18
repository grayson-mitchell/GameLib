import type { SteamGameInfo } from 'common/types/steam'
import { ExecResult } from 'common/types'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { getFileSize } from 'backend/utils'
import type { ManagerDeps } from 'backend/services/types'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import {
  type AcfSource,
  installPlatformForSource,
  isBridgeAuthoritativeForInstallState
} from './installRoot'
import { restoreLocalSteamLibrary } from './localLibrary'
import { syncOwnedLibraryRust, tryMacSteamRefresh } from './rustRefresh'
import { macSteamPathEnabled } from './macSteamPathFlag'
import { RUST_STEAMPOLL_STATUS } from 'common/types/sidecarTransport'
import { invokeSteamPoll } from '../pollRust/rustSteamPoll'
import type { PollStatus } from '../pollRust/steamPollTypes'
import { verifyMacArchGroundTruth } from './macArch'
import {
  buildInstalledMap,
  buildBottleInstalledMap,
  buildBridgeInstalledMap,
  installVersionField
} from './installedMap'

export async function refresh(deps: ManagerDeps): Promise<ExecResult | null> {
  // Synchronous and before any await, so a grant armed by the dispatch that
  // triggered THIS call is consumed by this call (and by no other).
  const grant = deps.steamSession.authTrigger.consumeSteamRefreshLogonGrant()

  // Exit path 0: nothing to sync against. `init()` has ALREADY pushed the
  // cached library to the frontend (RESEARCH Finding 9), so emitting 'idle'
  // renders a populated grid and clears any stale 'syncing'.
  const refuseDeferred = async (): Promise<null> => {
    logInfo(
      `Steam: library refresh deferred — no explicit Refresh and no open Steam session, showing the cached library with no CM logon (trigger=${deps.steamSession.authTrigger.currentTriggerLabel()})`,
      LogPrefix.Steam
    )
    await restoreLocalSteamLibrary(deps)
    deps.sendFrontendMessage('steamSyncStatus', { status: 'idle' })
    return null
  }

  let release: () => void
  let client: NonNullable<ReturnType<ManagerDeps['steamUser']['getClient']>>
  if (grant && isMac && macSteamPathEnabled()) {
    // D-14: the running Mac Steam client's own owned set first. No lease, no logon, so it cannot
    // sign Friends out. No grant means no attempt (the deferral rule below is unchanged).
    const macSteamId = deps.steamUser.getPersistedSteamId64()
    if (macSteamId) {
      const mac = await tryMacSteamRefresh(deps, macSteamId)
      if (mac.kind === 'done') return mac.exec
      logInfo(
        `Steam Refresh: Mac Steam path unavailable (${mac.reason}), using CM`,
        LogPrefix.Steam
      )
    }
  }
  if (grant) {
    // An inferred store-exit refresh acquires as a plain 'user-refresh' (quick 261114-aqa).
    const inferred = grant === 'store-exit'
    const lease = await deps.steamUser.acquireAuthenticated({
      reason: inferred ? 'user-refresh' : grant
    })
    if (!lease.ok) {
      // steam-sync-false-failed-banner: "not ready" is not one condition. A
      // terminal CM rejection (AccessDenied) schedules no retry; name it.
      const rejection =
        lease.reason === 'logon-rejected'
          ? deps.steamUser.getLogonFailure()
          : null
      logWarning(
        rejection
          ? `Steam rejected the stored-credential logon (${rejection.message}), skipping library refresh`
          : `Steam client not ready (${lease.reason}), skipping library refresh`,
        LogPrefix.Steam
      )
      // UAT 23: a signed-out boot showed no Steam games and
      // `update check apps=0` because the backend map stayed empty here.
      await restoreLocalSteamLibrary(deps)
      // 34.15 D-07 exit path 1 of 4.
      deps.sendFrontendMessage('steamSyncStatus', {
        status: 'failed',
        reason:
          lease.reason === 'logon-rejected'
            ? 'logon-rejected'
            : 'client-not-ready'
      })
      return null
    }
    release = lease.release
    client = lease.client
  } else {
    const open = await deps.steamUser.acquireOpenAuthenticated('user-refresh')
    if (!open) return refuseDeferred()
    release = open.release
    client = open.client
  }

  try {
    if (!client.steamID) {
      logWarning(
        'Steam client not ready (no steamID), skipping library refresh',
        LogPrefix.Steam
      )
      await restoreLocalSteamLibrary(deps)
      deps.sendFrontendMessage('steamSyncStatus', {
        status: 'failed',
        reason: 'client-not-ready'
      })
      return null
    }
    // 34.15 D-06/D-07: 'syncing' is emitted only once a usable lease exists,
    // which gives the Steam sync tri-state STRUCTURAL meaning ("a refresh is
    // currently running").
    deps.sendFrontendMessage('steamSyncStatus', { status: 'syncing' })
    return await syncOwnedLibraryRust(deps, client)
  } finally {
    release()
  }
}

/**
 * Re-reads ACF manifests from disk via buildInstalledMap(deps) and pushes
 * updated install badges to the frontend for any game whose is_installed
 * state actually changed since the last read.
 *
 * This is the D-01/D-02 reconciliation path:
 *  - D-01: triggered by BrowserWindow 'focus' (main.ts), not by polling.
 *  - D-02: badges flip only after confirmed ACF data; never optimistically
 *    from a click.
 *
 * 17-03 (MACSTEAM-05): when isMac && isBottleProvisioned(), ALSO diffs each
 * library entry against buildBottleInstalledMap(deps) (the dedicated CrossOver
 * bottle's own ACF root) and reconciles bottle-installed games with
 * install.platform: 'Windows' (Pitfall 3) — never the host OS. D-UAT-24-07
 * (quick/261016-u1w D-C): when isMac && listReadyBridgeBottleNames() is
 * non-empty, ALSO diffs against buildBridgeInstalledMap() (every ready
 * bridge bottle's own ACF root — legacy shared bottle plus every per-game
 * bottle), so a bridge-installed game's badge is not clobbered back to
 * false by this focus-triggered reconciliation either — same 'Windows'
 * platform label (installPlatformForSource). Bottle reconciliation is
 * gated strictly behind isBottleProvisioned() (T-17-03: a
 * missing/unprovisioned bottle is a no-op, not a repeated failing scan) and
 * is skipped entirely on Linux/Windows or an un-provisioned macOS, leaving
 * the native-only reconciliation byte-for-byte unchanged in those cases.
 * The native map always takes precedence for a given appId — a bottle
 * result is only consulted when the native scan found nothing for that
 * appId, so the two roots are never double-counted or conflated.
 *
 * Only games whose state changed are pushed (avoids flooding the frontend).
 * The GameInfo install shape matches refresh() when installed:
 *   install_path, install_size, platform ('Windows' always for a bottle
 *   install; host-OS-derived for a native install)
 * and is set to {} when not installed.
 */
export async function refreshInstallState(deps: ManagerDeps): Promise<void> {
  const { steamLibraryStore } = deps.stores.steam
  // D-01: the poll registry lives in Rust. One status call per reconcile, made inside the scan
  // `try` below, so a rejected status read skips the reconcile before any entry is touched
  // (80-REVIEW C-WR-07).
  let activeInstallPolls: Set<string>
  // WR-01 (75 review): a rejected manifest scan (rustInvoke timeout, shell
  // restart) says nothing about what is installed. Skip this reconcile
  // instead of diffing against an empty map, which would persist every
  // installed title as not installed; the next focus retries.
  let installedMap: Awaited<ReturnType<typeof buildInstalledMap>>
  let bottleInstalledMap: Awaited<
    ReturnType<typeof buildBottleInstalledMap>
  > | null
  let bridgeInstalledMap: Awaited<
    ReturnType<typeof buildBridgeInstalledMap>
  > | null
  try {
    // D-11: the installed map is the ACF scan as read, with no hold filter.
    installedMap = await buildInstalledMap(deps)
    const status = (await invokeSteamPoll(
      deps,
      RUST_STEAMPOLL_STATUS
    )) as PollStatus
    activeInstallPolls = new Set(status.installs.map((i) => i.appId))
    bottleInstalledMap =
      isMac && deps.steamBottle.isSteamBottleProvisioned()
        ? await buildBottleInstalledMap(deps)
        : null
    // D-UAT-24-07 (quick/261016-u1w D-C): same bridge-map consult as
    // refresh(), so a focus/post-launch reconciliation does not clobber a
    // bridge-installed game's badge back to false either. Gated on ANY
    // bridge bottle being ready, not just the legacy shared one.
    bridgeInstalledMap =
      isMac && listReadyBridgeBottleNames(deps.paths).length > 0
        ? await buildBridgeInstalledMap(deps.paths, deps)
        : null
  } catch (err) {
    logWarning(
      ['Steam: install-state scan failed; skipping this reconcile:', err],
      LogPrefix.Steam
    )
    return
  }

  for (const [
    appIdStr,
    gameInfo
  ] of deps.steamSession.libraryState.library.entries()) {
    const appId = parseInt(appIdStr, 10)
    const nativeInstalledData = installedMap.get(appId)
    const bottleInstalledData = bottleInstalledMap?.get(appId)
    const bridgeInstalledData = bridgeInstalledMap?.get(appId)
    // D-UAT-24-02 (24-17): same bridge-authoritative selection as
    // refresh() — a bridge-eligible title reconciles ONLY against the
    // bridge map, so a stale native/Phase-17-bottle-only badge gets
    // correctly flipped to not-installed rather than surviving focus
    // reconciliation. Precedence for non-eligible titles is unchanged:
    // native wins, then Phase 17 bottle, then bridge — never
    // double-count/conflate the three roots.
    const bridgeAuthoritative = isBridgeAuthoritativeForInstallState(
      deps,
      appIdStr
    )
    const installedData = bridgeAuthoritative
      ? bridgeInstalledData
      : (nativeInstalledData ?? bottleInstalledData ?? bridgeInstalledData)
    const source: AcfSource = bridgeAuthoritative
      ? 'bridge'
      : nativeInstalledData
        ? 'native'
        : bottleInstalledData
          ? 'bottle'
          : 'bridge'
    const isNowInstalled = !!installedData

    const flipped = gameInfo.is_installed !== isNowInstalled
    // quick 261114-rc8: a Steam update changes the buildid without flipping
    // is_installed, so a version-only change must also persist and push.
    const versionStale =
      isNowInstalled &&
      gameInfo.install?.version !==
        installVersionField(installedData.buildid).version

    if (flipped || versionStale) {
      const updated: SteamGameInfo = {
        ...gameInfo,
        is_installed: isNowInstalled,
        install: isNowInstalled
          ? {
              install_path: installedData.installPath,
              install_size: getFileSize(Number(installedData.sizeOnDisk)),
              platform: installPlatformForSource(source),
              ...installVersionField(installedData.buildid)
            }
          : {}
      }
      deps.steamSession.libraryState.library.set(appIdStr, updated)
      // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately so the in-memory
      // Map and the on-disk cache never diverge (mirrors refresh() and
      // gog/library.ts's installedGamesStore.set-immediately-after-mutate
      // pattern) — otherwise an app restart before the next full refresh()
      // would read a stale is_installed from steamLibraryStore.
      steamLibraryStore.set(
        'games',
        Array.from(deps.steamSession.libraryState.library.values())
      )
      deps.sendFrontendMessage('pushGameToLibrary', updated)

      // quick 261024-exo: arch-check backstop for a delegated steam://install
      // whose poll already stopped (no-manifest window or MAX_TICKS expired
      // while the app stayed open) — focus reconciliation is then the only
      // thing that sees the false->true flip. Fire-and-forget like MAC32-03,
      // placed AFTER the badge flip so it can never delay it. A live poll
      // runs the same check on its own 'installed' tick, so skip when one is
      // registered (no double prompt); verifyMacArchGroundTruth's cached-
      // verdict early return makes repeat focus events cheap.
      if (
        flipped &&
        isNowInstalled &&
        source === 'native' &&
        isMac &&
        !activeInstallPolls.has(appIdStr)
      ) {
        void verifyMacArchGroundTruth(
          deps,
          appIdStr,
          installedData.installPath,
          'native'
        )
      }
    }
  }
}
