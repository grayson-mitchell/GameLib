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
  type OraclePlatform
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import { createFakeLauncherDeps } from 'backend/testUtils/launchOracle/fakeLauncherDeps'
import {
  injectPlatform,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import * as logger from 'backend/logger'
import { createLauncher } from 'backend/launcher'
import type { Runner } from 'common/types'

const CRATE = 'gamelib-launch'
const SLICE = 'builders'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const BUILDERS_FLOOR = 5

const mode = engineWineOracleMode()

type Op = { op: 'wrapperEnvVars'; appName: string; appRunner: Runner }

interface BuilderCase {
  id: string
  /** The platform the case runs as; default `linux`. */
  platform?: OraclePlatform
  /** A note on what the case pins; recorded nowhere, it only reads well in `cases.json`. */
  note?: string
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

function builderCases(): BuilderCase[] {
  return [...wrapperEnvVarsCases()]
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

/** Runs the case's call and returns what it answered. A throw is the answer `{ error }`. */
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
  }
}

/** Runs one case on a fresh fake HOME and returns what it answered and logged, normalised. */
async function recordCase(
  c: BuilderCase
): Promise<{ result: unknown; events: LogLine[] }> {
  return withEngineOracleProfile(async (profile) => {
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
    const result = await withInjected(restores, () =>
      withPinnedBaseEnv(profile.fake, () => {
        try {
          return runCall(c.call, launcher)
        } catch (error) {
          return { error: (error as Error).message }
        }
      })
    )
    return {
      result: normalisePaths(result, profile),
      events: normalisePaths(events, profile)
    }
  })
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describeSkipOnWindows('launch builders oracle (88.1-01)', () => {
  const built = builderCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    const deltas = join(goldenDir(CRATE, SLICE), 'deltas.json')
    writeFileSync(deltas, json([]))
  }
  const cases = loadCases<BuilderCase>(CRATE, SLICE)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it.each(cases)('$id', async (c) => {
    const { result, events } = await recordCase(c)
    writeOrCompareGolden(CRATE, SLICE, c.id, { result, events })
  })

  it('records one answer per runner and no two runners answer alike', async () => {
    const answers = new Map<string, unknown>()
    for (const runner of RUNNERS) {
      const c = cases.find((x) => x.id === `wrapper-env-${runner}`)
      if (!c) throw new Error(`wrapper-env-${runner} is missing`)
      answers.set(runner, (await recordCase(c)).result)
    }
    expect(
      new Set([...answers.values()].map((v) => JSON.stringify(v))).size
    ).toBe(RUNNERS.length)
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, cases.length)
    assertManifest(CRATE, SLICE, cases, BUILDERS_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, BUILDERS_FLOOR)
  })
})
