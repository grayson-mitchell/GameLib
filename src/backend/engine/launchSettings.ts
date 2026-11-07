/**
 * Phase 61 (59 D-07, D-08): the per-launch settings overlay.
 *
 * The engine chosen for a launch lives in the in-memory engine registry (engineRegistry.ts). This
 * module turns that choice into a `GameSettings` for one launch: the store launch asks
 * `getLaunchSettings(key, stored)` instead of using the stored settings directly. Nothing is ever
 * written to the game's config and the input is never mutated, so falling back stays session
 * state (Pitfall 4). Empty at module load; no timers, no I/O (sidecar exit contract).
 */
import { join } from 'path'
import type { GameSettings } from 'common/types'
import { buildFallbackGameSettings } from './bottlePrimitives'
import { getEngineSelection } from './engineRegistry'
import { isNonCrossover } from './engineTypes'
import type { EngineKey } from './gameKey'
import type { NonCrossoverEngine } from './engineTypes'

export type LaunchOverlayContext = {
  prefix: { kind: 'bottle'; bottleName: string } | { kind: 'plain' }
  /** CrossOver bin dir, for a CrossOver selection on a bottle. */
  binDir?: string
}

const contexts = new Map<EngineKey, LaunchOverlayContext>()

export function setLaunchOverlayContext(
  key: EngineKey,
  ctx: LaunchOverlayContext
): void {
  contexts.set(key, ctx)
}

export function getLaunchOverlayContext(
  key: EngineKey
): LaunchOverlayContext | undefined {
  return contexts.get(key)
}

export function clearLaunchOverlayContext(key: EngineKey): void {
  contexts.delete(key)
}

export function __resetLaunchOverlayForTests(): void {
  contexts.clear()
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

export function getLaunchSettings(
  key: EngineKey | null,
  stored: GameSettings
): GameSettings {
  if (key === null) return stored
  const sel = getEngineSelection(key)
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
      ...buildFallbackGameSettings(ctx.prefix.bottleName, sel, stored)
    }
  }
  return buildPlainPrefixSettings(stored, sel)
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
