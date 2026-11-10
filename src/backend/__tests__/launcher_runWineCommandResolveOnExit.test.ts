/**
 * debug/shared-redist-slow-wine-calls: WineCommandArgs.resolveOnExit.
 *
 * Root cause: runWineCommand settled on the child's `close` event, which waits for every holder
 * of the piped stdout/stderr. The wineserver a wine call starts inherits those pipes and lingers
 * seconds after the command itself exited, so every call paid that extra time.
 *
 * The fake child below models exactly that: `exit` fires first, `close` only later (when the
 * grandchild releases the pipes). No real process is spawned, so no fake-HOME profile is needed.
 *
 * Mock implementations are assigned in beforeEach (jest.config.js sets resetMocks: true).
 */
import { EventEmitter } from 'events'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Backend: 'Backend' },
  getRunnerLogWriter: jest.fn(),
  createGameLogWriter: jest.fn()
}))

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
  exec: jest.fn(),
  execFile: jest.fn(),
  execSync: jest.fn()
}))

import { spawn } from 'child_process'
import { runWineCommand, runScriptForGame } from 'backend/launcher'
import * as trackedChildren from 'backend/trackedChildren'
import type { GameInfo, GameSettings } from 'common/types'
import type LogWriter from 'backend/logger/log_writer'

class FakeStream extends EventEmitter {
  destroy = jest.fn()
  setEncoding() {
    return this
  }
}

class FakeChildProcess extends EventEmitter {
  killed = false
  stdout = new FakeStream()
  stderr = new FakeStream()
}

// /bin/sh exists on every platform this suite runs on, so validWine() accepts it.
const SETTINGS = {
  winePrefix: '/nonexistent-prefix',
  wineCrossoverBottle: 'GameLibSteamBridge-0',
  wineVersion: { type: 'crossover', name: 'fake', bin: '/bin/sh' }
} as unknown as GameSettings

const flush = () => new Promise<void>((r) => setImmediate(r))

let child: FakeChildProcess

beforeEach(() => {
  child = new FakeChildProcess()
  ;(spawn as unknown as jest.Mock).mockReturnValue(child)
})

function run(resolveOnExit?: boolean) {
  let settled = false
  const promise = runWineCommand({
    commandParts: ['reg', 'query', 'HKCU'],
    gameSettings: SETTINGS,
    wait: true,
    skipPrefixCheckIKnowWhatImDoing: true,
    ...(resolveOnExit === undefined ? {} : { resolveOnExit })
  }).then((r) => {
    settled = true
    return r
  })
  return { promise, isSettled: () => settled }
}

describe('runWineCommand resolveOnExit', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }))
  afterEach(() => jest.useRealTimers())

  it('settles shortly after exit while a grandchild still holds the pipes (close never fires)', async () => {
    const { promise, isSettled } = run(true)
    await flush()

    child.stdout.emit('data', 'HKEY_CURRENT_USER\n')
    child.emit('exit', 0, null)
    await flush()
    expect(isSettled()).toBe(false) // still inside the drain grace

    jest.advanceTimersByTime(250)
    const res = await promise

    expect(res.stdout).toBe('HKEY_CURRENT_USER\n')
    expect(res.code).toBe(0)
    expect(child.stdout.destroy).toHaveBeenCalled()
    expect(child.stderr.destroy).toHaveBeenCalled()
  })

  it('settles exactly once when close arrives after the grace timer fired', async () => {
    const { promise } = run(true)
    await flush()

    child.emit('exit', 0, null)
    jest.advanceTimersByTime(250)
    const res = await promise
    child.emit('close', 0, null)
    await flush()

    expect(res.code).toBe(0)
  })

  it('an early close settles without waiting for the grace timer', async () => {
    const { promise } = run(true)
    await flush()

    child.emit('exit', 0, null)
    child.emit('close', 0, null)
    const res = await promise

    expect(res.code).toBe(0)
    expect(child.stdout.destroy).not.toHaveBeenCalled()
  })

  it('default: exit alone never settles; only close does', async () => {
    const { promise, isSettled } = run()
    await flush()

    child.emit('exit', 0, null)
    jest.advanceTimersByTime(60_000)
    await flush()
    expect(isSettled()).toBe(false)
    expect(child.stdout.destroy).not.toHaveBeenCalled()

    child.emit('close', 0, null)
    const res = await promise
    expect(res.code).toBe(0)
  })

  it('resolveOnExit: false behaves as the default', async () => {
    const { promise, isSettled } = run(false)
    await flush()

    child.emit('exit', 0, null)
    jest.advanceTimersByTime(60_000)
    await flush()
    expect(isSettled()).toBe(false)

    child.emit('close', 0, null)
    await promise
  })

  it('59-REVIEW WR-01: output written after the drain grace is lost while the exit code survives', async () => {
    const { promise } = run(true)
    await flush()

    child.emit('exit', 1, null)
    jest.advanceTimersByTime(250)
    const res = await promise
    child.stderr.emit(
      'data',
      'reg: Unable to find the specified registry value'
    )
    await flush()

    expect(res.code).toBe(1)
    expect(res.stderr).toBe('')
    expect(child.stderr.destroy).toHaveBeenCalled()
  })
})

describe('Layer-1 characterization (66.1 MH-4): runWineCommand', () => {
  const SERVER_SETTINGS = {
    ...SETTINGS,
    wineVersion: {
      type: 'crossover',
      name: 'fake',
      bin: '/bin/sh',
      wineserver: '/bin/sh'
    }
  } as unknown as GameSettings

  const call = (
    extra: Partial<Parameters<typeof runWineCommand>[0]> = {},
    settings: GameSettings = SETTINGS
  ) =>
    runWineCommand({
      commandParts: ['reg', 'query', 'HKCU'],
      gameSettings: settings,
      skipPrefixCheckIKnowWhatImDoing: true,
      ...extra
    })

  afterEach(() => jest.restoreAllMocks())

  it('resolves { stdout, stderr, code } once the child closes', async () => {
    const promise = call()
    await flush()
    child.stdout.emit('data', 'out-1 ')
    child.stdout.emit('data', 'out-2')
    child.stderr.emit('data', 'err-1')
    child.emit('close', 3, null)
    expect(await promise).toEqual({
      stdout: 'out-1 out-2',
      stderr: 'err-1',
      code: 3
    })
  })

  it('calls onSpawn exactly once with the spawned child', async () => {
    const onSpawn = jest.fn()
    const promise = call({ onSpawn })
    await flush()
    expect(onSpawn).toHaveBeenCalledTimes(1)
    expect(onSpawn).toHaveBeenCalledWith(child)
    child.emit('close', 0, null)
    await promise
    expect(onSpawn).toHaveBeenCalledTimes(1)
  })

  it('calls onOutput for both streams with the chunk and the child', async () => {
    const onOutput = jest.fn()
    const promise = call({ options: { onOutput } })
    await flush()
    child.stdout.emit('data', 'to-stdout')
    child.stderr.emit('data', 'to-stderr')
    child.emit('close', 0, null)
    await promise
    expect(onOutput).toHaveBeenCalledWith('to-stdout', child)
    expect(onOutput).toHaveBeenCalledWith('to-stderr', child)
    expect(onOutput).toHaveBeenCalledTimes(2)
  })

  it('writes a "Wine Command:" header to each log writer before any output', async () => {
    const make = () => ({ writeString: jest.fn() })
    const [w1, w2] = [make(), make()]
    const promise = call({
      options: { logWriters: [w1, w2] as unknown as LogWriter[] }
    })
    await flush()
    child.stdout.emit('data', 'after-header')
    child.emit('close', 0, null)
    await promise
    for (const w of [w1, w2]) {
      expect(w.writeString.mock.calls[0]?.[0]).toMatch(/^Wine Command: /)
      expect(w.writeString).toHaveBeenCalledWith('after-header')
    }
  })

  it('wait: true runs `wineserver --wait` after close and resolves only after its close', async () => {
    const waitChild = new FakeChildProcess()
    ;(spawn as unknown as jest.Mock)
      .mockReturnValueOnce(child)
      .mockReturnValueOnce(waitChild)
    let settled = false
    const promise = call({ wait: true }, SERVER_SETTINGS).then((r) => {
      settled = true
      return r
    })
    await flush()
    expect(spawn).toHaveBeenCalledTimes(1)

    child.emit('close', 0, null)
    await flush()
    expect(spawn).toHaveBeenCalledTimes(2)
    const [bin, args] = (spawn as unknown as jest.Mock).mock.calls[1] as [
      string,
      string[]
    ]
    expect(bin).toBe('/bin/sh')
    expect(args).toEqual(['--wait'])
    expect(settled).toBe(false)

    waitChild.emit('close', 0, null)
    expect((await promise).code).toBe(0)
  })

  it('returns { stdout: "", stderr: "Invalid wine" } and spawns nothing for an invalid wine', async () => {
    const invalid = {
      ...SETTINGS,
      wineVersion: { type: 'crossover', name: 'gone', bin: '/nonexistent/wine' }
    } as unknown as GameSettings
    const res = await call({}, invalid)
    expect(res).toEqual({ stdout: '', stderr: 'Invalid wine' })
    expect(spawn).not.toHaveBeenCalled()
  })

  describe('track key precedence', () => {
    const tracked = async (extra: Parameters<typeof call>[0]) => {
      const track = jest.spyOn(trackedChildren, 'trackChild')
      const promise = call(extra)
      await flush()
      child.emit('close', 0, null)
      await promise
      return track.mock.calls[0]
    }

    it('prefers options.trackKey', async () => {
      expect(
        await tracked({
          options: { trackKey: 'tk' },
          installFolderName: 'folder'
        })
      ).toEqual([child, { runner: 'wine', key: 'tk' }])
    })

    it('falls back to installFolderName', async () => {
      expect(await tracked({ installFolderName: 'folder' })).toEqual([
        child,
        { runner: 'wine', key: 'folder' }
      ])
    })

    it('falls back to the winePrefix', async () => {
      expect(await tracked({})).toEqual([
        child,
        { runner: 'wine', key: '/nonexistent-prefix' }
      ])
    })
  })
})

describe('Layer-1 characterization (66.1 MH-4): runScriptForGame', () => {
  const gameInfo = {
    app_name: 'l1-app',
    title: 'L1 Title',
    runner: 'gog',
    install: { executable: 'game.exe', install_path: '/l1/install' }
  } as unknown as GameInfo
  const settings = (extra: Partial<GameSettings> = {}) =>
    ({
      winePrefix: '/l1/prefix',
      beforeLaunchScriptPath: '/l1/before.sh',
      afterLaunchScriptPath: '/l1/after.sh',
      ...extra
    }) as unknown as GameSettings
  const writer = () => ({
    writeString: jest.fn(),
    logError: jest.fn()
  })

  it('resolves true on exit while a grandchild still holds the pipes (close never fires)', async () => {
    const w = writer()
    const promise = runScriptForGame(
      gameInfo,
      settings(),
      'before',
      w as unknown as LogWriter
    )
    child.emit('exit', 0, null)
    expect(await promise).toBe(true)
  })

  it('rejects when the child emits error', async () => {
    const promise = runScriptForGame(
      gameInfo,
      settings(),
      'before',
      writer() as unknown as LogWriter
    )
    child.emit('error', new Error('spawn ENOENT'))
    await expect(promise).rejects.toThrow('spawn ENOENT')
  })

  it('writes output to the log writer only when verboseLogs is on', async () => {
    const quiet = writer()
    const p1 = runScriptForGame(
      gameInfo,
      settings(),
      'before',
      quiet as unknown as LogWriter
    )
    child.stdout.emit('data', 'hidden')
    child.emit('exit', 0, null)
    await p1
    expect(quiet.writeString).not.toHaveBeenCalled()

    child = new FakeChildProcess()
    ;(spawn as unknown as jest.Mock).mockReturnValue(child)
    const loud = writer()
    const p2 = runScriptForGame(
      gameInfo,
      settings({ verboseLogs: true }),
      'before',
      loud as unknown as LogWriter
    )
    child.stdout.emit('data', 'shown-out')
    child.stderr.emit('data', 'shown-err')
    child.emit('exit', 0, null)
    await p2
    expect(loud.writeString).toHaveBeenCalledWith('shown-out')
    expect(loud.writeString).toHaveBeenCalledWith('shown-err')
  })

  it('spawns the stage script with cwd = install_path and HEROIC_* env merged over process.env', async () => {
    process.env.L1_SCRIPT_SENTINEL = 'inherited'
    const promise = runScriptForGame(
      gameInfo,
      settings(),
      'after',
      writer() as unknown as LogWriter
    )
    child.emit('exit', 0, null)
    await promise
    const [script, spawnOpts] = (spawn as unknown as jest.Mock).mock
      .calls[0] as [string, { cwd: string; env: NodeJS.ProcessEnv }]
    expect(script).toBe('/l1/after.sh')
    expect(spawnOpts.cwd).toBe('/l1/install')
    expect(spawnOpts.env).toMatchObject({
      HEROIC_GAME_APP_NAME: 'l1-app',
      HEROIC_GAME_EXEC: 'game.exe',
      HEROIC_GAME_PREFIX: '/l1/prefix',
      HEROIC_GAME_RUNNER: 'gog',
      HEROIC_GAME_SCRIPT_STAGE: 'after',
      HEROIC_GAME_TITLE: 'L1 Title',
      L1_SCRIPT_SENTINEL: 'inherited'
    })
    expect(JSON.parse(spawnOpts.env.HEROIC_GAME_INFO ?? '{}')).toMatchObject({
      app_name: 'l1-app'
    })
    expect(spawnOpts.env.HEROIC_GAME_SETTINGS).toContain('/l1/prefix')
    delete process.env.L1_SCRIPT_SENTINEL
  })
})
