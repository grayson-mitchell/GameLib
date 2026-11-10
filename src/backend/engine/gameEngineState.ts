/**
 * Phase 61 (D-04, D-07, D-09, D-11, D-12, D-15): engine state for non-Steam games.
 *
 * Supplies the deps `getEngineState` (engineState.ts) needs for an Epic, GOG, Amazon or sideload
 * game, the option list with a read-only Legacy entry, the global default engine, and the
 * per-game bottle name for the install dialogs. Everything is derived here so the renderer never
 * computes eligibility, Legacy or bottle names. Steam answers through its own adapter, so every
 * function returns null for a bottle-runtime store.
 *
 * Platform / native / browser-game eligibility is decided by the IPC layer (it holds the Game
 * object); this module reports `overrideEligible` from the prefix alone.
 *
 * Reading state never creates a GamesConfig file: stored config comes from readStoredGameConfig.
 * Payloads carry ids, labels and bottle names only; no wine bin or prefix paths (T-61-30).
 *
 * Sidecar exit contract: no timers, nothing runs at import.
 */
import { hasCapability } from 'common/storeCapabilities'
import type { GameSettings } from 'common/types'
import type { EngineOption, EngineState } from 'common/types/engine'
import {
  killCrossoverWineserverWith,
  listEngineOverrideOptions
} from './engineDecision'
import type { EngineDecisionDeps } from './engineDecision'
import {
  engineIdOf,
  readEngineForGame,
  readStoredGameConfig,
  resolveGlobalEngine
} from './engineConfig'
import type { EffectiveEngine, EngineConfigDeps } from './engineConfig'
import type { EngineServices } from './engineServices'
import { getEngineState } from './engineState'
import type { EngineStateDeps } from './engineState'
import { engineKeyFor } from './gameKey'
import { resolveGamePrefix } from './gamePrefix'
import { perGameBottleName } from './perGameBottle'

export interface GameEngineStateDeps extends Partial<
  Omit<EngineStateDeps, 'bottleFor' | 'overrideEligible'>
> {
  /** Overrides for config reads (games config dir, global settings, pins, wine manager). */
  config?: Partial<EngineConfigDeps>
}

interface Identity {
  runner: string
  appName: string
}

function lazyIsMac(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('backend/constants/environment') as { isMac: boolean }).isMac
}

function lazyGlobalSettings(): Record<string, unknown> {
  const { GlobalConfig } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('backend/config') as typeof import('backend/config')
  return GlobalConfig.get().getSettings() as unknown as Record<string, unknown>
}

/** A valid, non-bottle-runtime identity, or null. */
function asNonSteamIdentity(args: unknown): Identity | null {
  if (typeof args !== 'object' || args === null) return null
  const { runner, appName } = args as Record<string, unknown>
  if (typeof runner !== 'string' || typeof appName !== 'string') return null
  if (engineKeyFor(runner, appName) === null) return null
  if (hasCapability(runner, 'usesBottleRuntime')) return null
  return { runner, appName }
}

type SettingsView = Pick<
  GameSettings,
  'wineVersion' | 'wineCrossoverBottle' | 'winePrefix'
>

/** Global settings overlaid by the stored game entry; reads files, never writes one. */
function settingsViewFor(
  appName: string,
  config: Partial<EngineConfigDeps> | undefined
): SettingsView {
  const global = (config?.globalSettings ?? lazyGlobalSettings)()
  const stored = readStoredGameConfig(appName, config) ?? {}
  const pick = (k: keyof SettingsView) =>
    stored[k] !== undefined ? stored[k] : global[k]
  return {
    wineVersion: pick('wineVersion') as SettingsView['wineVersion'],
    wineCrossoverBottle: pick('wineCrossoverBottle') as string,
    winePrefix: pick('winePrefix') as string
  }
}

export async function getGameEngineState(
  services: Pick<EngineServices, 'spawnAsync' | 'wineManagerReleases'>,
  identity: unknown,
  deps: GameEngineStateDeps = {}
): Promise<EngineState | null> {
  if (!(deps.isMac ?? lazyIsMac())) return null
  const id = asNonSteamIdentity(identity)
  if (id === null) return null
  const { config, ...stateDeps } = deps
  const releases = { wineManagerReleases: services.wineManagerReleases }
  const effective = readEngineForGame(id, { ...releases, ...config })
  const prefix = resolveGamePrefix({
    runner: id.runner,
    appName: id.appName,
    settings: settingsViewFor(id.appName, config),
    effective
  })
  return getEngineState(id, {
    killCrossoverWineserver: killCrossoverWineserverWith(services),
    ...releases,
    ...stateDeps,
    isMac: true,
    bottleFor: () => (prefix.kind === 'bottle' ? prefix.bottleName : null),
    stateWithoutBottle: true,
    overrideEligible: () => prefix.kind !== 'invalid',
    overlayEligible: false,
    effective: () => effective,
    prefixKind: prefix.kind === 'invalid' ? null : prefix.kind,
    perGameBottleName: perGameBottleName(id.runner, id.appName)
  })
}

function legacyEntry(effective: EffectiveEngine): EngineOption | null {
  if (effective.kind !== 'legacy') return null
  return {
    id: engineIdOf(effective),
    kind: 'legacy',
    label: `Legacy: ${effective.label}`,
    available: false,
    installed: true,
    isPreviousPin: false
  }
}

/**
 * Steam's option list plus a read-only `Legacy: <name>` entry while the game (or, for
 * `{ appName: 'default' }`, the global default) is on Legacy. The Legacy id is display only: the
 * write guard (engineConfig.isWritableEngineOverride) rejects it, so it can never be saved (D-07).
 * GPTK / toolkit / DXMT builds and custom paths are never offered (D-11).
 */
export async function listGameEngineOptions(
  services: Pick<EngineServices, 'wineManagerReleases'>,
  args: unknown,
  deps: {
    config?: Partial<EngineConfigDeps>
    decision?: Partial<EngineDecisionDeps>
  } = {}
): Promise<EngineOption[]> {
  const releases = { wineManagerReleases: services.wineManagerReleases }
  const config = { ...releases, ...deps.config }
  const options = await listEngineOverrideOptions({
    ...releases,
    ...deps.decision
  })
  let effective: EffectiveEngine | null = null
  if (typeof args === 'object' && args !== null) {
    const { runner, appName } = args as Record<string, unknown>
    if (runner === undefined && appName === 'default') {
      effective = resolveGlobalEngine(
        (config.globalSettings ?? lazyGlobalSettings)(),
        config
      )
    } else {
      const id = asNonSteamIdentity(args)
      if (id !== null) effective = readEngineForGame(id, config)
    }
  }
  const legacy = effective === null ? null : legacyEntry(effective)
  return legacy === null ? options : [...options, legacy]
}

/** D-09: the global default engine, derived or stored, Legacy included. */
export function getDefaultEngine(
  services: Pick<EngineServices, 'wineManagerReleases'>,
  overrides?: Partial<EngineConfigDeps>
): {
  effectiveEngineId: string
  engineSource: 'stored' | 'derived'
  legacyLabel: string | null
} {
  const deps = {
    wineManagerReleases: services.wineManagerReleases,
    ...overrides
  }
  const effective = resolveGlobalEngine(
    (deps.globalSettings ?? lazyGlobalSettings)(),
    deps
  )
  return {
    effectiveEngineId: engineIdOf(effective),
    engineSource: effective.kind === 'override' ? effective.source : 'derived',
    legacyLabel: effective.kind === 'legacy' ? effective.label : null
  }
}

/** The per-game bottle name for the install dialogs (D-17), or null for an invalid / Steam game. */
export function getPerGameBottleNameFor(args: unknown): string | null {
  const id = asNonSteamIdentity(args)
  return id === null ? null : perGameBottleName(id.runner, id.appName)
}
