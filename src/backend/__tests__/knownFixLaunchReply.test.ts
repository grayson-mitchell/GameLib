/**
 * `settleKnownFixLaunchOverrides` (Phase 88, 88-12): the narrowing of Rust's launch-overrides answer. The
 * TypeScript it replaced never threw, so a failed call or an odd reply is a warning and no overrides. 88-13 adds
 * the same for the launcher's registry step and overlay env: neither fails a launch.
 */
import * as logger from 'backend/logger'
import {
  settleKnownFixLaunchOverrides,
  settleKnownFixOverlayEnv,
  settleKnownFixRegistry
} from '../knownFixLaunchReply'

let logWarning: jest.SpyInstance

beforeEach(() => {
  logWarning = jest
    .spyOn(logger, 'logWarning')
    .mockImplementation(() => undefined)
})
afterEach(() => logWarning.mockRestore())

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

describe('settleKnownFixRegistry', () => {
  it('resolves quietly when the call resolves', async () => {
    await expect(
      settleKnownFixRegistry('gog 1', Promise.resolve(null))
    ).resolves.toBeUndefined()
    expect(logWarning).not.toHaveBeenCalled()
  })

  it('turns a rejection into a warning, never a failed launch', async () => {
    await expect(
      settleKnownFixRegistry(
        'gog 1',
        Promise.reject(new Error('knownfix_apply_profile_registry:not-ready'))
      )
    ).resolves.toBeUndefined()
    expect(logWarning).toHaveBeenCalledTimes(1)
  })
})

describe('settleKnownFixOverlayEnv', () => {
  it('answers the env map of a good reply', async () => {
    expect(
      await settleKnownFixOverlayEnv(
        'gog 1',
        Promise.resolve({ GST_PLUGIN_PATH: '/a:/b' })
      )
    ).toEqual({ GST_PLUGIN_PATH: '/a:/b' })
    expect(
      await settleKnownFixOverlayEnv('gog 1', Promise.resolve({}))
    ).toEqual({})
    expect(logWarning).not.toHaveBeenCalled()
  })

  it('answers {} with a warning for a rejection and for an odd reply', async () => {
    expect(
      await settleKnownFixOverlayEnv(
        'gog 1',
        Promise.reject(new Error('knownfix_profile_overlay_env:timeout'))
      )
    ).toEqual({})
    for (const odd of [null, undefined, 'x', 3, [], { A: 1 }]) {
      expect(
        await settleKnownFixOverlayEnv('gog 1', Promise.resolve(odd))
      ).toEqual({})
    }
    expect(logWarning).toHaveBeenCalledTimes(7)
  })
})
