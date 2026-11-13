import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
/**
 * Quick 261029-ji2: pending-adoption record, Play decision and the graceful
 * quit-wait-relaunch driver. Driven through injected deps (fake clock advanced
 * by `sleep`); no fs, no spawn, no real timers. The pgrep probe runs on a scripted runner.
 */
jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
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
  readAcfSnapshot,
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
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
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

describe('readAcfSnapshot and isSteamAdoptedAcf on the rust flag', () => {
  const realEnv = process.env.GAMELIB_STEAMFILES_TEXT
  let dir: string
  beforeEach(() => {
    process.env.GAMELIB_STEAMFILES_TEXT = 'rust'
    dir = mkdtempSync(join(tmpdir(), 'adoption-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (realEnv === undefined) delete process.env.GAMELIB_STEAMFILES_TEXT
    else process.env.GAMELIB_STEAMFILES_TEXT = realEnv
  })

  const stubRecord = (stateFlags: number | null, buildid: string | null) =>
    stubRustSteamFiles({
      steamfiles_read_acf: () => ({
        exists: true,
        parsed: stateFlags !== null,
        readError: null,
        record: (stateFlags === null ? null : { stateFlags, buildid }) as never
      })
    })

  function writeAcf(): string {
    const path = join(dir, 'appmanifest_1.acf')
    writeFileSync(path, 'raw-content-the-ts-side-never-parses')
    return path
  }

  test('snapshot keeps raw content and mtime and adds the Rust-parsed fields', async () => {
    const snap = await readAcfSnapshot(stubRecord(4, '9044149'), writeAcf())
    expect(snap).toMatchObject({
      content: 'raw-content-the-ts-side-never-parses',
      stateFlags: 4,
      buildid: '9044149'
    })
    expect(typeof snap?.mtimeMs).toBe('number')
  })

  test('null when the file is missing', async () => {
    await expect(
      readAcfSnapshot(stubRecord(4, '1'), join(dir, 'nope.acf'))
    ).resolves.toBeNull()
  })

  test('a rejecting transport yields a snapshot that is never adopted', async () => {
    const snap = await readAcfSnapshot(stubRustSteamFiles({}), writeAcf())
    expect(snap?.stateFlags).toBeNull()
    expect(isSteamAdoptedAcf(null, snap)).toBe(false)
  })

  test('null baseline + installed, unchanged content, and placeholder 1026/buildid 0', async () => {
    const path = writeAcf()
    const installed = (await readAcfSnapshot(stubRecord(4, '9044149'), path))!
    expect(isSteamAdoptedAcf(null, installed)).toBe(true)
    expect(isSteamAdoptedAcf(installed, { ...installed })).toBe(false)
    expect(isSteamAdoptedAcf(installed, { ...installed, mtimeMs: 1 })).toBe(
      true
    )
    const placeholder = (await readAcfSnapshot(stubRecord(1026, '0'), path))!
    expect(isSteamAdoptedAcf(null, placeholder)).toBe(false)
  })

  test('uses the Rust fields, not the content, when they are present', async () => {
    const snap = { mtimeMs: 2, content: 'garbage', stateFlags: 4, buildid: '5' }
    expect(isSteamAdoptedAcf(null, snap)).toBe(true)
  })

  test('a persisted pre-Phase-75 baseline (content + mtimeMs only) still validates', () => {
    const store = new Map<string, unknown>([
      [
        '1',
        {
          steamPid: 7,
          manifestPath: '/m',
          baseline: { mtimeMs: 1, content: 'x' },
          recordedAt: 3
        }
      ]
    ])
    const fake: PendingAdoptionStore = {
      get: (k) => store.get(k),
      set: () => undefined,
      delete: () => undefined
    }
    expect(readPendingAdoption('1', fake)?.baseline).toEqual({
      mtimeMs: 1,
      content: 'x'
    })
  })
})
