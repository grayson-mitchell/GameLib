/**
 * The launch-builder shims (Phase 88.1, 88.1-07, D-01): the store managers reach the Rust builders through
 * `launchrust/builders.ts`. The shape of each shim and the phase that deletes it are pinned by
 * `engineWineShimSchedule.test.ts`; this file pins the channel and the arguments that cross, and that the
 * arguments pass the same zod schema the sidecar checks before the frame is written.
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import { RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

import { setupWrapperEnvVars } from '../builders'

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

describe('setupWrapperEnvVars', () => {
  it('sends one launch_setup_wrapper_env_vars call carrying the wrapper env object and answers what Rust did', async () => {
    const reply = { HEROIC_APP_NAME: '1234', GAMEID: 'umu-0' }
    const deps = fakeTransport(reply)
    expect(
      await setupWrapperEnvVars(deps, { appName: '1234', appRunner: 'gog' })
    ).toBe(reply)
    expect(deps.calls).toEqual([
      [
        RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS,
        [{ appName: '1234', appRunner: 'gog' }]
      ]
    ])
    expect(RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS).toBe(
      'launch_setup_wrapper_env_vars'
    )
  })

  it('sends arguments that pass the channel schema for each runner, and the schema refuses a stray key or runner', async () => {
    const deps = fakeTransport({})
    for (const appRunner of [
      'gog',
      'legendary',
      'nile',
      'sideload',
      'steam'
    ] as const) {
      await setupWrapperEnvVars(deps, { appName: 'App', appRunner })
    }
    for (const [, args] of deps.calls) {
      expect(() =>
        rustInvokeArgs[RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS].parse(args)
      ).not.toThrow()
    }
    const schema = rustInvokeArgs[RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS]
    expect(() =>
      schema.parse([{ appName: 'a', appRunner: 'gog', extra: 1 }])
    ).toThrow()
    expect(() => schema.parse([{ appName: 'a', appRunner: 'epic' }])).toThrow()
    expect(() => schema.parse([])).toThrow()
  })

  it('rejects with what the transport rejected with, with no TypeScript fallback', async () => {
    const deps = fakeTransport(
      new Error('launch_setup_wrapper_env_vars:not-ready')
    )
    await expect(
      setupWrapperEnvVars(deps, { appName: '1', appRunner: 'nile' })
    ).rejects.toThrow('launch_setup_wrapper_env_vars:not-ready')
    expect(deps.calls).toHaveLength(1)
  })
})
