/**
 * The command runner oracle (88.2-01, D-11, D-12, D-13, D-14, D-22, D-25): `callRunner`, the store
 * CLI runner every library manager and every game launch goes through, driven through the real
 * `createCommandRunner` over a scripted spawn tracer on a fresh fake HOME and recorded as the golden
 * the Rust `gamelib-launch` runner has to reproduce. The golden exists before any Rust runner does.
 * `runWineCommand`, `getWinePath` and `runScriptForGame` are 88.2-04's, the redaction and sanitizer
 * vectors are 88.2-03's (the `redaction` slice at the end of this file).
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
import {
  PINNED_BASE,
  withPinnedBaseEnv
} from 'backend/testUtils/launchOracle/baseEnv'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import {
  allPairs,
  uncoveredPairs,
  type Axes,
  type Row
} from 'backend/testUtils/launchOracle/pairwise'
import {
  injectPlatform,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import {
  createRunnerTrace,
  recordStream,
  type RunnerStep,
  type ScriptChunk
} from 'backend/testUtils/launchOracle/runnerTrace'
import {
  attachSpawnClass,
  loadClasses
} from 'backend/testUtils/launchOracle/spawnClass'
import {
  createCommandRunner,
  getRunnerCallWithoutCredentials
} from 'backend/commandRunner'
import { authLogSanitizer as gogAuthLogSanitizer } from 'backend/storeManagers/gog/user'
import { authLogSanitizer as nileAuthLogSanitizer } from 'backend/storeManagers/nile/user'
import LogWriter from 'backend/logger/targetWriter'
import { RunnerToLogPrefixMap } from 'backend/logger/constants'
import type { Runner } from 'common/types'

const CRATE = 'gamelib-launch'
const SLICE = 'runner'
/** The stem of a case that stands for one `it` title of commandRunner.test.ts. */
const CENSUS_STEM = 'commandRunner'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const RUNNER_FLOOR = 93

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
  /**
   * The case calls `getRunnerCallWithoutCredentials` itself instead of `callRunner`: `command` is
   * its first argument, `converts` what the legendary command-array converter answers.
   */
  direct?: {
    command: string[] | Record<string, unknown>
    env?: Record<string, string>
    runnerPath: string
    converts?: string[]
  }
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

// ---- the commandRunner.test.ts titles --------------------------------------------------------

/** The eight credential flags, each with a synthetic value, after a command word. */
const EIGHT_FLAGS = [
  'register',
  '--code',
  'code-1',
  '--token',
  'token-1',
  '--code-verifier',
  'verifier-1',
  '--password',
  'pw-1',
  '--serial',
  'serial-1',
  '--client-id',
  'client-1',
  '--access-token',
  'access-1',
  '--refresh-token',
  'refresh-1'
]

const GOGDL = { name: 'gog' as const, bin: 'gogdl' }
const out = (text: string): ScriptChunk => ({ stream: 'stdout', text })
const err = (text: string): ScriptChunk => ({ stream: 'stderr', text })
const LEGENDARY_LINE =
  'Stored credentials are no longer valid! Please login again.'

/** The `it` titles of commandRunner.test.ts one case each; `Layer-2: ` is part of the title. */
type NamedCase = Omit<RunnerCase, 'id' | 'axes'>

/** One call of the gogdl runner, the way the legacy suite made it. */
const gogCall = (
  commandParts: string[],
  options?: CallSpec['options']
): CallSpec => ({
  runner: GOGDL,
  commandParts,
  ...(options && { options })
})

const NAMED: Record<string, NamedCase> = {
  // -- close-handler exit-code classification (D-2 root cause)
  'Layer-2: resolves as success (no .error/.abort) on a clean code=0 exit': {
    callSite: 'runner.call',
    platform: 'linux',
    calls: [gogCall(['download', 'clean'])],
    script: [{ code: 0 }]
  },
  'Layer-2: a non-zero exit code WITHOUT a signal is surfaced as .error': {
    callSite: 'runner.call',
    platform: 'linux',
    calls: [gogCall(['download', 'nonzero'])],
    script: [{ code: 1 }]
  },
  'Layer-2: a signal-terminated process (not aborted) is classified as .error':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [gogCall(['download', 'sig'])],
      script: [{ code: null, signal: 'SIGTERM' }]
    },
  'Layer-2: a non-zero exit AFTER the abort controller was aborted is .abort, not .error':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [gogCall(['download', 'aborted'], { abortId: 'aborted' })],
      script: [{ code: 1, abortAfterExit: true }]
    },
  'Layer-2: a signal-terminated process AFTER abort is .abort (held run, abort signal)':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        gogCall(['download', 'aborted-signal'], { abortId: 'aborted-signal' })
      ],
      script: [{ hold: true, abortWhileHeld: true }]
    },

  // -- an intended kill reads as a cancellation, not an error (66.1-23)
  'a signal exit the runner marks killedByUs is .abort even with no abort controller signalled':
    {
      callSite: 'runner.call.launch',
      platform: 'linux',
      calls: [gogCall(['launch', 'x', 'stopped'], { abortId: 'stopped' })],
      script: [{ code: null, signal: 'SIGTERM', killedByUs: true }]
    },
  'a signal exit NOT marked killedByUs still surfaces as an error (the marker is the only cancel signal)':
    {
      callSite: 'runner.call.launch',
      platform: 'linux',
      calls: [gogCall(['launch', 'x', 'crash'], { abortId: 'crash' })],
      script: [{ code: null, signal: 'SIGTERM' }]
    },
  'a non-zero exit marked killedByUs (graceful shutdown after SIGTERM) is .abort too':
    {
      callSite: 'runner.call.launch',
      platform: 'linux',
      calls: [gogCall(['launch', 'x', 'graceful'], { abortId: 'graceful' })],
      script: [{ code: 1, killedByUs: true }]
    },

  // -- in-flight dedup never swallows a caller that observes output (49-REVIEW WR-01)
  'Layer-2: a second caller with identical argv and an onOutput observer gets its OWN run and sees the stream':
    {
      callSite: 'runner.call',
      platform: 'linux',
      concurrent: true,
      calls: [
        gogCall(['list-updates', '--json'], { abortId: 'lib-caller' }),
        gogCall(['list-updates', '--json'], {
          abortId: 'probe-caller',
          observe: true
        })
      ],
      script: [
        { hold: true, abortWhileHeld: true },
        { chunks: [out('[]\n')], hold: true, abortWhileHeld: true }
      ]
    },
  'Layer-2: two callers WITHOUT an observer still share one run (dedup unchanged)':
    {
      callSite: 'runner.call',
      platform: 'linux',
      concurrent: true,
      calls: [
        gogCall(['list-updates', '--json', 'dedup-control'], { abortId: 'a' }),
        gogCall(['list-updates', '--json', 'dedup-control'], { abortId: 'b' })
      ],
      script: [{ hold: true }]
    },
  'Layer-2: an observing caller does not register as joinable: a later plain caller runs its own':
    {
      callSite: 'runner.call',
      platform: 'linux',
      concurrent: true,
      calls: [
        gogCall(['list-updates', '--json', 'observer-first'], {
          abortId: 'probe-first',
          observe: true
        }),
        gogCall(['list-updates', '--json', 'observer-first'], {
          abortId: 'plain-second'
        })
      ],
      script: [{ hold: true }, { code: 0 }]
    },
  'Layer-2: the dedup entry is released when the run settles, so a later identical call runs again':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [gogCall(['list', 'again']), gogCall(['list', 'again'])],
      script: [{ code: 0 }, { code: 0 }]
    },
  'Layer-2: the in-flight map lives in the factory closure, not module scope': {
    callSite: 'runner.call',
    platform: 'linux',
    concurrent: true,
    instances: 2,
    calls: [
      { ...gogCall(['list', 'closure'], { abortId: 'x' }), instance: 0 },
      { ...gogCall(['list', 'closure'], { abortId: 'y' }), instance: 1 }
    ],
    script: [{ hold: true, abortWhileHeld: true }, { code: 0 }]
  },

  // -- credential redaction through the production callRunner path (34.5-61); synthetic secrets only
  'Layer-2: nile register argv: --code and --code-verifier both redact independently, plus --serial/--client-id':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        gogCall([
          'register',
          '--code',
          'code-123',
          '--code-verifier',
          'verifier-456',
          '--serial',
          'serial-789',
          '--client-id',
          'client-012'
        ])
      ],
      script: [{ code: 0 }]
    },
  'Layer-2: GOG --password argv: raw private-branch password redacted': {
    callSite: 'runner.call',
    platform: 'linux',
    calls: [gogCall(['install', 'someAppId', '--password', 'pw-xyz789'])],
    script: [{ code: 0 }]
  },
  'Layer-2: GOG comet token argv (261110-vdk): --access-token and --refresh-token both redacted':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        gogCall([
          'comet',
          '--access-token',
          'access-4f1a',
          '--refresh-token',
          'refresh-9c3e'
        ])
      ],
      script: [{ code: 0 }]
    },
  'Layer-2: the credentials never reach the log writers either': {
    callSite: 'runner.call',
    platform: 'linux',
    calls: [
      gogCall(['install', 'a', '--password', 'pw-w'], { extraWriters: 1 })
    ],
    script: [{ code: 0 }]
  },
  'Layer-2: getRunnerCallWithoutCredentials takes the legendary command-array converter as a dep':
    {
      callSite: 'runner.call',
      platform: 'linux',
      direct: {
        command: { foo: 1 },
        runnerPath: 'legendary',
        converts: ['auth', '--token', 'legendary-secret']
      },
      calls: [],
      script: []
    },

  // -- credential redaction: PowerShell -ArgumentList branch (34.5-61)
  'Layer-2: redacts every added flag inside the -ArgumentList string, not just the array-member branch':
    {
      callSite: 'runner.call',
      platform: 'win32',
      onPath: ['powershell'],
      calls: [
        gogCall([
          'register',
          '--code',
          'code-123',
          '--code-verifier',
          'verifier-456',
          '--serial',
          'serial-789',
          '--client-id',
          'client-012',
          '--password',
          'pw-xyz789'
        ])
      ],
      script: [{ program: 'powershell', code: 0 }]
    },
  'Layer-2: the PowerShell probe runs once per factory, then the result is reused':
    {
      callSite: 'runner.call',
      platform: 'win32',
      onPath: ['powershell'],
      calls: [gogCall(['a', 'one']), gogCall(['a', 'two'])],
      script: [
        { program: 'powershell', code: 0 },
        { program: 'powershell', code: 0 }
      ]
    },
  'Layer-2: without PowerShell on win32 the runner binary is spawned directly':
    {
      callSite: 'runner.call',
      platform: 'win32',
      onPath: [],
      calls: [gogCall(['a', 'direct'])],
      script: [{ program: 'gogdl', code: 0 }]
    },

  // -- credential redaction census gate (34.5-61): the TS titles scan source; the case pins the same list
  'Layer-2: non-vacuity anchor: the redaction list extracted from source contains all eight flags':
    {
      callSite: 'runner.call',
      platform: 'linux',
      note: 'one argv carrying all eight flags: every value is redacted, so the list holds all eight',
      calls: [gogCall(EIGHT_FLAGS)],
      script: [{ code: 0 }]
    },
  'Layer-2: census detects the GOG comet token flags (not vacuous for them)': {
    callSite: 'runner.call',
    platform: 'linux',
    note: 'the two comet token flags on their own, with a command word between them',
    calls: [
      gogCall([
        'comet',
        '--access-token',
        'access-census',
        'launch',
        '--refresh-token',
        'refresh-census'
      ])
    ],
    script: [{ code: 0 }]
  },
  'Layer-2: every credential-bearing --flag literal in backend source is a member of the redaction list':
    {
      callSite: 'runner.call',
      platform: 'win32',
      onPath: ['powershell'],
      note: 'all eight flags through the PowerShell branch, where the list is applied to the -ArgumentList string',
      calls: [gogCall(EIGHT_FLAGS)],
      script: [{ program: 'powershell', code: 0 }]
    },

  // -- callRunner skipErrorHandler (49-03, 49-SPEC P2)
  'Layer-2: Test 1: a failing run with skipErrorHandler never reaches errorHandler, yet onOutput saw the stderr chunk verbatim':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        gogCall(['status', 'skip-fail'], {
          skipErrorHandler: true,
          observe: true
        })
      ],
      script: [{ chunks: [err(LEGENDARY_LINE)], code: 1 }]
    },
  'Layer-2: Test 2: a clean exit with skipErrorHandler never reaches errorHandler and carries no .error/.abort':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [gogCall(['status', 'skip-clean'], { skipErrorHandler: true })],
      script: [{ code: 0 }]
    },
  'Layer-2: Test 3: without the option the same failing run still reaches errorHandler':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [gogCall(['status', 'default-fail'])],
      script: [{ chunks: [err(LEGENDARY_LINE)], code: 1 }]
    },
  'Layer-2: Test 4: with skipErrorHandler an aborted run is .abort and never reaches errorHandler':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        gogCall(['status', 'skip-abort'], {
          abortId: 'skip-abort',
          skipErrorHandler: true
        })
      ],
      script: [{ hold: true, abortWhileHeld: true }]
    },

  // -- callRunner characterization (66.1 MH-4)
  'Layer-2: tracks the run under trackKey with the runner name, else under the abortId alone':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        gogCall(['list', 'l1-trackkey'], {
          trackKey: 'my-key',
          abortId: 'ignored-abort'
        }),
        gogCall(['list', 'l1-abortkey'], { abortId: 'my-abort' })
      ],
      script: [{ code: 0 }, { code: 0 }]
    },
  'Layer-2: runs with the option cwd and an env where option keys win over process.env':
    {
      callSite: 'runner.call',
      platform: 'linux',
      processEnv: {
        L2_ENV_SENTINEL: 'from-process',
        L2_ENV_SHARED: 'from-process'
      },
      calls: [
        gogCall(['list', 'l1-env'], {
          cwd: '<TMP>/l1/cwd',
          env: { L2_ENV_SHARED: 'from-options', L2_ENV_OPT: 'opt' }
        })
      ],
      script: [{ code: 0 }]
    },
  'Layer-2: a runner dir joins the cwd and prefixes a relative bin with ./ off Windows':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        {
          runner: { ...GOGDL, dir: '<TOOLS>/gogdl' },
          commandParts: ['list', 'dir']
        }
      ],
      script: [{ code: 0 }]
    },
  'Layer-2: writes the command header to every log writer before the first output chunk':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [gogCall(['list', 'l1-header'], { extraWriters: 1 })],
      script: [{ chunks: [out('first-chunk')], code: 0 }]
    },
  'Layer-2: the runner log writer is appended automatically and gets the output':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [gogCall(['list', 'runner-writer'])],
      script: [{ chunks: [out('to-runner-log')], code: 0 }]
    },
  'Layer-2: applies logSanitizer to the writers but hands onOutput the raw chunk':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        gogCall(['list', 'l1-sanitizer'], {
          extraWriters: 1,
          sanitizer: 'mask-secret',
          observe: true
        })
      ],
      script: [{ chunks: [out('token=SECRET'), err('err=SECRET')], code: 0 }]
    },
  'Layer-2: joins trimmed stdout chunks with "" and trimmed stderr chunks with a newline':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [gogCall(['list', 'l1-join'])],
      script: [
        {
          chunks: [out(' a \n'), out('\n b '), err(' x \n'), err(' y ')],
          code: 0
        }
      ]
    },
  'Layer-2: classifies a run aborted through abortId as { abort: true } with empty output and no error':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [gogCall(['list', 'l1-abort'], { abortId: 'l1-abort-id' })],
      script: [{ chunks: [out('partial')], hold: true, abortWhileHeld: true }]
    },
  'Layer-2: passes the documented run options: timeout opt-out with a reason, windowsHide false, replaceEnv':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [gogCall(['list', 'opts'])],
      script: [{ code: 0 }]
    },
  'Layer-2: a spawn failure is classified as .error, reaches errorHandler and is logged':
    {
      callSite: 'runner.call',
      platform: 'linux',
      calls: [gogCall(['list', 'enoent'])],
      script: [{ throws: 'ENOENT' }]
    },
  'Layer-2: removes the abort registry entry once the call settles': {
    callSite: 'runner.call',
    platform: 'linux',
    calls: [gogCall(['list', 'cleanup'], { abortId: 'gone' })],
    script: [{ code: 0 }]
  }
}

/** The `describe` titles whose `it`s are callRunner's (every other describe has a named owner). */
const CALL_RUNNER_DESCRIBES = [
  'Layer-2: callRunner close-handler exit-code classification (D-2 root cause)',
  'Layer-2: an intended kill reads as a cancellation, not an error (66.1-23)',
  'Layer-2: in-flight dedup never swallows a caller that observes output (49-REVIEW WR-01)',
  'Layer-2: credential redaction through the production callRunner path (34.5-61)',
  'Layer-2: credential redaction: PowerShell -ArgumentList branch (34.5-61)',
  'Layer-2: credential redaction census gate (34.5-61)',
  'Layer-2: callRunner skipErrorHandler (49-03, 49-SPEC P2)',
  'Layer-2: callRunner characterization (66.1 MH-4)'
]

const OWNED_BY_88_2_04 = [
  'Layer-2: runWineCommand resolveOnExit',
  'Layer-2: runWineCommand characterization (66.1 MH-4)',
  'Layer-2: getWinePath',
  'Layer-2: runScriptForGame characterization (66.1 MH-4)'
]
const REAL_CHILDREN = 'Layer-2: real children (createRealRunner, fake HOME)'

const COMMAND_RUNNER_TEST = join(__dirname, '..', 'commandRunner.test.ts')

/** Every `it` title of commandRunner.test.ts, `describe > it`. */
const commandRunnerTitles = (): string[] => tsTestTitles(COMMAND_RUNNER_TEST)

const describeOf = (title: string): string => title.split(' > ')[0] ?? ''

/** The titles that are not callRunner's, each with the owner that records or tests it. */
function notPorted(titles: readonly string[]): Record<string, string> {
  const owners: Record<string, string> = {}
  for (const title of titles) {
    const describe = describeOf(title)
    if (CALL_RUNNER_DESCRIBES.includes(describe)) continue
    if (OWNED_BY_88_2_04.includes(describe)) {
      owners[title] =
        '88.2-04: runWineCommand, getWinePath and runScriptForGame are recorded with the wine env builders in golden/runner_wine'
    } else if (describe === REAL_CHILDREN) {
      owners[title] =
        'gamelib-launch/tests/runner_real.rs (88.2-07): a real-children test, not a golden'
    } else {
      throw new Error(
        `commandRunner.test.ts has a describe with no owner: ${describe}`
      )
    }
  }
  return owners
}

/** One named case per callRunner `it` title: `commandRunner--<slug of describe > it>`. */
function namedCases(): RunnerCase[] {
  const titles = commandRunnerTitles()
  const callRunnerTitles = titles.filter((title) =>
    CALL_RUNNER_DESCRIBES.includes(describeOf(title))
  )
  const itOf = (title: string): string =>
    title.split(' > ').slice(1).join(' > ')
  const cases: RunnerCase[] = []
  for (const title of callRunnerTitles) {
    const named = NAMED[itOf(title)]
    if (!named) {
      throw new Error(`no named runner case for the title: ${title}`)
    }
    cases.push({ id: `${CENSUS_STEM}--${slug(title)}`, ...named })
  }
  const known = new Set(callRunnerTitles.map(itOf))
  const stale = Object.keys(NAMED).filter((key) => !known.has(key))
  if (stale.length > 0) {
    throw new Error(
      `NAMED holds a title commandRunner.test.ts does not: ${stale.join(' | ')}`
    )
  }
  return cases
}

// ---- dedup, transcripts, app names ------------------------------------------------------------

const LEGENDARY = { name: 'legendary' as const, bin: 'legendary' }

function dedupCases(): RunnerCase[] {
  const list = ['list', '--json']
  return [
    {
      id: 'runner-dedup-joined-one-spawn',
      note: 'two concurrent identical joinable calls produce one spawn and two equal results',
      callSite: 'runner.call',
      platform: 'linux',
      concurrent: true,
      calls: [
        {
          runner: LEGENDARY,
          commandParts: list,
          options: { abortId: 'dedup-a' }
        },
        {
          runner: LEGENDARY,
          commandParts: list,
          options: { abortId: 'dedup-b' }
        }
      ],
      script: [{ hold: true, chunks: [out('joined\n')], code: 0 }]
    },
    {
      id: 'runner-dedup-observer-neither-joins-nor-registers',
      note: '49-REVIEW WR-01: the observing caller runs its own and is not joinable; the two plain callers after it share one run',
      callSite: 'runner.call',
      platform: 'linux',
      concurrent: true,
      calls: [
        {
          runner: LEGENDARY,
          commandParts: list,
          options: { abortId: 'dedup-observer', observe: true }
        },
        {
          runner: LEGENDARY,
          commandParts: list,
          options: { abortId: 'dedup-first' }
        },
        {
          runner: LEGENDARY,
          commandParts: list,
          options: { abortId: 'dedup-second' }
        }
      ],
      script: [
        { hold: true, chunks: [out('observed\n')], code: 0 },
        { hold: true, chunks: [out('shared\n')], code: 0 }
      ]
    },
    {
      id: 'runner-dedup-entry-removed-after-settle',
      note: 'the in-flight entry is gone once the run settles, so the third identical call spawns again',
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        {
          runner: LEGENDARY,
          commandParts: list,
          options: { abortId: 'dedup-1' }
        },
        {
          runner: LEGENDARY,
          commandParts: list,
          options: { abortId: 'dedup-2' }
        },
        {
          runner: LEGENDARY,
          commandParts: list,
          options: { abortId: 'dedup-3' }
        }
      ],
      script: [{ code: 0 }, { code: 0 }, { code: 0 }]
    }
  ]
}

/** `count` progress chunks, the way a store CLI prints them: a line, a newline, some padding. */
const progressChunks = (
  count: number,
  line: (index: number) => string,
  stream: ScriptChunk['stream'] = 'stdout'
): ScriptChunk[] =>
  Array.from({ length: count }, (_unused, index) => ({
    stream,
    text: line(index + 1)
  }))

function transcriptCases(): RunnerCase[] {
  const total = 60
  return [
    {
      id: 'runner-transcript-legendary-install-progress',
      note: 'sixty stdout chunks, ten more than the fifty-message window: the result keeps the last fifty',
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        {
          runner: LEGENDARY,
          commandParts: ['install', 'app-legendary', '--base-path', '/games'],
          options: { observe: true }
        }
      ],
      script: [
        {
          chunks: [
            ...progressChunks(
              total - 1,
              (n) =>
                `[DLManager] INFO: = Progress: ${((n / total) * 100).toFixed(2)}% (${n}/${total}), Running for 00:00:${String(n).padStart(2, '0')}, ETA: 00:00:${String(total - n).padStart(2, '0')}\n`
            ),
            out('[cli] INFO: Finished installation process in 00:01:00\n')
          ],
          code: 0
        }
      ]
    },
    {
      id: 'runner-transcript-gog-download-interleaved',
      note: 'gogdl writes progress to stdout and its log lines to stderr, interleaved',
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        {
          runner: GOGDL,
          commandParts: ['download', 'app-gog', '--path', '/games'],
          options: { observe: true }
        }
      ],
      script: [
        {
          chunks: Array.from({ length: 30 }, (_unused, index) => [
            out(`progress ${index + 1}/30\n`),
            err(`[gogdl] debug: chunk ${index + 1} verified\n`)
          ]).flat(),
          code: 0
        }
      ]
    },
    {
      id: 'runner-transcript-nile-json-split',
      note: 'one JSON reply split across chunks, two of the splits inside a string next to a space',
      callSite: 'runner.call',
      platform: 'linux',
      calls: [
        {
          runner: { name: 'nile', bin: 'nile' },
          commandParts: ['library', 'list', '--json'],
          options: { observe: true }
        }
      ],
      script: [
        {
          chunks: [
            out('{"games": [{"title": "Alpha '),
            out('Game", "id": "a1"}, {"title": "Beta'),
            out(' Quest", "id": "b2"}]}\n')
          ],
          code: 0
        }
      ]
    }
  ]
}

/** Every store's app-name rule: where the abort id comes from when the call names none. */
function appNameCases(): RunnerCase[] {
  const rows: [Runner, string, string[]][] = [
    ['gog', 'launch', ['launch', '/games/app-gog', 'app-gog', '--flag']],
    ['gog', 'launch-short', ['launch', '/games/only-path']],
    ['gog', 'download', ['download', 'app-gog', '--path', '/games']],
    ['gog', 'repair', ['repair', 'app-gog']],
    ['gog', 'update', ['update', 'app-gog']],
    ['gog', 'none', ['list']],
    ['legendary', 'launch', ['launch', 'app-legendary', '--offline']],
    ['legendary', 'install', ['install', 'app-legendary']],
    ['legendary', 'repair', ['repair', 'app-legendary']],
    ['legendary', 'update', ['update', 'app-legendary']],
    ['legendary', 'none', ['status', '--json']],
    ['legendary', 'leading-empty', ['', 'launch', 'app-legendary']],
    ['nile', 'launch', ['launch', '--flag', 'app-nile']],
    ['nile', 'install', ['install', '--flag', 'app-nile']],
    ['nile', 'update', ['update', '--flag', 'app-nile']],
    ['nile', 'verify', ['verify', '--flag', 'app-nile']],
    ['nile', 'none', ['library', 'list']],
    ['nile', 'trailing-empty', ['install', 'app-nile', '']],
    ['sideload', 'run', ['run', 'app-sideload']]
  ]
  return rows.map(([name, shape, commandParts]) => ({
    id: `runner-appname-${name}-${shape}`,
    callSite:
      commandParts[0] === 'launch' ? 'runner.call.launch' : 'runner.call',
    platform: 'linux' as const,
    calls: [{ runner: { name, bin: name }, commandParts }],
    script: [{ code: 0 }]
  }))
}

// ---- the pairwise rows (D-14) ------------------------------------------------------------------

const AXES = {
  runner: ['legendary', 'gog', 'nile', 'sideload'],
  platform: ['linux', 'darwin', 'win32-powershell', 'win32-direct'],
  dir: ['set', 'unset'],
  bin: ['relative', 'absolute'],
  env: ['none', 'base-equal', 'differing', 'with-space'],
  abortId: ['explicit', 'derived', 'absent'],
  onOutput: ['set', 'unset'],
  skipErrorHandler: ['true', 'false'],
  logMessagePrefix: ['set', 'unset'],
  outcome: ['exit-0', 'exit-1', 'signal', 'aborted', 'killed', 'throw']
} as const satisfies Axes

/** A sideload command names no app, so an abort id derived from the app name is not a legal pair. */
const feasible = (row: Row): boolean =>
  !(row.abortId === 'derived' && row.runner === 'sideload')

const PAIRWISE_BINS: Record<string, string> = {
  legendary: 'legendary',
  gog: 'gogdl',
  nile: 'nile',
  sideload: 'sideload-run'
}

/** The command a row runs: it names the app unless the row's abort id is `absent`. */
function pairwiseParts(runner: string, abortId: string): string[] {
  const named = abortId !== 'absent'
  switch (runner) {
    case 'legendary':
      return named ? ['launch', 'app-legendary'] : ['status']
    case 'gog':
      return named ? ['launch', '/games/app-gog', 'app-gog'] : ['list']
    case 'nile':
      return named ? ['launch', '--flag', 'app-nile'] : ['library', 'list']
    default:
      return ['run', '--flag']
  }
}

const PAIRWISE_ENV: Record<string, Record<string, string> | undefined> = {
  none: undefined,
  'base-equal': { LANG: PINNED_BASE.LANG },
  differing: { LANG: 'en_NZ.UTF-8' },
  'with-space': { GAMELIB_TEST_VALUE: 'a value with a space' }
}

const PAIRWISE_CHUNKS = [out('out-1\n'), err('err-1\n')]

const PAIRWISE_STEPS: Record<string, RunnerStep> = {
  'exit-0': { chunks: PAIRWISE_CHUNKS, code: 0 },
  'exit-1': { chunks: PAIRWISE_CHUNKS, code: 1 },
  signal: { chunks: PAIRWISE_CHUNKS, code: null, signal: 'SIGTERM' },
  aborted: { chunks: PAIRWISE_CHUNKS, hold: true, abortWhileHeld: true },
  killed: {
    chunks: PAIRWISE_CHUNKS,
    code: null,
    signal: 'SIGTERM',
    killedByUs: true
  },
  throw: { throws: 'ENOENT' }
}

function pairwiseCases(): RunnerCase[] {
  return allPairs(AXES, feasible).map((row, index) => {
    const runner = String(row.runner) as Runner
    const platform = String(row.platform)
    const bin = PAIRWISE_BINS[runner] ?? runner
    const parts = pairwiseParts(runner, String(row.abortId))
    const env = PAIRWISE_ENV[String(row.env)]
    return {
      id: `runner-pairwise-${String(index + 1).padStart(3, '0')}`,
      callSite: parts[0] === 'launch' ? 'runner.call.launch' : 'runner.call',
      platform: platform.startsWith('win32')
        ? 'win32'
        : (platform as HostPlatform),
      ...(platform === 'win32-powershell' && { onPath: ['powershell'] }),
      calls: [
        {
          runner: {
            name: runner,
            bin: row.bin === 'absolute' ? `/opt/gamelib/bin/${bin}` : bin,
            ...(row.dir === 'set' && { dir: `<TOOLS>/${runner}` })
          },
          commandParts: parts,
          options: {
            ...(env && { env }),
            ...(row.abortId === 'explicit' && { abortId: 'pairwise-abort' }),
            ...(row.onOutput === 'set' && { observe: true as const }),
            skipErrorHandler: row.skipErrorHandler === 'true',
            ...(row.logMessagePrefix === 'set' && {
              logMessagePrefix: 'Launching Example'
            })
          }
        }
      ],
      script: [PAIRWISE_STEPS[String(row.outcome)] ?? { code: 0 }],
      axes: row
    }
  })
}

function runnerCases(): RunnerCase[] {
  return [
    ...tracerCases(),
    ...namedCases(),
    ...dedupCases(),
    ...transcriptCases(),
    ...appNameCases(),
    ...pairwiseCases()
  ]
}

/** The documented Rust-side differences (D-19); a delta no case uses is itself an error on the Rust side. */
const DELTAS: Record<string, string> = {
  'shell-injected-env':
    'The sidecar process this TS ran in carried GAMELIB_SHELL_EXE, GAMELIB_APP_ROOT, GAMELIB_STEAM_ROOT_DEFAULT and GAMELIB_STORE_BOOT, injected by src-tauri/src/sidecar.rs. A spawn from the shell own environment does not carry them, so the Rust runner env is the golden env without those four keys. No golden here holds them (the cases run on the pinned base env), so the Rust side adds none and the delta only records the rule for the cases that compare against a sidecar-run recording.',
  'random-abort-id':
    'A call with no abortId and no app name takes Math.random().toString() as its abort id and track key. The cases pin Math.random to a fixed value, so the golden holds that string; the Rust runner takes a unique id of its own and the comparison replaces it.',
  'chunk-boundaries':
    'Where one stdout or stderr chunk ends is an operating-system artefact: Node and the Rust reader both take what a pipe read returns, up to 64 KiB, and a child that writes in bursts is cut at different places on different systems. The scripted replay hands the Rust runner the recorded chunks as they were, so a chunk boundary is never compared against a real pipe; runner_real.rs covers the real reads. The result window keeps the last 50 chunks, so a run that crosses the window with different cuts can keep different text; that quirk (the window counts chunks, not bytes) is filed as a todo and kept as recorded.',
  'spawn-error-text':
    'The message of a spawn failure is the one the operating system gives the spawning side: Node reports `spawn <bin> ENOENT`, the Rust runner reports `spawn <bin>: <OS error text>`. The replay of a case whose recorded error starts with `spawn ` compares that the Rust error starts with `spawn `, that stderr equals the error, and every other field of the result and the Error running command line prefix; the text after it is not compared.',
  'windows-path-separator':
    'The win32 cases were recorded on a POSIX host, where Node path.join joins with a slash; on Windows it joins with a backslash, and the Rust runner joins with the separator of the platform it is told it runs on. The replay on any host substitutes, in the actual output, the backslash-joined runner path with the slash-joined one before comparing, so only the separator of that one joined path is excused and every other character (the doubled backslashes inside PowerShell arguments included) is compared as recorded.'
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
          if (c.direct) {
            const direct = c.direct
            const line = getRunnerCallWithoutCredentials(
              direct.command as never,
              direct.env,
              direct.runnerPath,
              (command) => {
                trace.records.calls.push({
                  seam: 'commandToArgsArray',
                  command
                })
                return [...(direct.converts ?? [])]
              }
            )
            return {
              results: [{ line }] as unknown[],
              identical: undefined,
              streams: [] as (string[] | null)[]
            }
          }
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
          let results: unknown[]
          if (c.concurrent) {
            results = await settle(c.calls.map(start))
          } else {
            results = []
            for (const [index, spec] of c.calls.entries()) {
              results.push(...(await settle([start(spec, index)])))
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

  const byId = (id: string): RunnerCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`${id} is missing from cases.json`)
    return found
  }

  it('the tracer records the runner-log entries with rotate true on the first and false after', async () => {
    const recorded = await recordCase(
      byId('runner-tracer-legendary-list'),
      classes
    )
    const runnerFrames = (
      recorded.logFrames as { target: { kind: string }; rotate: boolean }[]
    ).filter((frame) => frame.target.kind === 'runner')
    expect(runnerFrames.length).toBeGreaterThan(1)
    expect(runnerFrames.map((frame) => frame.rotate)).toEqual(
      runnerFrames.map((_frame, index) => index === 0)
    )
  })

  it('every pair of pairwise axis values that can occur together is in some runner-pairwise row', () => {
    const rows = cases
      .filter((c) => c.id.startsWith('runner-pairwise-'))
      .map((c) => c.axes as Row)
    expect(rows.length).toBeGreaterThan(0)
    expect(uncoveredPairs(AXES, rows, feasible)).toEqual([])
    // Every value of every axis appears in at least one row (a one-axis claim, not a pair).
    for (const [axis, values] of Object.entries(AXES)) {
      for (const value of values) {
        expect(rows.some((row) => row[axis] === value)).toBe(true)
      }
    }
  })

  it('every callRunner title of commandRunner.test.ts is a named case, and every other title names its owner', () => {
    const titles = commandRunnerTitles()
    const owners = notPorted(titles)
    const ids = cases
      .map((c) => c.id)
      .filter((id) => id.startsWith(`${CENSUS_STEM}--`))
      .map((id) => id.slice(CENSUS_STEM.length + 2))
    assertCasesCoverTitles(ids, titles, owners)
    for (const owner of Object.values(owners)) {
      expect(owner).toMatch(/88\.2-04|runner_real\.rs/)
    }
    // Both owners are in use: the map names 88.2-04 for the wine titles and runner_real.rs for the real children.
    expect(Object.values(owners).some((o) => o.includes('88.2-04'))).toBe(true)
    expect(
      Object.values(owners).some((o) => o.includes('runner_real.rs'))
    ).toBe(true)
  })

  it('a transcript of more than fifty stdout chunks answers with exactly the last fifty', async () => {
    const c = byId('runner-transcript-legendary-install-progress')
    const chunks = c.script.flatMap((step) => step.chunks ?? [])
    const stdoutChunks = chunks.filter((chunk) => chunk.stream === 'stdout')
    expect(stdoutChunks.length).toBeGreaterThan(50)
    const recorded = await recordCase(c, classes)
    const result = (recorded.result as { results: { stdout: string }[] })
      .results[0]
    expect(result?.stdout).toBe(
      stdoutChunks
        .slice(-50)
        .map((chunk) => chunk.text.trim())
        .join('')
    )
  })

  it('every runner call site named in classes.json is one of the eight 88.2 ones, and no case uses an unclassified one', () => {
    const runnerSites = Object.keys(classes).filter((site) =>
      site.startsWith('runner.')
    )
    expect(runnerSites.sort()).toEqual(
      [
        'runner.call',
        'runner.call.launch',
        'runner.script',
        'runner.spawn_async',
        'runner.wine_command',
        'runner.wine_command.launch',
        'runner.wine_command.wineserver_wait',
        'runner.wine_path'
      ].sort()
    )
    for (const c of cases) expect(classes[c.callSite]).toBeDefined()
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, cases.length)
    assertManifest(CRATE, SLICE, cases, RUNNER_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, RUNNER_FLOOR)
  })
})

// =============================================================================================
// The redaction slice (88.2-03, D-11, D-25, prohibition 2)
//
// `getRunnerCallWithoutCredentials` and the gog and nile `authLogSanitizer` are pure functions the
// Rust port (88.2-08) has to match byte for byte. Each vector is `{ name, kind, input, output }`:
// the input is written here, the output is only ever recorded from the TS function (write mode),
// never typed. Slice `gamelib-launch/tests/fixtures/golden/redaction/`:
//   vectors.json    every vector, in table order
//   MANIFEST.json   `{ count, floor }`
// Every credential-shaped value is a synthetic string, and an env-diff vector runs on the pinned
// base env of a fresh fake HOME (D-12, D-22), so no real variable or path reaches the file.
// `null` in a vector's `env` stands for an `undefined` value (JSON has no undefined).
// =============================================================================================

const REDACTION_SLICE = 'redaction'
/** The vector count this plan committed; a later edit may raise it, never lower it. */
const REDACTION_FLOOR = 88

type RedactionKind = 'redact' | 'sanitize-gog' | 'sanitize-nile'

interface RedactInput {
  /** An argv, or a LegendaryCommand object handed to the converter. */
  command: string[] | Record<string, unknown>
  env?: Record<string, string | null>
  runnerPath: string
  /** What the legendary command-array converter answers for an object command. */
  converts?: string[]
}

interface SanitizeInput {
  line: string
}

interface RedactionVector {
  name: string
  kind: RedactionKind
  input: RedactInput | SanitizeInput
}

interface RecordedVector extends RedactionVector {
  output: string
}

/** The eight flags the runner redacts, in the order the TS loop visits them. */
const REDACTED_FLAGS = [
  '--code',
  '--token',
  '--code-verifier',
  '--password',
  '--serial',
  '--client-id',
  '--access-token',
  '--refresh-token'
] as const

/** The `-ArgumentList` argv callRunner builds on Windows (the same expression as commandRunner.ts). */
function powershellArgv(runnerPath: string, parts: string[]): string[] {
  const argsAsString = parts
    .map((part) => part.replaceAll('\\', '\\\\'))
    .map((part) => `"\`"${part}\`""`)
    .join(',')
  const argv = [
    '-NoProfile',
    'Start-Process',
    `"\`"${runnerPath}\`""`,
    '-Wait',
    '-NoNewWindow'
  ]
  if (argsAsString) argv.push('-ArgumentList', argsAsString)
  return argv
}

const slugOfFlag = (flag: string): string => flag.slice(2)
const synthValue = (flag: string): string => `synth-${slugOfFlag(flag)}-val`
const redact = (
  name: string,
  command: RedactInput['command'],
  runnerPath: string,
  extra: Partial<RedactInput> = {}
): RedactionVector => ({
  name,
  kind: 'redact',
  input: { command, runnerPath, ...extra }
})
const sanitize = (
  name: string,
  kind: 'sanitize-gog' | 'sanitize-nile',
  line: string
): RedactionVector => ({ name, kind, input: { line } })

const GOG_KEYS = ['access_token', 'session_id', 'refresh_token', 'user_id']
const NILE_KEYS = ['url', 'code_verifier', 'serial', 'client_id']

function redactionVectors(): RedactionVector[] {
  const LEG = '/opt/legendary'
  const synthetic = synthValue
  const tracer: RedactionVector[] = [
    redact(
      'redact-code-plain',
      ['launch', 'app-1', '--code', 'code-123'],
      LEG,
      { env: {} }
    ),
    sanitize(
      'sanitize-gog-all-keys',
      'sanitize-gog',
      '{"access_token":"at-synth","session_id":"sid-synth","refresh_token":"rt-synth","user_id":"uid-synth","expires_in":3600}'
    )
  ]
  const flags: RedactionVector[] = REDACTED_FLAGS.flatMap((flag) => {
    const parts = ['launch', 'app-1', flag, synthetic(flag), '--other', 'x']
    return [
      redact(`redact-plain-${slugOfFlag(flag)}`, parts, LEG),
      redact(
        `redact-ps-${slugOfFlag(flag)}`,
        powershellArgv(LEG, parts),
        'powershell'
      )
    ]
  })
  const allEight = REDACTED_FLAGS.flatMap((flag) => [flag, synthetic(flag)])
  const adjacency: RedactionVector[] = [
    redact(
      'redact-plain-adjacent-code-then-verifier',
      ['register', '--code', 'c-synth', '--code-verifier', 'v-synth'],
      LEG
    ),
    redact(
      'redact-plain-adjacent-verifier-then-code',
      ['register', '--code-verifier', 'v-synth', '--code', 'c-synth'],
      LEG
    ),
    redact(
      'redact-ps-adjacent-code-then-verifier',
      powershellArgv(LEG, [
        'register',
        '--code',
        'c-synth',
        '--code-verifier',
        'v-synth'
      ]),
      'powershell'
    ),
    redact('redact-plain-all-eight', ['register', ...allEight], LEG),
    redact(
      'redact-ps-all-eight',
      powershellArgv(LEG, ['register', ...allEight]),
      'powershell'
    )
  ]
  const trailing: RedactionVector[] = [
    redact(
      'redact-plain-trailing-flag-no-value',
      ['install', 'a', '--password'],
      LEG
    ),
    redact(
      'redact-ps-trailing-flag-no-value',
      powershellArgv(LEG, ['install', 'a', '--password']),
      'powershell'
    ),
    redact('redact-plain-flag-only', ['--token'], LEG)
  ]
  const repeated: RedactionVector[] = [
    redact(
      'redact-plain-repeated-flag',
      ['auth', '--code', 'first-synth', '--code', 'second-synth'],
      LEG
    ),
    redact(
      'redact-ps-repeated-flag',
      powershellArgv(LEG, [
        'auth',
        '--code',
        'first-synth',
        '--code',
        'second-synth'
      ]),
      'powershell'
    )
  ]
  // The env diff is taken against the pinned base env (PATH, LANG, USER and the fake HOME's eight).
  const env: RedactionVector[] = [
    redact('redact-env-equal-value-skipped', ['list'], LEG, {
      env: { PATH: PINNED_BASE.PATH, LANG: PINNED_BASE.LANG }
    }),
    redact('redact-env-differing-value-printed', ['list'], LEG, {
      env: { PATH: '/opt/bin:/usr/bin', LANG: PINNED_BASE.LANG }
    }),
    redact('redact-env-new-variable-printed', ['list'], LEG, {
      env: { LEGENDARY_CONFIG_PATH: '/cfg/legendary' }
    }),
    redact('redact-env-value-with-space-quoted', ['list'], LEG, {
      env: { WINEPREFIX: '/pfx/my prefix' }
    }),
    redact('redact-env-already-quoted-value-kept', ['list'], LEG, {
      env: { WINEPREFIX: '"/pfx/my prefix"' }
    }),
    redact('redact-env-undefined-value-printed-empty', ['list'], LEG, {
      env: { EXTRA: null }
    }),
    redact('redact-env-undefined-value-on-a-base-key', ['list'], LEG, {
      env: { PATH: null }
    }),
    redact('redact-env-empty-string-value', ['list'], LEG, {
      env: { EXTRA: '' }
    }),
    redact(
      'redact-env-with-credentials-in-argv',
      ['auth', '--code', 'c-synth'],
      LEG,
      {
        env: { LEGENDARY_CONFIG_PATH: '/cfg/legendary', LANG: PINNED_BASE.LANG }
      }
    ),
    redact('redact-env-order-kept', ['list'], LEG, {
      env: { ZED: 'z', ALPHA: 'a', MID: 'm' }
    })
  ]
  const quoting: RedactionVector[] = [
    redact(
      'redact-runner-path-with-space-quoted',
      ['list'],
      '/opt/my runner/legendary'
    ),
    redact(
      'redact-runner-path-already-quoted',
      ['list'],
      '"/opt/my runner/legendary"'
    ),
    redact('redact-part-with-space-quoted', ['launch', 'my game'], LEG),
    redact('redact-part-already-quoted-kept', ['launch', '"my game"'], LEG),
    redact('redact-part-half-quoted-gets-quoted', ['launch', '"my game'], LEG),
    redact('redact-empty-part-leaves-a-double-space', ['launch', '', 'a'], LEG),
    redact(
      'redact-credential-value-with-space-is-not-quoted',
      ['install', 'a', '--password', 'pw with space'],
      LEG
    )
  ]
  const legendaryObject: RedactionVector[] = [
    redact('redact-object-command-converted', { foo: 1 }, 'legendary', {
      converts: ['auth', '--token', 'legendary-secret']
    }),
    redact(
      'redact-object-command-converts-to-nothing',
      { foo: 1 },
      'legendary',
      {
        converts: []
      }
    ),
    redact('redact-object-command-converted-with-env', { foo: 1 }, LEG, {
      converts: ['launch', 'app-1', '--code', 'c-synth'],
      env: { LEGENDARY_CONFIG_PATH: '/cfg/legendary' }
    })
  ]
  const unchanged: RedactionVector[] = [
    redact(
      'redact-no-sensitive-flag-unchanged',
      ['launch', 'app-1', '--offline'],
      LEG
    ),
    redact('redact-empty-argv', [], LEG),
    redact(
      'redact-ps-no-argument-list-unchanged',
      ['-NoProfile', 'Start-Process'],
      'powershell'
    ),
    redact(
      'redact-ps-argument-list-last-element',
      ['-NoProfile', '-ArgumentList'],
      'powershell'
    ),
    redact(
      'redact-ps-flag-outside-argument-list-unchanged',
      ['-NoProfile', '--code', 'c-synth', '-ArgumentList', '"`"a`""'],
      'powershell'
    ),
    redact(
      'redact-ps-backslash-in-value',
      powershellArgv(LEG, ['install', 'a', '--password', 'pw\\back\\slash']),
      'powershell'
    ),
    redact(
      'redact-ps-runner-path-with-space',
      powershellArgv('C:\\Program Files\\legendary.exe', [
        'auth',
        '--token',
        't-synth'
      ]),
      'powershell'
    )
  ]
  const lines = {
    gogFull: JSON.stringify({
      access_token: 'at-synth',
      session_id: 'sid-synth',
      refresh_token: 'rt-synth',
      user_id: 'uid-synth',
      expires_in: 3600
    }),
    nileFull: JSON.stringify({
      url: 'https://example.invalid/x?code=u-synth',
      code_verifier: 'cv-synth',
      serial: 'ser-synth',
      client_id: 'cid-synth',
      note: 'kept'
    })
  }
  const sanitizers = (
    kind: 'sanitize-gog' | 'sanitize-nile',
    prefix: string,
    keys: string[]
  ): RedactionVector[] => {
    const [first = 'k0', second = 'k1', third = 'k2'] = keys
    return [
      sanitize(
        `${prefix}-all-keys-trailing-newline-input`,
        kind,
        `${JSON.stringify(Object.fromEntries(keys.map((k) => [k, `${k}-synth`])))}\n`
      ),
      sanitize(
        `${prefix}-some-keys-absent`,
        kind,
        JSON.stringify({ [first]: 'a-synth', other: 'kept' })
      ),
      sanitize(
        `${prefix}-no-token-keys`,
        kind,
        JSON.stringify({ other: 'kept', count: 2 })
      ),
      sanitize(`${prefix}-empty-object`, kind, '{}'),
      sanitize(
        `${prefix}-nested-objects`,
        kind,
        JSON.stringify({
          outer: {
            [first]: 'nested-synth',
            deep: { [second]: 'deeper-synth' }
          },
          [third]: 't-synth'
        })
      ),
      sanitize(
        `${prefix}-key-order-other-than-replaced`,
        kind,
        JSON.stringify({
          zebra: 1,
          [third]: 't-synth',
          apple: 2,
          [first]: 'a-synth',
          mid: 3
        })
      ),
      sanitize(
        `${prefix}-numbers-keep-json-formatting`,
        kind,
        '{"big":12345678901234567890,"float":1.0,"exp":1e3,"neg":-0,"small":0.000001,"n":3}'
      ),
      sanitize(
        `${prefix}-unicode-escapes-decoded`,
        kind,
        `{"${first}":"\\u0061bc","name":"caf\\u00e9 \\ud83d\\ude00","slash":"a\\/b"}`
      ),
      sanitize(
        `${prefix}-duplicate-key-last-wins`,
        kind,
        `{"${first}":"a-synth","${first}":"b-synth","x":1}`
      ),
      sanitize(`${prefix}-array-keeps-array`, kind, '[1,2,{"a":3}]'),
      sanitize(`${prefix}-non-json-line`, kind, 'Traceback: not json at all'),
      sanitize(`${prefix}-empty-line`, kind, ''),
      sanitize(`${prefix}-whitespace-only-line`, kind, '   '),
      sanitize(
        `${prefix}-two-objects-in-one-chunk`,
        kind,
        `${JSON.stringify({ [first]: 'a-synth' })}\n${JSON.stringify({ [second]: 'b-synth' })}\n`
      ),
      sanitize(`${prefix}-truncated-json`, kind, `{"${first}":"a-synt`),
      sanitize(
        `${prefix}-pretty-printed-input`,
        kind,
        `{\n  "${first}": "a-synth",\n  "x": [1, 2]\n}\n`
      )
    ]
  }
  return [
    ...tracer,
    ...flags,
    ...adjacency,
    ...trailing,
    ...repeated,
    ...env,
    ...quoting,
    ...legendaryObject,
    ...unchanged,
    sanitize('sanitize-nile-full-line', 'sanitize-nile', lines.nileFull),
    ...sanitizers('sanitize-gog', 'sanitize-gog', GOG_KEYS),
    ...sanitizers('sanitize-nile', 'sanitize-nile', NILE_KEYS)
  ]
}

function assertRedactionFloor(count: number): void {
  if (count < REDACTION_FLOOR) {
    throw new Error(
      `redaction vectors: ${count} is below the floor of ${REDACTION_FLOOR}`
    )
  }
}

/** Runs one vector through the real TS function, on the pinned base env of a fresh fake HOME. */
async function recordVector(vector: RedactionVector): Promise<string> {
  return withEngineOracleProfile((profile) =>
    withPinnedBaseEnv(profile.fake, () => {
      if (vector.kind === 'sanitize-gog') {
        return gogAuthLogSanitizer((vector.input as SanitizeInput).line)
      }
      if (vector.kind === 'sanitize-nile') {
        return nileAuthLogSanitizer((vector.input as SanitizeInput).line)
      }
      const input = vector.input as RedactInput
      const env = input.env
        ? Object.fromEntries(
            Object.entries(input.env).map(([key, value]) => [
              key,
              value ?? undefined
            ])
          )
        : undefined
      return getRunnerCallWithoutCredentials(
        input.command as never,
        env as never,
        input.runnerPath,
        () => [...(input.converts ?? [])]
      )
    })
  )
}

describeSkipOnWindows('redaction and sanitizer vectors (88.2-03)', () => {
  const built = redactionVectors()
  const file = join(goldenDir(CRATE, REDACTION_SLICE), 'vectors.json')
  const recorded = new Map<string, string>()

  const committed = (): RecordedVector[] =>
    JSON.parse(readFileSync(file, 'utf8')) as RecordedVector[]

  afterAll(() => {
    if (mode !== 'write') return
    const vectors: RecordedVector[] = built.map((vector) => {
      const output = recorded.get(vector.name)
      if (output === undefined) throw new Error(`${vector.name}: not recorded`)
      return { ...vector, output }
    })
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, json(vectors))
    syncManifest(
      CRATE,
      REDACTION_SLICE,
      vectors.map((v) => ({ id: v.name })),
      REDACTION_FLOOR
    )
  })

  it.each(built.map((vector) => [vector.name, vector] as const))(
    '%s',
    async (_name, vector) => {
      const output = await recordVector(vector)
      if (mode === 'write') {
        recorded.set(vector.name, output)
        return
      }
      const stored = committed().find((v) => v.name === vector.name)
      if (!stored)
        throw new Error(`${vector.name} is missing from vectors.json`)
      expect(stored).toEqual({ ...vector, output })
    }
  )

  it('vectors.json lists exactly the vectors the builder produces, in order', () => {
    if (mode !== 'compare') return
    expect(
      committed().map(({ name, kind, input }) => ({ name, kind, input }))
    ).toEqual(built)
  })

  it('the committed MANIFEST agrees with the vector list and holds at least the floor', () => {
    if (mode !== 'compare') return
    const manifest = JSON.parse(
      readFileSync(
        join(goldenDir(CRATE, REDACTION_SLICE), 'MANIFEST.json'),
        'utf8'
      )
    ) as { count: number; floor: number }
    expect(new Set(built.map((v) => v.name)).size).toBe(built.length)
    expect(manifest.floor).toBeGreaterThanOrEqual(REDACTION_FLOOR)
    expect(manifest.count).toBe(built.length)
    expect(manifest.count).toBeGreaterThanOrEqual(manifest.floor)
  })

  it('the vector list is at or above the floor, and an empty list is not', () => {
    expect(() => assertRedactionFloor(built.length)).not.toThrow()
    expect(() => assertRedactionFloor(0)).toThrow(/below the floor/)
  })

  it('the tracer vector redacts its credential', () => {
    if (mode !== 'compare') return
    const tracer = committed().find((v) => v.name === 'redact-code-plain')
    expect(tracer?.output).toBe('/opt/legendary launch app-1 --code <redacted>')
    expect(tracer?.output).not.toContain('code-123')
  })

  it('each of the eight flags has a plain and a PowerShell vector whose recorded output carries <redacted>', () => {
    if (mode !== 'compare') return
    const vectors = committed()
    for (const flag of REDACTED_FLAGS) {
      for (const shape of ['plain', 'ps']) {
        const vector = vectors.find(
          (v) => v.name === `redact-${shape}-${slugOfFlag(flag)}`
        )
        expect(vector?.output).toContain(`${flag}`)
        expect(vector?.output).toContain('<redacted>')
        expect(vector?.output).not.toContain(synthValue(flag))
      }
    }
  })

  it('the non-JSON sanitizer vectors record the line returned unchanged', () => {
    if (mode !== 'compare') return
    for (const vector of committed()) {
      if (
        !/-(non-json-line|empty-line|whitespace-only-line|truncated-json|two-objects-in-one-chunk)$/.test(
          vector.name
        )
      )
        continue
      expect(vector.output).toBe((vector.input as SanitizeInput).line)
    }
  })

  it('no vector holds an operator path or a real home', () => {
    if (mode !== 'compare') return
    const text = readFileSync(file, 'utf8')
    expect(text).not.toMatch(
      /\/Users\/|\/home\/[a-z]|AppData|gamelib-engine-oracle/
    )
  })
})
