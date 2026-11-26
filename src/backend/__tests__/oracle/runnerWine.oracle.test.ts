/**
 * The wine launch, winepath and launch script oracle (88.2-04, D-11, D-12, D-14, D-15, D-25):
 * `runWineCommand`, `getWinePath` and `runScriptForGame` driven through the real
 * `createCommandRunner` over the recording runner trace on a fresh fake HOME, and recorded as the
 * goldens the Rust `gamelib-launch` runner (88.2-12, 88.2-13) has to reproduce. The goldens exist
 * before any Rust for them does. This is also the oracle for the launch variant that closes 87's three
 * `wine_command` deltas: the chunked output and log writers, the caller's `commandParts` after the call,
 * and the track key with `resolveOn`.
 *
 * Slices under `gamelib-launch/tests/fixtures/golden/`:
 *   wine_launch/  `runWineCommand`: the `Wine Command:` header and every chunk written to the caller's log
 *                 writers at the forwarder boundary (target, rotate, entry), the `onOutput` sequence, the
 *                 track `{ runner: 'wine', key }` and its precedence, `resolveOn` close versus exit, the
 *                 caller's `commandParts` and `wrappers` after the call, and the `wineserver --wait` spawn
 *   wine_path/    `getWinePath`: the `cmd /c winepath -u|-w <path>` run (runinprefix verb, ignoreLogging),
 *                 the trimmed answer and the empty-answer error line
 *   script/       `runScriptForGame`: program, empty argv, cwd the install path, the HEROIC_GAME_* env block
 *                 with the settings and game-info JSON strings, the inherited env merged last, resolveOn exit,
 *                 no timeout, the verbose-on chunk writes, verbose-off silence, and the throw
 * Each slice holds `cases.json` (built from the tables below), `deltas.json`, `MANIFEST.json` and
 * `expected/<case>/{result,events,spawns,tree,requests,logFrames,stream}.json`. The `class` of every
 * recorded spawn is the one hand-authored, non-oracle field: it comes from `golden/classes.json` by call
 * site (`runner.wine_command`, `runner.wine_command.launch`, `runner.wine_command.wineserver_wait`,
 * `runner.wine_path`, `runner.script`), never from the TS.
 *
 * Isolation (D-12, D-13, D-22): every case runs on a fresh fake HOME inside `withPinnedBaseEnv` (eleven
 * `process.env` keys and no others) with an injected platform; no wine binary is executed and no child
 * is spawned. The game settings and game info are synthetic case inputs. The logger is spied on, never
 * mocked. The goldens are recorded on a POSIX host. Behaviour that looks wrong is kept as recorded and
 * filed as a todo (D-20); a fix is never mixed into a golden diff.
 *
 * The census (D-15) at the end moves the commandRunner.test.ts check here: every title of that file is a
 * case in golden/runner, wine_launch, wine_path or script, or a `Layer-2: real children` title that
 * names the Rust real-spawn test replacing it.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  mockPlatform,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile,
  type OraclePlatform,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
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
  setupEnvVars,
  setupWineEnvVars
} from 'backend/wine/__tests__/oracle/envBuildersFixture'
import { createCommandRunner } from 'backend/commandRunner'
import type { CommandRunnerDeps } from 'backend/commandRunner'
import { getUmuPath, isUmuSupported } from 'backend/utils/compatibility_layers'
import LogWriter from 'backend/logger/targetWriter'
import type {
  CallRunnerOptions,
  GameInfo,
  GameSettings,
  WineCommandArgs
} from 'common/types'

const CRATE = 'gamelib-launch'
const WINE_SLICE = 'wine_launch'
const PATH_SLICE = 'wine_path'
const SCRIPT_SLICE = 'script'
const RUNNER_SLICE = 'runner'
/** The stem of a case that stands for one `it` title of commandRunner.test.ts. */
const CENSUS_STEM = 'commandRunner'
/** The case counts this plan committed; a later edit may raise them, never lower them. */
const WINE_LAUNCH_FLOOR = 41
const WINE_PATH_FLOOR = 16
const SCRIPT_FLOOR = 18
const REAL_SPAWN_TEST = 'gamelib-launch/tests/runner_real.rs'

const mode = engineWineOracleMode()

const out = (text: string): ScriptChunk => ({ stream: 'stdout', text })
const err = (text: string): ScriptChunk => ({ stream: 'stderr', text })
const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve))
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

// ---------------------------------------------------------------------------------------------
// The wine installations a case runs against
// ---------------------------------------------------------------------------------------------

type HostPlatform = 'linux' | 'darwin'
type WineKind = 'wine' | 'proton-umu' | 'proton' | 'crossover' | 'toolkit'

const OS: Record<HostPlatform, OraclePlatform> = {
  linux: 'linux',
  darwin: 'mac'
}

interface WineSetup {
  kind: WineKind
  /** A `wineserver` binary exists (a `wine` install always has one). */
  wineserver?: boolean
  /** The wine binary is not on disk, so `validWine` answers false. */
  missingBin?: boolean
}

const hostOf = (kind: WineKind): HostPlatform =>
  kind === 'crossover' || kind === 'toolkit' ? 'darwin' : 'linux'

const WINE_DIR: Record<WineKind, string> = {
  wine: '<TOOLS>/wine/Wine-9',
  'proton-umu': '<TOOLS>/proton/GE-Proton9-1',
  proton: '<TOOLS>/proton/GE-Proton9-1',
  crossover: '<TOOLS>/crossover',
  toolkit: '<TOOLS>/toolkit'
}

const BIN: Record<WineKind, string> = {
  wine: `${WINE_DIR.wine}/bin/wine`,
  'proton-umu': `${WINE_DIR['proton-umu']}/proton`,
  proton: `${WINE_DIR.proton}/proton`,
  crossover: `${WINE_DIR.crossover}/bin/wine`,
  toolkit: `${WINE_DIR.toolkit}/bin/wine64`
}

const WINESERVER: Record<WineKind, string> = {
  wine: `${WINE_DIR.wine}/bin/wineserver`,
  'proton-umu': `${WINE_DIR['proton-umu']}/files/bin/wineserver`,
  proton: `${WINE_DIR.proton}/files/bin/wineserver`,
  crossover: `${WINE_DIR.crossover}/bin/wineserver`,
  toolkit: `${WINE_DIR.toolkit}/bin/wineserver`
}

const NAME: Record<WineKind, string> = {
  wine: 'Wine-9',
  'proton-umu': 'GE-Proton9-1',
  proton: 'GE-Proton9-1',
  crossover: 'CrossOver-24',
  toolkit: 'GPTK-2'
}

const PREFIX = '<HOME>/Games/prefix'

const hasWineserver = (setup: WineSetup): boolean =>
  setup.kind === 'wine' || setup.wineserver === true

/** The `GameSettings` fields the env builders and the runner read, with placeholders unexpanded. */
function settingsOf(setup: WineSetup): Record<string, unknown> {
  const wineVersion: Record<string, unknown> = {
    type: setup.kind.startsWith('proton') ? 'proton' : setup.kind,
    name: NAME[setup.kind],
    bin: BIN[setup.kind]
  }
  if (hasWineserver(setup)) wineVersion.wineserver = WINESERVER[setup.kind]
  if (setup.kind === 'wine') {
    wineVersion.lib = `${WINE_DIR.wine}/lib64`
    wineVersion.lib32 = `${WINE_DIR.wine}/lib`
  }
  return {
    nvidiaPrime: false,
    showFps: false,
    enviromentOptions: [{ key: 'MY_VAR', value: '"quoted value"' }],
    winePrefix: PREFIX,
    wineCrossoverBottle: setup.kind === 'crossover' ? 'bottle-1' : '',
    enableDXVKFpsLimit: false,
    DXVKFpsCap: '60',
    enableFSR: false,
    enableEsync: false,
    enableMsync: false,
    enableFsync: false,
    enableWineWayland: false,
    enableHDR: false,
    enableWoW64: false,
    autoInstallDxvkNvapi: false,
    eacRuntime: false,
    battlEyeRuntime: false,
    verboseLogs: false,
    preferSystemLibs: false,
    advertiseAvxForRosetta: false,
    disableUMU: setup.kind !== 'proton-umu',
    wineVersion
  }
}

/** The files a case starts from: the installation, and the prefix `runWineCommand` checks for. */
function seedOf(setup: WineSetup): SeedEntry[] {
  const seed: SeedEntry[] = []
  if (!setup.missingBin) {
    seed.push({ path: BIN[setup.kind], text: '' })
    if (hasWineserver(setup))
      seed.push({ path: WINESERVER[setup.kind], text: '' })
  } else if (hasWineserver(setup)) {
    seed.push({ path: WINESERVER[setup.kind], text: '' })
  }
  if (setup.kind === 'crossover') return seed
  const regs = (base: string): SeedEntry[] => [
    { path: `${base}/dosdevices`, dir: true },
    { path: `${base}/drive_c`, dir: true },
    { path: `${base}/system.reg`, text: '' },
    { path: `${base}/user.reg`, text: '' },
    { path: `${base}/userdef.reg`, text: '' }
  ]
  if (setup.kind.startsWith('proton')) {
    seed.push(
      { path: `${PREFIX}/pfx.lock`, text: '' },
      { path: `${PREFIX}/tracked_files`, text: '' },
      { path: `${PREFIX}/version`, text: '' },
      { path: `${PREFIX}/config_info`, text: '' },
      ...regs(`${PREFIX}/pfx`)
    )
  } else {
    seed.push(...regs(PREFIX))
  }
  return seed
}

/** Replaces every placeholder in every string of a JSON-shaped value. */
function expandDeep<T>(value: T, profile: EngineOracleProfile): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return expandPlaceholders(node, profile)
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v)
        ])
      )
    }
    return node
  }
  return walk(value) as T
}

/** The `wine` deps of the command runner: the real builders and the real file checks, nothing else. */
function wineDeps(
  profile: EngineOracleProfile,
  settings: GameSettings
): CommandRunnerDeps['wine'] {
  return {
    getDefaultSettings: () => settings,
    verifyWinePrefix: () => {
      throw new Error(
        'verifyWinePrefix is not reached: every case seeds its prefix'
      )
    },
    validWine: (wineVersion) => {
      const { bin, wineserver, type } = wineVersion
      const necessary = type === 'wine' ? [bin, wineserver] : [bin]
      return Promise.resolve(
        necessary.every((binary) => existsSync(binary as string))
      )
    },
    setupEnvVars: (s, installPath) =>
      Promise.resolve(setupEnvVars(s, installPath)),
    setupWineEnvVars: (s, gameId) =>
      Promise.resolve(setupWineEnvVars({ paths: profile.paths }, s, gameId)),
    isUmuSupported: (s) => isUmuSupported({ paths: profile.paths }, s),
    getUmuPath: () => getUmuPath({ paths: profile.paths })
  }
}

/** Puts the file `getUmuPath` falls back to on disk, so a proton-umu case is umu-supported. */
function seedUmu(profile: EngineOracleProfile): void {
  mkdirSync(dirname(profile.paths.defaultUmuPath), { recursive: true })
  writeFileSync(profile.paths.defaultUmuPath, '')
}

/** A script step names the wineserver as this token; the driver swaps in the case's path. */
const WINESERVER_TOKEN = '<WINESERVER>'

const expandSteps = (
  script: readonly RunnerStep[],
  setup: WineSetup,
  profile: EngineOracleProfile
): RunnerStep[] =>
  script.map((step) =>
    step.program === undefined
      ? step
      : {
          ...step,
          program: expandPlaceholders(
            step.program === WINESERVER_TOKEN
              ? WINESERVER[setup.kind]
              : step.program,
            profile
          )
        }
  )

// ---------------------------------------------------------------------------------------------
// The wine_launch cases
// ---------------------------------------------------------------------------------------------

type WriterMode = 'none' | 'claimed' | 'unclaimed' | 'two'

interface WineLaunchArgs {
  commandParts: string[]
  wait?: boolean
  protonVerb?: string
  installFolderName?: string
  gameInstallPath?: string
  startFolder?: string
  skipPrefixCheck?: boolean
  ignoreLogging?: boolean
  resolveOnExit?: boolean
  trackKey?: string
  wrappers?: string[]
  onSpawn?: true
}

interface WineLaunchCase {
  id: string
  note?: string
  /** The `golden/classes.json` key of the case's main spawn; the wineserver wait has its own. */
  callSite: string
  setup: WineSetup
  args: WineLaunchArgs
  writers: WriterMode
  onOutput: boolean
  /** Variables added to the pinned base env. */
  processEnv?: Record<string, string>
  /** One step per spawn, consumed in order. */
  script: RunnerStep[]
  axes?: Record<string, string | number | boolean>
}

type NamedWine = Omit<WineLaunchCase, 'id' | 'axes'>

const REG_QUERY = ['reg', 'query', 'HKCU']
const GAME_EXE = '<HOME>/Games/Game/game.exe'

const wl = (
  over: Partial<NamedWine> & { script: RunnerStep[] }
): NamedWine => ({
  callSite: 'runner.wine_command',
  setup: { kind: 'crossover' },
  args: { commandParts: [...REG_QUERY], skipPrefixCheck: true },
  writers: 'none',
  onOutput: false,
  ...over
})

const argsWith = (extra: Partial<WineLaunchArgs>): WineLaunchArgs => ({
  commandParts: [...REG_QUERY],
  skipPrefixCheck: true,
  ...extra
})

const SERVER: WineSetup = { kind: 'crossover', wineserver: true }

/** The tracer: one sideload wine launch, the way `storeManagerCommon/games.ts` makes the call. */
function tracerCases(): WineLaunchCase[] {
  return [
    {
      id: 'wine-launch-sideload',
      note: 'the end-to-end tracer: a sideload wine launch with a claimed game log, three chunks, the track key and the wineserver wait',
      callSite: 'runner.wine_command.launch',
      setup: { kind: 'wine' },
      args: {
        commandParts: [GAME_EXE, '-flag'],
        wait: true,
        protonVerb: 'waitforexitandrun',
        startFolder: '<HOME>/Games/Game',
        wrappers: [],
        trackKey: 'sideload-app'
      },
      writers: 'claimed',
      onOutput: true,
      script: [
        {
          chunks: [
            out('game starting\n'),
            err('warn: fsync\n'),
            out('ready\n')
          ],
          code: 0
        },
        { program: WINESERVER_TOKEN, code: 0 }
      ]
    }
  ]
}

/** One case per `it` title under the three wine describes of commandRunner.test.ts, keyed by the `it`. */
const NAMED_WINE: Record<string, NamedWine> = {
  // -- runWineCommand resolveOnExit
  'Layer-2: settles on exit while a grandchild still holds the pipes (resolveOn exit, drain flag)':
    wl({
      setup: SERVER,
      args: argsWith({ wait: true, resolveOnExit: true }),
      script: [
        {
          chunks: [out('HKEY_CURRENT_USER\n')],
          code: 0,
          drainTimedOut: true
        },
        { program: WINESERVER_TOKEN, code: 0 }
      ]
    }),
  'Layer-2: settles exactly once and keeps the exit code when the run reports a late close':
    wl({
      args: argsWith({ resolveOnExit: true }),
      script: [{ code: 0 }]
    }),
  'Layer-2: an early close settles without any drain flag': wl({
    args: argsWith({ resolveOnExit: true }),
    script: [{ code: 0 }]
  }),
  'Layer-2: default: resolveOn is close, never exit': wl({
    script: [{ code: 0 }]
  }),
  'Layer-2: resolveOnExit: false behaves as the default': wl({
    args: argsWith({ resolveOnExit: false }),
    script: [{ code: 0 }]
  }),
  'Layer-2: 59-REVIEW WR-01: output lost after the drain grace while the exit code survives':
    wl({
      args: argsWith({ resolveOnExit: true }),
      script: [{ code: 1, drainTimedOut: true }]
    }),

  // -- runWineCommand characterization (66.1 MH-4)
  'Layer-2: resolves { stdout, stderr, code } once the run closes': wl({
    script: [{ chunks: [out('out-1 '), out('out-2'), err('err-1')], code: 3 }]
  }),
  'Layer-2: keeps the last 50 chunks of each stream (memory log semantics, A5)':
    wl({
      script: [
        {
          chunks: Array.from({ length: 60 }, (_unused, index) =>
            out(`${index},`)
          ),
          code: 0
        }
      ]
    }),
  'Layer-2: calls onSpawn exactly once with the spawned child handle': wl({
    args: argsWith({ onSpawn: true }),
    script: [{ code: 0 }]
  }),
  'Layer-2: calls onOutput for both streams with the chunk and the child': wl({
    onOutput: true,
    script: [{ chunks: [out('to-stdout'), err('to-stderr')], code: 0 }]
  }),
  'Layer-2: writes a "Wine Command:" header to each log writer before any output':
    wl({
      writers: 'two',
      script: [{ chunks: [out('after-header')], code: 0 }]
    }),
  'Layer-2: wait: true runs `wineserver --wait` after close and resolves only after it, with a finite 30-minute timeout':
    wl({
      setup: SERVER,
      args: argsWith({ wait: true }),
      script: [{ code: 0 }, { program: WINESERVER_TOKEN, hold: true, code: 0 }]
    }),
  'Layer-2: a wineserver --wait that times out logs a warning naming the prefix and still resolves the first result':
    wl({
      setup: SERVER,
      args: argsWith({ wait: true }),
      script: [
        { code: 7 },
        { program: WINESERVER_TOKEN, code: null, timedOut: true }
      ]
    }),
  'Layer-2: a wineserver --wait spawn failure does not hang the caller': wl({
    setup: SERVER,
    args: argsWith({ wait: true }),
    script: [{ code: 0 }, { program: WINESERVER_TOKEN, throws: 'ENOENT' }]
  }),
  'Layer-2: returns { stdout: "", stderr: "Invalid wine" } and runs nothing for an invalid wine':
    wl({
      setup: { kind: 'crossover', missingBin: true },
      script: []
    }),
  'Layer-2: passes the documented run options: timeout opt-out with a reason, windowsHide false, merged env':
    wl({
      args: argsWith({
        protonVerb: 'runinprefix',
        startFolder: '<HOME>/start'
      }),
      script: [{ code: 0 }]
    }),
  'Layer-2: ignoreLogging strips PROTON_LOG from the env': wl({
    args: argsWith({ ignoreLogging: true }),
    processEnv: { PROTON_LOG: '1' },
    script: [{ code: 0 }]
  }),
  'Layer-2: wrappers become the binary with the runner bin after them': wl({
    args: argsWith({ wrappers: ['gamemoderun', '--flag'] }),
    script: [{ code: 0 }]
  }),

  // -- track key precedence
  'Layer-2: prefers options.trackKey': wl({
    args: argsWith({ trackKey: 'tk', installFolderName: 'folder' }),
    script: [{ code: 0 }]
  }),
  'Layer-2: falls back to installFolderName': wl({
    args: argsWith({ installFolderName: 'folder' }),
    script: [{ code: 0 }]
  }),
  'Layer-2: falls back to the winePrefix': wl({
    script: [{ code: 0 }]
  })
}

/** The `describe` titles of commandRunner.test.ts whose `it`s are recorded in `wine_launch`. */
const WINE_DESCRIBES = [
  'Layer-2: runWineCommand resolveOnExit',
  'Layer-2: runWineCommand characterization (66.1 MH-4)'
]

const lastOf = (title: string): string => title.split(' > ').at(-1) ?? title
const describeOf = (title: string): string => title.split(' > ')[0] ?? ''

const COMMAND_RUNNER_TEST = join(__dirname, '..', 'commandRunner.test.ts')
const commandRunnerTitles = (): string[] => tsTestTitles(COMMAND_RUNNER_TEST)

function namedWineCases(): WineLaunchCase[] {
  const titles = commandRunnerTitles().filter((title) =>
    WINE_DESCRIBES.includes(describeOf(title))
  )
  const cases: WineLaunchCase[] = []
  for (const title of titles) {
    const named = NAMED_WINE[lastOf(title)]
    if (!named) throw new Error(`no named wine launch case for: ${title}`)
    cases.push({ id: `${CENSUS_STEM}--${slug(title)}`, ...named })
  }
  const known = new Set(titles.map(lastOf))
  const stale = Object.keys(NAMED_WINE).filter((key) => !known.has(key))
  if (stale.length > 0) {
    throw new Error(
      `NAMED_WINE holds a title commandRunner.test.ts does not: ${stale.join(' | ')}`
    )
  }
  return cases
}

// ---- the pairwise rows (D-14) ------------------------------------------------------------------

const AXES = {
  wineType: ['wine', 'proton-umu', 'proton', 'crossover', 'toolkit'],
  wrappers: ['none', 'two'],
  trackKey: ['set', 'installFolder', 'neither'],
  resolveOnExit: ['true', 'false'],
  wait: ['no', 'with-wineserver', 'without-wineserver'],
  ignoreLogging: ['true', 'false'],
  logWriters: ['none', 'claimed', 'unclaimed'],
  onOutput: ['set', 'unset'],
  outcome: ['exit-0', 'exit-1', 'throw']
} as const satisfies Axes

/** A `wine` install always has a wineserver, so "waits without one" cannot happen for it. */
const feasible = (row: Row): boolean =>
  !(row.wineType === 'wine' && row.wait === 'without-wineserver')

const PAIRWISE_CHUNKS = [out('out-1\n'), err('err-1\n')]

function pairwiseCases(): WineLaunchCase[] {
  return allPairs(AXES, feasible).map((row, index) => {
    const kind = String(row.wineType) as WineKind
    const waits = row.wait !== 'no'
    const setup: WineSetup = {
      kind,
      ...(row.wait === 'with-wineserver' && { wineserver: true })
    }
    const outcome = String(row.outcome)
    const main: RunnerStep =
      outcome === 'throw'
        ? { throws: 'ENOENT' }
        : {
            chunks: PAIRWISE_CHUNKS,
            code: outcome === 'exit-1' ? 1 : 0
          }
    const script: RunnerStep[] = [main]
    if (waits && hasWineserver(setup)) {
      script.push({ program: WINESERVER_TOKEN, code: 0 })
    }
    const args: WineLaunchArgs = {
      commandParts: [GAME_EXE, '-flag'],
      ...(waits && { wait: true, protonVerb: 'waitforexitandrun' }),
      startFolder: '<HOME>/Games/Game',
      ...(row.trackKey === 'installFolder' && {
        installFolderName: 'Game One',
        gameInstallPath: '<HOME>/Games/Game'
      }),
      ...(row.trackKey === 'set' && { trackKey: 'sideload-app' }),
      ...(row.wrappers === 'two' && { wrappers: ['gamemoderun', 'mangohud'] }),
      ...(row.resolveOnExit === 'true' && { resolveOnExit: true }),
      ...(row.ignoreLogging === 'true' && { ignoreLogging: true })
    }
    return {
      id: `wine-launch-pairwise-${String(index + 1).padStart(3, '0')}`,
      callSite: waits ? 'runner.wine_command.launch' : 'runner.wine_command',
      setup,
      args,
      writers: String(row.logWriters) as WriterMode,
      onOutput: row.onOutput === 'set',
      processEnv: { PROTON_LOG: '1' },
      script,
      axes: row
    }
  })
}

const wineLaunchCases = (): WineLaunchCase[] => [
  ...tracerCases(),
  ...namedWineCases(),
  ...pairwiseCases()
]

// ---------------------------------------------------------------------------------------------
// The wine_path cases
// ---------------------------------------------------------------------------------------------

interface WinePathCase {
  id: string
  note?: string
  callSite: string
  setup: WineSetup
  path: string
  variant: 'win' | 'unix'
  processEnv?: Record<string, string>
  script: RunnerStep[]
}

type NamedPath = Omit<WinePathCase, 'id'>

const winePath = (
  over: Partial<NamedPath> & { script: RunnerStep[] }
): NamedPath => ({
  callSite: 'runner.wine_path',
  setup: { kind: 'crossover' },
  path: 'C:\\x',
  variant: 'unix',
  ...over
})

const NAMED_PATH: Record<string, NamedPath> = {
  'Layer-2: asks winepath through runWineCommand and returns the trimmed stdout':
    winePath({ script: [{ chunks: [out('/unix/path\n')], code: 0 }] }),
  'Layer-2: logs an error and returns "" when winepath prints nothing':
    winePath({ variant: 'win', script: [{ code: 1 }] })
}

const PATH_DESCRIBES = ['Layer-2: getWinePath']

function winePathCases(): WinePathCase[] {
  const titles = commandRunnerTitles().filter((title) =>
    PATH_DESCRIBES.includes(describeOf(title))
  )
  const cases: WinePathCase[] = []
  for (const title of titles) {
    const named = NAMED_PATH[lastOf(title)]
    if (!named) throw new Error(`no named wine path case for: ${title}`)
    cases.push({ id: `${CENSUS_STEM}--${slug(title)}`, ...named })
  }
  const known = new Set(titles.map(lastOf))
  const stale = Object.keys(NAMED_PATH).filter((key) => !known.has(key))
  if (stale.length > 0) {
    throw new Error(
      `NAMED_PATH holds a title commandRunner.test.ts does not: ${stale.join(' | ')}`
    )
  }
  const kinds: WineKind[] = [
    'wine',
    'proton-umu',
    'proton',
    'crossover',
    'toolkit'
  ]
  for (const kind of kinds) {
    for (const variant of ['unix', 'win'] as const) {
      cases.push({
        id: `wine-path-${kind}-${variant}`,
        callSite: 'runner.wine_path',
        setup: { kind },
        path:
          variant === 'unix'
            ? 'C:\\Games\\Game One\\save'
            : '/pfx/drive_c/Game One/save',
        variant,
        processEnv: { PROTON_LOG: '1' },
        script: [
          {
            chunks: [
              out(
                variant === 'unix'
                  ? '/pfx/drive_c/Game One/save\n'
                  : 'C:\\Games\\Game One\\save\n'
              )
            ],
            code: 0
          }
        ]
      })
    }
  }
  cases.push(
    {
      id: 'wine-path-stdout-with-surrounding-whitespace',
      note: 'the answer is trimmed on both ends and nothing else is touched',
      callSite: 'runner.wine_path',
      setup: { kind: 'wine' },
      path: 'C:\\a b\\c',
      variant: 'unix',
      script: [{ chunks: [out('\n  /pfx/drive_c/a b/c \t\n')], code: 0 }]
    },
    {
      id: 'wine-path-empty-stdout-with-stderr-logs-the-error',
      note: 'an empty answer logs the error line with the stderr text and returns the empty string',
      callSite: 'runner.wine_path',
      setup: { kind: 'wine' },
      path: 'C:\\missing',
      variant: 'unix',
      script: [{ chunks: [err('wine: cannot find C:\\missing\n')], code: 1 }]
    },
    {
      id: 'wine-path-spawn-failure-answers-empty',
      note: 'the run fails to spawn: runWineCommand answers empty output and getWinePath logs the error line',
      callSite: 'runner.wine_path',
      setup: { kind: 'wine' },
      path: 'C:\\x',
      variant: 'win',
      script: [{ throws: 'ENOENT' }]
    },
    {
      id: 'wine-path-invalid-wine-answers-empty-with-its-stderr',
      note: 'an invalid wine runs nothing; the stderr text of the error line is Invalid wine',
      callSite: 'runner.wine_path',
      setup: { kind: 'wine', missingBin: true },
      path: 'C:\\x',
      variant: 'unix',
      script: []
    }
  )
  return cases
}

// ---------------------------------------------------------------------------------------------
// The script cases
// ---------------------------------------------------------------------------------------------

type ScriptOutcome = 'exit-0' | 'exit-2' | 'throw' | 'exit-0-drain'

interface ScriptCall {
  stage: 'before' | 'after'
  verbose: boolean
  outcome: ScriptOutcome
  /** The script prints a line on each stream. */
  chunks: boolean
}

interface ScriptCase {
  id: string
  note?: string
  callSite: string
  processEnv?: Record<string, string>
  calls: ScriptCall[]
}

/** Nested objects and non-ASCII strings: the two JSON strings the script reads must survive both. */
const GAME_INFO = {
  app_name: 'script-app',
  title: 'Café Ünïcode — ゲーム "quoted"',
  runner: 'gog',
  install: {
    executable: 'bin/game.exe',
    install_path: '<HOME>/Games/script app',
    platform: 'windows',
    is_dlc: false
  },
  extra: { about: { description: '日本語 / ελληνικά', tags: ['a', 'b'] } }
}

const GAME_SETTINGS = {
  winePrefix: '<HOME>/Games/prefix',
  beforeLaunchScriptPath: '<HOME>/scripts/before.sh',
  afterLaunchScriptPath: '<HOME>/scripts/after.sh',
  enviromentOptions: [{ key: 'MY_VAR', value: 'ünï value' }],
  wineVersion: {
    type: 'wine',
    name: 'Wine-9',
    bin: '<TOOLS>/wine/Wine-9/bin/wine'
  },
  nested: { a: { b: [1, 2, { c: 'ü' }] } }
}

const call = (
  stage: ScriptCall['stage'],
  verbose: boolean,
  outcome: ScriptOutcome,
  chunks = true
): ScriptCall => ({ stage, verbose, outcome, chunks })

type NamedScript = Omit<ScriptCase, 'id'>

const NAMED_SCRIPT: Record<string, NamedScript> = {
  'Layer-2: resolves true on exit while a grandchild still holds the pipes': {
    callSite: 'runner.script',
    calls: [call('before', false, 'exit-0-drain', false)]
  },
  'Layer-2: rejects when the child cannot be spawned': {
    callSite: 'runner.script',
    calls: [call('before', false, 'throw', false)]
  },
  'Layer-2: writes output to the log writer only when verboseLogs is on': {
    callSite: 'runner.script',
    calls: [call('before', false, 'exit-0'), call('before', true, 'exit-0')]
  },
  'Layer-2: runs the stage script with cwd = install_path and HEROIC_* env merged under process.env':
    {
      callSite: 'runner.script',
      processEnv: { L2_SCRIPT_SENTINEL: 'inherited' },
      calls: [call('after', false, 'exit-0', false)]
    }
}

const SCRIPT_DESCRIBES = [
  'Layer-2: runScriptForGame characterization (66.1 MH-4)'
]

function scriptCases(): ScriptCase[] {
  const titles = commandRunnerTitles().filter((title) =>
    SCRIPT_DESCRIBES.includes(describeOf(title))
  )
  const cases: ScriptCase[] = []
  for (const title of titles) {
    const named = NAMED_SCRIPT[lastOf(title)]
    if (!named) throw new Error(`no named script case for: ${title}`)
    cases.push({ id: `${CENSUS_STEM}--${slug(title)}`, ...named })
  }
  const known = new Set(titles.map(lastOf))
  const stale = Object.keys(NAMED_SCRIPT).filter((key) => !known.has(key))
  if (stale.length > 0) {
    throw new Error(
      `NAMED_SCRIPT holds a title commandRunner.test.ts does not: ${stale.join(' | ')}`
    )
  }
  for (const stage of ['before', 'after'] as const) {
    for (const verbose of [true, false]) {
      for (const outcome of ['exit-0', 'exit-2', 'throw'] as const) {
        cases.push({
          id: `script-${stage}-${verbose ? 'verbose' : 'quiet'}-${outcome}`,
          callSite: 'runner.script',
          calls: [call(stage, verbose, outcome)]
        })
      }
    }
  }
  cases.push(
    {
      id: 'script-inherited-env-wins-over-the-heroic-keys',
      note: 'the process env is merged last, so an inherited HEROIC_GAME_TITLE replaces the one the launcher sets',
      callSite: 'runner.script',
      processEnv: { HEROIC_GAME_TITLE: 'from-process', EXTRA_FLAG: 'on' },
      calls: [call('before', false, 'exit-0', false)]
    },
    {
      id: 'script-before-then-after-in-one-session',
      note: 'a before run and an after run on the same runner: two spawns, two writers, two rotations',
      callSite: 'runner.script',
      calls: [call('before', true, 'exit-0'), call('after', true, 'exit-2')]
    }
  )
  return cases
}

// ---------------------------------------------------------------------------------------------
// Running one case
// ---------------------------------------------------------------------------------------------

/**
 * A logged `Error` is written with its JS stack, which names the machine and the test runner. The golden
 * keeps the first line only (see the `error-stack-trace` delta): the Rust side has no JS stack to match.
 */
function scrubStacks<T>(value: T): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return node.replace(/\n\s+at [^\n]*/g, '')
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v)
        ])
      )
    }
    return node
  }
  return walk(value) as T
}

interface Recorded {
  result: unknown
  events: unknown[]
  spawns: unknown[]
  logFrames: unknown[]
  stream: unknown
}

type Classes = ReturnType<typeof loadClasses>

const GAME_TARGET = (n: number) =>
  ({
    kind: 'game',
    appName: n === 0 ? 'sideload-app' : `sideload-app-${n}`,
    runner: 'sideload',
    type: 'launch'
  }) as const

/** Classifies each spawn: a `wineserver --wait` has its own call site, every other spawn the case's. */
const withCallSites = <T extends { program: string; argv: string[] }>(
  spawns: readonly T[],
  callSite: string,
  wineserver?: string
): (T & { callSite: string })[] =>
  spawns.map((spawn) => ({
    ...spawn,
    callSite:
      wineserver !== undefined &&
      spawn.program === wineserver &&
      spawn.argv.length === 1 &&
      spawn.argv[0] === '--wait'
        ? 'runner.wine_command.wineserver_wait'
        : callSite
  }))

async function recordWineLaunch(
  c: WineLaunchCase,
  classes: Classes
): Promise<Recorded> {
  const host = hostOf(c.setup.kind)
  const restorePlatform = mockPlatform(OS[host])
  try {
    return await withEngineOracleProfile(
      async (profile) => {
        if (c.setup.kind === 'proton-umu') seedUmu(profile)
        const settings = expandDeep(
          settingsOf(c.setup),
          profile
        ) as unknown as GameSettings
        const trace = createRunnerTrace(profile, {
          platform: host,
          script: expandSteps(c.script, c.setup, profile),
          wine: wineDeps(profile, settings)
        })
        try {
          const recorded = await withPinnedBaseEnv(profile.fake, async () => {
            Object.assign(process.env, c.processEnv)
            const runner = createCommandRunner(trace.deps)
            const args = expandDeep(c.args, profile)
            const stream = c.onOutput ? recordStream() : null
            const writers = ((): LogWriter[] => {
              const count =
                c.writers === 'two' ? 2 : c.writers === 'none' ? 0 : 1
              return Array.from(
                { length: count },
                (_unused, n) => new LogWriter(GAME_TARGET(n), false)
              )
            })()
            if (c.writers === 'claimed') {
              // The rotation was claimed by an earlier entry, so the header carries `rotate: false`.
              await writers[0]?.logInfo('earlier output')
            }
            const commandParts = [...args.commandParts]
            const commandPartsBefore = [...commandParts]
            const wrappers = args.wrappers ? [...args.wrappers] : undefined
            const wrappersBefore = wrappers ? [...wrappers] : null
            let onSpawnCalls = 0
            const options: CallRunnerOptions = {
              ...(wrappers && { wrappers }),
              ...(writers.length > 0 && { logWriters: writers }),
              ...(writers.length > 0 && { logMessagePrefix: 'Backend' }),
              ...(args.trackKey !== undefined && { trackKey: args.trackKey }),
              ...(stream && { onOutput: stream.onOutput })
            }
            const wineArgs: WineCommandArgs = {
              commandParts,
              ...(args.wait !== undefined && { wait: args.wait }),
              ...(args.protonVerb !== undefined && {
                protonVerb: args.protonVerb as WineCommandArgs['protonVerb']
              }),
              ...(args.installFolderName !== undefined && {
                installFolderName: args.installFolderName
              }),
              ...(args.gameInstallPath !== undefined && {
                gameInstallPath: args.gameInstallPath
              }),
              ...(args.startFolder !== undefined && {
                startFolder: args.startFolder
              }),
              ...(args.skipPrefixCheck && {
                skipPrefixCheckIKnowWhatImDoing: true
              }),
              ...(args.ignoreLogging && { ignoreLogging: true }),
              ...(args.resolveOnExit !== undefined && {
                resolveOnExit: args.resolveOnExit
              }),
              ...(args.onSpawn && {
                onSpawn: () => {
                  onSpawnCalls += 1
                }
              }),
              gameSettings: settings,
              options
            }
            let settled = false
            const promise = runner.runWineCommand(wineArgs).then((r) => {
              settled = true
              return r
            })
            // Enough turns for every unheld run to finish: only a held wineserver wait is still pending.
            for (let turn = 0; turn < 6; turn += 1) await flush()
            const settledBeforeRelease = settled
            trace.releaseAll()
            const response = await promise
            trace.expectScriptConsumed()
            return {
              response,
              commandPartsBefore,
              commandPartsAfter: commandParts,
              wrappersBefore,
              wrappersAfter: wrappers ?? null,
              settledBeforeRelease,
              onSpawnCalls,
              chunks: stream?.chunks ?? null
            }
          })
          const wineserver = expandPlaceholders(
            WINESERVER[c.setup.kind],
            profile
          )
          const spawns = attachSpawnClass(
            withCallSites(trace.records.spawns, c.callSite, wineserver),
            classes
          )
          const { chunks, ...result } = recorded
          return {
            result: normalisePaths(result, profile),
            events: normalisePaths(trace.records.logs, profile),
            spawns: normalisePaths(spawns, profile),
            logFrames: normalisePaths(
              scrubStacks(trace.records.logFrames),
              profile
            ),
            stream: normalisePaths(chunks, profile)
          }
        } finally {
          trace.restore()
        }
      },
      { seed: seedOf(c.setup) }
    )
  } finally {
    restorePlatform()
  }
}

async function recordWinePath(
  c: WinePathCase,
  classes: Classes
): Promise<Recorded> {
  const host = hostOf(c.setup.kind)
  const restorePlatform = mockPlatform(OS[host])
  try {
    return await withEngineOracleProfile(
      async (profile) => {
        if (c.setup.kind === 'proton-umu') seedUmu(profile)
        const settings = expandDeep(
          settingsOf(c.setup),
          profile
        ) as unknown as GameSettings
        const trace = createRunnerTrace(profile, {
          platform: host,
          script: expandSteps(c.script, c.setup, profile),
          wine: wineDeps(profile, settings)
        })
        try {
          const answer = await withPinnedBaseEnv(profile.fake, async () => {
            Object.assign(process.env, c.processEnv)
            const runner = createCommandRunner(trace.deps)
            const result = await runner.getWinePath({
              path: expandPlaceholders(c.path, profile),
              gameSettings: settings,
              variant: c.variant
            })
            trace.expectScriptConsumed()
            return result
          })
          const spawns = attachSpawnClass(
            withCallSites(trace.records.spawns, c.callSite),
            classes
          )
          return {
            result: normalisePaths({ answer }, profile),
            events: normalisePaths(trace.records.logs, profile),
            spawns: normalisePaths(spawns, profile),
            logFrames: normalisePaths(
              scrubStacks(trace.records.logFrames),
              profile
            ),
            stream: null
          }
        } finally {
          trace.restore()
        }
      },
      { seed: seedOf(c.setup) }
    )
  } finally {
    restorePlatform()
  }
}

const scriptStep = (c: ScriptCall): RunnerStep => {
  const chunks = c.chunks
    ? [out('script says hi: ünï\n'), err('script warns\n')]
    : []
  switch (c.outcome) {
    case 'throw':
      return { throws: 'ENOENT' }
    case 'exit-2':
      return { chunks, code: 2 }
    case 'exit-0-drain':
      return { chunks, code: 0, drainTimedOut: true }
    case 'exit-0':
      return { chunks, code: 0 }
  }
}

async function recordScript(
  c: ScriptCase,
  classes: Classes
): Promise<Recorded> {
  return withEngineOracleProfile(async (profile) => {
    const trace = createRunnerTrace(profile, {
      platform: 'linux',
      script: c.calls.map(scriptStep)
    })
    try {
      const results = await withPinnedBaseEnv(profile.fake, async () => {
        Object.assign(process.env, c.processEnv)
        const runner = createCommandRunner(trace.deps)
        const gameInfo = expandDeep(GAME_INFO, profile) as unknown as GameInfo
        const answers: unknown[] = []
        for (const spec of c.calls) {
          const settings = expandDeep(
            { ...GAME_SETTINGS, verboseLogs: spec.verbose },
            profile
          ) as unknown as GameSettings
          const writer = new LogWriter(
            {
              kind: 'game',
              appName: 'script-app',
              runner: 'gog',
              type: 'launch'
            },
            false
          )
          try {
            answers.push({
              value: await runner.runScriptForGame(
                gameInfo,
                settings,
                spec.stage,
                writer
              )
            })
          } catch (error) {
            answers.push({ thrown: (error as Error).message })
          }
          await flush()
          await flush()
          await flush()
        }
        trace.expectScriptConsumed()
        return answers
      })
      const spawns = attachSpawnClass(
        withCallSites(trace.records.spawns, c.callSite),
        classes
      )
      return {
        result: normalisePaths({ calls: results }, profile),
        events: normalisePaths(trace.records.logs, profile),
        spawns: normalisePaths(spawns, profile),
        logFrames: normalisePaths(
          scrubStacks(trace.records.logFrames),
          profile
        ),
        stream: null
      }
    } finally {
      trace.restore()
    }
  })
}

/** The documented Rust-side differences (D-19); a delta no case uses is itself an error on the Rust side. */
const DELTAS: Record<string, string> = {
  'shell-injected-env':
    'The sidecar process this TS ran in carried GAMELIB_SHELL_EXE, GAMELIB_APP_ROOT, GAMELIB_STEAM_ROOT_DEFAULT and GAMELIB_STORE_BOOT, injected by src-tauri/src/sidecar.rs. A spawn from the shell own environment does not carry them, so the Rust runner env is the golden env without those four keys. No golden here holds them (the cases run on the pinned base env), so the Rust side adds none and the delta only records the rule for the cases that compare against a sidecar-run recording.',
  'caller-arrays-mutated':
    'The TS runWineCommand changes the arrays its caller handed it: commandParts gains the proton verb, the wrappers and the runner bin in place, and options.wrappers loses its first element to the spawned binary (commandPartsAfter, wrappersAfter in result.json). The Rust function takes its arguments by value and builds the argv on its own copy, so the Rust side compares the spawned argv and leaves both lists as the caller had them.',
  'error-stack-trace':
    'A launch script that fails to spawn is logged by runScriptForGame as the Error itself, and the TS log writer stringifies it with its JS stack (frames naming src/backend files and node_modules). The golden keeps the first line, "Error: spawn <script> <code>", and drops the "    at ..." lines, which name the machine and the test runner. The Rust runner logs the spawn error message and has no JS stack, so the comparison is on the first line only.'
}

// ---------------------------------------------------------------------------------------------
// The slices
// ---------------------------------------------------------------------------------------------

interface SliceSpec<T extends { id: string }> {
  slice: string
  floor: number
  build: () => T[]
  record: (c: T, classes: Classes) => Promise<Recorded>
}

function defineSlice<T extends { id: string }>(
  title: string,
  spec: SliceSpec<T>
): { cases: () => T[] } {
  let loaded: T[] = []
  describeSkipOnWindows(title, () => {
    const built = spec.build()
    const dir = goldenDir(CRATE, spec.slice)
    if (mode === 'write') {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'cases.json'), json(built))
      writeFileSync(join(dir, 'deltas.json'), json(DELTAS))
    }
    const cases = loadCases<T>(CRATE, spec.slice)
    loaded = cases
    const classes = loadClasses(CRATE)

    it('cases.json is exactly what the case builder produces', () => {
      expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
    })

    it('deltas.json is exactly the documented delta table, each with a reason of its own', () => {
      const committed: unknown = JSON.parse(
        readFileSync(join(dir, 'deltas.json'), 'utf8')
      )
      expect(committed).toEqual(DELTAS)
      for (const reason of Object.values(DELTAS)) {
        expect(reason.length).toBeGreaterThan(20)
      }
    })

    it.each(cases)('$id', async (c) => {
      const recorded = await spec.record(c, classes)
      writeOrCompareGolden(CRATE, spec.slice, c.id, {
        result: recorded.result,
        events: recorded.events,
        spawns: recorded.spawns,
        extra: {
          'logFrames.json': recorded.logFrames,
          'stream.json': recorded.stream
        }
      })
    })

    it('every spawn of every case names a call site that classes.json classifies', () => {
      for (const c of cases) {
        const site = (c as unknown as { callSite: string }).callSite
        expect(classes[site]).toBeDefined()
      }
    })

    it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
      syncManifest(CRATE, spec.slice, cases, spec.floor)
      assertManifest(CRATE, spec.slice, cases, spec.floor)
    })

    it('an empty case list fails the manifest check', () => {
      expectEmptyCasesToFail(CRATE, spec.slice, spec.floor)
    })
  })
  return { cases: () => loaded }
}

const wineSlice = defineSlice<WineLaunchCase>(
  'wine launch oracle (88.2-04, runWineCommand)',
  {
    slice: WINE_SLICE,
    floor: WINE_LAUNCH_FLOOR,
    build: wineLaunchCases,
    record: recordWineLaunch
  }
)

describeSkipOnWindows('wine launch oracle guards (88.2-04)', () => {
  const cases = loadCases<WineLaunchCase>(CRATE, WINE_SLICE)
  const expectedOf = (id: string, file: string): unknown =>
    JSON.parse(
      readFileSync(
        join(goldenDir(CRATE, WINE_SLICE), 'expected', id, file),
        'utf8'
      )
    )

  it('every pair of pairwise axis values that can occur together is in some wine-launch-pairwise row', () => {
    const rows = cases
      .filter((c) => c.id.startsWith('wine-launch-pairwise-'))
      .map((c) => c.axes as Row)
    expect(rows.length).toBeGreaterThan(0)
    expect(uncoveredPairs(AXES, rows, feasible)).toEqual([])
    for (const [axis, values] of Object.entries(AXES)) {
      for (const value of values) {
        expect(rows.some((row) => row[axis] === value)).toBe(true)
      }
    }
  })

  it('the tracer case records the Wine Command header before the first chunk and a track key equal to the app name', () => {
    if (mode !== 'compare') return
    const frames = expectedOf('wine-launch-sideload', 'logFrames.json') as {
      target: { kind: string; appName?: string }
      rotate: boolean
      raw?: string
    }[]
    const raws = frames.filter(
      (f) => f.target.kind === 'game' && f.raw !== undefined
    )
    expect(raws[0]?.raw?.startsWith('Wine Command: ')).toBe(true)
    expect(raws[0]?.raw).toContain('\n\nGame Log:\n')
    expect(raws[1]?.raw).toBe('game starting\n')
    // The rotation was claimed by the earlier entry, so no raw entry of the claimed writer carries it.
    expect(raws.every((f) => f.rotate === false)).toBe(true)
    const spawns = expectedOf('wine-launch-sideload', 'spawns.json') as {
      track: { runner: string; key: string } | null
      resolveOn: string | null
      callSite: string
      class: string
      argv: string[]
    }[]
    expect(spawns).toHaveLength(2)
    expect(spawns[0]?.track).toEqual({ runner: 'wine', key: 'sideload-app' })
    expect(spawns[0]?.resolveOn).toBe('close')
    expect(spawns[0]?.callSite).toBe('runner.wine_command.launch')
    expect(spawns[0]?.class).toBe('game')
    expect(spawns[1]?.argv).toEqual(['--wait'])
    expect(spawns[1]?.callSite).toBe('runner.wine_command.wineserver_wait')
    expect(spawns[1]?.class).toBe('helper')
  })

  it('an unclaimed writer carries rotate true on its header', () => {
    if (mode !== 'compare') return
    const unclaimed = cases.filter(
      (c) =>
        c.id.startsWith('wine-launch-pairwise-') && c.writers === 'unclaimed'
    )
    expect(unclaimed.length).toBeGreaterThan(0)
    let headers = 0
    for (const c of unclaimed) {
      const frames = expectedOf(c.id, 'logFrames.json') as {
        rotate: boolean
        raw?: string
      }[]
      const header = frames.find((f) => f.raw?.startsWith('Wine Command: '))
      // A run whose spawn fails writes no header: the header is written when the child starts.
      if (!header) continue
      headers += 1
      expect(header.rotate).toBe(true)
      expect(frames.filter((f) => f.rotate)).toHaveLength(1)
    }
    expect(headers).toBeGreaterThan(0)
  })

  it('the run options carry the track precedence, resolveOn and the timeout opt-out the legacy suite pinned', () => {
    if (mode !== 'compare') return
    const keyOf = (stem: string): string | undefined => {
      const id = cases.find(
        (c) => c.id.startsWith(CENSUS_STEM) && c.id.endsWith(stem)
      )?.id
      if (!id) return undefined
      const spawns = expectedOf(id, 'spawns.json') as {
        track: { key: string } | null
      }[]
      return spawns[0]?.track?.key
    }
    expect(keyOf('prefers-options-trackkey')).toBe('tk')
    expect(keyOf('falls-back-to-installfoldername')).toBe('folder')
    expect(keyOf('falls-back-to-the-wineprefix')).toBe('<HOME>/Games/prefix')
  })

  it('the wine launch slice has at least forty cases, and wineSlice is wired', () => {
    expect(cases.length).toBeGreaterThanOrEqual(40)
    expect(wineSlice.cases().length).toBe(cases.length)
  })
})

defineSlice<WinePathCase>('winepath oracle (88.2-04, getWinePath)', {
  slice: PATH_SLICE,
  floor: WINE_PATH_FLOOR,
  build: winePathCases,
  record: recordWinePath
})

const scriptSlice = defineSlice<ScriptCase>(
  'launch script oracle (88.2-04, runScriptForGame)',
  {
    slice: SCRIPT_SLICE,
    floor: SCRIPT_FLOOR,
    build: scriptCases,
    record: recordScript
  }
)

describeSkipOnWindows('launch script oracle guards (88.2-04)', () => {
  const cases = loadCases<ScriptCase>(CRATE, SCRIPT_SLICE)

  it('a script case records HEROIC_GAME_SETTINGS and HEROIC_GAME_INFO as the exact JSON.stringify text of the case inputs', () => {
    if (mode !== 'compare') return
    for (const c of cases) {
      const spawns = JSON.parse(
        readFileSync(
          join(goldenDir(CRATE, SCRIPT_SLICE), 'expected', c.id, 'spawns.json'),
          'utf8'
        )
      ) as {
        env: Record<string, string>
        callSite: string
        argv: string[]
        resolveOn: string
      }[]
      expect(spawns).toHaveLength(c.calls.length)
      spawns.forEach((spawn, index) => {
        const spec = c.calls[index]
        expect(spawn.env.HEROIC_GAME_SETTINGS).toBe(
          JSON.stringify({ ...GAME_SETTINGS, verboseLogs: spec?.verbose })
        )
        expect(spawn.env.HEROIC_GAME_INFO).toBe(JSON.stringify(GAME_INFO))
        expect(spawn.argv).toEqual([])
        expect(spawn.resolveOn).toBe('exit')
      })
    }
  })

  it('verbose off writes nothing to the log writer, verbose on writes every chunk', () => {
    if (mode !== 'compare') return
    const quiet = JSON.parse(
      readFileSync(
        join(
          goldenDir(CRATE, SCRIPT_SLICE),
          'expected',
          'script-before-quiet-exit-0',
          'logFrames.json'
        ),
        'utf8'
      )
    ) as unknown[]
    const loud = JSON.parse(
      readFileSync(
        join(
          goldenDir(CRATE, SCRIPT_SLICE),
          'expected',
          'script-before-verbose-exit-0',
          'logFrames.json'
        ),
        'utf8'
      )
    ) as { raw?: string }[]
    expect(quiet).toEqual([])
    expect(loud.map((f) => f.raw)).toEqual([
      'script says hi: ünï\n',
      'script warns\n'
    ])
  })

  it('the script slice has at least twelve cases, and scriptSlice is wired', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12)
    expect(scriptSlice.cases().length).toBe(cases.length)
  })
})

describeSkipOnWindows('winepath oracle guards (88.2-04)', () => {
  it('the winepath slice has at least six cases', () => {
    const cases = loadCases<WinePathCase>(CRATE, PATH_SLICE)
    expect(cases.length).toBeGreaterThanOrEqual(6)
  })
})

// ---------------------------------------------------------------------------------------------
// The census (D-15): every commandRunner.test.ts title is a golden case or a named Rust test
// ---------------------------------------------------------------------------------------------

const REAL_CHILDREN = 'Layer-2: real children (createRealRunner, fake HOME)'

describeSkipOnWindows('commandRunner.test.ts census (88.2-04, D-15)', () => {
  it('every title is a case in golden/runner, wine_launch, wine_path or script, or a real-children title naming runner_real.rs', () => {
    const titles = commandRunnerTitles()
    const owners: Record<string, string> = {}
    for (const title of titles) {
      if (describeOf(title) === REAL_CHILDREN) {
        owners[title] =
          `${REAL_SPAWN_TEST} (88.2-07): a real-children test, not a golden`
      }
    }
    const ids = [RUNNER_SLICE, WINE_SLICE, PATH_SLICE, SCRIPT_SLICE].flatMap(
      (slice) =>
        loadCases<{ id: string }>(CRATE, slice)
          .map((c) => c.id)
          .filter((id) => id.startsWith(`${CENSUS_STEM}--`))
          .map((id) => id.slice(CENSUS_STEM.length + 2))
    )
    assertCasesCoverTitles(ids, titles, owners)
    expect(Object.keys(owners).length).toBeGreaterThan(0)
    for (const owner of Object.values(owners)) {
      expect(owner).toContain('runner_real.rs')
    }
    // Every title outside the real-children describe is a case, none is waved through.
    const notPortedTitles = Object.keys(owners)
    expect(
      notPortedTitles.every((title) => describeOf(title) === REAL_CHILDREN)
    ).toBe(true)
  })

  it('no case id of the three slices collides with one of golden/runner', () => {
    const runnerIds = new Set(
      loadCases<{ id: string }>(CRATE, RUNNER_SLICE).map((c) => c.id)
    )
    for (const slice of [WINE_SLICE, PATH_SLICE, SCRIPT_SLICE]) {
      for (const c of loadCases<{ id: string }>(CRATE, slice)) {
        expect(runnerIds.has(c.id)).toBe(false)
      }
    }
  })
})
