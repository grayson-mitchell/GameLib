/**
 * The case list of the known-fix registry oracle (88-06, D-11, D-14). Not a test:
 * `knownFixRegistry.oracle.test.ts` builds `cases.json` from this module in write mode and compares the
 * committed file against it in compare mode, so the list the Rust replay (88-09) reads and the list that
 * was recorded cannot drift.
 *
 * A case is an id and a list of steps run in order on one fresh fake HOME. A step first removes paths,
 * then seeds files, then does its `op`:
 *   validate       `validateRegistryFixes(raw)`
 *   dllCompile     `dllOverridesToRegistryFixes(raw)` (and, with `thenValidate`, `validateRegistryFixes` over it)
 *   profileFixes   `knownFixProfileRegistryFixes(profile)`
 *   commandParts   `buildRegistryFixCommandParts(fix, view)`
 *   regIsSet       `wineRegistryValueIsSet(regText, fix, view)`
 *   prefixDir      `knownFixPrefixDir({ paths }, settings)`
 *   timeout        the `REGISTRY_FIX_TIMEOUT_MS` constant
 *   apply          `applyRegistryFixes(raw, ctx, run, prefix)` with a scripted run seam (`outcomes`, one per
 *                  `run` call, in call order); `seam: 'bridge'` hands the seam the options the Steam bridge
 *                  passes (wait false, protonVerb run, skipPrefixCheckIKnowWhatImDoing true)
 *   profileApply   `applyKnownFixProfileRegistry(deps, appName, runner, settings)`; `seam: 'scripted'` answers
 *                  `runWineCommand` from `outcomes`, `seam: 'real'` goes through the real `createCommandRunner`
 *                  over the spawn tracer (`scripted` at case level answers the spawned programs)
 * Seed and remove paths start with a placeholder. The three layers are
 *   local    `<APPFOLDER>/fixes/local`   bundled `<HOME>/public/fixes`   remote `<APPFOLDER>/fixes`
 * and a tier-2 profile is `<id>-<store>.profile.json` in one of them.
 *
 * An `outcome` scripts one `run` call: `code` (default) settles with `{ code }`, `undefined` with nothing,
 * `reject` throws `message`, and `never` does not settle (the case advances a fake clock past the 15 s
 * deadline). `child` makes the seam hand `onSpawn` a child handle whose `kill` is recorded.
 */
import type { Runner } from 'common/types'
import type { SeedEntry } from 'backend/testUtils/engineWineOracle/harness'
import { slug } from 'backend/testUtils/launchOracle/census'
import { fix as layerFile } from './knownFixReader.cases'

export type View = 32 | 64

export interface FixInput {
  key: string
  name: string
  type: 'REG_DWORD' | 'REG_SZ'
  data: string
  views: View[]
}

export interface Outcome {
  result?: 'code' | 'undefined' | 'reject' | 'never'
  code?: number
  message?: string
  child?: { pid: number; exitCode: number | null }
}

export interface ScriptedSpawn {
  program: string
  argv?: string[]
  code?: number
  stdout?: string
  stderr?: string
  repeat?: true
}

type StepBody =
  | { op: 'validate'; raw?: unknown }
  | { op: 'dllCompile'; raw?: unknown; thenValidate?: true }
  | { op: 'profileFixes'; profile: Record<string, unknown> }
  | { op: 'commandParts'; fix: FixInput; view: View }
  | { op: 'regIsSet'; regText: string; fix: FixInput; view: View }
  | { op: 'prefixDir'; settings: Record<string, unknown> }
  | { op: 'timeout' }
  | {
      op: 'apply'
      raw: unknown
      label: string
      logPrefix: 'Backend' | 'Steam'
      seam: 'plain' | 'bridge'
      /** A path with a placeholder, or absent for no prefix directory. */
      prefix?: string
      outcomes: Outcome[]
    }
  | {
      op: 'profileApply'
      appName: string
      runner: Runner
      settings: Record<string, unknown>
      seam: 'scripted' | 'real'
      outcomes?: Outcome[]
      /** What every call after `outcomes` runs out does (default: succeeds with code 0). */
      otherwise?: Outcome
    }

export type Step = StepBody & { seed?: SeedEntry[]; remove?: string[] }

export interface RegistryCase {
  id: string
  /** The test title a named case stands for, verbatim. */
  title?: string
  platform?: 'mac' | 'linux'
  /** Answers for the programs the real command runner spawns (only a `real` profileApply spawns). */
  scripted?: ScriptedSpawn[]
  steps: Step[]
}

// ---------------------------------------------------------------------------------------------
// Shared inputs
// ---------------------------------------------------------------------------------------------

export const CROSSOVER_BIN =
  '<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine'
export const CROSSOVER_SERVER =
  '<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wineserver'
const BOTTLES = '<HOME>/Library/Application Support/CrossOver/Bottles'

/** `GameSettings` with every field the env builders read, as the wine_command goldens carry them. */
export const settingsOf = (
  wineVersion: Record<string, unknown>,
  over: Record<string, unknown> = {}
): Record<string, unknown> => ({
  nvidiaPrime: false,
  showFps: false,
  enviromentOptions: [],
  winePrefix: '<HOME>/Games/prefix',
  wineCrossoverBottle: '',
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
  disableUMU: true,
  wineVersion,
  ...over
})

const crossoverSettings = (bottle = 'GameLibSteam') =>
  settingsOf(
    {
      type: 'crossover',
      name: 'CrossOver - 24.0.0',
      bin: CROSSOVER_BIN,
      wineserver: CROSSOVER_SERVER
    },
    { wineCrossoverBottle: bottle }
  )

const crossoverSeed: SeedEntry[] = [
  { path: CROSSOVER_BIN, text: '' },
  { path: CROSSOVER_SERVER, text: '' }
]

/** A Wine `.reg` header with no section in it: nothing is set. */
const EMPTY_REG =
  'WINE REGISTRY Version 2\n;; All keys relative to REGISTRY\\\\Machine\n\n#arch=win64\n\n'

const ENTRY = {
  key: 'HKCU\\Software\\Foo',
  name: 'Bar',
  type: 'REG_DWORD',
  value: 1
}

/** A tier-2 profile in a layer, for the id and runner the TS test used. */
const profileIn = (
  layer: 'local' | 'bundled' | 'remote',
  body: unknown,
  app = 'GOGAPP',
  runner: Runner = 'gog'
): SeedEntry => layerFile(layer, app, runner, 2, body)

// ---------------------------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------------------------

/** The ids of every case that stands for a test title, to keep `named` honest. */
export const named = (
  prefix: string,
  title: string,
  steps: Step[],
  more: Partial<RegistryCase> = {}
): RegistryCase => ({
  id: `knownFixesRegistry--${slug(`${prefix}${title}`)}`,
  title: `${prefix}${title}`,
  steps,
  ...more
})

// ---------------------------------------------------------------------------------------------
// Step builders
// ---------------------------------------------------------------------------------------------

const GOG_CTX = { label: 'gog 123', logPrefix: 'Backend' as const }
const validate = (raw?: unknown): Step => ({ op: 'validate', raw })
const dll = (raw?: unknown, thenValidate?: true): Step => ({
  op: 'dllCompile',
  raw,
  ...(thenValidate ? { thenValidate } : {})
})
const regIs = (regText: string, fix: FixInput, view: View): Step => ({
  op: 'regIsSet',
  regText,
  fix,
  view
})
const apply = (
  raw: unknown,
  outcomes: Outcome[],
  extra: Partial<Extract<Step, { op: 'apply' }>> & {
    seed?: SeedEntry[]
  } = {}
): Step =>
  ({
    op: 'apply',
    raw,
    ...GOG_CTX,
    seam: 'plain',
    outcomes,
    ...extra
  }) as Step
const ok = (n = 1): Outcome[] => Array.from({ length: n }, () => ({}))

const GOOD_FIX = (view: View): FixInput => ({
  key: 'HKCU\\Software\\Foo',
  name: 'Bar',
  type: 'REG_DWORD',
  data: '1',
  views: [view]
})

// regIsSet inputs, as knownFixesRegistry.test.ts builds them
const WMP =
  'Software\\\\Microsoft\\\\Active Setup\\\\Installed Components\\\\{22d6f312-b0f6-11d0-94ab-0080c74c7e95}'
const reg = (
  arch: string | null,
  body: string,
  first = 'WINE REGISTRY Version 2'
): string =>
  [
    first,
    ';; All keys relative to REGISTRY\\\\Machine',
    '',
    ...(arch ? [`#arch=${arch}`] : []),
    '',
    body
  ].join('\n')
const section = (key: string, ...vals: string[]): string =>
  [`[${key}] 1792831399`, '#time=1dc1', ...vals, ''].join('\n')
const DW = (data = 1): FixInput => ({
  key: 'HKLM\\Software\\Microsoft\\Active Setup\\Installed Components\\{22d6f312-b0f6-11d0-94ab-0080c74c7e95}',
  name: 'IsInstalled',
  type: 'REG_DWORD',
  data: String(data),
  views: [32, 64]
})
const SZ = (data: string): FixInput => ({
  key: 'HKLM\\Software\\Foo',
  name: 'Path',
  type: 'REG_SZ',
  data,
  views: [32, 64]
})
const WOW = WMP.replace('Software\\\\', 'Software\\\\Wow6432Node\\\\')
const BOTH = reg(
  'win64',
  section(WMP, '"IsInstalled"=dword:00000001') +
    section(WOW, '"IsInstalled"=dword:00000001')
)

// applyRegistryFixes skip-and-kill inputs
const WMPKEY =
  'HKLM\\Software\\Microsoft\\Active Setup\\Installed Components\\{22d6f312}'
const WMP_ENTRY = {
  key: WMPKEY,
  name: 'IsInstalled',
  type: 'REG_DWORD',
  value: 1
}
const sec = (k: string): string =>
  `[${k}] 1\n#time=1\n"IsInstalled"=dword:00000001\n\n`
const K64 =
  'Software\\\\Microsoft\\\\Active Setup\\\\Installed Components\\\\{22d6f312}'
const K32 = K64.replace('Software\\\\', 'Software\\\\Wow6432Node\\\\')
const prefixWith = (name: string, content?: string): SeedEntry[] =>
  content === undefined
    ? [{ path: `<HOME>/prefix-${name}`, dir: true }]
    : [{ path: `<HOME>/prefix-${name}/system.reg`, text: content }]
const NEVER_KILLABLE: Outcome = {
  result: 'never',
  child: { pid: 4242, exitCode: null }
}

// the tier-2 profile cases
const GOGAPP_SETTINGS = { winePrefix: '/games/prefixes/GOGAPP' }
const scripted = (
  seed: SeedEntry[],
  extra: Partial<Extract<Step, { op: 'profileApply' }>> = {},
  appName = 'GOGAPP',
  runner: Runner = 'gog'
): Step =>
  ({
    op: 'profileApply',
    appName,
    runner,
    settings: GOGAPP_SETTINGS,
    seam: 'scripted',
    seed,
    ...extra
  }) as Step

// ---------------------------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------------------------

export function buildCases(): RegistryCase[] {
  const V = 'validateRegistryFixes > '
  const A = 'applyRegistryFixes > '
  const W = 'wineRegistryValueIsSet > '
  const AK = 'applyRegistryFixes skip and kill > '
  const P = 'knownFixPrefixDir > '
  const D = 'dllOverridesToRegistryFixes > '
  const F = 'knownFixProfileRegistryFixes > '
  const PA = 'applyKnownFixProfileRegistry > '

  const t2 = (body: unknown) => profileIn('bundled', body)

  return [
    // The tracer: a profile registry fix and a dllOverrides entry applied through the real command runner
    // on the spawn tracer, so the recording runs from the tier-2 file to the wine spawn.
    {
      id: 'launcher-path-crossover-registry-and-dll-override',
      platform: 'mac',
      scripted: [{ program: CROSSOVER_BIN, code: 0, repeat: true }],
      steps: [
        {
          op: 'profileApply',
          appName: 'GOGAPP',
          runner: 'gog',
          settings: crossoverSettings(),
          seam: 'real',
          seed: [
            ...crossoverSeed,
            profileIn('bundled', {
              title: 't',
              registry: [ENTRY],
              dllOverrides: [{ exe: 'Game.exe', dlls: { nvapi64: 'disabled' } }]
            }),
            { path: `${BOTTLES}/GameLibSteam/system.reg`, text: EMPTY_REG },
            { path: `${BOTTLES}/GameLibSteam/user.reg`, text: EMPTY_REG }
          ]
        }
      ]
    },

    // ---- validateRegistryFixes ----
    named(
      V,
      'keeps a valid entry and warns on a bad sibling with ctx label/prefix',
      [validate([{ ...ENTRY, key: 'HKXX\\bad' }, ENTRY])]
    ),
    named(V, 'rejects a name starting with / and a quote in a REG_SZ value', [
      validate([
        { ...ENTRY, name: '/f' },
        { ...ENTRY, type: 'REG_SZ', value: 'a"b' }
      ])
    ]),
    named(V, 'warns and returns [] for a non-array', [validate({})]),

    // ---- applyRegistryFixes with a scripted run seam ----
    named(A, 'runs once per view, 32 then 64, with the reg add argv', [
      apply([ENTRY], ok(2))
    ]),
    named(
      A,
      'warns, never rejects, on non-zero code, undefined and rejection',
      [
        apply(
          [ENTRY, { ...ENTRY, name: 'Baz' }],
          [
            { code: 2 },
            { result: 'undefined' },
            { result: 'reject', message: 'boom' },
            { code: 0 }
          ]
        )
      ]
    ),
    named(A, 'warns timed out for a never-settling run', [
      apply([{ ...ENTRY, views: [64] }], [{ result: 'never' }])
    ]),

    // ---- wineRegistryValueIsSet ----
    named(W, 'matches a DWORD in the 64 view and the Wow6432Node 32 view', [
      regIs(BOTH, DW(), 64),
      regIs(BOTH, DW(), 32)
    ]),
    named(
      W,
      'is false when the Wow6432Node section is absent for view 32',
      (() => {
        const only64 = reg(
          'win64',
          section(WMP, '"IsInstalled"=dword:00000001')
        )
        return [regIs(only64, DW(), 64), regIs(only64, DW(), 32)]
      })()
    ),
    named(
      W,
      'handles win32: view 32 plain, view 64 false',
      (() => {
        const t = reg('win32', section(WMP, '"IsInstalled"=dword:00000001'))
        return [regIs(t, DW(), 32), regIs(t, DW(), 64)]
      })()
    ),
    named(W, 'is false for different data, absent name, absent section', [
      regIs(
        reg('win64', section(WMP, '"IsInstalled"=dword:00000000')),
        DW(),
        64
      ),
      regIs(reg('win64', section(WMP, '"Other"=dword:00000001')), DW(), 64),
      regIs(
        reg(
          'win64',
          section('Software\\\\Else', '"IsInstalled"=dword:00000001')
        ),
        DW(),
        64
      )
    ]),
    named(W, 'compares key and name case-insensitively', [
      regIs(
        BOTH,
        {
          ...DW(),
          name: 'isinstalled',
          key: DW().key.replace('Software\\Microsoft', 'SOFTWARE\\Microsoft')
        },
        64
      )
    ]),
    named(
      W,
      'matches REG_SZ with escaped backslashes and rejects differences',
      (() => {
        const t = reg(
          'win64',
          section('Software\\\\Foo', '"Path"="C:\\\\Games\\\\x"')
        )
        return [
          regIs(t, SZ('C:\\Games\\x'), 64),
          regIs(t, SZ('C:\\Games\\y'), 64)
        ]
      })()
    ),
    named(
      W,
      'rejects a different stored type',
      ['"Path"=str(2):"C:\\\\x"', '"Path"=hex:01,00'].map((v) =>
        regIs(reg('win64', section('Software\\\\Foo', v)), SZ('C:\\x'), 64)
      )
    ),
    named(W, 'rejects other escapes and non-ASCII expected data', [
      ...['"Path"="a\\tb"', '"Path"="a\\x00e9"'].map((v) =>
        regIs(reg('win64', section('Software\\\\Foo', v)), SZ('a\tb'), 64)
      ),
      regIs(
        reg('win64', section('Software\\\\Foo', '"Path"="café"')),
        SZ('café'),
        64
      )
    ]),
    named(
      W,
      'is false without #arch, wrong first line, or a continuation line',
      (() => {
        const body = section(WMP, '"IsInstalled"=dword:00000001')
        return [
          regIs(reg(null, body), DW(), 64),
          regIs(reg('win64', body, 'WINE REGISTRY Version 3'), DW(), 64),
          regIs(
            reg(
              'win64',
              section(WMP, '"IsInstalled"=dword:00000001', '"X"=hex:01,\\')
            ),
            DW(),
            64
          )
        ]
      })()
    ),
    named(
      W,
      'handles HKCU view 64 and doubts HKCU view 32',
      (() => {
        const fix: FixInput = {
          key: 'HKCU\\Software\\Wine',
          name: 'Version',
          type: 'REG_SZ',
          data: 'win10',
          views: [32, 64]
        }
        const t = reg('win64', section('Software\\\\Wine', '"Version"="win10"'))
        return [regIs(t, fix, 64), regIs(t, fix, 32)]
      })()
    ),
    named(
      W,
      'doubts view 32 for non-Software, Wow6432Node and Classes keys',
      (() => {
        const t = reg(
          'win64',
          section('Software\\\\Wow6432Node\\\\Foo', '"Path"="x"') +
            section('Software\\\\Classes\\\\Foo', '"Path"="x"') +
            section('System\\\\Foo', '"Path"="x"')
        )
        return [
          'HKLM\\Software\\Wow6432Node\\Foo',
          'HKLM\\Software\\Classes\\Foo',
          'HKLM\\System\\Foo'
        ].map((key) => regIs(t, { ...SZ('x'), key }, 32))
      })()
    ),

    // ---- applyRegistryFixes skip and kill ----
    named(AK, 'spawns nothing and logs per view when both views are set', [
      apply([WMP_ENTRY], [], {
        prefix: '<HOME>/prefix-both',
        seed: prefixWith('both', `${EMPTY_REG}${sec(K64)}${sec(K32)}`)
      })
    ]),
    named(AK, 'runs only the missing view', [
      apply([WMP_ENTRY], ok(1), {
        prefix: '<HOME>/prefix-one',
        seed: prefixWith('one', `${EMPTY_REG}${sec(K64)}`)
      })
    ]),
    named(
      AK,
      'runs every view with no prefixDir or no system.reg, without warning',
      [
        apply([WMP_ENTRY], ok(2)),
        apply([WMP_ENTRY], ok(2), {
          prefix: '<HOME>/prefix-empty',
          seed: prefixWith('empty')
        })
      ]
    ),
    named(AK, 'SIGKILLs the captured child on timeout and warns killed', [
      apply([{ ...WMP_ENTRY, views: [64] }], [NEVER_KILLABLE])
    ]),
    named(AK, 'does not kill an already-exited child, or without onSpawn', [
      apply(
        [{ ...WMP_ENTRY, views: [64] }],
        [{ result: 'never', child: { pid: 4242, exitCode: 0 } }]
      ),
      apply([{ ...WMP_ENTRY, views: [64] }], [{ result: 'never' }])
    ]),
    named(AK, 'never kills after a successful run', [
      apply(
        [WMP_ENTRY],
        [
          { code: 0, child: { pid: 4242, exitCode: null } },
          { code: 0, child: { pid: 4242, exitCode: null } }
        ]
      )
    ]),
    named(AK, 'keeps the 15 s timeout', [{ op: 'timeout' }]),

    // ---- knownFixPrefixDir ----
    named(P, 'maps each wine type to its registry dir', [
      {
        op: 'prefixDir',
        settings: { winePrefix: '/x', wineVersion: { type: 'proton' } }
      },
      {
        op: 'prefixDir',
        settings: { winePrefix: '/x', wineVersion: { type: 'wine' } }
      },
      {
        op: 'prefixDir',
        settings: {
          wineCrossoverBottle: 'B',
          wineVersion: { type: 'crossover' }
        }
      }
    ]),
    named(P, 'is undefined when unknown', [
      { op: 'prefixDir', settings: { winePrefix: '/x' } },
      { op: 'prefixDir', settings: { wineVersion: { type: 'wine' } } },
      { op: 'prefixDir', settings: { wineVersion: { type: 'crossover' } } }
    ]),

    // ---- dllOverridesToRegistryFixes ----
    named(D, 'compiles dlls to REG_SZ AppDefaults entries, disabled as empty', [
      dll([
        {
          exe: 'Game.exe',
          dlls: { nvapi64: 'disabled', d3d9: 'native,builtin' }
        }
      ])
    ]),
    named(
      D,
      'writes mode %s verbatim',
      ['native', 'builtin', 'native,builtin', 'builtin,native'].map((mode) =>
        dll([{ exe: 'a.exe', dlls: { x: mode } }])
      )
    ),
    named(
      D,
      'skips bad mode %p with a warning',
      ['n', 'b', '', 'native, builtin', 3, null].map((mode) =>
        dll([{ exe: 'a.exe', dlls: { x: mode } }])
      )
    ),
    named(
      D,
      'skips the whole entry for bad exe %p',
      ['..\\x.exe', 'a/b.exe', 'Game', 'x"y.exe', undefined, 5].map((exe) =>
        dll([{ exe, dlls: { x: 'native' } }])
      )
    ),
    named(
      D,
      'skips only the bad dll name %p',
      ['d3d9.dll', 'a\\b', '', 'a'.repeat(65)].map((name) =>
        dll([{ exe: 'a.exe', dlls: { [name]: 'native', ok: 'builtin' } }])
      )
    ),
    named(D, 'skips entries with empty or non-object dlls', [
      dll([{ exe: 'a.exe', dlls: {} }, { exe: 'a.exe', dlls: [] }, 'x', null])
    ]),
    named(
      D,
      'warns and returns [] for non-array %p without throwing',
      [null, 5, 'x', { exe: 'a.exe' }, undefined].map((raw) => dll(raw))
    ),
    named(D, 'produces entries that pass validateRegistryFixes', [
      dll([{ exe: 'Game.exe', dlls: { nvapi64: 'disabled' } }], true)
    ]),

    // ---- knownFixProfileRegistryFixes ----
    named(F, 'is undefined with neither key', [
      { op: 'profileFixes', profile: { title: 't' } }
    ]),
    named(F, 'returns profile.registry itself when dllOverrides is absent', [
      { op: 'profileFixes', profile: { registry: [ENTRY] } },
      { op: 'profileFixes', profile: { registry: 'junk' } }
    ]),
    named(F, 'puts registry first, then dllOverrides', [
      {
        op: 'profileFixes',
        profile: {
          registry: [ENTRY],
          dllOverrides: [{ exe: 'a.exe', dlls: { x: 'native' } }]
        }
      }
    ]),
    named(F, 'warns once for a non-array registry and keeps the overrides', [
      {
        op: 'profileFixes',
        profile: {
          registry: 'junk',
          dllOverrides: [{ exe: 'a.exe', dlls: { x: 'native' } }]
        }
      }
    ]),

    // ---- applyKnownFixProfileRegistry (the run seam is scripted, as in the TS test) ----
    named(PA, 'applies a bundled -gog.profile.json to the game own prefix', [
      scripted([t2({ title: 't', registry: [ENTRY] })], { outcomes: ok(2) })
    ]),
    named(
      PA,
      'applies via the local layer for legendary (file suffix is epic)',
      [
        scripted(
          [
            profileIn(
              'local',
              { title: 't', registry: [ENTRY] },
              'GOGAPP',
              'legendary'
            )
          ],
          { outcomes: ok(2) },
          'GOGAPP',
          'legendary'
        )
      ]
    ),
    named(PA, 'ignores a profile that exists only in the remote fixes dir', [
      scripted([profileIn('remote', { title: 't', registry: [ENTRY] })])
    ]),
    named(PA, 'does nothing, silently, with no profile or no registry', [
      scripted([]),
      scripted([t2({ title: 't' })])
    ]),
    named(
      PA,
      'resolves and warns with the runner/app label when runWineCommand rejects',
      [
        scripted([t2({ title: 't', registry: [ENTRY] })], {
          otherwise: { result: 'reject', message: 'nope' }
        })
      ]
    ),
    named(PA, 'applies a dllOverrides-only profile as an AppDefaults reg add', [
      scripted(
        [
          t2({
            dllOverrides: [{ exe: 'Game.exe', dlls: { nvapi64: 'disabled' } }]
          })
        ],
        { outcomes: ok(1) }
      )
    ]),
    named(PA, 'runs registry entries before dllOverrides', [
      scripted(
        [
          t2({
            registry: [{ ...ENTRY, views: [64] }],
            dllOverrides: [{ exe: 'Game.exe', dlls: { nvapi64: 'native' } }]
          })
        ],
        { outcomes: ok(2) }
      )
    ]),
    named(PA, 'writes on every call, not only the first', [
      scripted([t2({ title: 't', registry: [ENTRY] })], { outcomes: ok(2) }),
      scripted([], { outcomes: ok(2) })
    ]),

    // ---- the Steam bridge's run seam (88-09 replays these as the bridge op's vectors) ----
    {
      id: 'bridge-both-views-run-in-the-bottle',
      platform: 'mac',
      steps: [
        apply([WMP_ENTRY], ok(2), {
          label: 'Steam 284100',
          logPrefix: 'Steam',
          seam: 'bridge',
          prefix: `${BOTTLES}/GameLibSteam`,
          seed: [
            {
              path: `${BOTTLES}/GameLibSteam/system.reg`,
              text: EMPTY_REG
            }
          ]
        })
      ]
    },
    {
      id: 'bridge-skips-a-view-already-set-in-the-bottle',
      platform: 'mac',
      steps: [
        apply([WMP_ENTRY, ENTRY], ok(3), {
          label: 'Steam 284100',
          logPrefix: 'Steam',
          seam: 'bridge',
          prefix: `${BOTTLES}/GameLibSteam`,
          seed: [
            {
              path: `${BOTTLES}/GameLibSteam/system.reg`,
              text: `${EMPTY_REG}${sec(K64)}`
            },
            { path: `${BOTTLES}/GameLibSteam/user.reg`, text: EMPTY_REG }
          ]
        })
      ]
    },
    {
      id: 'bridge-timeout-kills-the-reg-add',
      platform: 'mac',
      steps: [
        apply([{ ...WMP_ENTRY, views: [64] }], [NEVER_KILLABLE], {
          label: 'Steam 284100',
          logPrefix: 'Steam',
          seam: 'bridge',
          prefix: `${BOTTLES}/GameLibSteam`,
          seed: [
            {
              path: `${BOTTLES}/GameLibSteam/system.reg`,
              text: EMPTY_REG
            }
          ]
        })
      ]
    },

    // ---- the launcher path through the real command runner ----
    {
      id: 'launcher-path-crossover-skips-values-already-in-the-bottle',
      platform: 'mac',
      scripted: [{ program: CROSSOVER_BIN, code: 0, repeat: true }],
      steps: [
        {
          op: 'profileApply',
          appName: 'GOGAPP',
          runner: 'gog',
          settings: crossoverSettings(),
          seam: 'real',
          seed: [
            ...crossoverSeed,
            profileIn('bundled', {
              registry: [WMP_ENTRY],
              dllOverrides: [{ exe: 'Game.exe', dlls: { nvapi64: 'disabled' } }]
            }),
            {
              path: `${BOTTLES}/GameLibSteam/system.reg`,
              text: `${EMPTY_REG}${sec(K64)}${sec(K32)}`
            },
            { path: `${BOTTLES}/GameLibSteam/user.reg`, text: EMPTY_REG }
          ]
        }
      ]
    },
    {
      id: 'launcher-path-wine-prefix-registry',
      platform: 'linux',
      scripted: [
        { program: '<TOOLS>/wine/Wine-9/bin/wine', code: 0, repeat: true }
      ],
      steps: [
        {
          op: 'profileApply',
          appName: 'GOGAPP',
          runner: 'gog',
          settings: settingsOf({
            type: 'wine',
            name: 'Wine-9',
            bin: '<TOOLS>/wine/Wine-9/bin/wine',
            wineserver: '<TOOLS>/wine/Wine-9/bin/wineserver',
            lib: '<TOOLS>/wine/Wine-9/lib64',
            lib32: '<TOOLS>/wine/Wine-9/lib'
          }),
          seam: 'real',
          seed: [
            { path: '<TOOLS>/wine/Wine-9/bin/wine', text: '' },
            { path: '<TOOLS>/wine/Wine-9/bin/wineserver', text: '' },
            { path: '<HOME>/Games/prefix/dosdevices', dir: true },
            { path: '<HOME>/Games/prefix/drive_c', dir: true },
            { path: '<HOME>/Games/prefix/system.reg', text: EMPTY_REG },
            { path: '<HOME>/Games/prefix/user.reg', text: EMPTY_REG },
            { path: '<HOME>/Games/prefix/userdef.reg', text: '' },
            profileIn('bundled', { title: 't', registry: [ENTRY, WMP_ENTRY] })
          ]
        }
      ]
    },
    {
      id: 'launcher-path-proton-prefix-runs-in-pfx-with-the-verb',
      platform: 'linux',
      scripted: [
        {
          program: '<TOOLS>/proton/GE-Proton9-27/proton',
          code: 0,
          repeat: true
        }
      ],
      steps: [
        {
          op: 'profileApply',
          appName: 'GOGAPP',
          runner: 'gog',
          settings: settingsOf({
            type: 'proton',
            name: 'GE-Proton9-27',
            bin: '<TOOLS>/proton/GE-Proton9-27/proton'
          }),
          seam: 'real',
          seed: [
            { path: '<TOOLS>/proton/GE-Proton9-27/proton', text: '' },
            { path: '<HOME>/Games/prefix/pfx.lock', text: '' },
            { path: '<HOME>/Games/prefix/tracked_files', text: '' },
            { path: '<HOME>/Games/prefix/version', text: '' },
            { path: '<HOME>/Games/prefix/config_info', text: '' },
            { path: '<HOME>/Games/prefix/pfx/dosdevices', dir: true },
            { path: '<HOME>/Games/prefix/pfx/drive_c', dir: true },
            { path: '<HOME>/Games/prefix/pfx/system.reg', text: EMPTY_REG },
            { path: '<HOME>/Games/prefix/pfx/user.reg', text: EMPTY_REG },
            { path: '<HOME>/Games/prefix/pfx/userdef.reg', text: '' },
            profileIn('local', {
              dllOverrides: [
                { exe: 'Game.exe', dlls: { d3d9: 'native,builtin' } }
              ]
            })
          ]
        }
      ]
    },
    {
      id: 'launcher-path-reg-add-exiting-non-zero-is-a-warning',
      platform: 'mac',
      scripted: [{ program: CROSSOVER_BIN, code: 1, repeat: true }],
      steps: [
        {
          op: 'profileApply',
          appName: 'GOGAPP',
          runner: 'gog',
          settings: crossoverSettings(),
          seam: 'real',
          seed: [
            ...crossoverSeed,
            profileIn('bundled', {
              registry: [
                { ...ENTRY, views: [64] },
                { ...ENTRY, name: 'Baz', views: [64] }
              ]
            })
          ]
        }
      ]
    },

    // ---- shapes the TS tests leave out ----
    {
      id: 'validate-every-reject-reason',
      steps: [
        validate([
          'x',
          null,
          [],
          { ...ENTRY, key: 5 },
          { ...ENTRY, key: 'HKLM\\' },
          { ...ENTRY, key: 'HKLM\\Software\\' },
          { ...ENTRY, key: 'HKLM\\Software\\\\Foo' },
          { ...ENTRY, key: `HKCU\\${'a'.repeat(520)}` },
          { ...ENTRY, key: 'HKCU\\Soft"ware' },
          { ...ENTRY, key: 'HKCU\\Soft\nware' },
          { ...ENTRY, name: '' },
          { ...ENTRY, name: 'n'.repeat(257) },
          { ...ENTRY, name: 'a\nb' },
          { ...ENTRY, value: -1 },
          { ...ENTRY, value: 1.5 },
          { ...ENTRY, value: 4294967296 },
          { ...ENTRY, value: '1' },
          { ...ENTRY, type: 'REG_SZ', value: 'a'.repeat(1025) },
          { ...ENTRY, type: 'REG_SZ', value: 'a\rb' },
          { ...ENTRY, type: 'REG_SZ', value: 'a\u0000b' },
          { ...ENTRY, type: 'REG_SZ', value: 5 },
          { ...ENTRY, type: 'REG_BINARY' },
          { ...ENTRY, views: [] },
          { ...ENTRY, views: [16] },
          { ...ENTRY, views: 'x' }
        ]),
        validate([
          { ...ENTRY, key: 'HKEY_LOCAL_MACHINE\\Software\\A', views: [64, 32] },
          { ...ENTRY, key: 'HKEY_CURRENT_USER\\Software\\B', views: [64] },
          { ...ENTRY, type: 'REG_DWORD', value: 4294967295, views: [32, 32] },
          { ...ENTRY, type: 'REG_SZ', value: '', name: 'Empty' },
          { ...ENTRY, type: 'REG_SZ', value: 'a'.repeat(1024), name: 'Long' }
        ])
      ]
    },
    {
      id: 'command-parts-for-each-type-and-view',
      steps: [
        { op: 'commandParts', fix: GOOD_FIX(32), view: 32 },
        { op: 'commandParts', fix: GOOD_FIX(64), view: 64 },
        {
          op: 'commandParts',
          fix: {
            key: 'HKCU\\Software\\Foo',
            name: 'Path',
            type: 'REG_SZ',
            data: 'C:\\Games\\x y',
            views: [64]
          },
          view: 64
        }
      ]
    },
    {
      id: 'prefix-dir-toolkit-and-unknown-wine-types',
      steps: [
        {
          op: 'prefixDir',
          settings: { winePrefix: '/x', wineVersion: { type: 'toolkit' } }
        },
        {
          op: 'prefixDir',
          settings: { winePrefix: '/x', wineVersion: { type: 'portproton' } }
        },
        {
          op: 'prefixDir',
          settings: { winePrefix: '', wineVersion: { type: 'wine' } }
        },
        {
          op: 'prefixDir',
          settings: {
            wineCrossoverBottle: '',
            winePrefix: '/x',
            wineVersion: { type: 'crossover' }
          }
        }
      ]
    }
  ]
}
