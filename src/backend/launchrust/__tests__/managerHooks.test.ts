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
