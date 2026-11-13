/**
 * Phase 74 plan 11: the renderer's view of a Steam game's update (STEAM-01).
 *
 * Reads the per-boot update-state cache, falling back to one anonymous, bounded detection when
 * nothing is cached; a cached registered state is re-used only while the ACF still matches it, else re-detected. The size estimate is returned only when it is already cached for the target
 * build, or when the caller explicitly asked for it (`computeSize`, a user click) on a stale bridge
 * game: that is the only path here that may take an authenticated lease. Never throws.
 * Exit contract: no timers or handles.
 */
import { logWarning, LogPrefix } from 'backend/logger'
import { Path } from 'backend/schemas'
import { getDiskInfo } from 'backend/utils/filesystem'
import type { ManagerDeps } from 'backend/services/types'
import type { SteamUpdateInfo } from 'common/types/steam'
import SteamGame from './games'
import {
  isAcfUpdatePending,
  readAcfUpdateState
} from './library/acfUpdateState'
import { NUMERIC_APP_ID } from './gameConstants'
import {
  estimateBridgeUpdate,
  resolveBridgeUpdateContext
} from './depotRust/updateEstimate'
import {
  detectSteamUpdates,
  getLastKnownSteamUpdateState,
  STEAM_UPDATE_REFRESH_TIMEOUT_MS,
  type SteamUpdateDeps,
  type SteamUpdateState
} from './updateDetection'

export async function getSteamUpdateInfo(
  deps: ManagerDeps,
  appId: string,
  opts: { computeSize?: boolean } = {}
): Promise<SteamUpdateInfo | null> {
  if (typeof appId !== 'string' || !NUMERIC_APP_ID.test(appId)) return null
  try {
    const updateDeps = deps as unknown as SteamUpdateDeps
    let state: SteamUpdateState | undefined = getLastKnownSteamUpdateState(
      updateDeps,
      appId
    )
    if (!state) {
      ;[state] = await detectSteamUpdates(updateDeps, {
        appIds: [appId],
        timeoutMs: STEAM_UPDATE_REFRESH_TIMEOUT_MS
      })
    } else if (state.kind === 'registered') {
      // The ACF is the source of truth for a registered game; a cached state goes stale the moment
      // Steam finishes an update (74 UAT 12). An unchanged ACF costs no network; otherwise re-detect.
      const fields = await readAcfUpdateState(deps, appId, 'native').catch(
        () => null
      )
      const unchanged =
        fields !== null &&
        fields.buildid === state.installedBuild &&
        isAcfUpdatePending(fields) === (state.pending !== undefined)
      if (!unchanged) {
        const [fresh] = await detectSteamUpdates(updateDeps, {
          appIds: [appId],
          timeoutMs: STEAM_UPDATE_REFRESH_TIMEOUT_MS
        })
        if (fresh) state = fresh
      }
    }
    if (!state) return null

    const info: SteamUpdateInfo = {
      kind: state.kind,
      state: state.state,
      installedBuild: state.installedBuild,
      branch: state.branch
    }
    if (state.targetBuild !== undefined) info.targetBuild = state.targetBuild
    if (state.reason !== undefined) info.reason = state.reason

    let cached = state.estimate
    if (cached && cached.targetBuild !== state.targetBuild) cached = undefined
    let estimate: SteamUpdateInfo['estimate']
    if (cached) {
      estimate = {
        downloadBytes: cached.downloadBytes,
        peakBytes: cached.peakBytes,
        oldManifestAvailable: cached.oldManifestAvailable,
        isEstimate: true
      }
    }

    if (
      opts.computeSize === true &&
      state.kind === 'bridge' &&
      state.state === 'stale'
    ) {
      const game = new SteamGame(appId, deps)
      const res = await estimateBridgeUpdate(game, {})
      if ('error' in res) {
        info.sizeError = res.error
        estimate = undefined
      } else {
        estimate = {
          downloadBytes: res.downloadBytes,
          peakBytes: res.peakBytes,
          oldManifestAvailable: res.oldManifestAvailable,
          isEstimate: true
        }
      }
    }
    if (estimate && state.kind === 'bridge' && state.state === 'stale') {
      const ctx = opts.computeSize
        ? await resolveBridgeUpdateContext(new SteamGame(appId, deps))
        : undefined
      if (ctx && !('error' in ctx)) {
        try {
          const disk = await getDiskInfo(deps, Path.parse(ctx.steamappsDir))
          estimate.freeBytes = disk.freeSpace
        } catch {
          // freeBytes stays undefined
        }
      }
    }
    if (estimate) info.estimate = estimate
    return info
  } catch (error) {
    logWarning(
      `getSteamUpdateInfo: appId ${appId} failed: ${String(error)}`,
      LogPrefix.Steam
    )
    return null
  }
}
