/**
 * The ManagerHooks handler (Phase 88.2, 88.2-20, 88.3-08, D-26): `registerLaunchManagerHooks` answers the Rust shell's
 * `launchManagerCall` (`[op, payload]`) from the library managers, the stores' launch hooks and the settings: 88.2's
 * `game_title` and `force_uninstall`, and the launch funnel's eight ops (`launch_facts`, `launch`, `sync_saves`,
 * `set_presence`, `clear_presence`, `persist_bottle_wine_version`, `update_gog_playtime`, `wine_settings_write`). The shell's
 * end of the call is `SidecarManagerHooks` (88.2-18, 88.3-06); the frame is validated by the sidecar's boundary and again here.
 */
import { sidecarInternalInvokeArgs } from 'common/types/ipc/sidecarInternal'
import type { LogFrame, LogFrameTarget } from 'common/types/sidecarTransport'
import { bindLogTransport, flushLogForwarder } from 'backend/logger'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'

import { registerLaunchManagerHooks } from '../runner'
import { answerFunnelHook, hookRefusal } from '../funnelHooks'
import type { FunnelHookDeps } from '../funnelHooks'

const RUNNERS = ['gog', 'legendary', 'nile', 'sideload', 'steam'] as const
const WINE = { bin: '/w/bin/wine', name: 'Wine-Test', type: 'wine' }
const OTHER_WINE = { bin: '/o/bin/wine', name: 'Wine-Other', type: 'crossover' }
const GAME_TARGET: LogFrameTarget = {
  kind: 'game',
  appName: 'some-app',
  runner: 'gog',
  type: 'launch'
}

const frames: LogFrame[] = []
beforeAll(() => {
  bindLogTransport({
    send(frame, onWritten) {
      frames.push(frame)
      onWritten()
      return true
    },
    onReady() {
      // Never backed up.
    }
  })
})
beforeEach(() => {
  frames.length = 0
})

/** The structured and raw entries of the batches sent for one target kind, in order, as text. */
function sentFor(kind: string) {
  return frames
    .flatMap((f) => f.batch)
    .filter((batch) => batch.target.kind === kind)
}
function textsOf(kind: string): string[] {
  return sentFor(kind).flatMap((batch) =>
    batch.entries.map((entry) => ('line' in entry ? entry.line.msg : entry.raw))
  )
}

interface FakeGame {
  getGameInfo: jest.Mock
  forceUninstall: jest.Mock
  getSettings: jest.Mock
  isNative: jest.Mock
  launch: jest.Mock
  syncSaves: jest.Mock
  updateGOGPlaytime: jest.Mock
}

function fakeGame(title: string | undefined): FakeGame {
  return {
    getGameInfo: jest.fn(() => (title === undefined ? {} : { title })),
    forceUninstall: jest.fn(async () => ({ status: 'done' })),
    getSettings: jest.fn(async () => ({ autoSyncSaves: true })),
    isNative: jest.fn(() => true),
    launch: jest.fn(async () => true),
    syncSaves: jest.fn(async () => 'ok'),
    updateGOGPlaytime: jest.fn(async () => undefined)
  }
}

interface Rig {
  deps: FunnelHookDeps
  getGame: jest.Mock
  setSetting: jest.Mock
  gameSetSetting: jest.Mock
  gameConfigGet: jest.Mock
  hooks: Record<
    (typeof RUNNERS)[number],
    {
      setPresence?: jest.Mock
      clearPresence?: jest.Mock
      persistBottleWineVersion?: jest.Mock
    }
  >
}

/** A manager table whose every runner answers `game` for any app name, and records the asks. */
function rigOver(game: FakeGame, isCLINoGui = false): Rig {
  const getGame = jest.fn(() => game)
  const library = Object.fromEntries(
    RUNNERS.map((runner) => [runner, { getGame }])
  ) as unknown as FunnelHookDeps['libraryManagers']
  const hooks: Rig['hooks'] = {
    gog: {
      setPresence: jest.fn(async () => undefined),
      clearPresence: jest.fn(async () => undefined)
    },
    legendary: {},
    nile: {},
    sideload: {},
    steam: { persistBottleWineVersion: jest.fn(async () => undefined) }
  }
  const setSetting = jest.fn()
  const gameSetSetting = jest.fn()
  const gameConfigGet = jest.fn(() => ({
    getSettings: jest.fn(async () => ({ verboseLogs: true })),
    setSetting: gameSetSetting
  }))
  const kvs = { marker: 'kvs' }
  const deps = {
    libraryManagers: library,
    launchHooks: hooks,
    config: {
      getSettings: jest.fn(() => ({
        minimizeOnLaunch: true,
        noTrayIcon: false,
        disableLogs: false,
        disablePlaytimeSync: true
      })),
      setSetting
    },
    gameConfigs: { get: gameConfigGet },
    stores: { kvs },
    isCLINoGui
  } as unknown as FunnelHookDeps
  return { deps, getGame, setSetting, gameSetSetting, gameConfigGet, hooks }
}

function registered(game: FakeGame, isCLINoGui = false) {
  const ipc = createIpcRegistry()
  const rig = rigOver(game, isCLINoGui)
  registerLaunchManagerHooks(ipc, rig.deps)
  const handler = ipc.getHandler('launchManagerCall')
  if (!handler) throw new Error('launchManagerCall was not registered')
  return {
    ipc,
    rig,
    getGame: rig.getGame,
    call: (...args: unknown[]) => Promise.resolve(handler(undefined, ...args))
  }
}

describe('registerLaunchManagerHooks (88.2-20)', () => {
  it('registers the one launchManagerCall handler, and its args schema is the sidecar internal one', () => {
    const { ipc } = registered(fakeGame('T'))
    expect(ipc.has('launchManagerCall')).toBe(true)
    expect(
      sidecarInternalInvokeArgs.launchManagerCall.safeParse([
        'game_title',
        { runner: 'gog', appName: 'a' }
      ]).success
    ).toBe(true)
  })

  it('game_title answers the manager title for the runner and app the call names', async () => {
    const game = fakeGame('Some Game')
    const { call, getGame } = registered(game)
    await expect(
      call('game_title', { runner: 'legendary', appName: 'some-app' })
    ).resolves.toBe('Some Game')
    expect(getGame).toHaveBeenCalledTimes(1)
    expect(getGame).toHaveBeenCalledWith('some-app')
    expect(game.forceUninstall).not.toHaveBeenCalled()
  })

  it('force_uninstall calls the manager once and answers once it is done', async () => {
    const game = fakeGame('Some Game')
    const { call, getGame } = registered(game)
    await expect(
      call('force_uninstall', { runner: 'gog', appName: 'some-app' })
    ).resolves.toBe(true)
    expect(game.forceUninstall).toHaveBeenCalledTimes(1)
    expect(getGame).toHaveBeenCalledWith('some-app')
    expect(game.getGameInfo).not.toHaveBeenCalled()
  })

  it('a manager that throws rejects the call, so the shell answers its own hook failure', async () => {
    const game = fakeGame('T')
    game.forceUninstall.mockRejectedValue(new Error('disk gone'))
    const { call } = registered(game)
    await expect(
      call('force_uninstall', { runner: 'gog', appName: 'a' })
    ).rejects.toThrow('disk gone')
  })

  describe('refusals', () => {
    const SECRET = '/Users/someone/secret-profile-path'

    async function refusal(game: FakeGame, ...args: unknown[]) {
      const { call, getGame } = registered(game)
      const failure = await call(...args).then(
        () => undefined,
        (err: unknown) => err
      )
      expect(failure).toBeInstanceOf(Error)
      // No manager was reached for a refused call.
      expect(getGame).not.toHaveBeenCalled()
      expect(game.forceUninstall).not.toHaveBeenCalled()
      return (failure as Error).message
    }

    it('an unknown op is refused naming the op only', async () => {
      const message = await refusal(fakeGame('T'), 'delete_everything', {
        runner: 'gog',
        appName: SECRET
      })
      expect(message).toBe("launchManagerCall: unknown op 'delete_everything'")
      expect(message).not.toContain(SECRET)
    })

    it('an op that is not a string, or is long or odd, is named safely or not at all', async () => {
      const game = fakeGame('T')
      expect(await refusal(game, 7, { runner: 'gog', appName: SECRET })).toBe(
        'launchManagerCall: unknown op'
      )
      const odd = await refusal(game, `${SECRET}${'x'.repeat(100)}`, {
        runner: 'gog',
        appName: 'a'
      })
      expect(odd).not.toContain('/')
      expect(odd.length).toBeLessThan(80)
      expect(await refusal(game)).toBe('launchManagerCall: unknown op')
    })

    it('a runner outside the five names is refused without echoing the payload', async () => {
      for (const op of ['game_title', 'force_uninstall']) {
        const message = await refusal(fakeGame('T'), op, {
          runner: SECRET,
          appName: SECRET
        })
        expect(message).toBe(`launchManagerCall: bad arguments for ${op}`)
        expect(message).not.toContain(SECRET)
      }
    })

    it('an empty app name is refused without echoing the payload', async () => {
      const message = await refusal(fakeGame('T'), 'force_uninstall', {
        runner: 'gog',
        appName: ''
      })
      expect(message).toBe(
        'launchManagerCall: bad arguments for force_uninstall'
      )
    })

    it('a payload with an extra key, a missing key or an extra argument is refused', async () => {
      for (const args of [
        ['game_title', { runner: 'gog', appName: SECRET, extra: SECRET }],
        ['game_title', { runner: 'gog' }],
        ['game_title', { appName: SECRET }],
        ['game_title', { runner: 'gog', appName: 'a' }, SECRET],
        ['game_title', SECRET],
        ['game_title']
      ]) {
        const message = await refusal(fakeGame('T'), ...args)
        expect(message).toMatch(/^launchManagerCall: /)
        expect(message).not.toContain(SECRET)
      }
    })
  })

  describe('the title fallback', () => {
    it('a game with no title answers its app name, as the TypeScript dialog did', async () => {
      const { call } = registered(fakeGame(undefined))
      await expect(
        call('game_title', { runner: 'gog', appName: 'no-title-app' })
      ).resolves.toBe('no-title-app')
    })

    it('an empty title falls back to the app name too', async () => {
      const { call } = registered(fakeGame(''))
      await expect(
        call('game_title', { runner: 'steam', appName: '480' })
      ).resolves.toBe('480')
    })
  })
})

/** The `launch` op's frame, as `launch_dispatch.rs` builds it (88.3-06), the log hand-off carrying `rotate`. */
function launchFrame(rotate: boolean, extra: Record<string, unknown> = {}) {
  return {
    runner: 'gog',
    appName: 'some-app',
    log: { target: GAME_TARGET, disabled: false, rotate },
    ...extra
  }
}

describe('the launch op: one rotation between the funnel and the manager (88.3-08, D-29)', () => {
  it('a rotation the funnel already claimed: the manager line goes out with rotate false and the answer says not rotated', async () => {
    const game = fakeGame('Some Game')
    game.launch.mockImplementation(async (writer) => {
      await writer.logInfo('manager line')
      return true
    })
    const { call } = registered(game)
    await expect(call('launch', launchFrame(false))).resolves.toEqual({
      launched: true,
      rotated: false
    })
    const batches = sentFor('game')
    expect(batches).toHaveLength(1)
    expect(batches[0]?.target).toEqual(GAME_TARGET)
    expect(batches[0]?.rotate).toBe(false)
    expect(textsOf('game')).toEqual([expect.stringContaining('manager line')])
  })

  it('a rotation still owed: the first line carries rotate true and the answer says rotated', async () => {
    const game = fakeGame('Some Game')
    game.launch.mockImplementation(async (writer) => {
      await writer.logInfo('first')
      await writer.logInfo('second')
      return true
    })
    const { call } = registered(game)
    await expect(call('launch', launchFrame(true))).resolves.toEqual({
      launched: true,
      rotated: true
    })
    const rotates = sentFor('game').map((batch) => batch.rotate)
    expect(rotates[0]).toBe(true)
    expect(rotates.filter(Boolean)).toHaveLength(1)
  })

  it('a manager that writes nothing leaves the rotation to the funnel', async () => {
    const { call } = registered(fakeGame('T'))
    await expect(call('launch', launchFrame(true))).resolves.toEqual({
      launched: true,
      rotated: false
    })
    expect(sentFor('game')).toEqual([])
  })

  it('a disabled hand-off sends nothing and claims nothing', async () => {
    const game = fakeGame('T')
    game.launch.mockImplementation(async (writer) => {
      await writer.logInfo('dropped')
      return true
    })
    const { call } = registered(game)
    await expect(
      call('launch', {
        ...launchFrame(false),
        log: { target: GAME_TARGET, disabled: true, rotate: false }
      })
    ).resolves.toEqual({ launched: true, rotated: false })
    expect(sentFor('game')).toEqual([])
  })

  it('passes the Play arguments to the manager as the TS funnel passed them, an absent one absent', async () => {
    const game = fakeGame('T')
    const { call, getGame } = registered(game)
    await call(
      'launch',
      launchFrame(false, {
        launchArguments: { type: 'basic', name: 'Default' },
        args: ['--flag'],
        skipVersionCheck: true
      })
    )
    expect(getGame).toHaveBeenCalledWith('some-app')
    expect(game.launch).toHaveBeenCalledTimes(1)
    const [writer, launchArguments, args, skip] = game.launch.mock.calls[0]
    expect(writer.target).toEqual(GAME_TARGET)
    expect(launchArguments).toEqual({ type: 'basic', name: 'Default' })
    expect(args).toEqual(['--flag'])
    expect(skip).toBe(true)

    await call('launch', launchFrame(false))
    const second = game.launch.mock.calls[1]
    expect(second.slice(1)).toEqual([undefined, undefined, undefined])
  })

  it('a launch that answers false is launched false', async () => {
    const game = fakeGame('T')
    game.launch.mockResolvedValue(false)
    const { call } = registered(game)
    await expect(call('launch', launchFrame(false))).resolves.toEqual({
      launched: false,
      rotated: false
    })
  })

  it('a launch that throws writes the TS exception lines into the facade and answers launched false, with no error text', async () => {
    const game = fakeGame('T')
    game.launch.mockRejectedValue(new Error('SECRET-boom /private/path'))
    const { call } = registered(game)
    const answer = await call('launch', launchFrame(true))
    expect(answer).toEqual({ launched: false, rotated: true })
    expect(JSON.stringify(answer)).not.toContain('SECRET')
    const lines = textsOf('game')
    expect(lines[0]).toContain('An exception occurred when launching the game:')
    expect(lines[1]).toContain('SECRET-boom')
    // The first line the facade wrote carried the owed rotation.
    expect(sentFor('game')[0]?.rotate).toBe(true)
    await flushLogForwarder()
    expect(textsOf('general').join('\n')).toContain('SECRET-boom')
  })

  it('refuses a launch whose log is another game, naming the op only', async () => {
    const { call, getGame } = registered(fakeGame('T'))
    const failure = await call('launch', {
      ...launchFrame(false),
      log: {
        target: { ...GAME_TARGET, appName: '/etc/SECRET' },
        disabled: false,
        rotate: false
      }
    }).then(
      () => undefined,
      (error: unknown) => error
    )
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(
      'launchManagerCall: bad arguments for launch'
    )
    expect(getGame).not.toHaveBeenCalled()
  })
})

/** Every funnel op with a payload that is good for it, and one case that is not, for the refusal sweep. */
const GOOD: Record<string, unknown> = {
  launch_facts: { runner: 'gog', appName: 'some-app' },
  launch: launchFrame(false),
  sync_saves: {
    runner: 'gog',
    appName: 'some-app',
    direction: '--skip-upload',
    savesPath: '/saves',
    gogSaves: []
  },
  set_presence: { runner: 'gog', appName: 'some-app' },
  clear_presence: { runner: 'gog' },
  persist_bottle_wine_version: {
    runner: 'steam',
    appName: '480',
    wine: WINE
  },
  update_gog_playtime: {
    appName: 'some-app',
    start: '2026-11-28T10:00:00.000Z',
    end: '2026-11-28T10:30:00.000Z'
  },
  wine_settings_write: { appName: 'some-app', global: WINE, game: WINE }
}

describe('the funnel ops answer exactly what the TS funnel called (88.3-08, D-26)', () => {
  it('launch_facts answers the info, the settings, nativeness, the per-game verboseLogs, the four global settings and cliNoGui', async () => {
    const game = fakeGame('Some Game')
    game.getSettings.mockResolvedValue({ autoSyncSaves: true, savesPath: '/s' })
    game.isNative.mockReturnValue(false)
    const { call, rig } = registered(game, true)
    const answer = await call('launch_facts', GOOD.launch_facts)
    expect(answer).toEqual({
      gameInfo: { title: 'Some Game' },
      settings: { autoSyncSaves: true, savesPath: '/s' },
      isNative: false,
      verboseLogs: true,
      global: {
        minimizeOnLaunch: true,
        noTrayIcon: false,
        disableLogs: false,
        disablePlaytimeSync: true
      },
      cliNoGui: true
    })
    // The per-game verboseLogs came from the game config store, a read of its own.
    expect(rig.gameConfigGet).toHaveBeenCalledWith('some-app')
  })

  it('sync_saves passes the direction flag, the path and the GOG saves to the manager and answers true', async () => {
    const game = fakeGame('Some Game')
    const { call } = registered(game)
    const gogSaves = [{ name: 'Slot', location: '/g' }]
    await expect(
      call('sync_saves', {
        ...(GOOD.sync_saves as object),
        direction: '--skip-download',
        gogSaves
      })
    ).resolves.toBe(true)
    expect(game.syncSaves).toHaveBeenCalledWith(
      '--skip-download',
      '/saves',
      gogSaves
    )
  })

  it('a sync_saves that threw before the launch writes the download error line and answers false', async () => {
    const game = fakeGame('Some Game')
    game.syncSaves.mockRejectedValue(new Error('no network'))
    const { call } = registered(game)
    await expect(call('sync_saves', GOOD.sync_saves)).resolves.toBe(false)
    await flushLogForwarder()
    expect(textsOf('general')).toEqual([
      'Error while downloading saves for Some Game. Error: no network'
    ])
  })

  it('a sync_saves that threw after the launch writes the upload error line and answers false', async () => {
    const game = fakeGame('Some Game')
    game.syncSaves.mockRejectedValue(new Error('quota'))
    const { call } = registered(game)
    await expect(
      call('sync_saves', {
        ...(GOOD.sync_saves as object),
        direction: '--skip-download'
      })
    ).resolves.toBe(false)
    await flushLogForwarder()
    expect(textsOf('general')).toEqual([
      'Error uploading saves for Some Game. Error: Error: quota'
    ])
  })

  it('sync_saves passes no path as the TS did, undefined, for a game with none', async () => {
    const game = fakeGame('T')
    const { call } = registered(game)
    await call('sync_saves', {
      ...(GOOD.sync_saves as object),
      savesPath: null
    })
    expect(game.syncSaves.mock.calls[0]?.[1]).toBeUndefined()
  })

  it('set_presence and clear_presence call the store hook and answer true, false for a store with none', async () => {
    const { call, rig } = registered(fakeGame('T'))
    await expect(call('set_presence', GOOD.set_presence)).resolves.toBe(true)
    expect(rig.hooks.gog.setPresence).toHaveBeenCalledWith('some-app')
    await expect(call('clear_presence', GOOD.clear_presence)).resolves.toBe(
      true
    )
    expect(rig.hooks.gog.clearPresence).toHaveBeenCalledTimes(1)
    await expect(
      call('set_presence', { runner: 'legendary', appName: 'a' })
    ).resolves.toBe(false)
    await expect(call('clear_presence', { runner: 'nile' })).resolves.toBe(
      false
    )
  })

  it('a presence hook that rejects rejects the call', async () => {
    const { call, rig } = registered(fakeGame('T'))
    rig.hooks.gog.setPresence?.mockRejectedValue(new Error('presence down'))
    await expect(call('set_presence', GOOD.set_presence)).rejects.toThrow(
      'presence down'
    )
  })

  it('persist_bottle_wine_version hands the wine to the store hook and answers true, false for a store with none', async () => {
    const { call, rig } = registered(fakeGame('T'))
    await expect(
      call('persist_bottle_wine_version', GOOD.persist_bottle_wine_version)
    ).resolves.toBe(true)
    expect(rig.hooks.steam.persistBottleWineVersion).toHaveBeenCalledWith(WINE)
    await expect(
      call('persist_bottle_wine_version', {
        runner: 'gog',
        appName: 'a',
        wine: WINE
      })
    ).resolves.toBe(false)
  })

  it('persist_bottle_wine_version refuses a value that is not a wine installation and persists nothing', async () => {
    const { call, rig } = registered(fakeGame('T'))
    for (const wine of [
      null,
      'wine',
      { bin: '/w' },
      { bin: 1, name: 'n', type: 't' },
      [WINE]
    ]) {
      await expect(
        call('persist_bottle_wine_version', {
          runner: 'steam',
          appName: '480',
          wine
        })
      ).rejects.toThrow(
        'launchManagerCall: bad arguments for persist_bottle_wine_version'
      )
    }
    expect(rig.hooks.steam.persistBottleWineVersion).not.toHaveBeenCalled()
  })

  it('update_gog_playtime posts the two instants through the GOG manager and answers true', async () => {
    const game = fakeGame('T')
    const { call, getGame } = registered(game)
    await expect(
      call('update_gog_playtime', GOOD.update_gog_playtime)
    ).resolves.toBe(true)
    expect(getGame).toHaveBeenCalledWith('some-app')
    expect(game.updateGOGPlaytime).toHaveBeenCalledWith(
      new Date('2026-11-28T10:00:00.000Z'),
      new Date('2026-11-28T10:30:00.000Z')
    )
  })

  it('a rejected GOG playtime post rejects the call, as the TS let it reject the launch', async () => {
    const game = fakeGame('T')
    game.updateGOGPlaytime.mockRejectedValue(new Error('gog down'))
    const { call } = registered(game)
    await expect(
      call('update_gog_playtime', GOOD.update_gog_playtime)
    ).rejects.toThrow('gog down')
  })

  it('wine_settings_write writes the global wineVersion first, then the game one, and only that key', async () => {
    const { call, rig } = registered(fakeGame('T'))
    const order: string[] = []
    rig.setSetting.mockImplementation(() => order.push('global'))
    rig.gameSetSetting.mockImplementation(() => order.push('game'))
    await expect(
      call('wine_settings_write', {
        appName: 'some-app',
        global: WINE,
        game: OTHER_WINE
      })
    ).resolves.toBe(true)
    expect(order).toEqual(['global', 'game'])
    expect(rig.setSetting).toHaveBeenCalledTimes(1)
    expect(rig.setSetting).toHaveBeenCalledWith(
      'wineVersion',
      WINE,
      expect.objectContaining({ marker: 'kvs' })
    )
    expect(rig.gameSetSetting).toHaveBeenCalledTimes(1)
    expect(rig.gameSetSetting).toHaveBeenCalledWith('wineVersion', OTHER_WINE)
    expect(rig.gameConfigGet).toHaveBeenCalledWith('some-app')
    // Every setSetting call on the fakes, whichever store, named wineVersion.
    for (const call of [
      ...rig.setSetting.mock.calls,
      ...rig.gameSetSetting.mock.calls
    ]) {
      expect(call[0]).toBe('wineVersion')
    }
  })

  it('wine_settings_write with only one of the two writes only that one', async () => {
    const { call, rig } = registered(fakeGame('T'))
    await call('wine_settings_write', { appName: 'a', game: WINE })
    expect(rig.setSetting).not.toHaveBeenCalled()
    expect(rig.gameSetSetting).toHaveBeenCalledTimes(1)
    await call('wine_settings_write', { appName: 'a', global: WINE })
    expect(rig.setSetting).toHaveBeenCalledTimes(1)
    expect(rig.gameSetSetting).toHaveBeenCalledTimes(1)
  })

  it('wine_settings_write refuses a value that is not a wine installation and writes nothing, not even the valid half', async () => {
    const { call, rig } = registered(fakeGame('T'))
    for (const bad of [null, 'wine', { bin: '/w' }, { bin: '/w', name: 'n' }]) {
      await expect(
        call('wine_settings_write', { appName: 'a', global: WINE, game: bad })
      ).rejects.toThrow(
        'launchManagerCall: bad arguments for wine_settings_write'
      )
      await expect(
        call('wine_settings_write', { appName: 'a', global: bad, game: WINE })
      ).rejects.toThrow(
        'launchManagerCall: bad arguments for wine_settings_write'
      )
    }
    expect(rig.setSetting).not.toHaveBeenCalled()
    expect(rig.gameSetSetting).not.toHaveBeenCalled()
  })
})

describe('a funnel op that is not good for its op is refused naming the op only (T-88.3-18, T-88.3-19)', () => {
  const SECRET = '/Users/someone/secret-profile-path'
  const BAD: Record<string, unknown[]> = {
    launch_facts: [{ runner: SECRET, appName: 'a' }, { runner: 'gog' }],
    launch: [
      { ...launchFrame(false), extra: SECRET },
      { runner: 'gog', appName: 'some-app' },
      { ...launchFrame(false), args: [SECRET, 3] },
      {
        ...launchFrame(false),
        log: {
          target: { ...GAME_TARGET, type: 'install' },
          disabled: false,
          rotate: false
        }
      }
    ],
    sync_saves: [
      { ...(GOOD.sync_saves as object), direction: SECRET },
      { ...(GOOD.sync_saves as object), gogSaves: [SECRET] },
      { runner: 'gog', appName: 'a' }
    ],
    set_presence: [{ runner: 'gog', appName: '' }, { appName: SECRET }],
    clear_presence: [{ runner: SECRET }, { runner: 'gog', appName: 'a' }, {}],
    persist_bottle_wine_version: [
      { runner: 'steam', appName: SECRET, extra: 1, wine: WINE },
      { appName: 'a', wine: WINE }
    ],
    update_gog_playtime: [
      { ...(GOOD.update_gog_playtime as object), start: SECRET },
      { ...(GOOD.update_gog_playtime as object), runner: 'gog' },
      { appName: 'a', start: '2026-11-28T10:00:00.000Z' }
    ],
    wine_settings_write: [
      { appName: 'a', other: SECRET },
      { global: WINE },
      { appName: 'a', extra: WINE }
    ]
  }

  for (const op of Object.keys(GOOD)) {
    it(`${op}: a bad payload is refused before any manager or setting is touched, the text names the op only`, async () => {
      const game = fakeGame('T')
      const { call, getGame, rig } = registered(game)
      for (const payload of BAD[op] ?? []) {
        const failure = await call(op, payload).then(
          () => undefined,
          (error: unknown) => error
        )
        expect(failure).toBeInstanceOf(Error)
        expect((failure as Error).message).toBe(
          `launchManagerCall: bad arguments for ${op}`
        )
        expect((failure as Error).message).not.toContain(SECRET)
      }
      expect(BAD[op]?.length).toBeGreaterThan(0)
      expect(getGame).not.toHaveBeenCalled()
      expect(rig.setSetting).not.toHaveBeenCalled()
      expect(rig.gameSetSetting).not.toHaveBeenCalled()
      expect(game.launch).not.toHaveBeenCalled()
    })

    it(`${op}: an extra argument beyond the payload is refused`, async () => {
      const { call, getGame } = registered(fakeGame('T'))
      await expect(call(op, GOOD[op], 'third')).rejects.toThrow(
        `launchManagerCall: bad arguments for ${op}`
      )
      expect(getGame).not.toHaveBeenCalled()
    })

    it(`${op}: the sidecar boundary schema takes the good payload and refuses a wrong payload for the op`, () => {
      const schema = sidecarInternalInvokeArgs.launchManagerCall
      expect(schema.safeParse([op, GOOD[op]]).success).toBe(true)
      for (const payload of BAD[op] ?? []) {
        expect(schema.safeParse([op, payload]).success).toBe(false)
      }
    })
  }

  it('a payload that is good for another op is refused for this one', () => {
    const schema = sidecarInternalInvokeArgs.launchManagerCall
    expect(
      schema.safeParse(['set_presence', GOOD.clear_presence]).success
    ).toBe(false)
    expect(
      schema.safeParse(['clear_presence', GOOD.set_presence]).success
    ).toBe(false)
    expect(schema.safeParse(['launch_facts', GOOD.launch]).success).toBe(false)
  })
})

describe('answerFunnelHook and hookRefusal, called directly (88.3-08)', () => {
  it('answers a call without the handler, and the refusal text names the op only', async () => {
    const rig = rigOver(fakeGame('T'))
    await expect(
      answerFunnelHook(rig.deps, ['clear_presence', { runner: 'gog' }])
    ).resolves.toBe(true)
    expect(rig.hooks.gog.clearPresence).toHaveBeenCalledTimes(1)
    expect(hookRefusal('launch')).toBe(
      'launchManagerCall: bad arguments for launch'
    )
    expect(hookRefusal('/etc/passwd' + 'x'.repeat(100))).not.toContain('/')
    expect(hookRefusal(7)).toBe('launchManagerCall: unknown op')
  })
})
