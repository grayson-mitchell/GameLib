import * as logger from 'backend/logger'
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

describe('native in-flight mirror', () => {
  const entry = {} as never

  it('rust: pushes new keys and present-key deletes only', async () => {
    const { calls, requestRustInvoke } = fakeRust()
    const s = createSteamGameSessionState({ requestRustInvoke })
    s.nativeInstallsInFlight.set('1', entry)
    s.nativeInstallsInFlight.set('1', entry)
    s.nativeInstallsInFlight.delete('2')
    s.nativeInstallsInFlight.delete('1')
    await new Promise((r) => setImmediate(r))
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

  it('C-WR-06 a delete is sent only after the set it follows has settled', async () => {
    const calls: { appId: string; inFlight: boolean }[] = []
    const pending: (() => void)[] = []
    const requestRustInvoke = jest.fn((_channel: string, args: unknown[]) => {
      calls.push(args[0] as { appId: string; inFlight: boolean })
      return new Promise<unknown>((resolve) =>
        pending.push(() => resolve(null))
      )
    })
    const s = createSteamGameSessionState({ requestRustInvoke })
    s.nativeInstallsInFlight.set('1', entry)
    s.nativeInstallsInFlight.delete('1')
    await new Promise((r) => setImmediate(r))
    // The worker-thread shell could otherwise apply the delete first.
    expect(calls).toEqual([{ appId: '1', inFlight: true }])
    pending.shift()?.()
    await new Promise((r) => setImmediate(r))
    expect(calls).toEqual([
      { appId: '1', inFlight: true },
      { appId: '1', inFlight: false }
    ])
  })

  it('C-WR-06 a rejected push does not stall the ones after it', async () => {
    let n = 0
    const calls: unknown[] = []
    const requestRustInvoke = jest.fn((_channel: string, args: unknown[]) => {
      calls.push(args[0])
      n += 1
      return n === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(null)
    })
    const s = createSteamGameSessionState({ requestRustInvoke })
    s.nativeInstallsInFlight.set('1', entry)
    s.nativeInstallsInFlight.delete('1')
    await new Promise((r) => setImmediate(r))
    expect(calls).toEqual([
      { appId: '1', inFlight: true },
      { appId: '1', inFlight: false }
    ])
  })

  it('C-WR-06 clear() mirrors every removed key', async () => {
    const { calls, requestRustInvoke } = fakeRust()
    const s = createSteamGameSessionState({ requestRustInvoke })
    s.nativeInstallsInFlight.set('1', entry)
    s.nativeInstallsInFlight.set('2', entry)
    s.nativeInstallsInFlight.clear()
    await new Promise((r) => setImmediate(r))
    expect(calls.map((c) => c.args[0])).toEqual([
      { appId: '1', inFlight: true },
      { appId: '2', inFlight: true },
      { appId: '1', inFlight: false },
      { appId: '2', inFlight: false }
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
