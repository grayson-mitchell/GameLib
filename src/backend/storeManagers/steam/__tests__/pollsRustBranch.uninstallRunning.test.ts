import * as logger from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import {
  startUninstallPolling,
  stopUninstallPolling
} from '../library/uninstallPolling'
import { noticeSeq } from '../gameUninstall'
import {
  readMacRunningAppId,
  readRunningAppId,
  readRunningAppIdOrThrow,
  type RunningPollProbeDeps
} from '../library/runningPoll'
import { steamLaunchWatchDeps } from '../steamLaunchedDeps'

const FLAG = 'GAMELIB_STEAM_POLLS'

beforeEach(() => {
  jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logInfo').mockImplementation(() => undefined)
})
afterEach(() => jest.restoreAllMocks())

type Call = { channel: string; args: unknown[] }

function makeDeps(result: unknown = null) {
  const calls: Call[] = []
  const deps = {
    requestRustInvoke: jest.fn((channel: string, args: unknown[]) => {
      calls.push({ channel, args })
      return Promise.resolve(result)
    }),
    config: { getSettings: () => ({ defaultSteamPath: "'/steam'" }) },
    paths: { userHome: '/home/u' },
    steamBottle: {
      getSteamBottleSettings: () => ({ wineCrossoverBottle: 'GameLibSteam' })
    },
    stores: { steam: { steamMetadataStore: { get: () => undefined } } },
    libraryManagers: { steam: { launchWatches: new Map() } },
    steamSession: {
      libraryState: { library: new Map([['10', { title: 'Ten' }]]) }
    },
    steamInstallRuntime: {
      uninstallPolls: { activeUninstallPolls: new Map() },
      polls: { nextSteamRequestNoticeSeq: jest.fn(() => 7) }
    }
  } as unknown as ManagerDeps
  return { deps, calls }
}

describe('uninstall API', () => {
  let prev: string | undefined
  beforeEach(() => {
    prev = process.env[FLAG]
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
    if (prev === undefined) delete process.env[FLAG]
    else process.env[FLAG] = prev
  })

  it('rust: start sends steampoll_uninstall_start and creates no TS timer', async () => {
    process.env[FLAG] = 'rust'
    const { deps, calls } = makeDeps()
    await startUninstallPolling(deps, '10', { source: 'native' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.channel).toBe('steampoll_uninstall_start')
    expect(calls[0]?.args[0]).toMatchObject({
      appId: '10',
      title: 'Ten',
      roots: { steamRoot: '/steam' },
      source: 'native',
      intervalMs: 3000,
      bridgeAuthoritative: false
    })
    expect(jest.getTimerCount()).toBe(0)
    expect(
      deps.steamInstallRuntime.uninstallPolls.activeUninstallPolls.size
    ).toBe(0)
  })

  it('rust: a bare number is the interval', async () => {
    process.env[FLAG] = 'rust'
    const { deps, calls } = makeDeps()
    await startUninstallPolling(deps, '10', 500)
    expect(calls[0]?.args[0]).toMatchObject({
      intervalMs: 500,
      source: 'native'
    })
  })

  it('rust: stop sends steampoll_uninstall_stop', async () => {
    process.env[FLAG] = 'rust'
    const { deps, calls } = makeDeps()
    await stopUninstallPolling(deps, '10')
    expect(calls).toEqual([
      { channel: 'steampoll_uninstall_stop', args: [{ appId: '10' }] }
    ])
  })

  it('rust: the notice seq comes from steampoll_next_notice_seq', async () => {
    process.env[FLAG] = 'rust'
    const { deps, calls } = makeDeps(42)
    expect(await noticeSeq({ deps } as never)).toBe(42)
    expect(calls[0]?.channel).toBe('steampoll_next_notice_seq')
    expect(
      deps.steamInstallRuntime.polls.nextSteamRequestNoticeSeq
    ).not.toHaveBeenCalled()
  })

  it('ts: sends nothing to Rust and uses the local seq', async () => {
    delete process.env[FLAG]
    const { deps, calls } = makeDeps()
    expect(await noticeSeq({ deps } as never)).toBe(7)
    await stopUninstallPolling(deps, '10')
    await startUninstallPolling(deps, '10', 1000)
    expect(calls).toEqual([])
    expect(
      deps.steamInstallRuntime.uninstallPolls.activeUninstallPolls.size
    ).toBe(1)
    await stopUninstallPolling(deps, '10')
  })
})

describe('running probe and poll', () => {
  let prev: string | undefined
  beforeEach(() => {
    prev = process.env[FLAG]
  })
  afterEach(() => {
    if (prev === undefined) delete process.env[FLAG]
    else process.env[FLAG] = prev
  })

  function probeDeps(impl: (channel: string, args: unknown[]) => unknown) {
    const calls: Call[] = []
    const run = jest.fn()
    const deps = {
      requestRustInvoke: jest.fn((channel: string, args: unknown[]) => {
        calls.push({ channel, args })
        return Promise.resolve().then(() => impl(channel, args))
      }),
      runner: { run },
      paths: { userHome: '/home/u' }
    } as unknown as RunningPollProbeDeps
    return { deps, calls, run }
  }

  it('rust: the three readers forward strict and never spawn', async () => {
    process.env[FLAG] = 'rust'
    const { deps, calls, run } = probeDeps(() => 440)
    expect(await readRunningAppId(deps, 'win32')).toBe(440)
    expect(await readRunningAppIdOrThrow(deps, 'win32')).toBe(440)
    expect(await readMacRunningAppId(deps)).toBe(440)
    expect(calls.map((c) => c.channel)).toEqual([
      'steampoll_read_running_app_id',
      'steampoll_read_running_app_id',
      'steampoll_read_running_app_id'
    ])
    expect(calls.map((c) => c.args[0])).toEqual([
      { strict: false },
      { strict: true },
      { strict: false }
    ])
    expect(run).not.toHaveBeenCalled()
  })

  it('rust: a rejection is 0 non-strict and rejects strict', async () => {
    process.env[FLAG] = 'rust'
    const { deps } = probeDeps(() => {
      throw new Error('boom')
    })
    expect(await readRunningAppId(deps, 'darwin')).toBe(0)
    await expect(readRunningAppIdOrThrow(deps, 'darwin')).rejects.toThrow(
      'boom'
    )
  })

  it('rust: pollerHold claims once and releases once with the claim id', async () => {
    process.env[FLAG] = 'rust'
    const { deps, calls } = makeDeps(5)
    const watch = steamLaunchWatchDeps(deps)
    const release = watch.pollerHold('10')
    release(true)
    release(false)
    await new Promise((r) => setImmediate(r))
    expect(calls).toEqual([
      { channel: 'steampoll_running_hold', args: [{ appId: 10 }] },
      {
        channel: 'steampoll_running_release',
        args: [{ claimId: 5, terminalSent: true }]
      }
    ])
  })

  it('rust: pollerReports reads steampoll_running_last_app_id', async () => {
    process.env[FLAG] = 'rust'
    const { deps, calls } = makeDeps(10)
    const watch = steamLaunchWatchDeps(deps)
    expect(await watch.pollerReports('10')).toBe(true)
    expect(await watch.pollerReports('11')).toBe(false)
    expect(calls[0]).toEqual({
      channel: 'steampoll_running_last_app_id',
      args: []
    })
  })

  it('ts: the readers do not call steampoll', async () => {
    delete process.env[FLAG]
    const { deps, calls } = probeDeps(() => ({ runningAppId: 0 }))
    await readMacRunningAppId(deps)
    expect(calls.map((c) => c.channel)).not.toContain(
      'steampoll_read_running_app_id'
    )
  })
})
