/**
 * Phase 61-14 (T-61-63): resolveToolSettings picks the bottle/prefix and engine the Wine tools act
 * on. Every dependency is injected; nothing is spawned and nothing touches disk.
 */
import type { Game } from 'common/types/game_manager'
import type { GameSettings } from 'common/types'

jest.mock('i18next', () => ({ __esModule: true, t: (key: string) => key }))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))
jest.mock('backend/utils', () => ({
  spawnAsync: jest.fn(),
  sendGameStatusUpdate: jest.fn()
}))
jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))

import { resolveToolSettings, resolveToolSettingsForId } from '../toolSettings'
import type { ToolSettingsDeps } from '../toolSettings'
import type { EffectiveEngine } from '../engineConfig'
import type { NonCrossoverEngine } from '../engineTypes'
import { perGameBottleName } from '../perGameBottle'
import { getBottleDir } from '../bottlePrimitives'
import type { EngineServices } from '../engineServices'
import { createTestEngineServices } from 'backend/testUtils/testServices'

const services: EngineServices = createTestEngineServices({
  installRemove: jest.fn()
})

const PIN: NonCrossoverEngine = {
  wineBin: '/pin/wine',
  wineserverBin: '/pin/wineserver',
  label: 'Pin One',
  version: '10.0',
  dxvk: null
}

const stored = (over: Partial<GameSettings> = {}): GameSettings =>
  ({
    wineCrossoverBottle: '',
    winePrefix: '/old/prefix',
    wineVersion: { type: 'wine', bin: '/w/wine', name: 'Odd Wine' },
    enviromentOptions: [],
    ...over
  }) as unknown as GameSettings

const game = (
  o: { native?: boolean; platform?: string; runner?: string } = {}
): Game =>
  ({
    isNative: () => o.native ?? false,
    getGameInfo: () => ({
      runner: o.runner ?? 'gog',
      app_name: '1234',
      title: 'T',
      install: { platform: o.platform ?? 'windows' }
    })
  }) as unknown as Game

const auto: EffectiveEngine = {
  kind: 'override',
  id: 'automatic',
  source: 'derived'
}
const perGame = () => perGameBottleName('gog', '1234') as string

const ensureGameBottle = jest.fn()
const overlay = jest.fn()
const nonCrossoverEngine = jest.fn()

function deps(over: Partial<ToolSettingsDeps> = {}): Partial<ToolSettingsDeps> {
  return {
    isMac: () => true,
    readEffective: () => auto,
    hasLiveSelection: () => false,
    overlay,
    isProvisioned: () => true,
    ensureGameBottle,
    markerKind: () => null,
    crossoverBinDir: () => Promise.resolve('/cx/bin'),
    nonCrossoverEngine,
    ...over
  }
}

beforeEach(() => {
  ensureGameBottle.mockResolvedValue({
    status: 'done',
    createdHere: true,
    engine: 'crossover'
  })
  overlay.mockImplementation((_k: string, s: GameSettings) => ({
    ...s,
    overlaid: true
  }))
  nonCrossoverEngine.mockReturnValue(PIN)
})

const resolve = (
  g: Game,
  s: GameSettings,
  ensureBottle: boolean,
  over: Partial<ToolSettingsDeps> = {}
) => resolveToolSettings(services, g, s, { ensureBottle }, deps(over))

describe('stored settings', () => {
  it.each([
    ['non-mac', game(), { isMac: () => false }],
    ['native', game({ native: true }), {}],
    ['browser', game({ platform: 'Browser' }), {}],
    ['bottle-runtime store', game({ runner: 'steam' }), {}]
  ])(
    '%s returns the same reference and calls no engine module',
    async (_n, g, over) => {
      const s = stored()
      const readEffective = jest.fn()
      const result = await resolve(g, s, true, { readEffective, ...over })
      expect(result.kind).toBe('stored')
      if (result.kind === 'stored') expect(result.settings).toBe(s)
      expect(readEffective).not.toHaveBeenCalled()
      expect(ensureGameBottle).not.toHaveBeenCalled()
    }
  )

  it('legacy effective engine keeps the stored settings (D-07)', async () => {
    const s = stored()
    const result = await resolve(game(), s, true, {
      readEffective: () => ({ kind: 'legacy', label: 'Odd Wine' })
    })
    expect(result).toEqual({ kind: 'stored', settings: s })
    expect(ensureGameBottle).not.toHaveBeenCalled()
  })

  it('a stored CrossOver game in a user-picked bottle does not get a per-game bottle', async () => {
    const s = stored({
      wineVersion: { type: 'crossover', bin: '/cx/bin/wine', name: 'CX' },
      wineCrossoverBottle: 'MyBottle'
    })
    const result = await resolve(game(), s, true)
    expect(result.kind).toBe('engine')
    if (result.kind === 'engine') {
      expect(result.settings.wineCrossoverBottle).toBe('MyBottle')
      expect(result.settings.wineVersion.type).toBe('crossover')
    }
    expect(ensureGameBottle).not.toHaveBeenCalled()
  })
})

describe('live selection', () => {
  it('uses the launch overlay while the game runs', async () => {
    const s = stored()
    const result = await resolve(game(), s, false, {
      hasLiveSelection: () => true
    })
    expect(overlay).toHaveBeenCalledWith('gog:1234', s)
    expect(result.kind).toBe('engine')
    if (result.kind === 'engine') {
      expect((result.settings as { overlaid?: boolean }).overlaid).toBe(true)
    }
  })
})

describe('plain prefix (D-04, D-06)', () => {
  it('keeps the stored winePrefix and takes the pinned Wine', async () => {
    const result = await resolve(game(), stored(), true, {
      readEffective: () => ({
        kind: 'override',
        id: 'pinned:p1',
        source: 'derived'
      })
    })
    expect(result.kind).toBe('engine')
    if (result.kind === 'engine') {
      expect(result.settings.winePrefix).toBe('/old/prefix')
      expect(result.settings.wineVersion).toMatchObject({
        type: 'wine',
        bin: '/pin/wine',
        name: 'Pin One'
      })
    }
    expect(nonCrossoverEngine).toHaveBeenCalledWith('pinned:p1')
    expect(ensureGameBottle).not.toHaveBeenCalled()
  })

  it('reports no-engine when the pin is not installed', async () => {
    nonCrossoverEngine.mockReturnValue(null)
    const result = await resolve(game(), stored(), true, {
      readEffective: () => ({
        kind: 'override',
        id: 'wine-manager:9.0',
        source: 'stored'
      })
    })
    expect(result).toEqual({ kind: 'unavailable', reason: 'no-engine' })
  })
})

describe('per-game bottle', () => {
  it('marker pinned: fallback settings with the bottle dir as winePrefix', async () => {
    const result = await resolve(game(), stored(), true, {
      markerKind: () => 'non-crossover'
    })
    expect(result.kind).toBe('engine')
    if (result.kind === 'engine') {
      expect(result.settings.winePrefix).toBe(getBottleDir(perGame()))
      expect(result.settings.wineCrossoverBottle).toBe(perGame())
      expect(result.settings.wineVersion.type).toBe('wine')
    }
  })

  it.each([['crossover' as const], [null]])(
    'marker %s with CrossOver resolvable: CrossOver settings for that bottle',
    async (marker) => {
      const result = await resolve(game(), stored(), true, {
        markerKind: () => marker
      })
      expect(result.kind).toBe('engine')
      if (result.kind === 'engine') {
        expect(result.settings.wineVersion).toMatchObject({
          type: 'crossover',
          bin: '/cx/bin/wine'
        })
        expect(result.settings.wineCrossoverBottle).toBe(perGame())
      }
    }
  )

  it('no CrossOver: falls back to the pinned engine when installed', async () => {
    const result = await resolve(game(), stored(), true, {
      crossoverBinDir: () => Promise.resolve(undefined)
    })
    expect(result.kind).toBe('engine')
    if (result.kind === 'engine') {
      expect(result.settings.wineVersion.type).toBe('wine')
    }
  })

  it('no CrossOver and the pin not installed: no-engine', async () => {
    nonCrossoverEngine.mockReturnValue(null)
    const result = await resolve(game(), stored(), true, {
      crossoverBinDir: () => Promise.resolve(undefined)
    })
    expect(result).toEqual({ kind: 'unavailable', reason: 'no-engine' })
  })

  it('not provisioned + ensureBottle: creates it once, then resolves', async () => {
    let made = false
    ensureGameBottle.mockImplementation(() => {
      made = true
      return Promise.resolve({
        status: 'done',
        createdHere: true,
        engine: 'crossover'
      })
    })
    const result = await resolve(game(), stored(), true, {
      isProvisioned: () => made
    })
    expect(ensureGameBottle).toHaveBeenCalledTimes(1)
    expect(result.kind).toBe('engine')
  })

  it('not provisioned + read: creates nothing', async () => {
    const result = await resolve(game(), stored(), false, {
      isProvisioned: () => false
    })
    expect(result).toEqual({
      kind: 'unavailable',
      reason: 'bottle-not-created'
    })
    expect(ensureGameBottle).not.toHaveBeenCalled()
  })

  it('bottle creation failure: bottle-not-created', async () => {
    ensureGameBottle.mockResolvedValue({ status: 'error', error: 'boom' })
    const result = await resolve(game(), stored(), true, {
      isProvisioned: () => false
    })
    expect(result).toEqual({
      kind: 'unavailable',
      reason: 'bottle-not-created'
    })
  })

  it('a missing legacy shared bottle is never created', async () => {
    const result = await resolve(
      game(),
      stored({
        wineVersion: { type: 'crossover', bin: '/cx/bin/wine', name: 'CX' },
        wineCrossoverBottle: 'GameLib'
      }),
      true,
      { isProvisioned: () => false }
    )
    expect(result).toEqual({
      kind: 'unavailable',
      reason: 'bottle-not-created'
    })
    expect(ensureGameBottle).not.toHaveBeenCalled()
  })

  it('an invalid prefix: invalid-prefix', async () => {
    const result = await resolve(game(), stored(), true, {
      resolvePrefix: () => ({ kind: 'invalid' })
    })
    expect(result).toEqual({ kind: 'unavailable', reason: 'invalid-prefix' })
  })
})

describe('never mutates', () => {
  it('leaves the stored settings object untouched', async () => {
    const s = stored()
    const copy = JSON.parse(JSON.stringify(s)) as GameSettings
    await resolve(game(), s, true, { markerKind: () => 'non-crossover' })
    expect(s).toEqual(copy)
  })
})

describe('resolveToolSettingsForId (CR-04: no Game needed)', () => {
  const sideloadId = {
    runner: 'sideload' as const,
    appName: 'abc',
    platform: 'Windows' as const
  }

  it('unprovisioned per-game bottle + ensureBottle: creates it once and resolves to the engine', async () => {
    let made = false
    ensureGameBottle.mockImplementation(() => {
      made = true
      return Promise.resolve({
        status: 'done',
        createdHere: true,
        engine: 'crossover'
      })
    })
    const result = await resolveToolSettingsForId(
      services,
      sideloadId,
      stored(),
      { ensureBottle: true },
      deps({ isProvisioned: () => made })
    )
    expect(ensureGameBottle).toHaveBeenCalledTimes(1)
    expect(ensureGameBottle.mock.calls[0][0]).toMatchObject({
      bottleName: perGameBottleName('sideload', 'abc'),
      appName: 'abc',
      runner: 'sideload'
    })
    expect(result.kind).toBe('engine')
    if (result.kind === 'engine') {
      expect(result.settings.wineCrossoverBottle).toBe(
        perGameBottleName('sideload', 'abc')
      )
    }
  })

  it('non-mac returns the stored settings by reference', async () => {
    const s = stored()
    const result = await resolveToolSettingsForId(
      services,
      sideloadId,
      s,
      { ensureBottle: true },
      deps({ isMac: () => false })
    )
    expect(result.kind).toBe('stored')
    if (result.kind === 'stored') expect(result.settings).toBe(s)
    expect(ensureGameBottle).not.toHaveBeenCalled()
  })
})
