/**
 * The launch utils shims (Phase 88.1, 88.1-16, D-01): `isEpicServiceOffline` and the wine self-heal reach their Rust ops
 * through `launchrust/launchUtils.ts`. The shape of each shim and the phase that deletes it are pinned by
 * `engineWineShimSchedule.test.ts`; this file pins the channel and the arguments that cross, and that the arguments
 * pass the same zod schema the sidecar checks before the frame is written.
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import { RUST_LAUNCH_EPIC_SERVICE_OFFLINE } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

import { isEpicServiceOffline } from '../launchUtils'

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

describe('isEpicServiceOffline', () => {
  it('sends one launch_epic_service_offline call with no service when none is asked, and answers the boolean', async () => {
    const deps = fakeTransport(true)
    expect(await isEpicServiceOffline(deps)).toBe(true)
    expect(deps.calls).toEqual([
      [RUST_LAUNCH_EPIC_SERVICE_OFFLINE, [undefined]]
    ])
  })

  it('carries the optional service argument', async () => {
    const deps = fakeTransport(false)
    expect(await isEpicServiceOffline(deps, 'Fortnite')).toBe(false)
    expect(deps.calls).toEqual([
      [RUST_LAUNCH_EPIC_SERVICE_OFFLINE, ['Fortnite']]
    ])
  })

  it('sends arguments the sidecar schema accepts, and refuses an unknown service', () => {
    const schema = rustInvokeArgs[RUST_LAUNCH_EPIC_SERVICE_OFFLINE]
    expect(schema.safeParse([undefined]).success).toBe(true)
    expect(schema.safeParse([]).success).toBe(true)
    expect(schema.safeParse(['Rocket League']).success).toBe(true)
    expect(schema.safeParse(['Steam']).success).toBe(false)
  })

  it('rejects when the call could not be made, with no fallback', async () => {
    const deps = fakeTransport(new Error('not-ready'))
    await expect(isEpicServiceOffline(deps)).rejects.toThrow('not-ready')
    expect(deps.calls).toHaveLength(1)
  })
})
