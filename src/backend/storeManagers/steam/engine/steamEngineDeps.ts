/**
 * Steam adapter for the store-agnostic engine decision (phase 61, D-16, D-08; phase 87, 87-54).
 *
 * The decision itself is Rust's (`enginewine/decision.ts` shims). This module gathers what only the Steam side knows
 * and hands it over as values (research Pattern 2): the stored override, the bridge monitor's phase, the persisted
 * wine-binary hints (`steamEngineFacts`), what the bottle switch needs (`steamPrepareFacts`) and the facts of the
 * engine state (`steamEngineStateFacts`). Nothing here is a callback and no Rust code calls back into it.
 */
import type { AppPaths } from 'backend/process/context'
import type { EngineServices } from 'backend/engine/engineServices'
import type { PrepareBottleCall } from 'backend/engine/prepareBottle'
import type { EngineSelection } from 'backend/engine/engineTypes'
import { readStoredGameConfig } from 'backend/engine/engineConfig'
import type { EngineConfigDeps } from 'backend/engine/engineConfig'
import type { EngineState } from 'common/types/engine'
import type { MonitorPhase } from 'backend/enginewine/decision'
import type { SteamEngineBottle } from '../bottle'
import {
  bridgeBottleNameFor,
  findBridgeInstallBottle,
  getBridgeBottleSettings
} from '../bridgeBottle'
import { steamWineToolsBottle } from '../bridgeWineTools'
import { readBridgeVerdict } from '../bridge/bridgeVerdict'
import type { SteamStoresDeps } from '../library/installRoot'
import { readStoredTitleConfig } from '../titleSettings'

/**
 * 59-UAT G11 / D-08: the title's stored override, read straight from its GameConfig file.
 * `engineOverride` (written by the generic Engine control) wins; the older
 * `steamEngineOverride` is the fallback so existing Steam choices keep working. Unvalidated:
 * callers pass the value through parseEngineOverride.
 */
export function readSteamEngineOverride(
  deps: { paths: Pick<AppPaths, 'gamesConfigPath'> } & Pick<
    EngineConfigDeps,
    'storeRoot'
  >,
  appId: string
): unknown {
  const generic = readStoredGameConfig(appId, {
    gamesConfigPath: deps.paths.gamesConfigPath,
    storeRoot: deps.storeRoot
  })?.engineOverride
  if (typeof generic === 'string') return generic
  return readStoredTitleConfig(appId, deps)?.steamEngineOverride
}

/**
 * The facts the Rust engine decision takes as values (87-54, D-03): what the TS decision's deps held as callbacks.
 * `override` is the title's stored override unvalidated (Rust parses the closed grammar), `monitorPhase` the bridge
 * monitor's answer for the title now, and `hintWineBins` the persisted wine binaries the CrossOver lookup starts from.
 * The field names are the request's, so a caller spreads them next to its own `key` and `bottleName`.
 */
export interface SteamEngineFacts {
  override: unknown
  monitorPhase: MonitorPhase | null
  hintWineBins: string[]
}

export function steamEngineFacts(
  services: {
    paths: Pick<AppPaths, 'gamesConfigPath'>
    storeRoot?: EngineConfigDeps['storeRoot']
  } & SteamEngineBottle,
  key: string
): SteamEngineFacts {
  return {
    override: readSteamEngineOverride(services, key),
    monitorPhase:
      services.steamLaunchRuntime.monitors.getBottleProcessMonitorPhase(key),
    hintWineBins: steamWineBinHints(services)
  }
}

/**
 * The wine binaries the bottled Steam config persisted, which the CrossOver lookup starts from. The pre-flight and the
 * missing check of a title with no engine key of its own (the bottled Steam client) take only these.
 */
export function steamWineBinHints(services: {
  steamBottle: Pick<SteamEngineBottle['steamBottle'], 'persistedWineBins'>
}): string[] {
  return services.steamBottle.persistedWineBins()
}

/**
 * The facts the Rust engine switch takes as values (87-42): what the TS switch's deps held as callbacks.
 * `monitorPhase` and `ownBottle` are read now, `crossoverSettings` only when the switch is to CrossOver (the one
 * case that runs a restore through it; it reads the registered selection, which the caller has set for `appId`), and
 * `fallbackSettings` is the global game settings the DXVK step builds over.
 */
export function steamPrepareFacts(
  services: EngineServices & SteamEngineBottle,
  appId: string,
  next: EngineSelection
): Pick<
  PrepareBottleCall,
  | 'monitorPhase'
  | 'ownBottle'
  | 'crossoverSettings'
  | 'fallbackSettings'
  | 'ensurePinEngine'
> {
  return {
    monitorPhase:
      services.steamLaunchRuntime.monitors.getBottleProcessMonitorPhase(
        appId
      ) ?? null,
    ownBottle: { name: bridgeBottleNameFor(appId) },
    crossoverSettings:
      next.kind === 'crossover'
        ? getBridgeBottleSettings(
            {
              config: { getSettings: () => services.globalGameSettings() },
              steamBottle: services.steamBottle,
              paths: services.paths,
              engineRuntime: services.engineRuntime,
              steamLaunchRuntime: services.steamLaunchRuntime
            },
            appId
          )
        : undefined,
    fallbackSettings: services.globalGameSettings()
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
 * The facts of a Steam title's engine state as values (87-52, D-23): what the TS engine state's deps held as callbacks, for the
 * one typed call into Rust's `engine_state_get`. Rust reads the effective engine itself (the stored override, the
 * older `steamEngineOverride` key as the fallback), runs the pre-flight and the notices; TypeScript keeps only what
 * lives in the bridge: the title's install bottle, whether the override and the Wine tools apply to it, and its own
 * bottle name. Read-only, like the rest of a page view.
 */
export interface SteamEngineStateFacts {
  bottle: string | null
  overrideEligible: boolean
  overlayEligible: boolean
  wineToolsEligible: boolean
  prefixKind: NonNullable<EngineState['prefixKind']>
  perGameBottleName: string | null
}

export function steamEngineStateFacts(
  deps: SteamStoresDeps & { paths: Pick<AppPaths, 'userHome'> },
  appId: string
): SteamEngineStateFacts {
  const own = bridgeBottleNameFor(appId)
  const bottle = findBridgeInstallBottle(deps.paths, appId)
  return {
    bottle,
    // An override only applies in the title's own per-game bottle, outside DRM mode.
    overrideEligible:
      bottle === own && !isDrmModeFromVerdict(readBridgeVerdict(deps, appId)),
    // The overlay toggle applies to every bridge title (Phase 60 D-02).
    overlayEligible: true,
    // isMac true: getEngineState already returns null off macOS (quick 261110-vi4).
    wineToolsEligible:
      bottle !== null &&
      bottle ===
        steamWineToolsBottle(appId, {
          isMac: true,
          ownBottleName: bridgeBottleNameFor,
          findInstallBottle: (id) => findBridgeInstallBottle(deps.paths, id)
        }),
    prefixKind: 'bottle',
    perGameBottleName: own
  }
}
