/**
 * The known-fix shims (Phase 88, 88-12, D-01, D-03): the store managers and the download manager reach the
 * Rust known-fix ops through `launchrust/knownFixes.ts`. The shape of each shim and the phase that deletes it
 * are pinned by `engineWineShimSchedule.test.ts`; this file pins the channel and the arguments that cross,
 * and that the arguments pass the same zod schema the sidecar checks before the frame is written.
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import { RUST_KNOWNFIX_LAUNCH_OVERRIDES } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

import { readKnownFixLaunchOverrides } from '../knownFixes'

function fakeTransport(answer: unknown): RustInvokeDeps & {
  calls: Array<[string, unknown[]]>
} {
  const calls: Array<[string, unknown[]]> = []
  return {
    calls,
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer)
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
}

describe('readKnownFixLaunchOverrides', () => {
  it('sends one knownfix_launch_overrides call carrying the app, the runner and the install path', async () => {
    const reply = { launchArgs: ['-windowed'], exeOverride: null }
    const deps = fakeTransport(reply)
    expect(
      await readKnownFixLaunchOverrides(deps, '1234', 'gog', '/games/g1234')
    ).toBe(reply)
    expect(deps.calls).toEqual([
      [
        RUST_KNOWNFIX_LAUNCH_OVERRIDES,
        [{ appName: '1234', runner: 'gog', installPath: '/games/g1234' }]
      ]
    ])
    expect(RUST_KNOWNFIX_LAUNCH_OVERRIDES).toBe('knownfix_launch_overrides')
  })

  it('sends an unknown install folder as it is held, and the argument passes the channel schema', async () => {
    const deps = fakeTransport({ launchArgs: [] })
    await readKnownFixLaunchOverrides(deps, 'App', 'legendary', undefined)
    await readKnownFixLaunchOverrides(deps, 'App', 'nile', null)
    for (const [channel, args] of deps.calls) {
      expect(channel).toBe(RUST_KNOWNFIX_LAUNCH_OVERRIDES)
      expect(() =>
        rustInvokeArgs[RUST_KNOWNFIX_LAUNCH_OVERRIDES].parse(args)
      ).not.toThrow()
    }
    expect(deps.calls[1]?.[1]).toEqual([
      { appName: 'App', runner: 'nile', installPath: null }
    ])
  })

  it('rejects with the transport failure and does not catch it', async () => {
    const deps = fakeTransport(new Error('knownfix_launch_overrides:not-ready'))
    await expect(
      readKnownFixLaunchOverrides(deps, '1', 'gog', '/g')
    ).rejects.toThrow('not-ready')
  })

  it('has a channel schema that refuses a wrong runner, an unknown key and a wrong arity', () => {
    const schema = rustInvokeArgs[RUST_KNOWNFIX_LAUNCH_OVERRIDES]
    const ok = { appName: 'a', runner: 'gog', installPath: null }
    expect(schema.safeParse([ok]).success).toBe(true)
    expect(schema.safeParse([{ ...ok, runner: 'epic' }]).success).toBe(false)
    expect(schema.safeParse([{ ...ok, extra: 1 }]).success).toBe(false)
    expect(schema.safeParse([ok, ok]).success).toBe(false)
    expect(schema.safeParse([]).success).toBe(false)
  })
})
