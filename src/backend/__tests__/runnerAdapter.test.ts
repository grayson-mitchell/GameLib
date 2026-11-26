/**
 * The commandRunner-shaped adapter over the runner transport (Phase 88.2, 88.2-16, D-02). The transport is a fake
 * `requestRustInvoke`; the listener, the stream table and the log writer are the real ones, so what is proved is the order
 * a caller sees: the flush before the invoke, the output frames before the reply, and each writer handed off once.
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import { RUST_LAUNCH_RUNNER_CALL } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import { createRunnerStreams } from 'backend/runnerStream'
import {
  registerRunnerOutputListener,
  runnerKill
} from 'backend/launchrust/runner'
import LogWriter from 'backend/logger/targetWriter'
import type { RunnerProps } from 'backend/commandRunner'
import type { LogFrameTarget } from 'common/types/sidecarTransport'

import { createRunnerAdapter, settleExecResult } from '../runnerAdapter'
import type { RunnerAdapterCallOptions } from '../runnerAdapter'

const RUNNER_TARGET: LogFrameTarget = { kind: 'runner', runner: 'legendary' }
const GAME_TARGET: LogFrameTarget = {
  kind: 'game',
  appName: 'Fortnite',
  runner: 'legendary',
  type: 'install'
}

const runnerProps: RunnerProps = {
  name: 'legendary',
  logPrefix: 'Legendary' as RunnerProps['logPrefix'],
  bin: 'legendary',
  dir: '/opt/legendary'
}

const RESULT = {
  stdout: 'out',
  stderr: '',
  fullCommand: '/opt/legendary/legendary install Fortnite'
}

interface Rig {
  adapter: ReturnType<typeof createRunnerAdapter>
  events: string[]
  invokes: Array<{ channel: string; args: unknown[] }>
  runnerWriter: LogWriter
  streams: ReturnType<typeof createRunnerStreams>
}

/**
 * `behaviour` runs in place of the Rust call: it is handed the call's `streamId` and a `send` that delivers a frame
 * through the real listener, as the shell does ahead of the reply, and answers what the reply is.
 */
function rig(
  behaviour: (
    streamId: string | undefined,
    send: (channel: string, ...args: unknown[]) => void
  ) => unknown = () => RESULT
): Rig {
  const events: string[] = []
  const invokes: Rig['invokes'] = []
  const deps = {
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      events.push('invoke')
      invokes.push({ channel, args })
      const [request] = args as [{ streamId?: string }]
      return Promise.resolve(behaviour(request.streamId, send))
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
  const runnerWriter = new LogWriter(RUNNER_TARGET, false)
  const adapter = createRunnerAdapter({
    ...deps,
    streams,
    getRunnerLogWriter: () => runnerWriter,
    flushLogs: () =>
      new Promise<void>((resolve) => {
        // Resolves on a later turn, so an invoke sent without waiting would be seen first.
        setTimeout(() => {
          events.push('flushed')
          resolve()
        }, 5)
      })
  })
  return { adapter, events, invokes, runnerWriter, streams }
}

/** The `index`th call the fake transport got. */
function invokeAt(r: Rig, index: number): { channel: string; args: unknown[] } {
  const invoke = r.invokes[index]
  if (!invoke) throw new Error(`no call ${index}`)
  return invoke
}

describe('createRunnerAdapter.callRunner', () => {
  it('delivers every output frame to onOutput, in order, before the call resolves', async () => {
    const r = rig((streamId, send) => {
      send('runnerSpawned', { streamId, pid: 4242 })
      send('runnerOutput', {
        streamId,
        seq: 1,
        pipe: 'stderr',
        chunk: 'second'
      })
      send('runnerOutput', { streamId, seq: 0, pipe: 'stdout', chunk: 'first' })
      return RESULT
    })
    const seen: string[] = []
    const spawned: Array<number | undefined> = []
    const options: RunnerAdapterCallOptions = {
      onOutput: (chunk) => {
        seen.push(chunk)
        r.events.push(`output:${chunk}`)
      },
      onSpawn: (child) => spawned.push(child.pid)
    }
    const result = await r.adapter.callRunner(
      ['install', 'Fortnite'],
      runnerProps,
      options
    )
    r.events.push('resolved')

    expect(seen).toEqual(['first', 'second'])
    expect(spawned).toEqual([4242])
    expect(r.events).toEqual([
      'flushed',
      'invoke',
      'output:first',
      'output:second',
      'resolved'
    ])
    expect(result).toEqual(RESULT)
    // The stream is closed when the call settles.
    expect(r.streams.size()).toBe(0)
  })

  it('awaits the log flush before it sends the call', async () => {
    const r = rig()
    await r.adapter.callRunner(['list'], runnerProps, {})
    expect(r.events).toEqual(['flushed', 'invoke'])
  })

  it('appends the runner writer to the caller writers and hands each off, the runner writer last, once', async () => {
    const r = rig()
    const gameWriter = new LogWriter(GAME_TARGET, false)
    const options: RunnerAdapterCallOptions = { logWriters: [gameWriter] }
    await r.adapter.callRunner(['install', 'Fortnite'], runnerProps, options)

    expect(options.logWriters).toEqual([gameWriter, r.runnerWriter])
    const { channel, args } = invokeAt(r, 0)
    expect(channel).toBe(RUST_LAUNCH_RUNNER_CALL)
    const [request] = args as [{ logTargets: unknown }]
    expect(request.logTargets).toEqual([
      { target: GAME_TARGET, disabled: false, rotate: true },
      { target: RUNNER_TARGET, disabled: false, rotate: true }
    ])

    // A second call hands the same writers off with their rotation spent.
    await r.adapter.callRunner(['install', 'Fortnite'], runnerProps, {
      logWriters: [gameWriter]
    })
    const second = invokeAt(r, 1)
    expect((second.args[0] as { logTargets: unknown }).logTargets).toEqual([
      { target: GAME_TARGET, disabled: false, rotate: false },
      { target: RUNNER_TARGET, disabled: false, rotate: false }
    ])
  })

  it('does not hand off a closed writer', async () => {
    const r = rig()
    const closed = new LogWriter(GAME_TARGET, false)
    await closed.close()
    await r.adapter.callRunner(['list'], runnerProps, { logWriters: [closed] })
    const [request] = invokeAt(r, 0).args as [
      { logTargets: Array<{ target: LogFrameTarget }> }
    ]
    expect(request.logTargets.map((t) => t.target)).toEqual([RUNNER_TARGET])
  })

  it('sends a request the zod schema accepts, with env as pairs and no stream when nothing is watched', async () => {
    const r = rig()
    await r.adapter.callRunner(['install', 'Fortnite'], runnerProps, {
      env: { ZED: '1', GONE: undefined, ALPHA: '2' },
      wrappers: ['gamemoderun'],
      logMessagePrefix: 'Installing',
      abortId: 'Fortnite',
      trackKey: 'key',
      cwd: '/tmp',
      skipErrorHandler: true
    })
    const { args } = invokeAt(r, 0)
    const parsed = rustInvokeArgs[RUST_LAUNCH_RUNNER_CALL].parse(args)
    expect(parsed[0]).toMatchObject({
      commandParts: ['install', 'Fortnite'],
      runner: {
        name: 'legendary',
        bin: 'legendary',
        dir: '/opt/legendary',
        logPrefix: 'Legendary'
      },
      env: [
        ['ZED', '1'],
        ['ALPHA', '2']
      ],
      wrappers: ['gamemoderun'],
      logMessagePrefix: 'Installing',
      abortId: 'Fortnite',
      trackKey: 'key',
      cwd: '/tmp',
      skipErrorHandler: true
    })
    expect(parsed[0]).not.toHaveProperty('streamId')
    expect(parsed[0]).not.toHaveProperty('observe')
  })

  it('opens a stream and sends observe with its id when only a spawn observer is set', async () => {
    const r = rig()
    await r.adapter.callRunner(['launch', 'x'], runnerProps, {
      onSpawn: () => undefined
    })
    const [request] = invokeAt(r, 0).args as [
      { streamId?: string; observe?: boolean }
    ]
    expect(request.streamId).toBe('runner-stream-1')
    expect(request.observe).toBe(true)
  })

  it('drops empty command parts, as the TypeScript did', async () => {
    const r = rig()
    await r.adapter.callRunner(
      ['install', '', 'Fortnite', undefined as unknown as string],
      runnerProps,
      {}
    )
    const [request] = invokeAt(r, 0).args as [{ commandParts: string[] }]
    expect(request.commandParts).toEqual(['install', 'Fortnite'])
  })

  it('sends a named sanitizer for the function it matches, and refuses one it does not know', async () => {
    const gogSanitizer = (line: string) => line
    const stranger = (line: string) => line
    const events: unknown[] = []
    const streams = createRunnerStreams({ kill: () => Promise.resolve(true) })
    const adapter = createRunnerAdapter({
      requestRustInvoke: ((_channel: string, args: unknown[]) => {
        events.push(args[0])
        return Promise.resolve(RESULT)
      }) as unknown as RustInvokeDeps['requestRustInvoke'],
      streams,
      getRunnerLogWriter: () => new LogWriter(RUNNER_TARGET, false),
      flushLogs: () => Promise.resolve(),
      logSanitizers: { gogAuth: gogSanitizer }
    })
    await adapter.callRunner(['auth'], runnerProps, {
      logSanitizer: gogSanitizer
    })
    expect(events[0]).toMatchObject({ logSanitizer: 'gogAuth' })
    await expect(
      adapter.callRunner(['auth'], runnerProps, { logSanitizer: stranger })
    ).rejects.toThrow('log sanitizer')
    expect(events).toHaveLength(1)
  })

  it('closes the stream and rejects when the call could not be made', async () => {
    const r = rig(() => {
      throw new Error('launch_runner_call:not-ready')
    })
    await expect(
      r.adapter.callRunner(['list'], runnerProps, { onOutput: () => undefined })
    ).rejects.toThrow('launch_runner_call:not-ready')
    expect(r.streams.size()).toBe(0)
  })

  it('rejects an answer that is not a command result', async () => {
    const r = rig(() => 'nope')
    await expect(
      r.adapter.callRunner(['list'], runnerProps, {})
    ).rejects.toThrow('not a command result')
  })
})

describe('settleExecResult', () => {
  it('hands on a result as it came, with abort and error', () => {
    const aborted = {
      stdout: '',
      stderr: '',
      fullCommand: 'x',
      abort: true
    }
    expect(settleExecResult(aborted)).toBe(aborted)
    const failed = { stdout: '', stderr: 'bad', error: 'bad' }
    expect(settleExecResult(failed)).toBe(failed)
  })

  it.each([null, undefined, 'x', 3, [], {}, { stdout: 'a' }, { stderr: 'a' }])(
    'refuses %j',
    (reply) => {
      expect(() => settleExecResult(reply)).toThrow('not a command result')
    }
  )
})
