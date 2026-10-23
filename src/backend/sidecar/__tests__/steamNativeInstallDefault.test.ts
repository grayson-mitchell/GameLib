/**
 * Quick 261024-exo: `AppSettings.enableSteamNativeInstall` ("Download Steam
 * games directly in GameLib") defaults to ON. An absent key reads true; a
 * persisted explicit false is ALWAYS respected, across a simulated restart.
 *
 * Same harness as `dismissedSignInNoticesSetting.test.ts`: the REAL
 * `backend/config`, `configStore` and settings flows over a disposable
 * per-file profile; each "launch" is a fresh module graph. No child process
 * is spawned, so no fake-HOME profile is needed.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, sep } from 'path'

jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    steam: { getGame: jest.fn() },
    gog: { getGame: jest.fn() }
  }
}))

jest.mock('../../storeManagers/steam/state', () => ({
  library: new Map()
}))

jest.mock('backend/game_config', () => ({
  GameConfig: { get: jest.fn() }
}))

jest.mock('backend/utils/systeminfo', () => ({
  getSystemInfo: jest.fn()
}))

jest.mock('backend/utils/compatibility_layers', () => ({
  ...jest.requireActual('backend/utils/compatibility_layers'),
  getDefaultWine: () => ({ bin: '', name: 'Wine - Test', type: 'wine' })
}))

interface Launch {
  /** The real `requestAppSettings` handler, as the renderer would invoke it. */
  requestAppSettings: () => Promise<Record<string, unknown>>
  /** The real `setSetting` listener, as `window.api.setSetting` would reach it. */
  setSetting: (payload: {
    appName: 'default'
    key: string
    value: unknown
  }) => void
  /** `GlobalConfig.get().getSettings()` off the real file. */
  getSettings: () => Record<string, unknown>
  /** `GlobalConfig.get().getFactoryDefaults()`. */
  getFactoryDefaults: () => Record<string, unknown>
  /** What the renderer's module-scope seed reads: `configStore.get_nodefault('settings')`. */
  mirrorSettings: () => Record<string, unknown> | undefined
  configPath: string
  mirrorPath: string
}

/** One launch of the app: a fresh module graph over whatever is on disk. */
function launch(): Launch {
  let l!: Launch
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { handlerRegistry, listenerRegistry } = require('backend/platform')
    const {
      registerSettingsFlows
    } = require('backend/sidecar/settingsFlowRegistration')
    const { configStore } = require('backend/constants/key_value_stores')
    const { configPath } = require('backend/constants/paths')
    const { GlobalConfig } = require('backend/config')
    /* eslint-enable @typescript-eslint/no-require-imports */

    registerSettingsFlows()

    const handler = handlerRegistry.get('requestAppSettings') as (
      event: unknown
    ) => Promise<Record<string, unknown>>
    const listener = (
      listenerRegistry.get('setSetting') as Array<
        (event: unknown, payload: unknown) => void
      >
    )[0]
    const mirrorPath = (configStore as unknown as { store: { path: string } })
      .store.path

    l = {
      requestAppSettings: () => handler({}),
      setSetting: (payload) => listener({}, payload),
      getSettings: () => GlobalConfig.get().getSettings(),
      getFactoryDefaults: () => GlobalConfig.get().getFactoryDefaults(),
      mirrorSettings: () => configStore.get_nodefault('settings'),
      configPath,
      mirrorPath
    }
  })
  return l
}

function realpathOfNearestAncestor(target: string): string {
  let current = target
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return realpathSync(current)
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
}

/** A profile written before this key existed: no `enableSteamNativeInstall`. */
function writeProfileWithoutKey(paths: {
  configPath: string
  mirrorPath: string
}): void {
  writeProfile(paths, { language: 'en' })
}

/** A profile whose config.json carries an explicit persisted false. */
function writeProfileWithExplicitFalse(paths: {
  configPath: string
  mirrorPath: string
}): void {
  writeProfile(paths, { language: 'en', enableSteamNativeInstall: false })
}

function writeProfile(
  paths: { configPath: string; mirrorPath: string },
  defaultSettings: Record<string, unknown>
): void {
  mkdirSync(dirname(paths.configPath), { recursive: true })
  mkdirSync(dirname(paths.mirrorPath), { recursive: true })
  writeFileSync(
    paths.configPath,
    JSON.stringify({ version: 'v0', defaultSettings })
  )
  writeFileSync(
    paths.mirrorPath,
    JSON.stringify({ settings: { ...defaultSettings } })
  )
}

describe('quick 261024-exo: enableSteamNativeInstall defaults ON, explicit false is respected', () => {
  let paths: { configPath: string; mirrorPath: string }

  beforeAll(() => {
    const probe = launch()
    paths = { configPath: probe.configPath, mirrorPath: probe.mirrorPath }
    const tmpRoot = realpathSync(tmpdir())
    for (const target of [paths.configPath, paths.mirrorPath]) {
      const real = realpathOfNearestAncestor(dirname(target))
      expect(real === tmpRoot || real.startsWith(tmpRoot + sep)).toBe(true)
    }
  })

  beforeEach(() => {
    for (const target of [paths.configPath, paths.mirrorPath]) {
      rmSync(target, { force: true })
    }
  })

  it('the factory default is true', () => {
    expect(launch().getFactoryDefaults().enableSteamNativeInstall).toBe(true)
  })

  it('a fresh profile (no config.json) reads true from getSettings and requestAppSettings', async () => {
    const first = launch()
    expect(first.getSettings().enableSteamNativeInstall).toBe(true)
    const requested = await first.requestAppSettings()
    expect(requested.enableSteamNativeInstall).toBe(true)
  })

  it('a profile written without the key reads true', async () => {
    writeProfileWithoutKey(paths)
    const first = launch()
    expect(first.getSettings().enableSteamNativeInstall).toBe(true)
    const requested = await first.requestAppSettings()
    expect(requested.enableSteamNativeInstall).toBe(true)
  })

  it('a profile with an explicit persisted false reads false, before and after a restart', () => {
    writeProfileWithExplicitFalse(paths)
    expect(launch().getSettings().enableSteamNativeInstall).toBe(false)
    expect(launch().getSettings().enableSteamNativeInstall).toBe(false)
  })

  it('setSetting(false) on a default profile survives a simulated restart in config.json and the mirror', () => {
    writeProfileWithoutKey(paths)
    launch().setSetting({
      appName: 'default',
      key: 'enableSteamNativeInstall',
      value: false
    })

    const second = launch()
    expect(second.getSettings().enableSteamNativeInstall).toBe(false)

    const config = readJson(paths.configPath) as {
      defaultSettings: Record<string, unknown>
    }
    const mirror = readJson(paths.mirrorPath) as {
      settings: Record<string, unknown>
    }
    expect(config.defaultSettings.enableSteamNativeInstall).toBe(false)
    expect(mirror.settings.enableSteamNativeInstall).toBe(false)
    expect(second.mirrorSettings()?.enableSteamNativeInstall).toBe(false)
  })
})
