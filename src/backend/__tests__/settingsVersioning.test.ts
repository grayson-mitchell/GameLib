import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTestVersioning } from '../testUtils/testStoreRoot'
import { createTestAppPaths } from '../testUtils/testAppPaths'

// Phase 68 plan 05: config.json and GamesConfig/<app>.json on the store engine.
// Every test gets a fresh directory and a fresh module graph, so the
// GlobalConfig/GameConfig singletons and the engine's per-path state reset.

const mockPaths = { dir: '' }

jest.mock('../utils/compatibility_layers', () => ({
  getDefaultWineBinary: () => ({ name: 'x', bin: '', type: 'wine' })
}))
jest.mock('../logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: new Proxy({}, { get: (_t, k) => String(k) })
}))

type ConfigModule = typeof import('../config')
type GameConfigModule = typeof import('../game_config')
type EngineConfigModule = typeof import('../engine/engineConfig')

// Each graph also gets its own versioning engine (a root's engine, as at boot): the per-path state
// resets with it, so the wrappers below bake it in.
interface Graph {
  createGlobalConfig: () => ReturnType<ConfigModule['createGlobalConfig']>
  createGameConfigs: (deps: {
    config: Parameters<GameConfigModule['createGameConfigs']>[0]['config']
  }) => ReturnType<GameConfigModule['createGameConfigs']>
  readStoredGameConfig: (
    appName: string,
    deps: { gamesConfigPath: string }
  ) => ReturnType<EngineConfigModule['readStoredGameConfig']>
}

function freshGraph(): Graph {
  let g!: Graph
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const versioning = createTestVersioning()
    // The per-test temp dir is the boot's AppPaths here.
    const paths = createTestAppPaths(mockPaths.dir, {
      configPath: join(mockPaths.dir, 'config.json'),
      gamesConfigPath: join(mockPaths.dir, 'GamesConfig'),
      sharedWinePrefix: join(mockPaths.dir, 'prefixes'),
      userHome: mockPaths.dir
    })
    const config = require('../config') as ConfigModule
    const gameConfig = require('../game_config') as GameConfigModule
    const engineConfig = require('../engine/engineConfig') as EngineConfigModule
    g = {
      createGlobalConfig: () =>
        config.createGlobalConfig({
          requestRustInvoke: jest.fn(),
          versioning,
          paths
        }),
      createGameConfigs: (deps) =>
        gameConfig.createGameConfigs({ ...deps, versioning, paths }),
      readStoredGameConfig: (appName, deps) =>
        engineConfig.readStoredGameConfig(appName, { ...deps, versioning })
    }
    /* eslint-enable @typescript-eslint/no-require-imports */
  })
  return g
}

const configFile = () => join(mockPaths.dir, 'config.json')
const gameFile = (app: string) =>
  join(mockPaths.dir, 'GamesConfig', `${app}.json`)
const backups = (prefix: string) =>
  readdirSync(
    prefix === 'config' ? mockPaths.dir : join(mockPaths.dir, 'GamesConfig')
  ).filter((f) => f.startsWith(`${prefix}.v`) && f.endsWith('.bak.json'))

let stderr: jest.SpyInstance

beforeEach(() => {
  mockPaths.dir = mkdtempSync(join(tmpdir(), 'gamelib-settings-ver-'))
  mkdirSync(join(mockPaths.dir, 'GamesConfig'))
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  stderr.mockRestore()
  rmSync(mockPaths.dir, { recursive: true, force: true })
})

describe('global settings', () => {
  it('a newer config loads without throwing and is never written', () => {
    const text = JSON.stringify({
      defaultSettings: { language: 'fr', checkUpdatesInterval: 77 },
      version: 'v9'
    })
    writeFileSync(configFile(), text)
    const { createGlobalConfig } = freshGraph()

    const config = createGlobalConfig()
    expect(config.getSettings().checkUpdatesInterval).toBe(77)
    config.setSetting('language', 'de', {
      configStore: { get_nodefault: jest.fn(), set: jest.fn() } as never
    })
    expect(config.getSettings().language).toBe('de')
    expect(readFileSync(configFile(), 'utf8')).toBe(text)
  })

  it('a v0 config is migrated to v1 with tray variant persisted and a backup', () => {
    writeFileSync(
      configFile(),
      JSON.stringify({
        defaultSettings: { darkTrayIcon: true, language: 'en' }
      })
    )
    const { createGlobalConfig } = freshGraph()

    expect(createGlobalConfig().getSettings().trayIconVariant).toBe('dark')
    const onDisk = JSON.parse(readFileSync(configFile(), 'utf8'))
    expect(onDisk.version).toBe('v1')
    expect(onDisk.defaultSettings.trayIconVariant).toBe('dark')
    expect('darkTrayIcon' in onDisk.defaultSettings).toBe(false)
    expect(backups('config')).toHaveLength(1)
  })

  it('a missing config produces a fresh private v1 file', () => {
    const { createGlobalConfig } = freshGraph()
    createGlobalConfig()
    expect(JSON.parse(readFileSync(configFile(), 'utf8')).version).toBe('v1')
    expect(statSync(configFile()).mode & 0o777).toBe(0o600)
  })
})

describe('per-game settings', () => {
  const seed = (app: string, version = 'v0') =>
    writeFileSync(
      gameFile(app),
      JSON.stringify({
        [app]: { targetExe: 'a.exe' },
        version,
        explicit: true
      })
    )

  it('get() does not rewrite a v0 file; the first real write stamps v1', () => {
    writeFileSync(
      configFile(),
      JSON.stringify({ defaultSettings: {}, version: 'v1' })
    )
    seed('app0')
    const before = readFileSync(gameFile('app0'))
    const mtime = statSync(gameFile('app0')).mtimeMs
    const { createGameConfigs, createGlobalConfig } = freshGraph()
    const gameConfigs = createGameConfigs({ config: createGlobalConfig() })

    const game = gameConfigs.get('app0')
    expect(readFileSync(gameFile('app0')).equals(before)).toBe(true)
    expect(statSync(gameFile('app0')).mtimeMs).toBe(mtime)
    expect(backups('app0')).toHaveLength(0)

    game.setSetting('showFps', true)
    const after = JSON.parse(readFileSync(gameFile('app0'), 'utf8'))
    expect(after.version).toBe('v1')
    expect(after.app0.showFps).toBe(true)
  })

  it('a newer game file is readable, keeps changes in memory and is never written', () => {
    writeFileSync(
      configFile(),
      JSON.stringify({ defaultSettings: {}, version: 'v1' })
    )
    seed('app7', 'v7')
    const before = readFileSync(gameFile('app7'))
    const { createGameConfigs, createGlobalConfig } = freshGraph()
    const gameConfigs = createGameConfigs({ config: createGlobalConfig() })

    const game = gameConfigs.get('app7')
    expect(game.config.targetExe).toBe('a.exe')
    expect(() => game.setSetting('showFps', true)).not.toThrow()
    expect(game.config.showFps).toBe(true)
    expect(readFileSync(gameFile('app7')).equals(before)).toBe(true)
  })

  it('readStoredGameConfig returns the entry and migrates without a write', () => {
    seed('appr')
    const before = readFileSync(gameFile('appr'))
    const { readStoredGameConfig } = freshGraph()

    expect(
      readStoredGameConfig('appr', {
        gamesConfigPath: join(mockPaths.dir, 'GamesConfig')
      })
    ).toEqual({ targetExe: 'a.exe' })
    expect(
      readStoredGameConfig('appr', {
        gamesConfigPath: join(mockPaths.dir, 'GamesConfig')
      })
    ).toEqual({ targetExe: 'a.exe' })
    expect(readFileSync(gameFile('appr')).equals(before)).toBe(true)
    expect(backups('appr')).toHaveLength(0)
    expect(existsSync(gameFile('appr'))).toBe(true)
  })
})
