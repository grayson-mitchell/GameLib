/**
 * The commandRunner-shaped adapter over the runner transport (Phase 88.2, 88.2-16, D-02). The transport is a fake
 * `requestRustInvoke`; the listener, the stream table and the log writer are the real ones, so what is proved is the order
 * a caller sees: the flush before the invoke, the output frames before the reply, and each writer handed off once.
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import {
  RUST_LAUNCH_RUNNER_CALL,
  RUST_LAUNCH_WINE_COMMAND,
  RUST_LAUNCH_WINE_PATH
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import { createRunnerStreams } from 'backend/runnerStream'
import {
  registerRunnerOutputListener,
  runnerKill
} from 'backend/launchrust/runner'
import LogWriter from 'backend/logger/targetWriter'
import type { CommandRunner } from 'backend/services/types'
import type { GameSettings } from 'common/types'
import type { LogFrameTarget } from 'common/types/sidecarTransport'

import {
  createRunnerAdapter,
  settleExecResult,
  settleWineCommandResult
} from '../runnerAdapter'
import type { RunnerAdapterCallOptions, RunnerProps } from '../runnerAdapter'

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

  it('sends the named sanitizer the caller asks for, and none when it asks for none (88.2-22)', async () => {
    const events: unknown[] = []
    const streams = createRunnerStreams({ kill: () => Promise.resolve(true) })
    const adapter = createRunnerAdapter({
      requestRustInvoke: ((_channel: string, args: unknown[]) => {
        events.push(args[0])
        return Promise.resolve(RESULT)
      }) as unknown as RustInvokeDeps['requestRustInvoke'],
      streams,
      getRunnerLogWriter: () => new LogWriter(RUNNER_TARGET, false),
      flushLogs: () => Promise.resolve()
    })
    await adapter.callRunner(['auth'], runnerProps, {
      logSanitizer: 'gogAuth'
    })
    await adapter.callRunner(['auth'], runnerProps, {
      logSanitizer: 'nileAuth'
    })
    await adapter.callRunner(['list'], runnerProps, {})
    expect(events[0]).toMatchObject({ logSanitizer: 'gogAuth' })
    expect(events[1]).toMatchObject({ logSanitizer: 'nileAuth' })
    expect(events[2]).not.toHaveProperty('logSanitizer')
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

const WINE_SETTINGS = {
  winePrefix: '/prefix',
  wineVersion: { bin: '/wine/bin/wine', name: 'Wine', type: 'wine' },
  verboseLogs: true,
  beforeLaunchScriptPath: '/scripts/before.sh',
  afterLaunchScriptPath: '/scripts/after.sh'
} as unknown as GameSettings

describe('createRunnerAdapter.runWineCommand', () => {
  it('leaves the caller commandParts, wrappers and options untouched', async () => {
    const r = rig(() => ({ stdout: 'ok', stderr: '', code: 0 }))
    const commandParts = ['cmd', '/c', 'echo', 'x']
    const wrappers = ['gamemoderun', 'mangohud']
    const options = {
      env: { ZED: '1', GONE: undefined },
      wrappers,
      trackKey: 'key-1'
    }
    const snapshot = JSON.stringify({ commandParts, wrappers, options })
    const result = await r.adapter.runWineCommand({
      gameSettings: WINE_SETTINGS,
      commandParts,
      options
    })
    expect(result).toEqual({ stdout: 'ok', stderr: '', code: 0 })
    expect(JSON.stringify({ commandParts, wrappers, options })).toBe(snapshot)
    expect(commandParts).toEqual(['cmd', '/c', 'echo', 'x'])
    expect(wrappers).toEqual(['gamemoderun', 'mangohud'])

    const { channel, args } = invokeAt(r, 0)
    expect(channel).toBe(RUST_LAUNCH_WINE_COMMAND)
    const parsed = rustInvokeArgs[RUST_LAUNCH_WINE_COMMAND].parse(args)
    expect(parsed[0]).toMatchObject({
      commandParts: ['cmd', '/c', 'echo', 'x'],
      options: { env: { ZED: '1' }, wrappers, trackKey: 'key-1' },
      spawnClass: 'helper'
    })
    // A copy, never the caller's own list.
    const sent = (args[0] as { commandParts: string[] }).commandParts
    expect(sent).not.toBe(commandParts)
    expect(parsed[0]).not.toHaveProperty('streamId')
    expect(parsed[0]).not.toHaveProperty('observe')
  })

  it('sends the flags, the wrapper-less options as absent and the game spawn class', async () => {
    const r = rig(() => ({ stdout: '', stderr: '' }))
    await r.adapter.runWineCommand({
      commandParts: ['winecfg'],
      wait: true,
      protonVerb: 'runinprefix',
      installFolderName: 'Folder',
      gameInstallPath: '/games/x',
      startFolder: '/games/x',
      skipPrefixCheckIKnowWhatImDoing: true,
      ignoreLogging: true,
      resolveOnExit: true,
      options: { spawnClass: 'game', logMessagePrefix: 'Launching' }
    })
    const [request] = invokeAt(r, 0).args as [Record<string, unknown>]
    expect(request).toEqual({
      commandParts: ['winecfg'],
      wait: true,
      protonVerb: 'runinprefix',
      installFolderName: 'Folder',
      gameInstallPath: '/games/x',
      startFolder: '/games/x',
      skipPrefixCheckIKnowWhatImDoing: true,
      ignoreLogging: true,
      resolveOnExit: true,
      logMessagePrefix: 'Launching',
      logTargets: [],
      spawnClass: 'game'
    })
    expect(() =>
      rustInvokeArgs[RUST_LAUNCH_WINE_COMMAND].parse([request])
    ).not.toThrow()
  })

  it('delivers the output frames to onOutput in order and the spawn to onSpawn, before the call resolves', async () => {
    const r = rig((streamId, send) => {
      send('runnerSpawned', { streamId, pid: 77 })
      send('runnerOutput', { streamId, seq: 1, pipe: 'stderr', chunk: 'two' })
      send('runnerOutput', { streamId, seq: 0, pipe: 'stdout', chunk: 'one' })
      return { stdout: 'one', stderr: 'two', code: 0 }
    })
    const seen: string[] = []
    const spawned: Array<number | undefined> = []
    await r.adapter.runWineCommand({
      commandParts: ['x'],
      onSpawn: (child) => spawned.push(child.pid),
      options: { onOutput: (chunk) => seen.push(chunk) }
    })
    expect(seen).toEqual(['one', 'two'])
    expect(spawned).toEqual([77])
    const [request] = invokeAt(r, 0).args as [
      { streamId?: string; observe?: boolean }
    ]
    expect(request.streamId).toBe('runner-stream-1')
    expect(request.observe).toBe(true)
    expect(r.streams.size()).toBe(0)
  })

  it('flushes the logs, then hands each caller writer off once and does not add a runner writer', async () => {
    const r = rig(() => ({ stdout: '', stderr: '' }))
    const writer = new LogWriter(GAME_TARGET, false)
    await r.adapter.runWineCommand({
      commandParts: ['x'],
      options: { logWriters: [writer] }
    })
    expect(r.events).toEqual(['flushed', 'invoke'])
    const [request] = invokeAt(r, 0).args as [{ logTargets: unknown }]
    expect(request.logTargets).toEqual([
      { target: GAME_TARGET, disabled: false, rotate: true }
    ])
    expect(r.runnerWriter.handOff()).toMatchObject({ rotate: true })
  })

  it('answers a refused wine without a code, closes the stream and rejects a call that could not be made', async () => {
    const refused = rig(() => ({ stdout: '', stderr: 'Invalid wine' }))
    expect(
      await refused.adapter.runWineCommand({ commandParts: ['x'] })
    ).toEqual({ stdout: '', stderr: 'Invalid wine' })

    const down = rig(() => {
      throw new Error('launch_wine_command:not-ready')
    })
    await expect(
      down.adapter.runWineCommand({
        commandParts: ['x'],
        options: { onOutput: () => undefined }
      })
    ).rejects.toThrow('launch_wine_command:not-ready')
    expect(down.streams.size()).toBe(0)
  })

  it('is assignable to the CommandRunner type every manager takes', () => {
    const r = rig()
    const asRunner: CommandRunner = r.adapter
    expect(Object.keys(asRunner).sort()).toEqual([
      'callRunner',
      'getWinePath',
      'runWineCommand'
    ])
  })
})

describe('settleWineCommandResult', () => {
  it('hands on a result with a code, a null code or none', () => {
    for (const reply of [
      { stdout: '', stderr: '', code: 0 },
      { stdout: '', stderr: '', code: null },
      { stdout: '', stderr: 'Invalid wine' }
    ]) {
      expect(settleWineCommandResult(reply)).toBe(reply)
    }
  })

  it.each([
    null,
    'x',
    {},
    { stdout: 'a' },
    { stdout: 'a', stderr: 'b', code: 'zero' }
  ])('refuses %j', (reply) => {
    expect(() => settleWineCommandResult(reply)).toThrow('not a command result')
  })
})

describe('createRunnerAdapter.getWinePath', () => {
  it('sends the path, the settings and the variant, and answers the string', async () => {
    const r = rig(() => '/unix/path')
    expect(
      await r.adapter.getWinePath({
        path: 'C:\\Windows',
        gameSettings: WINE_SETTINGS,
        variant: 'unix'
      })
    ).toBe('/unix/path')
    const { channel, args } = invokeAt(r, 0)
    expect(channel).toBe(RUST_LAUNCH_WINE_PATH)
    expect(() =>
      rustInvokeArgs[RUST_LAUNCH_WINE_PATH].parse(args)
    ).not.toThrow()
    expect(args[0]).toMatchObject({ path: 'C:\\Windows', variant: 'unix' })
    // No flush and no log: it asks winepath and nothing else.
    expect(r.events).toEqual(['invoke'])
  })

  it('leaves the variant out when it is not given, answers an empty path as empty and refuses a reply that is not text', async () => {
    const r = rig(() => '')
    expect(
      await r.adapter.getWinePath({ path: '/x', gameSettings: WINE_SETTINGS })
    ).toBe('')
    expect(invokeAt(r, 0).args[0]).not.toHaveProperty('variant')
    const bad = rig(() => ({ nope: true }))
    await expect(
      bad.adapter.getWinePath({ path: '/x', gameSettings: WINE_SETTINGS })
    ).rejects.toThrow('not a path')
  })
})
