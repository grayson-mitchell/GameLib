/**
 * Phase 61 (59 D-07, D-08): the per-launch settings overlay.
 *
 * The engine chosen for a launch lives in the in-memory engine registry (engineRegistry.ts). This
 * module turns that choice into a `GameSettings` for one launch: the store launch asks
 * `getLaunchSettings(key, stored)` instead of using the stored settings directly. Nothing is ever
 * written to the game's config and the input is never mutated, so falling back stays session
 * state (Pitfall 4). Overlay contexts live in one createLaunchSettingsRegistry() per boot; empty at construction; no timers, no I/O (sidecar exit contract).
 */
import { join } from 'path'
import type { GameSettings } from 'common/types'
import { buildFallbackGameSettings } from './bottlePrimitives'
import type { AppPaths } from 'backend/process/context'
import type { EngineRegistry } from './engineRegistry'
import { isNonCrossover } from './engineTypes'
import type { EngineKey } from './gameKey'
import type { NonCrossoverEngine } from './engineTypes'

type LaunchOverlayContext = {
  prefix: { kind: 'bottle'; bottleName: string } | { kind: 'plain' }
  /** CrossOver bin dir, for a CrossOver selection on a bottle. */
  binDir?: string
}

export interface LaunchSettingsRegistry {
  setLaunchOverlayContext: (key: EngineKey, ctx: LaunchOverlayContext) => void
  getLaunchOverlayContext: (key: EngineKey) => LaunchOverlayContext | undefined
  clearLaunchOverlayContext: (key: EngineKey) => void
  getLaunchSettings: (
    key: EngineKey | null,
    stored: GameSettings
  ) => GameSettings
}

/** GameSettings that run `bottleName` on CrossOver, shaped like the Steam bottle's. */
export function buildCrossoverGameSettings(
  stored: GameSettings,
  bottleName: string,
  binDir: string,
  build: string | null
): GameSettings {
  return {
    ...stored,
    wineCrossoverBottle: bottleName,
    wineVersion: {
      type: 'crossover',
      bin: join(binDir, 'wine'),
      name: build ? `CrossOver ${build}` : 'CrossOver',
      wineserver: join(binDir, 'wineserver')
    }
  }
}

export function createLaunchSettingsRegistry(deps: {
  registry: Pick<EngineRegistry, 'getEngineSelection'>
  paths: Pick<AppPaths, 'userHome'>
}): LaunchSettingsRegistry {
  const contexts = new Map<EngineKey, LaunchOverlayContext>()

  function getLaunchSettings(
    key: EngineKey | null,
    stored: GameSettings
  ): GameSettings {
    if (key === null) return stored
    const sel = deps.registry.getEngineSelection(key)
    const ctx = contexts.get(key)
    if (!sel || !ctx) return stored
    if (sel.kind === 'crossover') {
      if (ctx.prefix.kind !== 'bottle') return stored
      return buildCrossoverGameSettings(
        stored,
        ctx.prefix.bottleName,
        ctx.binDir ?? sel.binDir,
        sel.crossoverBuild
      )
    }
    if (!isNonCrossover(sel)) return stored
    if (ctx.prefix.kind === 'bottle') {
      return {
        ...stored,
        ...buildFallbackGameSettings(
          deps.paths,
          ctx.prefix.bottleName,
          sel,
          stored
        )
      }
    }
    return buildPlainPrefixSettings(stored, sel)
  }

  return {
    setLaunchOverlayContext(key, ctx) {
      contexts.set(key, ctx)
    },
    getLaunchOverlayContext: (key) => contexts.get(key),
    clearLaunchOverlayContext(key) {
      contexts.delete(key)
    },
    getLaunchSettings
  }
}

/**
 * D-04, D-06: a plain prefix keeps its prefix and DXVK settings; only the Wine changes. Shared
 * by the launch overlay and the Wine tools resolver (toolSettings.ts).
 */
export function buildPlainPrefixSettings(
  stored: GameSettings,
  engine: Pick<NonCrossoverEngine, 'wineBin' | 'wineserverBin' | 'label'>
): GameSettings {
  return {
    ...stored,
    wineVersion: {
      type: 'wine',
      bin: engine.wineBin,
      name: engine.label,
      wineserver: engine.wineserverBin
    }
  }
}
