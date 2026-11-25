/**
 * The prepare shims (Phase 88.1, 88.1-15, D-01): the Launcher's prepare members reach the Rust prepare ops through
 * `launchrust/prepare.ts`. The shape of each shim and the phase that deletes it are pinned by
 * `engineWineShimSchedule.test.ts`; this file pins the channel and the arguments that cross, and that the arguments
 * pass the same zod schema the sidecar checks before the frame is written.
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import { RUST_LAUNCH_PREPARE } from 'common/types/sidecarTransport'
import type { GameSettings } from 'common/types'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

import { prepareLaunch } from '../prepare'

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

const settings = {
  wineVersion: { type: 'wine', bin: '/w/wine', name: 'Wine-9' },
  winePrefix: '/p'
} as unknown as GameSettings

const args = {
  settings,
  runner: 'legendary' as const,
  appName: 'Fortnite',
  title: 'Fortnite',
  canRunOffline: true,
  thirdPartyManagedApp: undefined,
  installPath: '/games/fortnite',
  isNative: false,
  storeExpired: false,
  namespace: 'fn'
}

describe('prepareLaunch', () => {
  it('sends one launch_prepare call carrying the facts object and answers what Rust did', async () => {
    const reply = { success: true, offlineMode: false, log: [] }
    const deps = fakeTransport(reply)
    expect(await prepareLaunch(deps, args)).toBe(reply)
    expect(deps.calls).toEqual([[RUST_LAUNCH_PREPARE, [args]]])
  })

  it('sends arguments the sidecar schema accepts, and refuses a key it does not know', () => {
    const schema = rustInvokeArgs[RUST_LAUNCH_PREPARE]
    expect(schema.safeParse([args]).success).toBe(true)
    expect(schema.safeParse([{ ...args, rpcClient: true }]).success).toBe(false)
  })

  it('rejects when the call could not be made, with no fallback', async () => {
    const deps = fakeTransport(new Error('not-ready'))
    await expect(prepareLaunch(deps, args)).rejects.toThrow('not-ready')
    expect(deps.calls).toHaveLength(1)
  })
})
