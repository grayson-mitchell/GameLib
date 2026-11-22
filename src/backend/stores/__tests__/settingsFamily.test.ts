/**
 * The settings family moves to the Rust owner, last (Phase 85 plan 15, FND-06, D-01).
 *
 * `storeOwnership.json` sets `families.settings`, so under `GAMELIB_STORE=rust` (the default) the
 * three settings stores are mirror-backed and every write is a frame for the shell's single writer:
 * the renderer's settings mirror `store/config.json` (configStore, a conf store: `set` frames), the
 * global document `config.json` and every per-game `GamesConfig/<app>.json` (whole-document
 * `replace` frames, settingsDocs.ts). Under `GAMELIB_STORE=ts` all three are TS-owned exactly as
 * before. This suite covers GlobalConfig on the seam, the D-22 first boot, the D-15/D-20 resync
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
import ownershipFile from 'common/types/ipc/storeOwnership.json'
import tableFile from 'common/types/ipc/storeTable.json'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { createGlobalConfig } from '../../config'
import { readStoredGameConfig } from '../../engine/engineConfig'
import { resyncSettingsMirror } from '../../settingsMirrorResync'
import { readStoredTitleConfig } from '../../storeManagers/steam/titleSettings'
import { createStores } from '../createStores'
import { writeSettingsDoc } from '../settingsDocs'
import { createStoreRegistry } from '../storeRegistry'
import type { StoreFrame, StoreFrameSink } from '../storeFrames'
import { isRustOwned, type StoreMode } from '../storeOwnership'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'

jest.mock('../../utils/compatibility_layers', () => ({
  getDefaultWineBinary: () => ({ name: 'x', bin: '', type: 'wine' })
}))
jest.mock('../../logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: new Proxy({}, { get: (_t, k) => String(k) })
}))

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
function build(mode: StoreMode, opts: { silent?: boolean } = {}) {
  const frames: StoreFrame[] = []
  const root = createTestStoreRoot(userData, {
    storeMode: mode,
    ...(opts.silent
      ? { frameSink: silentSink(frames) }
      : { recordFrames: frames })
  })
  const stores = createStores({ registry: createStoreRegistry(), root })
  const config = () =>
    createGlobalConfig({
      requestRustInvoke: jest.fn(),
      versioning: root.versioning,
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
  it('is the last family flipped (D-01): every family is Rust’s, no per-store override', () => {
    expect(ownershipFile.families).toEqual({
      cache: true,
      'user-state': true,
      account: true,
      settings: true
    })
    expect(Object.keys(ownershipFile.stores)).toEqual([])
    expect(SETTINGS_ROWS.map((row) => row.key).sort()).toEqual([
      'settings/game',
      'settings/global',
      'store/config'
    ])
  })

  it('owns configStore, config.json and GamesConfig/<app> under rust and none of them under ts', () => {
    for (const key of ['store/config', 'settings/global', 'GamesConfig/480']) {
      expect(isRustOwned(key, 'rust')).toBe(true)
      expect(isRustOwned(key, 'ts')).toBe(false)
    }
  })

  it('configStore is mirror-backed under rust (a set frame) and conf-backed under ts (no frame)', () => {
    const rust = build('rust')
    rust.stores.kvs.configStore.set('settings', { language: 'de' } as never)
    expect(rust.frames.map((f) => [f.store, f.op, f.key])).toEqual([
      ['store/config', 'set', 'settings']
    ])
    // The disk sink stands in for the shell: tab-indented with the version envelope, as conf wrote.
    const text = readFileSync(join(userData, 'store', 'config.json'), 'utf8')
    expect(text).toContain('\t"settings": {\n\t\t"language": "de"\n\t}')
    expect(text).toContain('"__internal__"')

    rmSync(join(userData, 'store'), { recursive: true, force: true })
    const ts = build('ts')
    ts.stores.kvs.configStore.set('settings', { language: 'fr' } as never)
    expect(ts.frames).toEqual([])
    expect(
      JSON.parse(readFileSync(join(userData, 'store', 'config.json'), 'utf8'))
        .settings
    ).toEqual({ language: 'fr' })
  })
})

describe('GlobalConfig on the settings-document seam', () => {
  it('D-22: a fresh profile sends one replace frame for settings/global and getSettings is served from memory before any ack', () => {
    const { frames, config } = build('rust', { silent: true })
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
    const first = build('rust')
    first.config()
    const text = readFileSync(configPath(), 'utf8')
    expect(text.startsWith('{\n  "defaultSettings": {\n')).toBe(true)
    expect(text.endsWith('\n')).toBe(false)

    const second = build('rust', { silent: true })
    const settings = second.config().getSettings()
    expect(settings.language).toBe('en')
    expect(second.frames).toEqual([])
  })

  it('an existing config.json is read through readSettingsDoc; a setSetting flush is one replace with the whole document', () => {
    seedGlobal({ language: 'de', maxWorkers: 3 })
    const { frames, config, stores } = build('rust', { silent: true })
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

  it('under GAMELIB_STORE=ts GlobalConfig is TS-owned: no frame, writeSettingsFile writes config.json', () => {
    const { frames, config } = build('ts')
    config()
    expect(frames).toEqual([])
    const doc = JSON.parse(readFileSync(configPath(), 'utf8')) as {
      version: string
    }
    expect(doc.version).toBe('v2')
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
    const { frames, config, stores } = build('rust')
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
    const { root, frames } = build('rust', { silent: true })
    const path = join(gamesConfig(), `${APP}.json`)
    writeSettingsDoc(root, path, gameDoc('automatic'))
    expect(frames.map((f) => [f.store, f.op])).toEqual([
      [`GamesConfig/${APP}`, 'replace']
    ])
    expect(existsSync(path)).toBe(false)

    expect(
      readStoredGameConfig(APP, {
        gamesConfigPath: gamesConfig(),
        versioning: root.versioning,
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
        versioning: root.versioning,
        storeRoot: root
      })?.engineOverride
    ).toBe('crossover')
  })

  it('without the root (a TS-owned read) they read the file, as before', () => {
    mkdirSync(gamesConfig(), { recursive: true })
    writeFileSync(
      join(gamesConfig(), `${APP}.json`),
      JSON.stringify(gameDoc('automatic'), null, 2)
    )
    const { root } = build('ts')
    expect(
      readStoredGameConfig(APP, {
        gamesConfigPath: gamesConfig(),
        versioning: root.versioning
      })?.engineOverride
    ).toBe('automatic')
    expect(
      readStoredTitleConfig(APP, { paths: { gamesConfigPath: gamesConfig() } })
        ?.steamOverlayOverride
    ).toBe('off')
  })
})
