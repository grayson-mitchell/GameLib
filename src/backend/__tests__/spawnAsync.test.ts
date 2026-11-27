/**
 * `createSpawnAsync` as an adapter over the `spawnAsyncRun` shim (Phase 88.2, 88.2-21, D-30). The transport is a fake
 * `requestRustInvoke` and the frames are the real ones, delivered through the real listener and stream table, so what is
 * proved is the contract the 29 importers rely on: the option allow-list, what crosses to Rust, the result mapping, the
 * output order, an abort's kill and a rejection. Whether Rust really runs, times out and kills a child is
 * `spawn_async_real.rs`'s and the recorded `golden/spawn_async` slice's (`golden_spawn_async`).
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import {
  RUST_LAUNCH_RUNNER_KILL,
  RUST_LAUNCH_SPAWN_ASYNC
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import { createRunnerStreams } from 'backend/runnerStream'
import {
  registerRunnerOutputListener,
  runnerKill
} from 'backend/launchrust/runner'

import { createSpawnAsync } from '../spawnAsync'

const DONE = {
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  aborted: false
}

interface Invoke {
  channel: string
  args: unknown[]
}

/**
 * `spawn` runs in place of the Rust call: it is handed the call's `streamId` and a `send` that delivers a frame the way the
 * shell does, ahead of the reply, and answers (or rejects) what the reply is. `kill` answers a runner kill.
 */
function rig(
  spawn: (
    streamId: string | undefined,
    send: (channel: string, ...args: unknown[]) => void
  ) => unknown = () => DONE,
  kill: (streamId: string, calls: number) => unknown = () => true
) {
  const invokes: Invoke[] = []
  let kills = 0
  const deps = {
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      invokes.push({ channel, args })
      if (channel === RUST_LAUNCH_RUNNER_KILL) {
        kills += 1
        return Promise.resolve(kill((args as [string])[0], kills))
      }
      const [request] = args as [{ streamId?: string }]
      return Promise.resolve(spawn(request.streamId, send)).then((answer) => {
        if (answer instanceof Error) throw answer
        return answer
      })
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
  const streams = createRunnerStreams({
    kill: (streamId) => runnerKill(deps, streamId)
  })
  const ipc = createIpcRegistry()
  registerRunnerOutputListener(ipc, streams)
  function send(channel: string, ...args: unknown[]) {
    for (const listener of ipc.getListeners(channel))
      listener(undefined, ...args)
  }
  const spawnAsync = createSpawnAsync({ ...deps, streams })
  return { spawnAsync, invokes, streams }
}

/** The first spawn call's request, through the channel schema the sidecar checks before the frame is written. */
function spawnRequest(invokes: Invoke[]) {
  const call = invokes.find((i) => i.channel === RUST_LAUNCH_SPAWN_ASYNC)
  if (!call) throw new Error('no launch_spawn_async call')
  return rustInvokeArgs[RUST_LAUNCH_SPAWN_ASYNC].parse(call.args)[0]
}

describe('createSpawnAsync', () => {
  test('one launch_spawn_async call: program, argv and cwd, with no stream, no env, no timeout and no window flag', async () => {
    const r = rig()
    await r.spawnAsync('tar', ['-xf', 'a'], { cwd: '/x' })
    expect(r.invokes).toHaveLength(1)
    expect(r.invokes[0]?.channel).toBe(RUST_LAUNCH_SPAWN_ASYNC)
    expect(spawnRequest(r.invokes)).toEqual({
      command: 'tar',
      args: ['-xf', 'a'],
      cwd: '/x'
    })
    expect(r.streams.size()).toBe(0)
  })

  test('the result maps code, stdout, stderr, timedOut and aborted', async () => {
    const r = rig(() => ({
      code: 3,
      stdout: 'o1o2',
      stderr: 'e1',
      timedOut: false,
      aborted: false
    }))
    expect(await r.spawnAsync('x', [])).toEqual({
      code: 3,
      stdout: 'o1o2',
      stderr: 'e1',
      timedOut: false,
      aborted: false
    })
    const timed = rig(() => ({ ...DONE, code: null, timedOut: true }))
    expect(await timed.spawnAsync('x', [])).toMatchObject({
      code: null,
      timedOut: true,
      aborted: false
    })
  })

  test('an answer that is not a command result is an error, never a malformed result', async () => {
    const r = rig(() => 'nope')
    await expect(r.spawnAsync('x', [])).rejects.toThrow(/not a command result/)
  })

  test('options.env is the whole environment: present when given (a variable with no value left out), absent otherwise', async () => {
    const r = rig()
    await r.spawnAsync('x', [], { env: { A: '1', GONE: undefined } })
    expect(spawnRequest(r.invokes).env).toEqual({ A: '1' })
    const bare = rig()
    await bare.spawnAsync('x', [])
    expect(spawnRequest(bare.invokes)).not.toHaveProperty('env')
  })

  test('a timeout passes through, windowsHide too; NaN and Infinity travel as null', async () => {
    const r = rig()
    await r.spawnAsync('x', [], { timeout: 500, windowsHide: true })
    expect(spawnRequest(r.invokes)).toMatchObject({
      timeoutMs: 500,
      windowsHide: true
    })
    for (const unbounded of [NaN, Infinity]) {
      const u = rig()
      await u.spawnAsync('x', [], { timeout: unbounded })
      expect(spawnRequest(u.invokes).timeoutMs).toBeNull()
    }
  })

  test('onOutput receives every chunk of both streams in order, before the call resolves; the stream is closed after', async () => {
    const r = rig((streamId, send) => {
      send('runnerOutput', { streamId, seq: 1, pipe: 'stderr', chunk: 'b' })
      send('runnerOutput', { streamId, seq: 0, pipe: 'stdout', chunk: 'a' })
      send('runnerOutput', { streamId, seq: 2, pipe: 'stdout', chunk: 'c' })
      return DONE
    })
    const seen: string[] = []
    await r.spawnAsync('x', [], {}, (d) => seen.push(d))
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(spawnRequest(r.invokes)).toMatchObject({
      streamId: 'runner-stream-1',
      observe: true
    })
    expect(r.streams.size()).toBe(0)
  })

  test('a spawn error rejects with the text Rust answered, as an Error', async () => {
    const r = rig(() => new Error('No such file or directory (os error 2)'))
    await expect(r.spawnAsync('x', [])).rejects.toThrow(
      'No such file or directory (os error 2)'
    )
    // A transport that rejects (the call could not be made) rejects the caller with that text.
    const text = rig(() => Promise.reject(new Error('bad')))
    await expect(text.spawnAsync('x', [])).rejects.toThrow('bad')
    expect(r.streams.size()).toBe(0)
  })

  test.each(['shell', 'detached', 'stdio'])(
    'option %s throws a TypeError naming it before anything is sent',
    async (key) => {
      const r = rig()
      await expect(
        r.spawnAsync('x', [], { [key]: true } as never)
      ).rejects.toThrow(new RegExp(`"${key}"`))
      await expect(
        r.spawnAsync('x', [], { [key]: true } as never)
      ).rejects.toBeInstanceOf(TypeError)
      expect(r.invokes).toHaveLength(0)
    }
  )

  describe('abort', () => {
    test('an abort sends runnerKill for the stream of the call, and the call resolves aborted (never rejects)', async () => {
      const controller = new AbortController()
      let release: (value: unknown) => void = () => undefined
      const r = rig(
        () =>
          new Promise((resolve) => {
            release = resolve
          })
      )
      const pending = r.spawnAsync('x', [], { signal: controller.signal })
      expect(spawnRequest(r.invokes).streamId).toBe('runner-stream-1')
      controller.abort()
      await Promise.resolve()
      expect(r.invokes.map((i) => i.channel)).toEqual([
        RUST_LAUNCH_SPAWN_ASYNC,
        RUST_LAUNCH_RUNNER_KILL
      ])
      expect(r.invokes[1]?.args).toEqual(['runner-stream-1'])
      release({ ...DONE, code: null, aborted: true })
      expect(await pending).toEqual({
        code: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        aborted: true
      })
      expect(r.streams.size()).toBe(0)
    })

    test('a kill that finds no run yet (the abort beat the registration) is asked again until it lands', async () => {
      const controller = new AbortController()
      let release: (value: unknown) => void = () => undefined
      const r = rig(
        () =>
          new Promise((resolve) => {
            release = resolve
          }),
        (_id, calls) => calls >= 3
      )
      const pending = r.spawnAsync('x', [], { signal: controller.signal })
      controller.abort()
      const killCalls = () =>
        r.invokes.filter((i) => i.channel === RUST_LAUNCH_RUNNER_KILL).length
      const deadline = Date.now() + 2000
      while (killCalls() < 3 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 10))
      expect(killCalls()).toBe(3)
      release({ ...DONE, code: null, aborted: true })
      await pending
      // Landed on the third: no fourth.
      await new Promise((resolve) => setTimeout(resolve, 60))
      expect(killCalls()).toBe(3)
    })

    test('no kill is sent once the call has settled, and a late abort does nothing', async () => {
      const controller = new AbortController()
      const r = rig()
      await r.spawnAsync('x', [], { signal: controller.signal })
      controller.abort()
      await Promise.resolve()
      expect(r.invokes.map((i) => i.channel)).toEqual([RUST_LAUNCH_SPAWN_ASYNC])
    })

    test('a signal that is already aborted resolves aborted without sending anything', async () => {
      const r = rig()
      const out = await r.spawnAsync('x', [], {
        signal: AbortSignal.abort()
      })
      expect(out).toEqual({
        code: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        aborted: true
      })
      expect(r.invokes).toHaveLength(0)
      expect(r.streams.size()).toBe(0)
    })

    test('a kill the transport refuses is swallowed: the call still settles with what Rust answers', async () => {
      const controller = new AbortController()
      let release: (value: unknown) => void = () => undefined
      const r = rig(
        () =>
          new Promise((resolve) => {
            release = resolve
          }),
        () => {
          throw new Error('lost')
        }
      )
      const pending = r.spawnAsync('x', [], { signal: controller.signal })
      controller.abort()
      await Promise.resolve()
      release({ ...DONE, code: null, aborted: true })
      expect(await pending).toMatchObject({ aborted: true })
    })
  })
})
