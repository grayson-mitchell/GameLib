/**
 * The gamescope oracle (88.1-01, D-11, D-14, D-15, D-25): the pure flag mapping `buildGameScopeCommand`
 * and the help probe `probeGamescopeHelp`, driven on a fresh fake HOME and recorded as the golden the
 * Rust `gamelib-launch` gamescope builder has to reproduce. The golden exists before any Rust builder
 * does.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/gamescope/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     hand-authored: the documented Rust-side differences (D-19), empty in 88.1-01
 *   MANIFEST.json   `{ count, floor }`; the `class` of every recorded spawn is the one hand-authored,
 *                   non-oracle field (it comes from `golden/classes.json`, never from the TS)
 *   expected/<case>/result.json   the argv, or the probe's answer (a thrown error as `{ error }`)
 *   expected/<case>/spawns.json   the probe's spawn: program, argv, timeoutMs, call site and class
 *
 * The ops a case can name:
 *   build           `buildGameScopeCommand` over a list of inputs, answers in order
 *   probe           `probeGamescopeHelp` over a scripted runner (a normal exit, a timeout, a spawn error)
 *   probeThenBuild  the probe's help text fed to the builder, as the launcher does
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * Isolation (D-12, D-13, D-22): every case runs on a fresh fake HOME inside `withPinnedBaseEnv`; the
 * runner is scripted, so no `gamescope` binary is ever executed. Behaviour that looks wrong is kept as
 * recorded and filed as a todo (D-20); a fix is never mixed into a golden diff.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import {
  allPairs,
  uncoveredPairs,
  type Row
} from 'backend/testUtils/launchOracle/pairwise'
import {
  attachSpawnClass,
  loadClasses
} from 'backend/testUtils/launchOracle/spawnClass'
import {
  buildGameScopeCommand,
  probeGamescopeHelp
} from 'backend/gamescopeCommand'
import type { GameSettings } from 'common/types'

const CRATE = 'gamelib-launch'
const SLICE = 'gamescope'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const GAMESCOPE_FLOOR = 65
/** The call site the probe's spawn is recorded under; its class is in `golden/classes.json`. */
const PROBE_SITE = 'prepare_launch.gamescope_help'
const BIN = '/usr/bin/gamescope'
const STEM = 'gamescopeCommand'

const mode = engineWineOracleMode()

type Settings = NonNullable<GameSettings['gamescope']>

const NEW_HELP = 'usage ... -F, --filter ...'
const OLD_HELP = 'usage ... -U, --fsr-upscaling'

const base: Settings = {
  enableUpscaling: false,
  enableLimiter: false,
  enableForceGrabCursor: false,
  windowType: '',
  gameWidth: '',
  gameHeight: '',
  upscaleWidth: '',
  upscaleHeight: '',
  upscaleMethod: '',
  fpsLimiter: '',
  fpsLimiterNoFocus: '',
  additionalOptions: ''
}

interface Build {
  settings: Partial<Settings>
  help: string
  showMangohud?: boolean
}

interface ScriptedProbe {
  code?: number
  stderr?: string
  timedOut?: boolean
  throws?: string
}

type Op =
  | { op: 'build'; builds: Build[] }
  | { op: 'probe'; scripted: ScriptedProbe }
  | {
      op: 'probeThenBuild'
      scripted: ScriptedProbe
      settings: Partial<Settings>
    }

interface GamescopeCase {
  id: string
  /** The test title a named case stands for, verbatim. */
  title?: string
  /** The pairwise row a generated case stands for. */
  axes?: Row
  call: Op
}

// ---------------------------------------------------------------------------------------------
// The case tables
// ---------------------------------------------------------------------------------------------

const HELPS: Readonly<Record<string, string>> = {
  new: NEW_HELP,
  old: OLD_HELP,
  empty: ''
}
const METHODS = ['fsr', 'nis', 'integer', 'stretch', 'unset'] as const
const WINDOW_TYPES = ['fullscreen', 'borderless', 'windowed'] as const
const ADDITIONAL: Readonly<Record<string, string>> = {
  unset: '',
  plain: '--foo bar',
  quoted: '--foo "bar baz" --qux',
  unterminated: '--foo "bar'
}
const RESOLUTIONS: Readonly<Record<string, Partial<Settings>>> = {
  none: {},
  'game-only': { gameWidth: '1280', gameHeight: '720' },
  all: {
    gameWidth: '1280',
    gameHeight: '720',
    upscaleWidth: '1920',
    upscaleHeight: '1080'
  }
}

const PAIR_AXES = {
  enableUpscaling: [true, false],
  enableLimiter: [true, false],
  upscaleMethod: [...METHODS],
  windowType: [...WINDOW_TYPES],
  help: Object.keys(HELPS),
  showMangohud: [true, false],
  enableForceGrabCursor: [true, false],
  additionalOptions: Object.keys(ADDITIONAL),
  resolutions: Object.keys(RESOLUTIONS)
}

const pad = (n: number): string => String(n).padStart(3, '0')

const methodOf = (method: string): string => (method === 'unset' ? '' : method)

function pairwiseCases(): GamescopeCase[] {
  return allPairs(PAIR_AXES).map((row, i) => ({
    id: `cmd-pairwise-${pad(i + 1)}`,
    axes: row,
    call: {
      op: 'build',
      builds: [
        {
          help: HELPS[row.help as string] as string,
          showMangohud: row.showMangohud as boolean,
          settings: {
            enableUpscaling: row.enableUpscaling as boolean,
            enableLimiter: row.enableLimiter as boolean,
            enableForceGrabCursor: row.enableForceGrabCursor as boolean,
            upscaleMethod: methodOf(row.upscaleMethod as string),
            windowType: row.windowType as string,
            additionalOptions: ADDITIONAL[row.additionalOptions as string],
            fpsLimiter: '60',
            fpsLimiterNoFocus: '15',
            ...RESOLUTIONS[row.resolutions as string]
          } as Partial<Settings>
        }
      ]
    }
  }))
}

/** Per-axis vectors: every upscale method against every help text, each window type, each limiter form. */
function axisCases(): GamescopeCase[] {
  const single = (id: string, build: Build): GamescopeCase => ({
    id,
    call: { op: 'build', builds: [build] }
  })
  return [
    ...METHODS.flatMap((method) =>
      Object.entries(HELPS).map(([helpName, help]) =>
        single(`cmd-method-${method}-${helpName}-help`, {
          help,
          settings: { enableUpscaling: true, upscaleMethod: methodOf(method) }
        })
      )
    ),
    ...WINDOW_TYPES.map((windowType) =>
      single(`cmd-window-${windowType}`, {
        help: NEW_HELP,
        settings: { enableUpscaling: true, windowType }
      })
    ),
    single('cmd-window-type-ignored-without-upscaling', {
      help: NEW_HELP,
      settings: { enableUpscaling: false, windowType: 'fullscreen' }
    }),
    single('cmd-limiter-both', {
      help: NEW_HELP,
      settings: {
        enableLimiter: true,
        fpsLimiter: '60',
        fpsLimiterNoFocus: '15'
      }
    }),
    single('cmd-limiter-focused-only', {
      help: NEW_HELP,
      settings: { enableLimiter: true, fpsLimiter: '60' }
    }),
    single('cmd-limiter-unfocused-only', {
      help: NEW_HELP,
      settings: { enableLimiter: true, fpsLimiterNoFocus: '15' }
    }),
    single('cmd-limiter-values-ignored-when-off', {
      help: NEW_HELP,
      settings: { enableLimiter: false, fpsLimiter: '60' }
    }),
    single('cmd-nothing-enabled', { help: NEW_HELP, settings: {} }),
    single('cmd-help-text-containing-the-flag-in-the-middle', {
      help: 'x\n  -F, --filter=TYPE   upscaler\n y',
      settings: { enableUpscaling: true, upscaleMethod: 'fsr' }
    }),
    single('cmd-additional-options-whitespace-only', {
      help: NEW_HELP,
      settings: { additionalOptions: '   \t ' }
    }),
    single('cmd-additional-options-unset', {
      help: NEW_HELP,
      settings: { additionalOptions: undefined }
    })
  ]
}

const PROBE_FORMS: readonly (readonly [string, ScriptedProbe])[] = [
  ['stderr', { code: 0, stderr: NEW_HELP }],
  ['old-cli-stderr', { code: 0, stderr: OLD_HELP }],
  [
    'timeout',
    { code: null as unknown as number, stderr: NEW_HELP, timedOut: true }
  ],
  ['spawn-error', { throws: 'spawn ENOENT' }]
]

function probeCases(): GamescopeCase[] {
  return PROBE_FORMS.map(([name, scripted]) => ({
    id: `probe-${name}`,
    call: { op: 'probe', scripted }
  }))
}

/** One named case per `gamescopeCommand.test.ts` title (D-14); the two source-text gates are not ported (D-15). */
const SOURCE_TEXT_GATE_REASON = 'source-text gate, dropped per D-15'
const GATE_TITLES = [
  'launcher.ts gamescope wiring > calls buildGameScopeCommand and holds no flag mapping itself',
  'launcher.ts gamescope wiring > probes through the runner with a 5 s timeout and spawns nothing itself'
] as const

function namedCases(): GamescopeCase[] {
  const named = (title: string, call: Op): GamescopeCase => ({
    id: `${STEM}--${slug(title)}`,
    title,
    call
  })
  return [
    named('buildGameScopeCommand > upscale method %s with help %j', {
      op: 'build',
      builds: (
        [
          ['fsr', OLD_HELP],
          ['fsr', NEW_HELP],
          ['nis', OLD_HELP],
          ['nis', NEW_HELP],
          ['integer', OLD_HELP],
          ['integer', NEW_HELP],
          ['stretch', OLD_HELP],
          ['stretch', NEW_HELP],
          ['fsr', '']
        ] as const
      ).map(([upscaleMethod, help]) => ({
        help,
        settings: { enableUpscaling: true, upscaleMethod }
      }))
    }),
    named(
      'buildGameScopeCommand > upscaling emits resolutions and window type in order',
      {
        op: 'build',
        builds: [
          {
            help: NEW_HELP,
            settings: {
              enableUpscaling: true,
              gameWidth: '1280',
              gameHeight: '720',
              upscaleWidth: '1920',
              upscaleHeight: '1080',
              windowType: 'fullscreen'
            }
          },
          {
            help: OLD_HELP,
            settings: { enableUpscaling: true, windowType: 'borderless' }
          }
        ]
      }
    ),
    named(
      'buildGameScopeCommand > limiter only emits limiter flags, ignoring upscaling fields',
      {
        op: 'build',
        builds: [
          {
            help: NEW_HELP,
            settings: {
              enableLimiter: true,
              fpsLimiter: '60',
              fpsLimiterNoFocus: '15',
              gameWidth: '1280',
              windowType: 'fullscreen'
            }
          }
        ]
      }
    ),
    named(
      'buildGameScopeCommand > cursor grab, mangoapp and additionalOptions keep today position',
      {
        op: 'build',
        builds: [
          {
            help: OLD_HELP,
            showMangohud: true,
            settings: {
              enableLimiter: true,
              fpsLimiter: '30',
              enableForceGrabCursor: true,
              additionalOptions: '--foo "bar baz"'
            }
          }
        ]
      }
    ),
    named(
      'buildGameScopeCommand > returned array starts with bin and ends with the separator',
      {
        op: 'build',
        builds: [{ help: '', settings: { enableLimiter: true } }]
      }
    ),
    named(
      'probeGamescopeHelp (scripted runner) > runs `--help` with a 5 s timeout and returns its stderr',
      { op: 'probe', scripted: { code: 0, stderr: NEW_HELP } }
    ),
    named(
      'probeGamescopeHelp (scripted runner) > the new-CLI help text builds the new-CLI command',
      {
        op: 'probeThenBuild',
        scripted: { code: 0, stderr: NEW_HELP },
        settings: { enableUpscaling: true, upscaleMethod: 'fsr' }
      }
    ),
    named(
      'probeGamescopeHelp (scripted runner) > a timeout degrades to the old-CLI help (empty stderr)',
      {
        op: 'probe',
        scripted: {
          code: null as unknown as number,
          stderr: NEW_HELP,
          timedOut: true
        }
      }
    ),
    named(
      'probeGamescopeHelp (scripted runner) > a spawn error degrades to the old-CLI help instead of throwing',
      { op: 'probe', scripted: { throws: 'spawn ENOENT' } }
    )
  ]
}

function gamescopeCases(): GamescopeCase[] {
  return [...pairwiseCases(), ...axisCases(), ...probeCases(), ...namedCases()]
}

// ---------------------------------------------------------------------------------------------
// Running one case
// ---------------------------------------------------------------------------------------------

/** One build's answer: the argv, or `{ error }` when the builder threw. */
function buildOne(build: Build): unknown {
  try {
    return buildGameScopeCommand({
      bin: BIN,
      settings: { ...base, ...build.settings },
      helpStderr: build.help,
      showMangohud: build.showMangohud
    })
  } catch (error) {
    return { error: (error as Error).message }
  }
}

async function recordCase(
  c: GamescopeCase
): Promise<{ result: unknown; spawns: unknown[] }> {
  return withEngineOracleProfile((profile) =>
    withPinnedBaseEnv(profile.fake, async () => {
      if (c.call.op === 'build') {
        return { result: c.call.builds.map(buildOne), spawns: [] }
      }
      const scripted = c.call.scripted
      const tracer = createSpawnTracer({
        baseEnv: profile.fake.env as Record<string, string>,
        scripted: [
          {
            program: BIN,
            argv: ['--help'],
            code: scripted.code,
            stderr: scripted.stderr,
            timedOut: scripted.timedOut,
            throws: scripted.throws
          }
        ]
      })
      const timeouts: (number | null)[] = []
      const runner = {
        run: (
          program: string,
          argv: readonly string[],
          opts?: Parameters<typeof tracer.runner.run>[2]
        ) => {
          timeouts.push(opts?.timeoutMs ?? null)
          return tracer.runner.run(program, argv, opts)
        }
      }
      const help = await probeGamescopeHelp(runner, BIN)
      tracer.expectAllConsumed()
      const spawns = attachSpawnClass(
        tracer.records.map((record, i) => ({
          callSite: PROBE_SITE,
          program: record.program,
          argv: record.argv,
          timeoutMs: timeouts[i] ?? null,
          envDiff: record.envDiff,
          cwd: record.cwd,
          result: record.result
        })),
        loadClasses(CRATE)
      )
      const result =
        c.call.op === 'probeThenBuild'
          ? {
              help,
              argv: buildOne({ help, settings: c.call.settings })
            }
          : { help }
      return {
        result: normalisePaths(result, profile),
        spawns: normalisePaths(spawns, profile)
      }
    })
  )
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describeSkipOnWindows('gamescope oracle (88.1-01)', () => {
  const built = gamescopeCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json([]))
  }
  const cases = loadCases<GamescopeCase>(CRATE, SLICE)
  const byId = (id: string): GamescopeCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`case ${id} is missing`)
    return found
  }

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it.each(cases)('$id', async (c) => {
    const { result, spawns } = await recordCase(c)
    writeOrCompareGolden(CRATE, SLICE, c.id, { result, spawns })
  })

  it('the pairwise rows cover every legal pair of the nine axes', () => {
    const rows = cases.flatMap((c) =>
      c.id.startsWith('cmd-pairwise-') && c.axes ? [c.axes] : []
    )
    expect(rows.length).toBeGreaterThanOrEqual(15)
    expect(uncoveredPairs(PAIR_AXES, rows)).toEqual([])
  })

  describe('the help probe forms', () => {
    it('a normal exit returns stderr, a timeout and a spawn error return the empty string', async () => {
      const stderr = await recordCase(byId('probe-stderr'))
      const timeout = await recordCase(byId('probe-timeout'))
      const thrown = await recordCase(byId('probe-spawn-error'))
      expect(stderr.result).toEqual({ help: NEW_HELP })
      expect(timeout.result).toEqual({ help: '' })
      expect(thrown.result).toEqual({ help: '' })
    })

    it('every probe records its spawn with a 5 s timeout, the call site and the helper class', async () => {
      for (const id of ['probe-stderr', 'probe-timeout', 'probe-spawn-error']) {
        const { spawns } = await recordCase(byId(id))
        expect(spawns).toEqual([
          expect.objectContaining({
            callSite: PROBE_SITE,
            program: BIN,
            argv: ['--help'],
            timeoutMs: 5000,
            class: 'helper'
          })
        ])
      }
    })
  })

  describe('incident census (D-14)', () => {
    it('every title of gamescopeCommand.test.ts is a named case or a reasoned source-text gate', () => {
      const titles = tsTestTitles(join(__dirname, '..', `${STEM}.test.ts`))
      const ids = cases
        .filter((c) => c.id.startsWith(`${STEM}--`))
        .map((c) => c.id.slice(STEM.length + 2))
      const notPorted = Object.fromEntries(
        GATE_TITLES.map((title) => [title, SOURCE_TEXT_GATE_REASON])
      )
      assertCasesCoverTitles(ids, titles, notPorted)
      // No case without a title either: a typo in a case title would pass the line above only by luck.
      expect([...ids].sort()).toEqual(
        titles
          .filter((t) => !(GATE_TITLES as readonly string[]).includes(t))
          .map(slug)
          .sort()
      )
      expect(titles).toHaveLength(11)
    })
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, GAMESCOPE_FLOOR)
    assertManifest(CRATE, SLICE, cases, GAMESCOPE_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, GAMESCOPE_FLOOR)
  })
})
