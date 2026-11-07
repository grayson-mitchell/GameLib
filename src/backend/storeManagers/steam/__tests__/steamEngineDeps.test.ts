/**
 * 59-UAT G11: the stored per-game engine override is read straight from the
 * title's GameConfig file, never through GameConfig.get (whose `config` is
 * filled asynchronously, and which creates a missing file).
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const mockDir = mkdtempSync(join(tmpdir(), 'gamelib-gamesconfig-'))
jest.mock('backend/constants/paths', () => ({
  ...jest.requireActual('backend/constants/paths'),
  gamesConfigPath: mockDir
}))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('backend/storeManagers/steam/bottle', () => ({
  persistedWineBins: jest.fn(() => [])
}))
jest.mock('backend/storeManagers/steam/bridgeBottle', () => ({
  bridgeBottleNameFor: jest.fn(),
  getBridgeBottleSettings: jest.fn()
}))
jest.mock('backend/storeManagers/steam/bottleProcessMonitor', () => ({
  getBottleProcessMonitorPhase: jest.fn()
}))

import {
  isDrmModeFromVerdict,
  readSteamEngineOverride as readStoredEngineOverride
} from '../engine/steamEngineDeps'

afterAll(() => rmSync(mockDir, { recursive: true, force: true }))

const writeConfig = (appId: string, body: unknown) =>
  writeFileSync(join(mockDir, `${appId}.json`), JSON.stringify(body))

describe('readStoredEngineOverride (59-UAT G11, D-08)', () => {
  it('returns the stored value from the title config', () => {
    writeConfig('38400', {
      '38400': { steamEngineOverride: 'pinned:wine-staging-11.20' },
      version: 'v0',
      explicit: false
    })
    expect(readStoredEngineOverride('38400')).toBe('pinned:wine-staging-11.20')
  })

  it('engineOverride wins over steamEngineOverride (D-08)', () => {
    writeConfig('38401', {
      '38401': {
        engineOverride: 'crossover',
        steamEngineOverride: 'pinned:wine-staging-11.20'
      },
      version: 'v0'
    })
    expect(readStoredEngineOverride('38401')).toBe('crossover')
  })

  it('a missing file is undefined and is not created', () => {
    expect(readStoredEngineOverride('620')).toBeUndefined()
    expect(existsSync(join(mockDir, '620.json'))).toBe(false)
  })

  it('a corrupt file or a missing key is undefined', () => {
    writeFileSync(join(mockDir, '70.json'), '{not json')
    expect(readStoredEngineOverride('70')).toBeUndefined()
    writeConfig('71', { '71': {}, version: 'v0' })
    expect(readStoredEngineOverride('71')).toBeUndefined()
  })

  it('a non-numeric appId never touches the filesystem', () => {
    expect(readStoredEngineOverride('../evil')).toBeUndefined()
  })
})

describe('isDrmModeFromVerdict (WR-01, WR-07)', () => {
  it('maps persisted mode, CEG and steamstub scan to DRM mode', () => {
    expect(isDrmModeFromVerdict({ mode: 'steamclient-layer' })).toBe(true)
    expect(isDrmModeFromVerdict({ mode: 'tcp', drm: 'ceg' })).toBe(true)
    expect(isDrmModeFromVerdict({ scan: { drmWrapper: 'steamstub' } })).toBe(
      true
    )
    expect(isDrmModeFromVerdict({ drm: 'ceg' })).toBe(true)
    expect(isDrmModeFromVerdict({ scan: {} })).toBe(false)
    expect(isDrmModeFromVerdict(undefined)).toBe(false)
    expect(isDrmModeFromVerdict({ mode: 'tcp', drm: 'none' })).toBe(false)
  })
})
