/**
 * The launch builders oracle (88.1-01, D-11, D-12, D-13, D-14, D-22, D-25): the pure builders the
 * launcher assembles a game's command and environment from, driven through the real TS `Launcher` on
 * a fresh fake HOME and recorded as the golden the Rust `gamelib-launch` builders have to reproduce.
 * The golden exists before any Rust builder does.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/builders/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     hand-authored: the documented Rust-side differences (D-19), empty in 88.1-01
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json   what the builder answered (a thrown error as `{ error }`)
 *   expected/<case>/events.json   every backend log line the builder wrote, in order, paths normalised
 *
 * The ops a case can name:
 *   wrapperEnvVars   `launcher.setupWrapperEnvVars({ appName, appRunner })`, every runner
 *   wrappers         `launcher.setupWrappers(settings, mangoHud, gameMode, gameScope)`
 *   shlexSplit       npm `shlex.split(input)` (the managers split wrapper args with it)
 *   shlexJoin        npm `shlex.join(words)` (the managers pass `join(wrappers)` to `--wrapper`)
 *   knownFixEnv      `launcher.getKnownFixesEnvVariables(appName, runner)` over tier-1 layers
 *   removeQuote      `removeQuoteIfNecessary(value)`
 *   sonoma           `isMacSonomaOrHigher()` over a platform and an `os.release()`
 *   wineEnv          `launcher.setupWineEnvVars(settings, gameId)` (the wineLibFolders incident cases)
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * Isolation (D-12, D-13, D-22): every case runs on a fresh fake HOME inside `withPinnedBaseEnv`
 * (eleven `process.env` keys and no others) with an injected platform and `os.release()`; nothing reads
 * the real profile and nothing is spawned. The logger is spied on (`jest.spyOn`, not `jest.mock`).
 * Every recorded env is the builder's full output map, so a dropped, leaked or wrongly stripped
 * variable is a diff. The goldens are recorded on a POSIX host. Behaviour that looks wrong is kept as
 * recorded and filed as a todo (D-20); a fix is never mixed into a golden diff.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { split, join as shlexJoin } from 'shlex'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type OraclePlatform,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import { createFakeLauncherDeps } from 'backend/testUtils/launchOracle/fakeLauncherDeps'
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
  injectPlatform,
  injectProbe,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import * as logger from 'backend/logger'
import { createLauncher } from 'backend/launcher'
import { isMacSonomaOrHigher, removeQuoteIfNecessary } from 'backend/utils'
import type { GameSettings, Runner, WrapperVariable } from 'common/types'
import { fix } from './knownFixReader.cases'

const CRATE = 'gamelib-launch'
const SLICE = 'builders'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const BUILDERS_FLOOR = 113

const mode = engineWineOracleMode()

interface WineSettingsInput {
  wineVersion: {
    type: 'wine'
    bin: string
    name: string
    wineserver: string
    lib?: string
    lib32?: string
  }
  winePrefix: string
  wineCrossoverBottle: string
  enviromentOptions: []
  preferSystemLibs: boolean
}

type Op =
  | { op: 'wrapperEnvVars'; appName: string; appRunner: Runner }
  | {
      op: 'wrappers'
      wrapperOptions: WrapperVariable[] | null
      mangoHud: string[] | null
      gameMode: string | null
      gameScope: string[] | null
    }
  | { op: 'shlexSplit'; input: string }
  | { op: 'shlexJoin'; words: string[] }
  | { op: 'knownFixEnv'; appName: string; runner: Runner; seed: SeedEntry[] }
  | { op: 'removeQuote'; value: string }
  | { op: 'sonoma'; release: string }
  | { op: 'wineEnv'; settings: WineSettingsInput }

interface BuilderCase {
  id: string
  /** The platform the case runs as; default `linux`. */
  platform?: OraclePlatform
  /** The test title a named case stands for, verbatim. */
  title?: string
  /** The pairwise row a generated case stands for. */
  axes?: Row
  call: Op
}

// ---------------------------------------------------------------------------------------------
// The case tables
// ---------------------------------------------------------------------------------------------

const RUNNERS: readonly Runner[] = [
  'legendary',
  'gog',
  'nile',
  'sideload',
  'steam'
]

function wrapperEnvVarsCases(): BuilderCase[] {
  return RUNNERS.map((runner) => ({
    id: `wrapper-env-${runner}`,
    call: { op: 'wrapperEnvVars', appName: `app-${runner}`, appRunner: runner }
  }))
}

// setupWrappers: gamescope command x wrapper options x mangohud x gamemode (D-14, allPairs).
const GAMESCOPE_FORMS: Readonly<Record<string, string[] | null>> = {
  absent: null,
  empty: [],
  three: ['/usr/bin/gamescope', '-f', '--']
}
const WRAPPER_OPTION_FORMS: Readonly<Record<string, WrapperVariable[] | null>> =
  {
    none: null,
    plain: [{ exe: 'taskset', args: '-c 0' }],
    'double-quotes': [{ exe: 'env', args: 'FOO="a b" BAR=1' }],
    'single-quotes': [{ exe: 'env', args: "FOO='a b' BAR=1" }],
    'empty-args': [{ exe: 'nice', args: '' }],
    unterminated: [{ exe: 'env', args: 'FOO="a b' }]
  }
const MANGOHUD_FORMS: Readonly<Record<string, string[] | null>> = {
  absent: null,
  present: ['/usr/bin/mangohud', '--dlsym']
}
const GAMEMODE_FORMS: Readonly<Record<string, string | null>> = {
  absent: null,
  present: '/usr/bin/gamemoderun'
}
const WRAPPER_AXES = {
  gameScope: Object.keys(GAMESCOPE_FORMS),
  wrapperOptions: Object.keys(WRAPPER_OPTION_FORMS),
  mangoHud: Object.keys(MANGOHUD_FORMS),
  gameMode: Object.keys(GAMEMODE_FORMS)
}

const pad = (n: number): string => String(n).padStart(3, '0')

function wrapperCall(parts: {
  gameScope?: string[] | null
  wrapperOptions?: WrapperVariable[] | null
  mangoHud?: string[] | null
  gameMode?: string | null
}): Op {
  return {
    op: 'wrappers',
    gameScope: parts.gameScope ?? null,
    wrapperOptions: parts.wrapperOptions ?? null,
    mangoHud: parts.mangoHud ?? null,
    gameMode: parts.gameMode ?? null
  }
}

function wrapperCases(): BuilderCase[] {
  const pairwise = allPairs(WRAPPER_AXES).map(
    (row, i): BuilderCase => ({
      id: `wrappers-pairwise-${pad(i + 1)}`,
      axes: row,
      call: wrapperCall({
        gameScope: GAMESCOPE_FORMS[row.gameScope as string],
        wrapperOptions: WRAPPER_OPTION_FORMS[row.wrapperOptions as string],
        mangoHud: MANGOHUD_FORMS[row.mangoHud as string],
        gameMode: GAMEMODE_FORMS[row.gameMode as string]
      })
    })
  )
  const named: BuilderCase[] = [
    { id: 'wrappers-nothing', call: wrapperCall({}) },
    {
      id: 'wrappers-two-entries-keep-order',
      call: wrapperCall({
        wrapperOptions: [
          { exe: 'first', args: 'a b' },
          { exe: 'second', args: '"c d" e' }
        ]
      })
    },
    {
      id: 'wrappers-entry-without-args-field',
      call: wrapperCall({
        wrapperOptions: [{ exe: 'bare' } as WrapperVariable]
      })
    },
    {
      id: 'wrappers-empty-exe-is-filtered',
      call: wrapperCall({
        wrapperOptions: [{ exe: '', args: 'kept' }],
        gameMode: '/usr/bin/gamemoderun'
      })
    },
    {
      id: 'wrappers-empty-gamescope-and-empty-mangohud-add-nothing',
      call: wrapperCall({ gameScope: [], mangoHud: [] })
    },
    {
      id: 'wrappers-mangohud-only-follows-an-empty-gamescope',
      call: wrapperCall({
        gameScope: ['gs', '--'],
        mangoHud: ['/usr/bin/mangohud', '--dlsym']
      })
    }
  ]
  return [...pairwise, ...named]
}

// shlex: the managers split wrapper args with `split` and pass `join(wrappers)` to `--wrapper`.
const SPLIT_INPUTS: readonly (readonly [string, string])[] = [
  ['plain-words', 'a b c'],
  ['single-quotes', "a 'b c' d"],
  ['double-quotes', 'a "b c" d'],
  ['backslash-escaped-space', 'a\\ b c'],
  ['backslash-before-double-quote', '"a\\"b" c'],
  ['backslash-inside-single-quotes', "'a\\b' c"],
  ['unterminated-single-quote', "a 'b c"],
  ['unterminated-double-quote', 'a "b c'],
  ['empty-string', ''],
  ['empty-quoted-strings', 'a \'\' b "" c'],
  ['whitespace-runs-tabs-newlines', 'a  \t b\n\n c\t'],
  ['non-ascii', 'héllo "wörld ✓" 日本語'],
  ['dollar-variable', 'echo $HOME "${USER}" \'$LITERAL\''],
  ['backticks', 'echo `id` "`id`"'],
  ['trailing-backslash', 'a b\\'],
  ['adjacent-quoted-parts', 'a\'b\'"c"d'],
  ['hash-is-not-a-comment-here', 'a #b c'],
  ['only-whitespace', '   \t  ']
]
const JOIN_INPUTS: readonly (readonly [string, string[]])[] = [
  ['plain-words', ['a', 'b', 'c']],
  ['word-with-space', ['a', 'b c']],
  ['embedded-quotes', ["a'b", 'c"d', 'e\'f"g']],
  ['backslash', ['a\\b', 'c\\']],
  ['empty-string-element', ['a', '', 'b']],
  ['empty-list', []],
  ['non-ascii', ['héllo', 'wörld ✓']],
  ['dollar-variable', ['$HOME', '${USER}']],
  ['backtick', ['`id`']],
  ['whitespace-tab-newline', ['a\tb', 'c\nd']],
  ['shell-metacharacters', ['a;b', 'a&b', 'a|b', '*', '?', '~', '#x', '(y)']]
]

function shlexCases(): BuilderCase[] {
  return [
    ...SPLIT_INPUTS.map(
      ([name, input]): BuilderCase => ({
        id: `shlex-split-${name}`,
        call: { op: 'shlexSplit', input }
      })
    ),
    ...JOIN_INPUTS.map(
      ([name, words]): BuilderCase => ({
        id: `shlex-join-${name}`,
        call: { op: 'shlexJoin', words }
      })
    )
  ]
}

// Known-fix env: tier-1 `<id>-<store>.json` in the local, bundled and remote layers of the fake HOME.
const KF_APP = 'app1'
const REG = [
  { key: 'HKLM\\Software\\X', name: 'N', type: 'REG_DWORD', value: 1 }
]
const DLL_OVERRIDES = [{ exe: 'Game.exe', dlls: { d3d9: 'native' } }]

function knownFixCase(
  id: string,
  seed: SeedEntry[],
  runner: Runner = 'gog',
  appName = KF_APP
): BuilderCase {
  return {
    id: `known-fix-env-${id}`,
    call: { op: 'knownFixEnv', appName, runner, seed }
  }
}

const withEnv = (envVariables: unknown): Record<string, unknown> => ({
  title: 'fix',
  envVariables
})

function knownFixCases(): BuilderCase[] {
  const local = (body: unknown, runner: Runner = 'gog') =>
    fix('local', KF_APP, runner, 1, body)
  const bundled = (body: unknown, runner: Runner = 'gog') =>
    fix('bundled', KF_APP, runner, 1, body)
  const remote = (body: unknown, runner: Runner = 'gog') =>
    fix('remote', KF_APP, runner, 1, body)
  return [
    knownFixCase('absent', []),
    knownFixCase('string-values', [
      local(withEnv({ A: '1', B: 'two words', C: '' }))
    ]),
    knownFixCase('number-value', [local(withEnv({ N: 5, ZERO: 0 }))]),
    knownFixCase('boolean-value', [local(withEnv({ T: true, F: false }))]),
    knownFixCase('object-value', [local(withEnv({ O: { nested: 1 } }))]),
    knownFixCase('null-and-array-values', [
      local(withEnv({ NULLED: null, LIST: [1, 'two'] }))
    ]),
    knownFixCase('empty-env-variables', [local(withEnv({}))]),
    knownFixCase('env-variables-is-a-string', [local(withEnv('A=1'))]),
    knownFixCase('env-variables-is-a-list', [local(withEnv(['A=1']))]),
    knownFixCase('fix-without-env-variables', [
      local({ title: 'fix', winetricks: ['vcrun'] })
    ]),
    knownFixCase('local-over-bundled', [
      local(withEnv({ WHO: 'local', ONLY_LOCAL: '1' })),
      bundled(withEnv({ WHO: 'bundled', ONLY_BUNDLED: '1' }))
    ]),
    knownFixCase('bundled-over-remote', [
      bundled(withEnv({ WHO: 'bundled' })),
      remote(withEnv({ WHO: 'remote', ONLY_REMOTE: '1' }))
    ]),
    knownFixCase('bundled-only', [bundled(withEnv({ WHO: 'bundled' }))]),
    knownFixCase('remote-only', [remote(withEnv({ WHO: 'remote' }))]),
    knownFixCase('local-malformed-bundled-valid', [
      local('{ not json'),
      bundled(withEnv({ WHO: 'bundled' }))
    ]),
    knownFixCase('malformed-only', [local('{ not json')]),
    knownFixCase('remote-file-with-tier-2-keys', [
      remote({
        title: 'remote',
        envVariables: { FROM_REMOTE: '1' },
        registry: REG,
        dllOverrides: DLL_OVERRIDES,
        overlays: [{ id: 'o1' }],
        shimFeatures: ['f1'],
        evidence: 'todo.md'
      }),
      fix('remote', KF_APP, 'gog', 2, {
        title: 'remote profile',
        registry: REG,
        dllOverrides: DLL_OVERRIDES
      })
    ]),
    ...(['legendary', 'nile', 'sideload', 'steam'] as const).map((runner) =>
      knownFixCase(
        `runner-${runner}`,
        [local(withEnv({ RUNNER: runner }), runner)],
        runner
      )
    )
  ]
}

const QUOTE_INPUTS: readonly (readonly [string, string])[] = [
  ['no-quotes', 'path/without/quotes'],
  ['wrapped-in-quotes', '"path/with/quotes"'],
  ['single-pair', '"a"'],
  ['doubled-pair', '""a""'],
  ['leading-only', '"a'],
  ['trailing-only', 'a"'],
  ['empty', ''],
  ['one-quote', '"'],
  ['three-quotes', '"""'],
  ['space-without-quotes', 'a b'],
  ['quoted-space', '"a b"'],
  ['inner-quote', '"a"b"'],
  ['single-quotes-are-kept', "'a'"]
]

function removeQuoteCases(): BuilderCase[] {
  return QUOTE_INPUTS.map(([name, value]) => ({
    id: `remove-quote-${name}`,
    call: { op: 'removeQuote', value }
  }))
}

const SONOMA_PLATFORMS: readonly OraclePlatform[] = ['mac', 'linux', 'windows']
const SONOMA_RELEASES: readonly (readonly [string, string])[] = [
  ['darwin-23', '23.1.0'],
  ['darwin-22', '22.6.0'],
  ['bare-14', '14'],
  ['darwin-13', '13.9'],
  ['empty', ''],
  ['not-a-number', 'abc']
]

function sonomaCases(): BuilderCase[] {
  return SONOMA_PLATFORMS.flatMap((platform) =>
    SONOMA_RELEASES.map(
      ([name, release]): BuilderCase => ({
        id: `sonoma-${platform}-${name}`,
        platform,
        call: { op: 'sonoma', release }
      })
    )
  )
}

// One named case per launcher_wineLibFolders.test.ts title (D-14, 59-31 H3).
const WINE_LIB_STEM = 'launcher_wineLibFolders'
const wineSettings = (lib?: string, lib32?: string): WineSettingsInput => ({
  wineVersion: {
    type: 'wine',
    bin: '/pins/bin/wine',
    name: 'Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)',
    wineserver: '/pins/bin/wineserver',
    ...(lib !== undefined && { lib }),
    ...(lib32 !== undefined && { lib32 })
  },
  winePrefix: '/pins/prefix',
  wineCrossoverBottle: 'GameLibSteamBridge-1',
  enviromentOptions: [],
  preferSystemLibs: false
})

function wineLibFolderCases(): BuilderCase[] {
  const named = (
    title: string,
    platform: OraclePlatform,
    settings: WineSettingsInput
  ): BuilderCase => ({
    id: `${WINE_LIB_STEM}--${slug(title)}`,
    title,
    platform,
    call: { op: 'wineEnv', settings }
  })
  return [
    named(
      'H3: setupWineEnvVars library-folder error > macOS, wine with no lib paths: no error, env has no LD_LIBRARY_PATH or WINEDLLPATH',
      'mac',
      wineSettings()
    ),
    named(
      'H3: setupWineEnvVars library-folder error > macOS, wine with lib and lib32: LD_LIBRARY_PATH is set as before',
      'mac',
      wineSettings('/pins/lib', '/pins/lib32')
    ),
    named(
      'H3: setupWineEnvVars library-folder error > Linux, wine with no lib paths: the error is still logged',
      'linux',
      wineSettings()
    )
  ]
}

function builderCases(): BuilderCase[] {
  return [
    ...wrapperEnvVarsCases(),
    ...wrapperCases(),
    ...shlexCases(),
    ...knownFixCases(),
    ...removeQuoteCases(),
    ...sonomaCases(),
    ...wineLibFolderCases()
  ]
}

// ---------------------------------------------------------------------------------------------
// Running one case
// ---------------------------------------------------------------------------------------------

interface LogLine {
  level: 'info' | 'warning' | 'error'
  text: string
}

const asText = (message: unknown): string =>
  Array.isArray(message) ? message.join(' ') : String(message)

/** The module object `backend/utils` calls `release()` on; a namespace import would be a frozen copy. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const osModule = (): typeof import('os') => require('os')

/** Runs the case's call and returns what it answered. */
function runCall(
  call: Op,
  launcher: ReturnType<typeof createLauncher>
): unknown {
  switch (call.op) {
    case 'wrapperEnvVars':
      return launcher.setupWrapperEnvVars({
        appName: call.appName,
        appRunner: call.appRunner
      })
    case 'wrappers':
      return launcher.setupWrappers(
        { wrapperOptions: call.wrapperOptions ?? undefined } as GameSettings,
        call.mangoHud ?? undefined,
        call.gameMode ?? undefined,
        call.gameScope ?? undefined
      )
    case 'shlexSplit':
      return split(call.input)
    case 'shlexJoin':
      return shlexJoin(call.words)
    case 'knownFixEnv':
      return launcher.getKnownFixesEnvVariables(call.appName, call.runner)
    case 'removeQuote':
      return removeQuoteIfNecessary(call.value)
    case 'sonoma':
      return isMacSonomaOrHigher()
    case 'wineEnv':
      return launcher.setupWineEnvVars(call.settings as unknown as GameSettings)
  }
}

/** Runs one case on a fresh fake HOME and returns what it answered and logged, normalised. */
async function recordCase(
  c: BuilderCase
): Promise<{ result: unknown; events: LogLine[] }> {
  return withEngineOracleProfile(
    async (profile) => {
      const fake = createFakeLauncherDeps(profile)
      const launcher = createLauncher(fake.deps)
      const events: LogLine[] = []
      const spy = (
        level: LogLine['level'],
        name: 'logInfo' | 'logWarning' | 'logError'
      ) => {
        const s = jest.spyOn(logger, name)
        s.mockImplementation(((message: unknown) => {
          events.push({ level, text: asText(message) })
        }) as never)
        return () => s.mockRestore()
      }
      const restores = [
        injectPlatform(c.platform ?? 'linux'),
        spy('info', 'logInfo'),
        spy('warning', 'logWarning'),
        spy('error', 'logError')
      ]
      if (c.call.op === 'sonoma') {
        const release = c.call.release
        restores.push(
          injectProbe(osModule(), 'release', (() => release) as never)
        )
      }
      const result = await withInjected(restores, () =>
        withPinnedBaseEnv(profile.fake, () => {
          try {
            return { value: runCall(c.call, launcher) }
          } catch (error) {
            return { error: (error as Error).message }
          }
        })
      )
      return {
        // A thrown error is the answer `{ error }`; any other answer is the value itself.
        result: normalisePaths(
          'error' in result ? { error: result.error } : result.value,
          profile
        ),
        events: normalisePaths(events, profile)
      }
    },
    { seed: c.call.op === 'knownFixEnv' ? c.call.seed : undefined }
  )
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describeSkipOnWindows('launch builders oracle (88.1-01)', () => {
  const built = builderCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json([]))
  }
  const cases = loadCases<BuilderCase>(CRATE, SLICE)
  const byId = (id: string): BuilderCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`case ${id} is missing`)
    return found
  }

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it.each(cases)('$id', async (c) => {
    const { result, events } = await recordCase(c)
    writeOrCompareGolden(CRATE, SLICE, c.id, { result, events })
  })

  it('records one answer per runner and no two runners answer alike', async () => {
    const answers = new Set<string>()
    for (const runner of RUNNERS) {
      answers.add(
        JSON.stringify((await recordCase(byId(`wrapper-env-${runner}`))).result)
      )
    }
    expect(answers.size).toBe(RUNNERS.length)
  })

  it('the wrapper rows cover every legal pair of gamescope, options, mangohud and gamemode', () => {
    const rows = cases.flatMap((c) =>
      c.id.startsWith('wrappers-pairwise-') && c.axes ? [c.axes] : []
    )
    expect(rows.length).toBeGreaterThanOrEqual(18)
    expect(uncoveredPairs(WRAPPER_AXES, rows)).toEqual([])
  })

  it('an unterminated quote in a wrapper option and in shlex.split is recorded as its error', async () => {
    for (const id of [
      'shlex-split-unterminated-single-quote',
      'shlex-split-unterminated-double-quote',
      'shlex-split-trailing-backslash'
    ]) {
      const { result } = await recordCase(byId(id))
      expect(result).toEqual({ error: expect.stringContaining('Got EOF') })
    }
    const unterminated = cases.filter(
      (c) =>
        c.axes?.wrapperOptions === 'unterminated' &&
        c.id.startsWith('wrappers-pairwise-')
    )
    expect(unterminated.length).toBeGreaterThan(0)
    for (const c of unterminated) {
      expect((await recordCase(c)).result).toEqual({
        error: expect.stringContaining('Got EOF')
      })
    }
  })

  it('a remote file carrying tier-2 keys yields an env with no tier-2 key', async () => {
    const { result } = await recordCase(
      byId('known-fix-env-remote-file-with-tier-2-keys')
    )
    expect(result).toEqual({ FROM_REMOTE: '1' })
  })

  it('the known-fix env layers: local wins over bundled, bundled over remote', async () => {
    expect(
      (await recordCase(byId('known-fix-env-local-over-bundled'))).result
    ).toEqual({ WHO: 'local', ONLY_LOCAL: '1' })
    expect(
      (await recordCase(byId('known-fix-env-bundled-over-remote'))).result
    ).toEqual({ WHO: 'bundled' })
  })

  it('isMacSonomaOrHigher answers both ways on a Mac and false elsewhere, with its two log lines', async () => {
    const answered = async (id: string) => recordCase(byId(id))
    const yes = await answered('sonoma-mac-darwin-23')
    const no = await answered('sonoma-mac-darwin-13')
    expect(yes.result).toBe(true)
    expect(no.result).toBe(false)
    expect(yes.events.map((e) => e.text)).toEqual([
      'Checking if macOS is Sonoma or higher',
      'macOS is Sonoma or higher'
    ])
    expect(no.events.map((e) => e.text)).toEqual([
      'Checking if macOS is Sonoma or higher',
      'macOS is not Sonoma or higher'
    ])
    for (const platform of ['linux', 'windows']) {
      const other = await answered(`sonoma-${platform}-darwin-23`)
      expect(other.result).toBe(false)
      expect(other.events).toEqual([])
    }
  })

  describe('incident census (D-14)', () => {
    it('every title of launcher_wineLibFolders.test.ts is a named case, one for one', () => {
      const titles = tsTestTitles(
        join(__dirname, '..', `${WINE_LIB_STEM}.test.ts`)
      )
      const ids = cases
        .filter((c) => c.id.startsWith(`${WINE_LIB_STEM}--`))
        .map((c) => c.id.slice(WINE_LIB_STEM.length + 2))
      assertCasesCoverTitles(ids, titles, {})
      // No case without a title either: a typo in a case title would pass the line above only by luck.
      expect([...ids].sort()).toEqual(titles.map(slug).sort())
      expect(titles).toHaveLength(3)
    })

    it('the library-folder error is logged on Linux and never on macOS', async () => {
      const lib = "Couldn't find all library folders"
      for (const c of cases.filter((x) =>
        x.id.startsWith(`${WINE_LIB_STEM}--`)
      )) {
        const { events } = await recordCase(c)
        const logged = events.some(
          (e) => e.level === 'error' && e.text.includes(lib)
        )
        expect(logged).toBe(c.platform === 'linux')
      }
    })
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, BUILDERS_FLOOR)
    assertManifest(CRATE, SLICE, cases, BUILDERS_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, BUILDERS_FLOOR)
  })
})
