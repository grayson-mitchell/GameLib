/**
 * The bridge's `RunTool` over the Rust runner (Phase 87, 87-55, Pitfall 10): the call signature the DRM and overlay
 * runner files use survives, an abort sends `engine_cancel` for the run's id, and a run never rejects.
 */
import {
  RUST_ENGINE_CANCEL,
  RUST_ENGINE_RUN_TOOL
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { createRustRunTool } from '../engine/rustRunTool'

const OK = {
  code: 0,
  stdout: 'out',
  stderr: '',
  timedOut: false,
  aborted: false
}

type Handler = (channel: string, args: unknown[]) => Promise<unknown>

function transport(handler: Handler): RustInvokeDeps & {
  calls: Array<[string, unknown[]]>
} {
  const calls: Array<[string, unknown[]]> = []
  return {
    calls,
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return handler(channel, args)
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
}

describe('createRustRunTool', () => {
  it('runs the tool in Rust with a cancel id and resolves the TS result shape', async () => {
    const deps = transport(() => Promise.resolve(OK))
    const run = createRustRunTool(deps)
    await expect(
      run('/usr/bin/plutil', ['-p', '/x'], { timeoutMs: 5000 })
    ).resolves.toEqual(OK)
    expect(deps.calls).toHaveLength(1)
    const [channel, [request]] = deps.calls[0] ?? ['', []]
    expect(channel).toBe(RUST_ENGINE_RUN_TOOL)
    expect(request).toMatchObject({
      tool: '/usr/bin/plutil',
      args: ['-p', '/x'],
      timeoutMs: 5000
    })
    expect((request as { cancelId: string }).cancelId).toMatch(
      /^[A-Za-z0-9_-]{1,64}$/
    )
  })

  it('resolves the refusal Rust answers for a tool outside the allowlist', async () => {
    const refusal = {
      ...OK,
      code: null,
      stdout: '',
      stderr: 'tool not allowed: /bin/sh'
    }
    const run = createRustRunTool(transport(() => Promise.resolve(refusal)))
    await expect(
      run('/bin/sh' as never, [], { timeoutMs: 1 })
    ).resolves.toEqual(refusal)
  })

  it('does not call Rust for a signal that is already aborted', async () => {
    const deps = transport(() => Promise.resolve(OK))
    const controller = new AbortController()
    controller.abort()
    const result = await createRustRunTool(deps)('/bin/ps', [], {
      timeoutMs: 1,
      signal: controller.signal
    })
    expect(result).toMatchObject({ aborted: true, code: null })
    expect(deps.calls).toEqual([])
  })

  it('sends engine_cancel with the run id when the signal aborts, and resolves what Rust answers aborted', async () => {
    let finish: (v: unknown) => void = () => undefined
    const running = new Promise<unknown>((resolve) => {
      finish = resolve
    })
    const deps = transport((channel) => {
      if (channel === RUST_ENGINE_RUN_TOOL) return running
      finish({ ...OK, code: null, aborted: true })
      return Promise.resolve(true)
    })
    const controller = new AbortController()
    const pending = createRustRunTool(deps)('/bin/cp', ['-R', 'a', 'b'], {
      timeoutMs: 60_000,
      signal: controller.signal
    })
    controller.abort()
    await expect(pending).resolves.toMatchObject({ aborted: true })
    const runId = (deps.calls[0]?.[1][0] as { cancelId: string }).cancelId
    expect(deps.calls[1]).toEqual([RUST_ENGINE_CANCEL, [{ cancelId: runId }]])
    expect(deps.calls).toHaveLength(2)
  })

  it('re-sends the cancel while Rust answers that no run had registered the id yet', async () => {
    let finish: (v: unknown) => void = () => undefined
    const running = new Promise<unknown>((resolve) => {
      finish = resolve
    })
    let cancels = 0
    const deps = transport((channel) => {
      if (channel === RUST_ENGINE_RUN_TOOL) return running
      cancels += 1
      if (cancels < 3) return Promise.resolve(false)
      finish({ ...OK, code: null, aborted: true })
      return Promise.resolve(true)
    })
    const controller = new AbortController()
    const pending = createRustRunTool(deps)('/bin/cp', [], {
      timeoutMs: 1000,
      signal: controller.signal
    })
    controller.abort()
    await expect(pending).resolves.toMatchObject({ aborted: true })
    expect(cancels).toBe(3)
  })

  it('never rejects: a transport failure and a malformed reply resolve as a refusal', async () => {
    await expect(
      createRustRunTool(
        transport(() => Promise.reject(new Error('engine_run_tool:not-ready')))
      )('/bin/ps', [], { timeoutMs: 1 })
    ).resolves.toMatchObject({
      code: null,
      stderr: 'engine_run_tool:not-ready'
    })
    await expect(
      createRustRunTool(transport(() => Promise.resolve({ code: 'x' })))(
        '/bin/ps',
        [],
        { timeoutMs: 1 }
      )
    ).resolves.toMatchObject({ stderr: 'unexpected tool run reply' })
  })
})
