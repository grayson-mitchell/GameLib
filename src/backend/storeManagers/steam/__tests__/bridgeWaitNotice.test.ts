import { initHeadless } from 'backend/logger'
import { createBridgeWaitNotice } from '../bridgeWaitNotice'

// The real logger needs a writer; HOME is redirected by the backend jest containment setup.
beforeAll(() => initHeadless())

/** A SteamGame carrying only what the wait notice touches. The Rust seq counter is scripted. */
function game(
  overrides: {
    requestRustInvoke?: jest.Mock
    sendFrontendMessage?: jest.Mock
  } = {}
) {
  let seq = 0
  const sendFrontendMessage = overrides.sendFrontendMessage ?? jest.fn()
  return {
    sendFrontendMessage,
    game: {
      appId: '3205720',
      deps: {
        sendFrontendMessage,
        requestRustInvoke:
          overrides.requestRustInvoke ??
          jest.fn().mockImplementation(() => Promise.resolve(++seq)),
        steamInstallRuntime: { noticeSeq: { last: 0 } },
        steamSession: {
          libraryState: {
            library: new Map([['3205720', { title: 'Schedule I' }]])
          }
        }
      }
    } as never
  }
}
const notices = (send: jest.Mock) =>
  send.mock.calls
    .filter((c) => c[0] === 'steamRequestNotice')
    .map((c) => c[1] as { appId: string; kind: string; seq: number })

describe('createBridgeWaitNotice (debug bridged-launch-steam-signed-out)', () => {
  test('begin pushes the signing-in kind for steam-not-signed-in', async () => {
    const { game: g, sendFrontendMessage } = game()
    const wait = createBridgeWaitNotice(g)
    wait.begin('steam-not-signed-in')
    await wait.end()
    expect(notices(sendFrontendMessage)[0]).toEqual({
      appId: '3205720',
      title: 'Schedule I',
      kind: 'bridge-wait-steam-not-signed-in',
      seq: 1
    })
  })

  test('begin pushes the not-running kind for steam-not-running', async () => {
    const { game: g, sendFrontendMessage } = game()
    const wait = createBridgeWaitNotice(g)
    wait.begin('steam-not-running')
    await wait.end()
    expect(notices(sendFrontendMessage)[0]?.kind).toBe(
      'bridge-wait-steam-not-running'
    )
  })

  test('end pushes bridge-wait-end for the same appId with a newer seq, after the start', async () => {
    const { game: g, sendFrontendMessage } = game()
    const wait = createBridgeWaitNotice(g)
    wait.begin('steam-not-signed-in')
    await wait.end()
    const pushed = notices(sendFrontendMessage)
    expect(pushed.map((n) => n.kind)).toEqual([
      'bridge-wait-steam-not-signed-in',
      'bridge-wait-end'
    ])
    expect(pushed[1]?.appId).toBe('3205720')
    expect(pushed[1]!.seq).toBeGreaterThan(pushed[0]!.seq)
  })

  test('end called at once still takes its seq after a slow start push (ordering)', async () => {
    // The first seq read resolves late; the end must not overtake it.
    let calls = 0
    const requestRustInvoke = jest.fn().mockImplementation(async () => {
      const n = ++calls
      if (n === 1) await new Promise((r) => setTimeout(r, 20))
      return n
    })
    const { game: g, sendFrontendMessage } = game({ requestRustInvoke })
    const wait = createBridgeWaitNotice(g)
    wait.begin('steam-not-signed-in')
    await wait.end()
    const pushed = notices(sendFrontendMessage)
    expect(pushed.map((n) => n.kind)).toEqual([
      'bridge-wait-steam-not-signed-in',
      'bridge-wait-end'
    ])
    expect(pushed[1]!.seq).toBeGreaterThan(pushed[0]!.seq)
  })

  test('end without a begin pushes nothing (a launch that never waited)', async () => {
    const { game: g, sendFrontendMessage } = game()
    await createBridgeWaitNotice(g).end()
    expect(notices(sendFrontendMessage)).toEqual([])
  })

  test('a second begin is ignored; a second end is a no-op', async () => {
    const { game: g, sendFrontendMessage } = game()
    const wait = createBridgeWaitNotice(g)
    wait.begin('steam-not-running')
    wait.begin('steam-not-signed-in')
    await wait.end()
    await wait.end()
    expect(notices(sendFrontendMessage).map((n) => n.kind)).toEqual([
      'bridge-wait-steam-not-running',
      'bridge-wait-end'
    ])
  })

  test('falls back to a local seq when the Rust invoke rejects, and still pushes both', async () => {
    const { game: g, sendFrontendMessage } = game({
      requestRustInvoke: jest.fn().mockRejectedValue(new Error('down'))
    })
    const wait = createBridgeWaitNotice(g)
    wait.begin('steam-not-signed-in')
    await wait.end()
    const pushed = notices(sendFrontendMessage)
    expect(pushed).toHaveLength(2)
    expect(pushed[1]!.seq).toBeGreaterThan(pushed[0]!.seq)
  })

  test('never rejects and never throws when sendFrontendMessage throws', async () => {
    const throwing = jest.fn(() => {
      throw new Error('ipc closed')
    })
    const { game: g } = game({ sendFrontendMessage: throwing })
    const wait = createBridgeWaitNotice(g)
    expect(() => wait.begin('steam-not-signed-in')).not.toThrow()
    await expect(wait.end()).resolves.toBeUndefined()
  })
})
