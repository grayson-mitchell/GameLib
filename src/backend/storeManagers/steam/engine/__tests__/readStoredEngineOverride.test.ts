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

import { readStoredEngineOverride } from '../engineDecision'

afterAll(() => rmSync(mockDir, { recursive: true, force: true }))

const writeConfig = (appId: string, body: unknown) =>
  writeFileSync(join(mockDir, `${appId}.json`), JSON.stringify(body))

describe('readStoredEngineOverride (59-UAT G11)', () => {
  it('returns the stored value from the title config', () => {
    writeConfig('38400', {
      '38400': { steamEngineOverride: 'pinned:wine-staging-11.20' },
      version: 'v0',
      explicit: false
    })
    expect(readStoredEngineOverride('38400')).toBe('pinned:wine-staging-11.20')
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
