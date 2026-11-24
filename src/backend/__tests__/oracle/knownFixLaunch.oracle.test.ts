/**
 * The known-fix launch-override oracle (88-05, D-11, D-14, D-25): `resolveKnownFixExeOverride` and
 * `readKnownFixLaunchOverrides`, driven on seeded install trees inside a fresh fake HOME and recorded
 * as the golden the Rust launch overrides (88-09) have to reproduce. The golden exists before any
 * Rust for it does.
 *
 * Slice `gamelib-knownfix/tests/fixtures/golden/launch_overrides/`:
 *   cases.json      built in this file (write mode rewrites it, compare mode checks it)
 *   deltas.json     hand-authored: the documented Rust-side differences (D-19)
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json   what each step answered (resolved paths normalised)
 *   expected/<case>/events.json   every `logWarning` / `logInfo` line, paths normalised
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * Every case runs on a fresh fake HOME with `withPinnedBaseEnv` and an injected platform; the install
 * trees live under `<HOME>/games`. `readKnownFixLaunchOverrides` reads the real `readKnownFixes` over
 * seeded layer files (the TS test mocked it). The goldens are recorded on a POSIX host.
 *
 * Not recorded, on purpose: a wrong-case spelling of an existing file (`BIN/GAME.EXE` for
 * `bin/game.exe`). It is accepted on a case-insensitive volume (the default macOS one) and rejected on
 * a case-sensitive one, so no single golden could be right on every host. The mixed-case case holds a
 * tree whose file really is spelled `Data/Game.EXE` and asks for exactly that.
 */
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  seedProfile,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  injectPlatform,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import * as logger from 'backend/logger'
import {
  readKnownFixLaunchOverrides,
  resolveKnownFixExeOverride
} from 'backend/knownFixLaunch'
import type { Runner } from 'common/types'
import { fix } from './knownFixReader.cases'

const CRATE = 'gamelib-knownfix'
const SLICE = 'launch_overrides'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const LAUNCH_FLOOR = 19

const mode = engineWineOracleMode()

const BASE = '<HOME>/games'
const INSTALL = `${BASE}/install`
/** The tree every case starts from: the TS test's own `beforeEach` layout. */
const TREE: SeedEntry[] = [
  { path: `${INSTALL}/bin/game.exe`, text: 'x' },
  { path: `${BASE}/outside/real.exe`, text: 'x' },
  { path: `${BASE}/outside.exe`, text: 'x' }
]

type LaunchStep = (
  | {
      op: 'resolve'
      /** `null` is not used here: an empty string is the "no install path" input of the resolver. */
      installPath: string
      exeOverride: string
    }
  | {
      op: 'overrides'
      appName: string
      runner: Runner
      /** `null` is the TS `undefined`. */
      installPath: string | null
    }
) & { seed?: SeedEntry[]; remove?: string[] }

interface LaunchCase {
  id: string
  title?: string
  /** Extra entries seeded after `TREE`, before the first step. */
  tree?: SeedEntry[]
  steps: LaunchStep[]
}

const resolveStep = (
  exeOverride: string,
  installPath = INSTALL,
  extra: { seed?: SeedEntry[]; remove?: string[] } = {}
): LaunchStep => ({ op: 'resolve', installPath, exeOverride, ...extra })

const overridesStep = (
  installPath: string | null,
  seed: SeedEntry[],
  appName = 'a',
  runner: Runner = 'gog'
): LaunchStep => ({ op: 'overrides', appName, runner, installPath, seed })

const link = (path: string, symlink: string): SeedEntry => ({ path, symlink })

const R = 'resolveKnownFixExeOverride > '
const K = 'readKnownFixLaunchOverrides > '
const named = (title: string, steps: LaunchStep[], tree?: SeedEntry[]) =>
  ({
    id: `knownFixLaunch--${slug(title)}`,
    title,
    ...(tree ? { tree } : {}),
    steps
  }) satisfies LaunchCase

/** A tier-1 fix in the remote layer, which `readKnownFixes` reads when no local or bundled file exists. */
const remoteFix = (body: unknown): SeedEntry =>
  fix('remote', 'a', 'gog', 1, body)

function buildCases(): LaunchCase[] {
  return [
    named(`${R}accepts a relative file and returns the lexical path`, [
      resolveStep('bin/game.exe')
    ]),
    named(`${R}accepts the backslash form`, [resolveStep('bin\\game.exe')]),
    named(
      `${R}rejects %s`,
      ['/etc/passwd', '../outside.exe', 'bin/../../outside.exe'].map((o) =>
        resolveStep(o)
      )
    ),
    named(
      `${R}rejects a symlinked file escaping the install`,
      [resolveStep('link.exe')],
      [link(`${INSTALL}/link.exe`, `${BASE}/outside/real.exe`)]
    ),
    named(
      `${R}rejects a path through a symlinked dir escaping the install`,
      [resolveStep('linkdir/real.exe')],
      [link(`${INSTALL}/linkdir`, `${BASE}/outside`)]
    ),
    named(
      `${R}accepts a symlinked install root`,
      [resolveStep('bin/game.exe', `${BASE}/linked-install`)],
      [link(`${BASE}/linked-install`, INSTALL)]
    ),
    named(`${R}rejects a missing file, a directory and a missing install`, [
      resolveStep('bin/nope.exe'),
      resolveStep('bin'),
      resolveStep('bin/game.exe', `${BASE}/nope`)
    ]),
    named(`${K}returns empty overrides with no fix`, [
      overridesStep(INSTALL, [])
    ]),
    named(`${K}returns launchArgs and a resolved exeOverride`, [
      overridesStep(INSTALL, [
        remoteFix({
          title: 't',
          launchArgs: ['-x'],
          exeOverride: 'bin/game.exe'
        })
      ])
    ]),
    named(
      `${K}drops exeOverride with a warning when installPath is undefined`,
      [
        overridesStep(null, [
          remoteFix({
            title: 't',
            launchArgs: ['-x'],
            exeOverride: 'bin/game.exe'
          })
        ])
      ]
    ),
    // Cases with no test of their own: the shapes D-14 names that the TS tests leave out.
    {
      id: 'symlink-inside-the-install-is-accepted',
      steps: [resolveStep('linkin.exe')],
      tree: [link(`${INSTALL}/linkin.exe`, `${INSTALL}/bin/game.exe`)]
    },
    {
      id: 'mixed-case-path-with-the-exact-spelling',
      steps: [resolveStep('Data/Game.EXE'), resolveStep('Data\\Game.EXE')],
      tree: [{ path: `${INSTALL}/Data/Game.EXE`, text: 'x' }]
    },
    {
      id: 'directory-where-the-exe-is-named',
      steps: [resolveStep('launcher.exe')],
      tree: [{ path: `${INSTALL}/launcher.exe`, dir: true }]
    },
    {
      id: 'empty-and-nul-exe-override-fail-the-shape-check',
      steps: [resolveStep(''), resolveStep('a\u0000b')]
    },
    {
      id: 'empty-install-path-cannot-be-checked',
      steps: [resolveStep('bin/game.exe', '')]
    },
    {
      id: 'overrides-with-an-escaping-exe-override',
      steps: [
        overridesStep(INSTALL, [
          remoteFix({ title: 't', exeOverride: '../outside.exe' })
        ])
      ]
    },
    {
      id: 'overrides-launch-args-only-logs-no-exe',
      steps: [
        overridesStep(INSTALL, [
          remoteFix({ title: 't', launchArgs: ['-dx11', '--windowed'] })
        ])
      ]
    },
    {
      id: 'overrides-with-an-invalid-launch-args-value',
      steps: [
        overridesStep(INSTALL, [
          remoteFix({ title: 't', launchArgs: 'not-a-list' })
        ])
      ]
    },
    {
      id: 'overrides-launch-args-only-with-no-install-path',
      steps: [
        overridesStep(null, [remoteFix({ title: 't', launchArgs: ['-x'] })])
      ]
    }
  ]
}

interface LogLine {
  step: number
  level: 'info' | 'warning'
  text: string
}

/**
 * A macOS temp directory lives under `/var`, a link to `/private/var`, and an error that names a
 * partly resolved path prints `/private` in front of the root the profile was given, which
 * `normalisePaths` then leaves in front of the placeholder. No other host prints it.
 */
const dropRealpathPrefix = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value).split('/private<').join('<')) as T

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

async function recordCase(
  c: LaunchCase
): Promise<{ result: unknown; events: LogLine[] }> {
  return withEngineOracleProfile(
    async (profile) => {
      const deps = {
        paths: {
          ...profile.paths,
          bundledFixesPath: join(profile.home, 'public', 'fixes')
        }
      }
      const events: LogLine[] = []
      let step = 0
      const record =
        (level: LogLine['level']) =>
        (message: unknown): void => {
          events.push({ step, level, text: String(message) })
        }
      const warn = jest.spyOn(logger, 'logWarning')
      warn.mockImplementation(record('warning'))
      const info = jest.spyOn(logger, 'logInfo')
      info.mockImplementation(record('info'))
      const steps: unknown[] = []
      await withInjected(
        [
          injectPlatform('mac'),
          () => warn.mockRestore(),
          () => info.mockRestore()
        ],
        () =>
          withPinnedBaseEnv(profile.fake, () => {
            c.steps.forEach((s, index) => {
              step = index
              for (const path of s.remove ?? []) {
                rmSync(expandPlaceholders(path, profile), {
                  recursive: true,
                  force: true
                })
              }
              if (s.seed) seedProfile(profile, s.seed)
              if (s.op === 'resolve') {
                const resolved = resolveKnownFixExeOverride(
                  expandPlaceholders(s.installPath, profile),
                  s.exeOverride,
                  'L'
                )
                steps.push({
                  op: s.op,
                  installPath: s.installPath,
                  exeOverride: s.exeOverride,
                  resolved: resolved ?? null
                })
              } else {
                const got = readKnownFixLaunchOverrides(
                  deps,
                  s.appName,
                  s.runner,
                  s.installPath === null
                    ? undefined
                    : expandPlaceholders(s.installPath, profile)
                )
                steps.push({
                  op: s.op,
                  appName: s.appName,
                  runner: s.runner,
                  installPath: s.installPath,
                  overrides: {
                    launchArgs: got.launchArgs,
                    exeOverride: got.exeOverride ?? null
                  }
                })
              }
            })
          })
      )
      return {
        result: dropRealpathPrefix(normalisePaths({ steps }, profile)),
        events: dropRealpathPrefix(normalisePaths(events, profile))
      }
    },
    { seed: [...TREE, ...(c.tree ?? [])] }
  )
}

describeSkipOnWindows('known-fix launch-override oracle (88-05)', () => {
  const built = buildCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
  }
  const cases = loadCases<LaunchCase>(CRATE, SLICE)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it.each(cases)('$id', async (c) => {
    const { result, events } = await recordCase(c)
    writeOrCompareGolden(CRATE, SLICE, c.id, { result, events })
  })

  it('every title of knownFixLaunch.test.ts is a named case, one for one', () => {
    const ids = cases
      .filter((c) => c.id.startsWith('knownFixLaunch--'))
      .map((c) => c.id.slice('knownFixLaunch--'.length))
    const titles = tsTestTitles(join(__dirname, '..', 'knownFixLaunch.test.ts'))
    assertCasesCoverTitles(ids, titles, {})
    expect([...ids].sort()).toEqual(titles.map(slug).sort())
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, cases.length)
    assertManifest(CRATE, SLICE, cases, LAUNCH_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, LAUNCH_FLOOR)
  })
})
