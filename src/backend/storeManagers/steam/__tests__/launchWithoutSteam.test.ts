import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { initHeadless } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'
import {
  DIRECT_LAUNCH_EARLY_EXIT_MS,
  formatDirectLaunchStartedLine,
  isDirectLaunchEarlyExit,
  pushDirectLaunchNotice
} from '../directLaunch/directLaunchOutcome'
import {
  launchMacNativeWithoutSteam,
  launchWithoutSteam
} from '../directLaunch/launchWithoutSteam'
import {
  STEAM_DIRECT_TRACK_RUNNER,
  type DirectLaunchVerdict
} from '../directLaunch/directLaunchVerdict'

jest.mock('backend/dialog/dialog', () => ({ notify: jest.fn() }))

// The real logger needs a writer; HOME is redirected by the backend jest containment setup.
beforeAll(() => initHeadless())

describe('early-exit predicate and started-line formatter (quick 261120-8hb)', () => {
  test('is true strictly inside the window', () => {
    expect(
      isDirectLaunchEarlyExit(1000, 1000 + DIRECT_LAUNCH_EARLY_EXIT_MS - 1)
    ).toBe(true)
    expect(isDirectLaunchEarlyExit(1000, 1000)).toBe(true)
  })
  test('is false at the boundary, for negative elapsed and for non-finite input', () => {
    expect(
      isDirectLaunchEarlyExit(1000, 1000 + DIRECT_LAUNCH_EARLY_EXIT_MS)
    ).toBe(false)
    expect(isDirectLaunchEarlyExit(1000, 999)).toBe(false)
    expect(isDirectLaunchEarlyExit(NaN, 1000)).toBe(false)
    expect(isDirectLaunchEarlyExit(1000, Infinity)).toBe(false)
  })
  test('formats the started line per route', () => {
    expect(
      formatDirectLaunchStartedLine(
        '10',
        'mac-native',
        '/i/G.app/Contents/MacOS/G'
      )
    ).toBe(
      'launch without Steam started for appId 10: kind mac-native, binary /i/G.app/Contents/MacOS/G'
    )
    expect(formatDirectLaunchStartedLine('10', 'bridge', 'C:\\G\\g.exe')).toBe(
      'launch without Steam started for appId 10: kind bridge, exe C:\\G\\g.exe'
    )
  })
})

describe('launchMacNativeWithoutSteam', () => {
  let install: string
  let binary: string
  beforeEach(() => {
    install = mkdtempSync(join(tmpdir(), 'p38-launch-'))
    mkdirSync(join(install, 'Game.app', 'Contents', 'MacOS'), {
      recursive: true
    })
    binary = join(install, 'Game.app', 'Contents', 'MacOS', 'Game')
    writeFileSync(binary, 'x')
  })
  afterEach(() => {
    rmSync(install, { recursive: true, force: true })
  })

  function setup(script: Parameters<typeof createScriptedRunner>[0]) {
    const runner = createScriptedRunner(script)
    const statuses: string[] = []
    const info = jest.fn()
    const now = jest.fn()
    const onEarlyExit = jest.fn()
    const deps = {
      runner,
      sendStatus: (s: 'playing' | 'done') => void statuses.push(s),
      log: () => undefined,
      info,
      now,
      onEarlyExit
    }
    return { runner, statuses, deps, info, now, onEarlyExit }
  }

  test('spawns the binary with the PICS args, tracked, and reports playing then done', async () => {
    const { runner, statuses, deps } = setup([{ cmd: binary }])
    const cwd = join(install, 'Game.app')
    const ok = await launchMacNativeWithoutSteam(deps, '10', install, {
      binaryPath: binary,
      args: ['-windowed'],
      workingDir: cwd
    })
    expect(ok).toBe(true)
    await new Promise((r) => setImmediate(r))
    expect(runner.calls).toHaveLength(1)
    const call = runner.calls[0]
    expect(call?.cmd).toBe(binary)
    expect(call?.argv).toEqual(['-windowed'])
    expect(call?.cwd).toBe(cwd)
    expect(call?.opts).toMatchObject({
      track: { runner: STEAM_DIRECT_TRACK_RUNNER, key: '10' },
      timeout: { none: true },
      resolveOn: 'exit'
    })
    expect(statuses).toEqual(['playing', 'done'])
  })

  test('a spawn logs the started line once', async () => {
    const { deps, info, now } = setup([{ cmd: binary }])
    now.mockReturnValue(1000)
    await launchMacNativeWithoutSteam(deps, '10', install, {
      binaryPath: binary,
      args: []
    })
    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith(
      `launch without Steam started for appId 10: kind mac-native, binary ${binary}`
    )
  })

  test.each([
    ['one ms inside the window', DIRECT_LAUNCH_EARLY_EXIT_MS - 1, 1],
    ['exactly at the window', DIRECT_LAUNCH_EARLY_EXIT_MS, 0]
  ])('exit %s: onEarlyExit calls %d', async (_n, elapsed, calls) => {
    const { deps, now, onEarlyExit } = setup([{ cmd: binary }])
    now.mockReturnValueOnce(1000).mockReturnValueOnce(1000 + elapsed)
    await launchMacNativeWithoutSteam(deps, '10', install, {
      binaryPath: binary,
      args: []
    })
    await new Promise((r) => setImmediate(r))
    expect(onEarlyExit).toHaveBeenCalledTimes(calls)
    if (calls) expect(onEarlyExit).toHaveBeenCalledWith(elapsed)
  })

  test('a Stop (killedByUs) inside the window does not report an early exit', async () => {
    const { deps, now, onEarlyExit } = setup([
      { cmd: binary, result: { killedByUs: true } }
    ])
    now.mockReturnValueOnce(1000).mockReturnValueOnce(1500)
    await launchMacNativeWithoutSteam(deps, '10', install, {
      binaryPath: binary,
      args: []
    })
    await new Promise((r) => setImmediate(r))
    expect(onEarlyExit).not.toHaveBeenCalled()
  })

  test('a throwing onEarlyExit never reaches the failed log or changes statuses', async () => {
    const log = jest.fn()
    const { deps, now, onEarlyExit, statuses } = setup([{ cmd: binary }])
    now.mockReturnValueOnce(1000).mockReturnValueOnce(1100)
    onEarlyExit.mockImplementation(() => {
      throw new Error('boom')
    })
    const ok = await launchMacNativeWithoutSteam(
      { ...deps, log },
      '10',
      install,
      { binaryPath: binary, args: [] }
    )
    await new Promise((r) => setImmediate(r))
    expect(ok).toBe(true)
    expect(log).not.toHaveBeenCalled()
    expect(statuses).toEqual(['playing', 'done'])
  })

  test.each([
    ['dot-dot escape', () => join(install, '..', 'evil')],
    ['absolute elsewhere', () => '/bin/sh'],
    ['missing on disk', () => join(install, 'nope')]
  ])('%s is refused without spawning', async (_n, pick) => {
    const { runner, deps } = setup([])
    const ok = await launchMacNativeWithoutSteam(deps, '10', install, {
      binaryPath: pick(),
      args: []
    })
    expect(ok).toBe(false)
    expect(runner.calls).toHaveLength(0)
  })

  test('a spawn error before onSpawn resolves false and sends done', async () => {
    const { statuses, deps, info, onEarlyExit } = setup([
      { cmd: binary, error: { code: 'ENOENT' } }
    ])
    const ok = await launchMacNativeWithoutSteam(deps, '10', install, {
      binaryPath: binary,
      args: []
    })
    expect(ok).toBe(false)
    expect(statuses).toEqual(['done'])
    expect(info).not.toHaveBeenCalled()
    expect(onEarlyExit).not.toHaveBeenCalled()
  })

  test('a working dir outside the install falls back to the binary folder', async () => {
    const { runner, deps } = setup([{ cmd: binary }])
    await launchMacNativeWithoutSteam(deps, '10', install, {
      binaryPath: binary,
      args: [],
      workingDir: '/tmp'
    })
    expect(runner.calls[0]?.cwd).toBe(
      join(install, 'Game.app', 'Contents', 'MacOS')
    )
  })
})

describe('launchWithoutSteam (setting-driven, never fails the launch)', () => {
  const bridgeModule = jest.requireActual<typeof import('../gameBridgeLaunch')>(
    '../gameBridgeLaunch'
  )

  function fakeGame(launch: jest.Mock, installPath = '/inst') {
    const inFlight = new Map<string, Promise<boolean>>()
    return {
      inFlight,
      game: {
        appId: '10',
        deps: {
          runner: createScriptedRunner([]),
          steamSession: { gameSession: { bridgeLaunchesInFlight: inFlight } },
          engineRuntime: { registry: { clearEngineSelection: jest.fn() } }
        },
        getGameInfo: () => ({
          title: 'T',
          install: { install_path: installPath }
        }),
        launch
      } as never
    }
  }
  const verdict = (v: DirectLaunchVerdict) => ({
    getVerdict: () => Promise.resolve(v)
  })

  test.each([
    ['steam-drm'],
    ['host-unsupported'],
    ['route-unsupported'],
    ['not-installed']
  ] as const)('verdict %s falls back to steamGame.launch()', async (reason) => {
    const launch = jest.fn(() => Promise.resolve(true))
    const { game } = fakeGame(launch)
    const ok = await launchWithoutSteam(
      game,
      verdict({ applies: false, reason })
    )
    expect(ok).toBe(true)
    expect(launch).toHaveBeenCalledTimes(1)
  })

  test('mac-native verdict without a binary falls back to the Steam launch', async () => {
    const launch = jest.fn(() => Promise.resolve(true))
    const { game } = fakeGame(launch)
    const ok = await launchWithoutSteam(
      game,
      verdict({
        applies: true,
        kind: 'mac-native',
        warning: 'unknown',
        launch: { args: [] }
      })
    )
    expect(ok).toBe(true)
    expect(launch).toHaveBeenCalledTimes(1)
  })

  test('late bridge DRM refusal falls back after the bridge in-flight entry is released', async () => {
    let inFlightWhenLaunched: boolean | undefined
    const launch = jest.fn(() => Promise.resolve(true))
    const { game, inFlight } = fakeGame(launch)
    launch.mockImplementation(() => {
      inFlightWhenLaunched = inFlight.has('10')
      return Promise.resolve(true)
    })
    const body = jest
      .spyOn(bridgeModule, 'launchBridgeGameBody')
      .mockImplementation((_g, opts) => {
        opts?.withoutSteam?.onNeedsSteam?.()
        return Promise.resolve(false)
      })
    try {
      const ok = await launchWithoutSteam(
        game,
        verdict({
          applies: true,
          kind: 'bridge',
          warning: 'none',
          launch: { args: ['-x'] }
        })
      )
      expect(body).toHaveBeenCalledTimes(1)
      expect(launch).toHaveBeenCalledTimes(1)
      expect(inFlightWhenLaunched).toBe(false)
      expect(ok).toBe(true)
    } finally {
      body.mockRestore()
    }
  })

  test('a bridge launch that fails for another reason does not fall back', async () => {
    const launch = jest.fn(() => Promise.resolve(true))
    const { game } = fakeGame(launch)
    const body = jest
      .spyOn(bridgeModule, 'launchBridgeGameBody')
      .mockResolvedValue(false)
    try {
      const ok = await launchWithoutSteam(
        game,
        verdict({
          applies: true,
          kind: 'bridge',
          warning: 'steam-api',
          launch: { args: [] }
        })
      )
      expect(ok).toBe(false)
      expect(launch).not.toHaveBeenCalled()
    } finally {
      body.mockRestore()
    }
  })
})

describe('launchWithoutSteam Mac-native start failure (quick 261120-8hb)', () => {
  let install: string
  let binary: string
  beforeEach(() => {
    install = mkdtempSync(join(tmpdir(), '8hb-launch-'))
    mkdirSync(join(install, 'Game.app', 'Contents', 'MacOS'), {
      recursive: true
    })
    binary = join(install, 'Game.app', 'Contents', 'MacOS', 'Game')
    writeFileSync(binary, 'x')
    jest.mocked(notify).mockClear()
  })
  afterEach(() => {
    rmSync(install, { recursive: true, force: true })
  })

  function macGame(
    script: Parameters<typeof createScriptedRunner>[0],
    overrides: {
      requestRustInvoke?: jest.Mock
      sendFrontendMessage?: jest.Mock
    } = {}
  ) {
    const sendFrontendMessage = overrides.sendFrontendMessage ?? jest.fn()
    return {
      sendFrontendMessage,
      game: {
        appId: '10',
        deps: {
          runner: createScriptedRunner(script),
          sendFrontendMessage,
          requestRustInvoke:
            overrides.requestRustInvoke ?? jest.fn().mockResolvedValue(7),
          steamInstallRuntime: { noticeSeq: { last: 0 } },
          steamSession: {
            gameSession: { bridgeLaunchesInFlight: new Map() },
            libraryState: { library: new Map([['10', { title: 'T' }]]) }
          },
          appRuntime: { events: { emit: jest.fn() } },
          engineRuntime: { registry: { clearEngineSelection: jest.fn() } }
        },
        getGameInfo: () => ({
          title: 'T',
          install: { install_path: install }
        }),
        launch: jest.fn()
      } as never
    }
  }
  const macVerdict = () => ({
    getVerdict: () =>
      Promise.resolve({
        applies: true,
        kind: 'mac-native',
        warning: 'none',
        launch: { binaryPath: binary, args: [] }
      } as DirectLaunchVerdict)
  })
  const requestNotices = (send: jest.Mock) =>
    send.mock.calls.filter((c) => c[0] === 'steamRequestNotice')

  test('a spawn error resolves false and pushes one direct-launch-failed notice, no OS notification', async () => {
    const { game, sendFrontendMessage } = macGame([
      { cmd: binary, error: { code: 'EBADARCH' } }
    ])
    const ok = await launchWithoutSteam(game, macVerdict())
    expect(ok).toBe(false)
    expect(requestNotices(sendFrontendMessage)).toEqual([
      [
        'steamRequestNotice',
        { appId: '10', title: 'T', kind: 'direct-launch-failed', seq: 7 }
      ]
    ])
    expect(notify).not.toHaveBeenCalled()
  })

  test('pushDirectLaunchNotice falls back to the local seq when the Rust invoke rejects', async () => {
    const { game, sendFrontendMessage } = macGame(
      [{ cmd: binary, error: { code: 'EBADARCH' } }],
      { requestRustInvoke: jest.fn().mockRejectedValue(new Error('down')) }
    )
    await expect(launchWithoutSteam(game, macVerdict())).resolves.toBe(false)
    const calls = requestNotices(sendFrontendMessage)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[1]).toMatchObject({ kind: 'direct-launch-failed' })
    expect(typeof calls[0]?.[1].seq).toBe('number')
  })

  test('pushDirectLaunchNotice never rejects when sendFrontendMessage throws', async () => {
    const throwing = jest.fn(() => {
      throw new Error('ipc closed')
    })
    const { game } = macGame([{ cmd: binary, error: { code: 'EBADARCH' } }], {
      sendFrontendMessage: throwing
    })
    // gameStatusUpdate also goes through sendFrontendMessage; the throwing mock
    // would reject launchMacNative, so only the notice push is exercised here.
    await expect(
      pushDirectLaunchNotice(game, 'direct-launch-failed')
    ).resolves.toBeUndefined()
  })
})
