import { GameInfo, ExecResult } from 'common/types'
import { logInfo, logError, logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { getFileSize } from 'backend/utils'
import type { ManagerDeps } from 'backend/services/types'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { depotSignalCaptured } from '../metadataCapture'
import { captureOwnedAppMetacritic } from '../metacriticCapture'
import { fetchLicensedDemos, LicensedDemosPicsClient } from '../licensedDemos'
import {
  captureOwnedAppPlatforms,
  type PlatformCapturePicsClient
} from '../platformCapture'
import {
  type AcfSource,
  installPlatformForSource,
  isBridgeAuthoritativeForInstallState
} from './installRoot'
import { restoreLocalSteamLibrary } from './localLibrary'
import { verifyMacArchGroundTruth } from './macArch'
import {
  buildInstalledMap,
  buildIncompleteInstallSet,
  buildBottleInstalledMap,
  buildBridgeInstalledMap
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
  if (grant) {
    const lease = await deps.steamUser.acquireAuthenticated({
      reason: grant,
      guidedAction: 'refresh'
    })
    if (!lease.ok) {
      if (lease.reason === 'go-offline-required') {
        // The guided dialog (pushed by acquireAuthenticated) is the surface,
        // not the failed banner.
        logInfo(
          'Steam: library refresh waiting on the guided Go Offline step, no logon issued',
          LogPrefix.Steam
        )
        await restoreLocalSteamLibrary(deps)
        deps.sendFrontendMessage('steamSyncStatus', { status: 'idle' })
        return null
      }
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
    const open = deps.steamUser.acquireOpenAuthenticated('user-refresh')
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
    return await syncOwnedLibrary(deps, client)
  } finally {
    release()
  }
}

async function syncOwnedLibrary(
  deps: ManagerDeps,
  client: NonNullable<ReturnType<ManagerDeps['steamUser']['getClient']>>
): Promise<ExecResult | null> {
  const { steamLibraryStore, steamMetadataStore, steamSyncStore } =
    deps.stores.steam
  const steamID = client.steamID as NonNullable<typeof client.steamID>
  // ── Step 1: fetch owned games + playtime from Steam CM ────────────────
  let ownedApps: Array<{
    appid: number
    name: string
    playtime_forever: number
    img_icon_url?: string
    /** Unix seconds — exists at runtime in CPlayer_GetOwnedGames_Response_Game but omitted from @types/steam-user */
    rtime_last_played?: number
  }> = []
  try {
    const result = await client.getUserOwnedApps(steamID, {
      includePlayedFreeGames: true
    })
    ownedApps = result.apps
    logInfo(`Steam: fetched ${ownedApps.length} owned games`, LogPrefix.Steam)
  } catch (err) {
    logError(['Steam getUserOwnedApps failed:', err], LogPrefix.Steam)
    // Offline / CM-unreachable fallback — serve cached library (D-09)
    await restoreLocalSteamLibrary(deps, { pushAll: true })
    // 34.15 D-07 exit path 2 of 4. Emitted AFTER the cached-library push
    // above so the renderer already has the cached games in hand
    // before it is told the sync failed — the notice must render above a
    // populated grid, never an empty one.
    deps.sendFrontendMessage('steamSyncStatus', {
      status: 'failed',
      reason: 'owned-apps-failed'
    })
    return { stdout: '', stderr: String(err) }
  }

  // Quick 261031-i0q: licensed demos. Spike 052: getUserOwnedApps never
  // returns demos (free-on-demand licenses), played or not. Only PICS type
  // Demo is added, by user decision; unplayed free-to-play games and every
  // other type are deliberately excluded, so do not widen the filter. Fail
  // soft and bounded by LICENSED_DEMOS_TIMEOUT_MS; reuses the held client,
  // no new logon.
  const demos = await fetchLicensedDemos(
    client as unknown as LicensedDemosPicsClient,
    ownedApps.map((a) => a.appid)
  )
  ownedApps = ownedApps.concat(demos)

  // ── Step 1.5: bulk-capture platform data from PICS (34.15 D-01..D-04) ──
  // WHY HERE (D-03): the CM client is already connected and the owned-app
  // id list is already in hand, so this is one bulk call on a live socket.
  // Placing it before the Step 3 hydration loop means every `GameInfo` is
  // correct on its FIRST push — no re-push, no second IPC event, no
  // convergence window, no resumability machinery.
  //
  // WHY FAIL-SOFT: the bulk capture call below never throws by contract; on
  // timeout or error it returns `failed: true` and the sync continues to
  // today's cache-only hydration below. Fail-closed is this repo's house
  // default and 34.14 D-04's depot fail-open is the first documented
  // exception; this is the SECOND. Aborting here would trade "incomplete
  // metadata" for "no library", which is defect 2's exact shape — a later
  // reviewer must not "fix" this back to fail-closed.
  //
  // WHY THIS DOES NOT MAKE THE DATA COMPLETE (D-05 — the non-consequence):
  // four durable paths keep an unresolved signal reachable for a game that
  // is VISIBLE in the library — (1) this step failing soft; (2) a per-app
  // absent/empty `oslist` correctly writing nothing; (3) the cached-library
  // early returns above (exit paths 1 and 2), neither of which runs this
  // step while games still render; (4) `init()` pushing the persisted list
  // to the frontend independently of `refresh()`, so the library is on
  // screen from the first frame of every cold start. Therefore 34.14's
  // D-04 fail-open, the pending row, and the Install-disable ALL remain
  // load-bearing and must not be weakened, removed, or "simplified" on the
  // grounds that the data is complete now.
  const appIds = ownedApps.map((app) => app.appid)
  // Phase 54 (ROADMAP SC2): the anonymous client goes first; only apps it
  // left uncaptured (public_only) or failed on get a second pass on the
  // session this Refresh already holds. captureOwnedAppPlatforms scopes to
  // still-uncaptured apps, so the second pass covers only that remainder.
  const logCapture = (summary: {
    scopedCount: number
    capturedCount: number
    skippedCount: number
    failed: boolean
  }) =>
    logInfo(
      `Steam bulk platform capture: scoped=${summary.scopedCount} captured=${summary.capturedCount} skipped=${summary.skippedCount} failed=${summary.failed}`,
      LogPrefix.Steam
    )
  const heldClient = client as unknown as PlatformCapturePicsClient
  const anonClient = await deps.anonymousClient.get('platform-capture')
  if (anonClient) {
    const anonSummary = await captureOwnedAppPlatforms(
      deps,
      anonClient as unknown as PlatformCapturePicsClient,
      appIds
    )
    logCapture(anonSummary)
    if (
      anonSummary.failed ||
      anonSummary.capturedCount < anonSummary.scopedCount
    ) {
      logInfo(
        `Steam bulk platform capture: anonymous pass left ${anonSummary.scopedCount - anonSummary.capturedCount} uncaptured (public_only or failed), second pass on the held session`,
        LogPrefix.Steam
      )
      logCapture(await captureOwnedAppPlatforms(deps, heldClient, appIds))
    }
  } else {
    logCapture(await captureOwnedAppPlatforms(deps, heldClient, appIds))
  }

  // Quick 261029-sbi: bulk Metacritic score capture. Public appinfo, so the
  // anonymous client is enough (Phase 54); otherwise only the session this
  // Refresh already holds, never a new sign-in. Single pass with no
  // held-session second pass: an app missed here stays uncaptured and is
  // retried on the next sync. Return value deliberately unread.
  await captureOwnedAppMetacritic(
    deps,
    (anonClient ?? heldClient) as unknown as PlatformCapturePicsClient,
    appIds
  )

  // 34.15 D-07 exit path 4 of 4 — the previously UNDOCUMENTED one. Steps 2-4
  // below carried NO try/catch at HEAD, so a hydration-loop exception (e.g.
  // a corrupt ACF file, a throwing map builder) became an unhandled
  // rejection with ZERO ui signal on the unscoped mount-time path
  // (init()'s `runOnceWhenOnline(() => refresh())`;
  // online_monitor.ts's runOnceWhenOnline discards the callback's return
  // value with no `.catch` anywhere in the chain). The two obvious
  // `return`s above are NOT the exhaustive exit census — this wraps the
  // ~140-line uncovered span. Re-throwing after emitting preserves the
  // existing main.ts refreshLibrary IPC-rejection shape for the scoped
  // caller (GlobalState's own catch already handles it); the emit is what
  // closes the silent mount-time path.
  try {
    // ── Step 2: build install-state map(s) from ACF manifests on disk ─────
    // Bottle-aware (GAP-17-BOTTLE-PLAY-REVERT): this full resync can be
    // triggered mid-session (e.g. the launch-completion 'done' status), so it
    // must reconcile bottle-installed games the same way refreshInstallState()
    // does — otherwise a bottle-only-installed game's is_installed gets
    // clobbered back to false by this native-only scan every time it runs.
    // D-UAT-13: apps whose poll is holding for a Steam restart are NOT
    // installed yet as far as the user-facing state goes (the running
    // Steam client has never read their GameLib-written manifest).
    const installedMap =
      deps.steamInstallRuntime.restartHold.withoutSteamRestartHolds(
        await buildInstalledMap(deps)
      )
    const bottleInstalledMap =
      isMac && deps.steamBottle.isSteamBottleProvisioned()
        ? await buildBottleInstalledMap(deps)
        : null
    // D-UAT-24-07: consult every ready bridge bottle too (quick/261016-u1w
    // D-C), so a bridge-installed game (24-12's install poll flips
    // is_installed:true on install) stays installed across this periodic
    // sync instead of being clobbered back to false — gated on ANY bridge
    // bottle being ready (legacy or per-game), so a host with no bridge
    // bottle provisioned at all skips this scan entirely (no new failing
    // scan, native/bottle behavior unchanged).
    const bridgeInstalledMap =
      isMac && listReadyBridgeBottleNames(deps.paths).length > 0
        ? await buildBridgeInstalledMap(deps.paths, deps)
        : null
    // Phase 54: repair missing bridge launch targets for installed bridge
    // titles (pre-Phase-54 installs of gated apps) on the lease this Refresh
    // already holds. Never reached on the ungranted path, so Play stays free
    // of CM work. Fail-soft: a rejection must not change the sync outcome.
    if (bridgeInstalledMap && bridgeInstalledMap.size > 0) {
      await backfillBridgeLaunchTargets(
        deps,
        client as unknown as Parameters<typeof backfillBridgeLaunchTargets>[1],
        [...bridgeInstalledMap.keys()].map(String)
      ).catch((err: unknown) => {
        logWarning(
          ['Steam bridge launch-target backfill failed:', err],
          LogPrefix.Steam
        )
      })
    }
    // WR-01 (21-17): the incomplete-on-disk set (native ACF present, bit 4
    // unset — e.g. a 1026 cancel handoff). Because this rebuild does
    // library.clear() below and derives each GameInfo purely from the ACF
    // scan, the same-session steamResumePending marker (markSteamInstallIncomplete)
    // would otherwise be silently wiped on the first mid-session resync,
    // reverting "Resume Install" back to a bare "Install" (the D-UAT-09
    // symptom). Deriving the flag from on-disk state here makes it durable
    // across any number of refreshes.
    const incompleteSet = await buildIncompleteInstallSet(deps)

    // 260821-rb5: capture install-start breadcrumbs BEFORE library.clear()
    // below wipes the in-memory Map. refresh() rebuilds every GameInfo
    // purely from the ACF scan + ownership data, and a case-C breadcrumb
    // has NO ACF by definition — the same wipe shape WR-01/D-UAT-09
    // already had to fix for the ACF-derived steamResumePending flag
    // above, but for a field the ACF scan can never re-derive. Without
    // this, the first mid-session resync — which init() itself kicks off
    // via runOnceWhenOnline(() => refresh()) — silently wipes the
    // breadcrumb and the whole fix evaporates.
    const breadcrumbs = new Map<
      string,
      { targetSteamappsDir: string; installdir: string }
    >()
    for (const [
      appId,
      info
    ] of deps.steamSession.libraryState.library.entries()) {
      if (
        info.install?.steamResumeTargetSteamappsDir &&
        info.install?.steamResumeInstalldir
      ) {
        breadcrumbs.set(appId, {
          targetSteamappsDir: info.install.steamResumeTargetSteamappsDir,
          installdir: info.install.steamResumeInstalldir
        })
      }
    }

    // ── Step 3: build and push one GameInfo per owned game ────────────────
    deps.steamSession.libraryState.library.clear()
    for (const app of ownedApps) {
      const appIdStr = String(app.appid)
      const nativeInstalledData = installedMap.get(app.appid)
      const bottleInstalledData = bottleInstalledMap?.get(app.appid)
      const bridgeInstalledData = bridgeInstalledMap?.get(app.appid)
      // D-UAT-24-02 (24-17): for a bridge-eligible title, install-state is
      // authoritative to the bridge bottle ONLY — native/Phase-17-bottle
      // copies must not shadow the bridge (they'd show Play while the
      // bridge bottle doesn't have the game, dead-ending the launch).
      // Precedence for NON-eligible titles is unchanged: native wins, then
      // Phase 17 bottle, then bridge — never double-count/conflate the
      // three roots (mirrors refreshInstallState()'s reconciliation;
      // D-UAT-24-07 adds the bridge tier last so native/bottle behavior is
      // byte-for-byte unchanged when they match).
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
      const cachedMeta = steamMetadataStore.get(appIdStr)

      const gameInfo: GameInfo = {
        runner: 'steam',
        app_name: appIdStr,
        title: app.name,
        // Seed artwork from metadata cache so previously fetched art survives resync
        art_cover: cachedMeta?.art_cover ?? '',
        art_square: cachedMeta?.art_square ?? '',
        // DETAIL-01: seed native platform flags from the metadata cache so the
        // platform icons survive a resync (fetchMetadataIfNeeded populates these).
        // D-17: is_windows_native is deliberately NOT defaulted (34.13
        // review WR-16). Both `common/types.ts` and `stores.ts`
        // document this field as THREE-valued: `undefined` means "never
        // captured (pre-34.13 entry)", `false` means "confirmed no Windows
        // depot", and only `=== true` permits offering a Windows install.
        // Collapsing `undefined -> false` here destroyed the first state at
        // the `GameInfo` boundary, so the renderer
        // (`steamPlatformRow.ts`) could no longer tell a cold-cache game
        // from a confirmed Windows-less one. Behaviour is unchanged today
        // — the field is optional on `GameInfo` and EVERY consumer tests
        // `=== true`, so an absent or never-captured entry still proves
        // nothing about a Windows depot and still can never offer the
        // option — but the documented contract is now preserved rather
        // than contradicted.
        is_mac_native: cachedMeta?.is_mac_native ?? false,
        is_linux_native: cachedMeta?.is_linux_native ?? false,
        is_windows_native: cachedMeta?.is_windows_native,
        metacritic_score: cachedMeta?.metacritic_score,
        // GAP-B: seed the persisted delisted verdict so it survives a library resync
        is_delisted: cachedMeta?.is_delisted ?? false,
        // CR-01 fix: seed the persisted Mach-O ground-truth verdict so a
        // cached '32' survives every startup/resync. Default MUST be
        // 'unknown' (never '32') — a missing/blank cache can never be
        // coerced into a 32-bit verdict (T-18-05-02, false-flag-safe
        // invariant from MAC32-01).
        mac_arch: cachedMeta?.mac_arch ?? 'unknown',
        // Phase 17 D-08 reconciliation, NARROWED by quick task 260816-hdg.
        // This field no longer mirrors the D-11 routing gate, and the
        // divergence is deliberate: it seeds the frontend's
        // `hasSteamDepotSignalCaptured`, which asks the DEPOT question, while
        // the D-11 gate (isBridgeAuthoritativeForInstallState, above in this
        // file) asks the MAC question and is unchanged. Routed through
        // depotSignalCaptured so a pre-D-17 residue entry — which flagged the
        // platforms fetch complete without ever writing the Windows field —
        // stops claiming a depot signal it never captured. Consequence,
        // accepted: AppleWikiInfo.tsx's section hides for such a game until
        // getGameInfo's self-heal refetch lands, which is one fetch away.
        steamPlatformsCaptured: depotSignalCaptured(cachedMeta),
        is_installed: !!installedData,
        install: installedData
          ? {
              install_path: installedData.installPath,
              install_size: getFileSize(Number(installedData.sizeOnDisk)),
              // GAP-17-BOTTLE-PLAY-REVERT: platform must reflect which root
              // actually matched (native vs bottle), never hardcoded — a
              // bottle-installed game must always report 'Windows' (Pitfall 3).
              platform: installPlatformForSource(source)
            }
          : // WR-01 (21-17): no fully-installed manifest, but an incomplete
            // (bit-4-unset) native ACF is on disk — durably re-surface the
            // "Resume Install" resume affordance. is_installed stays false
            // (installedData is falsy here), so the no-regression Play-safety
            // truth holds; a fully-installed ACF took the branch above and
            // still yields is_installed=true + Play.
            incompleteSet.has(app.appid)
            ? { steamResumePending: true }
            : {},
        extra: {
          reqs: [],
          // cachedMeta.extra preserves about/genres/art metadata from prior fetches.
          // Playtime and last-played must reflect the latest sync (fresh wins over stale),
          // so dynamic Steam fields are placed AFTER the spread to override any cached values.
          ...(cachedMeta?.extra ?? {}),
          steamPlaytimeMinutes: app.playtime_forever,
          steamLastPlayed: app.rtime_last_played ?? 0
        },
        canRunOffline: true,
        installable: true,
        store_url: `https://store.steampowered.com/app/${app.appid}/`
      }

      // 260821-rb5: re-apply a captured breadcrumb (see above, before
      // library.clear()). Property-mutation after construction, rather
      // than a fourth arm on the `install:` ternary above, to keep this
      // diff surgical against an already 100-line object literal. The
      // `!installedData` guard is the SAME self-heal rule as init()'s
      // startup self-heal: a game that is now fully installed drops its
      // breadcrumb instead of carrying it forward.
      const breadcrumb = breadcrumbs.get(appIdStr)
      if (breadcrumb && !installedData) {
        gameInfo.install = {
          ...gameInfo.install,
          steamResumePending: true,
          steamResumeTargetSteamappsDir: breadcrumb.targetSteamappsDir,
          steamResumeInstalldir: breadcrumb.installdir
        }
      }

      deps.steamSession.libraryState.library.set(appIdStr, gameInfo)
      deps.sendFrontendMessage('pushGameToLibrary', gameInfo)
    }

    // ── Step 4: persist library list and sync timestamp ───────────────────
    steamLibraryStore.set(
      'games',
      Array.from(deps.steamSession.libraryState.library.values())
    )
    steamSyncStore.set('syncedAt', Date.now())
  } catch (err) {
    logError(
      ['Steam library sync failed during hydration:', err],
      LogPrefix.Steam
    )
    // 34.15 D-07 exit path 4 of 4 (see the try's own doc comment above for
    // why this path was previously silent). Re-thrown after emitting so
    // main.ts's refreshLibrary IPC handler still rejects for a
    // scoped-refresh caller, exactly as before this plan — only the emit
    // is new.
    deps.sendFrontendMessage('steamSyncStatus', {
      status: 'failed',
      reason: 'sync-failed'
    })
    throw err
  }
  logInfo(
    `Steam library sync complete: ${deps.steamSession.libraryState.library.size} games`,
    LogPrefix.Steam
  )
  // 34.15 D-07 exit path 3 of 4 (success).
  deps.sendFrontendMessage('steamSyncStatus', { status: 'idle' })
  return {
    stdout: `${deps.steamSession.libraryState.library.size} games synced`,
    stderr: ''
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
  // D-UAT-13: a window-focus reconcile (the user alt-tabbing to Steam to
  // restart it) must not flip a game that is holding for a Steam restart to
  // installed — see withoutSteamRestartHolds().
  const installedMap =
    deps.steamInstallRuntime.restartHold.withoutSteamRestartHolds(
      await buildInstalledMap(deps)
    )
  const bottleInstalledMap =
    isMac && deps.steamBottle.isSteamBottleProvisioned()
      ? await buildBottleInstalledMap(deps)
      : null
  // D-UAT-24-07 (quick/261016-u1w D-C): same bridge-map consult as
  // refresh(), so a focus/post-launch reconciliation does not clobber a
  // bridge-installed game's badge back to false either. Gated on ANY
  // bridge bottle being ready, not just the legacy shared one.
  const bridgeInstalledMap =
    isMac && listReadyBridgeBottleNames(deps.paths).length > 0
      ? await buildBridgeInstalledMap(deps.paths, deps)
      : null

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

    if (gameInfo.is_installed !== isNowInstalled) {
      const updated: GameInfo = {
        ...gameInfo,
        is_installed: isNowInstalled,
        install: isNowInstalled
          ? {
              install_path: installedData.installPath,
              install_size: getFileSize(Number(installedData.sizeOnDisk)),
              platform: installPlatformForSource(source)
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
        isNowInstalled &&
        source === 'native' &&
        isMac &&
        !deps.steamInstallRuntime.polls.activePolls.has(appIdStr)
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
