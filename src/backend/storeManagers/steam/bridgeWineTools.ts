/**
 * Quick 261110-vi4: per-game eligibility and tool settings for Winecfg, Run EXE and Winetricks on
 * a macOS Steam bridge title.
 *
 * Pitfall 5 (Phase 17): Steam titles used to share bottles, so a prefix tool would change every
 * Steam title and Steam itself. That still holds in two layouts: bottled Windows Steam and the
 * legacy shared `GameLibSteamBridge` bottle. A bridge title installed in its own ready
 * `GameLibSteamBridge-<appId>` bottle is the one safe case.
 *
 * The test is `findBridgeInstallBottle`, not `resolveBridgeBottleName`: step 3 of the latter
 * returns the per-game name even for a game that was never installed, so it cannot tell "own
 * bottle" from "nothing installed". Launch routes to the bridge on the same
 * `findBridgeInstallBottle(appId) !== null` test.
 *
 * Sidecar exit contract: nothing runs at import, no timers.
 */
import { engineSelectionView } from 'backend/enginewine/selectionView'
import { resolveNonCrossoverEngine } from 'backend/enginewine/toolSettings'
import type { AppPaths } from 'backend/process/context'
import type { GameSettings } from 'common/types'
import { logError, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import {
  buildFallbackGameSettings,
  readBottleEngineMarkerKind
} from 'backend/enginewine/twin'
import { parseEngineOverride } from 'backend/enginewine/twin'
import type {
  NonCrossoverEngine,
  ToolSettingsResult
} from 'common/types/engine'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { SteamEngineBottle } from './bottle'
import { readSteamEngineOverride } from './engine/steamEngineDeps'
import { pinnedEngineReader } from './engine/pinnedEngine'
import {
  bridgeBottleNameFor,
  findBridgeInstallBottle,
  getBridgeBottleSettings
} from './bridgeBottle'
import type { BridgeBottleDeps } from './bridgeBottle'

/**
 * What the Steam Wine-tool path reads (87-56a): the path roots, the Steam bottle and launch slices, the global settings
 * and the engine runtime's selection registry and Rust transport. A slice of the engine services' source, so the caller
 * hands its own source straight through.
 */
export type SteamWineToolsSource = SteamEngineBottle & {
  paths: BridgeBottleDeps['paths'] &
    Pick<AppPaths, 'toolsPath' | 'gamesConfigPath'>
  config: { getSettings(): GameSettings }
  engineRuntime: BridgeBottleDeps['engineRuntime'] & {
    requestRustInvoke: RustInvokeDeps['requestRustInvoke']
  }
  storeRoot?: Parameters<typeof readSteamEngineOverride>[0]['storeRoot']
}

export interface SteamWineToolsDeps {
  isMac: boolean
  ownBottleName(appId: string): string | null
  findInstallBottle(appId: string): string | null
  hasLiveRunner(appId: string): boolean
  bridgeSettings(appId: string): GameSettings
  markerKind(bottle: string): 'crossover' | 'non-crossover' | null
  engineId(appId: string): string
  nonCrossoverEngine(engineId: string): Promise<NonCrossoverEngine | null>
  fallbackSettings(bottle: string, engine: NonCrossoverEngine): GameSettings
  logError(message: string): void
}

/** Narrows `engine_non_crossover_engine`'s reply: an engine, `null` for "not installed"; anything else rejects. */
function nonCrossoverEngineFrom(reply: unknown): NonCrossoverEngine | null {
  if (reply === null) return null
  const engine = reply as Partial<NonCrossoverEngine> | undefined
  if (
    typeof engine === 'object' &&
    typeof engine.wineBin === 'string' &&
    typeof engine.wineserverBin === 'string' &&
    typeof engine.label === 'string' &&
    typeof engine.version === 'string'
  ) {
    return reply as NonCrossoverEngine
  }
  throw new Error('engine_non_crossover_engine:unexpected-reply')
}

function defaultSteamWineToolsDeps(
  services: SteamWineToolsSource
): SteamWineToolsDeps {
  return {
    isMac,
    ownBottleName: bridgeBottleNameFor,
    findInstallBottle: (appId) =>
      findBridgeInstallBottle(services.paths, appId),
    hasLiveRunner: (appId) =>
      engineSelectionView.get(appId) !== undefined ||
      services.steamLaunchRuntime.drmRunners.getDrmBridgeRunner(appId) !==
        undefined,
    bridgeSettings: (appId) =>
      getBridgeBottleSettings(
        {
          config: services.config,
          steamBottle: services.steamBottle,
          paths: services.paths,
          engineRuntime: services.engineRuntime,
          steamLaunchRuntime: services.steamLaunchRuntime
        },
        appId
      ),
    markerKind: (bottle) =>
      readBottleEngineMarkerKind(
        { paths: services.paths, fallback: pinnedEngineReader(services.paths) },
        bottle
      ),
    // A cycle with steamEngineDeps (which imports this module); only used at call time.
    engineId: (appId) =>
      parseEngineOverride(readSteamEngineOverride(services, appId)),
    logError: (message) => logError(message, LogPrefix.Steam),
    nonCrossoverEngine: async (id) =>
      nonCrossoverEngineFrom(
        await resolveNonCrossoverEngine(
          { requestRustInvoke: services.engineRuntime.requestRustInvoke },
          { engineId: id }
        )
      ),
    fallbackSettings: (bottle, engine) =>
      buildFallbackGameSettings(
        services.paths,
        bottle,
        engine,
        services.config.getSettings()
      )
  }
}

/**
 * The per-game bottle a Steam title's Wine tools may act on, or null. Non-null only on macOS for
 * a numeric appId whose bridge install lives in its own `GameLibSteamBridge-<appId>` bottle.
 */
export function steamWineToolsBottle(
  appId: string,
  d: Pick<SteamWineToolsDeps, 'isMac' | 'ownBottleName' | 'findInstallBottle'>
): string | null {
  if (!d.isMac) return null
  const own = d.ownBottleName(appId)
  if (own === null) return null
  return d.findInstallBottle(appId) === own ? own : null
}

export function isSteamWineToolsEligible(
  paths: Pick<AppPaths, 'userHome'>,
  appId: string
): boolean {
  return (
    steamWineToolsBottle(appId, {
      isMac,
      ownBottleName: bridgeBottleNameFor,
      findInstallBottle: (id) => findBridgeInstallBottle(paths, id)
    }) !== null
  )
}

export async function resolveSteamWineToolSettings(
  services: SteamWineToolsSource,
  appId: string,
  overrides: Partial<SteamWineToolsDeps> = {}
): Promise<ToolSettingsResult> {
  const d = { ...defaultSteamWineToolsDeps(services), ...overrides }
  const bottle = steamWineToolsBottle(appId, d)
  if (bottle === null) return { kind: 'unavailable', reason: 'not-own-bottle' }

  let settings: GameSettings
  if (d.hasLiveRunner(appId)) {
    settings = d.bridgeSettings(appId)
  } else {
    const id = d.engineId(appId)
    const wantsNonCrossover =
      d.markerKind(bottle) === 'non-crossover' ||
      id.startsWith('pinned:') ||
      id.startsWith('wine-manager:')
    if (wantsNonCrossover) {
      const engine = await d.nonCrossoverEngine(id)
      if (!engine) return { kind: 'unavailable', reason: 'no-engine' }
      settings = d.fallbackSettings(bottle, engine)
    } else {
      settings = d.bridgeSettings(appId)
      if (settings.wineVersion?.type !== 'crossover') {
        return { kind: 'unavailable', reason: 'no-engine' }
      }
    }
  }

  if (settings.wineCrossoverBottle !== bottle) {
    d.logError(
      `Steam ${appId}: Wine tool settings point at a bottle other than the title's own`
    )
    return { kind: 'unavailable', reason: 'not-own-bottle' }
  }
  return { kind: 'engine', key: appId, settings }
}
