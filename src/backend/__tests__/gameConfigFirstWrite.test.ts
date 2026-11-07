import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// G17 (59-30 re-UAT item 22): `GameConfig`'s constructor started an async
// `load()`, so `this.config` was undefined for a tick. A per-game write that was
// the title's first `GameConfig.get` in the session threw
// "Cannot use 'in' operator to search for '<key>' in undefined" and the change
// was lost; the same-tick retry in applyGameSetting hit the same undefined.

// WR-04: a spy cannot redefine fs exports, so wrap writeFileSync in a plain
// function (not a jest.fn: the config resets mocks) that fails on demand.
const failNextWrite: { error: Error | null } = { error: null }
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs')
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (failNextWrite.error) {
        const error = failNextWrite.error
        failNextWrite.error = null
        throw error
      }
      return actual.writeFileSync(...args)
    }
  }
})

const dir = mkdtempSync(join(tmpdir(), 'gamelib-gameconfig-'))

jest.mock('../constants/paths', () => ({
  configPath: join(dir, 'config.json'),
  gamesConfigPath: dir,
  sharedWinePrefix: join(dir, 'prefixes'),
  userHome: dir
}))
jest.mock('../constants/environment', () => ({
  isMac: true,
  isWindows: false
}))
jest.mock('../logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  LogPrefix: { Backend: 'Backend', GameConfig: 'GameConfig' }
}))
const globalExtra: Record<string, unknown> = {}
jest.mock('../config', () => ({
  GlobalConfig: {
    get: () => ({
      getSettings: () => ({
        enviromentOptions: [],
        wineVersion: {},
        ...globalExtra
      })
    })
  }
}))

import { GameConfig } from '../game_config'

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('GameConfig first write (G17)', () => {
  it('a setSetting that is the first GameConfig.get keeps the other settings', () => {
    writeFileSync(join(dir, 'config.json'), '{}')
    const path = join(dir, '1284190.json')
    writeFileSync(
      path,
      JSON.stringify({
        '1284190': {
          steamEngineOverride: 'pinned:wine-staging-11.20',
          targetExe: 'Planet Crafter.exe'
        },
        version: 'v0',
        explicit: true
      })
    )

    expect(() =>
      GameConfig.get('1284190').setSetting('steamEngineOverride', 'automatic')
    ).not.toThrow()

    const written = JSON.parse(readFileSync(path, 'utf-8'))['1284190']
    expect(written.steamEngineOverride).toBe('automatic')
    expect(written.targetExe).toBe('Planet Crafter.exe')
    expect(GameConfig.get('1284190').config.steamEngineOverride).toBe(
      'automatic'
    )
  })

  it('the in-memory config is not overwritten by a late load after the write', async () => {
    writeFileSync(
      join(dir, '38400.json'),
      JSON.stringify({
        '38400': { steamEngineOverride: 'crossover' },
        version: 'v0',
        explicit: true
      })
    )
    const config = GameConfig.get('38400')
    config.setSetting('steamEngineOverride', 'automatic')
    await new Promise((resolve) => setImmediate(resolve))
    expect(config.config.steamEngineOverride).toBe('automatic')
  })

  describe('WR-04: a failed flush rolls memory back', () => {
    afterEach(() => (failNextWrite.error = null))

    const seed = (name: string, settings: Record<string, unknown>) =>
      writeFileSync(
        join(dir, `${name}.json`),
        JSON.stringify({ [name]: settings, version: 'v0', explicit: true })
      )

    it('WR-04: restores the prior value when the write throws', () => {
      writeFileSync(join(dir, 'config.json'), '{}')
      seed('wr04a', { steamEngineOverride: 'pinned:a' })
      const config = GameConfig.get('wr04a')
      failNextWrite.error = new Error('ENOSPC')
      expect(() =>
        config.setSetting('steamEngineOverride', 'automatic')
      ).toThrow('ENOSPC')
      expect(config.config.steamEngineOverride).toBe('pinned:a')
    })

    it('WR-04: removes the key when it was absent before the call', () => {
      writeFileSync(join(dir, 'config.json'), '{}')
      seed('wr04b', { targetExe: 'a.exe' })
      const config = GameConfig.get('wr04b')
      failNextWrite.error = new Error('EACCES')
      expect(() =>
        config.setSetting('steamEngineOverride', 'automatic')
      ).toThrow('EACCES')
      expect('steamEngineOverride' in config.config).toBe(false)
    })

    it('WR-04: a successful setSetting still persists to the file', () => {
      writeFileSync(join(dir, 'config.json'), '{}')
      seed('wr04c', { steamEngineOverride: 'pinned:a' })
      GameConfig.get('wr04c').setSetting('steamEngineOverride', 'automatic')
      const written = JSON.parse(
        readFileSync(join(dir, 'wr04c.json'), 'utf-8')
      )['wr04c']
      expect(written.steamEngineOverride).toBe('automatic')
    })
  })

  describe('Phase 61: engineOverride new-game default (D-02, D-08)', () => {
    afterEach(() => delete globalExtra.engineOverride)

    it('a new game inherits the global key; an existing game does not', () => {
      writeFileSync(join(dir, 'config.json'), '{}')
      globalExtra.engineOverride = 'pinned:wine-staging-11.20'
      expect(GameConfig.get('p61new').config.engineOverride).toBe(
        'pinned:wine-staging-11.20'
      )
      writeFileSync(
        join(dir, 'p61old.json'),
        JSON.stringify({ p61old: {}, version: 'v0', explicit: true })
      )
      expect(GameConfig.get('p61old').config.engineOverride).toBeUndefined()
    })

    it('no global key leaves a new game without one', () => {
      expect(GameConfig.get('p61none').config.engineOverride).toBeUndefined()
    })
  })
})
