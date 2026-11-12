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
import type { GameSettings } from 'common/types'
import { logError, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { buildFallbackGameSettings } from 'backend/engine/bottlePrimitives'
import { parseEngineOverride } from 'backend/engine/engineIds'
import {
  readBottleEngineMarkerKind,
  switchContextFrom
} from 'backend/engine/engineSwitch'
import type { NonCrossoverEngine } from 'backend/engine/engineTypes'
import type { EngineServices } from 'backend/engine/engineServices'
import { nonCrossoverEngineFor } from 'backend/engine/toolSettings'
import type { ToolSettingsResult } from 'backend/engine/toolSettings'
import type { SteamEngineBottle } from './bottle'
import { readSteamEngineOverride } from './engine/steamEngineDeps'
import {
  bridgeBottleNameFor,
  findBridgeInstallBottle,
  getBridgeBottleSettings
} from './bridgeBottle'

export interface SteamWineToolsDeps {
  isMac: boolean
  ownBottleName(appId: string): string | null
  findInstallBottle(appId: string): string | null
  hasLiveRunner(appId: string): boolean
  bridgeSettings(appId: string): GameSettings
  markerKind(bottle: string): 'crossover' | 'non-crossover' | null
  engineId(appId: string): string
  nonCrossoverEngine(engineId: string): NonCrossoverEngine | null
  fallbackSettings(bottle: string, engine: NonCrossoverEngine): GameSettings
  logError(message: string): void
}

export function defaultSteamWineToolsDeps(
  services: EngineServices & SteamEngineBottle
): SteamWineToolsDeps {
  return {
    isMac,
    ownBottleName: bridgeBottleNameFor,
    findInstallBottle: findBridgeInstallBottle,
    hasLiveRunner: (appId) =>
      services.engineRuntime.registry.getEngineSelection(appId) !== undefined ||
      services.steamLaunchRuntime.drmRunners.getDrmBridgeRunner(appId) !==
        undefined,
    bridgeSettings: (appId) =>
      getBridgeBottleSettings(
        {
          config: { getSettings: () => services.globalGameSettings() },
          steamBottle: services.steamBottle,
          paths: services.paths,
          engineRuntime: services.engineRuntime,
          steamLaunchRuntime: services.steamLaunchRuntime
        },
        appId
      ),
    markerKind: (bottle) =>
      readBottleEngineMarkerKind(switchContextFrom(services), bottle),
    // A cycle with steamEngineDeps (which imports this module); only used at call time.
    engineId: (appId) =>
      parseEngineOverride(readSteamEngineOverride(services, appId)),
    logError: (message) => logError(message, LogPrefix.Steam),
    nonCrossoverEngine: (id) => nonCrossoverEngineFor(services, id),
    fallbackSettings: (bottle, engine) =>
      buildFallbackGameSettings(
        services.paths,
        bottle,
        engine,
        services.globalGameSettings()
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

export function isSteamWineToolsEligible(appId: string): boolean {
  return (
    steamWineToolsBottle(appId, {
      isMac,
      ownBottleName: bridgeBottleNameFor,
      findInstallBottle: findBridgeInstallBottle
    }) !== null
  )
}

// eslint-disable-next-line @typescript-eslint/require-await -- Promise-returning to match ToolSettingsResult callers
export async function resolveSteamWineToolSettings(
  services: EngineServices & SteamEngineBottle,
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
      const engine = d.nonCrossoverEngine(id)
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
