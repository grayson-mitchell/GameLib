/**
 * The bridge deadline's TypeScript half (Phase 87, 87-54, D-17): the two shims that reach Rust's arm and cancel, the
 * callback view Rust's `engineDeadlineFired` frame runs through, and the listener that wires the frame to it. The timer is
 * Rust's (`gamelib-engine` `launch::deadline`, tested there on a paused clock); what is pinned here is what crosses, that a
 * stored callback runs once, and that a frame nothing armed (or a malformed one) does nothing.
 */
import {
  RUST_ENGINE_DEADLINE_ARM,
  RUST_ENGINE_DEADLINE_CANCEL
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  armBridgeDeadline,
  bridgeDeadlines,
  cancelBridgeDeadline,
  registerEngineDeadlineFired
} from '../deadline'

function fakeTransport(answer: unknown): RustInvokeDeps & {
  calls: Array<[string, unknown[]]>
} {
  const calls: Array<[string, unknown[]]> = []
  return {
    calls,
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return Promise.resolve(answer)
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
}

type Listener = (event: unknown, ...args: unknown[]) => void

beforeEach(() => bridgeDeadlines.reset())

describe('the shims', () => {
  it('armBridgeDeadline sends the key and resolves the answer untouched', async () => {
    const deps = fakeTransport(null)
    await expect(armBridgeDeadline(deps, { key: '620' })).resolves.toBeNull()
    expect(deps.calls).toEqual([[RUST_ENGINE_DEADLINE_ARM, [{ key: '620' }]]])
  })

  it('cancelBridgeDeadline sends the key and the reason', async () => {
    const deps = fakeTransport(true)
    await expect(
      cancelBridgeDeadline(deps, { key: '620', reason: 'first-match' })
    ).resolves.toBe(true)
    expect(deps.calls).toEqual([
      [RUST_ENGINE_DEADLINE_CANCEL, [{ key: '620', reason: 'first-match' }]]
    ])
  })
})

describe('bridgeDeadlines', () => {
  it('arm, fire: the stored callback runs once and the handle reads fired', () => {
    const onDeadline = jest.fn()
    const deadline = bridgeDeadlines.track('620', onDeadline, jest.fn())
    expect(deadline.state).toBe('armed')
    expect(bridgeDeadlines.fire('620')).toBe(true)
    expect(onDeadline).toHaveBeenCalledTimes(1)
    expect(deadline.state).toBe('fired')
    // a second frame for the same key finds nothing armed
    expect(bridgeDeadlines.fire('620')).toBe(false)
    expect(onDeadline).toHaveBeenCalledTimes(1)
  })

  it('arm, cancel: Rust is told once, the handle reads cancelled and a later frame does nothing', () => {
    const onDeadline = jest.fn()
    const cancelRemote = jest.fn()
    const deadline = bridgeDeadlines.track('620', onDeadline, cancelRemote)
    deadline.cancel('first-match')
    expect(deadline.state).toBe('cancelled')
    expect(cancelRemote).toHaveBeenCalledTimes(1)
    expect(cancelRemote).toHaveBeenCalledWith('first-match')
    deadline.cancel('launcher-exited')
    expect(cancelRemote).toHaveBeenCalledTimes(1)
    expect(bridgeDeadlines.fire('620')).toBe(false)
    expect(onDeadline).not.toHaveBeenCalled()
  })

  it('a fired deadline ignores a later cancel', () => {
    const cancelRemote = jest.fn()
    const deadline = bridgeDeadlines.track('620', jest.fn(), cancelRemote)
    bridgeDeadlines.fire('620')
    deadline.cancel('launch-error')
    expect(deadline.state).toBe('fired')
    expect(cancelRemote).not.toHaveBeenCalled()
  })

  it('an unknown key is ignored', () => {
    const onDeadline = jest.fn()
    bridgeDeadlines.track('620', onDeadline, jest.fn())
    expect(bridgeDeadlines.fire('999')).toBe(false)
    expect(onDeadline).not.toHaveBeenCalled()
  })

  it('arming a key again supersedes the old handle here only: Rust supersedes its own at the arm', () => {
    const first = jest.fn()
    const second = jest.fn()
    const cancelFirst = jest.fn()
    const one = bridgeDeadlines.track('620', first, cancelFirst)
    const two = bridgeDeadlines.track('620', second, jest.fn())
    expect(one.state).toBe('cancelled')
    expect(cancelFirst).not.toHaveBeenCalled()
    // the stale handle can no longer stand the new deadline down
    one.cancel('superseded')
    expect(two.state).toBe('armed')
    bridgeDeadlines.fire('620')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('a callback that throws or rejects is contained', async () => {
    bridgeDeadlines.track(
      '1',
      () => {
        throw new Error('boom')
      },
      jest.fn()
    )
    expect(bridgeDeadlines.fire('1')).toBe(true)
    bridgeDeadlines.track(
      '2',
      () => Promise.reject(new Error('later')),
      jest.fn()
    )
    expect(bridgeDeadlines.fire('2')).toBe(true)
    await Promise.resolve()
  })
})

describe('registerEngineDeadlineFired', () => {
  const listeners = new Map<string, Listener>()
  const ipc = {
    on: (channel: string, listener: Listener) => {
      listeners.set(channel, listener)
      return ipc
    }
  } as unknown as Parameters<typeof registerEngineDeadlineFired>[0]

  beforeEach(() => {
    listeners.clear()
    registerEngineDeadlineFired(ipc)
  })

  it('registers one listener on the frame Rust sends', () => {
    expect([...listeners.keys()]).toEqual(['engineDeadlineFired'])
  })

  it('a frame Rust sends runs the callback armed for its key', () => {
    const onDeadline = jest.fn()
    bridgeDeadlines.track('620', onDeadline, jest.fn())
    listeners.get('engineDeadlineFired')?.(
      {},
      { key: '620', reason: 'no-game-process' }
    )
    expect(onDeadline).toHaveBeenCalledTimes(1)
  })

  it('a frame for a key nothing armed does nothing', () => {
    const onDeadline = jest.fn()
    bridgeDeadlines.track('620', onDeadline, jest.fn())
    listeners.get('engineDeadlineFired')?.(
      {},
      { key: '999', reason: 'no-game-process' }
    )
    expect(onDeadline).not.toHaveBeenCalled()
  })

  it('a malformed frame is dropped, not applied', () => {
    const onDeadline = jest.fn()
    bridgeDeadlines.track('620', onDeadline, jest.fn())
    const hear = listeners.get('engineDeadlineFired')
    hear?.({}, { key: '620', reason: 'other' })
    hear?.({}, { key: '', reason: 'no-game-process' })
    hear?.({}, { key: '620' })
    hear?.({}, { key: '620', reason: 'no-game-process', extra: 1 })
    hear?.({}, 'nonsense')
    hear?.({})
    expect(onDeadline).not.toHaveBeenCalled()
  })
})
