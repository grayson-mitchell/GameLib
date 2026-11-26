/**
 * The runner transport shims (Phase 88.2, 88.2-15, D-02, D-19): `launchrust/runner.ts` and the per-call stream table of
 * `backend/runnerStream.ts`. The shape of each shim and the phase that deletes it are pinned by
 * `engineWineShimSchedule.test.ts`; this file pins the channel and the arguments that cross, that the arguments pass the
 * same zod schema the sidecar checks before the frame is written, and that the output and spawn frames the shell sends
 * reach the stream that asked, validated and in order.
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import { sidecarInternalSendArgs } from 'common/types/ipc/sidecarInternal'
import {
  RUST_LAUNCH_RUNNER_ABORT,
  RUST_LAUNCH_RUNNER_CALL,
  RUST_LAUNCH_RUNNER_KILL,
  RUST_LAUNCH_SCRIPT_RUN,
  RUST_LAUNCH_WINE_COMMAND,
  RUST_LAUNCH_WINE_PATH
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import { createRunnerStreams } from 'backend/runnerStream'
import type { RunnerChildHandle } from 'backend/runnerStream'

import {
  registerRunnerOutputListener,
  runnerAbort,
  runnerCall,
  runnerKill,
  scriptRun,
  winePathGet,
  wineCommandRun
} from '../runner'
import type {
  RunnerCallRequest,
  ScriptRunRequest,
  WineCommandRequest
} from '../runner'

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

const call: RunnerCallRequest = {
  streamId: 'runner-stream-1',
  commandParts: ['launch', '1234', '--offline'],
  runner: {
    name: 'legendary',
    bin: '/opt/legendary',
    dir: '/opt',
    logPrefix: 'Legendary'
  },
  env: [
    ['ZED', '1'],
    ['ALPHA', '2']
  ],
  logTargets: [
    {
      target: {
        kind: 'game',
        appName: '1234',
        runner: 'legendary',
        type: 'launch'
      },
      rotate: true
    },
    { target: { kind: 'runner', runner: 'legendary' }, disabled: false }
  ],
  logSanitizer: 'gogAuth',
  abortId: '1234',
  observe: true
}

describe('runnerCall', () => {
  it('sends one launch_runner_call call carrying the request object and answers what Rust did', async () => {
    const reply = { stdout: 'ok', stderr: '', fullCommand: 'legendary launch' }
    const deps = fakeTransport(reply)
    expect(await runnerCall(deps, call)).toBe(reply)
    expect(deps.calls).toEqual([[RUST_LAUNCH_RUNNER_CALL, [call]]])
    expect(RUST_LAUNCH_RUNNER_CALL).toBe('launch_runner_call')
  })

  it('sends a request that passes the channel schema, and the schema refuses a stray key, a runner, a target kind and a short pair', async () => {
    const deps = fakeTransport({})
    await runnerCall(deps, call)
    for (const [, args] of deps.calls) {
      expect(() =>
        rustInvokeArgs[RUST_LAUNCH_RUNNER_CALL].parse(args)
      ).not.toThrow()
    }
    const schema = rustInvokeArgs[RUST_LAUNCH_RUNNER_CALL]
    const bare = {
      commandParts: ['x'],
      runner: { name: 'gog', bin: '/b', logPrefix: 'Gog' }
    }
    expect(() => schema.parse([bare])).not.toThrow()
    expect(() => schema.parse([{ ...bare, extra: 1 }])).toThrow()
    expect(() =>
      schema.parse([{ ...bare, runner: { ...bare.runner, name: 'epic' } }])
    ).toThrow()
    expect(() =>
      schema.parse([{ ...bare, logTargets: [{ target: { kind: '/etc/x' } }] }])
    ).toThrow()
    expect(() => schema.parse([{ ...bare, env: [['ONLY-KEY']] }])).toThrow()
    expect(() => schema.parse([{ ...bare, env: [['A', 'b', 'c']] }])).toThrow()
    expect(() => schema.parse([])).toThrow()
  })

  it('rejects with what the transport rejected with, with no TypeScript fallback', async () => {
    const deps = fakeTransport(new Error('launch_runner_call:not-ready'))
    await expect(runnerCall(deps, call)).rejects.toThrow(
      'launch_runner_call:not-ready'
    )
    expect(deps.calls).toHaveLength(1)
  })
})

/** A table over a transport, a registry with the listener installed and a way to send a frame as the shell does. */
function rig() {
  const deps = fakeTransport(true)
  const streams = createRunnerStreams({
    kill: (streamId) => runnerKill(deps, streamId)
  })
  const ipc = createIpcRegistry()
  registerRunnerOutputListener(ipc, streams)
  const send = (channel: string, ...args: unknown[]) => {
    for (const listener of ipc.getListeners(channel))
      listener(undefined, ...args)
  }
  return { deps, streams, ipc, send }
}

describe('registerRunnerOutputListener', () => {
  it('installs exactly the runnerOutput and runnerSpawned listeners', () => {
    const { ipc } = rig()
    expect([...ipc.listenerMap().keys()].sort()).toEqual([
      'runnerOutput',
      'runnerSpawned'
    ])
  })

  it('delivers frames given with seq 1 then 0 to the open stream as 0 then 1', () => {
    const { streams, send } = rig()
    const seen: string[] = []
    const streamId = streams.open({ onOutput: (chunk) => seen.push(chunk) })
    send('runnerOutput', { streamId, seq: 1, pipe: 'stdout', chunk: 'second' })
    expect(seen).toEqual([])
    send('runnerOutput', { streamId, seq: 0, pipe: 'stderr', chunk: 'first' })
    expect(seen).toEqual(['first', 'second'])
    send('runnerOutput', { streamId, seq: 2, pipe: 'stdout', chunk: 'third' })
    expect(seen).toEqual(['first', 'second', 'third'])
  })

  it('drops a malformed frame and never delivers it', () => {
    const { streams, send } = rig()
    const seen: string[] = []
    const streamId = streams.open({ onOutput: (chunk) => seen.push(chunk) })
    const good = { streamId, seq: 0, pipe: 'stdout', chunk: 'ok' }
    const malformed: unknown[][] = [
      [],
      [{ ...good, pipe: 'stdin' }],
      [{ ...good, seq: -1 }],
      [{ ...good, seq: 1.5 }],
      [{ ...good, chunk: 7 }],
      [{ ...good, streamId: '' }],
      [{ ...good, extra: 1 }],
      [{ streamId, seq: 0, pipe: 'stdout' }],
      [good, good],
      ['not an object']
    ]
    for (const args of malformed) send('runnerOutput', ...args)
    expect(seen).toEqual([])
    send('runnerOutput', good)
    expect(seen).toEqual(['ok'])
    // A malformed spawn frame is dropped the same way.
    const spawned: RunnerChildHandle[] = []
    const second = streams.open({ onSpawn: (child) => spawned.push(child) })
    for (const args of [
      [],
      [{ streamId: second, pid: 0 }],
      [{ streamId: second, pid: -3 }],
      [{ streamId: second, pid: 'x' }],
      [{ streamId: second, pid: 4, extra: 1 }]
    ])
      send('runnerSpawned', ...args)
    expect(spawned).toEqual([])
  })

  it('ignores a frame for a stream that is not open, or was closed, and delivers to the stream it names only', () => {
    const { streams, send } = rig()
    const a: string[] = []
    const b: string[] = []
    const idA = streams.open({ onOutput: (chunk) => a.push(chunk) })
    const idB = streams.open({ onOutput: (chunk) => b.push(chunk) })
    expect(idA).not.toBe(idB)
    send('runnerOutput', {
      streamId: 'never-opened',
      seq: 0,
      pipe: 'stdout',
      chunk: 'x'
    })
    send('runnerOutput', {
      streamId: idB,
      seq: 0,
      pipe: 'stdout',
      chunk: 'for b'
    })
    streams.close(idA)
    send('runnerOutput', {
      streamId: idA,
      seq: 0,
      pipe: 'stdout',
      chunk: 'late'
    })
    expect(a).toEqual([])
    expect(b).toEqual(['for b'])
    expect(streams.size()).toBe(1)
  })

  it('does not deliver a frame twice, and delivers what is held behind a gap when the stream closes', () => {
    const { streams, send } = rig()
    const seen: string[] = []
    const streamId = streams.open({ onOutput: (chunk) => seen.push(chunk) })
    const frame = (seq: number, chunk: string) => ({
      streamId,
      seq,
      pipe: 'stdout',
      chunk
    })
    send('runnerOutput', frame(0, 'a'))
    send('runnerOutput', frame(0, 'again'))
    // seq 1 never arrives (dropped as malformed), so 2 and 3 are held until the close.
    send('runnerOutput', frame(3, 'd'))
    send('runnerOutput', frame(2, 'c'))
    expect(seen).toEqual(['a'])
    streams.close(streamId)
    expect(seen).toEqual(['a', 'c', 'd'])
    expect(streams.size()).toBe(0)
  })

  it('goes on past a gap that too many later frames sit behind', () => {
    const { streams, send } = rig()
    const seen: string[] = []
    const streamId = streams.open({ onOutput: (chunk) => seen.push(chunk) })
    // seq 0 never arrives: with the bound reached the stream delivers from the oldest it holds.
    for (let seq = 1; seq <= 260; seq += 1) {
      send('runnerOutput', { streamId, seq, pipe: 'stdout', chunk: `c${seq}` })
    }
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0]).toBe('c1')
    expect(seen).toEqual(
      seen.slice().sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)))
    )
  })

  it('accepts the frames the schemas describe', () => {
    expect(() =>
      sidecarInternalSendArgs.runnerOutput.parse([
        { streamId: 's', seq: 0, pipe: 'stdout', chunk: '' }
      ])
    ).not.toThrow()
    expect(() =>
      sidecarInternalSendArgs.runnerSpawned.parse([
        { streamId: 's', pid: 4242 }
      ])
    ).not.toThrow()
  })
})

describe('runnerKill', () => {
  it('sends one launch_runner_kill call carrying the stream id and answers what Rust did', async () => {
    const deps = fakeTransport(true)
    expect(await runnerKill(deps, 'runner-stream-1')).toBe(true)
    expect(deps.calls).toEqual([[RUST_LAUNCH_RUNNER_KILL, ['runner-stream-1']]])
    expect(RUST_LAUNCH_RUNNER_KILL).toBe('launch_runner_kill')
    expect(() =>
      rustInvokeArgs[RUST_LAUNCH_RUNNER_KILL].parse(deps.calls[0]?.[1])
    ).not.toThrow()
  })

  it('answers false for an id no run holds, and rejects with what the transport rejected with', async () => {
    expect(await runnerKill(fakeTransport(false), 'gone')).toBe(false)
    await expect(
      runnerKill(fakeTransport(new Error('launch_runner_kill:not-ready')), 's')
    ).rejects.toThrow('launch_runner_kill:not-ready')
  })

  it('has a schema that takes one string and nothing else', () => {
    const schema = rustInvokeArgs[RUST_LAUNCH_RUNNER_KILL]
    expect(() => schema.parse(['s'])).not.toThrow()
    for (const args of [[], [1], ['s', 't'], [null]]) {
      expect(() => schema.parse(args)).toThrow()
    }
  })
})

describe('runnerAbort', () => {
  it('sends one launch_runner_abort call carrying the abort id and answers what Rust did', async () => {
    const deps = fakeTransport(true)
    expect(await runnerAbort(deps, '1234')).toBe(true)
    expect(deps.calls).toEqual([[RUST_LAUNCH_RUNNER_ABORT, ['1234']]])
    expect(RUST_LAUNCH_RUNNER_ABORT).toBe('launch_runner_abort')
    expect(() =>
      rustInvokeArgs[RUST_LAUNCH_RUNNER_ABORT].parse(deps.calls[0]?.[1])
    ).not.toThrow()
  })

  it('answers false for an id no run holds, and rejects with what the transport rejected with', async () => {
    expect(await runnerAbort(fakeTransport(false), 'gone')).toBe(false)
    await expect(
      runnerAbort(
        fakeTransport(new Error('launch_runner_abort:not-ready')),
        'a'
      )
    ).rejects.toThrow('launch_runner_abort:not-ready')
  })

  it('has a schema that takes one string and nothing else', () => {
    const schema = rustInvokeArgs[RUST_LAUNCH_RUNNER_ABORT]
    expect(() => schema.parse(['a'])).not.toThrow()
    for (const args of [[], [1], ['a', 'b'], [null]]) {
      expect(() => schema.parse(args)).toThrow()
    }
  })
})

describe('the spawned handle', () => {
  it('gives onSpawn a handle whose kill() sends launch_runner_kill with the stream id, and the next output frame carries the same handle', () => {
    const { deps, streams, send } = rig()
    const spawned: RunnerChildHandle[] = []
    const outputs: Array<[string, RunnerChildHandle]> = []
    const streamId = streams.open({
      onSpawn: (child) => spawned.push(child),
      onOutput: (chunk, child) => outputs.push([chunk, child])
    })
    send('runnerSpawned', { streamId, pid: 4242 })
    expect(spawned).toHaveLength(1)
    const [handle] = spawned
    expect(handle?.pid).toBe(4242)
    expect(handle?.exitCode).toBeNull()
    expect(handle?.signalCode).toBeNull()
    expect(deps.calls).toEqual([])
    expect(handle?.kill()).toBe(true)
    expect(deps.calls).toEqual([[RUST_LAUNCH_RUNNER_KILL, [streamId]]])
    send('runnerOutput', { streamId, seq: 0, pipe: 'stdout', chunk: 'x' })
    expect(outputs).toHaveLength(1)
    expect(outputs[0]?.[1]).toBe(handle)
    // A second spawn frame for the stream is ignored: onSpawn runs once.
    send('runnerSpawned', { streamId, pid: 9999 })
    expect(spawned).toHaveLength(1)
  })

  it('gives output that arrives before any spawn a pid-less handle that still kills the stream, and ignores a spawn for another stream', () => {
    const { deps, streams, send } = rig()
    const seen: RunnerChildHandle[] = []
    const streamId = streams.open({
      onOutput: (_chunk, child) => seen.push(child)
    })
    send('runnerSpawned', { streamId: 'never-opened', pid: 1 })
    send('runnerOutput', { streamId, seq: 0, pipe: 'stderr', chunk: 'early' })
    expect(seen[0]?.pid).toBeUndefined()
    expect(seen[0]?.kill()).toBe(true)
    expect(deps.calls).toEqual([[RUST_LAUNCH_RUNNER_KILL, [streamId]]])
  })

  it('does not let a kill that Rust rejects surface as an unhandled rejection', async () => {
    const streams = createRunnerStreams({
      kill: () => Promise.reject(new Error('launch_runner_kill:not-ready'))
    })
    const handles: RunnerChildHandle[] = []
    const streamId = streams.open({ onSpawn: (child) => handles.push(child) })
    streams.spawned({ streamId, pid: 7 })
    expect(handles[0]?.kill()).toBe(true)
    // Let the rejected promise settle; the process would fail on an unhandled one.
    await new Promise((resolve) => setImmediate(resolve))
  })
})

describe('wineCommandRun, winePathGet and scriptRun (88.2-17)', () => {
  const wineCall: WineCommandRequest = {
    streamId: 'runner-stream-2',
    gameSettings: { winePrefix: '/prefix' },
    commandParts: ['cmd', '/c', 'echo', 'x'],
    wait: true,
    protonVerb: 'runinprefix',
    options: { env: { ZED: '1' }, wrappers: ['gamemoderun'], trackKey: 'k' },
    logTargets: [{ target: { kind: 'general' }, rotate: true }],
    observe: true,
    spawnClass: 'game'
  }

  it('wineCommandRun sends one launch_wine_command call, answers what Rust did and rejects with the transport, with no fallback', async () => {
    const reply = { stdout: 'o', stderr: '', code: 0 }
    const deps = fakeTransport(reply)
    expect(await wineCommandRun(deps, wineCall)).toBe(reply)
    expect(deps.calls).toEqual([[RUST_LAUNCH_WINE_COMMAND, [wineCall]]])
    expect(RUST_LAUNCH_WINE_COMMAND).toBe('launch_wine_command')
    expect(() =>
      rustInvokeArgs[RUST_LAUNCH_WINE_COMMAND].parse(deps.calls[0]?.[1])
    ).not.toThrow()

    const down = fakeTransport(new Error('launch_wine_command:not-ready'))
    await expect(wineCommandRun(down, wineCall)).rejects.toThrow('not-ready')
    expect(down.calls).toHaveLength(1)
  })

  it('the wine command schema refuses a stray key, an options key it does not read, a bad spawn class and a settings value that is not an object', () => {
    const schema = rustInvokeArgs[RUST_LAUNCH_WINE_COMMAND]
    const bare = { commandParts: ['x'] }
    expect(() => schema.parse([bare])).not.toThrow()
    expect(() => schema.parse([{ ...bare, extra: 1 }])).toThrow()
    expect(() =>
      schema.parse([{ ...bare, options: { abortId: 'a' } }])
    ).toThrow()
    expect(() => schema.parse([{ ...bare, spawnClass: 'daemon' }])).toThrow()
    expect(() => schema.parse([{ ...bare, gameSettings: '/etc/x' }])).toThrow()
    expect(() => schema.parse([{ commandParts: 'x' }])).toThrow()
    expect(() => schema.parse([])).toThrow()
  })

  it('winePathGet sends one launch_wine_path call and the schema takes the two variants only', async () => {
    const deps = fakeTransport('/unix/path')
    const request = {
      path: 'C:\\x',
      gameSettings: { winePrefix: '/p' },
      variant: 'win' as const
    }
    expect(await winePathGet(deps, request)).toBe('/unix/path')
    expect(deps.calls).toEqual([[RUST_LAUNCH_WINE_PATH, [request]]])
    expect(RUST_LAUNCH_WINE_PATH).toBe('launch_wine_path')
    const schema = rustInvokeArgs[RUST_LAUNCH_WINE_PATH]
    expect(() => schema.parse([request])).not.toThrow()
    expect(() => schema.parse([{ ...request, variant: 'posix' }])).toThrow()
    expect(() => schema.parse([{ ...request, extra: 1 }])).toThrow()
    expect(() => schema.parse([{ path: 'x' }])).toThrow()
  })

  it('scriptRun sends one launch_script_run call, passes the error text through and the schema takes the two stages only', async () => {
    const request: ScriptRunRequest = {
      scriptPath: '/s.sh',
      stage: 'after',
      appName: 'a',
      runner: 'gog',
      title: 'T',
      settingsJson: '{"a":1}',
      infoJson: '{"b":2}',
      verbose: true,
      logTarget: { target: { kind: 'runner', runner: 'gog' }, rotate: true }
    }
    const deps = fakeTransport(true)
    expect(await scriptRun(deps, request)).toBe(true)
    expect(deps.calls).toEqual([[RUST_LAUNCH_SCRIPT_RUN, [request]]])
    expect(RUST_LAUNCH_SCRIPT_RUN).toBe('launch_script_run')
    const schema = rustInvokeArgs[RUST_LAUNCH_SCRIPT_RUN]
    expect(() => schema.parse([request])).not.toThrow()
    expect(() => schema.parse([{ ...request, stage: 'during' }])).toThrow()
    expect(() => schema.parse([{ ...request, extra: 1 }])).toThrow()
    expect(() => schema.parse([{ ...request, settingsJson: {} }])).toThrow()

    const failed = fakeTransport(new Error('No such file (os error 2)'))
    await expect(scriptRun(failed, request)).rejects.toThrow(
      'No such file (os error 2)'
    )
  })
})
