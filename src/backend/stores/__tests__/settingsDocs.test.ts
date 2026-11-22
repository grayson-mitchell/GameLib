/**
 * The settings-document seam (Phase 85 plan 15, D-01, research Pattern 3): `readSettingsDoc`,
 * `writeSettingsDoc` and `dropSettingsDoc`, and GameConfig on top of them.
 *
 * Over the boot's root a per-game document is a mirror cell keyed `GamesConfig/<app>`: a GameConfig
 * flush is ONE `replace` frame, and GameConfig.readSettings sees it at once, before the shell
 * answers (no flag since 85-21, D-03). A caller with no root (a test) reads and writes the file
 * directly through `writeSettingsFile`, as before. The Rust half (2-space bytes, the chain's
 * version, a set/delete/clear refused, a path-like app name refused) is `cargo test -p
 * gamelib-store host::doc_tests` and `cargo test --bin gamelib-shell store_frame`.
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
import type { AppSettings } from 'common/types'
import { createGameConfigs } from '../../game_config'
import {
  dropSettingsDoc,
  readSettingsDoc,
  settingsDocExists,
  writeSettingsDoc
} from '../settingsDocs'
import type { StoreFrame, StoreFrameSink } from '../storeFrames'
import type { StoreBootEnv } from '../storeRoot'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import { createTestAppPaths } from '../../testUtils/testAppPaths'
import { createTestAppRuntime } from '../../testUtils/testAppRuntime'
import { fakeSafetyRustInvoke } from '../../testUtils/fakeSafetyRust'
import { uninstallGameCallback } from '../../utils/uninstaller'
import type { RequestRustInvoke } from '../../host'
import { RUST_SAFETY_REMOVE_TREE } from 'common/types/sidecarTransport'

const APP = '1245620'

/** The global defaults GameConfig.readSettings destructures (only what it reads). */
const GLOBAL = {
  getSettings: () =>
    ({
      enviromentOptions: [],
      wrapperOptions: [],
      wineVersion: { bin: '/wine', name: 'wine', type: 'wine' },
      winePrefix: '/prefixes/shared',
      wineCrossoverBottle: 'GameLib',
      maxSharpness: 2,
      language: 'en'
    }) as unknown as AppSettings
}

/** A sink that records every frame and never answers: every write stays pending. */
function silentSink(frames: StoreFrame[]): StoreFrameSink {
  return { send: (frame) => frames.push(frame) }
}

let userData: string
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'gamelib-settings-docs-'))
})
afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

const gamesConfig = () => join(userData, 'GamesConfig')
const gamePath = (app = APP) => join(gamesConfig(), `${app}.json`)
const configPath = () => join(userData, 'config.json')

function paths() {
  return {
    configPath: configPath(),
    gamesConfigPath: gamesConfig(),
    sharedWinePrefix: '/prefixes/shared',
    userHome: '/home/u'
  }
}

/** A root over `userData`, its frames, and a per-game registry built on it (the boot's wiring). */
function build(
  opts: {
    silent?: boolean
    boot?: StoreBootEnv
  } = {}
) {
  const frames: StoreFrame[] = []
  const root = createTestStoreRoot(userData, {
    ...(opts.silent
      ? { frameSink: silentSink(frames) }
      : { recordFrames: frames }),
    ...(opts.boot ? { boot: opts.boot } : {})
  })
  const gameConfigs = createGameConfigs({
    config: GLOBAL,
    versioning: root.versioning,
    root,
    paths: paths()
  })
  return { root, frames, gameConfigs }
}

/** An existing global document, so GameConfig.load does not reset the game to defaults. */
function seedGlobal() {
  writeFileSync(
    configPath(),
    JSON.stringify(
      { defaultSettings: { language: 'en' }, version: 'v2' },
      null,
      2
    )
  )
}

describe('the tracer: one per-game setting end to end', () => {
  it('a GameConfig flush is one replace frame on GamesConfig/<app> and readSettings sees it before any ack', async () => {
    seedGlobal()
    const { frames, gameConfigs } = build({ silent: true })
    const game = gameConfigs.get(APP)
    expect(frames).toEqual([])

    game.setSetting('maxSharpness', 7)

    expect(frames).toHaveLength(1)
    const [frame] = frames as [StoreFrame]
    expect(frame).toMatchObject({
      kind: 'store',
      store: `GamesConfig/${APP}`,
      op: 'replace'
    })
    expect(frame.key).toBeUndefined()
    const doc = JSON.parse(frame.valueJson as string) as Record<string, unknown>
    expect(doc.version).toBe('v2')
    expect(doc.explicit).toBe(true)
    expect((doc[APP] as Record<string, unknown>).maxSharpness).toBe(7)
    expect(Object.keys(doc)).toEqual([APP, 'version', 'explicit'])

    // Nothing answered the frame and nothing is on disk, yet the setting reads back (read-your-writes).
    expect(existsSync(gamePath())).toBe(false)
    const settings = await game.getSettings()
    expect(settings.maxSharpness).toBe(7)
    // The first load found no document (a new game), so its disableUMU default was flushed too.
    expect(settings.disableUMU).toBe(false)
    expect((doc[APP] as Record<string, unknown>).disableUMU).toBe(false)
    expect(
      readSettingsDoc(build({ silent: true }).root, gamePath())
    ).toBeUndefined()
  })

  it('the shell-side bytes are two-space JSON with no trailing newline and read back through the helper', async () => {
    seedGlobal()
    const { root, frames, gameConfigs } = build()
    gameConfigs.get(APP).setSetting('maxSharpness', 9)

    expect(frames.map((f) => [f.store, f.op])).toEqual([
      [`GamesConfig/${APP}`, 'replace']
    ])
    const text = readFileSync(gamePath(), 'utf8')
    const doc = JSON.parse(text) as Record<string, unknown>
    expect(text).toBe(JSON.stringify(doc, null, 2))
    expect(text.endsWith('\n')).toBe(false)
    expect(text.startsWith(`{\n  "${APP}": {\n    `)).toBe(true)
    expect(doc.version).toBe('v2')

    // A fresh registry over the same root reads the document through the cell; a fresh root
    // (a later boot) reads it from disk.
    const again = createGameConfigs({
      config: GLOBAL,
      versioning: root.versioning,
      root: createTestStoreRoot(userData),
      paths: paths()
    })
    expect((await again.get(APP).getSettings()).maxSharpness).toBe(9)
  })

  it('an app name that is not one plain path segment never reaches a frame or the disk (T-85-37)', () => {
    seedGlobal()
    const before = readFileSync(configPath(), 'utf8')
    const { frames, gameConfigs } = build({ silent: true })
    for (const bad of ['a/b', '../config', '..', 'a\\b']) {
      gameConfigs.get(bad).setSetting('maxSharpness', 1)
    }
    expect(frames).toEqual([])
    expect(readFileSync(configPath(), 'utf8')).toBe(before)
    expect(existsSync(join(gamesConfig(), 'a'))).toBe(false)
  })

  it('a document the shell reported read-only at boot takes no write and sends nothing', () => {
    seedGlobal()
    const { frames, gameConfigs } = build({
      silent: true,
      boot: {
        readOnly: new Map([[`GamesConfig/${APP}`, 'newer' as const]]),
        startEmpty: new Set()
      }
    })
    gameConfigs.get(APP).setSetting('maxSharpness', 4)
    expect(frames).toEqual([])
  })

  it('without a root (a test caller) the document is TS-written: no frame, writeSettingsFile writes it', async () => {
    seedGlobal()
    mkdirSync(gamesConfig(), { recursive: true })
    const { frames, root } = build()
    const gameConfigs = createGameConfigs({
      config: GLOBAL,
      versioning: root.versioning,
      paths: paths()
    })
    gameConfigs.get(APP).setSetting('maxSharpness', 5)
    expect(frames).toEqual([])
    const doc = JSON.parse(readFileSync(gamePath(), 'utf8')) as Record<
      string,
      unknown
    >
    expect((doc[APP] as Record<string, unknown>).maxSharpness).toBe(5)
    expect(readFileSync(gamePath(), 'utf8')).toBe(JSON.stringify(doc, null, 2))
  })
})

describe('readSettingsDoc / writeSettingsDoc / dropSettingsDoc', () => {
  it('a missing Rust-owned document reads as absent and creates no cell', () => {
    const { root } = build({ silent: true })
    expect(readSettingsDoc(root, gamePath())).toBeUndefined()
    expect(settingsDocExists(root, gamePath())).toBe(false)
    expect(root.mirrors.peek(gamePath())).toBeUndefined()
  })

  it('a written document exists before it is applied and reads back whole', () => {
    const { root, frames } = build({ silent: true })
    writeSettingsDoc(root, configPath(), {
      defaultSettings: { language: 'de' },
      version: 'v2'
    })
    expect(frames.map((f) => [f.store, f.op])).toEqual([
      ['settings/global', 'replace']
    ])
    expect(settingsDocExists(root, configPath())).toBe(true)
    expect(readSettingsDoc(root, configPath())).toEqual({
      defaultSettings: { language: 'de' },
      version: 'v2'
    })
  })

  it('dropSettingsDoc forgets the cell, so a later read goes to disk (absent after a removal)', () => {
    const { root } = build()
    writeSettingsDoc(root, gamePath(), {
      [APP]: { maxSharpness: 1 },
      version: 'v2'
    })
    expect(readSettingsDoc(root, gamePath())).toBeDefined()
    rmSync(gamePath())
    // The cell still holds the deleted document until it is dropped.
    expect(readSettingsDoc(root, gamePath())).toBeDefined()
    expect(dropSettingsDoc(root, gamePath())).toBe(true)
    expect(readSettingsDoc(root, gamePath())).toBeUndefined()
    expect(dropSettingsDoc(root, gamePath())).toBe(false)
  })

  it('a path that is not a settings document is read and written by TS', () => {
    const { root, frames } = build({ silent: true })
    const elsewhere = join(userData, 'other', 'config.json')
    mkdirSync(join(userData, 'other'))
    writeSettingsDoc(root, elsewhere, { version: 'v2' })
    expect(frames).toEqual([])
    expect(readSettingsDoc(root, elsewhere)).toEqual({ version: 'v2' })
  })

  it('without a root a corrupt document throws, as the direct reads did', () => {
    const docs = { versioning: build().root.versioning }
    mkdirSync(gamesConfig())
    writeFileSync(gamePath(), '{not json')
    expect(() => readSettingsDoc(docs, gamePath())).toThrow()
    expect(dropSettingsDoc(docs, gamePath())).toBe(false)
  })
})

/**
 * T-85-38, the TS half: an uninstall whose settings removal reports `removed` drops the document's
 * cell, so this process stops serving the deleted settings and the next read goes to disk. The
 * Rust half (eviction of open and queued stores, nothing recreated, the drain included) is `cargo
 * test --bin gamelib-shell safety`.
 */
describe('uninstall drops the settings cell when the removal reports removed (T-85-38)', () => {
  function uninstallDeps(
    root: ReturnType<typeof build>['root'],
    requestRustInvoke: RequestRustInvoke
  ) {
    const game = {
      uninstall: async () => ({}),
      getSettings: async () => ({ winePrefix: '' }),
      getGameInfo: () => ({ title: 'Game' })
    }
    return {
      libraryManagers: {
        sideload: {
          getGame: () => game,
          getListOfGames: () => []
        }
      },
      paths: createTestAppPaths(userData, {
        configPath: configPath(),
        gamesConfigPath: gamesConfig()
      }),
      sendFrontendMessage: jest.fn(),
      notifications: { show: jest.fn() },
      config: {
        getSettings: () => ({ defaultInstallPath: '', sharedWinePrefix: '' })
      },
      requestRustInvoke,
      appRuntime: createTestAppRuntime(),
      storeRoot: root
    } as unknown as Parameters<typeof uninstallGameCallback>[0]
  }

  it('a removed settings document reads absent afterwards; the cell is gone', async () => {
    seedGlobal()
    const { root, gameConfigs } = build()
    gameConfigs.get(APP).setSetting('maxSharpness', 3)
    expect(existsSync(gamePath())).toBe(true)
    expect(root.mirrors.peek(gamePath())).toBeDefined()

    const { requestRustInvoke, calls } = fakeSafetyRustInvoke()
    await uninstallGameCallback(
      uninstallDeps(root, requestRustInvoke),
      undefined,
      APP,
      'sideload',
      false,
      true
    )

    const removal = calls.find((c) => c.channel === RUST_SAFETY_REMOVE_TREE)
    expect(JSON.stringify(removal?.args)).toContain(`${APP}.json`)
    expect(existsSync(gamePath())).toBe(false)
    expect(root.mirrors.peek(gamePath())).toBeUndefined()
    expect(readSettingsDoc(root, gamePath())).toBeUndefined()
  })

  it('a written-but-unapplied document is sent for removal and its cell dropped too', async () => {
    seedGlobal()
    const { root, frames, gameConfigs } = build({ silent: true })
    gameConfigs.get(APP).setSetting('maxSharpness', 3)
    expect(frames).toHaveLength(1)
    expect(existsSync(gamePath())).toBe(false)

    const { requestRustInvoke, calls } = fakeSafetyRustInvoke()
    await uninstallGameCallback(
      uninstallDeps(root, requestRustInvoke),
      undefined,
      APP,
      'sideload',
      false,
      true
    )
    const removal = calls.find((c) => c.channel === RUST_SAFETY_REMOVE_TREE)
    expect(JSON.stringify(removal?.args)).toContain(`${APP}.json`)
    expect(readSettingsDoc(root, gamePath())).toBeUndefined()
  })

  it('a refused removal keeps the cell and the settings', async () => {
    seedGlobal()
    const { root, gameConfigs } = build()
    gameConfigs.get(APP).setSetting('maxSharpness', 3)
    const { requestRustInvoke } = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'nested-known-install'
    })
    await uninstallGameCallback(
      uninstallDeps(root, requestRustInvoke),
      undefined,
      APP,
      'sideload',
      false,
      true
    )
    expect(existsSync(gamePath())).toBe(true)
    expect(root.mirrors.peek(gamePath())).toBeDefined()
    expect(
      (readSettingsDoc(root, gamePath())?.[APP] as Record<string, unknown>)
        .maxSharpness
    ).toBe(3)
  })
})
