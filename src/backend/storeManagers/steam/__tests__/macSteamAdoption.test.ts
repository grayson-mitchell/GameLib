/**
 * Quick 261029-ji2: pending-adoption record, Play decision and the graceful
 * quit-wait-relaunch driver. Driven through injected deps (fake clock advanced
 * by `sleep`); no fs, no spawn, no real timers. The pgrep probe runs on a scripted runner.
 */
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))
jest.mock('../macSteamOffline', () => ({
  MAC_STEAM_OFFLINE_OWED_FILE: 'mac-steam-offline-owed.json'
}))

import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import {
  isSteamAdoptedAcf,
  decidePlayAdoption,
  restartMacSteamForAdoption,
  probeMacSteamPid,
  createRestartDeps,
  recordPendingAdoption,
  readPendingAdoption,
  clearPendingAdoption,
  RESTART_QUIT_TIMEOUT_MS,
  type AcfSnapshot,
  type PendingAdoptionRecord,
  type PendingAdoptionStore,
  type RestartDeps
} from '../macSteamAdoption'
import { at } from './fixtures/indexed'
import { createFakeClock } from 'backend/testUtils/fakeClock'
import {
  createScriptedRunner,
  type ScriptStep
} from 'backend/testUtils/scriptedRunner'

function acf(fields: Record<string, string>, mtimeMs = 1000): AcfSnapshot {
  const body = Object.entries({ appid: '264160', ...fields })
    .map(([k, v]) => `\t"${k}"\t\t"${v}"`)
    .join('\n')
  return { mtimeMs, content: `"AppState"\n{\n${body}\n}\n` }
}

const own = acf({ StateFlags: '4', buildid: '9044149' })

describe('isSteamAdoptedAcf', () => {
  test('no baseline + Steam-written StateFlags 4 + numeric buildid', () => {
    expect(
      isSteamAdoptedAcf(null, acf({ StateFlags: '4', buildid: '9044149' }))
    ).toBe(true)
  })
  test('identical content and mtime to the baseline is not adopted', () => {
    expect(isSteamAdoptedAcf(own, own)).toBe(false)
  })
  test('differs but StateFlags 2 placeholder is not adopted', () => {
    expect(
      isSteamAdoptedAcf(own, acf({ StateFlags: '2', buildid: '0' }, 2000))
    ).toBe(false)
  })
  test('differs, bit 4, buildid 0 is not adopted', () => {
    expect(
      isSteamAdoptedAcf(own, acf({ StateFlags: '4', buildid: '0' }, 2000))
    ).toBe(false)
  })
  test('differs, StateFlags 4, buildid string is adopted', () => {
    expect(
      isSteamAdoptedAcf(own, acf({ StateFlags: '4', buildid: '9044150' }, 2000))
    ).toBe(true)
  })
  test('no current ACF is not adopted', () => {
    expect(isSteamAdoptedAcf(own, null)).toBe(false)
  })
})

describe('decidePlayAdoption', () => {
  const record: PendingAdoptionRecord = {
    steamPid: 100,
    manifestPath: '/steam/appmanifest_264160.acf',
    baseline: own,
    recordedAt: 1
  }
  test('no record launches normally', () => {
    expect(
      decidePlayAdoption({
        record: undefined,
        currentPid: 100,
        currentAcf: own
      })
    ).toBe('launch')
  })
  test('Steam not running clears and launches', () => {
    expect(
      decidePlayAdoption({ record, currentPid: null, currentAcf: own })
    ).toBe('clear-and-launch')
  })
  test('a different PID clears and launches', () => {
    expect(
      decidePlayAdoption({ record, currentPid: 200, currentAcf: own })
    ).toBe('clear-and-launch')
  })
  test('same PID and an ACF Steam already rewrote clears and launches', () => {
    expect(
      decidePlayAdoption({
        record,
        currentPid: 100,
        currentAcf: acf({ StateFlags: '4', buildid: '9044150' }, 2000)
      })
    ).toBe('clear-and-launch')
  })
  test('same PID and unadopted ACF restarts', () => {
    expect(
      decidePlayAdoption({ record, currentPid: 100, currentAcf: own })
    ).toBe('restart')
  })
})

describe('restartMacSteamForAdoption', () => {
  function harness(overrides: Partial<RestartDeps> = {}) {
    let clock = 0
    const calls: string[] = []
    const deps: RestartDeps = {
      readRunningAppId: jest.fn(async () => 0),
      isOfflineWrapOwed: jest.fn(() => false),
      isSteamRunning: jest.fn(async () => false),
      openUrlDetached: jest.fn((url: string) => {
        calls.push(`open:${url}`)
      }),
      launchRunGameId: jest.fn(async () => {
        calls.push('launch')
      }),
      emitStatus: jest.fn(() => {
        calls.push('emit')
      }),
      emitDone: jest.fn(() => {
        calls.push('done')
      }),
      sleep: jest.fn(async (ms: number) => {
        clock += ms
      }),
      now: () => clock,
      ...overrides
    }
    return { deps, calls }
  }

  test('a game running in Steam refuses, firing and emitting nothing', async () => {
    const { deps } = harness({ readRunningAppId: jest.fn(async () => 4000) })
    await expect(restartMacSteamForAdoption('264160', deps)).resolves.toEqual({
      kind: 'game-running',
      runningAppId: 4000
    })
    expect(deps.openUrlDetached).not.toHaveBeenCalled()
    expect(deps.emitStatus).not.toHaveBeenCalled()
    expect(deps.emitDone).not.toHaveBeenCalled()
    expect(deps.launchRunGameId).not.toHaveBeenCalled()
  })

  test('a go-offline wrap owed refuses as steam-busy', async () => {
    const { deps } = harness({ isOfflineWrapOwed: jest.fn(() => true) })
    await expect(restartMacSteamForAdoption('264160', deps)).resolves.toEqual({
      kind: 'steam-busy'
    })
    expect(deps.openUrlDetached).not.toHaveBeenCalled()
    expect(deps.emitStatus).not.toHaveBeenCalled()
    expect(deps.emitDone).not.toHaveBeenCalled()
  })

  test('happy path: emit once, steam://exit once, poll to exit, then launch', async () => {
    let polls = 0
    const { deps, calls } = harness({
      isSteamRunning: jest.fn(async () => ++polls < 3)
    })
    await expect(restartMacSteamForAdoption('264160', deps)).resolves.toEqual({
      kind: 'relaunched'
    })
    expect(deps.emitStatus).toHaveBeenCalledTimes(1)
    expect(deps.openUrlDetached).toHaveBeenCalledTimes(1)
    expect(deps.openUrlDetached).toHaveBeenCalledWith('steam://exit')
    expect(deps.launchRunGameId).toHaveBeenCalledTimes(1)
    expect(polls).toBe(3)
    expect(calls).toEqual(['emit', 'open:steam://exit', 'launch', 'done'])
    expect(deps.emitDone).toHaveBeenCalledTimes(1)
    expect(deps.emitDone).toHaveBeenCalledWith('264160')
    expect(
      at((deps.emitDone as jest.Mock).mock.invocationCallOrder, 0)
    ).toBeGreaterThan(
      at((deps.launchRunGameId as jest.Mock).mock.invocationCallOrder, 0)
    )
  })

  test('launchRunGameId rejecting still emits done once and propagates', async () => {
    const { deps } = harness({
      launchRunGameId: jest.fn(async () => {
        throw new Error('open failed')
      })
    })
    await expect(restartMacSteamForAdoption('264160', deps)).rejects.toThrow(
      'open failed'
    )
    expect(deps.emitDone).toHaveBeenCalledTimes(1)
  })

  test('Steam never exits: quit-timeout, no relaunch, exit fired once', async () => {
    const { deps } = harness({ isSteamRunning: jest.fn(async () => true) })
    await expect(restartMacSteamForAdoption('264160', deps)).resolves.toEqual({
      kind: 'quit-timeout'
    })
    expect(deps.launchRunGameId).not.toHaveBeenCalled()
    expect(deps.emitDone).toHaveBeenCalledTimes(1)
    expect(deps.openUrlDetached).toHaveBeenCalledTimes(1)
    const slept = (deps.sleep as jest.Mock).mock.calls.reduce(
      (n, [ms]) => n + (ms as number),
      0
    )
    expect(slept).toBeGreaterThanOrEqual(RESTART_QUIT_TIMEOUT_MS)
  })

  test('a rejecting isSteamRunning counts as still running until timeout', async () => {
    const { deps } = harness({
      isSteamRunning: jest.fn(async () => {
        throw new Error('pgrep failed')
      })
    })
    await expect(restartMacSteamForAdoption('264160', deps)).resolves.toEqual({
      kind: 'quit-timeout'
    })
    expect(deps.launchRunGameId).not.toHaveBeenCalled()
  })
})

describe('pending-adoption record store', () => {
  function fakeStore(): PendingAdoptionStore & { map: Map<string, unknown> } {
    const map = new Map<string, unknown>()
    return {
      map,
      get: (k) => map.get(k),
      set: (k, v) => {
        map.set(k, v)
      },
      delete: (k) => {
        map.delete(k)
      }
    }
  }
  const record: PendingAdoptionRecord = {
    steamPid: 4321,
    manifestPath: '/steam/appmanifest_264160.acf',
    baseline: own,
    recordedAt: 99
  }

  test('round-trips and clears', () => {
    const store = fakeStore()
    recordPendingAdoption('264160', record, store)
    expect(readPendingAdoption('264160', store)).toEqual(record)
    clearPendingAdoption('264160', store)
    expect(readPendingAdoption('264160', store)).toBeUndefined()
  })

  test.each([
    ['string', 'nope'],
    ['bad pid', { ...record, steamPid: -1 }],
    ['float pid', { ...record, steamPid: 1.5 }],
    ['no path', { ...record, manifestPath: 7 }],
    ['no baseline', { ...record, baseline: null }],
    [
      'bad baseline content',
      { ...record, baseline: { mtimeMs: 1, content: 5 } }
    ]
  ])('malformed value (%s) reads as undefined, never throws', (_n, value) => {
    const store = fakeStore()
    store.map.set('264160', value)
    expect(readPendingAdoption('264160', store)).toBeUndefined()
  })
})

describe('probeMacSteamPid', () => {
  const pgrep = (result: ScriptStep['result']): ScriptStep => ({
    cmd: '/usr/bin/pgrep',
    argv: ['-x', 'steam_osx'],
    result
  })

  test('runs pgrep under a fake-HOME env, empty stdin and a 2 s bound, and returns the lowest PID', async () => {
    const runner = createScriptedRunner([
      pgrep({ code: 0, stdout: '812\n77\n' })
    ])
    await expect(probeMacSteamPid({ runner })).resolves.toBe(77)
    const call = runner.calls[0]
    expect(call?.opts).toMatchObject({
      replaceEnv: true,
      stdin: '',
      timeoutMs: 2000
    })
    expect(call?.env?.HOME).toBeDefined()
  })

  test('exit 1 means Steam is not running', async () => {
    const runner = createScriptedRunner([pgrep({ code: 1 })])
    await expect(probeMacSteamPid({ runner })).resolves.toBeNull()
  })

  test('a timeout, another exit code or a spawn error rejects', async () => {
    await expect(
      probeMacSteamPid({
        runner: createScriptedRunner([pgrep({ code: null, timedOut: true })])
      })
    ).rejects.toThrow('timed out')
    await expect(
      probeMacSteamPid({ runner: createScriptedRunner([pgrep({ code: 2 })]) })
    ).rejects.toThrow()
    await expect(
      probeMacSteamPid({
        runner: createScriptedRunner([
          { cmd: '/usr/bin/pgrep', error: { code: 'ENOENT' } }
        ])
      })
    ).rejects.toThrow()
  })
})

describe('createRestartDeps', () => {
  test('timers and now come from the clock; the probe and open come from the instance', async () => {
    const clock = createFakeClock(5000)
    const isSteamRunning = jest.fn().mockResolvedValue(false)
    const openUrlDetached = jest.fn()
    const deps = createRestartDeps({
      requestRustInvoke: () => Promise.reject(new Error('not used')),
      sendFrontendMessage: jest.fn(),
      appRuntime: createTestAppRuntime(),
      clock,
      paths: { appFolder: '/test/appFolder', userHome: '/test/home' },
      macSteamOffline: { isSteamRunning, openUrlDetached },
      launchRunGameId: () => Promise.resolve()
    })
    expect(deps.now()).toBe(5000)
    let slept = false
    void deps.sleep(500).then(() => {
      slept = true
    })
    clock.advance(499)
    await Promise.resolve()
    expect(slept).toBe(false)
    clock.advance(1)
    await Promise.resolve()
    expect(slept).toBe(true)
    deps.openUrlDetached('steam://exit')
    expect(openUrlDetached).toHaveBeenCalledWith('steam://exit')
    await expect(deps.isSteamRunning()).resolves.toBe(false)
  })
})
