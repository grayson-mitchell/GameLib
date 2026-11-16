import * as logger from 'backend/logger'
import { createSteamRestartHold } from '../library/restartHold'
import { createSteamGameSessionState } from '../gameSessionState'
import { pollOwnsUpdate } from '../updateNative'
import type SteamGame from '../games'

const FLAG = 'GAMELIB_STEAM_POLLS'

type Call = { channel: string; args: unknown[] }

function fakeRust(result: unknown = null, reject = false) {
  const calls: Call[] = []
  const requestRustInvoke = jest.fn((channel: string, args: unknown[]) => {
    calls.push({ channel, args })
    return reject ? Promise.reject(new Error('boom')) : Promise.resolve(result)
  })
  return { calls, requestRustInvoke }
}

let prev: string | undefined
beforeEach(() => {
  prev = process.env[FLAG]
  jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logWarning').mockImplementation(() => undefined)
})
afterEach(() => {
  if (prev === undefined) delete process.env[FLAG]
  else process.env[FLAG] = prev
  jest.restoreAllMocks()
})

const status = {
  installs: [
    {
      appId: '5',
      delegatedToSteamClient: false,
      awaitingUpdate: true,
      steamHold: 'holding'
    },
    {
      appId: '6',
      delegatedToSteamClient: false,
      awaitingUpdate: false,
      steamHold: 'unprobed'
    }
  ],
  uninstalls: [],
  holding: ['5', '7']
}

describe('status readers', () => {
  it('rust: withoutSteamRestartHolds drops status.holding (incl. pending rearm) with one call', async () => {
    process.env[FLAG] = 'rust'
    const { calls, requestRustInvoke } = fakeRust(status)
    const hold = createSteamRestartHold({
      polls: { activePolls: new Map() },
      requestRustInvoke
    })
    const out = await hold.withoutSteamRestartHolds(
      new Map<number, string>([
        [5, 'a'],
        [6, 'b'],
        [7, 'c'],
        [8, 'd']
      ])
    )
    expect([...out.keys()]).toEqual([6, 8])
    expect(calls).toEqual([{ channel: 'steampoll_status', args: [{}] }])
  })

  it('ts: withoutSteamRestartHolds reads local polls and never calls Rust', async () => {
    process.env[FLAG] = 'ts'
    const { calls, requestRustInvoke } = fakeRust(status)
    const activePolls = new Map([['5', { steamHold: 'holding' }]])
    const hold = createSteamRestartHold({
      polls: { activePolls: activePolls as never },
      requestRustInvoke
    })
    hold.pendingSteamHoldRearm.add('7')
    const out = await hold.withoutSteamRestartHolds(
      new Map<number, string>([
        [5, 'a'],
        [6, 'b'],
        [7, 'c']
      ])
    )
    expect([...out.keys()]).toEqual([6])
    expect(calls).toEqual([])
  })

  it('rust: pollOwnsUpdate reads installs[appId].awaitingUpdate', async () => {
    process.env[FLAG] = 'rust'
    const { requestRustInvoke } = fakeRust(status)
    const deps = {
      requestRustInvoke,
      steamInstallRuntime: { polls: { activePolls: new Map() } }
    } as unknown as SteamGame['deps']
    expect(await pollOwnsUpdate(deps, '5')).toBe(true)
    expect(await pollOwnsUpdate(deps, '6')).toBe(false)
    expect(await pollOwnsUpdate(deps, '9')).toBe(false)
  })

  it('ts: pollOwnsUpdate reads the local registry', async () => {
    process.env[FLAG] = 'ts'
    const { calls, requestRustInvoke } = fakeRust(status)
    const deps = {
      requestRustInvoke,
      steamInstallRuntime: {
        polls: { activePolls: new Map([['5', { awaitingUpdate: {} }]]) }
      }
    } as unknown as SteamGame['deps']
    expect(await pollOwnsUpdate(deps, '5')).toBe(true)
    expect(await pollOwnsUpdate(deps, '6')).toBe(false)
    expect(calls).toEqual([])
  })
})

describe('native in-flight mirror', () => {
  const entry = {} as never

  it('rust: pushes new keys and present-key deletes only', () => {
    process.env[FLAG] = 'rust'
    const { calls, requestRustInvoke } = fakeRust()
    const s = createSteamGameSessionState({ requestRustInvoke })
    s.nativeInstallsInFlight.set('1', entry)
    s.nativeInstallsInFlight.set('1', entry)
    s.nativeInstallsInFlight.delete('2')
    s.nativeInstallsInFlight.delete('1')
    expect(calls).toEqual([
      {
        channel: 'steampoll_native_in_flight',
        args: [{ appId: '1', inFlight: true }]
      },
      {
        channel: 'steampoll_native_in_flight',
        args: [{ appId: '1', inFlight: false }]
      }
    ])
    expect(s.isNativeInstallInFlight('1')).toBe(false)
  })

  it('rust: a rejected push is logged with the channel and appId, not thrown', async () => {
    process.env[FLAG] = 'rust'
    const { requestRustInvoke } = fakeRust(null, true)
    const s = createSteamGameSessionState({ requestRustInvoke })
    s.nativeInstallsInFlight.set('9', entry)
    await new Promise((r) => setImmediate(r))
    expect(logger.logWarning).toHaveBeenCalledWith(
      [
        expect.stringContaining('steampoll_native_in_flight, appId 9'),
        expect.anything()
      ],
      expect.anything()
    )
  })

  it('ts: no sends and the Map API is unchanged', () => {
    process.env[FLAG] = 'ts'
    const { calls, requestRustInvoke } = fakeRust()
    const s = createSteamGameSessionState({ requestRustInvoke })
    s.nativeInstallsInFlight.set('1', entry)
    expect(s.nativeInstallsInFlight.get('1')).toBe(entry)
    s.nativeInstallsInFlight.delete('1')
    expect(calls).toEqual([])
  })
})
