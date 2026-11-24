/**
 * The known-fix reader oracle (88-05, D-11, D-14, D-25): the TS readers `readKnownFixes`,
 * `readKnownFixesWithLayer`, `readKnownFixProfile`, `readGamelibFixStatus`, `filterTier1KnownFixes`
 * and `isValidExeOverrideShape`, driven on a fresh fake HOME and recorded as the golden the Rust
 * reader (88-08) has to reproduce, and the TS twin kept for synchronous Steam callers is pinned to.
 * The golden exists before any Rust reader does.
 *
 * Slice `gamelib-knownfix/tests/fixtures/golden/reader/`:
 *   cases.json      built from `knownFixReader.cases.ts` (write mode rewrites it, compare mode checks it)
 *   deltas.json     hand-authored: the documented Rust-side differences (D-19)
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json   what each step answered
 *   expected/<case>/events.json   every `logWarning` / `logInfo` line, paths normalised
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * Isolation (D-12, D-13, D-22): every case runs on a fresh fake HOME with `withPinnedBaseEnv` and an
 * injected platform; nothing reads the real profile. The bundled layer is `<HOME>/public/fixes`, a
 * directory inside the fake HOME, so the Rust replay substitutes its own FakeHome. The logger is spied
 * on (`jest.spyOn`, not `jest.mock`), with the real writer never reached.
 *
 * The goldens are recorded on a POSIX host. Behaviour that looks wrong is kept as recorded and filed
 * as a todo (D-20); a fix is never mixed into a golden diff.
 */
import { rmSync, writeFileSync, mkdirSync } from 'fs'
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
  type EngineOracleProfile
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  injectPlatform,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import { uncoveredPairs } from 'backend/testUtils/launchOracle/pairwise'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import * as logger from 'backend/logger'
import {
  filterTier1KnownFixes,
  isRoutingOnlyTier1Fix,
  isValidExeOverrideShape,
  readGamelibFixStatus,
  readKnownFixes,
  readKnownFixesWithLayer,
  readKnownFixProfile,
  TIER1_KNOWN_FIX_KEYS
} from 'backend/knownFixes'
import type { KnowFixesInfo } from 'common/types'
import {
  PAIR_AXES,
  readerCases,
  type ReadCall,
  type ReaderCase,
  type Step
} from './knownFixReader.cases'

const CRATE = 'gamelib-knownfix'
const SLICE = 'reader'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const READER_FLOOR = 125

const mode = engineWineOracleMode()

/** The seven reader test files whose every title is a named case (D-14). */
const READER_STEMS = [
  'knownFixes',
  'knownFixesLayered',
  'knownFixesWithLayer',
  'knownFixesGamelibStatus',
  'knownFixesMacArch',
  'knownFixesDrm',
  'knownFixesOverlay'
] as const

/** One recorded log line. */
interface LogLine {
  step: number
  call: string
  level: 'info' | 'warning'
  text: string
}

/**
 * The parser's own message after "ignoring.\n" in the malformed-JSON warning differs between V8 and
 * serde_json (and between Node versions), so it is recorded as a token (`deltas.json`).
 */
const PARSER_MESSAGE = '<PARSER-MESSAGE>'
function neutraliseParserMessage(line: string): string {
  const marker = 'ignoring.\n'
  if (!line.startsWith('Known fixes could not be applied')) return line
  const at = line.indexOf(marker)
  return at === -1 ? line : line.slice(0, at + marker.length) + PARSER_MESSAGE
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

function runStep(
  step: Step,
  profile: EngineOracleProfile,
  deps: { paths: typeof profile.paths },
  setCall: (call: string) => void
): unknown {
  switch (step.op) {
    case 'read': {
      const appName = expandPlaceholders(step.appName, profile)
      const answers: Record<string, unknown> = {}
      const readers: Record<ReadCall, () => unknown> = {
        readKnownFixes: () => readKnownFixes(deps, appName, step.runner),
        readKnownFixesWithLayer: () =>
          readKnownFixesWithLayer(deps, appName, step.runner),
        readKnownFixProfile: () =>
          readKnownFixProfile(deps, appName, step.runner),
        readGamelibFixStatus: () =>
          readGamelibFixStatus(deps, appName, step.runner)
      }
      for (const call of step.calls) {
        setCall(call)
        answers[call] = readers[call]()
      }
      return {
        op: step.op,
        appName: step.appName,
        runner: step.runner,
        answers
      }
    }
    case 'filter':
      setCall('filterTier1KnownFixes')
      return {
        op: step.op,
        filtered: filterTier1KnownFixes(step.appName, step.layer, step.parsed)
      }
    case 'exeShape':
      return {
        op: step.op,
        answers: step.values.map((value) => isValidExeOverrideShape(value))
      }
    case 'routingOnly':
      return {
        op: step.op,
        routingOnly: isRoutingOnlyTier1Fix(step.fix as unknown as KnowFixesInfo)
      }
    case 'tier1Keys':
      return { op: step.op, keys: [...TIER1_KNOWN_FIX_KEYS] }
    case 'layerPaths':
      return {
        op: step.op,
        fixesPath: deps.paths.fixesPath,
        localFixesPath: deps.paths.localFixesPath,
        bundledFixesPath: deps.paths.bundledFixesPath
      }
  }
}

/** Runs one case on a fresh fake HOME and returns what it answered and logged, normalised. */
async function recordCase(
  c: ReaderCase
): Promise<{ result: unknown; events: LogLine[] }> {
  return withEngineOracleProfile(async (profile) => {
    const paths = {
      ...profile.paths,
      bundledFixesPath: join(profile.home, 'public', 'fixes')
    }
    const deps = { paths }
    const events: LogLine[] = []
    let step = 0
    let call = ''
    const record =
      (level: LogLine['level']) =>
      (message: unknown): void => {
        events.push({
          step,
          call,
          level,
          text: neutraliseParserMessage(String(message))
        })
      }
    const warn = jest.spyOn(logger, 'logWarning')
    warn.mockImplementation(record('warning'))
    const info = jest.spyOn(logger, 'logInfo')
    info.mockImplementation(record('info'))
    const restores = [
      injectPlatform('mac'),
      () => warn.mockRestore(),
      () => info.mockRestore()
    ]
    const steps: unknown[] = []
    await withInjected(restores, () =>
      withPinnedBaseEnv(profile.fake, () => {
        c.steps.forEach((s, index) => {
          step = index
          call = ''
          for (const path of s.remove ?? []) {
            rmSync(expandPlaceholders(path, profile), {
              recursive: true,
              force: true
            })
          }
          if (s.seed) seedProfile(profile, s.seed)
          steps.push(
            runStep(s, profile, deps, (name) => {
              call = name
            })
          )
        })
      })
    )
    return {
      result: normalisePaths({ steps }, profile),
      events: normalisePaths(events, profile)
    }
  })
}

describeSkipOnWindows('known-fix reader oracle (88-05)', () => {
  const built = readerCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
  }
  const cases = loadCases<ReaderCase>(CRATE, SLICE)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('the pairwise rows cover every legal pair of runner and layer states', () => {
    const rows = cases.flatMap((c) => (c.axes ? [c.axes] : []))
    expect(rows.length).toBeGreaterThanOrEqual(36)
    expect(uncoveredPairs(PAIR_AXES, rows)).toEqual([])
  })

  it.each(cases)('$id', async (c) => {
    const { result, events } = await recordCase(c)
    writeOrCompareGolden(CRATE, SLICE, c.id, { result, events })
  })

  describe('incident census (D-14)', () => {
    const TESTS = join(__dirname, '..')
    /** Titles that are not cases of this slice, each with the reason. None is a source-text gate. */
    const NOT_PORTED: Readonly<
      Record<string, Readonly<Record<string, string>>>
    > = {}
    const SEED_FILES = ['knownFixesCegSeeds', 'knownFixesMacArchSeeds'] as const
    const SEED_REASON =
      "a data check over the repo's public/fixes, ported as a Rust data test in 88-08"

    it.each(READER_STEMS)(
      'every title of %s.test.ts is a named case, one for one',
      (stem) => {
        const ids = cases
          .filter((c) => c.id.startsWith(`${stem}--`))
          .map((c) => c.id.slice(stem.length + 2))
        const titles = tsTestTitles(join(TESTS, `${stem}.test.ts`))
        assertCasesCoverTitles(ids, titles, NOT_PORTED[stem] ?? {})
        // No case without a title either: a typo in a case title would pass the line above only by luck.
        expect([...ids].sort()).toEqual(titles.map(slug).sort())
      }
    )

    it.each(SEED_FILES)(
      '%s.test.ts is listed as not ported, with the reason',
      (stem) => {
        const titles = tsTestTitles(join(TESTS, `${stem}.test.ts`))
        assertCasesCoverTitles(
          [],
          titles,
          Object.fromEntries(titles.map((t) => [t, SEED_REASON]))
        )
        expect(cases.some((c) => c.id.startsWith(`${stem}--`))).toBe(false)
      }
    )

    it('the seven reader files hold the 74 named cases', () => {
      expect(
        cases.filter((c) => READER_STEMS.some((s) => c.id.startsWith(`${s}--`)))
      ).toHaveLength(74)
    })
  })

  it('records that a remote-layer file carrying tier-2 keys yields no tier-2 data', async () => {
    const c = cases.find(
      (x) => x.id === 'remote-tier-2-keys-yield-no-tier-2-data'
    )
    if (!c) throw new Error('the remote tier-2 case is missing')
    const { result } = await recordCase(c)
    const step = (
      result as {
        steps: [{ answers: Record<ReadCall, unknown> }]
      }
    ).steps[0]
    expect(step.answers.readKnownFixes).toEqual({
      title: 'remote',
      winetricks: ['x']
    })
    expect(step.answers.readKnownFixProfile).toBeNull()
    expect(step.answers.readGamelibFixStatus).toBeNull()
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, cases.length)
    assertManifest(CRATE, SLICE, cases, READER_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, READER_FLOOR)
  })
})
