import { readFileSync } from 'fs'
import { join } from 'path'
import { resolveGamePrefix } from '../gamePrefix'
import { perGameBottleName } from '../perGameBottle'
import type { EffectiveEngine } from '../engineConfig'

const RUNNER = 'gog'
const APP = '1207658924'
const PER_GAME = perGameBottleName(RUNNER, APP) as string

const auto: EffectiveEngine = {
  kind: 'override',
  id: 'automatic',
  source: 'derived'
}
const cx: EffectiveEngine = {
  kind: 'override',
  id: 'crossover',
  source: 'stored'
}
const pinned: EffectiveEngine = {
  kind: 'override',
  id: 'pinned:x' as never,
  source: 'stored'
}
const legacy: EffectiveEngine = { kind: 'legacy', label: 'GPTK' }

const settings = (
  type: string,
  bottle: string,
  prefix = '/Users/u/Games/Prefix'
) =>
  ({
    wineVersion: { type, bin: '/b', name: 'n' },
    wineCrossoverBottle: bottle,
    winePrefix: prefix
  }) as never

const resolve = (s: never, effective: EffectiveEngine, app = APP) =>
  resolveGamePrefix({ runner: RUNNER, appName: app, settings: s, effective })

describe('resolveGamePrefix', () => {
  it('legacy launches as today', () => {
    expect(resolve(settings('wine', 'GameLib'), legacy)).toEqual({
      kind: 'legacy'
    })
  })

  it('keeps the shared GameLib bottle for a CrossOver game', () => {
    expect(resolve(settings('crossover', 'GameLib'), cx)).toEqual({
      kind: 'bottle',
      bottleName: 'GameLib',
      origin: 'legacy-crossover'
    })
  })

  it('keeps a user-picked bottle', () => {
    expect(resolve(settings('crossover', 'MyBottle'), cx)).toEqual({
      kind: 'bottle',
      bottleName: 'MyBottle',
      origin: 'legacy-crossover'
    })
  })

  it.each([cx, auto, pinned])(
    'recognises the per-game bottle under any engine (%#)',
    (effective) => {
      expect(resolve(settings('wine', PER_GAME), effective)).toEqual({
        kind: 'bottle',
        bottleName: PER_GAME,
        origin: 'per-game'
      })
      expect(resolve(settings('crossover', PER_GAME), effective)).toEqual({
        kind: 'bottle',
        bottleName: PER_GAME,
        origin: 'per-game'
      })
    }
  )

  it('leaves a plain-prefix game on its prefix when pinned', () => {
    expect(resolve(settings('wine', 'GameLib'), pinned)).toEqual({
      kind: 'plain',
      winePrefix: '/Users/u/Games/Prefix'
    })
  })

  it.each([auto, cx])(
    'moves a plain-prefix game to a fresh per-game bottle on switch (%#)',
    (effective) => {
      expect(resolve(settings('wine', 'GameLib'), effective)).toEqual({
        kind: 'bottle',
        bottleName: PER_GAME,
        origin: 'switched-from-plain',
        previousPrefix: '/Users/u/Games/Prefix'
      })
    }
  )

  it('is invalid when no safe bottle name exists', () => {
    expect(resolve(settings('wine', 'GameLib'), auto, '../x')).toEqual({
      kind: 'invalid'
    })
  })

  it('is pure (no filesystem access)', () => {
    const src = readFileSync(join(__dirname, '..', 'gamePrefix.ts'), 'utf8')
    expect(src).not.toMatch(/readFileSync|existsSync|writeFileSync/)
  })
})
