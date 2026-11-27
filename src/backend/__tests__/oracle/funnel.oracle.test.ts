/**
 * The launch funnel oracle (88.3-01, D-11, D-12, D-13, D-14, D-20, D-22, D-25): the TS launch funnel
 * (`runLaunchEventCallback` behind `launchEventCallback` in `src/backend/launcher.ts`), driven through the real
 * `createLauncher(deps).launchEventCallback(params)` over `createFakeLauncherDeps` and recorded as the golden the Rust
 * funnel over `ManagerHooks` (88.3-04, 88.3-05) has to reproduce. The golden exists before any Rust funnel does, and it
 * is recorded from the TS only: write mode exists in this file and nowhere else.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/funnel/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), an object keyed by delta name
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json   how each Play ended: `{ plays: [{ status } | { rejected }] }`
 *   expected/<case>/events.json   the ordered transcript (see `FunnelEvent` in testUtils/launchOracle/funnelTrace.ts):
 *                                 status pushes, bus emits, gamelib.log lines, per-game log frames, Rust requests with
 *                                 their replies, hook and script calls, store writes and host calls
 *   (requests.json, spawns.json and tree.json are the harness's fixed files; the funnel spawns nothing itself)
 *
 * Isolation (D-12, D-13, D-22): every case runs on a fresh fake HOME inside `withPinnedBaseEnv`, with an injected
 * platform and `isCLINoGui`, a `Date`-only fake clock pinned to 2026-01-01T00:00:00.000Z that moves by `sessionMs` inside
 * the scripted `launch`, and every recorded path normalised to a placeholder. Nothing reads the real profile and no child
 * is spawned. The logger is spied on, never mocked. Behaviour that looks wrong is kept as recorded and listed in the plan
 * SUMMARY under `D-20 candidates` (D-20); a fix is never mixed into a golden diff.
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
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  syncManifest,
  writeOrCompareGolden
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import {
  funnelScenario,
  recordFunnel,
  type FunnelEvent,
  type FunnelScenario
} from 'backend/testUtils/launchOracle/funnelTrace'

const CRATE = 'gamelib-launch'
const SLICE = 'funnel'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const FUNNEL_FLOOR = 1

const mode = engineWineOracleMode()

interface FunnelCase {
  id: string
  /** What the case pins; it only reads well in `cases.json`. */
  note?: string
  scenario: FunnelScenario
}

/** Tracer (88.3-01 Task 1): one native legendary launch, nothing else going on. */
function tracerCases(): FunnelCase[] {
  return [
    {
      id: 'funnel--native-legendary-plain',
      note: 'the end-to-end tracer: native legendary, no scripts, saves off, verbose logs on, engine step skips, launch resolves true',
      scenario: funnelScenario({})
    }
  ]
}

function funnelCases(): FunnelCase[] {
  return [...tracerCases()]
}

/** The documented Rust-side differences (D-19): delta name -> why the Rust funnel does not copy the TS here. */
const DELTAS: Record<string, string> = {
  'events-bus-emit':
    "The TS funnel emits every gameStatusUpdate twice: as a frontend message and on the backend event bus (sendGameStatusUpdate). Nothing outside tests listens: a grep of src and meta for on('gameStatusUpdate'/once(/addListener( at HEAD (88.3-01) finds one match, the engineWineResolvers test, and the only bus listeners in non-test code are 'releasesInfoReady', 'settingChanged' and the per-app 'progressUpdate-<app>' of installStallWatchdog. So the Rust funnel emits only the frontend message; the bus entries of the golden are recorded for completeness and the replay skips them."
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describeSkipOnWindows('launch funnel oracle (88.3-01)', () => {
  const built = funnelCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json(DELTAS))
  }
  const cases = loadCases<FunnelCase>(CRATE, SLICE)

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
    const recorded = await recordFunnel(c.scenario)
    writeOrCompareGolden(CRATE, SLICE, c.id, {
      result: recorded.result,
      events: recorded.events
    })
  })

  const byId = (id: string): FunnelCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`${id} is missing from cases.json`)
    return found
  }

  it('the tracer records the funnel in the order the TS made its calls', async () => {
    const { events, result } = await recordFunnel(
      byId('funnel--native-legendary-plain').scenario
    )
    expect(result).toEqual({ plays: [{ status: 'done' }] })
    const at = (match: (e: FunnelEvent) => boolean, label: string): number => {
      const index = events.findIndex(match)
      if (index === -1) throw new Error(`the tracer has no ${label}`)
      return index
    }
    const status = (wanted: string) => (e: FunnelEvent) =>
      e.kind === 'frontend' &&
      e.channel === 'gameStatusUpdate' &&
      (e.args[0] as { status: string }).status === wanted
    const order = [
      at(status('launching'), 'launching status'),
      at(
        (e) => e.kind === 'appState' && e.member === 'wakeLock.start',
        'display-sleep start'
      ),
      at(
        (e) => e.kind === 'rust' && e.channel === 'engine_launch_select',
        'engine_launch_select request'
      ),
      at((e) => e.kind === 'hook' && e.hook === 'launch', 'launch hook call'),
      at(
        (e) => e.kind === 'gameLog' && e.rotate,
        'per-game log entry that rotates'
      ),
      at(
        (e) => e.kind === 'tsStore' && e.key.endsWith('.lastPlayed'),
        'lastPlayed write'
      ),
      at(
        (e) => e.kind === 'rust' && e.channel === 'info_recent_add',
        'info_recent_add request'
      ),
      at(status('done'), 'done status')
    ]
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // The log rotates once: the first accepted per-game entry claims it, every later one carries false.
    const frames = events.filter((e) => e.kind === 'gameLog')
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.filter((e) => e.rotate)).toHaveLength(1)
    expect(frames[0]?.rotate).toBe(true)
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, cases.length)
    assertManifest(CRATE, SLICE, cases, FUNNEL_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, FUNNEL_FLOOR)
  })
})
