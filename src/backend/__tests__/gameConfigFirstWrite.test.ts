import { createTestVersioning } from 'backend/testUtils/testStoreRoot'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// G17 (59-30 re-UAT item 22): `GameConfig`'s constructor started an async
// `load()`, so `this.config` was undefined for a tick. A per-game write that was
// the title's first per-game `get` in the session threw
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
      // Persistent until the test's afterEach clears it: the atomic writer
      // retries once with a direct write, and a real ENOSPC fails both.
      if (failNextWrite.error) {
        throw failNextWrite.error
      }
      return actual.writeFileSync(...args)
    }
  }
})

const dir = mkdtempSync(join(tmpdir(), 'gamelib-gameconfig-'))

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
import { createGameConfigs } from '../game_config'
const pathsModule = createTestAppPaths(dir, {
  configPath: join(dir, 'config.json'),
  gamesConfigPath: dir,
  sharedWinePrefix: join(dir, 'prefixes'),
  userHome: dir
})

// The global defaults the per-game config reads through its injected slice.
const gameConfigs = createGameConfigs({
  versioning: createTestVersioning(),
  paths: pathsModule,
  config: {
    getSettings: () =>
      ({
        enviromentOptions: [],
        wineVersion: {},
        ...globalExtra
      }) as never
  }
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('GameConfig first write (G17)', () => {
  it('a setSetting that is the first gameConfigs.get keeps the other settings', () => {
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
      gameConfigs.get('1284190').setSetting('steamEngineOverride', 'automatic')
    ).not.toThrow()

    const written = JSON.parse(readFileSync(path, 'utf-8'))['1284190']
    expect(written.steamEngineOverride).toBe('automatic')
    expect(written.targetExe).toBe('Planet Crafter.exe')
    expect(gameConfigs.get('1284190').config.steamEngineOverride).toBe(
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
    const config = gameConfigs.get('38400')
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
      const config = gameConfigs.get('wr04a')
      failNextWrite.error = new Error('ENOSPC')
      expect(() =>
        config.setSetting('steamEngineOverride', 'automatic')
      ).toThrow('ENOSPC')
      expect(config.config.steamEngineOverride).toBe('pinned:a')
    })

    it('WR-04: removes the key when it was absent before the call', () => {
      writeFileSync(join(dir, 'config.json'), '{}')
      seed('wr04b', { targetExe: 'a.exe' })
      const config = gameConfigs.get('wr04b')
      failNextWrite.error = new Error('EACCES')
      expect(() =>
        config.setSetting('steamEngineOverride', 'automatic')
      ).toThrow('EACCES')
      expect('steamEngineOverride' in config.config).toBe(false)
    })

    it('WR-04: a successful setSetting still persists to the file', () => {
      writeFileSync(join(dir, 'config.json'), '{}')
      seed('wr04c', { steamEngineOverride: 'pinned:a' })
      gameConfigs.get('wr04c').setSetting('steamEngineOverride', 'automatic')
      const written = JSON.parse(
        readFileSync(join(dir, 'wr04c.json'), 'utf-8')
      )['wr04c']
      expect(written.steamEngineOverride).toBe('automatic')
    })
  })

  it('gameConfigs.get for a missing game config no longer creates a file as a side effect (68-05, RESEARCH A5)', () => {
    writeFileSync(join(dir, 'config.json'), '{}')
    gameConfigs.get('p68missing')
    expect(existsSync(join(dir, 'p68missing.json'))).toBe(false)
  })

  describe('Phase 61: engineOverride is never a game default (CR-05, D-08)', () => {
    afterEach(() => delete globalExtra.engineOverride)

    it('a config-less game has no engineOverride even with a global pick', async () => {
      writeFileSync(join(dir, 'config.json'), '{}')
      globalExtra.engineOverride = 'pinned:wine-staging-11.20'
      expect(gameConfigs.get('p61new').config.engineOverride).toBeUndefined()
      expect(
        (await gameConfigs.get('p61new').getSettings()).engineOverride
      ).toBeUndefined()
    })

    it('an unrelated setSetting on a config-less game never writes engineOverride', () => {
      writeFileSync(join(dir, 'config.json'), '{}')
      globalExtra.engineOverride = 'pinned:wine-staging-11.20'
      gameConfigs.get('p61unrelated').setSetting('showFps', true)
      const written = JSON.parse(
        readFileSync(join(dir, 'p61unrelated.json'), 'utf-8')
      )['p61unrelated']
      expect(written.showFps).toBe(true)
      expect('engineOverride' in written).toBe(false)
    })

    it('an Engine edit still writes engineOverride (D-08)', () => {
      writeFileSync(join(dir, 'config.json'), '{}')
      globalExtra.engineOverride = 'pinned:wine-staging-11.20'
      gameConfigs.get('p61edit').setSetting('engineOverride', 'crossover')
      const written = JSON.parse(
        readFileSync(join(dir, 'p61edit.json'), 'utf-8')
      )['p61edit']
      expect(written.engineOverride).toBe('crossover')
    })

    it('no global key leaves a new game without one', () => {
      expect(gameConfigs.get('p61none').config.engineOverride).toBeUndefined()
    })
  })
})
