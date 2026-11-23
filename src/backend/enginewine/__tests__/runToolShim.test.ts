/**
 * The tool-run shims (Phase 87, 87-55, D-03, Pitfall 10): each is one typed call carrying exactly what the caller
 * resolved. The shape of both is pinned by `engineWineShimSchedule.test.ts`; this file pins what crosses and what comes
 * back untouched.
 */
import {
  RUST_ENGINE_CANCEL,
  RUST_ENGINE_RUN_TOOL
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { cancelRunTool, rustRunTool } from '../runTool'

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

describe('rustRunTool', () => {
  it('sends the program, its arguments, the limit and the cancel id as one object and resolves the reply untouched', async () => {
    const reply = {
      code: 0,
      stdout: 'ok',
      stderr: '',
      timedOut: false,
      aborted: false
    }
    const deps = fakeTransport(reply)
    const request = {
      tool: '/bin/cp' as const,
      args: ['-R', '/a', '/b'],
      timeoutMs: 120_000,
      cancelId: 'rt-1'
    }
    await expect(rustRunTool(deps, request)).resolves.toBe(reply)
    expect(deps.calls).toEqual([[RUST_ENGINE_RUN_TOOL, [request]]])
  })

  it('rejects with the transport failure rather than answering a result', async () => {
    const deps: RustInvokeDeps = {
      requestRustInvoke: (() =>
        Promise.reject(
          new Error('engine_run_tool:bad-args')
        )) as unknown as RustInvokeDeps['requestRustInvoke']
    }
    await expect(
      rustRunTool(deps, { tool: '/bin/ps', args: [], timeoutMs: 1 })
    ).rejects.toThrow('engine_run_tool:bad-args')
  })
})

describe('cancelRunTool', () => {
  it('sends the cancel id as one object and resolves whether a run was in flight', async () => {
    const deps = fakeTransport(true)
    await expect(cancelRunTool(deps, 'rt-1')).resolves.toBe(true)
    expect(deps.calls).toEqual([[RUST_ENGINE_CANCEL, [{ cancelId: 'rt-1' }]]])
  })
})
