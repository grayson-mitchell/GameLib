/**
 * Layer-2 suite for createCommandRunner (66.1 MH-4 / D-11): every Layer-1
 * characterization case of launcher_callRunner.test.ts and
 * launcher_runWineCommandResolveOnExit.test.ts has a 1:1 twin here, driven
 * through a scripted ProcessRunner with injected deps. No jest.mock, no
 * module under backend except ../commandRunner, ../process/* types and
 * ../testUtils/*. Plan 24 deletes the legacy functions and both Layer-1
 * suites; this file is the contract that remains.
 *
 * Real-child cases use createRealRunner() (fake HOME) and node itself as the
 * child, so they run identically on every platform.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

import { createCommandRunner } from '../commandRunner'
import type { CommandRunnerDeps } from '../commandRunner'
import type { ProcessRunner, RunOptions, RunResult } from '../process/types'
import { createRealRunner } from '../testUtils/realRunner'
import {
  createScriptedRunner,
  type ScriptStep
} from '../testUtils/scriptedRunner'
import { defined } from './helpers/defined'

type Deps = CommandRunnerDeps
type Settings = ReturnType<Deps['wine']['getDefaultSettings']>

const flush = () => new Promise<void>((r) => setImmediate(r))

const gogRunner = {
  name: 'gog' as const,
  logPrefix: 'Gog' as never,
  bin: 'gogdl',
  dir: undefined
}

interface FakeWriter {
  writeString: jest.Mock
  logInfo: jest.Mock
  logError: jest.Mock
}

function makeWriter(order?: string[]): FakeWriter {
  return {
    writeString: jest.fn((s: string) => {
      order?.push(`write:${s}`)
    }),
    logInfo: jest.fn((s: string) => {
      order?.push(`info:${s}`)
      return Promise.resolve(undefined)
    }),
    logError: jest.fn().mockResolvedValue(undefined)
  }
}

// /bin/sh exists on every POSIX platform; the wine helpers are fakes so the
// path is never executed by the scripted runner.
const SETTINGS = {
  winePrefix: '/nonexistent-prefix',
  wineCrossoverBottle: 'GameLibSteamBridge-0',
  wineVersion: { type: 'crossover', name: 'fake', bin: '/bin/sh' }
} as unknown as Settings
const SERVER_SETTINGS = {
  ...SETTINGS,
  wineVersion: {
    type: 'crossover',
    name: 'fake',
    bin: '/bin/sh',
    wineserver: '/bin/sh'
  }
} as unknown as Settings

function setup(
  script: readonly ScriptStep[] = [],
  over: Partial<Deps> & { which?: () => Promise<string | null> } = {}
) {
  const runner = over.runner ?? createScriptedRunner(script)
  const aborts = new Map<string, AbortController>()
  const infoCalls: unknown[][] = []
  const warnCalls: unknown[][] = []
  const errorCalls: unknown[][] = []
  const errorHandlerCalls: unknown[][] = []
  const runnerWriter = makeWriter()
  const which = jest.fn(over.which ?? (() => Promise.resolve(null)))
  const deps: Deps = {
    runner,
    platform: 'linux',
    logger: {
      logInfo: (...a: unknown[]) => void infoCalls.push(a),
      logWarning: (...a: unknown[]) => void warnCalls.push(a),
      logError: (...a: unknown[]) => void errorCalls.push(a),
      logDebug: () => undefined,
      backendPrefix: 'Backend' as never
    },
    getRunnerLogWriter: () => runnerWriter as never,
    abort: {
      create: (id) => {
        const c = new AbortController()
        aborts.set(id, c)
        return c
      },
      remove: (id) => void aborts.delete(id)
    },
    errorHandler: (...a: unknown[]) => void errorHandlerCalls.push(a),
    searchForExecutableOnPath: which as never,
    commandToArgsArray: () => ['legendary-args', '--token', 'LEGENDARY_SECRET'],
    wine: {
      getDefaultSettings: () => SETTINGS,
      verifyWinePrefix: () =>
        Promise.resolve({ res: { stdout: '', stderr: '' } }),
      validWine: (w) => Promise.resolve(w.bin !== '/nonexistent/wine'),
      setupEnvVars: () => ({}),
      setupWineEnvVars: () => ({ WINEPREFIX: '/fake-prefix' }),
      isUmuSupported: () => Promise.resolve(false),
      getUmuPath: () => Promise.resolve('/umu')
    },
    ...over
  }
  delete (deps as { which?: unknown }).which
  return {
    deps,
    cr: createCommandRunner(deps),
    runner,
    aborts,
    infoCalls,
    warnCalls,
    errorCalls,
    errorHandlerCalls,
    runnerWriter,
    which
  }
}

const scripted = (r: ProcessRunner) =>
  r as ReturnType<typeof createScriptedRunner>
const callOpts = (r: ProcessRunner, i = 0) =>
  defined(scripted(r).calls[i], `call ${i}`).opts as RunOptions

/** A runner whose run() returns what the test builds, for result shapes the script cannot express. */
function fixedRunner(
  make: (opts: RunOptions | undefined) => Partial<RunResult>
): ProcessRunner {
  const inner = createScriptedRunner([])
  return {
    ...inner,
    run: (_cmd, _argv, opts) =>
      Promise.resolve({
        code: 0,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        aborted: false,
        truncated: false,
        pid: undefined,
        ...make(opts)
      })
  }
}

describe('Layer-2: callRunner close-handler exit-code classification (D-2 root cause)', () => {
  it('Layer-2: resolves as success (no .error/.abort) on a clean code=0 exit', async () => {
    const t = setup([{ cmd: 'gogdl', result: { code: 0 } }])
    const res = await t.cr.callRunner(['download', 'clean'], gogRunner, {})
    expect(res.error).toBeUndefined()
    expect(res.abort).toBeUndefined()
  })

  it('Layer-2: a non-zero exit code WITHOUT a signal is surfaced as .error', async () => {
    const t = setup([{ cmd: 'gogdl', result: { code: 1 } }])
    const res = await t.cr.callRunner(['download', 'nonzero'], gogRunner, {})
    expect(res.error).toBe('Process exited with code 1')
    expect(res.abort).toBeUndefined()
  })

  it('Layer-2: a signal-terminated process (not aborted) is classified as .error', async () => {
    const t = setup([
      { cmd: 'gogdl', result: { code: null, signal: 'SIGTERM' } }
    ])
    const res = await t.cr.callRunner(['download', 'sig'], gogRunner, {})
    expect(res.error).toBe('Process terminated with signal SIGTERM')
    expect(res.abort).toBeUndefined()
  })

  it('Layer-2: a non-zero exit AFTER the abort controller was aborted is .abort, not .error', async () => {
    const ref: { registry?: Map<string, AbortController> } = {}
    const t = setup([], {
      runner: fixedRunner(() => {
        // the cancel lands while the child is exiting with a failure code
        ref.registry?.get('aborted')?.abort()
        return { code: 1 }
      })
    })
    ref.registry = t.aborts
    const p = t.cr.callRunner(['download', 'aborted'], gogRunner, {
      abortId: 'aborted'
    })
    const res = await p
    expect(res.abort).toBe(true)
    expect(res.error).toBeUndefined()
  })

  it('Layer-2: a signal-terminated process AFTER abort is .abort (held run, abort signal)', async () => {
    const t = setup([{ cmd: 'gogdl', hold: true }])
    const p = t.cr.callRunner(['download', 'aborted-signal'], gogRunner, {
      abortId: 'aborted-signal'
    })
    await flush()
    t.aborts.get('aborted-signal')?.abort()
    const res = await p
    expect(res.abort).toBe(true)
    expect(res.error).toBeUndefined()
  })
})

describe('Layer-2: an intended kill reads as a cancellation, not an error (66.1-23)', () => {
  it('a signal exit the runner marks killedByUs is .abort even with no abort controller signalled', async () => {
    const t = setup([
      {
        cmd: 'gogdl',
        result: { code: null, signal: 'SIGTERM', killedByUs: true }
      }
    ])
    const res = await t.cr.callRunner(['launch', 'x', 'stopped'], gogRunner, {
      abortId: 'stopped'
    })
    expect(res.abort).toBe(true)
    expect(res.error).toBeUndefined()
    expect(res.stderr).toBe('')
    // No error log and no errorHandler call carrying a "terminated" message.
    expect(t.errorCalls).toHaveLength(0)
    expect(
      t.errorHandlerCalls.filter((c) => String(c[0]).includes('terminated'))
    ).toHaveLength(0)
  })

  it('a signal exit NOT marked killedByUs still surfaces as an error (the marker is the only cancel signal)', async () => {
    const t = setup([
      { cmd: 'gogdl', result: { code: null, signal: 'SIGTERM' } }
    ])
    const res = await t.cr.callRunner(['launch', 'x', 'crash'], gogRunner, {
      abortId: 'crash'
    })
    expect(res.error).toBe('Process terminated with signal SIGTERM')
    expect(res.abort).toBeUndefined()
  })

  it('a non-zero exit marked killedByUs (graceful shutdown after SIGTERM) is .abort too', async () => {
    const t = setup([{ cmd: 'gogdl', result: { code: 1, killedByUs: true } }])
    const res = await t.cr.callRunner(['launch', 'x', 'graceful'], gogRunner, {
      abortId: 'graceful'
    })
    expect(res.abort).toBe(true)
    expect(res.error).toBeUndefined()
  })
})

describe('Layer-2: in-flight dedup never swallows a caller that observes output (49-REVIEW WR-01)', () => {
  it('Layer-2: a second caller with identical argv and an onOutput observer gets its OWN run and sees the stream', async () => {
    const t = setup([
      { cmd: 'gogdl', hold: true },
      {
        cmd: 'gogdl',
        chunks: [{ stream: 'stdout', text: '[]\n' }],
        hold: true
      }
    ])
    const parts = ['list-updates', '--json']
    const seen: string[] = []
    const first = t.cr.callRunner(parts, gogRunner, { abortId: 'lib-caller' })
    const probe = t.cr.callRunner(parts, gogRunner, {
      abortId: 'probe-caller',
      onOutput: (chunk) => seen.push(chunk)
    })
    await flush()
    expect(scripted(t.runner).calls).toHaveLength(2)
    t.aborts.get('lib-caller')?.abort()
    t.aborts.get('probe-caller')?.abort()
    await Promise.all([first, probe])
    expect(seen).toEqual(['[]\n'])
  })

  it('Layer-2: two callers WITHOUT an observer still share one run (dedup unchanged)', async () => {
    const t = setup([{ cmd: 'gogdl', hold: true }])
    const parts = ['list-updates', '--json', 'dedup-control']
    const a = t.cr.callRunner(parts, gogRunner, { abortId: 'a' })
    const b = t.cr.callRunner(parts, gogRunner, { abortId: 'b' })
    await flush()
    expect(scripted(t.runner).calls).toHaveLength(1)
    t.runner.killTracked({}) // no-op on the scripted runner
    scripted(t.runner).release('gogdl')
    const [ra, rb] = await Promise.all([a, b])
    expect(ra).toBe(rb)
  })

  it('Layer-2: an observing caller does not register as joinable: a later plain caller runs its own', async () => {
    const t = setup([
      { cmd: 'gogdl', hold: true },
      { cmd: 'gogdl', result: { code: 0 } }
    ])
    const parts = ['list-updates', '--json', 'observer-first']
    const probe = t.cr.callRunner(parts, gogRunner, {
      abortId: 'probe-first',
      onOutput: () => undefined
    })
    const plain = t.cr.callRunner(parts, gogRunner, { abortId: 'plain-second' })
    await flush()
    expect(scripted(t.runner).calls).toHaveLength(2)
    scripted(t.runner).release('gogdl')
    await Promise.all([probe, plain])
  })

  it('Layer-2: the dedup entry is released when the run settles, so a later identical call runs again', async () => {
    const t = setup([
      { cmd: 'gogdl', result: { code: 0 } },
      { cmd: 'gogdl', result: { code: 0 } }
    ])
    await t.cr.callRunner(['list', 'again'], gogRunner, {})
    await t.cr.callRunner(['list', 'again'], gogRunner, {})
    expect(scripted(t.runner).calls).toHaveLength(2)
  })

  it('Layer-2: the in-flight map lives in the factory closure, not module scope', async () => {
    const a = setup([{ cmd: 'gogdl', hold: true }])
    const b = setup([{ cmd: 'gogdl', result: { code: 0 } }])
    const parts = ['list', 'closure']
    const pa = a.cr.callRunner(parts, gogRunner, { abortId: 'x' })
    await flush()
    await b.cr.callRunner(parts, gogRunner, { abortId: 'y' })
    expect(scripted(b.runner).calls).toHaveLength(1)
    a.aborts.get('x')?.abort()
    await pa
  })
})

describe('Layer-2: credential redaction through the production callRunner path (34.5-61)', () => {
  it('Layer-2: nile register argv: --code and --code-verifier both redact independently, plus --serial/--client-id', async () => {
    const t = setup([{ cmd: 'gogdl', result: { code: 0 } }])
    await t.cr.callRunner(
      [
        'register',
        '--code',
        'SENTINEL_CODE_ac91f3',
        '--code-verifier',
        'SENTINEL_VERIFIER_7d02be',
        '--serial',
        'SENTINEL_SERIAL_11',
        '--client-id',
        'SENTINEL_CLIENT_22'
      ],
      gogRunner,
      {}
    )
    const serialized = JSON.stringify(t.infoCalls)
    expect(serialized).not.toContain('SENTINEL_CODE_ac91f3')
    expect(serialized).not.toContain('SENTINEL_VERIFIER_7d02be')
    expect(serialized).not.toContain('SENTINEL_SERIAL_11')
    expect(serialized).not.toContain('SENTINEL_CLIENT_22')
    expect(serialized.match(/<redacted>/g)?.length).toBe(4)
  })

  it('Layer-2: GOG --password argv: raw private-branch password redacted', async () => {
    const t = setup([{ cmd: 'gogdl', result: { code: 0 } }])
    await t.cr.callRunner(
      ['install', 'someAppId', '--password', 'SENTINEL_PW_xyz789'],
      gogRunner,
      {}
    )
    const serialized = JSON.stringify(t.infoCalls)
    expect(serialized).not.toContain('SENTINEL_PW_xyz789')
    expect(serialized).toContain('<redacted>')
  })

  it('Layer-2: GOG comet token argv (261110-vdk): --access-token and --refresh-token both redacted', async () => {
    const t = setup([{ cmd: 'gogdl', result: { code: 0 } }])
    await t.cr.callRunner(
      [
        'comet',
        '--access-token',
        'SENTINEL_ACCESS_4f1a',
        '--refresh-token',
        'SENTINEL_REFRESH_9c3e'
      ],
      gogRunner,
      {}
    )
    const serialized = JSON.stringify(t.infoCalls)
    expect(serialized).not.toContain('SENTINEL_ACCESS_4f1a')
    expect(serialized).not.toContain('SENTINEL_REFRESH_9c3e')
    expect(serialized.match(/<redacted>/g)?.length).toBe(2)
  })

  it('Layer-2: the credentials never reach the log writers either', async () => {
    const t = setup([{ cmd: 'gogdl', result: { code: 0 } }])
    const w = makeWriter()
    await t.cr.callRunner(
      ['install', 'a', '--password', 'SENTINEL_PW_w'],
      gogRunner,
      {
        logWriters: [w as never]
      }
    )
    expect(JSON.stringify(w.logInfo.mock.calls)).not.toContain('SENTINEL_PW_w')
    expect(JSON.stringify(t.runnerWriter.logInfo.mock.calls)).not.toContain(
      'SENTINEL_PW_w'
    )
  })

  it('Layer-2: getRunnerCallWithoutCredentials takes the legendary command-array converter as a dep', async () => {
    const { getRunnerCallWithoutCredentials } = await import('../commandRunner')
    const out = getRunnerCallWithoutCredentials(
      { foo: 1 } as never,
      {},
      'legendary',
      () => ['auth', '--token', 'LEGENDARY_SECRET']
    )
    expect(out).not.toContain('LEGENDARY_SECRET')
    expect(out).toContain('<redacted>')
  })
})

describe('Layer-2: credential redaction: PowerShell -ArgumentList branch (34.5-61)', () => {
  it('Layer-2: redacts every added flag inside the -ArgumentList string, not just the array-member branch', async () => {
    const t = setup([{ cmd: 'powershell', result: { code: 0 } }], {
      platform: 'win32',
      which: () =>
        Promise.resolve(
          'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
        )
    })
    await t.cr.callRunner(
      [
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
      ],
      gogRunner,
      {}
    )
    const serialized = JSON.stringify(t.infoCalls)
    expect(serialized).toContain('-ArgumentList')
    expect(serialized).not.toContain('SENTINEL_CODE_ac91f3')
    expect(serialized).not.toContain('SENTINEL_VERIFIER_7d02be')
    expect(serialized).not.toContain('SENTINEL_SERIAL_11')
    expect(serialized).not.toContain('SENTINEL_CLIENT_22')
    expect(serialized).not.toContain('SENTINEL_PW_xyz789')
    expect(defined(scripted(t.runner).calls[0], 'call').cmd).toBe('powershell')
  })

  it('Layer-2: the PowerShell probe runs once per factory, then the result is reused', async () => {
    const t = setup(
      [
        { cmd: 'powershell', result: { code: 0 } },
        { cmd: 'powershell', result: { code: 0 } }
      ],
      { platform: 'win32', which: () => Promise.resolve('powershell.exe') }
    )
    await t.cr.callRunner(['a', 'one'], gogRunner, {})
    await t.cr.callRunner(['a', 'two'], gogRunner, {})
    expect(t.which).toHaveBeenCalledTimes(1)
  })

  it('Layer-2: without PowerShell on win32 the runner binary is spawned directly', async () => {
    const t = setup([{ cmd: 'gogdl', result: { code: 0 } }], {
      platform: 'win32',
      which: () => Promise.resolve(null)
    })
    await t.cr.callRunner(['a', 'direct'], gogRunner, {})
    expect(defined(scripted(t.runner).calls[0], 'call').cmd).toBe('gogdl')
  })
})

describe('Layer-2: credential redaction census gate (34.5-61)', () => {
  const source = readFileSync(
    join(__dirname, '..', 'commandRunner.ts'),
    'utf-8'
  )

  function extractRedactionList(text: string): string[] {
    const listMatch = text.match(/for \(const sensitiveArg of \[([\s\S]*?)\]\)/)
    if (!listMatch) return []
    return defined(listMatch[1], 'redaction list')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/^'(.*)'$/, '$1'))
  }

  const CENSUS_FLAG_PATTERN =
    /'--(code|token|code-verifier|client-id|serial|password|secret|access-token|refresh-token|api-key)'/g

  function census(): Set<string> {
    const backendRoot = join(__dirname, '..')
    const found = new Set<string>()
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'node_modules')
          continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!entry.name.endsWith('.ts')) continue
        for (const m of readFileSync(full, 'utf-8').matchAll(
          CENSUS_FLAG_PATTERN
        )) {
          found.add(`--${m[1]}`)
        }
      }
    }
    walk(backendRoot)
    return found
  }

  it('Layer-2: non-vacuity anchor: the redaction list extracted from source contains all eight flags', () => {
    expect(extractRedactionList(source)).toEqual(
      expect.arrayContaining([
        '--code',
        '--token',
        '--code-verifier',
        '--password',
        '--serial',
        '--client-id',
        '--access-token',
        '--refresh-token'
      ])
    )
  })

  it('Layer-2: census detects the GOG comet token flags (not vacuous for them)', () => {
    const flags = census()
    expect(flags.has('--access-token')).toBe(true)
    expect(flags.has('--refresh-token')).toBe(true)
  })

  it('Layer-2: every credential-bearing --flag literal in backend source is a member of the redaction list', () => {
    const list = extractRedactionList(source)
    const flags = census()
    expect(flags.size).toBeGreaterThan(0)
    expect([...flags].filter((f) => !list.includes(f))).toEqual([])
  })
})

describe('Layer-2: callRunner skipErrorHandler (49-03, 49-SPEC P2)', () => {
  const LEGENDARY_LINE =
    'Stored credentials are no longer valid! Please login again.'

  it('Layer-2: Test 1: a failing run with skipErrorHandler never reaches errorHandler, yet onOutput saw the stderr chunk verbatim', async () => {
    const t = setup([
      {
        cmd: 'gogdl',
        chunks: [{ stream: 'stderr', text: LEGENDARY_LINE }],
        result: { code: 1 }
      }
    ])
    const onOutput = jest.fn()
    const res = await t.cr.callRunner(['status', 'skip-fail'], gogRunner, {
      skipErrorHandler: true,
      onOutput
    })
    expect(res.error).toBeDefined()
    expect(t.errorHandlerCalls).toHaveLength(0)
    expect(onOutput).toHaveBeenCalledWith(LEGENDARY_LINE, expect.anything())
  })

  it('Layer-2: Test 2: a clean exit with skipErrorHandler never reaches errorHandler and carries no .error/.abort', async () => {
    const t = setup([{ cmd: 'gogdl', result: { code: 0 } }])
    const res = await t.cr.callRunner(['status', 'skip-clean'], gogRunner, {
      skipErrorHandler: true
    })
    expect(res.error).toBeUndefined()
    expect(res.abort).toBeUndefined()
    expect(t.errorHandlerCalls).toHaveLength(0)
  })

  it('Layer-2: Test 3: without the option the same failing run still reaches errorHandler', async () => {
    const t = setup([
      {
        cmd: 'gogdl',
        chunks: [{ stream: 'stderr', text: LEGENDARY_LINE }],
        result: { code: 1 }
      }
    ])
    const res = await t.cr.callRunner(['status', 'default-fail'], gogRunner, {})
    expect(res.error).toBeDefined()
    expect(t.errorHandlerCalls.length).toBeGreaterThan(0)
    expect(t.errorHandlerCalls[0]?.[0]).toContain(LEGENDARY_LINE)
  })

  it('Layer-2: Test 4: with skipErrorHandler an aborted run is .abort and never reaches errorHandler', async () => {
    const t = setup([{ cmd: 'gogdl', hold: true }])
    const p = t.cr.callRunner(['status', 'skip-abort'], gogRunner, {
      abortId: 'skip-abort',
      skipErrorHandler: true
    })
    await flush()
    t.aborts.get('skip-abort')?.abort()
    const res = await p
    expect(res.abort).toBe(true)
    expect(t.errorHandlerCalls).toHaveLength(0)
  })
})

describe('Layer-2: callRunner characterization (66.1 MH-4)', () => {
  it('Layer-2: tracks the run under trackKey with the runner name, else under the abortId alone', async () => {
    const t = setup([
      { cmd: 'gogdl', result: { code: 0 } },
      { cmd: 'gogdl', result: { code: 0 } }
    ])
    await t.cr.callRunner(['list', 'l1-trackkey'], gogRunner, {
      trackKey: 'my-key',
      abortId: 'ignored-abort'
    })
    expect(callOpts(t.runner, 0).track).toEqual({
      runner: 'gog',
      key: 'my-key'
    })
    await t.cr.callRunner(['list', 'l1-abortkey'], gogRunner, {
      abortId: 'my-abort'
    })
    expect(callOpts(t.runner, 1).track).toEqual({
      runner: 'gog',
      key: 'my-abort'
    })
  })

  it('Layer-2: runs with the option cwd and an env where option keys win over process.env', async () => {
    process.env.L2_ENV_SENTINEL = 'from-process'
    process.env.L2_ENV_SHARED = 'from-process'
    try {
      const t = setup([{ cmd: 'gogdl', result: { code: 0 } }])
      await t.cr.callRunner(['list', 'l1-env'], gogRunner, {
        cwd: '/l1/cwd',
        env: { L2_ENV_SHARED: 'from-options', L2_ENV_OPT: 'opt' }
      })
      const call = defined(scripted(t.runner).calls[0], 'call')
      expect(call.cmd).toBe('gogdl')
      expect([...call.argv]).toEqual(['list', 'l1-env'])
      expect(call.cwd).toBe('/l1/cwd')
      expect(call.env?.L2_ENV_SENTINEL).toBe('from-process')
      expect(call.env?.L2_ENV_SHARED).toBe('from-options')
      expect(call.env?.L2_ENV_OPT).toBe('opt')
    } finally {
      delete process.env.L2_ENV_SENTINEL
      delete process.env.L2_ENV_SHARED
    }
  })

  it('Layer-2: a runner dir joins the cwd and prefixes a relative bin with ./ off Windows', async () => {
    const t = setup([{ cmd: './gogdl', result: { code: 0 } }])
    await t.cr.callRunner(
      ['list', 'dir'],
      { ...gogRunner, dir: '/opt/gogdl' },
      {}
    )
    const call = defined(scripted(t.runner).calls[0], 'call')
    expect(call.cmd).toBe('./gogdl')
    expect(call.cwd).toBe('/opt/gogdl')
  })

  it('Layer-2: writes the command header to every log writer before the first output chunk', async () => {
    const order: string[] = []
    const writer = makeWriter(order)
    const t = setup([
      {
        cmd: 'gogdl',
        chunks: [{ stream: 'stdout', text: 'first-chunk' }],
        result: { code: 0 }
      }
    ])
    await t.cr.callRunner(['list', 'l1-header'], gogRunner, {
      logWriters: [writer as never]
    })
    const headerIdx = order.findIndex((e) => e.startsWith('info:'))
    expect(headerIdx).toBe(0)
    expect(order[headerIdx]).toContain('gogdl')
    expect(order.indexOf('write:first-chunk')).toBeGreaterThan(headerIdx)
  })

  it('Layer-2: the runner log writer is appended automatically and gets the output', async () => {
    const t = setup([
      {
        cmd: 'gogdl',
        chunks: [{ stream: 'stdout', text: 'to-runner-log' }],
        result: { code: 0 }
      }
    ])
    await t.cr.callRunner(['list', 'runner-writer'], gogRunner, {})
    expect(t.runnerWriter.writeString).toHaveBeenCalledWith('to-runner-log')
  })

  it('Layer-2: applies logSanitizer to the writers but hands onOutput the raw chunk', async () => {
    const order: string[] = []
    const writer = makeWriter(order)
    const seen: string[] = []
    const t = setup([
      {
        cmd: 'gogdl',
        chunks: [
          { stream: 'stdout', text: 'token=SECRET' },
          { stream: 'stderr', text: 'err=SECRET' }
        ],
        result: { code: 0 }
      }
    ])
    await t.cr.callRunner(['list', 'l1-sanitizer'], gogRunner, {
      logWriters: [writer as never],
      logSanitizer: (s: string) => s.replace('SECRET', '***'),
      onOutput: (chunk) => seen.push(chunk)
    })
    expect(order).toContain('write:token=***')
    expect(order).toContain('write:err=***')
    expect(order.join('\n')).not.toContain('write:token=SECRET')
    expect(seen).toEqual(['token=SECRET', 'err=SECRET'])
  })

  it('Layer-2: joins trimmed stdout chunks with "" and trimmed stderr chunks with a newline', async () => {
    const t = setup([
      {
        cmd: 'gogdl',
        chunks: [
          { stream: 'stdout', text: ' a \n' },
          { stream: 'stdout', text: '\n b ' },
          { stream: 'stderr', text: ' x \n' },
          { stream: 'stderr', text: ' y ' }
        ],
        result: { code: 0 }
      }
    ])
    const res = await t.cr.callRunner(['list', 'l1-join'], gogRunner, {})
    expect(res.stdout).toBe('ab')
    expect(res.stderr).toBe('x\ny')
    expect(res.fullCommand).toContain('gogdl')
  })

  it('Layer-2: classifies a run aborted through abortId as { abort: true } with empty output and no error', async () => {
    const t = setup([
      {
        cmd: 'gogdl',
        chunks: [{ stream: 'stdout', text: 'partial' }],
        hold: true
      }
    ])
    const p = t.cr.callRunner(['list', 'l1-abort'], gogRunner, {
      abortId: 'l1-abort-id'
    })
    await flush()
    t.aborts.get('l1-abort-id')?.abort()
    const res = await p
    expect(res).toMatchObject({ abort: true, stdout: '', stderr: '' })
    expect(res.error).toBeUndefined()
  })

  it('Layer-2: passes the documented run options: timeout opt-out with a reason, windowsHide false, replaceEnv', async () => {
    const t = setup([{ cmd: 'gogdl', result: { code: 0 } }])
    await t.cr.callRunner(['list', 'opts'], gogRunner, {})
    const opts = callOpts(t.runner)
    expect(opts.timeout).toEqual({
      none: true,
      reason: expect.stringMatching(/\S/)
    })
    expect(opts.timeoutMs).toBeUndefined()
    expect(opts.windowsHide).toBe(false)
    expect(opts.replaceEnv).toBe(true)
    expect(opts.signal).toBeInstanceOf(AbortSignal)
  })

  it('Layer-2: a spawn failure is classified as .error, reaches errorHandler and is logged', async () => {
    const t = setup([{ cmd: 'gogdl', error: { code: 'ENOENT' } }])
    const res = await t.cr.callRunner(['list', 'enoent'], gogRunner, {})
    expect(res.error).toContain('ENOENT')
    expect(res.stderr).toContain('ENOENT')
    expect(t.errorHandlerCalls).toHaveLength(1)
    expect(t.errorCalls).toHaveLength(1)
  })

  it('Layer-2: removes the abort registry entry once the call settles', async () => {
    const t = setup([{ cmd: 'gogdl', result: { code: 0 } }])
    await t.cr.callRunner(['list', 'cleanup'], gogRunner, { abortId: 'gone' })
    expect(t.aborts.has('gone')).toBe(false)
  })
})

describe('Layer-2: runWineCommand resolveOnExit', () => {
  const run = (
    t: ReturnType<typeof setup>,
    extra: Partial<Parameters<typeof t.cr.runWineCommand>[0]> = {},
    settings: Settings = SETTINGS
  ) =>
    t.cr.runWineCommand({
      commandParts: ['reg', 'query', 'HKCU'],
      gameSettings: settings,
      skipPrefixCheckIKnowWhatImDoing: true,
      ...extra
    })

  it('Layer-2: settles on exit while a grandchild still holds the pipes (resolveOn exit, drain flag)', async () => {
    const t = setup([
      {
        cmd: '/bin/sh',
        chunks: [{ stream: 'stdout', text: 'HKEY_CURRENT_USER\n' }],
        result: { code: 0, drainTimedOut: true }
      },
      { cmd: '/bin/sh', argv: ['--wait'] }
    ])
    const res = await run(
      t,
      { wait: true, resolveOnExit: true },
      SERVER_SETTINGS
    )
    expect(callOpts(t.runner, 0).resolveOn).toBe('exit')
    expect(res.stdout).toBe('HKEY_CURRENT_USER\n')
    expect(res.code).toBe(0)
  })

  it('Layer-2: settles exactly once and keeps the exit code when the run reports a late close', async () => {
    const t = setup([{ cmd: '/bin/sh', result: { code: 0 } }])
    const res = await run(t, { resolveOnExit: true })
    expect(res.code).toBe(0)
    expect(scripted(t.runner).calls).toHaveLength(1)
  })

  it('Layer-2: an early close settles without any drain flag', async () => {
    const t = setup([{ cmd: '/bin/sh', result: { code: 0 } }])
    const res = await run(t, { resolveOnExit: true })
    expect(res.code).toBe(0)
  })

  it('Layer-2: default: resolveOn is close, never exit', async () => {
    const t = setup([{ cmd: '/bin/sh', result: { code: 0 } }])
    await run(t)
    expect(callOpts(t.runner).resolveOn ?? 'close').toBe('close')
  })

  it('Layer-2: resolveOnExit: false behaves as the default', async () => {
    const t = setup([{ cmd: '/bin/sh', result: { code: 0 } }])
    await run(t, { resolveOnExit: false })
    expect(callOpts(t.runner).resolveOn ?? 'close').toBe('close')
  })

  it('Layer-2: 59-REVIEW WR-01: output lost after the drain grace while the exit code survives', async () => {
    const t = setup([
      { cmd: '/bin/sh', result: { code: 1, drainTimedOut: true } }
    ])
    const res = await run(t, { resolveOnExit: true })
    expect(res.code).toBe(1)
    expect(res.stderr).toBe('')
  })
})

describe('Layer-2: runWineCommand characterization (66.1 MH-4)', () => {
  const call = (
    t: ReturnType<typeof setup>,
    extra: Partial<Parameters<typeof t.cr.runWineCommand>[0]> = {},
    settings: Settings = SETTINGS
  ) =>
    t.cr.runWineCommand({
      commandParts: ['reg', 'query', 'HKCU'],
      gameSettings: settings,
      skipPrefixCheckIKnowWhatImDoing: true,
      ...extra
    })

  it('Layer-2: resolves { stdout, stderr, code } once the run closes', async () => {
    const t = setup([
      {
        cmd: '/bin/sh',
        chunks: [
          { stream: 'stdout', text: 'out-1 ' },
          { stream: 'stdout', text: 'out-2' },
          { stream: 'stderr', text: 'err-1' }
        ],
        result: { code: 3 }
      }
    ])
    expect(await call(t)).toEqual({
      stdout: 'out-1 out-2',
      stderr: 'err-1',
      code: 3
    })
  })

  it('Layer-2: keeps the last 50 chunks of each stream (memory log semantics, A5)', async () => {
    const chunks = Array.from({ length: 60 }, (_, i) => ({
      stream: 'stdout' as const,
      text: `${i},`
    }))
    const t = setup([{ cmd: '/bin/sh', chunks, result: { code: 0 } }])
    const res = await call(t)
    expect(res.stdout.startsWith('10,')).toBe(true)
    expect(res.stdout.endsWith('59,')).toBe(true)
  })

  it('Layer-2: calls onSpawn exactly once with the spawned child handle', async () => {
    const onSpawn = jest.fn()
    const t = setup([{ cmd: '/bin/sh', result: { code: 0 } }])
    await call(t, { onSpawn })
    expect(onSpawn).toHaveBeenCalledTimes(1)
    expect(onSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ kill: expect.any(Function) })
    )
  })

  it('Layer-2: calls onOutput for both streams with the chunk and the child', async () => {
    const onOutput = jest.fn()
    const t = setup([
      {
        cmd: '/bin/sh',
        chunks: [
          { stream: 'stdout', text: 'to-stdout' },
          { stream: 'stderr', text: 'to-stderr' }
        ],
        result: { code: 0 }
      }
    ])
    await call(t, { options: { onOutput } })
    expect(onOutput).toHaveBeenCalledWith('to-stdout', expect.anything())
    expect(onOutput).toHaveBeenCalledWith('to-stderr', expect.anything())
    expect(onOutput).toHaveBeenCalledTimes(2)
  })

  it('Layer-2: writes a "Wine Command:" header to each log writer before any output', async () => {
    const [w1, w2] = [makeWriter(), makeWriter()]
    const t = setup([
      {
        cmd: '/bin/sh',
        chunks: [{ stream: 'stdout', text: 'after-header' }],
        result: { code: 0 }
      }
    ])
    await call(t, { options: { logWriters: [w1, w2] as never } })
    for (const w of [w1, w2]) {
      expect(w.writeString.mock.calls[0]?.[0]).toMatch(/^Wine Command: /)
      expect(w.writeString).toHaveBeenCalledWith('after-header')
    }
  })

  it('Layer-2: wait: true runs `wineserver --wait` after close and resolves only after it, with a finite 30-minute timeout', async () => {
    const t = setup([
      { cmd: '/bin/sh', argv: ['reg', 'query', 'HKCU'], result: { code: 0 } },
      { cmd: '/bin/sh', argv: ['--wait'], hold: true }
    ])
    let settled = false
    const p = call(t, { wait: true }, SERVER_SETTINGS).then((r) => {
      settled = true
      return r
    })
    await flush()
    expect(scripted(t.runner).calls).toHaveLength(2)
    expect([...defined(scripted(t.runner).calls[1], 'wait call').argv]).toEqual(
      ['--wait']
    )
    expect(callOpts(t.runner, 1).timeoutMs).toBe(1_800_000)
    expect(callOpts(t.runner, 1).timeout).toBeUndefined()
    expect(settled).toBe(false)
    scripted(t.runner).release('/bin/sh')
    expect((await p).code).toBe(0)
  })

  it('Layer-2: a wineserver --wait that times out logs a warning naming the prefix and still resolves the first result', async () => {
    const t = setup([
      { cmd: '/bin/sh', argv: ['reg', 'query', 'HKCU'], result: { code: 7 } },
      {
        cmd: '/bin/sh',
        argv: ['--wait'],
        result: { code: null, timedOut: true }
      }
    ])
    const res = await call(t, { wait: true }, SERVER_SETTINGS)
    expect(res.code).toBe(7)
    expect(JSON.stringify(t.warnCalls)).toContain('/nonexistent-prefix')
  })

  it('Layer-2: a wineserver --wait spawn failure does not hang the caller', async () => {
    const t = setup([
      { cmd: '/bin/sh', argv: ['reg', 'query', 'HKCU'], result: { code: 0 } },
      { cmd: '/bin/sh', argv: ['--wait'], error: { code: 'ENOENT' } }
    ])
    const res = await call(t, { wait: true }, SERVER_SETTINGS)
    expect(res.code).toBe(0)
  })

  it('Layer-2: returns { stdout: "", stderr: "Invalid wine" } and runs nothing for an invalid wine', async () => {
    const t = setup([])
    const invalid = {
      ...SETTINGS,
      wineVersion: { type: 'crossover', name: 'gone', bin: '/nonexistent/wine' }
    } as unknown as Settings
    const res = await call(t, {}, invalid)
    expect(res).toEqual({ stdout: '', stderr: 'Invalid wine' })
    expect(scripted(t.runner).calls).toHaveLength(0)
  })

  it('Layer-2: passes the documented run options: timeout opt-out with a reason, windowsHide false, merged env', async () => {
    const t = setup([{ cmd: '/bin/sh', result: { code: 0 } }])
    await call(t, { protonVerb: 'runinprefix', startFolder: '/start' })
    const c = defined(scripted(t.runner).calls[0], 'call')
    const opts = callOpts(t.runner)
    expect(opts.timeout).toEqual({
      none: true,
      reason: expect.stringMatching(/\S/)
    })
    expect(opts.windowsHide).toBe(false)
    expect(c.cwd).toBe('/start')
    expect(c.env?.WINEPREFIX).toBe('/fake-prefix')
    expect(c.env?.PROTON_VERB).toBe('runinprefix')
  })

  it('Layer-2: ignoreLogging strips PROTON_LOG from the env', async () => {
    process.env.PROTON_LOG = '1'
    try {
      const t = setup([{ cmd: '/bin/sh', result: { code: 0 } }])
      await call(t, { ignoreLogging: true })
      expect(
        defined(scripted(t.runner).calls[0], 'call').env?.PROTON_LOG
      ).toBeUndefined()
    } finally {
      delete process.env.PROTON_LOG
    }
  })

  it('Layer-2: wrappers become the binary with the runner bin after them', async () => {
    const t = setup([{ cmd: 'gamemoderun', result: { code: 0 } }])
    await call(t, { options: { wrappers: ['gamemoderun', '--flag'] } })
    const c = defined(scripted(t.runner).calls[0], 'call')
    expect(c.cmd).toBe('gamemoderun')
    expect([...c.argv]).toEqual(['--flag', '/bin/sh', 'reg', 'query', 'HKCU'])
  })

  describe('track key precedence', () => {
    const tracked = async (extra: Parameters<typeof call>[1]) => {
      const t = setup([{ cmd: '/bin/sh', result: { code: 0 } }])
      await call(t, extra)
      return callOpts(t.runner).track
    }

    it('Layer-2: prefers options.trackKey', async () => {
      expect(
        await tracked({
          options: { trackKey: 'tk' },
          installFolderName: 'folder'
        })
      ).toEqual({ runner: 'wine', key: 'tk' })
    })

    it('Layer-2: falls back to installFolderName', async () => {
      expect(await tracked({ installFolderName: 'folder' })).toEqual({
        runner: 'wine',
        key: 'folder'
      })
    })

    it('Layer-2: falls back to the winePrefix', async () => {
      expect(await tracked({})).toEqual({
        runner: 'wine',
        key: '/nonexistent-prefix'
      })
    })
  })
})

describe('Layer-2: getWinePath', () => {
  it('Layer-2: asks winepath through runWineCommand and returns the trimmed stdout', async () => {
    const t = setup([
      {
        cmd: '/bin/sh',
        chunks: [{ stream: 'stdout', text: '/unix/path\n' }],
        result: { code: 0 }
      }
    ])
    const out = await t.cr.getWinePath({
      path: 'C:\\x',
      gameSettings: SETTINGS,
      variant: 'unix'
    })
    expect(out).toBe('/unix/path')
    expect([...defined(scripted(t.runner).calls[0], 'call').argv]).toEqual([
      'cmd',
      '/c',
      'winepath',
      '-u',
      'C:\\x'
    ])
  })

  it('Layer-2: logs an error and returns "" when winepath prints nothing', async () => {
    const t = setup([{ cmd: '/bin/sh', result: { code: 1 } }])
    const out = await t.cr.getWinePath({
      path: 'C:\\x',
      gameSettings: SETTINGS,
      variant: 'win'
    })
    expect(out).toBe('')
    expect(t.errorCalls).toHaveLength(1)
  })
})

describe('Layer-2: runScriptForGame characterization (66.1 MH-4)', () => {
  const gameInfo = {
    app_name: 'l1-app',
    title: 'L1 Title',
    runner: 'gog',
    install: { executable: 'game.exe', install_path: '/l1/install' }
  } as never
  const settings = (extra: Record<string, unknown> = {}) =>
    ({
      winePrefix: '/l1/prefix',
      beforeLaunchScriptPath: '/l1/before.sh',
      afterLaunchScriptPath: '/l1/after.sh',
      ...extra
    }) as never
  const writer = () =>
    ({ writeString: jest.fn(), logError: jest.fn() }) as never

  it('Layer-2: resolves true on exit while a grandchild still holds the pipes', async () => {
    const t = setup([
      { cmd: '/l1/before.sh', result: { code: 0, drainTimedOut: true } }
    ])
    expect(
      await t.cr.runScriptForGame(gameInfo, settings(), 'before', writer())
    ).toBe(true)
    expect(callOpts(t.runner).resolveOn).toBe('exit')
  })

  it('Layer-2: rejects when the child cannot be spawned', async () => {
    const t = setup([{ cmd: '/l1/before.sh', error: { code: 'ENOENT' } }])
    await expect(
      t.cr.runScriptForGame(gameInfo, settings(), 'before', writer())
    ).rejects.toThrow('ENOENT')
  })

  it('Layer-2: writes output to the log writer only when verboseLogs is on', async () => {
    const chunks = [
      { stream: 'stdout' as const, text: 'shown-out' },
      { stream: 'stderr' as const, text: 'shown-err' }
    ]
    const quiet = { writeString: jest.fn(), logError: jest.fn() }
    const t1 = setup([{ cmd: '/l1/before.sh', chunks, result: { code: 0 } }])
    await t1.cr.runScriptForGame(gameInfo, settings(), 'before', quiet as never)
    expect(quiet.writeString).not.toHaveBeenCalled()

    const loud = { writeString: jest.fn(), logError: jest.fn() }
    const t2 = setup([{ cmd: '/l1/before.sh', chunks, result: { code: 0 } }])
    await t2.cr.runScriptForGame(
      gameInfo,
      settings({ verboseLogs: true }),
      'before',
      loud as never
    )
    expect(loud.writeString).toHaveBeenCalledWith('shown-out')
    expect(loud.writeString).toHaveBeenCalledWith('shown-err')
  })

  it('Layer-2: runs the stage script with cwd = install_path and HEROIC_* env merged under process.env', async () => {
    process.env.L2_SCRIPT_SENTINEL = 'inherited'
    try {
      const t = setup([{ cmd: '/l1/after.sh', result: { code: 0 } }])
      await t.cr.runScriptForGame(gameInfo, settings(), 'after', writer())
      const c = defined(scripted(t.runner).calls[0], 'call')
      expect(c.cmd).toBe('/l1/after.sh')
      expect([...c.argv]).toEqual([])
      expect(c.cwd).toBe('/l1/install')
      expect(c.env).toMatchObject({
        HEROIC_GAME_APP_NAME: 'l1-app',
        HEROIC_GAME_EXEC: 'game.exe',
        HEROIC_GAME_PREFIX: '/l1/prefix',
        HEROIC_GAME_RUNNER: 'gog',
        HEROIC_GAME_SCRIPT_STAGE: 'after',
        HEROIC_GAME_TITLE: 'L1 Title',
        L2_SCRIPT_SENTINEL: 'inherited'
      })
      expect(JSON.parse(c.env?.HEROIC_GAME_INFO ?? '{}')).toMatchObject({
        app_name: 'l1-app'
      })
      expect(c.env?.HEROIC_GAME_SETTINGS).toContain('/l1/prefix')
      expect(callOpts(t.runner).windowsHide).toBe(false)
      expect(callOpts(t.runner).timeout).toEqual({
        none: true,
        reason: expect.stringMatching(/\S/)
      })
    } finally {
      delete process.env.L2_SCRIPT_SENTINEL
    }
  })
})

describe('Layer-2: real children (createRealRunner, fake HOME)', () => {
  const NODE = process.execPath

  function realSetup() {
    const real = createRealRunner()
    const t = setup([], {
      runner: real.runner,
      platform: process.platform,
      wine: {
        getDefaultSettings: () => SETTINGS,
        verifyWinePrefix: () =>
          Promise.resolve({ res: { stdout: '', stderr: '' } }),
        validWine: () => Promise.resolve(true),
        setupEnvVars: () => ({}),
        setupWineEnvVars: () => ({}),
        isUmuSupported: () => Promise.resolve(false),
        getUmuPath: () => Promise.resolve('/umu')
      }
    })
    return { ...t, real }
  }

  const nodeSettings = {
    ...SETTINGS,
    wineVersion: { type: 'crossover', name: 'node', bin: NODE }
  } as unknown as Settings

  it('Layer-2: runWineCommand with resolveOnExit resolves within 2000 ms while a pipe-holding grandchild lingers', async () => {
    const t = realSetup()
    try {
      const script =
        "require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},3000)'],{stdio:['ignore',1,2]}).unref();console.log('hi')"
      const started = Date.now()
      const res = await t.cr.runWineCommand({
        commandParts: ['-e', script],
        gameSettings: nodeSettings,
        skipPrefixCheckIKnowWhatImDoing: true,
        resolveOnExit: true
      })
      expect(Date.now() - started).toBeLessThan(2000)
      expect(res.code).toBe(0)
      expect(res.stdout).toContain('hi')
    } finally {
      t.real.dispose()
    }
  }, 15_000)

  it('Layer-2: runWineCommand without resolveOnExit returns the exit code and output of a plain child', async () => {
    const t = realSetup()
    try {
      const res = await t.cr.runWineCommand({
        commandParts: [
          '-e',
          "console.log('out');console.error('err');process.exit(4)"
        ],
        gameSettings: nodeSettings,
        skipPrefixCheckIKnowWhatImDoing: true
      })
      expect(res.code).toBe(4)
      expect(res.stdout).toContain('out')
      expect(res.stderr).toContain('err')
    } finally {
      t.real.dispose()
    }
  }, 15_000)

  it('Layer-2: callRunner aborted mid-run kills the child (abort path) and leaves nothing tracked', async () => {
    const t = realSetup()
    try {
      let abortOnce = false
      const p = t.cr.callRunner(
        ['-e', "console.log('ready');setInterval(()=>{},1000)"],
        { name: 'gog', logPrefix: 'Gog' as never, bin: NODE, dir: undefined },
        {
          abortId: 'real-abort',
          trackKey: 'real-abort',
          onOutput: () => {
            if (abortOnce) return
            abortOnce = true
            t.aborts.get('real-abort')?.abort()
          }
        }
      )
      const res = await p
      expect(res.abort).toBe(true)
      expect(
        t.real.runner.killTracked({ runner: 'gog', key: 'real-abort' })
      ).toBe(0)
    } finally {
      t.real.dispose()
    }
  }, 15_000)

  it('Layer-2: callRunner reports a real non-zero exit as .error', async () => {
    const t = realSetup()
    try {
      const res = await t.cr.callRunner(
        ['-e', 'process.exit(3)'],
        { name: 'gog', logPrefix: 'Gog' as never, bin: NODE, dir: undefined },
        { skipErrorHandler: true }
      )
      expect(res.error).toBe('Process exited with code 3')
    } finally {
      t.real.dispose()
    }
  }, 15_000)
})
