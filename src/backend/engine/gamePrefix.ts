/**
 * Phase 61 (D-01, D-02, D-04, D-05): the one rule that says which prefix a non-Steam game
 * launches in. Pure: settings in, a value out, no filesystem access.
 *
 * Why "is this game on its per-game bottle" is inferred from `wineCrossoverBottle` equalling
 * `perGameBottleName(runner, appName)` and not from the presence of an engine key: a first save
 * on a legacy shared-bottle game (D-05) writes an engine key, and that save must not silently move
 * the game to a fresh bottle (D-02). Only a game whose stored bottle IS its per-game name, or a
 * plain-prefix game switched to Automatic/CrossOver (D-04), lands on a per-game bottle.
 *
 * D-04: a switch from a plain prefix always means a fresh bottle. The old prefix is reported as
 * `previousPrefix` for display only; it is never adopted, symlinked or written.
 */
import type { GameSettings } from 'common/types'
import type { EffectiveEngine } from './engineConfig'
import { perGameBottleName } from './perGameBottle'
import { sanitizeBottleName } from './bottlePrimitives'

export type GamePrefix =
  | { kind: 'legacy' }
  | { kind: 'invalid' }
  | { kind: 'plain'; winePrefix: string }
  | {
      kind: 'bottle'
      bottleName: string
      origin: 'legacy-crossover' | 'per-game' | 'switched-from-plain'
      previousPrefix?: string
    }

export function resolveGamePrefix(args: {
  runner: string
  appName: string
  settings: Pick<
    GameSettings,
    'wineVersion' | 'wineCrossoverBottle' | 'winePrefix'
  >
  effective: EffectiveEngine
}): GamePrefix {
  const { runner, appName, settings, effective } = args
  // (1) legacy: launch exactly as today (D-07)
  if (effective.kind === 'legacy') return { kind: 'legacy' }

  const perGame = perGameBottleName(runner, appName)
  if (perGame === null) return { kind: 'invalid' }

  const storedBottle = settings.wineCrossoverBottle
  // (2) a CrossOver game keeps the bottle it already names (D-02, D-05)
  if (settings.wineVersion?.type === 'crossover') {
    const name = sanitizeBottleName(storedBottle ?? '') ?? 'GameLib'
    return {
      kind: 'bottle',
      bottleName: name,
      origin: name === perGame ? 'per-game' : 'legacy-crossover'
    }
  }
  // (3) a non-CrossOver game whose stored bottle is its per-game name (D-01)
  if (storedBottle === perGame) {
    return { kind: 'bottle', bottleName: perGame, origin: 'per-game' }
  }
  // (4) plain-prefix game switched to Automatic/CrossOver: fresh bottle (D-04)
  if (
    effective.kind === 'override' &&
    (effective.id === 'automatic' || effective.id === 'crossover')
  ) {
    return {
      kind: 'bottle',
      bottleName: perGame,
      origin: 'switched-from-plain',
      previousPrefix: settings.winePrefix
    }
  }
  // (5) otherwise the plain prefix stays (D-04, D-06)
  return { kind: 'plain', winePrefix: settings.winePrefix }
}
