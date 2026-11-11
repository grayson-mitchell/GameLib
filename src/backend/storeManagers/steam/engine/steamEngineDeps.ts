/**
 * Steam adapter for the store-agnostic engine decision and switch (phase 61, D-16, D-08).
 *
 * `backend/engine/engineDecision` and `engineSwitch` import nothing from this store. Everything
 * Steam-only they used to default to is injected here: the persisted wine-bin hint for the
 * CrossOver lookup, the Steam override reader, the bridge monitor phase, the title's own bridge
 * bottle and the bridge bottle's CrossOver settings.
 */
import { resolveCrossoverBinDirAsync } from 'backend/engine/crossoverLocation'
import { killCrossoverWineserverWith } from 'backend/engine/engineDecision'
import { wineManagerReleasesFrom } from 'backend/engine/wineManagerReleases'
import type { Stores } from 'backend/services/types'
import type {
  EngineDecisionDeps,
  RunnerDeps
} from 'backend/engine/engineDecision'
import type { EngineServices } from 'backend/engine/engineServices'
import { switchServicesFrom } from 'backend/engine/engineSwitch'
import type { EngineSwitchDeps } from 'backend/engine/engineSwitch'
import { readStoredGameConfig } from 'backend/engine/engineConfig'
import type { EffectiveEngine } from 'backend/engine/engineConfig'
import { parseEngineOverride } from 'backend/engine/engineIds'
import { getEngineState } from 'backend/engine/engineState'
import type { EngineStateDeps } from 'backend/engine/engineState'
import type { EngineState } from 'common/types/engine'
import { persistedWineBins } from '../bottle'
import {
  bridgeBottleNameFor,
  findBridgeInstallBottle,
  getBridgeBottleSettings,
  isBridgeBottleReady
} from '../bridgeBottle'
import { steamWineToolsBottle } from '../bridgeWineTools'
import { readBridgeVerdict } from '../bridge/bridgeVerdict'
import type { SteamStoresDeps } from '../library/installRoot'
import { getBottleProcessMonitorPhase } from '../bottleProcessMonitor'
import { readStoredTitleConfig } from '../titleSettings'

/**
 * 59-UAT G11 / D-08: the title's stored override, read straight from its GameConfig file.
 * `engineOverride` (written by the generic Engine control) wins; the older
 * `steamEngineOverride` is the fallback so existing Steam choices keep working. Unvalidated:
 * callers pass the value through parseEngineOverride.
 */
export function readSteamEngineOverride(appId: string): unknown {
  const generic = readStoredGameConfig(appId)?.engineOverride
  if (typeof generic === 'string') return generic
  return readStoredTitleConfig(appId)?.steamEngineOverride
}

const hintedBinDir = (runner: EngineServices['runner']) =>
  resolveCrossoverBinDirAsync({ runner }, { hintWineBins: persistedWineBins() })

/** The spawn and release-reader slice the steam decision paths need, from a store's deps (66.1-22i). */
export function steamDecisionServices(deps: {
  spawnAsync: EngineServices['spawnAsync']
  runner: EngineServices['runner']
  stores: Pick<Stores, 'wineManager'>
}): Pick<EngineServices, 'spawnAsync' | 'runner' | 'wineManagerReleases'> {
  return {
    spawnAsync: deps.spawnAsync,
    runner: deps.runner,
    wineManagerReleases: wineManagerReleasesFrom(deps)
  }
}

export function steamDecisionDeps(
  services: Pick<
    EngineServices,
    'spawnAsync' | 'runner' | 'wineManagerReleases'
  >
): Partial<EngineDecisionDeps> &
  Pick<EngineDecisionDeps, 'killCrossoverWineserver' | 'wineManagerReleases'> &
  RunnerDeps {
  return {
    runner: services.runner,
    killCrossoverWineserver: killCrossoverWineserverWith(services),
    wineManagerReleases: services.wineManagerReleases,
    resolveCrossoverBinDir: () => hintedBinDir(services.runner),
    readOverride: readSteamEngineOverride,
    monitorPhase: getBottleProcessMonitorPhase
  }
}

export function steamSwitchDeps(
  services: EngineServices
): Partial<EngineSwitchDeps> &
  Pick<
    EngineSwitchDeps,
    | 'crossoverSettings'
    | 'killWith'
    | 'installRemove'
    | 'resolveCrossoverBinDir'
    | 'fallbackSettings'
  > {
  return {
    ...switchServicesFrom(services),
    getMonitorPhase: getBottleProcessMonitorPhase,
    ownBottleName: bridgeBottleNameFor,
    crossoverSettings: getBridgeBottleSettings,
    resolveCrossoverBinDir: () => hintedBinDir(services.runner)
  }
}

/** The Steam runner id the shared engine state is keyed by. */
export const STEAM_ENGINE_RUNNER = 'steam'

/**
 * WR-07: whether a persisted verdict means the engine override has no effect.
 * WR-01: a CEG verdict wins regardless of the persisted mode. The install
 * prefetch persists `tcp` for CEG titles (resolveBridgeMode), but a CEG launch
 * is refused, so the override has no effect there. Otherwise a persisted
 * `mode` decides; a title installed before the mode was persisted is resolved
 * from a steamstub scan. Read-only: a page view must not write the verdict
 * store.
 */
export function isDrmModeFromVerdict(
  verdict:
    | { mode?: string; drm?: string; scan?: { drmWrapper?: string } }
    | undefined
): boolean {
  if (!verdict) return false
  if (verdict.drm === 'ceg') return true
  if (verdict.mode !== undefined) return verdict.mode === 'steamclient-layer'
  return verdict.scan?.drmWrapper === 'steamstub'
}

/**
 * The Steam side of the shared engine state: a title has state only with a bridge install, an
 * override only applies in its own per-game bottle outside DRM mode, and the overlay toggle
 * applies to every bridge title (Phase 60 D-02).
 */
export function steamEngineStateDeps(
  deps: SteamStoresDeps & Parameters<typeof steamDecisionServices>[0],
  appId: string,
  over: Partial<EngineStateDeps> = {}
): EngineStateDeps {
  const own = bridgeBottleNameFor(appId)
  return {
    ...steamDecisionDeps(steamDecisionServices(deps)),
    bottleFor: () => findBridgeInstallBottle(appId),
    overrideEligible: (_id, bottle) =>
      bottle === own && !isDrmModeFromVerdict(readBridgeVerdict(deps, appId)),
    overlayEligible: true,
    // isMac true: getEngineState already returns null off macOS (quick 261110-vi4).
    wineToolsEligible: (_id, bottle) =>
      bottle !== null &&
      bottle ===
        steamWineToolsBottle(appId, {
          isMac: true,
          ownBottleName: bridgeBottleNameFor,
          findInstallBottle: findBridgeInstallBottle
        }),
    effective: (): EffectiveEngine => {
      const raw = readSteamEngineOverride(appId)
      return {
        kind: 'override',
        id: parseEngineOverride(raw),
        source: typeof raw === 'string' ? 'stored' : 'derived'
      }
    },
    prefixKind: 'bottle',
    perGameBottleName: own,
    isBottleReady: isBridgeBottleReady,
    ...over
  }
}

export async function getSteamEngineState(
  deps: SteamStoresDeps & Parameters<typeof steamDecisionServices>[0],
  appId: unknown,
  over?: Partial<EngineStateDeps>
): Promise<EngineState | null> {
  if (typeof appId !== 'string' || !/^\d+$/.test(appId)) return null
  return getEngineState(
    { runner: STEAM_ENGINE_RUNNER, appName: appId },
    steamEngineStateDeps(deps, appId, over)
  )
}
