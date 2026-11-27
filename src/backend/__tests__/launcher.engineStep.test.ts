/**
 * Phase 61-14 (D-05, D-08, D-13), 87-52 (D-01): the engine step in launchEventCallback.
 *
 * The step is Rust's, so the test drives the launcher's shims with a fake `requestRustInvoke` that returns
 * recorded replies of `engine_launch_select` and records every `engine_launch_end`. The Wine validity check is
 * mocked; what is asserted is the launcher's wiring: order, the request the step is sent, the reply's log lines
 * reaching the log writer, skipping the self-healing Wine check for an engine-controlled launch, the reply's settings
 * reaching the launch, and release of the selection on every exit.
 *
 * Mock implementations are assigned in beforeEach (jest.config.js sets resetMocks: true).
 */
const getGameMock = jest.fn()

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Backend: 'Backend' },
  getRunnerLogWriter: jest.fn(),
  createGameLogWriter: jest.fn()
}))

const calls: string[] = []
const checkWineMock = jest.fn()
jest.mock('backend/utils', () => ({
  ...jest.requireActual('backend/utils'),
  sendGameStatusUpdate: jest.fn()
}))
// 88.1-16: the wine self-heal is the adapter's now, so the launcher imports it from there.
jest.mock('backend/launchAdapters', () => ({
  ...jest.requireActual('backend/launchAdapters'),
  checkWineBeforeLaunch: (...a: unknown[]) => checkWineMock(...a)
}))

const globalSettingsMock = jest.fn()
jest.mock('backend/config', () => ({
  ...jest.requireActual('backend/config'),
  GlobalConfig: { get: () => ({ getSettings: () => globalSettingsMock() }) }
}))

jest.mock('backend/info/recentGames', () => ({
  addRecentGame: jest.fn().mockResolvedValue(undefined)
}))
jest.mock('backend/runsForMe', () => ({ recordPlaySession: jest.fn() }))

import { createTestToolsSlices } from 'backend/testUtils/testServices'
import { createTestOnlineMonitor } from 'backend/testUtils/testOnlineMonitor'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createTsLaunchFunnel } from 'backend/launcher'
import { sendGameStatusUpdate } from 'backend/utils'
import { createGameLogWriter, logInfo } from 'backend/logger'
import {
  RUST_ENGINE_LAUNCH_END,
  RUST_ENGINE_LAUNCH_SELECT,
  RUST_ENGINE_LAUNCH_SETTINGS_GET
} from 'common/types/sidecarTransport'

const KEY = 'legendary:Quail'
const STORED = { verboseLogs: true, wineVersion: { name: 'stored' } }
const OVERLAY = {
  verboseLogs: true,
  wineVersion: { name: 'overlay' },
  afterLaunchScriptPath: '/overlay/after.sh'
}

/** The reply of `engine_launch_select` the next launch gets, and every Rust call the launcher made. */
let selectReply: unknown
/** When set, `engine_launch_select` rejects with it instead of answering. */
let selectError: Error | null
const rustCalls: { channel: string; args: unknown[] }[] = []
const requestRustInvoke = ((channel: string, args: unknown[]) => {
  rustCalls.push({ channel, args })
  if (channel === RUST_ENGINE_LAUNCH_SELECT) {
    calls.push('engineStep')
    if (selectError) return Promise.reject(selectError)
    return Promise.resolve(selectReply)
  }
  if (channel === RUST_ENGINE_LAUNCH_END) return Promise.resolve(null)
  return Promise.reject(new Error(`unscripted rust call ${channel}`))
}) as never
const callsOn = (channel: string) =>
  rustCalls.filter((call) => call.channel === channel)
const runScriptForGame = jest.fn()

let logWriter: {
  writeString: jest.Mock
  logInfo: jest.Mock
  logError: jest.Mock
  logWarning: jest.Mock
  close: jest.Mock
}
let launchMock: jest.Mock

/** The display sleep blocker, observed: each `start` hands out the next id, each `stop` is recorded. */
let nextWakeLockId = 0
const wakeLock = { start: jest.fn(), stop: jest.fn(), isStarted: jest.fn() }
const BLOCKER_STOPPED = 'Stopping Display Power Saver Blocker'
const blockerStops = () =>
  (logInfo as jest.Mock).mock.calls.filter(
    (call) => call[0] === BLOCKER_STOPPED
  )

beforeEach(() => {
  calls.length = 0
  rustCalls.length = 0
  selectReply = { kind: 'skip' }
  selectError = null
  nextWakeLockId = 100
  wakeLock.start.mockImplementation(() => ++nextWakeLockId)
  // A fresh launcher (and so a fresh single-flight table) per test, as one per boot in production.
  launchEventCallback = buildLauncher()
  globalSettingsMock.mockReturnValue({
    minimizeOnLaunch: false,
    noTrayIcon: true,
    disablePlaytimeSync: true
  })
  logWriter = {
    writeString: jest.fn().mockResolvedValue(undefined),
    logInfo: jest.fn().mockResolvedValue(undefined),
    logError: jest.fn().mockResolvedValue(undefined),
    logWarning: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  }
  ;(createGameLogWriter as jest.Mock).mockImplementation(() => {
    calls.push('logWriter')
    return Promise.resolve(logWriter)
  })
  checkWineMock.mockImplementation(() => {
    calls.push('checkWine')
    return Promise.resolve(true)
  })
  launchMock = jest.fn(() => {
    calls.push('launch')
    return Promise.resolve(true)
  })
  getGameMock.mockImplementation(() => ({
    getGameInfo: () => ({
      title: 'Quail',
      app_name: 'Quail',
      runner: 'legendary',
      install: {}
    }),
    getSettings: () => Promise.resolve(STORED),
    isNative: () => false,
    launch: launchMock
  }))
})

// The launcher is built from test deps (66.1-23): the manager table and hooks are plain fakes.
const tsStore = { has: () => true, get: () => 0, set: jest.fn() }
const slices = createTestToolsSlices()
const buildLauncher = (
  onlineMonitor: ReturnType<
    typeof createTestOnlineMonitor
  > = createTestOnlineMonitor({ online: false })
) =>
  createTsLaunchFunnel({
    ...slices,
    appState: { ...slices.appState, wakeLock },
    requestRustInvoke,
    onlineMonitor,
    libraryManagers: {
      legendary: { getGame: (...a: unknown[]) => getGameMock(...a) }
    } as never,
    launchHooks: { legendary: {} } as never,
    commandRunner: { runScriptForGame } as never,
    runner: { run: () => Promise.reject(new Error('unscripted run')) } as never,
    spawnAsync: (() => Promise.reject(new Error('unscripted spawn'))) as never,
    stores: { kvs: { tsStore }, wineManager: {}, runsForMe: {} } as never
  })
let launchEventCallback: ReturnType<typeof buildLauncher>

const run = () => launchEventCallback({ appName: 'Quail', runner: 'legendary' })

describe('launcher engine step (61-14, 87-52)', () => {
  it('runs the step once, after the log writer and before the Wine check, sending the launch facts', async () => {
    await run()
    expect(callsOn(RUST_ENGINE_LAUNCH_SELECT)).toHaveLength(1)
    expect(callsOn(RUST_ENGINE_LAUNCH_SELECT)[0]?.args).toEqual([
      {
        runner: 'legendary',
        appName: 'Quail',
        title: 'Quail',
        installPath: undefined,
        platform: undefined,
        isNative: false,
        settings: STORED,
        offline: true
      }
    ])
    expect(calls).toEqual(['logWriter', 'engineStep', 'checkWine', 'launch'])
  })

  it("'use': skips the Wine check, runs on the reply's settings, writes its log lines and releases after the launch", async () => {
    selectReply = {
      kind: 'use',
      key: KEY,
      selection: {},
      prefix: {},
      logLines: ['engine=crossover version=24.0', 'bottle=Quail'],
      launchSettings: OVERLAY
    }
    launchMock.mockImplementation(() => {
      calls.push('launch')
      expect(callsOn(RUST_ENGINE_LAUNCH_END)).toHaveLength(0)
      return Promise.resolve(true)
    })
    const result = await run()

    expect(result).toEqual({ status: 'done' })
    expect(checkWineMock).not.toHaveBeenCalled()
    // The reply's settings are the ones the after-launch script reads: the stored ones never are.
    expect(runScriptForGame).toHaveBeenCalledWith(
      expect.anything(),
      OVERLAY,
      'after',
      logWriter
    )
    expect(logWriter.logInfo).toHaveBeenCalledWith(
      'engine=crossover version=24.0'
    )
    expect(logWriter.logInfo).toHaveBeenCalledWith('bottle=Quail')
    expect(logInfo).toHaveBeenCalledWith(
      `Engine: ${KEY} engine=crossover version=24.0`,
      'Backend'
    )
    // The reply carried the settings, so there was no second call to read them.
    expect(callsOn(RUST_ENGINE_LAUNCH_SETTINGS_GET)).toHaveLength(0)
    expect(callsOn(RUST_ENGINE_LAUNCH_END)).toHaveLength(1)
    expect(callsOn(RUST_ENGINE_LAUNCH_END)[0]?.args).toEqual([{ key: KEY }])
  })

  it("'use': releases the selection when the launch throws", async () => {
    selectReply = {
      kind: 'use',
      key: KEY,
      selection: {},
      prefix: {},
      logLines: [],
      launchSettings: OVERLAY
    }
    launchMock.mockRejectedValue(new Error('boom'))
    const result = await run()

    expect(result).toEqual({ status: 'error' })
    expect(callsOn(RUST_ENGINE_LAUNCH_END)).toHaveLength(1)
    expect(callsOn(RUST_ENGINE_LAUNCH_END)[0]?.args).toEqual([{ key: KEY }])
  })

  it.each(['legacy', 'skip'])(
    "'%s': the Wine check runs as today, no overlay, no release",
    async (kind) => {
      selectReply =
        kind === 'skip' ? { kind } : { kind, key: KEY, logLines: [] }
      const result = await run()

      expect(result).toEqual({ status: 'done' })
      expect(checkWineMock).toHaveBeenCalledTimes(1)
      expect(runScriptForGame).not.toHaveBeenCalled()
      expect(callsOn(RUST_ENGINE_LAUNCH_END)).toHaveLength(0)
    }
  )

  it("'refused': reports done, closes the log, aborts, and never launches", async () => {
    selectReply = { kind: 'refused', key: KEY, logLines: ['refused'] }
    const result = await run()

    expect(result).toEqual({ status: 'abort' })
    expect(launchMock).not.toHaveBeenCalled()
    expect(checkWineMock).not.toHaveBeenCalled()
    expect(logWriter.close).toHaveBeenCalledTimes(1)
    expect(logWriter.logInfo).toHaveBeenCalledWith('refused')
    expect(callsOn(RUST_ENGINE_LAUNCH_END)).toHaveLength(0)
    expect(sendGameStatusUpdate).toHaveBeenCalledWith(expect.anything(), {
      appName: 'Quail',
      runner: 'legendary',
      status: 'done'
    })
  })

  it('a reply the crate never produces fails the launch instead of guessing an engine', async () => {
    selectReply = { kind: 'use', key: KEY, logLines: [] }
    await expect(run()).rejects.toThrow('engine_launch_select')
    expect(launchMock).not.toHaveBeenCalled()
  })
})

/**
 * 87-73 (RF2, D-06): every end of a launch after the display sleep blocker started ends it, clears the held id and
 * sends `done` once. Re-run 1 item 1 logged the launch start and the blocker and never their end: the refused path sent
 * `done` and left the blocker held, and the normal end stopped the blocker without clearing the id, so the next launch
 * saw an id and never started a fresh one.
 */
describe('the end of a launch releases the display sleep blocker (87-73, RF2)', () => {
  const doneFrames = () =>
    (sendGameStatusUpdate as jest.Mock).mock.calls.filter(
      (call) => call[1]?.status === 'done'
    )

  it("'refused': stops the blocker it started once, logs it once, sends done once", async () => {
    selectReply = { kind: 'refused', key: KEY, logLines: [] }
    const result = await run()

    expect(result).toEqual({ status: 'abort' })
    expect(wakeLock.start).toHaveBeenCalledTimes(1)
    expect(wakeLock.stop).toHaveBeenCalledTimes(1)
    expect(wakeLock.stop).toHaveBeenCalledWith(101)
    expect(blockerStops()).toHaveLength(1)
    expect(doneFrames()).toHaveLength(1)
  })

  it('after a refused launch the next launch starts a fresh blocker (the id was cleared)', async () => {
    selectReply = { kind: 'refused', key: KEY, logLines: [] }
    await run()
    selectReply = { kind: 'skip' }
    await run()

    expect(wakeLock.start).toHaveBeenCalledTimes(2)
    expect(wakeLock.stop.mock.calls).toEqual([[101], [102]])
  })

  it('a rejected engine step sends done, stops and clears the blocker, and rejects with the original error', async () => {
    const failure = new Error('engine_launch_select is down')
    selectError = failure
    await expect(run()).rejects.toBe(failure)

    expect(wakeLock.stop).toHaveBeenCalledTimes(1)
    expect(wakeLock.stop).toHaveBeenCalledWith(101)
    expect(blockerStops()).toHaveLength(1)
    expect(doneFrames()).toHaveLength(1)

    // The id is cleared: the next launch starts a blocker of its own.
    selectError = null
    await run()
    expect(wakeLock.start).toHaveBeenCalledTimes(2)
  })

  it('a failed Wine check stops and clears the blocker and sends done once', async () => {
    checkWineMock.mockImplementation(() => Promise.resolve(false))
    const result = await run()

    expect(result).toEqual({ status: 'error' })
    expect(wakeLock.stop).toHaveBeenCalledTimes(1)
    expect(wakeLock.stop).toHaveBeenCalledWith(101)
    expect(blockerStops()).toHaveLength(1)
    expect(doneFrames()).toHaveLength(1)

    checkWineMock.mockImplementation(() => Promise.resolve(true))
    await run()
    expect(wakeLock.start).toHaveBeenCalledTimes(2)
  })

  it('a normal launch stops the blocker once at its end and clears the id', async () => {
    const result = await run()

    expect(result).toEqual({ status: 'done' })
    expect(wakeLock.start).toHaveBeenCalledTimes(1)
    expect(wakeLock.stop).toHaveBeenCalledTimes(1)
    expect(wakeLock.stop).toHaveBeenCalledWith(101)
    expect(blockerStops()).toHaveLength(1)

    await run()
    expect(wakeLock.start).toHaveBeenCalledTimes(2)
    expect(wakeLock.stop).toHaveBeenLastCalledWith(102)
  })
})

/**
 * 87-63 (F1): the request's `offline` is the monitor's answer at the moment the request is built, on every Play path.
 * The 87-59 gate saw the monitor in `check-online` (a fresh check found no interface and handed the decision back to the
 * ping loop, which then failed on every host) and expected the Rust gate's `(offline)` refusal. `check-online` is
 * unknown, which reads as not online; only `online` reads as online. The Rust crate refuses on this flag
 * (`offline_refusal.rs`), so a request that lost it would reach the download.
 */
describe('launcher engine step request: the offline flag (87-63, F1)', () => {
  const sentOffline = () =>
    (callsOn(RUST_ENGINE_LAUNCH_SELECT)[0]?.args[0] as { offline: boolean })
      .offline

  it.each([
    ['offline', true],
    ['check-online', true],
    ['online', false]
  ] as const)(
    'with the monitor in %s the request says offline: %s',
    async (status, offline) => {
      const monitor = createTestOnlineMonitor()
      monitor.setStatus(status)
      const play = buildLauncher(monitor)
      await play({ appName: 'Quail', runner: 'legendary' })
      expect(callsOn(RUST_ENGINE_LAUNCH_SELECT)).toHaveLength(1)
      expect(sentOffline()).toBe(offline)
    }
  )

  it('reads the monitor when the request is built, not when Play was pressed (the Epic offline prompt path)', async () => {
    // The renderer's "might not work offline" prompt (and the launch's own awaits) sit between the press and the
    // request. The Wi-Fi went off in that window: the periodic watch moved the monitor to check-online while the
    // launch was reading the game's settings, so the request must say offline.
    const monitor = createTestOnlineMonitor()
    expect(monitor.isOnline()).toBe(true)
    getGameMock.mockImplementation(() => ({
      getGameInfo: () => ({
        title: 'Quail',
        app_name: 'Quail',
        runner: 'legendary',
        install: {}
      }),
      getSettings: () => {
        monitor.setStatus('check-online')
        return Promise.resolve(STORED)
      },
      isNative: () => false,
      launch: launchMock
    }))
    const play = buildLauncher(monitor)
    await play({ appName: 'Quail', runner: 'legendary' })
    expect(sentOffline()).toBe(true)
  })

  it('a second Play after the network comes back says online again (the flag is never latched)', async () => {
    const monitor = createTestOnlineMonitor({ online: false })
    const play = buildLauncher(monitor)
    await play({ appName: 'Quail', runner: 'legendary' })
    monitor.setOnline(true)
    await play({ appName: 'Quail', runner: 'legendary' })
    const sent = callsOn(RUST_ENGINE_LAUNCH_SELECT).map(
      (call) => (call.args[0] as { offline: boolean }).offline
    )
    expect(sent).toEqual([true, false])
  })
})

describe('launcher deadline arming position (61-16)', () => {
  it('the arm moved into Rust with the wine prepare step: launcher.ts holds no arm call and the adapter ends with one finish call', () => {
    // 88.1-13 and 88.1-15: `launch_prepare_wine_finish` arms the deadline after the known-fix overlay env (its replay
    // pins the order), so the launcher and its adapter never call `armEngineLaunchDeadline`.
    const launcher = readFileSync(join(__dirname, '..', 'launcher.ts'), 'utf-8')
    const adapters = readFileSync(
      join(__dirname, '..', 'launchAdapters.ts'),
      'utf-8'
    )
    expect(launcher).not.toContain('armEngineLaunchDeadline(')
    expect(adapters).not.toContain('armEngineLaunchDeadline(')
    expect(adapters.split('prepareWineLaunchFinish(').length - 1).toBe(1)
  })
})
