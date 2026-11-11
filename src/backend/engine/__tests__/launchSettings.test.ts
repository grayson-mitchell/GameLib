import { join } from 'path'
import type { GameSettings } from 'common/types'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

const mockProfile = createFakeHomeProfile({ prefix: 'gamelib-launchset-' })

jest.mock('backend/constants/paths', () => ({
  get userHome() {
    return mockProfile.root
  }
}))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))
jest.mock('backend/utils', () => ({ spawnAsync: jest.fn() }))
jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  existsSync: () => true
}))

import {
  buildCrossoverGameSettings,
  clearLaunchOverlayContext,
  getLaunchSettings,
  setLaunchOverlayContext
} from '../launchSettings'
import { buildFallbackGameSettings, getBottleDir } from '../bottlePrimitives'
import { clearEngineSelection, setEngineSelection } from '../engineRegistry'

afterAll(() => mockProfile.dispose())

const KEY = 'gog:1234'
const stored = {
  winePrefix: '/old/prefix',
  wineCrossoverBottle: 'Old',
  wineVersion: { type: 'wine', bin: '/w/wine', name: 'Odd' },
  autoInstallDxvk: true,
  targetExe: 'game.exe',
  launcherArgs: '-x',
  enviromentOptions: [{ key: 'MINE', value: 'yes' }]
} as unknown as GameSettings

const pinned = {
  kind: 'pinned' as const,
  pinId: 'p1',
  reason: 'cx-expired' as const,
  wineBin: '/pin/bin/wine',
  wineserverBin: '/pin/bin/wineserver',
  label: 'Pin One',
  version: '10.0',
  dxvk: null
}

afterEach(() => {
  clearEngineSelection(KEY)
  clearLaunchOverlayContext(KEY)
})

describe('getLaunchSettings', () => {
  it('returns stored itself when nothing is registered', () => {
    expect(getLaunchSettings(KEY, stored)).toBe(stored)
    expect(getLaunchSettings(null, stored)).toBe(stored)
  })

  it('returns stored when a selection has no overlay context', () => {
    setEngineSelection(KEY, pinned)
    expect(getLaunchSettings(KEY, stored)).toBe(stored)
  })

  it('overlays CrossOver on a bottle, keeping every other key', () => {
    setEngineSelection(KEY, {
      kind: 'crossover',
      reason: 'cx-healthy',
      crossoverBuild: '26.0.0.1',
      binDir: '/cx/bin'
    })
    setLaunchOverlayContext(KEY, {
      prefix: { kind: 'bottle', bottleName: 'GameLib' }
    })
    const out = getLaunchSettings(KEY, stored)
    expect(out.wineVersion).toEqual({
      type: 'crossover',
      bin: '/cx/bin/wine',
      name: 'CrossOver 26.0.0.1',
      wineserver: '/cx/bin/wineserver'
    })
    expect(out.wineCrossoverBottle).toBe('GameLib')
    expect(out.targetExe).toBe('game.exe')
    expect(out.launcherArgs).toBe('-x')
  })

  it('overlays a pinned engine on a bottle from the game own settings', () => {
    setEngineSelection(KEY, pinned)
    setLaunchOverlayContext(KEY, {
      prefix: { kind: 'bottle', bottleName: 'GameLib-gog-1234' }
    })
    const out = getLaunchSettings(KEY, stored)
    expect(out.winePrefix).toBe(getBottleDir('GameLib-gog-1234'))
    expect(out.wineVersion).toEqual({
      type: 'wine',
      bin: '/pin/bin/wine',
      name: 'Pin One',
      wineserver: '/pin/bin/wineserver'
    })
    expect(out.autoInstallDxvk).toBe(false)
    expect(out.enviromentOptions).toEqual(
      expect.arrayContaining([
        { key: 'MINE', value: 'yes' },
        { key: 'USER', value: 'crossover' }
      ])
    )
    expect(out.enviromentOptions).not.toEqual(
      expect.arrayContaining([{ key: 'GLOBAL', value: '1' }])
    )
    expect(out.targetExe).toBe('game.exe')
  })

  it('on a plain prefix replaces only the wine version', () => {
    setEngineSelection(KEY, pinned)
    setLaunchOverlayContext(KEY, { prefix: { kind: 'plain' } })
    const out = getLaunchSettings(KEY, stored)
    expect(out.winePrefix).toBe('/old/prefix')
    expect(out.autoInstallDxvk).toBe(true)
    expect(out.wineVersion?.bin).toBe('/pin/bin/wine')
    expect(out.wineVersion?.type).toBe('wine')
  })

  it('never mutates the input', () => {
    const snapshot = JSON.parse(JSON.stringify(stored))
    setEngineSelection(KEY, pinned)
    setLaunchOverlayContext(KEY, {
      prefix: { kind: 'bottle', bottleName: 'B' }
    })
    getLaunchSettings(KEY, stored)
    expect(JSON.parse(JSON.stringify(stored))).toEqual(snapshot)
  })
})

describe('buildCrossoverGameSettings', () => {
  it('names an unknown build plainly', () => {
    const out = buildCrossoverGameSettings(stored, 'B', join('/a', 'bin'), null)
    expect(out.wineVersion?.name).toBe('CrossOver')
  })
})

describe('buildFallbackGameSettings base', () => {
  it('spreads the global settings passed as the base', () => {
    const out = buildFallbackGameSettings('B', pinned, {
      enviromentOptions: [{ key: 'GLOBAL', value: '1' }],
      autoInstallDxvk: true
    } as GameSettings)
    expect(out.enviromentOptions).toEqual(
      expect.arrayContaining([{ key: 'GLOBAL', value: '1' }])
    )
  })
})
