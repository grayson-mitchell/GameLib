/**
 * 74-07 (STEAM-02c): the GID-keyed bridge follow-ups after a bridge update,
 * mirroring the post-download half of installBridgeGameLeased without its
 * bottle-removal / bridge-failed branches: the bottle holds an installed game.
 *
 * Shim handover: placeShimForGame -> backupOriginalBeforeOverwrite copies the
 * on-disk DLL over `<dll>.gamelib-orig` only when it is NOT shim bytes, then
 * places the shim. So an update that replaced the shim with a new genuine DLL
 * is handed over, and an untouched shim is a byte-identity no-op.
 *
 * gamelib_bridge.cfg needs the live helper port, which only exists at launch;
 * launchBridgeGameBody rewrites it on every Play (D-51-01).
 */
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type SteamGame from '../games'
import { placeShimForGame } from './shimGenerate'
import { resolveBridgeLaunchExe } from './launchTarget'
import { writeBridgeScanVerdict } from './bridgeVerdict'
import {
  persistBridgeDrmSignal,
  reconcileBridgePrescreen,
  resolveBridgeGameInstallRoot
} from '../bridgeInstallState'
import { prefetchBridgeDrmDownloads } from '../gameLaunch'
import {
  installSharedRedistsWithLogon,
  resolveInstallEngineSettings
} from '../gameInstallBridge'
import { BRIDGE_SHIM_FILENAME, BRIDGE_SHIM64_FILENAME } from './shimOriginals'

export interface BridgeUpdateFollowUpInput {
  changedPaths: string[]
  fullReconcile: boolean
  bridgeBottleName: string
}

export interface BridgeUpdateFollowUpReport {
  shimTouched: boolean
  exePath: string | null
  verdict?: unknown
  redistRan: boolean
  drmPrefetched: boolean
  cfgRewrittenAtLaunch: true
  errors: string[]
}

export function isSteamApiDllPath(manifestPath: string): boolean {
  const base = manifestPath.replace(/\\/g, '/').split('/').pop() ?? ''
  const lower = base.toLowerCase()
  return (
    lower === BRIDGE_SHIM_FILENAME.toLowerCase() ||
    lower === BRIDGE_SHIM64_FILENAME.toLowerCase()
  )
}

/** Never throws; every step is attempted and failures land in report.errors. */
export async function runBridgeUpdateFollowUps(
  steamGame: SteamGame,
  input: BridgeUpdateFollowUpInput
): Promise<BridgeUpdateFollowUpReport> {
  const { appId } = steamGame
  const report: BridgeUpdateFollowUpReport = {
    shimTouched:
      input.fullReconcile || input.changedPaths.some(isSteamApiDllPath),
    exePath: null,
    redistRan: false,
    drmPrefetched: false,
    cfgRewrittenAtLaunch: true,
    errors: []
  }
  const fail = (step: string, error: unknown) => {
    const message = `${step}: ${String(error)}`
    report.errors.push(message)
    logWarning(
      `Steam: bridge update follow-up failed for appId ${appId}: ${message}`,
      LogPrefix.Steam
    )
  }

  try {
    report.exePath =
      (await resolveBridgeLaunchExe(steamGame.deps, appId)) ?? null
  } catch (error) {
    fail('resolve-launch-exe', error)
  }

  const exePath = report.exePath
  if (!exePath) {
    if (report.errors.length === 0) {
      fail('resolve-launch-exe', 'no Windows launch executable resolved')
    }
  } else {
    try {
      const shimResult = await placeShimForGame(
        steamGame.deps,
        steamGame.deps.paths,
        appId,
        exePath,
        {
          bottleName: input.bridgeBottleName,
          gameInstallRoot:
            resolveBridgeGameInstallRoot(
              steamGame,
              exePath,
              input.bridgeBottleName
            ) ?? undefined
        }
      )
      if (
        shimResult.status === 'error' ||
        shimResult.status === 'shim-not-built'
      ) {
        fail(
          'place-shim',
          shimResult.status === 'error' ? shimResult.error : 'shim-not-built'
        )
      } else {
        if (shimResult.verdict) {
          report.verdict = shimResult.verdict
          writeBridgeScanVerdict(steamGame.deps, appId, shimResult.verdict)
        }
        persistBridgeDrmSignal(steamGame, shimResult.drm, 'installBridgeGame')
        reconcileBridgePrescreen(steamGame, shimResult)
      }
    } catch (error) {
      fail('place-shim', error)
    }
  }

  try {
    const redistEngine = await resolveInstallEngineSettings(
      steamGame,
      input.bridgeBottleName,
      null
    )
    if ('skipped' in redistEngine) {
      logInfo(
        `Steam: bridge update redists skipped for appId ${appId}: ${redistEngine.skipped}`,
        LogPrefix.Steam
      )
    } else {
      await installSharedRedistsWithLogon(steamGame, redistEngine.settings)
      report.redistRan = true
    }
  } catch (error) {
    fail('shared-redists', error)
  }

  if (exePath) {
    try {
      await prefetchBridgeDrmDownloads(
        steamGame,
        exePath,
        input.bridgeBottleName
      )
      report.drmPrefetched = true
    } catch (error) {
      fail('drm-prefetch', error)
    }
  }

  logInfo(
    `Steam: bridge update follow-ups appId=${appId} shimTouched=${report.shimTouched} redist=${report.redistRan} drm=${report.drmPrefetched} errors=${report.errors.length}`,
    LogPrefix.Steam
  )
  return report
}
