/**
 * debug/steam-install-slow-start (D-2 — GOG premature/un-rolled-back
 * installed.json write): root-cause coverage for callRunner()'s child
 * process `close` handler in launcher.ts.
 *
 * Root cause: the pre-fix `close` handler only rejected when the process was
 * terminated by an OS-level `signal` (and Node's own `child.killed` flag was
 * false). A process that exits with a NON-ZERO code but WITHOUT a signal —
 * e.g. gogdl catching SIGTERM (sent by utils.ts's killPattern() on app quit)
 * and shutting down gracefully with a failure exit code, or any ordinary
 * gogdl/legendary/nile internal failure — fell through untouched and was
 * unconditionally resolved as a SUCCESSFUL command, carrying no `.error`/
 * `.abort` flag at all. Every caller that gates a store write on
 * `res.abort`/`res.error` (most notably GOG's install(), games.ts) saw two
 * false values and proceeded as if the command had succeeded.
 *
 * These tests exercise the real, unmocked close-handler logic in
 * callRunner() via a fully faked `child_process.spawn` child, asserting the
 * exact ExecResult shape callers depend on.
 *
 * NOTE: every mock implementation below is (re-)assigned fresh in
 * beforeEach, NOT at jest.mock() factory-eval time — this jest.config.js
 * sets `resetMocks: true`, which strips any implementation set inline in a
 * jest.mock() factory before every test body runs (the same gotcha already
 * documented in __mocks__/electron.ts and main_window.test.ts).
 */

import { EventEmitter } from 'events'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Backend: 'Backend', Gog: 'Gog', Legendary: 'Legendary' },
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

import { spawn, exec, execFile } from 'child_process'
import { callRunner } from 'backend/launcher'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'
import { getRunnerLogWriter, createGameLogWriter } from 'backend/logger'

class FakeStream extends EventEmitter {
  setEncoding() {
    return this
  }
}

class FakeChildProcess extends EventEmitter {
  killed = false
  stdout = new FakeStream()
  stderr = new FakeStream()
}

let fakeChild: FakeChildProcess

function makeFakeLogWriter() {
  return {
    writeString: jest.fn(),
    logInfo: jest.fn().mockResolvedValue(undefined),
    logError: jest.fn().mockResolvedValue(undefined)
  }
}

const runner = {
  name: 'gog' as const,
  logPrefix: 'Gog' as never,
  bin: 'gogdl',
  dir: undefined
}

describe('callRunner close-handler exit-code classification (D-2 root cause)', () => {
  beforeEach(() => {
    fakeChild = new FakeChildProcess()
    ;(spawn as unknown as jest.Mock).mockReturnValue(fakeChild)
    ;(exec as unknown as jest.Mock).mockImplementation(
      (_cmd: string, cb?: (...args: unknown[]) => void) => cb?.(null, '', '')
    )
    ;(execFile as unknown as jest.Mock).mockImplementation(
      (_cmd: string, _args: unknown, cb?: (...args: unknown[]) => void) =>
        cb?.(null, '', '')
    )
    ;(getRunnerLogWriter as jest.Mock).mockReturnValue(makeFakeLogWriter())
    ;(createGameLogWriter as jest.Mock).mockResolvedValue(makeFakeLogWriter())
  })

  it('resolves as success (no .error/.abort) on a clean code=0 exit — no regression', async () => {
    const commandParts = ['download', 'clean-exit-appid']
    const promise = callRunner(commandParts, runner, {})

    process.nextTick(() => fakeChild.emit('close', 0, null))

    const res = await promise
    expect(res.error).toBeUndefined()
    expect(res.abort).toBeUndefined()
  })

  it('D-2 root cause: a non-zero exit code WITHOUT a signal is now surfaced as .error, not silently treated as success', async () => {
    const commandParts = ['download', 'nonzero-exit-appid']
    const promise = callRunner(commandParts, runner, {})

    process.nextTick(() => fakeChild.emit('close', 1, null))

    const res = await promise
    expect(res.error).toBeDefined()
    expect(res.abort).toBeUndefined()
  })

  it('a signal-terminated process (not internally killed) is still classified as .error (pre-existing behavior, unchanged)', async () => {
    const commandParts = ['download', 'signal-killed-appid']
    const promise = callRunner(commandParts, runner, {})

    process.nextTick(() => {
      fakeChild.killed = false
      fakeChild.emit('close', null, 'SIGTERM')
    })

    const res = await promise
    expect(res.error).toBeDefined()
    expect(res.abort).toBeUndefined()
  })

  it('a non-zero exit AFTER the matching abortController was aborted is classified as .abort, not .error', async () => {
    const commandParts = ['download', 'aborted-appid']
    const promise = callRunner(commandParts, runner, {
      abortId: 'aborted-appid'
    })

    process.nextTick(() => {
      callAbortController('aborted-appid')
      fakeChild.emit('close', 1, null)
    })

    const res = await promise
    expect(res.abort).toBe(true)
    expect(res.error).toBeUndefined()
  })

  it('a signal-terminated process AFTER abort() is still classified as .abort (existing signal path, unaffected by the new code-check branch)', async () => {
    const commandParts = ['download', 'aborted-signal-appid']
    const promise = callRunner(commandParts, runner, {
      abortId: 'aborted-signal-appid'
    })

    process.nextTick(() => {
      callAbortController('aborted-signal-appid')
      fakeChild.killed = false
      fakeChild.emit('close', null, 'SIGTERM')
    })

    const res = await promise
    expect(res.abort).toBe(true)
    expect(res.error).toBeUndefined()
  })
})
