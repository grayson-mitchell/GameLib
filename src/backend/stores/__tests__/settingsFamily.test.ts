/**
 * The settings family moves to the Rust owner, last (Phase 85 plan 15, FND-06, D-01).
 *
 * The three settings stores are mirror-backed and every write is a frame for the shell's single
 * writer (no flag and no conf owner since 85-21, D-03): the renderer's settings mirror
 * `store/config.json` (configStore, a store-flavour file: `set` frames), the global document
 * `config.json` and every per-game `GamesConfig/<app>.json` (whole-document `replace` frames,
 * settingsDocs.ts). This suite covers GlobalConfig on the seam, the D-22 first boot, the D-15/D-20 resync
 * through the configStore mirror, and the two direct per-game readers (engine, Steam title). The
 * Rust half (boot migration of older documents with backups, the boot bound, the document keys) is
 * `cargo test --bin gamelib-shell store_boot`.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import tableFile from 'common/types/ipc/storeTable.json'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { createGlobalConfig } from '../../config'
import { readStoredGameConfig } from '../../engine/engineConfig'
import { resyncSettingsMirror } from '../../settingsMirrorResync'
import { readStoredTitleConfig } from '../../storeManagers/steam/titleSettings'
import { createStores } from '../createStores'
import { writeSettingsDoc } from '../settingsDocs'
import { createStoreRegistry } from '../storeRegistry'
import {
  isRustOwnedStoreKey,
  type StoreFrame,
  type StoreFrameSink
} from '../storeFrames'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'

const SETTINGS_ROWS = tableFile.rows.filter((row) => row.family === 'settings')

/** A sink that records every frame and never answers: every write stays pending. */
function silentSink(frames: StoreFrame[]): StoreFrameSink {
  return { send: (frame) => frames.push(frame) }
}

let userData: string
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'gamelib-settings-family-'))
})
afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

const configPath = () => join(userData, 'config.json')
const gamesConfig = () => join(userData, 'GamesConfig')

function paths() {
  return createTestAppPaths(userData, {
    configPath: configPath(),
    gamesConfigPath: gamesConfig(),
    sharedWinePrefix: join(userData, 'prefixes'),
    userHome: userData
  })
}

/** The boot's wiring over one root: the stores, the global config built on the root, the frames. */
function build(opts: { silent?: boolean } = {}) {
  const frames: StoreFrame[] = []
  const root = createTestStoreRoot(
    userData,
    opts.silent ? { frameSink: silentSink(frames) } : { recordFrames: frames }
  )
  const stores = createStores({ registry: createStoreRegistry(), root })
  const config = () =>
    createGlobalConfig({
      requestRustInvoke: jest.fn(),
      root,
      paths: paths()
    })
  return { root, stores, frames, config }
}

function seedGlobal(defaultSettings: Record<string, unknown>) {
  writeFileSync(
    configPath(),
    JSON.stringify({ defaultSettings, version: 'v2' }, null, 2)
  )
}

describe(`the settings family (${SETTINGS_ROWS.length} settings rows)`, () => {
  it('names the three settings rows', () => {
    expect(SETTINGS_ROWS.map((row) => row.key).sort()).toEqual([
      'settings/game',
      'settings/global',
      'store/config'
    ])
  })

  it('owns configStore, config.json and GamesConfig/<app>', () => {
    for (const key of ['store/config', 'settings/global', 'GamesConfig/480']) {
      expect(isRustOwnedStoreKey(key)).toBe(true)
    }
  })

  it('configStore is mirror-backed (a set frame)', () => {
    const rust = build()
    rust.stores.kvs.configStore.set('settings', { language: 'de' } as never)
    expect(rust.frames.map((f) => [f.store, f.op, f.key])).toEqual([
      ['store/config', 'set', 'settings']
    ])
    // The disk sink stands in for the shell: tab-indented with the version envelope, as conf wrote.
    const text = readFileSync(join(userData, 'store', 'config.json'), 'utf8')
    expect(text).toContain('\t"settings": {\n\t\t"language": "de"\n\t}')
    expect(text).toContain('"__internal__"')
  })
})

describe('GlobalConfig on the settings-document seam', () => {
  it('D-22: a fresh profile sends one replace frame for settings/global and getSettings is served from memory before any ack', () => {
    const { frames, config } = build({ silent: true })
    expect(existsSync(configPath())).toBe(false)

    const global = config()

    expect(frames).toHaveLength(1)
    const [frame] = frames as [StoreFrame]
    expect([frame.store, frame.op]).toEqual(['settings/global', 'replace'])
    const doc = JSON.parse(frame.valueJson as string) as {
      defaultSettings: Record<string, unknown>
      version: string
    }
    expect(doc.version).toBe('v2')
    expect(Object.keys(doc)).toEqual(['defaultSettings', 'version'])
    // Nothing answered the frame and nothing is on disk; the defaults come from memory.
    expect(existsSync(configPath())).toBe(false)
    const settings = global.getSettings()
    expect(settings).toEqual(global.getFactoryDefaults())
    expect(doc.defaultSettings).toEqual(
      JSON.parse(JSON.stringify(global.getFactoryDefaults()))
    )
    expect(frames).toHaveLength(1)
  })

  it('D-22: the first-boot write lands as the shell writes it, and a second boot reads it back', () => {
    const first = build()
    first.config()
    const text = readFileSync(configPath(), 'utf8')
    expect(text.startsWith('{\n  "defaultSettings": {\n')).toBe(true)
    expect(text.endsWith('\n')).toBe(false)

    const second = build({ silent: true })
    const settings = second.config().getSettings()
    expect(settings.language).toBe('en')
    expect(second.frames).toEqual([])
  })

  it('an existing config.json is read through readSettingsDoc; a setSetting flush is one replace with the whole document', () => {
    seedGlobal({ language: 'de', maxWorkers: 3 })
    const { frames, config, stores } = build({ silent: true })
    const global = config()
    expect(frames).toEqual([])
    expect(global.getSettings().language).toBe('de')

    global.setSetting('maxWorkers', 8, { configStore: stores.kvs.configStore })

    expect(frames.map((f) => [f.store, f.op])).toEqual([
      ['store/config', 'set'],
      ['settings/global', 'replace']
    ])
    const doc = JSON.parse(frames[1]?.valueJson as string) as {
      defaultSettings: Record<string, unknown>
      version: string
    }
    expect(doc.version).toBe('v2')
    expect(doc.defaultSettings.maxWorkers).toBe(8)
    expect(doc.defaultSettings.language).toBe('de')
    // The file on disk is still the seeded one: the write is pending, the read is from memory.
    expect(
      JSON.parse(readFileSync(configPath(), 'utf8')).defaultSettings
    ).toEqual({ language: 'de', maxWorkers: 3 })
    expect(global.getSettings().maxWorkers).toBe(8)
  })
})

describe('D-15 / D-20: the config.json-wins resync runs in TS through the configStore mirror', () => {
  it('writes store/config `settings` as one set frame with config.json winning and mirror-only keys kept', () => {
    seedGlobal({ language: 'de' })
    mkdirSync(join(userData, 'store'), { recursive: true })
    writeFileSync(
      join(userData, 'store', 'config.json'),
      JSON.stringify(
        {
          settings: { language: 'en', mirrorOnly: true },
          __internal__: { gamelib: { schemaVersion: 1 } }
        },
        undefined,
        '\t'
      )
    )
    const { frames, config, stores } = build()
    const global = config()
    resyncSettingsMirror({
      config: global,
      configStore: stores.kvs.configStore,
      logError: jest.fn()
    })
    expect(frames.map((f) => [f.store, f.op, f.key])).toEqual([
      ['store/config', 'set', 'settings']
    ])
    const mirror = stores.kvs.configStore.get_nodefault(
      'settings'
    ) as unknown as Record<string, unknown>
    expect(mirror.language).toBe('de')
    expect(mirror.mirrorOnly).toBe(true)
    expect(
      JSON.parse(readFileSync(join(userData, 'store', 'config.json'), 'utf8'))
        .settings.language
    ).toBe('de')
    // A second resync over an equal mirror writes nothing.
    resyncSettingsMirror({
      config: global,
      configStore: stores.kvs.configStore,
      logError: jest.fn()
    })
    expect(frames).toHaveLength(1)
  })
})

describe('the direct per-game readers see a document written a moment earlier', () => {
  const APP = '1245620'
  const gameDoc = (override: string) => ({
    [APP]: { engineOverride: override, steamOverlayOverride: 'off' },
    version: 'v2',
    explicit: true
  })

  it('engineConfig.readStoredGameConfig and steam readStoredTitleConfig read through the cell before any ack', () => {
    const { root, frames } = build({ silent: true })
    const path = join(gamesConfig(), `${APP}.json`)
    writeSettingsDoc(root, path, gameDoc('automatic'))
    expect(frames.map((f) => [f.store, f.op])).toEqual([
      [`GamesConfig/${APP}`, 'replace']
    ])
    expect(existsSync(path)).toBe(false)

    expect(
      readStoredGameConfig(APP, {
        gamesConfigPath: gamesConfig(),
        storeRoot: root
      })?.engineOverride
    ).toBe('automatic')
    expect(
      readStoredTitleConfig(APP, {
        paths: { gamesConfigPath: gamesConfig() },
        storeRoot: root
      })?.steamOverlayOverride
    ).toBe('off')

    writeSettingsDoc(root, path, gameDoc('crossover'))
    expect(
      readStoredGameConfig(APP, {
        gamesConfigPath: gamesConfig(),
        storeRoot: root
      })?.engineOverride
    ).toBe('crossover')
  })

  it('without the root (a test caller) they read the file, as before', () => {
    mkdirSync(gamesConfig(), { recursive: true })
    writeFileSync(
      join(gamesConfig(), `${APP}.json`),
      JSON.stringify(gameDoc('automatic'), null, 2)
    )
    expect(
      readStoredGameConfig(APP, { gamesConfigPath: gamesConfig() })
        ?.engineOverride
    ).toBe('automatic')
    expect(
      readStoredTitleConfig(APP, { paths: { gamesConfigPath: gamesConfig() } })
        ?.steamOverlayOverride
    ).toBe('off')
  })
})
