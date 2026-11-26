/**
 * The command runner oracle (88.2-01, D-11, D-12, D-13, D-14, D-22, D-25): `callRunner`, the store
 * CLI runner every library manager and every game launch goes through, driven through the real
 * `createCommandRunner` over a scripted spawn tracer on a fresh fake HOME and recorded as the golden
 * the Rust `gamelib-launch` runner has to reproduce. The golden exists before any Rust runner does.
 * `runWineCommand`, `getWinePath` and `runScriptForGame` are 88.2-04's, the redaction and sanitizer
 * vectors are 88.2-03's.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/runner/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), built from `DELTAS` below
 *   MANIFEST.json   `{ count, floor }`; the `class` of every recorded spawn is the one hand-authored,
 *                   non-oracle field (it comes from `golden/classes.json`, never from the TS)
 *   expected/<case>/result.json     what each call answered (an `ExecResult` per call) and, for calls
 *                                   made together, which of them were handed the same result object
 *   expected/<case>/spawns.json     every spawn: program, argv, the whole env, cwd, `resolveOn`, `track`,
 *                                   the timeout opt-out, `windowsHide`, `replaceEnv`, call site and class
 *   expected/<case>/events.json     the backend log calls (`{ level, prefix, parts }`), in call order
 *   expected/<case>/logFrames.json  every log entry at the forwarder boundary (target, rotate flag, entry)
 *   expected/<case>/stream.json     the `onOutput` chunk sequence of each call that observed the stream
 *   expected/<case>/calls.json      the abort registry, `errorHandler` and PATH-probe calls, in order
 *   (requests.json and tree.json are the harness's fixed files; no runner case writes either)
 *
 * Isolation (D-12, D-13, D-22): every case runs on a fresh fake HOME inside `withPinnedBaseEnv` (eleven
 * `process.env` keys and no others), with an injected platform and a PATH probe that answers from the
 * case; nothing reads the real profile and no child is spawned. The logger is spied on, never mocked.
 * Every recorded env is the whole env the child was given, so a dropped, leaked or wrongly stripped
 * variable is a diff. `Math.random()` (the abort id of a call with no app name) is pinned. The goldens
 * are recorded on a POSIX host. Behaviour that looks wrong is kept as recorded and filed as a todo
 * (D-20); a fix is never mixed into a golden diff.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type OraclePlatform
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  injectPlatform,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import {
  createRunnerTrace,
  recordStream,
  type RunnerStep
} from 'backend/testUtils/launchOracle/runnerTrace'
import {
  attachSpawnClass,
  loadClasses
} from 'backend/testUtils/launchOracle/spawnClass'
import { createCommandRunner } from 'backend/commandRunner'
import LogWriter from 'backend/logger/targetWriter'
import { RunnerToLogPrefixMap } from 'backend/logger/constants'
import type { Runner } from 'common/types'

const CRATE = 'gamelib-launch'
const SLICE = 'runner'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const RUNNER_FLOOR = 1

const mode = engineWineOracleMode()

/** What `Math.random()` answers in every case, so the abort id of a call with no app name is fixed. */
const PINNED_RANDOM = 0.4242

// ---------------------------------------------------------------------------------------------
// The case shape
// ---------------------------------------------------------------------------------------------

type HostPlatform = 'linux' | 'darwin' | 'win32'

const OS: Record<HostPlatform, OraclePlatform> = {
  linux: 'linux',
  darwin: 'mac',
  win32: 'windows'
}

/** A named sanitizer a case can hand `logSanitizer` (the real ones are 88.2-03's vectors). */
type SanitizerName = 'mask-secret'

const SANITIZERS: Record<SanitizerName, (line: string) => string> = {
  'mask-secret': (line) => line.replace('SECRET', '***')
}

interface CallSpec {
  runner: { name: Runner; bin: string; dir?: string }
  commandParts: string[]
  options?: {
    env?: Record<string, string>
    cwd?: string
    abortId?: string
    trackKey?: string
    /** The call passes an `onOutput` that records every chunk. */
    observe?: true
    skipErrorHandler?: boolean
    logMessagePrefix?: string
    sanitizer?: SanitizerName
    /** How many caller-supplied game log writers the call is given (the runner's own is added). */
    extraWriters?: number
  }
  /** Which `createCommandRunner` instance makes the call; default 0. */
  instance?: number
}

interface RunnerCase {
  id: string
  /** What the case pins; recorded nowhere else, it only reads well in `cases.json`. */
  note?: string
  /** The `golden/classes.json` key every spawn of the case is classified under. */
  callSite: string
  platform: HostPlatform
  /** Executable names the PATH probe finds. */
  onPath?: string[]
  /** Variables added to the pinned base env, so a case can say what the process env carried. */
  processEnv?: Record<string, string>
  /** The calls start together and are released together; default one after another. */
  concurrent?: true
  /** How many `createCommandRunner` instances share the deps; default 1. */
  instances?: number
  calls: CallSpec[]
  /** One step per spawn, consumed in order. */
  script: RunnerStep[]
  /** The pairwise row this case was built from. */
  axes?: Record<string, string | number | boolean>
}

// ---------------------------------------------------------------------------------------------
// The case tables
// ---------------------------------------------------------------------------------------------

/** Tracer (88.2-01 Task 1): one legendary `list`, exit 0, two stdout chunks and one stderr chunk. */
function tracerCases(): RunnerCase[] {
  return [
    {
      id: 'runner-tracer-legendary-list',
      note: 'the end-to-end tracer: spawn, log frames, stream and result of one callRunner',
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        {
          runner: {
            name: 'legendary',
            bin: 'legendary',
            dir: '<TOOLS>/legendary'
          },
          commandParts: ['list', '--json'],
          options: { abortId: 'tracer-list', observe: true }
        }
      ],
      script: [
        {
          chunks: [
            { stream: 'stdout', text: '[{"app_name": "alpha"}' },
            { stream: 'stderr', text: '[cli] INFO: fetching\n' },
            { stream: 'stdout', text: ',{"app_name": "beta"}]\n' }
          ],
          code: 0
        }
      ]
    }
  ]
}

function runnerCases(): RunnerCase[] {
  return [...tracerCases()]
}

/** The documented Rust-side differences (D-19); a delta no case uses is itself an error on the Rust side. */
const DELTAS: Record<string, string> = {
  'shell-injected-env':
    'The sidecar process this TS ran in carried GAMELIB_SHELL_EXE, GAMELIB_APP_ROOT, GAMELIB_STEAM_ROOT_DEFAULT and GAMELIB_STORE_BOOT, injected by src-tauri/src/sidecar.rs. A spawn from the shell own environment does not carry them, so the Rust runner env is the golden env without those four keys. No golden here holds them (the cases run on the pinned base env), so the Rust side adds none and the delta only records the rule for the cases that compare against a sidecar-run recording.',
  'random-abort-id':
    'A call with no abortId and no app name takes Math.random().toString() as its abort id and track key. The cases pin Math.random to a fixed value, so the golden holds that string; the Rust runner takes a unique id of its own and the comparison replaces it.'
}

// ---------------------------------------------------------------------------------------------
// Running one case
// ---------------------------------------------------------------------------------------------

const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve))

interface RecordedCase {
  result: unknown
  events: unknown[]
  spawns: unknown[]
  logFrames: unknown[]
  stream: unknown[]
  calls: unknown[]
}

/** Runs one case on a fresh fake HOME and returns everything it recorded, normalised. */
async function recordCase(
  c: RunnerCase,
  classes: ReturnType<typeof loadClasses>
): Promise<RecordedCase> {
  return withEngineOracleProfile(async (profile) => {
    const trace = createRunnerTrace(profile, {
      platform: c.platform,
      onPath: c.onPath,
      script: c.script
    })
    const random = jest.spyOn(Math, 'random').mockReturnValue(PINNED_RANDOM)
    try {
      const out = await withInjected([injectPlatform(OS[c.platform])], () =>
        withPinnedBaseEnv(profile.fake, async () => {
          Object.assign(process.env, c.processEnv)
          const instances = Array.from({ length: c.instances ?? 1 }, () =>
            createCommandRunner(trace.deps)
          )
          const streams = c.calls.map((spec) =>
            spec.options?.observe ? recordStream() : null
          )
          const start = (spec: CallSpec, index: number) => {
            const o = spec.options ?? {}
            const writers = Array.from(
              { length: o.extraWriters ?? 0 },
              () =>
                new LogWriter(
                  {
                    kind: 'game',
                    appName: 'game-writer',
                    runner: spec.runner.name,
                    type: 'launch'
                  },
                  false
                )
            )
            const runner = instances[spec.instance ?? 0]
            if (!runner)
              throw new Error(`${c.id}: no instance ${spec.instance}`)
            return runner.callRunner(
              [...spec.commandParts],
              {
                name: spec.runner.name,
                logPrefix: RunnerToLogPrefixMap[spec.runner.name],
                bin: expandPlaceholders(spec.runner.bin, profile),
                dir:
                  spec.runner.dir === undefined
                    ? undefined
                    : expandPlaceholders(spec.runner.dir, profile)
              },
              {
                ...(o.env && { env: { ...o.env } }),
                ...(o.cwd !== undefined && {
                  cwd: expandPlaceholders(o.cwd, profile)
                }),
                ...(o.abortId !== undefined && { abortId: o.abortId }),
                ...(o.trackKey !== undefined && { trackKey: o.trackKey }),
                ...(streams[index] && { onOutput: streams[index].onOutput }),
                ...(o.skipErrorHandler !== undefined && {
                  skipErrorHandler: o.skipErrorHandler
                }),
                ...(o.logMessagePrefix !== undefined && {
                  logMessagePrefix: o.logMessagePrefix
                }),
                ...(o.sanitizer && { logSanitizer: SANITIZERS[o.sanitizer] }),
                ...(writers.length > 0 && { logWriters: writers })
              }
            )
          }
          const settle = async (promises: Promise<unknown>[]) => {
            await flush()
            await flush()
            trace.releaseAll()
            return Promise.all(promises)
          }
          let results: Awaited<ReturnType<typeof start>>[]
          if (c.concurrent) {
            results = (await settle(c.calls.map(start))) as typeof results
          } else {
            results = []
            for (const [index, spec] of c.calls.entries()) {
              results.push(
                ...((await settle([start(spec, index)])) as typeof results)
              )
            }
          }
          trace.expectScriptConsumed()
          return {
            results,
            identical: c.concurrent
              ? results.map((r) => results.indexOf(r))
              : undefined,
            streams: streams.map((s) => s?.chunks ?? null)
          }
        })
      )
      const spawns = attachSpawnClass(
        trace.records.spawns.map((spawn) => ({
          ...spawn,
          callSite: c.callSite
        })),
        classes
      )
      return {
        result: normalisePaths(
          {
            results: out.results,
            ...(out.identical && { identical: out.identical })
          },
          profile
        ),
        events: normalisePaths(trace.records.logs, profile),
        spawns: normalisePaths(spawns, profile),
        logFrames: normalisePaths(trace.records.logFrames, profile),
        stream: normalisePaths(out.streams, profile),
        calls: normalisePaths(trace.records.calls, profile)
      }
    } finally {
      random.mockRestore()
      trace.restore()
    }
  })
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describeSkipOnWindows('command runner oracle (88.2-01)', () => {
  const built = runnerCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json(DELTAS))
  }
  const cases = loadCases<RunnerCase>(CRATE, SLICE)
  const classes = loadClasses(CRATE)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('deltas.json is exactly the documented delta table, each with a reason of its own', () => {
    const committed: unknown = JSON.parse(
      readFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), 'utf8')
    )
    expect(committed).toEqual(DELTAS)
    for (const reason of Object.values(DELTAS)) {
      expect(reason.length).toBeGreaterThan(20)
    }
  })

  it.each(cases)('$id', async (c) => {
    const recorded = await recordCase(c, classes)
    writeOrCompareGolden(CRATE, SLICE, c.id, {
      result: recorded.result,
      events: recorded.events,
      spawns: recorded.spawns,
      extra: {
        'logFrames.json': recorded.logFrames,
        'stream.json': recorded.stream,
        'calls.json': recorded.calls
      }
    })
  })

  it('the tracer records the runner-log entries with rotate true on the first and false after', async () => {
    const tracer = cases.find((c) => c.id === 'runner-tracer-legendary-list')
    if (!tracer) throw new Error('the tracer case is missing')
    const recorded = await recordCase(tracer, classes)
    const runnerFrames = (
      recorded.logFrames as { target: { kind: string }; rotate: boolean }[]
    ).filter((frame) => frame.target.kind === 'runner')
    expect(runnerFrames.length).toBeGreaterThan(1)
    expect(runnerFrames.map((frame) => frame.rotate)).toEqual(
      runnerFrames.map((_frame, index) => index === 0)
    )
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, cases.length)
    assertManifest(CRATE, SLICE, cases, RUNNER_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, RUNNER_FLOOR)
  })
})
