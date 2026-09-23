/**
 * Pure unit coverage for resolveRunnerTargetPlatform() (meta/releaseTags.ts,
 * quick 260923-tip Layer 1 fix). No Windows host required -- host and env
 * are both passed as explicit arguments except in the default-argument
 * case, which only asserts membership in the three-literal union (this
 * suite runs on win32/darwin/linux hosts alike).
 */
import { resolveRunnerTargetPlatform } from '../releaseTags'

describe('resolveRunnerTargetPlatform', () => {
  it('returns the host platform when no override is set', () => {
    expect(resolveRunnerTargetPlatform({}, 'win32')).toBe('win32')
    expect(resolveRunnerTargetPlatform({}, 'darwin')).toBe('darwin')
    expect(resolveRunnerTargetPlatform({}, 'linux')).toBe('linux')
  })

  it('an explicit override beats the host platform', () => {
    expect(
      resolveRunnerTargetPlatform(
        { GAMELIB_RUNNER_TARGET_PLATFORM: 'darwin' },
        'win32'
      )
    ).toBe('darwin')
  })

  it('an empty-string override (GitHub Actions renders an unset matrix field this way) falls back to the host platform', () => {
    expect(
      resolveRunnerTargetPlatform(
        { GAMELIB_RUNNER_TARGET_PLATFORM: '' },
        'linux'
      )
    ).toBe('linux')
  })

  it('an unrecognised override throws naming the variable and the three accepted values, rather than silently falling back', () => {
    let thrown: Error | undefined
    try {
      resolveRunnerTargetPlatform(
        { GAMELIB_RUNNER_TARGET_PLATFORM: 'freebsd' },
        'win32'
      )
    } catch (error) {
      thrown = error as Error
    }

    expect(thrown).toBeDefined()
    expect(thrown?.message).toContain('GAMELIB_RUNNER_TARGET_PLATFORM')
    expect(thrown?.message).toContain('freebsd')
    expect(thrown?.message).toContain('win32')
    expect(thrown?.message).toContain('darwin')
    expect(thrown?.message).toContain('linux')
  })

  it('with no arguments, reads process.env / process.platform and returns one of the three SupportedPlatform literals', () => {
    const result = resolveRunnerTargetPlatform()
    expect(['win32', 'darwin', 'linux']).toContain(result)
  })
})
