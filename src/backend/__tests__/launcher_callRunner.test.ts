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

/**
 * 34.5-61 (F-34.5-G6-22 / F-34.5-G6-24) additions below the original D-2 suite:
 *
 * - "credential redaction (34.5-61)" drives the real nile `register` argv and a real GOG
 *   `--password` argv through the PRODUCTION `callRunner` path (both the non-PowerShell and
 *   the PowerShell `-ArgumentList` branches), asserting on the string `logInfo` actually
 *   received -- not on `getRunnerCallWithoutCredentials` in isolation, which would be a
 *   hand-rebuilt replica that can drift from the real call sites (the exact defect class
 *   `nileCredentialRedaction.test.ts`'s Group A shipped: it `jest.mock`s
 *   `runRunnerCommand` entirely and therefore never exercises `callRunner`).
 * - "census gate (34.5-61)" enumerates every credential-bearing `'--flag'` literal actually
 *   present in `src/backend` (excluding `__tests__`) with the same predicate this plan's own
 *   diagnosis section names, and asserts each one is a member of `getRunnerCallWithoutCredentials`'s
 *   redaction list -- so a FUTURE unredacted credential flag fails this test, rather than
 *   shipping silently. The redaction list itself is not exported, so it is read from source
 *   text (`launcher.ts`), the same technique `dxvkEvidenceLines.test.ts` uses for its own
 *   collapsed-source-text gate.
 */
import { EventEmitter } from 'events'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

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
import {
  getRunnerLogWriter,
  createGameLogWriter,
  logInfo
} from 'backend/logger'

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

describe('credential redaction through the production callRunner path (34.5-61, F-34.5-G6-22)', () => {
  beforeEach(() => {
    fakeChild = new FakeChildProcess()
    ;(spawn as unknown as jest.Mock).mockReturnValue(fakeChild)
    ;(getRunnerLogWriter as jest.Mock).mockReturnValue(makeFakeLogWriter())
    ;(createGameLogWriter as jest.Mock).mockResolvedValue(makeFakeLogWriter())
  })

  it('nile register argv: --code and --code-verifier both redact independently (neither swallows the other), plus --serial/--client-id', async () => {
    const commandParts = [
      'register',
      '--code',
      'SENTINEL_CODE_ac91f3',
      '--code-verifier',
      'SENTINEL_VERIFIER_7d02be',
      '--serial',
      'SENTINEL_SERIAL_11',
      '--client-id',
      'SENTINEL_CLIENT_22'
    ]
    const promise = callRunner(commandParts, runner, {})
    process.nextTick(() => fakeChild.emit('close', 0, null))
    await promise

    const serialized = JSON.stringify((logInfo as jest.Mock).mock.calls)
    expect(serialized).not.toContain('SENTINEL_CODE_ac91f3')
    expect(serialized).not.toContain('SENTINEL_VERIFIER_7d02be')
    expect(serialized).not.toContain('SENTINEL_SERIAL_11')
    expect(serialized).not.toContain('SENTINEL_CLIENT_22')
    // Positive shape: the redacted marker is present exactly once per flag, proving this
    // isn't merely a case of the whole line being dropped.
    expect(
      serialized.match(/<redacted>/g)?.length
    ).toBe(4)
  })

  it('GOG --password argv: raw private-branch password redacted (F-34.5-G6-24)', async () => {
    const commandParts = [
      'install',
      'someAppId',
      '--password',
      'SENTINEL_PW_xyz789'
    ]
    const promise = callRunner(commandParts, runner, {})
    process.nextTick(() => fakeChild.emit('close', 0, null))
    await promise

    const serialized = JSON.stringify((logInfo as jest.Mock).mock.calls)
    expect(serialized).not.toContain('SENTINEL_PW_xyz789')
    expect(serialized).toContain('<redacted>')
  })
})

describe('credential redaction: PowerShell -ArgumentList branch (34.5-61, F-34.5-G6-22)', () => {
  let winCallRunner: typeof callRunner
  let winLogInfo: jest.Mock
  let winSpawn: jest.Mock
  let winGetRunnerLogWriter: jest.Mock
  let winCreateGameLogWriter: jest.Mock
  let winSearchForExecutableOnPath: jest.Mock

  beforeAll(() => {
    jest.resetModules()
    jest.doMock('backend/constants/environment', () => ({
      ...jest.requireActual('backend/constants/environment'),
      isWindows: true
    }))
    jest.doMock('backend/utils/os/path', () => ({
      ...jest.requireActual('backend/utils/os/path'),
      searchForExecutableOnPath: jest.fn()
    }))
    /* eslint-disable @typescript-eslint/no-require-imports,
       @typescript-eslint/no-unsafe-member-access,
       @typescript-eslint/no-unsafe-assignment */
    winCallRunner = require('backend/launcher').callRunner
    const freshLogger = require('backend/logger')
    winLogInfo = freshLogger.logInfo
    winGetRunnerLogWriter = freshLogger.getRunnerLogWriter
    winCreateGameLogWriter = freshLogger.createGameLogWriter
    winSpawn = require('child_process').spawn
    winSearchForExecutableOnPath =
      require('backend/utils/os/path').searchForExecutableOnPath
    /* eslint-enable @typescript-eslint/no-require-imports,
       @typescript-eslint/no-unsafe-member-access,
       @typescript-eslint/no-unsafe-assignment */
  })

  // resetMocks:true (src/backend/jest.config.js) strips every mock's implementation
  // before EACH test body runs (see this file's header docstring) -- resolved values
  // set at jest.doMock() factory-eval time do not survive to the test body, so they
  // are re-applied here.
  beforeEach(() => {
    winSearchForExecutableOnPath.mockResolvedValue(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    )
  })

  afterAll(() => {
    jest.dontMock('backend/constants/environment')
    jest.dontMock('backend/utils/os/path')
    jest.resetModules()
  })

  it('redacts every added flag inside the -ArgumentList string, not just the array-member branch', async () => {
    class WinFakeStream extends EventEmitter {
      setEncoding() {
        return this
      }
    }
    class WinFakeChild extends EventEmitter {
      killed = false
      stdout = new WinFakeStream()
      stderr = new WinFakeStream()
    }
    const winFakeChild = new WinFakeChild()
    winSpawn.mockReturnValue(winFakeChild)
    winGetRunnerLogWriter.mockReturnValue(makeFakeLogWriter())
    winCreateGameLogWriter.mockResolvedValue(makeFakeLogWriter())

    const commandParts = [
      'register',
      '--code',
      'SENTINEL_CODE_ac91f3',
      '--code-verifier',
      'SENTINEL_VERIFIER_7d02be',
      '--serial',
      'SENTINEL_SERIAL_11',
      '--client-id',
      'SENTINEL_CLIENT_22',
      '--password',
      'SENTINEL_PW_xyz789'
    ]
    const promise = winCallRunner(commandParts, runner, {})
    process.nextTick(() => winFakeChild.emit('close', 0, null))
    await promise

    const serialized = JSON.stringify(winLogInfo.mock.calls)
    // Non-vacuity anchor: prove this test actually drove the PowerShell branch, not the
    // array-member branch (which would produce no `-ArgumentList` member at all).
    expect(serialized).toContain('-ArgumentList')
    expect(serialized).not.toContain('SENTINEL_CODE_ac91f3')
    expect(serialized).not.toContain('SENTINEL_VERIFIER_7d02be')
    expect(serialized).not.toContain('SENTINEL_SERIAL_11')
    expect(serialized).not.toContain('SENTINEL_CLIENT_22')
    expect(serialized).not.toContain('SENTINEL_PW_xyz789')
  })
})

describe('credential redaction census gate (34.5-61, F-34.5-G6-22/F-34.5-G6-24)', () => {
  const launcherSourcePath = join(__dirname, '..', 'launcher.ts')
  const launcherSource = readFileSync(launcherSourcePath, 'utf-8')

  function extractRedactionList(source: string): string[] {
    const listMatch = source.match(
      /for \(const sensitiveArg of \[([\s\S]*?)\]\)/
    )
    if (!listMatch) return []
    return listMatch[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/^'(.*)'$/, '$1'))
  }

  // Census predicate lifted verbatim from this plan's own diagnosis section:
  //   grep -rnE "'--(code|token|code-verifier|client-id|serial|password|secret|
  //     refresh-token|api-key)'" --include='*.ts' src/backend | grep -v __tests__
  const CENSUS_FLAG_PATTERN =
    /'--(code|token|code-verifier|client-id|serial|password|secret|refresh-token|api-key)'/g

  function censusCredentialFlagsInBackend(): Set<string> {
    const backendRoot = join(__dirname, '..')
    const found = new Set<string>()

    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') {
          continue
        }
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath)
          continue
        }
        if (!entry.name.endsWith('.ts')) continue
        const text = readFileSync(fullPath, 'utf-8')
        for (const match of text.matchAll(CENSUS_FLAG_PATTERN)) {
          found.add(`--${match[1]}`)
        }
      }
    }

    walk(backendRoot)
    return found
  }

  it('non-vacuity anchor: the redaction list extracted from source actually contains all six census-derived flags', () => {
    const redactionList = extractRedactionList(launcherSource)
    expect(redactionList).toEqual(
      expect.arrayContaining([
        '--code',
        '--token',
        '--code-verifier',
        '--password',
        '--serial',
        '--client-id'
      ])
    )
  })

  it('every credential-bearing --flag literal found in backend source (excluding __tests__) is a member of the redaction list', () => {
    const redactionList = extractRedactionList(launcherSource)
    const censusFlags = censusCredentialFlagsInBackend()

    // Non-vacuity anchor: the census itself must find something, or this assertion would
    // pass trivially against an empty set.
    expect(censusFlags.size).toBeGreaterThan(0)

    const unredacted = [...censusFlags].filter(
      (flag) => !redactionList.includes(flag)
    )
    expect(unredacted).toEqual([])
  })
})
