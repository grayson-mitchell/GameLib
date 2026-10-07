/**
 * CR-01 regression test (Phase 48 Plan 07): a legacy profile's `libraryTopSection`
 * must reach the renderer's `focusRow` on the FIRST launch, through the REAL
 * read path -- not through the pure `migrateFocusRowSelection` alone.
 *
 * Why this file exists. The migration was proven correct in isolation
 * (`focusRowMigration.test.ts`) and the seed is computed inside
 * `GlobalConfigV0.getSettings()`, yet the live app never showed the strip.
 * The renderer seeds `focusRow` from the `store/config.json` `settings`
 * MIRROR (`configStore.get_nodefault('settings')`), which the migration never
 * wrote: two stores, one setting, and the renderer read the one the seed never
 * entered. Every existing suite mocks `backend/config`, so the gap was
 * invisible to all of them.
 *
 * What runs for REAL here (nothing below is `jest.mock`ed): `backend/config`
 * (`GlobalConfigV0.getSettings`, `setSetting`, `flush`), `backend/constants/
 * key_value_stores` (`configStore`), `backend/store_backend`,
 * `backend/constants/paths` (`configPath`), `backend/sidecar/
 * settingsFlowRegistration` (`registerSettingsFlows`: the `requestAppSettings`
 * handler and the `setSetting` listener), `backend/platform` (the handler and
 * listener registries) and `common/focusRowMigration`.
 *
 * Mocked, and why (every mock is listed here on purpose):
 *   - `backend/storeManagers`, `backend/storeManagers/steam/state`,
 *     `backend/game_config`: exactly as `settingsFlows.test.ts` does. They sit
 *     only on the per-game branch of the settings channels, which this suite
 *     never takes.
 *   - `backend/utils/systeminfo`: `registerSettingsFlows` imports it, and it
 *     shells out to real subprocesses at call time; this suite never calls it.
 *   - `backend/utils/compatibility_layers` `getDefaultWine` only (the rest of
 *     the module is real): `GlobalConfigV0.getFactoryDefaults()` calls it for
 *     host Wine discovery, which is irrelevant to `focusRow` and non-deterministic
 *     across machines.
 *
 * Containment: the Backend jest project's `jest.setupContainment.ts` already
 * redirects `os.homedir()`/`HOME`/`APPDATA`/`XDG_*` into a disposable per-file
 * root. The first test additionally asserts that `configPath` resolves under
 * `os.tmpdir()` BEFORE any write: the token-wipe incident `92c29a5e` is why
 * that guard is local and not merely trusted.
 *
 * Each "launch" is a fresh module graph (`jest.isolateModules`); the disk is
 * the only state carried between launches, which is what a real relaunch is.
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

type FocusRowSelection = import('common/types').FocusRowSelection

interface Launch {
  /** `seedFocusRowFromMirror(configStore.get_nodefault('settings'))`: the renderer's module-scope seed. */
  rendererSeed: () => {
    focusRow: FocusRowSelection
    needsMigratedValue: boolean
  }
  /** The real `requestAppSettings` handler, as the renderer would invoke it. */
  requestAppSettings: () => Promise<unknown>
  /** The real `setSetting` listener, as `window.api.setSetting` would reach it. */
  setSetting: (payload: {
    appName: 'default'
    key: string
    value: unknown
  }) => void
  hydrate: (overrides?: Partial<{ hasUserPicked: () => boolean }>) => Promise<{
    applied: FocusRowSelection[]
    result: FocusRowSelection | undefined
  }>
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
    const {
      seedFocusRowFromMirror,
      hydrateFocusRowSelection
    } = require('common/focusRowMigration')
    /* eslint-enable @typescript-eslint/no-require-imports */

    registerSettingsFlows()

    const handler = handlerRegistry.get('requestAppSettings') as (
      event: unknown
    ) => Promise<unknown>
    const listener = (
      listenerRegistry.get('setSetting') as Array<
        (event: unknown, payload: unknown) => void
      >
    )[0]
    // The path comes off the live store instance (conf's own `path`), never
    // reconstructed by hand.
    const mirrorPath = (configStore as unknown as { store: { path: string } })
      .store.path

    const setSetting: Launch['setSetting'] = (payload) => listener({}, payload)

    l = {
      rendererSeed: () =>
        seedFocusRowFromMirror(configStore.get_nodefault('settings')),
      requestAppSettings: () => handler({}),
      setSetting,
      hydrate: async (overrides = {}) => {
        const applied: FocusRowSelection[] = []
        const result = await hydrateFocusRowSelection({
          requestAppSettings: () => handler({}),
          setSetting,
          applyFocusRow: (value: FocusRowSelection) => applied.push(value),
          hasUserPicked: overrides.hasUserPicked ?? (() => false),
          onError: (error: unknown) => {
            throw error
          }
        })
        return { applied, result }
      },
      configPath,
      mirrorPath
    }
  })
  return l
}

/** Nearest existing ancestor of `target`, so a not-yet-created path can still be realpath'd. */
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

interface LegacyFixture {
  libraryTopSection: string
}

/**
 * Writes the legacy profile: `config.json` carries `libraryTopSection` and no
 * `focusRow`; the mirror's `settings` carries the same and no `focusRow`, plus
 * the two stores the migration must never touch.
 */
function writeLegacyProfile(
  paths: { configPath: string; mirrorPath: string },
  { libraryTopSection }: LegacyFixture
): void {
  mkdirSync(dirname(paths.configPath), { recursive: true })
  mkdirSync(dirname(paths.mirrorPath), { recursive: true })
  writeFileSync(
    paths.configPath,
    JSON.stringify({
      version: 'v0',
      defaultSettings: { libraryTopSection, language: 'en' }
    })
  )
  writeFileSync(
    paths.mirrorPath,
    JSON.stringify({
      settings: { libraryTopSection, language: 'en' },
      games: {
        recent: [
          { appName: 'a_1', title: 'Alpha' },
          { appName: 'b_2', title: 'Beta' }
        ],
        customCategories: { Roguelikes: ['a_1'] }
      }
    })
  )
}

const RECENT = [
  { appName: 'a_1', title: 'Alpha' },
  { appName: 'b_2', title: 'Beta' }
]
const CATEGORIES = { Roguelikes: ['a_1'] }

describe('CR-01: legacy libraryTopSection reaches the renderer focusRow on first launch (real read path)', () => {
  let paths: { configPath: string; mirrorPath: string }

  beforeAll(() => {
    // Containment guard, BEFORE any write. A single `launch()` here only
    // resolves paths; it writes nothing.
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

  it('control: the renderer seed alone, off the legacy mirror, is null and asks for the migrated value (the pre-fix outcome)', () => {
    writeLegacyProfile(paths, { libraryTopSection: 'recently_played' })
    const first = launch()

    expect(first.rendererSeed()).toEqual({
      focusRow: null,
      needsMigratedValue: true
    })
  })

  it.each([
    ['recently_played', { kind: 'view', value: 'recentlyPlayed' }],
    ['favourites', { kind: 'view', value: 'favourites' }],
    ['disabled', null]
  ])(
    'libraryTopSection %s: launch 1 hydrates %j, writes the key into BOTH files, launch 2 seeds synchronously',
    async (libraryTopSection, expected) => {
      writeLegacyProfile(paths, { libraryTopSection })

      // Launch 1.
      const first = launch()
      expect(first.rendererSeed().needsMigratedValue).toBe(true)
      const { applied, result } = await first.hydrate()
      expect(applied).toEqual([expected])
      expect(result).toEqual(expected)

      const mirror = readJson(paths.mirrorPath) as {
        settings: Record<string, unknown>
        games: Record<string, unknown>
      }
      const config = readJson(paths.configPath) as {
        defaultSettings: Record<string, unknown>
      }
      expect(mirror.settings.focusRow).toEqual(expected)
      expect(config.defaultSettings.focusRow).toEqual(expected)
      // The legacy field is left untouched, so deleting `focusRow` from both
      // files restores the pre-upgrade state exactly.
      expect(mirror.settings.libraryTopSection).toBe(libraryTopSection)
      expect(config.defaultSettings.libraryTopSection).toBe(libraryTopSection)
      // Prohibitions: hydration writes only `settings.focusRow`.
      expect(mirror.games.recent).toEqual(RECENT)
      expect(mirror.games.customCategories).toEqual(CATEGORIES)

      // Launch 2: fresh module graph, same disk.
      const second = launch()
      expect(second.rendererSeed()).toEqual({
        focusRow: expected,
        needsMigratedValue: false
      })
    }
  )

  it('clearing the row survives a relaunch: the legacy field is never consulted again', async () => {
    writeLegacyProfile(paths, { libraryTopSection: 'recently_played' })
    const first = launch()
    await first.hydrate()

    // The user clears the row.
    const second = launch()
    second.setSetting({ appName: 'default', key: 'focusRow', value: null })

    const third = launch()
    expect(third.rendererSeed()).toEqual({
      focusRow: null,
      needsMigratedValue: false
    })
    const settings = (await third.requestAppSettings()) as {
      focusRow: unknown
    }
    expect(settings.focusRow).toBeNull()
  })

  it('R1: a collection pick written through the real setSetting listener seeds unchanged on the next launch', async () => {
    writeLegacyProfile(paths, { libraryTopSection: 'disabled' })
    const first = launch()
    await first.hydrate()
    first.setSetting({
      appName: 'default',
      key: 'focusRow',
      value: { kind: 'collection', value: 'Roguelikes' }
    })

    const second = launch()
    expect(second.rendererSeed()).toEqual({
      focusRow: { kind: 'collection', value: 'Roguelikes' },
      needsMigratedValue: false
    })
  })
})
