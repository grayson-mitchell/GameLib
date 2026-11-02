import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// G17 (59-30 re-UAT item 22): `GameConfig`'s constructor started an async
// `load()`, so `this.config` was undefined for a tick. A per-game write that was
// the title's first `GameConfig.get` in the session threw
// "Cannot use 'in' operator to search for '<key>' in undefined" and the change
// was lost; the same-tick retry in applyGameSetting hit the same undefined.

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
jest.mock('../config', () => ({
  GlobalConfig: {
    get: () => ({
      getSettings: () => ({ enviromentOptions: [], wineVersion: {} })
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
})
