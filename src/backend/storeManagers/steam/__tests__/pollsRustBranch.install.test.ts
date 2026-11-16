import * as logger from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import {
  invokeSteamPoll,
  pollRootsFor,
  titleFor
} from '../pollRust/rustSteamPoll'
import {
  startInstallPolling,
  isDelegatedInstallPolling,
  cancelDelegatedInstall
} from '../library/installPolling'
import { stopInstallPolling } from '../library/installStop'

beforeEach(() => {
  jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logInfo').mockImplementation(() => undefined)
})
afterEach(() => jest.restoreAllMocks())

type Call = { channel: string; args: unknown[] }

function makeDeps(result: unknown = null) {
  const calls: Call[] = []
  const send = jest.fn()
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
    steamSession: {
      libraryState: { library: new Map([['10', { title: 'Ten' }]]) }
    },
    steamInstallRuntime: { polls: { activePolls: new Map() } },
    steamProcesses: { downloadMonitor: { stop: jest.fn() } },
    sendFrontendMessage: send
  } as unknown as ManagerDeps
  return { deps, calls, send }
}

describe('wrapper', () => {
  it('forwards channel and one args object, and propagates a rejection', async () => {
    const { deps, calls } = makeDeps()
    await invokeSteamPoll(deps, 'steampoll_status', {})
    expect(calls).toEqual([{ channel: 'steampoll_status', args: [{}] }])
    const rejecting = {
      requestRustInvoke: () => Promise.reject(new Error('boom'))
    }
    await expect(
      invokeSteamPoll(rejecting, 'steampoll_status', {})
    ).rejects.toThrow('boom')
  })

  it('resolves roots and title', () => {
    const { deps } = makeDeps()
    const roots = pollRootsFor(deps, '10', 'bottle')
    expect(roots.steamRoot).toBe('/steam')
    expect(roots.bottleSteamappsRoot).toEqual(
      expect.stringContaining('steamapps')
    )
    expect(titleFor(deps, '10')).toBe('Ten')
    expect(titleFor(deps, '11')).toBe('')
  })
})

describe('rust branch', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('start sends steampoll_install_start and creates no TS timer', async () => {
    const { deps, calls } = makeDeps()
    await startInstallPolling(deps, '10', { delegatedToSteamClient: true })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.channel).toBe('steampoll_install_start')
    expect(calls[0]?.args[0]).toMatchObject({
      appId: '10',
      title: 'Ten',
      roots: { steamRoot: '/steam' },
      options: { delegatedToSteamClient: true }
    })
    expect(jest.getTimerCount()).toBe(0)
    expect(deps.steamInstallRuntime.polls.activePolls.size).toBe(0)
  })

  it('a bare number option sends empty options', async () => {
    const { deps, calls } = makeDeps()
    await startInstallPolling(deps, '10', 1000)
    expect((calls[0]?.args[0] as { options: unknown }).options).toEqual({})
  })

  it('stop sends steampoll_install_stop', async () => {
    const { deps, calls } = makeDeps()
    await stopInstallPolling(deps, '10')
    expect(calls).toEqual([
      { channel: 'steampoll_install_stop', args: [{ appId: '10' }] }
    ])
  })

  it('isDelegatedInstallPolling reads steampoll_status', async () => {
    const status = {
      installs: [
        { appId: '10', delegatedToSteamClient: true },
        { appId: '11', delegatedToSteamClient: false }
      ],
      uninstalls: [],
      holding: []
    }
    const { deps, calls } = makeDeps(status)
    expect(await isDelegatedInstallPolling(deps, '10')).toBe(true)
    expect(await isDelegatedInstallPolling(deps, '11')).toBe(false)
    expect(await isDelegatedInstallPolling(deps, '12')).toBe(false)
    expect(calls[0]?.channel).toBe('steampoll_status')
  })

  it('cancelDelegatedInstall returns the Rust boolean and sends no TS status', async () => {
    const { deps, calls, send } = makeDeps(true)
    expect(await cancelDelegatedInstall(deps, '10')).toBe(true)
    expect(calls).toEqual([
      {
        channel: 'steampoll_install_cancel_delegated',
        args: [{ appId: '10' }]
      }
    ])
    expect(send).not.toHaveBeenCalled()
  })
})
