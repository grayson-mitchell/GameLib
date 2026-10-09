/**
 * Phase 49 Plan 07 (D-10): the persisted per-store dismissed set is the
 * `AppSettings.dismissedSignInNotices` key, factory default `[]`.
 *
 * Same harness as `focusRowFirstLaunchHydration.test.ts`: the REAL
 * `backend/config`, `configStore`, `settingsFlowRegistration` and platform
 * registries over a disposable per-file profile; each "launch" is a fresh
 * module graph (`jest.isolateModules`) and the disk is the only state carried
 * between launches.
 *
 * Mocked, and why: `backend/storeManagers`, `steam/state`, `backend/game_config`
 * and `backend/utils/systeminfo` sit only on the per-game branch of the settings
 * channels, which this suite never takes; `getDefaultWine` is host discovery and
 * non-deterministic across machines.
 *
 * The two-store hazard (`common/focusRowMigration.ts`, CR-01) is CHECKED here,
 * not assumed: an absent key is `[]` on both sides, and a write lands in both
 * `config.json` and the `store/config.json` `settings` mirror the renderer seeds
 * from.
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

/** A profile written before this key existed: no `dismissedSignInNotices` anywhere. */
function writeProfileWithoutKey(paths: {
  configPath: string
  mirrorPath: string
}): void {
  mkdirSync(dirname(paths.configPath), { recursive: true })
  mkdirSync(dirname(paths.mirrorPath), { recursive: true })
  writeFileSync(
    paths.configPath,
    JSON.stringify({ version: 'v0', defaultSettings: { language: 'en' } })
  )
  writeFileSync(
    paths.mirrorPath,
    JSON.stringify({ settings: { language: 'en' } })
  )
}

describe('D-10: AppSettings.dismissedSignInNotices persists, defaults to [], survives a restart', () => {
  let paths: { configPath: string; mirrorPath: string }

  beforeAll(() => {
    // Containment guard, BEFORE any write: resolving paths writes nothing.
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

  it('the factory defaults carry an empty dismissed set', () => {
    expect(launch().getFactoryDefaults().dismissedSignInNotices).toEqual([])
  })

  it('an existing profile without the key reads [] with no migration', async () => {
    writeProfileWithoutKey(paths)
    const first = launch()

    expect(first.getSettings().dismissedSignInNotices).toEqual([])
    const requested = await first.requestAppSettings()
    expect(requested.dismissedSignInNotices).toEqual([])
    // Both sides of the two-store hazard agree: the mirror has no key, and the
    // renderer's `normalizeSignInDismissals(undefined)` is [] as well.
    expect(first.mirrorSettings()?.dismissedSignInNotices).toBeUndefined()
  })

  it('a value written through setSetting survives a simulated restart', () => {
    writeProfileWithoutKey(paths)
    const first = launch()
    first.setSetting({
      appName: 'default',
      key: 'dismissedSignInNotices',
      value: ['gog']
    })

    // Launch 2: a fresh GlobalConfig instance over the same disk.
    const second = launch()
    expect(second.getSettings().dismissedSignInNotices).toEqual(['gog'])
  })

  it('setSetting lands the value in BOTH config.json and the settings mirror the renderer seeds from', () => {
    writeProfileWithoutKey(paths)
    launch().setSetting({
      appName: 'default',
      key: 'dismissedSignInNotices',
      value: ['gog', 'steam']
    })

    const config = readJson(paths.configPath) as {
      defaultSettings: Record<string, unknown>
    }
    const mirror = readJson(paths.mirrorPath) as {
      settings: Record<string, unknown>
    }
    expect(config.defaultSettings.dismissedSignInNotices).toEqual([
      'gog',
      'steam'
    ])
    expect(mirror.settings.dismissedSignInNotices).toEqual(['gog', 'steam'])

    // The renderer's module-scope seed on the next launch reads the mirror.
    expect(launch().mirrorSettings()?.dismissedSignInNotices).toEqual([
      'gog',
      'steam'
    ])
  })
})
