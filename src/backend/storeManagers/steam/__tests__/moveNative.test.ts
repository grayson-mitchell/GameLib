/** quick 261122-9sl: moveRegisteredSteamGame (Mac-native Move) and the moveInstall routing. */
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { moveRegisteredSteamGame } from '../moveNative'
import { moveInstall } from '../gameMaintenance'
import * as bridgeBottle from '../bridgeBottle'
import * as acfUpdateState from '../library/acfUpdateState'
import * as moveNative from '../moveNative'
import { initHeadless } from 'backend/logger'

// The real logger needs a writer; jest.setupContainment keeps the log file under a fake HOME.
beforeAll(() => initHeadless())

const requestMove = jest.fn()
const readRunningApp = jest.fn()
const listLibraries = jest.fn()
const reconcile = jest.fn()
const createRun = jest.fn()

const makeCollab = (platform: NodeJS.Platform = 'darwin') => ({
  requestMove,
  readRunningApp,
  createRun,
  listLibraries,
  reconcile,
  platform
})

const controller = new AbortController()
const aborts = {
  has: jest.fn(),
  getSignal: jest.fn(),
  create: jest.fn(),
  delete: jest.fn()
}

let installPath: string | undefined
const getGameInfo = jest.fn()
const game = {
  appId: '264160',
  getGameInfo,
  deps: { paths: { p: 1 }, runner: { r: 1 }, aborts }
} as never

const LIBS = [
  { path: '/libA', steamappsDir: '/libA/steamapps', isPrimary: true },
  {
    path: '/libB/steamapps',
    steamappsDir: '/libB/steamapps/steamapps',
    isPrimary: false
  }
]

const finished = (installState = 4) => ({
  kind: 'ok',
  tracked: true,
  finished: true,
  installState,
  folderIndex: 1
})

describe('moveRegisteredSteamGame', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    installPath = '/libA/steamapps/common/WazHack'
    getGameInfo.mockImplementation(() => ({
      title: 'WazHack',
      install: installPath ? { install_path: installPath } : {}
    }))
    createRun.mockReturnValue('run')
    readRunningApp.mockResolvedValue(0)
    listLibraries.mockResolvedValue(LIBS)
    aborts.has.mockReturnValue(false)
    aborts.create.mockReturnValue(controller)
    aborts.getSignal.mockReturnValue(controller.signal)
    reconcile.mockImplementation(() => {
      installPath = '/libB/steamapps/steamapps/common/WazHack'
      return Promise.resolve()
    })
  })

  it('refuses off darwin without a helper call', async () => {
    const r = await moveRegisteredSteamGame(game, '/libB/steamapps', {
      ...makeCollab('linux')
    })
    expect(r).toMatchObject({ status: 'error' })
    expect(r.error).toContain('macOS only')
    expect(requestMove).not.toHaveBeenCalled()
  })

  it('refuses a running game before any helper call', async () => {
    readRunningApp.mockResolvedValue(264160)
    await expect(
      moveRegisteredSteamGame(game, '/libB/steamapps', makeCollab())
    ).resolves.toEqual({
      status: 'error',
      error: 'Quit WazHack before moving it.'
    })
    expect(requestMove).not.toHaveBeenCalled()
  })

  it('refuses a path that is not an existing folder without a helper call', async () => {
    const r = await moveRegisteredSteamGame(game, '/elsewhere', makeCollab())
    expect(r.status).toBe('error')
    expect(r.error).toContain("isn't an existing folder")
    expect(requestMove).not.toHaveBeenCalled()
  })

  it('refuses when the library list cannot be read', async () => {
    listLibraries.mockRejectedValue(new Error('boom'))
    const r = await moveRegisteredSteamGame(
      game,
      '/libB/steamapps',
      makeCollab()
    )
    expect(r.status).toBe('error')
    expect(r.error).toContain("couldn't read Steam's library list")
    expect(requestMove).not.toHaveBeenCalled()
  })

  it.each([
    ['the library root', '/libB/steamapps'],
    ['its steamappsDir', '/libB/steamapps/steamapps'],
    ['steamappsDir/common', '/libB/steamapps/steamapps/common']
  ])('accepts %s and passes the library root to the helper', async (_n, p) => {
    requestMove.mockResolvedValue(finished())
    await moveRegisteredSteamGame(game, p, makeCollab())
    expect(requestMove).toHaveBeenCalledWith(
      '264160',
      { libraryPath: '/libB/steamapps', wait: true, signal: controller.signal },
      { paths: { p: 1 }, run: 'run' }
    )
  })

  it('refuses a move into the library the game is already in', async () => {
    const r = await moveRegisteredSteamGame(game, '/libA', makeCollab())
    expect(r).toEqual({
      status: 'error',
      error: 'WazHack is already in that Steam library.'
    })
    expect(requestMove).not.toHaveBeenCalled()
  })

  it('reconciles once and returns done when the new path is in the target', async () => {
    requestMove.mockResolvedValue(finished())
    await expect(
      moveRegisteredSteamGame(game, '/libB/steamapps', makeCollab())
    ).resolves.toEqual({ status: 'done' })
    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  it('tells the user to Refresh when the path did not follow the move', async () => {
    requestMove.mockResolvedValue(finished())
    reconcile.mockResolvedValue(undefined)
    const r = await moveRegisteredSteamGame(
      game,
      '/libB/steamapps',
      makeCollab()
    )
    expect(r.status).toBe('error')
    expect(r.error).toContain('Refresh')
  })

  it.each([0x20, 0x80])(
    'reports missing or corrupt files when state keeps bit %i',
    async (bit) => {
      requestMove.mockResolvedValue(finished(4 | bit))
      const r = await moveRegisteredSteamGame(
        game,
        '/libB/steamapps',
        makeCollab()
      )
      expect(r.status).toBe('error')
      expect(r.error).toContain('missing or corrupt')
    }
  )

  it.each([
    [
      'not finished',
      {
        kind: 'ok',
        tracked: true,
        finished: false,
        installState: 4,
        folderIndex: 1,
        reason: 'wait-cap'
      },
      'wait-cap'
    ],
    [
      'untracked',
      {
        kind: 'ok',
        tracked: false,
        finished: false,
        installState: null,
        folderIndex: 1
      },
      'untracked'
    ]
  ])('reconciles and errors when the move is %s', async (_n, outcome, why) => {
    requestMove.mockResolvedValue(outcome)
    const r = await moveRegisteredSteamGame(
      game,
      '/libB/steamapps',
      makeCollab()
    )
    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(r.status).toBe('error')
    expect(r.error).toContain(why)
  })

  it.each([
    [
      { kind: 'refused', reason: 'already-in-folder' },
      'already in that Steam library'
    ],
    [
      { kind: 'refused', reason: 'not-installed' },
      "doesn't have WazHack installed"
    ],
    [{ kind: 'refused', reason: 'weird' }, 'refused to move WazHack (weird)'],
    [{ kind: 'error', stage: 'MoveApp', code: 16 }, 'MoveApp error 16']
  ])('maps %j to an error', async (outcome, text) => {
    requestMove.mockResolvedValue(outcome)
    const r = await moveRegisteredSteamGame(
      game,
      '/libB/steamapps',
      makeCollab()
    )
    expect(r.status).toBe('error')
    expect(r.error).toContain(text)
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('reports abort when unavailable and the signal was aborted', async () => {
    const aborted = new AbortController()
    aborted.abort()
    aborts.create.mockReturnValue(aborted)
    aborts.getSignal.mockReturnValue(aborted.signal)
    requestMove.mockResolvedValue({
      kind: 'unavailable',
      reason: 'helper-failed'
    })
    await expect(
      moveRegisteredSteamGame(game, '/libB/steamapps', makeCollab())
    ).resolves.toEqual({ status: 'abort' })
  })

  it('points at Steam Properties when the helper is unavailable', async () => {
    requestMove.mockResolvedValue({
      kind: 'unavailable',
      reason: 'steam-not-running'
    })
    const r = await moveRegisteredSteamGame(
      game,
      '/libB/steamapps',
      makeCollab()
    )
    expect(r.status).toBe('error')
    expect(r.error).toContain('steam-not-running')
    expect(r.error).toContain('Move install folder')
  })

  it('names Steam libraries for library-not-registered', async () => {
    requestMove.mockResolvedValue({
      kind: 'unavailable',
      reason: 'library-not-registered'
    })
    const r = await moveRegisteredSteamGame(
      game,
      '/libB/steamapps',
      makeCollab()
    )
    expect(r.error).toContain("doesn't list that folder")
  })

  it('creates then deletes its abort controller, even on an error', async () => {
    requestMove.mockResolvedValue({
      kind: 'error',
      stage: 'CanMoveApp',
      code: 18
    })
    await moveRegisteredSteamGame(game, '/libB/steamapps', makeCollab())
    expect(aborts.create).toHaveBeenCalledWith('264160')
    expect(aborts.delete).toHaveBeenCalledWith('264160')
  })

  it('reuses a live abort controller and leaves it alone', async () => {
    aborts.has.mockReturnValue(true)
    requestMove.mockResolvedValue(finished())
    await moveRegisteredSteamGame(game, '/libB/steamapps', makeCollab())
    expect(aborts.create).not.toHaveBeenCalled()
    expect(aborts.delete).not.toHaveBeenCalled()
  })
})

describe('add-library route (quick 261122-n4q)', () => {
  let base: string
  let lib: string
  let picked: string
  let current: string

  beforeEach(() => {
    jest.clearAllMocks()
    base = realpathSync(mkdtempSync(join(tmpdir(), 'gamelib-move-n4q-')))
    lib = join(base, 'lib')
    picked = join(base, 'new')
    current = join(lib, 'steamapps', 'common', 'WazHack')
    mkdirSync(current, { recursive: true })
    mkdirSync(picked)
    installPath = current
    getGameInfo.mockImplementation(() => ({
      title: 'WazHack',
      install: installPath ? { install_path: installPath } : {}
    }))
    createRun.mockReturnValue('run')
    readRunningApp.mockResolvedValue(0)
    listLibraries.mockResolvedValue([
      { path: lib, steamappsDir: join(lib, 'steamapps'), isPrimary: true }
    ])
    aborts.has.mockReturnValue(false)
    aborts.create.mockReturnValue(controller)
    aborts.getSignal.mockReturnValue(controller.signal)
    reconcile.mockImplementation(() => {
      installPath = join(picked, 'steamapps', 'common', 'WazHack')
      return Promise.resolve()
    })
  })

  afterEach(() => {
    chmodSync(picked, 0o755)
    rmSync(base, { recursive: true, force: true })
  })

  const added = (extra: object = {}) => ({
    ...finished(),
    addedLibrary: true,
    ...extra
  })

  it.each([
    ['an empty folder', undefined],
    ['a folder holding files', 'keep.txt']
  ])('registers %s and moves into it', async (_n, file) => {
    if (file) writeFileSync(join(picked, file), 'x')
    requestMove.mockResolvedValue(added())
    await expect(
      moveRegisteredSteamGame(game, picked, makeCollab())
    ).resolves.toEqual({ status: 'done' })
    expect(requestMove).toHaveBeenCalledWith(
      '264160',
      {
        libraryPath: realpathSync(picked),
        wait: true,
        signal: controller.signal,
        addLibrary: true
      },
      { paths: { p: 1 }, run: 'run' }
    )
    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  it('keeps the existing-library route free of addLibrary', async () => {
    mkdirSync(join(base, 'lib2', 'steamapps'), { recursive: true })
    listLibraries.mockResolvedValue([
      { path: lib, steamappsDir: join(lib, 'steamapps'), isPrimary: true },
      {
        path: join(base, 'lib2'),
        steamappsDir: join(base, 'lib2', 'steamapps'),
        isPrimary: false
      }
    ])
    reconcile.mockImplementation(() => {
      installPath = join(base, 'lib2', 'steamapps', 'common', 'WazHack')
      return Promise.resolve()
    })
    requestMove.mockResolvedValue(finished())
    await moveRegisteredSteamGame(game, join(base, 'lib2'), makeCollab())
    const opts = requestMove.mock.calls[0]?.[1] as Record<string, unknown>
    expect(opts).toEqual({
      libraryPath: join(base, 'lib2'),
      wait: true,
      signal: controller.signal
    })
    expect(opts).not.toHaveProperty('addLibrary')
  })

  const refuses = async (path: string, text: string) => {
    const r = await moveRegisteredSteamGame(game, path, makeCollab())
    expect(r.status).toBe('error')
    expect(r.error).toContain(text)
    expect(requestMove).not.toHaveBeenCalled()
  }

  it('refuses a missing path', async () => {
    await refuses(join(base, 'nope'), "isn't an existing folder")
  })

  it('refuses a file', async () => {
    const f = join(base, 'a-file')
    writeFileSync(f, 'x')
    await refuses(f, "isn't an existing folder")
  })

  const itNotRoot = process.getuid?.() === 0 ? it.skip : it
  itNotRoot('refuses a folder GameLib cannot write to', async () => {
    chmodSync(picked, 0o555)
    await refuses(picked, "can't write to")
  })

  it('refuses a path of 255 bytes or more', async () => {
    let long = base
    while (Buffer.byteLength(long) < 255) long = join(long, 'x'.repeat(60))
    mkdirSync(long, { recursive: true })
    await refuses(long, 'too long for Steam')
  })

  it('refuses the current install and a folder inside it', async () => {
    await refuses(current, 'is installed now')
    const inside = join(current, 'data')
    mkdirSync(inside)
    await refuses(inside, 'is installed now')
  })

  it('refuses a folder containing the current install even outside every library', async () => {
    const outside = join(base, 'outside', 'deep', 'WazHack')
    mkdirSync(outside, { recursive: true })
    installPath = outside
    await refuses(join(base, 'outside'), "contains WazHack's current install")
  })

  it('refuses a folder inside an existing library', async () => {
    const inside = join(lib, 'Extra')
    mkdirSync(inside)
    await refuses(inside, 'is inside the Steam library')
  })

  it('refuses a folder containing an existing library', async () => {
    installPath = '/not/anywhere/WazHack'
    await refuses(base, 'contains the Steam library')
  })

  it("refuses a folder that already holds this game's install folder", async () => {
    mkdirSync(join(picked, 'steamapps', 'common', 'WazHack'), {
      recursive: true
    })
    await refuses(picked, 'already holds a copy of WazHack')
  })

  it("refuses a folder that already holds this game's appmanifest", async () => {
    mkdirSync(join(picked, 'steamapps'))
    writeFileSync(join(picked, 'steamapps', 'appmanifest_264160.acf'), '')
    await refuses(picked, 'already holds a copy of WazHack')
  })

  it('refuses when the library list cannot be read', async () => {
    listLibraries.mockRejectedValue(new Error('boom'))
    await refuses(picked, "couldn't read Steam's library list")
  })

  it.each([
    [
      { kind: 'refused', reason: 'inside-library' },
      "inside one of Steam's libraries"
    ],
    [
      { kind: 'refused', reason: 'contains-library' },
      "contains one of Steam's libraries"
    ],
    [{ kind: 'refused', reason: 'library-not-directory' }, "isn't an existing"],
    [{ kind: 'refused', reason: 'path-too-long' }, 'too long for Steam'],
    [{ kind: 'refused', reason: 'add-library-refused' }, "Steam wouldn't add"],
    [
      { kind: 'refused', reason: 'add-library-unverified' },
      "couldn't confirm it"
    ],
    [
      { kind: 'unavailable', reason: 'method-unverified:AddLibraryFolder' },
      "doesn't let GameLib add"
    ],
    [
      { kind: 'error', stage: 'MoveApp', code: 16, addedLibrary: true },
      'Steam added'
    ]
  ])('maps %j to a message', async (outcome, text) => {
    requestMove.mockResolvedValue(outcome)
    const r = await moveRegisteredSteamGame(game, picked, makeCollab())
    expect(r.status).toBe('error')
    expect(r.error).toContain(text)
    expect(reconcile).not.toHaveBeenCalled()
  })
})

describe('moveInstall routing (gameMaintenance)', () => {
  const routed = {
    appId: '264160',
    getGameInfo: () => ({ title: 'WazHack' }),
    deps: { paths: {} }
  } as never

  afterEach(() => jest.restoreAllMocks())

  it('refuses a bridge install without calling moveRegisteredSteamGame', async () => {
    jest
      .spyOn(bridgeBottle, 'findBridgeInstallBottle')
      .mockReturnValue('bottle' as never)
    const spy = jest.spyOn(moveNative, 'moveRegisteredSteamGame')
    await expect(moveInstall(routed, '/libB')).resolves.toEqual({
      status: 'error',
      error: "Move isn't available for bridge games yet"
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses a game Steam has no ACF for', async () => {
    jest.spyOn(bridgeBottle, 'findBridgeInstallBottle').mockReturnValue(null)
    jest.spyOn(acfUpdateState, 'readAcfUpdateState').mockResolvedValue(null)
    const spy = jest.spyOn(moveNative, 'moveRegisteredSteamGame')
    const r = await moveInstall(routed, '/libB')
    expect(r.status).toBe('error')
    expect(r.error).toContain("Steam doesn't list WazHack")
    expect(spy).not.toHaveBeenCalled()
  })

  it('delegates a Steam-registered install as (game, path)', async () => {
    jest.spyOn(bridgeBottle, 'findBridgeInstallBottle').mockReturnValue(null)
    jest
      .spyOn(acfUpdateState, 'readAcfUpdateState')
      .mockResolvedValue({} as never)
    const spy = jest
      .spyOn(moveNative, 'moveRegisteredSteamGame')
      .mockResolvedValue({ status: 'done' })
    await expect(moveInstall(routed, '/libB')).resolves.toEqual({
      status: 'done'
    })
    expect(spy).toHaveBeenCalledWith(routed, '/libB')
  })

  it('never rejects: a throwing collaborator becomes an error result', async () => {
    jest.spyOn(bridgeBottle, 'findBridgeInstallBottle').mockReturnValue(null)
    jest
      .spyOn(acfUpdateState, 'readAcfUpdateState')
      .mockResolvedValue({} as never)
    jest
      .spyOn(moveNative, 'moveRegisteredSteamGame')
      .mockRejectedValue(new Error('kaboom'))
    await expect(moveInstall(routed, '/libB')).resolves.toEqual({
      status: 'error',
      error: 'kaboom'
    })
  })
})
