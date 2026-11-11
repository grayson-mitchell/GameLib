/**
 * Phase 61 (D-02, D-04, D-07, D-13): the settings the Wine tools (Winetricks run and
 * installed-list, Run EXE in prefix) act on, outside any launch.
 *
 * `getLaunchSettings` only overlays while a launch selection is registered, so the still-visible
 * Winetricks tab would otherwise read the stored wineVersion/winePrefix of a game that really
 * runs in its own bottle on another engine. This resolver answers "which bottle or prefix, on
 * which engine, does this game run in right now" from the same inputs the launch uses.
 *
 * It is read-only with respect to the game and its engine: it never runs the CrossOver
 * pre-flight, never switches a bottle's engine (the launch's job), never writes the game's
 * config. The one side effect is `ensureGameBottle`, and only when the caller says running the
 * tool is a need that creates the bottle (D-01, D-03); a read passes `ensureBottle: false`.
 *
 * Store-agnostic: every store input arrives through `Game` and `deps`. Sidecar exit contract:
 * nothing runs at import, no timers.
 */
import type { GameSettings, InstallPlatform, Runner } from 'common/types'
import { hasCapability } from 'common/storeCapabilities'
import type { Game } from 'common/types/game_manager'
import { isMac } from 'backend/constants/environment'
import {
  buildFallbackGameSettings,
  isBottleProvisioned
} from './bottlePrimitives'
import { configPathDepsFrom, readEngineForGame } from './engineConfig'
import type { EffectiveEngine } from './engineConfig'
import { resolveWineManagerStaging } from './engineDecision'
import { engineKeyIfEligible } from './engineEligibility'
import { readBottleEngineMarkerKind, switchContextFrom } from './engineSwitch'
import type { NonCrossoverEngine } from './engineTypes'
import { ENGINE_PINS } from './enginePins'
import { engineKeyFor } from './gameKey'
import type { EngineKey } from './gameKey'
import { resolveGamePrefix } from './gamePrefix'
import {
  buildCrossoverGameSettings,
  buildPlainPrefixSettings
} from './launchSettings'
import type { PerGameBottleFlights } from './perGameBottle'
import type { EngineServices } from './engineServices'

export type ToolSettingsResult =
  | { kind: 'stored'; settings: GameSettings }
  | { kind: 'engine'; key: EngineKey; settings: GameSettings }
  | {
      kind: 'unavailable'
      /**
       * 'not-own-bottle': a bottle-runtime store title whose tools would act on a bottle shared
       * with other titles (quick 261110-vi4).
       */
      reason:
        | 'bottle-not-created'
        | 'no-engine'
        | 'invalid-prefix'
        | 'not-own-bottle'
    }

export interface ToolSettingsDeps {
  isMac(): boolean
  readEffective(id: { runner: string; appName: string }): EffectiveEngine
  hasLiveSelection(key: EngineKey): boolean
  resolvePrefix: typeof resolveGamePrefix
  overlay: (key: EngineKey, stored: GameSettings) => GameSettings
  isProvisioned(bottleName: string): boolean
  ensureGameBottle: (
    args: Parameters<PerGameBottleFlights['ensureGameBottle']>[1]
  ) => ReturnType<PerGameBottleFlights['ensureGameBottle']>
  markerKind(bottleName: string): 'crossover' | 'non-crossover' | null
  crossoverBinDir(): Promise<string | undefined>
  /** The built-in or Wine Manager engine an engine id runs on; null when it is not installed. */
  nonCrossoverEngine(engineId: string): NonCrossoverEngine | null
}

function pinEngine(
  services: Pick<EngineServices, 'engineRuntime'>,
  pin: (typeof ENGINE_PINS)['current']
): NonCrossoverEngine {
  const p = services.engineRuntime.fallback.pinnedEnginePaths(pin)
  return {
    wineBin: p.wineBin,
    wineserverBin: p.wineserverBin,
    label: pin.label,
    version: pin.wine.version,
    dxvk: { dir: p.dxvkDir, version: pin.dxvk.version }
  }
}

const defaultDeps = (
  services: EngineServices
): Omit<
  ToolSettingsDeps,
  | 'ensureGameBottle'
  | 'readEffective'
  | 'nonCrossoverEngine'
  | 'crossoverBinDir'
> => ({
  isMac: () => isMac,
  hasLiveSelection: (key) =>
    services.engineRuntime.registry.getEngineSelection(key) !== undefined,
  resolvePrefix: resolveGamePrefix,
  overlay: (key, stored) =>
    services.engineRuntime.launchSettings.getLaunchSettings(key, stored),
  isProvisioned: (bottleName) =>
    isBottleProvisioned(services.paths, bottleName),
  markerKind: (bottleName) =>
    readBottleEngineMarkerKind(switchContextFrom(services), bottleName)
})

/** The deps that read the Wine Manager release list through the injected services (66.1-22i). */
function releaseBoundDeps(
  services: EngineServices
): Pick<
  ToolSettingsDeps,
  'readEffective' | 'nonCrossoverEngine' | 'crossoverBinDir'
> {
  const releases = {
    wineManagerReleases: services.wineManagerReleases,
    runner: services.runner,
    paths: services.paths,
    engineRuntime: services.engineRuntime
  }
  const config = {
    wineManagerReleases: services.wineManagerReleases,
    ...configPathDepsFrom(services),
    globalSettings: services.globalSettings
  }
  return {
    crossoverBinDir: () =>
      services.engineRuntime.crossover.resolveCrossoverBinDirAsync({
        runner: services.runner
      }),
    readEffective: (id) => readEngineForGame(id, config),
    nonCrossoverEngine(engineId) {
      if (engineId.startsWith('wine-manager:')) {
        return resolveWineManagerStaging(
          engineId.slice('wine-manager:'.length),
          releases
        )
      }
      const pins = [ENGINE_PINS.current, ENGINE_PINS.previous]
      const wanted = engineId.startsWith('pinned:')
        ? engineId.slice('pinned:'.length)
        : ENGINE_PINS.current.id
      const pin = pins.find((p) => p?.id === wanted)
      return pin && services.engineRuntime.fallback.isPinnedEngineInstalled(pin)
        ? pinEngine(services, pin)
        : null
    }
  }
}

/** The built-in or Wine Manager engine an engine id runs on; null when it is not installed. */
export function nonCrossoverEngineFor(
  services: EngineServices,
  engineId: string
): NonCrossoverEngine | null {
  return releaseBoundDeps(services).nonCrossoverEngine(engineId)
}

export async function resolveToolSettings(
  services: EngineServices,
  game: Game,
  stored: GameSettings,
  opts: { ensureBottle: boolean },
  overrides: Partial<ToolSettingsDeps> = {}
): Promise<ToolSettingsResult> {
  const d = {
    ...defaultDeps(services),
    ...releaseBoundDeps(services),
    ...overrides
  }
  if (engineKeyIfEligible(game, d.isMac()) === null) {
    return { kind: 'stored', settings: stored }
  }
  const info = game.getGameInfo()
  return resolveToolSettingsForId(
    services,
    {
      runner: info.runner,
      appName: info.app_name,
      platform: info.install?.platform
    },
    stored,
    opts,
    overrides
  )
}

/**
 * The Game-free resolver (CR-04): the same answer as `resolveToolSettings` for a game that has no
 * library entry yet (a sideload game whose installer is about to run). The native check stays in
 * `resolveToolSettings`; here a game is eligible when it is on macOS, not a Browser install and
 * not a bottle-runtime store.
 */
export async function resolveToolSettingsForId(
  services: EngineServices,
  id: { runner: Runner; appName: string; platform?: InstallPlatform },
  stored: GameSettings,
  opts: { ensureBottle: boolean },
  overrides: Partial<ToolSettingsDeps> = {}
): Promise<ToolSettingsResult> {
  const d: ToolSettingsDeps = {
    ...defaultDeps(services),
    ...releaseBoundDeps(services),
    ensureGameBottle: (a) =>
      services.engineRuntime.perGameBottle.ensureGameBottle(services, a),
    ...overrides
  }
  const key =
    !d.isMac() ||
    id.platform === 'Browser' ||
    hasCapability(id.runner, 'usesBottleRuntime')
      ? null
      : engineKeyFor(id.runner, id.appName)
  if (key === null) return { kind: 'stored', settings: stored }

  // A game is running (or starting) on a chosen engine: a tool targets that engine.
  if (d.hasLiveSelection(key)) {
    return { kind: 'engine', key, settings: d.overlay(key, stored) }
  }

  const { runner, appName } = id
  const effective = d.readEffective({ runner, appName })
  // D-07: a legacy game keeps its stored settings.
  if (effective.kind === 'legacy') return { kind: 'stored', settings: stored }

  const prefix = d.resolvePrefix({
    runner,
    appName,
    settings: stored,
    effective
  })
  if (prefix.kind === 'legacy') return { kind: 'stored', settings: stored }
  if (prefix.kind === 'invalid') {
    return { kind: 'unavailable', reason: 'invalid-prefix' }
  }

  const engineId = effective.id

  if (prefix.kind === 'plain') {
    // D-04, D-06: the prefix stays; only the Wine is the pinned or Wine Manager build.
    const engine = d.nonCrossoverEngine(engineId)
    if (!engine) return { kind: 'unavailable', reason: 'no-engine' }
    return {
      kind: 'engine',
      key,
      settings: buildPlainPrefixSettings(stored, engine)
    }
  }

  const { bottleName, origin } = prefix
  if (!d.isProvisioned(bottleName)) {
    // A legacy shared bottle is never created by the engine layer (D-02).
    if (!opts.ensureBottle || origin === 'legacy-crossover') {
      return { kind: 'unavailable', reason: 'bottle-not-created' }
    }
    const made = await d.ensureGameBottle({
      key,
      bottleName,
      appName,
      runner
    })
    if (made.status === 'error') {
      return { kind: 'unavailable', reason: 'bottle-not-created' }
    }
  }

  // The bottle's current engine is what its marker says; a tool must not flip it.
  const marker = d.markerKind(bottleName)
  const wantsNonCrossover =
    marker === 'non-crossover' ||
    engineId.startsWith('pinned:') ||
    engineId.startsWith('wine-manager:')
  if (marker !== 'non-crossover' && !wantsNonCrossover) {
    const binDir = await d.crossoverBinDir()
    if (binDir) {
      return {
        kind: 'engine',
        key,
        settings: buildCrossoverGameSettings(stored, bottleName, binDir, null)
      }
    }
  }

  const engine = d.nonCrossoverEngine(engineId)
  if (!engine) return { kind: 'unavailable', reason: 'no-engine' }
  return {
    kind: 'engine',
    key,
    settings: {
      ...stored,
      ...buildFallbackGameSettings(services.paths, bottleName, engine, stored)
    }
  }
}
