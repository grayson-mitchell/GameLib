/**
 * `settleKnownFixLaunchOverrides` (Phase 88, 88-12): the narrowing of Rust's launch-overrides answer. The
 * TypeScript it replaced never threw, so a failed call or an odd reply is a warning and no overrides.
 */
import { logWarning } from 'backend/logger'
import { settleKnownFixLaunchOverrides } from '../knownFixLaunchReply'

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

beforeEach(() => jest.mocked(logWarning).mockClear())

describe('settleKnownFixLaunchOverrides', () => {
  it('answers the launch args and the checked exe override of a good reply', async () => {
    expect(
      await settleKnownFixLaunchOverrides(
        '1',
        Promise.resolve({ launchArgs: ['-a', '--b'], exeOverride: '/g/x.exe' })
      )
    ).toEqual({ launchArgs: ['-a', '--b'], exeOverride: '/g/x.exe' })
    expect(logWarning).not.toHaveBeenCalled()
  })

  it('reads the null exeOverride Rust sends as absent', async () => {
    const got = await settleKnownFixLaunchOverrides(
      '1',
      Promise.resolve({ launchArgs: [], exeOverride: null })
    )
    expect(got).toEqual({ launchArgs: [] })
    expect('exeOverride' in got).toBe(false)
  })

  it('warns and applies nothing when the call rejects', async () => {
    expect(
      await settleKnownFixLaunchOverrides(
        '1',
        Promise.reject(new Error('knownfix_launch_overrides:not-ready'))
      )
    ).toEqual({ launchArgs: [] })
    expect(logWarning).toHaveBeenCalledTimes(1)
  })

  it.each([
    null,
    'x',
    [],
    {},
    { launchArgs: 'a' },
    { launchArgs: [1] },
    { launchArgs: [], exeOverride: 5 },
    { launchArgs: [], exeOverride: '' }
  ])('warns and applies nothing for the reply %j', async (reply) => {
    expect(
      await settleKnownFixLaunchOverrides('1', Promise.resolve(reply))
    ).toEqual({ launchArgs: [] })
    expect(logWarning).toHaveBeenCalledTimes(1)
  })
})
