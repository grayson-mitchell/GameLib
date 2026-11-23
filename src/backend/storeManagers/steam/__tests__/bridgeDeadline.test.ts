/**
 * The Steam bridge's launch deadline over Rust (Phase 87, 87-54): the callback is stored before the arm goes out, a
 * cancel reaches Rust once and only for an armed deadline, and a refused arm leaves a launch with no deadline rather than a
 * failed launch.
 */
import { bridgeDeadlines } from 'backend/enginewine/deadline'
import {
  RUST_ENGINE_DEADLINE_ARM,
  RUST_ENGINE_DEADLINE_CANCEL
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  armBridgeLaunchDeadline,
  bindDeadlineToMonitor
} from '../engine/bridgeDeadline'

function transport(
  answer: (channel: string) => Promise<unknown>
): RustInvokeDeps & { calls: Array<[string, unknown[]]> } {
  const calls: Array<[string, unknown[]]> = []
  return {
    calls,
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return answer(channel)
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
}

beforeEach(() => bridgeDeadlines.reset())

describe('armBridgeLaunchDeadline', () => {
  it('stores the callback before the arm goes out, so a frame cannot beat it', async () => {
    const onDeadline = jest.fn()
    const deps = transport(() => {
      // Rust fires while the arm is still being answered
      bridgeDeadlines.fire('620')
      return Promise.resolve(null)
    })
    const deadline = await armBridgeLaunchDeadline(deps, {
      key: '620',
      onDeadline
    })
    expect(deps.calls).toEqual([[RUST_ENGINE_DEADLINE_ARM, [{ key: '620' }]]])
    expect(onDeadline).toHaveBeenCalledTimes(1)
    expect(deadline.state).toBe('fired')
  })

  it('a cancel reaches Rust once, with its reason, and only while armed', async () => {
    const deps = transport(() => Promise.resolve(true))
    const deadline = await armBridgeLaunchDeadline(deps, {
      key: '620',
      onDeadline: jest.fn()
    })
    deadline.cancel('first-match')
    deadline.cancel('launcher-exited')
    expect(deps.calls.slice(1)).toEqual([
      [RUST_ENGINE_DEADLINE_CANCEL, [{ key: '620', reason: 'first-match' }]]
    ])
  })

  it('a refused arm stands the handle down and still resolves it: the launch goes on with no deadline', async () => {
    const onDeadline = jest.fn()
    const deps = transport((channel) =>
      channel === RUST_ENGINE_DEADLINE_ARM
        ? Promise.reject(new Error('engine_deadline_arm:bad-args'))
        : Promise.resolve(false)
    )
    const deadline = await armBridgeLaunchDeadline(deps, {
      key: '620',
      onDeadline
    })
    expect(deadline.state).toBe('cancelled')
    expect(bridgeDeadlines.fire('620')).toBe(false)
    expect(onDeadline).not.toHaveBeenCalled()
  })

  it('a cancel Rust refuses is logged, never thrown into the launch', async () => {
    const deps = transport((channel) =>
      channel === RUST_ENGINE_DEADLINE_CANCEL
        ? Promise.reject(new Error('shutdown'))
        : Promise.resolve(null)
    )
    const deadline = await armBridgeLaunchDeadline(deps, {
      key: '620',
      onDeadline: jest.fn()
    })
    expect(() => deadline.cancel('launch-error')).not.toThrow()
    await Promise.resolve()
  })
})

describe('bindDeadlineToMonitor (59-REVIEW CR-01)', () => {
  it('stands an armed deadline down when no monitor started', async () => {
    const deps = transport(() => Promise.resolve(null))
    const deadline = await armBridgeLaunchDeadline(deps, {
      key: '620',
      onDeadline: jest.fn()
    })
    const log = jest.fn()
    expect(bindDeadlineToMonitor(deadline, null, log)).toBeNull()
    expect(deadline.state).toBe('cancelled')
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('monitor-unavailable')
    )
  })

  it('leaves the deadline armed when a monitor started', async () => {
    const deps = transport(() => Promise.resolve(null))
    const deadline = await armBridgeLaunchDeadline(deps, {
      key: '620',
      onDeadline: jest.fn()
    })
    const handle = { launcherExited: jest.fn() }
    expect(bindDeadlineToMonitor(deadline, handle, jest.fn())).toBe(handle)
    expect(deadline.state).toBe('armed')
  })
})
