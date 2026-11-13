import { createTestStoreRoot } from '../../../testUtils/testStoreRoot'
import { copyFileSync, mkdirSync } from 'graceful-fs'
import { join } from 'path'
import { DirResult, dirSync } from 'tmp'
import { addNonSteamGame, removeNonSteamGame } from '../nonesteamgame'
import { showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { logInfo, logError } from 'backend/logger'
import type { Game } from 'common/types/game_manager'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createKvsStores } from 'backend/constants/key_value_stores'
import { createTestHostServices } from 'backend/testUtils/testHostServices'
import { stubRustSteamFiles } from 'backend/storeManagers/steam/localFiles/__tests__/fixtures/stubRustSteamFiles'
import {
  RUST_STEAMFILES_SHORTCUTS_APPLY,
  RUST_STEAMFILES_SHORTCUTS_READ
} from 'common/types/sidecarTransport'
import type {
  ShortcutsApplyResult,
  ShortcutsReadResult
} from 'backend/storeManagers/steam/localFiles/steamFilesTypes'

const { tsStore } = createKvsStores({
  registry: createStoreRegistry(),
  root: createTestStoreRoot()
})

jest.mock('backend/logger')
jest.mock('backend/dialog/dialog')
jest.mock('backend/utils')
jest.mock('backend/wiki_game_info/wiki_game_info')

let tmpDir = {} as DirResult
let tmpSteamUserConfigDir = ''

function makeGameMock(title: string = 'MyGame', id: string = 'Game'): Game {
  return {
    getGameInfo: () => ({ title, app_name: id })
  } as Game
}

let defaultSteamPath = ''

// The config, paths and imageTools slices the add/remove flow reads (66.3-06). No image is
// converted here: the test fixtures carry no art URLs.
const deps = {
  libraryManagers: {},
  stores: { kvs: { tsStore } },
  config: { getSettings: () => ({ defaultSteamPath }) },
  paths: { exe: '/test-gamelib/GameLib' },
  imageTools: createTestHostServices().imageTools
} as unknown as Parameters<typeof addNonSteamGame>[0]

function copyTestFile(file: string, alternativeUserPath = '') {
  const testFileDir = join(__dirname, 'test_data')
  const userDir = alternativeUserPath
    ? join(alternativeUserPath, 'shortcuts.vdf')
    : join(tmpSteamUserConfigDir, 'shortcuts.vdf')
  copyFileSync(join(testFileDir, file), userDir)
}

describe('NonSteamGame rust branch (GAMELIB_STEAMFILES_SHORTCUTS=rust)', () => {
  const realFlag = process.env.GAMELIB_STEAMFILES_SHORTCUTS
  const MISSING: ShortcutsReadResult = {
    exists: false,
    parsed: false,
    readError: null,
    hasShortcutsRoot: false,
    rootIsList: false,
    entries: []
  }
  const entrySummary = (appName: string | null) => ({
    indexKey: '0',
    appName,
    exe: '"x"',
    launchOptions: '--no-gui',
    hasAppName: appName !== null,
    hasExe: true,
    hasLaunchOptions: true
  })
  const listed = (appName: string | null): ShortcutsReadResult => ({
    exists: true,
    parsed: true,
    readError: null,
    hasShortcutsRoot: true,
    rootIsList: true,
    entries: [entrySummary(appName)]
  })
  const applied = (over: Partial<ShortcutsApplyResult> = {}) => ({
    written: true,
    readError: null,
    alreadyPresent: false,
    matched: true,
    indexKey: '0',
    removedExe: null,
    removedAppName: null,
    ...over
  })
  const rustDeps = (stub: { requestRustInvoke: unknown }) =>
    ({
      ...deps,
      requestRustInvoke: stub.requestRustInvoke
    }) as unknown as Parameters<typeof addNonSteamGame>[0]

  beforeEach(() => {
    process.env.GAMELIB_STEAMFILES_SHORTCUTS = 'rust'
    jest.clearAllMocks()
    tmpDir = dirSync({ unsafeCleanup: true })
    defaultSteamPath = tmpDir.name + "'"
    tmpSteamUserConfigDir = join(
      tmpDir.name,
      'userdata',
      'steam_user',
      'config'
    )
    mkdirSync(tmpSteamUserConfigDir, { recursive: true })
  })

  afterEach(() => {
    if (realFlag === undefined) delete process.env.GAMELIB_STEAMFILES_SHORTCUTS
    else process.env.GAMELIB_STEAMFILES_SHORTCUTS = realFlag
    tmpDir.removeCallback()
  })

  test('add on a missing file sends createIfMissing and the ordered typed entry', async () => {
    tsStore.set('RustGame.lastPlayed', '2023-11-14T22:13:20.000Z')
    const stub = stubRustSteamFiles({
      [RUST_STEAMFILES_SHORTCUTS_READ]: () => MISSING,
      [RUST_STEAMFILES_SHORTCUTS_APPLY]: () => applied()
    })

    await addNonSteamGame(rustDeps(stub), makeGameMock('MyGame', 'RustGame'))

    const apply = stub.calls.find(
      (c) => c.channel === RUST_STEAMFILES_SHORTCUTS_APPLY
    )
    const { path, mutation } = apply?.args as {
      path: string
      mutation: {
        op: string
        createIfMissing: boolean
        entry: { kind: string; key: string; value: string | number }[]
      }
    }
    expect(path).toBe(join(tmpSteamUserConfigDir, 'shortcuts.vdf'))
    expect(mutation.op).toBe('add')
    expect(mutation.createIfMissing).toBe(true)
    expect(mutation.entry.map((f) => [f.kind, f.key])).toEqual([
      ['string', 'AppName'],
      ['string', 'Exe'],
      ['string', 'StartDir'],
      ['int32', 'appid'],
      ['string', 'LaunchOptions'],
      ['int32', 'IsHidden'],
      ['int32', 'AllowDesktopConfig'],
      ['int32', 'AllowOverlay'],
      ['int32', 'OpenVR'],
      ['int32', 'Devkit'],
      ['int32', 'DevkitOverrideAppID'],
      ['int32', 'LastPlayTime']
    ])
    const byKey = Object.fromEntries(
      mutation.entry.map((f) => [f.key, f.value])
    )
    expect(byKey.AppName).toBe('MyGame')
    expect(byKey.Exe).toBe('"/test-gamelib/GameLib"')
    expect(byKey.LaunchOptions).toContain('gamelib://launch?appName=RustGame')
    expect([
      byKey.IsHidden,
      byKey.AllowDesktopConfig,
      byKey.AllowOverlay,
      byKey.OpenVR,
      byKey.Devkit,
      byKey.DevkitOverrideAppID
    ]).toEqual([0, 1, 1, 0, 0, 0])
    expect(byKey.LastPlayTime).toBe(1700000000)
    expect(typeof byKey.appid).toBe('number')
    expect(logInfo).toBeCalledWith(
      'MyGame was successfully added to Steam.',
      'Shortcuts'
    )
  })

  test('add on an existing title is a no-op success', async () => {
    const stub = stubRustSteamFiles({
      [RUST_STEAMFILES_SHORTCUTS_READ]: () => listed('MyGame')
    })

    await addNonSteamGame(rustDeps(stub), makeGameMock('MyGame', 'Game'))

    expect(
      stub.calls.some((c) => c.channel === RUST_STEAMFILES_SHORTCUTS_APPLY)
    ).toBe(false)
    expect(logInfo).toBeCalledWith(
      'MyGame was successfully added to Steam.',
      'Shortcuts'
    )
  })

  test("a corrupted summary produces today's error strings and no write", async () => {
    const stub = stubRustSteamFiles({
      [RUST_STEAMFILES_SHORTCUTS_READ]: () => listed(null)
    })

    const result = await addNonSteamGame(
      rustDeps(stub),
      makeGameMock('MyGame', 'Game')
    )

    expect(result).toBe(false)
    expect(
      stub.calls.some((c) => c.channel === RUST_STEAMFILES_SHORTCUTS_APPLY)
    ).toBe(false)
    const file = join(tmpSteamUserConfigDir, 'shortcuts.vdf')
    expect(logError).toBeCalledWith(
      `Can't add "MyGame" to Steam user "steam_user". "${file}" is corrupted!\n` +
        'One of the game entries is missing the AppName parameter!',
      'Shortcuts'
    )
  })

  test('remove sends the remove mutation and cleans images from the removed entry', async () => {
    const stub = stubRustSteamFiles({
      [RUST_STEAMFILES_SHORTCUTS_READ]: () => listed('MyGame'),
      [RUST_STEAMFILES_SHORTCUTS_APPLY]: () =>
        applied({ removedExe: '"/x/gamelib"', removedAppName: 'MyGame' })
    })

    // The existence guard stays in TS; the bytes are never read there.
    copyTestFile('shortcuts_valid.vdf')
    mkdirSync(join(tmpSteamUserConfigDir, 'grid'))

    await removeNonSteamGame(rustDeps(stub), makeGameMock('MyGame', 'Game'))

    const apply = stub.calls.find(
      (c) => c.channel === RUST_STEAMFILES_SHORTCUTS_APPLY
    )
    expect((apply?.args as { mutation: unknown }).mutation).toEqual({
      op: 'remove',
      appName: 'MyGame'
    })
    expect(logInfo).toBeCalledWith(
      'Remove Steam images for MyGame',
      'Shortcuts'
    )
    expect(logInfo).toBeCalledWith(
      'MyGame was successfully removed from Steam.',
      'Shortcuts'
    )
  })

  test('a rejected invoke surfaces as an error dialog, never a throw', async () => {
    const stub = stubRustSteamFiles({
      [RUST_STEAMFILES_SHORTCUTS_READ]: () => MISSING,
      [RUST_STEAMFILES_SHORTCUTS_APPLY]: () => {
        throw new Error('pipe closed')
      }
    })

    await expect(
      addNonSteamGame(rustDeps(stub), makeGameMock('MyGame', 'Game'))
    ).resolves.toBe(false)
    expect(showDialogBoxModalAuto).toBeCalled()
    expect(logError).toBeCalledWith(
      expect.stringContaining('pipe closed'),
      'Shortcuts'
    )
  })
})
