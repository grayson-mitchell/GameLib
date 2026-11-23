/**
 * The pinned-engine download shim (Phase 87, 87-56a, D-01, D-03): one typed call carrying exactly the pin id, the game and
 * the cancel id. The shape is pinned by `engineWineShimSchedule.test.ts`; this file pins what crosses and what comes back
 * untouched.
 */
import { RUST_ENGINE_FALLBACK_ENSURE } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { ensureFallbackEngine } from '../fallback'

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

describe('ensureFallbackEngine', () => {
  it('sends the pin id, the game and the cancel id as one object and resolves the reply untouched', async () => {
    const reply = {
      ok: false,
      aborted: true,
      reason: 'aborted',
      error: 'aborted'
    }
    const deps = fakeTransport(reply)
    const request = {
      pinId: 'wine-staging-11.20',
      appName: '620',
      runner: 'steam' as const,
      cancelId: 'ee-1'
    }
    await expect(ensureFallbackEngine(deps, request)).resolves.toBe(reply)
    expect(deps.calls).toEqual([[RUST_ENGINE_FALLBACK_ENSURE, [request]]])
  })

  it('rejects with the transport failure rather than answering a result', async () => {
    const deps: RustInvokeDeps = {
      requestRustInvoke: (() =>
        Promise.reject(
          new Error('engine_fallback_ensure:bad-args')
        )) as unknown as RustInvokeDeps['requestRustInvoke']
    }
    await expect(
      ensureFallbackEngine(deps, {
        pinId: 'nope',
        appName: '620',
        runner: 'steam'
      })
    ).rejects.toThrow('engine_fallback_ensure:bad-args')
  })
})
