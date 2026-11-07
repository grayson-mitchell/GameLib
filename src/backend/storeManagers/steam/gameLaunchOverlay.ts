/**
 * Launch overlay helpers lifted out of SteamGame (62-07, D-06 mechanical
 * lift: this -> steamGame).
 * Public SteamGame entry points keep a delegating stub on the class;
 * internal helpers are called directly by sibling lifted modules, importing
 * forward only (gameEligibility/gameLaunchOverlay -> gameInstall ->
 * gameLaunch -> gameBridgeLaunch). A call a test spies on stays a
 * `steamGame.X()` call (quick-261107-an2).
 */
import i18next from 'i18next'
import { lstatSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { GameSettings } from 'common/types'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'
import {
  getBridgeBottleSettings,
  getDrmBridgeRunner,
  clearDrmBridgeRunner,
  setOverlayBridgeRunner,
  endPerGameBridgeBottleSessionWith
} from './bottle'
// Phase 60: Steam overlay in bridged games (macOS).
import {
  overlayInputProbeFromEnv,
  prepareOverlayEnv,
  prepareOverlayLaunch,
  type OverlayLaunchPayload
} from './bridge/overlay/overlayLaunch'
import {
  resolveOverlayEnabled,
  readStoredOverlayOverride
} from './bridge/overlay/overlayPolicy'
import { buildOverlayPaths } from './bridge/overlay/overlayPaths'
import {
  formatOverlayNoticeLine,
  OVERLAY_STEP_TEXT,
  OVERLAY_STEPS,
  type OverlayStep
} from './bridge/overlay/overlayNotice'
import { publishOverlayNotice } from 'backend/engine/engineState'
import { STEAM_ENGINE_RUNNER } from './engine/steamEngineDeps'
import { readKnownFixes } from 'backend/knownFixes'
import type { OverlayRunnerReady } from './bridge/overlay/overlayRunnerClone'
import { DRM_END_SESSION_TIMEOUT_MS } from './bridge/drm/drmLaunchSetup'
import {
  builtOverlayShimPath,
  builtOverlayInputPath,
  builtOverlayInputProbePath,
  appFolder,
  userHome
} from 'backend/constants/paths'
import { MAC_STEAM_CLIENT_SUBPATH } from './gameDrmLaunch'
import type SteamGame from './games'
// 60-18 `## G1 experiment verdict`: verdict code and `fix routes:` line. The
// DRM route is never in the set (D-04: unchanged).
const OVERLAY_INPUT_FIX_CODE = 'X-RELEASE+BLOCK'
const OVERLAY_INPUT_FIX_ROUTES: ReadonlySet<string> = new Set([
  'tcp-clone',
  'env'
])

/**
 * Phase 60 (D-01/D-03): whether the overlay is on for this launch, and why.
 * Never throws: a failure here means no overlay, never a blocked launch.
 */
export function resolveLaunchOverlay(steamGame: SteamGame): {
  enabled: boolean
  source: string
} {
  try {
    const r = resolveOverlayEnabled({
      platform: process.platform,
      userOverride: readStoredOverlayOverride(steamGame.appId),
      knownFixOff:
        readKnownFixes(steamGame.appId, 'steam')?.steamGameOverlay === 'off'
    })
    logInfo(
      `SteamGame: appId ${steamGame.appId} overlay=${r.enabled ? 'on' : 'off'} source=${r.source}`,
      LogPrefix.Steam
    )
    return r
  } catch (error) {
    logWarning(
      `SteamGame: appId ${steamGame.appId} overlay policy failed, launching without the overlay: ${String(error)}`,
      LogPrefix.Steam
    )
    return { enabled: false, source: 'default' }
  }
}

/**
 * Phase 60 (D-08/D-09): an overlay setup failure is a log line plus a toast
 * in-app (SteamEngineLaunchNotice) and an OS notification on EVERY affected
 * launch, never a dialog, never deduped. Deliberately the
 * opposite of DRM's fail-closed rule (D-56-13): the overlay is an
 * enhancement, so the game still launches.
 */
export function notifyOverlaySetupFailed(
  steamGame: SteamGame,
  step: OverlayStep,
  cause: string
): void {
  logWarning(
    formatOverlayNoticeLine(steamGame.appId, step, cause),
    LogPrefix.Steam
  )
  const pushed = (OVERLAY_STEPS as readonly string[]).includes(step)
    ? publishOverlayNotice(
        { runner: STEAM_ENGINE_RUNNER, appName: steamGame.appId },
        step
      )
    : false
  logInfo(
    `SteamGame: appId ${steamGame.appId} overlay notice surface=in-app pushed=${pushed}`,
    LogPrefix.Steam
  )
  notify({
    title: i18next.t(
      'gamelib:steam.overlay.toast.title',
      'Steam overlay unavailable'
    ),
    body: i18next.t(
      'gamelib:steam.overlay.toast.body',
      '{{step}} The game is launching without the Steam overlay.',
      {
        step: i18next.t(
          'gamelib:' + OVERLAY_STEP_TEXT[step].key,
          OVERLAY_STEP_TEXT[step].en
        )
      }
    )
  })
}

export function overlayInputLine(
  steamGame: SteamGame,
  applied: boolean,
  reason?: string
): string {
  return `SteamGame: appId ${steamGame.appId} overlay input fix=${OVERLAY_INPUT_FIX_CODE} applied=${applied}${
    reason ? ` reason=${reason}` : ''
  }`
}

/**
 * 60-20 (G1): route-scoped overlay_input.dylib. Synchronous, no handle or
 * timer, never throws, never raises a notice (D-08). Together with
 * logOverlayInputOutcome it logs exactly one `overlay input fix=` line per
 * overlay launch: a refusal (route, disabled, experiment, probe, missing) is
 * logged here; a candidate path is returned unlogged and its outcome is logged
 * once the launch values are known (60-REVIEW WR-04). The DRM route only logs:
 * its result is not spread into the launch (D-04).
 */
export function overlayInputArg(
  steamGame: SteamGame,
  route: 'tcp-clone' | 'env' | 'drm'
): { inputModulePath: string } | Record<string, never> {
  const line = (applied: boolean, reason?: string) =>
    overlayInputLine(steamGame, applied, reason)
  try {
    if (!OVERLAY_INPUT_FIX_ROUTES.has(route)) {
      logInfo(line(false, 'route'), LogPrefix.Steam)
      return {}
    }
    if (process.env.GAMELIB_OVERLAY_INPUT_FIX === 'off') {
      logInfo(line(false, 'disabled'), LogPrefix.Steam)
      return {}
    }
    const armed = overlayInputProbeFromEnv(process.env, {
      appId: steamGame.appId,
      traceRoot: '/',
      dylibPath: builtOverlayInputProbePath,
      now: 0
    })
    // 60-REVIEW WR-02: never load the fix beside the probe. Both hook the same
    // entry points, so each one's winemac caller check sees the other image
    // and the fix degrades to set_active only. Order: route, disabled,
    // experiment, probe, missing.
    if (armed) {
      logInfo(
        line(false, armed.experiment ? 'experiment' : 'probe'),
        LogPrefix.Steam
      )
      return {}
    }
    if (
      !lstatSync(builtOverlayInputPath, { throwIfNoEntry: false })?.isFile()
    ) {
      logWarning(line(false, 'missing'), LogPrefix.Steam)
      return {}
    }
    return { inputModulePath: builtOverlayInputPath }
  } catch (e) {
    logWarning(line(false, `missing: ${String(e)}`), LogPrefix.Steam)
    return {}
  }
}

/**
 * 60-REVIEW WR-04: the outcome line for a candidate from overlayInputArg,
 * read from the values the launch actually carries (CX_ENV tokens or env
 * values). applied=true only when DYLD_INSERT_LIBRARIES names the module;
 * otherwise (prepare error, runner refused, unsafe path dropped by the value
 * builder, a throw) applied=false reason=not-injected. Never throws.
 */
export function logOverlayInputOutcome(
  steamGame: SteamGame,
  arg: { inputModulePath: string } | Record<string, never>,
  carried: readonly string[]
): void {
  try {
    if (!('inputModulePath' in arg)) return
    const path = arg.inputModulePath
    const key = 'DYLD_INSERT_LIBRARIES='
    const applied = carried.some((entry) => {
      if (!entry.startsWith(key)) return false
      let v = entry.slice(key.length)
      if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) {
        v = v.slice(1, -1)
      }
      return v.split(':').includes(path)
    })
    if (applied) logInfo(overlayInputLine(steamGame, true), LogPrefix.Steam)
    else
      logWarning(
        overlayInputLine(steamGame, false, 'not-injected'),
        LogPrefix.Steam
      )
  } catch {
    // Diagnostics only: never affects the launch.
  }
}

/**
 * 60-11 (G1): the dev-only input probe. Armed only when the sidecar was
 * started with GAMELIB_OVERLAY_INPUT_PROBE=1. Never blocks a launch and never
 * raises a notice: a missing or unusable probe just logs a warning.
 */
export function overlayProbeArg(steamGame: SteamGame):
  | {
      probe: { dylibPath: string; logPath: string; experiment?: string }
    }
  | Record<string, never> {
  try {
    const traceRoot = buildOverlayPaths(appFolder)?.traceRoot
    if (!traceRoot) return {}
    const probe = overlayInputProbeFromEnv(process.env, {
      appId: steamGame.appId,
      traceRoot,
      dylibPath: builtOverlayInputProbePath,
      now: Date.now()
    })
    if (!probe) return {}
    if (!lstatSync(probe.dylibPath, { throwIfNoEntry: false })?.isFile()) {
      logWarning(
        `SteamGame: appId ${steamGame.appId} overlay input probe=missing`,
        LogPrefix.Steam
      )
      return {}
    }
    mkdirSync(traceRoot, { recursive: true, mode: 0o700 })
    logInfo(
      `SteamGame: appId ${steamGame.appId} overlay input probe=on log=${probe.logPath.replace(userHome, '~')} experiment=${probe.experiment ?? 'off'}`,
      LogPrefix.Steam
    )
    if (
      process.env.GAMELIB_OVERLAY_RELEASE_EXPERIMENT !== undefined &&
      !probe.experiment
    ) {
      logWarning(
        `SteamGame: appId ${steamGame.appId} overlay release experiment=invalid (ignored)`,
        LogPrefix.Steam
      )
    }
    return { probe }
  } catch (e) {
    logWarning(
      `SteamGame: appId ${steamGame.appId} overlay input probe=unavailable: ${String(e)}`,
      LogPrefix.Steam
    )
    return {}
  }
}

export async function prepareTcpOverlay(
  steamGame: SteamGame,
  settings: GameSettings,
  previousRunner: ReturnType<typeof getDrmBridgeRunner>
): Promise<{
  settings: GameSettings
  overlayLaunch?: OverlayLaunchPayload
}> {
  let registered = false
  // 60-REVIEW WR-04: the input-fix candidate and the values the launch really
  // carries; the one outcome line is logged in `finally`, after every exit.
  let inputArg: { inputModulePath: string } | Record<string, never> | undefined
  let carried: readonly string[] = []
  try {
    const { getEngineSelection } = await import('backend/engine/engineRegistry')
    const { isNonCrossover } = await import('backend/engine/engineTypes')
    const sel = getEngineSelection(steamGame.appId)
    const fallbackEngine = sel
      ? isNonCrossover(sel)
      : settings.wineVersion.type !== 'crossover'
    let ok:
      | {
          runner: OverlayRunnerReady
          tokens: string[]
        }
      | undefined
    let envVars:
      | Extract<OverlayLaunchPayload, { kind: 'env' }>['vars']
      | undefined
    if (fallbackEngine) {
      if (resolveLaunchOverlay(steamGame).enabled) {
        inputArg = overlayInputArg(steamGame, 'env')
        const result = await prepareOverlayEnv({
          appId: steamGame.appId,
          shimPath: builtOverlayShimPath,
          steamBinDir: join(userHome, ...MAC_STEAM_CLIENT_SUBPATH),
          ...inputArg,
          ...overlayProbeArg(steamGame)
        })
        if (result.status === 'error') {
          notifyOverlaySetupFailed(steamGame, result.step, result.cause)
        } else {
          envVars = result.vars
          logInfo(
            `SteamGame: appId ${steamGame.appId} overlay=env reason=fallback-engine (D-07)`,
            LogPrefix.Steam
          )
        }
      }
    } else if (resolveLaunchOverlay(steamGame).enabled) {
      inputArg = overlayInputArg(steamGame, 'tcp-clone')
      const result = await prepareOverlayLaunch({
        appId: steamGame.appId,
        appFolder,
        shimPath: builtOverlayShimPath,
        steamBinDir: join(userHome, ...MAC_STEAM_CLIENT_SUBPATH),
        ...inputArg,
        ...overlayProbeArg(steamGame)
      })
      if (result.status === 'error') {
        notifyOverlaySetupFailed(steamGame, result.step, result.cause)
      } else {
        ok = { runner: result.runner, tokens: result.tokens }
      }
    }
    const nextRunnerDir = ok?.runner.runnerDir
    if (nextRunnerDir !== previousRunner?.runner.runnerDir) {
      await endPerGameBridgeBottleSessionWith(
        steamGame.appId,
        settings.wineCrossoverBottle,
        previousRunner ? join(previousRunner.runner.cxRoot, 'bin') : undefined,
        DRM_END_SESSION_TIMEOUT_MS
      )
    }
    if (ok) {
      if (setOverlayBridgeRunner(steamGame.appId, ok.runner)) {
        registered = true
        const launched = {
          settings: getBridgeBottleSettings(steamGame.appId),
          overlayLaunch: {
            kind: 'cx-env' as const,
            tokens: ok.tokens,
            runnerBin: ok.runner.wrapperBin
          }
        }
        carried = ok.tokens
        return launched
      }
      notifyOverlaySetupFailed(
        steamGame,
        'clone',
        'overlay runner registration refused'
      )
    }
    // Stock CrossOver (or the fallback engine) again: a previous overlay
    // entry was already cleared by drmLaunchSetup, so a stale clone
    // wineVersion must not ride along.
    if (previousRunner?.kind === 'overlay' && !fallbackEngine) {
      return { settings: getBridgeBottleSettings(steamGame.appId) }
    }
    if (envVars) {
      carried = envVars.map((v) => `${v.key}=${v.value}`)
      return { settings, overlayLaunch: { kind: 'env', vars: envVars } }
    }
    return { settings }
  } catch (error) {
    logWarning(
      `SteamGame: appId ${steamGame.appId} overlay setup threw, launching without the overlay: ${String(error)}`,
      LogPrefix.Steam
    )
    if (registered) clearDrmBridgeRunner(steamGame.appId)
    return { settings }
  } finally {
    if (inputArg) logOverlayInputOutcome(steamGame, inputArg, carried)
  }
}
