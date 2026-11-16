import * as logger from 'backend/logger'
import { withoutSteamRestartHolds } from '../pollRust/rustSteamPoll'
import { createSteamGameSessionState } from '../gameSessionState'

type Call = { channel: string; args: unknown[] }

function fakeRust(result: unknown = null, reject = false) {
  const calls: Call[] = []
  const requestRustInvoke = jest.fn((channel: string, args: unknown[]) => {
    calls.push({ channel, args })
    return reject ? Promise.reject(new Error('boom')) : Promise.resolve(result)
  })
  return { calls, requestRustInvoke }
}

beforeEach(() => {
  jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logWarning').mockImplementation(() => undefined)
})
afterEach(() => {
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
    const { calls, requestRustInvoke } = fakeRust(status)
    const out = await withoutSteamRestartHolds(
      { requestRustInvoke: requestRustInvoke as never },
      new Map<number, string>([
        [5, 'a'],
        [6, 'b'],
        [7, 'c'],
        [8, 'd']
      ])
    )
    expect([...out.keys()]).toEqual([6, 8])
    expect(calls).toEqual([{ channel: 'steampoll_status', args: [] }])
  })
})

describe('native in-flight mirror', () => {
  const entry = {} as never

  it('rust: pushes new keys and present-key deletes only', () => {
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
})
