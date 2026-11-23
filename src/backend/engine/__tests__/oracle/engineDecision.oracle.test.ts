/**
 * The engine-decision oracle (87-13, D-08, D-20): which engine a launch or a bottle creation runs
 * on, over CrossOver {healthy, missing, expired, broken, inconclusive} x pins {current, retired,
 * none} x the bottle's engine marker x the stored setting x offline x a busy or idle bottle,
 * recorded as goldens the Rust `gamelib-engine` decision slice later has to reproduce.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite golden/<slice>/cases.json and expected/
 *   (default)                        compare, offline
 *
 * Real in this slice: `decideLaunchEngine`, `decideCreationEngine`, `preflightCrossover`,
 * `isCrossoverMissing`, `listEngineOverrideOptions`, `resolveWineManagerStaging`, the real
 * `--demo-status` probe (`createProbeDemoStatus`, over the spawn tracer, so every probe's argv,
 * env and stdin is a recorded spawn) and the real pinned-engine paths (the engine runtime's
 * fallback). Scripted, and recorded in call order: the CrossOver bin dir (the real locator probes
 * `/Applications`, the operator's machine), `fileExists`, `isExecutable`, the build read, the
 * wineserver kill, the stored setting, the process monitor, the bottle ledger, the marker reader,
 * the pin-installed check and the Wine Manager release list. The `--demo-status` stdout is
 * scripted through the tracer, one step per probe attempt, the last step repeating.
 *
 * What a launch item records: the offline gate (the inputs `launchEngine` hands
 * `offlineLaunchCertainlyBlocked`, and its verdict), whether the launch proceeds or is refused
 * offline, the decision (`decideLaunchEngine` is always called, so the decision matrix is pinned
 * whether or not the gate would have refused first), every dependency call in order, and the log
 * lines. `restoreNeedsAbsentPin` is the engine switch's read of the marker and the disk, not this
 * slice's; it is derived here as "a non-CrossOver marker while the current pin is not installed"
 * (the engine switch's own goldens are 87-11's).
 *
 * D-20: nothing here ever expects the bottled-Steam engine; an assertion fails any recorded
 * decision that names it, and a second test scans the committed goldens for it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import * as gracefulFs from 'graceful-fs'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  goldenDir,
  mockPlatform,
  normalisePaths,
  pinClock,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile
} from 'backend/testUtils/engineWineOracle/harness'
import { oracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import {
  createSpawnTracer,
  type SpawnTracer
} from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import {
  captureLog,
  type LogLine
} from 'backend/testUtils/engineWineOracle/toolsOracleSupport'
import { createFakeBottleGateRust } from 'backend/testUtils/fakeBottleGateRust'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import * as logger from 'backend/logger'
import {
  createCrossoverLocator,
  crossoverBinDirFromWineBin
} from '../../crossoverLocation'
import { createProbeDemoStatus, parseDemoStatus } from '../../demoStatus'
import {
  CX_CREATE_CAP_MS,
  decideCreationEngine,
  decideLaunchEngine,
  isCrossoverMissing,
  listEngineOverrideOptions,
  preflightCrossover,
  resolveWineManagerStaging,
  type EngineDecisionDeps,
  type KillDeps,
  type ReleasesDeps,
  type RunnerDeps
} from '../../engineDecision'
import { createEngineRuntime } from '../../engineRuntime'
import { ENGINE_PINS, type EnginePin } from '../../enginePins'
import { parseEngineOverride } from '../../engineIds'
import { offlineLaunchCertainlyBlocked } from '../../offlineRefusal'
import type { RunTool } from '../../runTool'
import {
  dismissUntestedNotice,
  isTestedCrossover,
  readCrossoverBuild,
  shouldShowUntestedNotice,
  untestedCrossoverLogLine
} from '../../testedCrossoverVersions'
import { RETIRED_PIN_ID } from './fixtureBottles'

const CRATE = 'gamelib-engine'
const DECISION = 'decision'
const DEMO_STATUS = 'demo_status'
/** The decision case count this plan commits as a floor; a later edit may raise it, never lower it. */
const DECISION_FLOOR = 80
/** The demo-status case count this plan commits as a floor. */
const DEMO_FLOOR = 15

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

// ---------------------------------------------------------------------------------------------
// Scenario: one launch, creation or preflight, as data.
// ---------------------------------------------------------------------------------------------

type CxName = 'healthy' | 'missing' | 'expired' | 'broken' | 'inconclusive'
type PinsName = 'current' | 'retired' | 'none'
type MarkerName =
  | 'none'
  | 'crossover'
  | 'pinned'
  | 'wine-manager'
  | 'null-pin-id'
  | 'retired-pinned'
  | 'retired-pinned-absent'

/** One `--demo-status` attempt as the tracer answers it. The last step of a list repeats. */
interface ProbeStep {
  code?: number | null
  stdout?: string
  stderr?: string
  timedOut?: boolean
  truncated?: boolean
  throws?: string
}

interface CxSpec {
  bin: 'present' | 'absent' | 'wine-missing' | 'not-executable'
  /** The build the read returns; the string `throws` scripts a rejected read. */
  build: string | null
  probe: ProbeStep[]
}

interface Scenario {
  cx: CxName | CxSpec
  /** The stored engine setting `readOverride` answers; absent is no stored setting. */
  setting?: unknown
  offline: boolean
  bottle: 'idle' | 'busy'
  monitor: 'running' | 'starting' | null
  pins: PinsName
  marker: MarkerName
  releases: 'installed' | 'not-installed' | 'none'
  wmFiles: 'present' | 'absent'
  bottleName: unknown
  key: string
  killThrows: boolean
  resolverRejects: boolean
  markerReader: 'present' | 'absent'
  /** `preflight` op only. */
  killOnTimeout?: boolean
  withKey?: boolean
  /** `wm-staging` op only. */
  version?: string
}

const BUILD_TESTED = '26.3.0.39832'

const STEP_OK: ProbeStep = { code: 0, stdout: 'Standard version\n' }
const STEP_EXPIRED: ProbeStep = {
  code: 0,
  stdout: 'Demo version (expired 3 days ago)\n'
}
const STEP_NONZERO: ProbeStep = {
  code: 1,
  stdout: '',
  stderr: 'cxwine: bottle wrapper failed'
}
const STEP_TIMEOUT: ProbeStep = { code: null, timedOut: true }
const STEP_SPAWN_ERROR: ProbeStep = { throws: 'spawn ENOENT' }
const stepTrial = (days: number): ProbeStep => ({
  code: 0,
  stdout: `Demo version (${days} days remaining)\n`
})

const cxWith = (probe: ProbeStep[], extra: Partial<CxSpec> = {}): CxSpec => ({
  bin: 'present',
  build: BUILD_TESTED,
  probe,
  ...extra
})

const CX_PRESETS: Record<CxName, CxSpec> = {
  healthy: cxWith([STEP_OK]),
  missing: cxWith([], { bin: 'absent' }),
  expired: cxWith([STEP_EXPIRED]),
  broken: cxWith([STEP_NONZERO]),
  inconclusive: cxWith([STEP_TIMEOUT])
}

const DEFAULTS: Scenario = {
  cx: 'healthy',
  offline: false,
  bottle: 'idle',
  monitor: null,
  pins: 'current',
  marker: 'none',
  releases: 'installed',
  wmFiles: 'present',
  bottleName: 'GameLib-gog-1207658924',
  key: 'gog:1207658924',
  killThrows: false,
  resolverRejects: false,
  markerReader: 'present'
}

const WM_VERSION = 'Wine-Staging-10.5'
const WM_OTHER_VERSION = 'Wine-Staging-9.0'

type Op =
  | 'launch'
  | 'preflight'
  | 'creation'
  | 'options'
  | 'is-missing'
  | 'wm-staging'
  | 'locator'

interface DecisionCase {
  id: string
  op: Op
  note: string
  args: { base?: Partial<Scenario>; items: Record<string, unknown>[] }
}

interface Rep {
  repeat: { char: string; count: number }
}

/** A long input is stored as a generator so the case file stays small. */
function materialise<T>(value: T): T {
  if (Array.isArray(value)) return value.map(materialise) as T
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 1 && keys[0] === 'repeat') {
      const { char, count } = (value as unknown as Rep).repeat
      return char.repeat(count) as T
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, materialise(v)])
    ) as T
  }
  return value
}

const rep = (char: string, count: number): Rep => ({ repeat: { char, count } })

// ---------------------------------------------------------------------------------------------
// The case list: the cross product, then the named edge families.
// ---------------------------------------------------------------------------------------------

const CX_STATES: CxName[] = [
  'healthy',
  'missing',
  'expired',
  'broken',
  'inconclusive'
]
const SETTINGS: [string, unknown][] = [
  ['automatic', 'automatic'],
  ['crossover', 'crossover'],
  ['pin', `pinned:${ENGINE_PINS.current.id}`],
  ['wine-manager', `wine-manager:${WM_VERSION}`]
]
const PINS_STATES: PinsName[] = ['current', 'retired', 'none']
const MARKERS: MarkerName[] = [
  'none',
  'crossover',
  'pinned',
  'wine-manager',
  'null-pin-id'
]

type Item = Record<string, unknown>

/** A launch case records every item with offline no and yes (SVC-02): an item that names `offline` keeps it. */
function launchCase(
  id: string,
  note: string,
  base: Partial<Scenario>,
  items: Item[]
): DecisionCase {
  return {
    id,
    op: 'launch',
    note,
    args: {
      base,
      items: items.flatMap((item) =>
        'offline' in item
          ? [item]
          : [
              { ...item, offline: false },
              { ...item, offline: true }
            ]
      )
    }
  }
}

function matrixCases(): DecisionCase[] {
  const out: DecisionCase[] = []
  const items: Item[] = PINS_STATES.flatMap((pins) =>
    MARKERS.map((marker) => ({ pins, marker }))
  )
  for (const cx of CX_STATES) {
    for (const [settingName, setting] of SETTINGS) {
      for (const offline of [false, true]) {
        for (const bottle of ['idle', 'busy'] as const) {
          out.push({
            id: `launch-${cx}-${settingName}-${offline ? 'offline' : 'online'}-${bottle}`,
            op: 'launch',
            note: `CrossOver ${cx}, setting ${settingName}, ${offline ? 'offline' : 'online'}, ${bottle} bottle: the decision over every pin state and marker, with the offline gate's verdict`,
            args: { base: { cx, setting, offline, bottle }, items }
          })
        }
      }
    }
  }
  return out
}

function g29Cases(): DecisionCase[] {
  const autoBase = { setting: 'automatic' }
  const markers: Item[] = [
    { marker: 'none' },
    { marker: 'pinned' },
    { marker: 'wine-manager' }
  ]
  const idleAndBusy = (cx: CxSpec): Item[] =>
    (['idle', 'busy'] as const).flatMap((bottle) =>
      markers.map((m) => ({ ...m, cx, bottle }))
    )
  return [
    launchCase(
      'g29-nonzero-then-healthy',
      'G29: one nonzero exit is inconclusive; the second probe answers Standard, so CrossOver is healthy (the wineserver is stopped only on an idle bottle)',
      autoBase,
      idleAndBusy(cxWith([STEP_NONZERO, STEP_OK]))
    ),
    launchCase(
      'g29-timeout-then-healthy',
      'G29: one timeout is retried once after the wineserver is stopped; the second probe answers',
      autoBase,
      idleAndBusy(cxWith([STEP_TIMEOUT, STEP_OK]))
    ),
    launchCase(
      'g29-nonzero-then-expired',
      'G29: a nonzero exit then an expired trial is expired, not broken',
      autoBase,
      idleAndBusy(cxWith([STEP_NONZERO, STEP_EXPIRED]))
    ),
    launchCase(
      'g29-timeout-then-nonzero',
      'G29: two failures of different kinds still count as two consecutive attempts: broken',
      autoBase,
      idleAndBusy(cxWith([STEP_TIMEOUT, STEP_NONZERO]))
    ),
    launchCase(
      'g29-nonzero-then-timeout',
      'G29: a nonzero exit then a timeout is broken after two probes (a busy bottle skips the kill)',
      autoBase,
      idleAndBusy(cxWith([STEP_NONZERO, STEP_TIMEOUT]))
    ),
    launchCase(
      'g29-spawn-error-twice',
      'G29: a spawn error counts as inconclusive; twice in a row is broken',
      autoBase,
      idleAndBusy(cxWith([STEP_SPAWN_ERROR]))
    ),
    launchCase(
      'g29-spawn-error-then-healthy',
      'G29: a spawn error then a licensed answer is healthy',
      autoBase,
      idleAndBusy(cxWith([STEP_SPAWN_ERROR, STEP_OK]))
    ),
    launchCase(
      'g29-timeout-busy-or-running',
      'WR-07/WR-01: a timeout is never retried (and no wineserver is stopped) while another game is in the bottle or this title is running or starting: inconclusive',
      autoBase,
      (
        [
          { bottle: 'busy', monitor: null },
          { bottle: 'idle', monitor: 'running' },
          { bottle: 'idle', monitor: 'starting' },
          { bottle: 'busy', monitor: 'running' },
          { bottle: 'idle', monitor: null }
        ] as Item[]
      ).flatMap((state) =>
        markers.map((m) => ({ ...m, ...state, cx: cxWith([STEP_TIMEOUT]) }))
      )
    ),
    launchCase(
      'g29-nonzero-running-no-kill',
      'WR-07: two nonzero exits while a game runs: broken, and the wineserver is never stopped',
      autoBase,
      (
        [
          { bottle: 'busy', monitor: null },
          { bottle: 'idle', monitor: 'running' },
          { bottle: 'idle', monitor: null }
        ] as Item[]
      ).map((state) => ({ ...state, cx: cxWith([STEP_NONZERO]) }))
    ),
    launchCase(
      'g29-kill-throws',
      'the wineserver stop failing is logged and the retry still runs',
      { ...autoBase, killThrows: true },
      [
        { cx: cxWith([STEP_NONZERO, STEP_OK]) },
        { cx: cxWith([STEP_TIMEOUT, STEP_OK]) },
        { cx: cxWith([STEP_NONZERO]) },
        { cx: cxWith([STEP_TIMEOUT]) }
      ]
    ),
    launchCase(
      'g29-unrecognised-output',
      'stdout that is not a trial state (empty, noise, a singular day, a wrong case) is broken: output not recognised',
      autoBase,
      [
        { code: 0, stdout: '' },
        { code: 0, stdout: 'hello\n' },
        { code: 0, stdout: 'Demo version (1 day remaining)\n' },
        { code: 0, stdout: 'standard version\n' },
        { code: 0, stdout: 'Standard version trailing\n' }
      ].map((step) => ({ cx: cxWith([step]) }))
    ),
    launchCase(
      'g29-invalid-bottle-name',
      'a bottle name the engine layer refuses (over 255 characters, a slash, a parent path, a NUL, blank) is inconclusive without a spawn',
      autoBase,
      [
        rep('a', 256),
        rep('a', 255),
        'a/b',
        'a\\b',
        '..',
        'a\u0000b',
        '   ',
        ' padded'
      ].flatMap((bottleName) => [
        { bottleName, cx: cxWith([STEP_OK]), marker: 'none' },
        { bottleName, cx: cxWith([STEP_OK]), marker: 'pinned' }
      ])
    ),
    launchCase(
      'g29-trial-days',
      'a trial with days remaining is healthy and CrossOver is chosen',
      autoBase,
      [0, 1, 12, 365].map((n) => ({ cx: cxWith([stepTrial(n)]) }))
    ),
    launchCase(
      'cx-install-shapes',
      'CrossOver absent, bin/wine absent (missing) and bin/wine not executable (broken, no probe)',
      autoBase,
      (
        ['absent', 'wine-missing', 'not-executable', 'present'] as const
      ).flatMap(
        (bin) =>
          [
            { cx: cxWith([STEP_OK], { bin }), marker: 'none' },
            { cx: cxWith([STEP_OK], { bin }), marker: 'pinned' }
          ] as Item[]
      )
    ),
    launchCase(
      'cx-build-variants',
      'the CrossOver build the read returns: tested, untested, unreadable and a rejected read, with the untested log line',
      autoBase,
      [BUILD_TESTED, '26.4.0.40000', '25.0.0.1', null, 'throws'].map(
        (build) => ({ cx: cxWith([STEP_OK], { build }) })
      )
    )
  ]
}

function wr01Cases(): DecisionCase[] {
  const inconclusive = cxWith([STEP_TIMEOUT])
  const allMarkers: MarkerName[] = [
    'none',
    'crossover',
    'pinned',
    'wine-manager',
    'null-pin-id',
    'retired-pinned',
    'retired-pinned-absent'
  ]
  const items: Item[] = PINS_STATES.flatMap((pins) =>
    allMarkers.map((marker) => ({ pins, marker }))
  )
  const out: DecisionCase[] = []
  for (const [name, setting] of SETTINGS) {
    out.push(
      launchCase(
        `wr01-inconclusive-${name}`,
        `WR-01 (fixed, shipped): an inconclusive pre-flight keeps the bottle on the engine its marker records (reason cx-inconclusive, marker untouched, no toast) under setting ${name}`,
        { cx: inconclusive, setting, bottle: 'busy' },
        items
      )
    )
  }
  out.push(
    launchCase(
      'wr01-inconclusive-marker-not-resolvable',
      'WR-01: a recorded Wine Manager build that is not installed, has no files, or is not listed takes CrossOver and never pins.current',
      {
        cx: inconclusive,
        setting: 'automatic',
        bottle: 'busy',
        marker: 'wine-manager'
      },
      (['installed', 'not-installed', 'none'] as const).flatMap((releases) =>
        (['present', 'absent'] as const).map((wmFiles) => ({
          releases,
          wmFiles
        }))
      )
    ),
    launchCase(
      'wr01-inconclusive-no-marker-reader',
      'WR-01: a decision with no marker reader injected behaves as no marker',
      {
        cx: inconclusive,
        setting: 'automatic',
        bottle: 'busy',
        markerReader: 'absent'
      },
      PINS_STATES.map((pins) => ({ pins }))
    ),
    launchCase(
      'wr01-inconclusive-invalid-bottle',
      'an invalid bottle name is inconclusive too: the marker is kept the same way',
      {
        cx: cxWith([STEP_OK]),
        setting: 'automatic',
        bottleName: rep('a', 256)
      },
      allMarkers.map((marker) => ({ marker }))
    )
  )
  return out
}

function settingCases(): DecisionCase[] {
  const settingItems = (settings: unknown[]): Item[] =>
    settings.map((setting) => (setting === undefined ? {} : { setting }))
  return [
    launchCase(
      'setting-edge-values',
      'stored settings outside the grammar (absent, null, numbers, wrong case, empty ids, unknown ids, legacy labels) read as Automatic; a retired pin id with no previous pin is unavailable',
      { cx: 'healthy' },
      settingItems([
        undefined,
        null,
        5,
        true,
        'bogus',
        'Automatic',
        ' automatic',
        '',
        'pinned:',
        'pinned:x',
        'pinned:wine-staging-11.20 ',
        'wine-manager:',
        'wine-manager:a..b',
        'wine-manager:has space',
        'legacy:Odd Wine',
        'Legacy',
        { id: 'automatic' }
      ])
    ),
    launchCase(
      'setting-retired-pin',
      'a forced retired pin: unavailable while the table holds no previous pin, used (and downloaded when absent) when it is the previous pin',
      { cx: 'healthy', setting: `pinned:${RETIRED_PIN_ID}` },
      PINS_STATES.map((pins) => ({ pins }))
    ),
    launchCase(
      'setting-forced-pin-installed-state',
      'a forced current pin whether or not it is installed: needsDownload follows the disk, no CrossOver pre-flight runs',
      { cx: 'broken', setting: `pinned:${ENGINE_PINS.current.id}` },
      PINS_STATES.map((pins) => ({ pins }))
    ),
    launchCase(
      'setting-wine-manager-release-states',
      'a forced Wine Manager build over every release-list and file state, and the DXVK of the current pin when installed',
      { cx: 'healthy', setting: `wine-manager:${WM_VERSION}` },
      (['installed', 'not-installed', 'none'] as const).flatMap((releases) =>
        (['present', 'absent'] as const).flatMap((wmFiles) =>
          PINS_STATES.map((pins) => ({ releases, wmFiles, pins }))
        )
      )
    ),
    launchCase(
      'setting-wine-manager-other-builds',
      'a forced Wine Manager build that is listed but not installed, an unlisted one, and a DXMT one',
      { cx: 'healthy' },
      [
        `wine-manager:${WM_OTHER_VERSION}`,
        `wine-manager:${WM_VERSION}-DXMT`,
        'wine-manager:Unlisted-1.0'
      ].map((setting) => ({ setting }))
    )
  ]
}

function otherOpCases(): DecisionCase[] {
  const bins = ['present', 'absent', 'wine-missing', 'not-executable'] as const
  const out: DecisionCase[] = []
  out.push(
    {
      id: 'preflight-states',
      op: 'preflight',
      note: 'preflightCrossover directly for each CrossOver state, without and with a key',
      args: {
        items: CX_STATES.flatMap((cx) =>
          [false, true].map((withKey) => ({ cx, withKey }))
        )
      }
    },
    {
      id: 'preflight-page-read',
      op: 'preflight',
      note: 'a display read (killOnTimeout false) never retries a timeout and never stops a wineserver, whatever the bottle does',
      args: {
        base: { cx: cxWith([STEP_TIMEOUT]), withKey: true },
        items: (['idle', 'busy'] as const).flatMap((bottle) =>
          [false, true].map((killOnTimeout) => ({ bottle, killOnTimeout }))
        )
      }
    },
    {
      id: 'preflight-no-key',
      op: 'preflight',
      note: 'without a key the game-running guard cannot apply: a timeout is retried even on a busy bottle',
      args: {
        base: { withKey: false },
        items: [
          { cx: cxWith([STEP_TIMEOUT]), bottle: 'busy' },
          { cx: cxWith([STEP_TIMEOUT, STEP_OK]), bottle: 'busy' },
          { cx: cxWith([STEP_NONZERO, STEP_OK]), bottle: 'busy' }
        ]
      }
    }
  )
  out.push({
    id: 'creation-engine',
    op: 'creation',
    note: 'decideCreationEngine is a presence check only (59-REVIEW WR-02/WR-03): CrossOver with the 120 s create cap, or the current pin with the reason; the build read is best effort',
    args: {
      items: bins.flatMap((bin) =>
        [BUILD_TESTED, null, 'throws'].map((build) => ({
          cx: cxWith([], { bin, build })
        }))
      )
    }
  })
  for (const pins of PINS_STATES) {
    out.push({
      id: `creation-pins-${pins}`,
      op: 'creation',
      note: `the creation decision with the pin table in state ${pins}`,
      args: {
        base: { pins },
        items: [
          { cx: 'healthy' },
          { cx: 'missing' },
          { cx: cxWith([], { bin: 'not-executable' }) },
          { cx: 'healthy', resolverRejects: true }
        ]
      }
    })
  }
  for (const pins of PINS_STATES) {
    out.push({
      id: `options-pins-${pins}`,
      op: 'options',
      note: `the engine option list with the pin table in state ${pins}, over CrossOver present or absent and every Wine Manager release state`,
      args: {
        base: { pins },
        items: bins.flatMap((bin) =>
          (['installed', 'not-installed', 'none'] as const).map((releases) => ({
            cx: cxWith([], { bin }),
            releases
          }))
        )
      }
    })
  }
  out.push(
    {
      id: 'is-missing',
      op: 'is-missing',
      note: 'G25: CrossOver missing without a probe; an error is unknown and never a refusal',
      args: {
        items: [
          ...bins.map((bin) => ({ cx: cxWith([], { bin }) })),
          { cx: 'healthy', resolverRejects: true }
        ]
      }
    },
    {
      id: 'wm-staging-resolution',
      op: 'wm-staging',
      note: 'resolveWineManagerStaging: an installed build resolves inside the Wine Manager root; DXMT, unlisted, not-installed and file-less builds do not',
      args: {
        items: [
          WM_VERSION,
          WM_OTHER_VERSION,
          `${WM_VERSION}-DXMT`,
          'Unlisted-1.0',
          '',
          '../escape'
        ].flatMap((version) =>
          (['installed', 'not-installed', 'none'] as const).flatMap(
            (releases) =>
              (['present', 'absent'] as const).map((wmFiles) => ({
                version,
                releases,
                wmFiles
              }))
          )
        )
      }
    }
  )
  return out
}

/** The CrossOver locator: only the paths the case seeds, so the operator's `/Applications` is never read. */
function locatorCases(): DecisionCase[] {
  const cxBin = (root: string): string =>
    `${root}/CrossOver.app/Contents/SharedSupport/CrossOver/bin`
  const mk = (id: string, note: string, items: Item[]): DecisionCase => ({
    id,
    op: 'locator',
    note,
    args: { items }
  })
  return [
    mk(
      'locator-hint-wine-bins',
      'resolveCrossoverBinDir with hintWineBins: the first hint that names a CrossOver bin with a cxbottle wins, in order; a hint with another shape or no cxbottle is skipped',
      [
        {
          seedBins: [cxBin('<HOME>/Elsewhere')],
          hintWineBins: [`${cxBin('<HOME>/Elsewhere')}/wine`]
        },
        {
          seedBins: [cxBin('<HOME>/First'), cxBin('<HOME>/Second')],
          hintWineBins: [
            `${cxBin('<HOME>/Second')}/wine`,
            `${cxBin('<HOME>/First')}/wine`
          ]
        },
        {
          seedBins: [cxBin('<HOME>/Second')],
          hintWineBins: [
            `${cxBin('<HOME>/First')}/wine`,
            `${cxBin('<HOME>/Second')}/wine`
          ]
        },
        {
          seedBins: [cxBin('<HOME>/Elsewhere')],
          hintWineBins: ['<HOME>/not-a-crossover/bin/wine', 'wine']
        },
        { seedBins: [], hintWineBins: [`${cxBin('<HOME>/Absent')}/wine`] }
      ]
    ),
    mk(
      'locator-wine-version',
      'resolveCrossoverBinDir with a crossover wineVersion: its bin is tried before the hints; another type is ignored',
      [
        {
          seedBins: [cxBin('<HOME>/Elsewhere')],
          wineVersion: {
            type: 'crossover',
            bin: `${cxBin('<HOME>/Elsewhere')}/wine`
          }
        },
        {
          seedBins: [cxBin('<HOME>/Elsewhere')],
          wineVersion: {
            type: 'wine',
            bin: `${cxBin('<HOME>/Elsewhere')}/wine`
          }
        },
        {
          seedBins: [cxBin('<HOME>/First'), cxBin('<HOME>/Second')],
          wineVersion: {
            type: 'crossover',
            bin: `${cxBin('<HOME>/First')}/wine`
          },
          hintWineBins: [`${cxBin('<HOME>/Second')}/wine`]
        }
      ]
    ),
    mk(
      'locator-default-locations',
      "with no hint the locator probes /Applications then ~/Applications; the operator's /Applications is replaced by a scripted answer",
      [
        { applications: [] },
        { applications: [cxBin('/Applications')] },
        {
          applications: [cxBin('/Applications')],
          seedBins: [cxBin('<HOME>/Applications')]
        },
        { applications: [], seedBins: [cxBin('<HOME>/Applications')] },
        {
          applications: [],
          seedBins: [cxBin('<HOME>/Applications')],
          hintWineBins: [`${cxBin('<HOME>/Elsewhere')}/wine`]
        }
      ]
    )
  ]
}

function buildDecisionCases(): DecisionCase[] {
  return [
    ...matrixCases(),
    ...g29Cases(),
    ...wr01Cases(),
    ...settingCases(),
    ...otherOpCases(),
    ...locatorCases()
  ]
}

// ---------------------------------------------------------------------------------------------
// Building the dependencies of one scenario.
// ---------------------------------------------------------------------------------------------

const RETIRED: EnginePin = {
  ...ENGINE_PINS.current,
  id: RETIRED_PIN_ID,
  label: 'Wine-Staging 11.1 + DXVK-macOS 1.10.3 (built-in)',
  wine: {
    ...ENGINE_PINS.current.wine,
    version: '11.1',
    archiveName: 'wine-staging-11.1-osx64.tar.xz'
  }
}

type EngineRuntime = RunnerDeps['engineRuntime']
type FullDeps = Partial<EngineDecisionDeps> &
  KillDeps &
  ReleasesDeps &
  RunnerDeps

interface Built {
  deps: FullDeps
  calls: string[]
  tracer: SpawnTracer
  sc: Scenario
  binDir: string
  installed: ReadonlySet<string>
}

function makeRuntime(profile: EngineOracleProfile): EngineRuntime {
  const gate = createFakeBottleGateRust()
  return createEngineRuntime({
    clock: {} as never,
    paths: { userHome: profile.home, toolsPath: profile.toolsPath },
    aborts: {
      create: () => ({}) as never,
      delete: () => undefined
    } as never,
    requestRustInvoke: gate.requestRustInvoke
  })
}

function resolveScenario(
  base: Partial<Scenario> | undefined,
  item: Item
): Scenario {
  return materialise({ ...DEFAULTS, ...base, ...item }) as Scenario
}

function buildDeps(
  profile: EngineOracleProfile,
  runtime: EngineRuntime,
  sc: Scenario
): Built {
  const cx: CxSpec = typeof sc.cx === 'string' ? CX_PRESETS[sc.cx] : sc.cx
  const calls: string[] = []
  const binDir = join(
    profile.home,
    'Applications',
    'CrossOver.app',
    'Contents',
    'SharedSupport',
    'CrossOver',
    'bin'
  )
  const wineManagerRoot = join(profile.toolsPath, 'wine')
  const wmDir = (version: string): string =>
    join(wineManagerRoot, version, 'Contents', 'Resources', 'wine', 'bin')
  const table: { current: EnginePin; previous: EnginePin | null } = {
    current: ENGINE_PINS.current,
    previous: sc.pins === 'retired' ? RETIRED : null
  }
  const installedIds = new Set<string>(
    sc.pins === 'current'
      ? [ENGINE_PINS.current.id]
      : sc.pins === 'retired'
        ? [RETIRED.id]
        : []
  )
  const paths = (pin: EnginePin) => runtime.fallback.pinnedEnginePaths(pin)

  const existing = new Set<string>()
  if (cx.bin === 'present' || cx.bin === 'not-executable') {
    existing.add(join(binDir, 'wine'))
  }
  if (sc.releases === 'installed' && sc.wmFiles === 'present') {
    existing.add(join(wmDir(WM_VERSION), 'wine'))
    existing.add(join(wmDir(WM_VERSION), 'wineserver'))
  }
  if (sc.marker === 'retired-pinned') {
    existing.add(paths(RETIRED).wineserverBin)
    existing.add(paths(RETIRED).wineBin)
  }

  const releases = (): ReturnType<
    EngineDecisionDeps['wineManagerReleases']
  > => {
    if (sc.releases === 'none') return []
    return [
      {
        version: WM_VERSION,
        type: 'Wine-Staging-macOS',
        isInstalled: sc.releases === 'installed',
        installDir: join(wineManagerRoot, WM_VERSION)
      },
      {
        version: WM_OTHER_VERSION,
        type: 'Wine-Staging-macOS',
        isInstalled: false,
        installDir: join(wineManagerRoot, WM_OTHER_VERSION)
      }
    ] as ReturnType<EngineDecisionDeps['wineManagerReleases']>
  }

  const markerSummary = (): ReturnType<
    NonNullable<EngineDecisionDeps['markerSummary']>
  > => {
    switch (sc.marker) {
      case 'none':
        return null
      case 'crossover':
        return {
          kind: 'crossover',
          pinId: null,
          wineManagerVersion: null,
          pinWineserverBin: null
        }
      case 'pinned':
        return {
          kind: 'non-crossover',
          pinId: ENGINE_PINS.current.id,
          wineManagerVersion: null,
          pinWineserverBin: paths(ENGINE_PINS.current).wineserverBin
        }
      case 'wine-manager':
        return {
          kind: 'non-crossover',
          pinId: null,
          wineManagerVersion: WM_VERSION,
          pinWineserverBin: null
        }
      case 'null-pin-id':
        return {
          kind: 'non-crossover',
          pinId: null,
          wineManagerVersion: null,
          pinWineserverBin: null
        }
      case 'retired-pinned':
      case 'retired-pinned-absent':
        return {
          kind: 'non-crossover',
          pinId: RETIRED.id,
          wineManagerVersion: null,
          pinWineserverBin: paths(RETIRED).wineserverBin
        }
    }
  }

  const env = profile.fake.childEnv({})
  const wine = join(binDir, 'wine')
  const tracer = createSpawnTracer({
    baseEnv: env,
    scripted: cx.probe.map((step, i) => ({
      program: wine,
      argv: ['--demo-status'],
      code: step.code,
      stdout: step.stdout,
      stderr: step.stderr,
      timedOut: step.timedOut,
      truncated: step.truncated,
      throws: step.throws,
      repeat: i === cx.probe.length - 1
    }))
  })
  const realProbe = createProbeDemoStatus({ runner: tracer.runner })

  const deps: FullDeps = {
    runner: tracer.runner,
    paths: {
      userHome: profile.home,
      toolsPath: profile.toolsPath,
      gamesConfigPath: profile.paths.gamesConfigPath
    },
    engineRuntime: runtime,
    resolveCrossoverBinDir: () => {
      calls.push('resolveCrossoverBinDir')
      if (sc.resolverRejects)
        return Promise.reject(new Error('resolver failed'))
      return Promise.resolve(cx.bin === 'absent' ? undefined : binDir)
    },
    fileExists: (path) => {
      calls.push(`fileExists ${path}`)
      return existing.has(path)
    },
    isExecutable: (path) => {
      calls.push(`isExecutable ${path}`)
      return cx.bin !== 'not-executable'
    },
    probe: (args) => {
      calls.push(
        `probe ${String(args.bottleName).slice(0, 64)} timeoutMs=${String(args.timeoutMs)}`
      )
      return realProbe(args)
    },
    probeEnv: env,
    retrySettleMs: 0,
    readBuild: (dir) => {
      calls.push(`readBuild ${dir}`)
      return cx.build === 'throws'
        ? Promise.reject(new Error('plutil failed'))
        : Promise.resolve(cx.build)
    },
    killCrossoverWineserver: (name, dir) => {
      calls.push(`killCrossoverWineserver ${String(name).slice(0, 64)} ${dir}`)
      return sc.killThrows
        ? Promise.reject(new Error('kill failed'))
        : Promise.resolve(undefined)
    },
    readOverride: (key) => {
      calls.push(`readOverride ${key}`)
      return sc.setting
    },
    monitorPhase: (key) => {
      calls.push(`monitorPhase ${key}`)
      return sc.monitor
    },
    bottleBusy: (name, key) => {
      calls.push(`bottleBusy ${String(name).slice(0, 64)} ${key}`)
      return sc.bottle === 'busy'
    },
    wineManagerReleases: () => {
      calls.push('wineManagerReleases')
      return releases()
    },
    isPinInstalled: (pin) => {
      calls.push(`isPinInstalled ${pin.id}`)
      return installedIds.has(pin.id)
    },
    pinPaths: (pin) => {
      calls.push(`pinPaths ${pin.id}`)
      return paths(pin)
    },
    pins: table,
    wineManagerRoot
  }
  if (sc.markerReader === 'present') {
    deps.markerSummary = (name) => {
      calls.push(`markerSummary ${String(name).slice(0, 64)}`)
      return markerSummary()
    }
  }
  return { deps, calls, tracer, sc, binDir, installed: installedIds }
}

// ---------------------------------------------------------------------------------------------
// D-20: no recorded decision selects bottled Steam.
// ---------------------------------------------------------------------------------------------

const SELECTION_KINDS = new Set(['crossover', 'pinned', 'wine-manager'])
const DECISION_KINDS = new Set(['use', 'unavailable'])
const BOTTLED_STEAM = /bottled[\s_-]?steam/i

/** Throws when a launch decision selects an engine outside the three D-20 allows, or names bottled Steam. */
function assertNoBottledSteam(decision: unknown): void {
  const d = decision as {
    kind?: string
    selection?: { kind?: string }
  }
  if (!DECISION_KINDS.has(String(d.kind))) {
    throw new Error(`decision kind outside the allowed set: ${String(d.kind)}`)
  }
  if (d.kind === 'use' && !SELECTION_KINDS.has(String(d.selection?.kind))) {
    throw new Error(
      `selection kind outside the allowed set: ${String(d.selection?.kind)}`
    )
  }
  if (BOTTLED_STEAM.test(JSON.stringify(decision))) {
    throw new Error('a decision names the bottled-Steam engine (D-20)')
  }
}

// ---------------------------------------------------------------------------------------------
// Running one case.
// ---------------------------------------------------------------------------------------------

/** The result of one item: a thrown error is recorded by its name, never by message. */
async function attempt(fn: () => unknown): Promise<unknown> {
  try {
    const value = await fn()
    return value === undefined ? { returned: 'undefined' } : value
  } catch (error) {
    return {
      threw: error instanceof Error ? error.constructor.name : 'unknown'
    }
  }
}

const markerKindOf = (
  marker: MarkerName
): 'crossover' | 'non-crossover' | null =>
  marker === 'none'
    ? null
    : marker === 'crossover'
      ? 'crossover'
      : 'non-crossover'

interface ItemOutcome {
  result: unknown
  spawns: unknown[]
}

async function runItem(
  op: Op,
  profile: EngineOracleProfile,
  runtime: EngineRuntime,
  sc: Scenario,
  item: Item,
  sink: { logs: LogLine[] }
): Promise<ItemOutcome> {
  const built = buildDeps(profile, runtime, sc)
  const { deps, calls } = built
  sink.logs = []
  const fresh = (from: number): string => calls.slice(from).join(' > ')
  let result: unknown
  switch (op) {
    case 'launch': {
      result = await attempt(async () => {
        const override = parseEngineOverride(sc.setting)
        const crossoverMissing = await isCrossoverMissing(deps)
        const gateInput = {
          offline: sc.offline,
          override,
          crossoverMissing,
          markerKind: markerKindOf(sc.marker),
          currentPinInstalled: built.installed.has(ENGINE_PINS.current.id),
          restoreNeedsAbsentPin:
            markerKindOf(sc.marker) === 'non-crossover' &&
            !built.installed.has(ENGINE_PINS.current.id)
        }
        const verdict = offlineLaunchCertainlyBlocked(gateInput)
        const gateCalls = fresh(0)
        const mark = calls.length
        const decision = await decideLaunchEngine(
          { key: sc.key, bottleName: sc.bottleName as string },
          deps
        )
        assertNoBottledSteam(decision)
        return {
          input: item,
          gate: { input: gateInput, verdict, calls: gateCalls },
          launch: verdict.blocked
            ? `refused-offline:${verdict.arm}`
            : 'proceeds',
          decision,
          calls: fresh(mark)
        }
      })
      break
    }
    case 'preflight': {
      result = await attempt(async () => {
        const preflight = await preflightCrossover(
          sc.bottleName as string,
          deps,
          {
            ...(sc.killOnTimeout === undefined
              ? {}
              : { killOnTimeout: sc.killOnTimeout }),
            ...(sc.withKey === false ? {} : { key: sc.key })
          }
        )
        return { input: item, preflight, calls: fresh(0) }
      })
      break
    }
    case 'creation': {
      result = await attempt(async () => {
        const decision = await decideCreationEngine({ key: sc.key }, deps)
        return {
          input: item,
          decision,
          createCapMs: CX_CREATE_CAP_MS,
          calls: fresh(0)
        }
      })
      break
    }
    case 'options': {
      result = await attempt(async () => ({
        input: item,
        options: await listEngineOverrideOptions(deps),
        calls: fresh(0)
      }))
      break
    }
    case 'is-missing': {
      result = await attempt(async () => ({
        input: item,
        missing: await isCrossoverMissing(deps),
        calls: fresh(0)
      }))
      break
    }
    case 'wm-staging': {
      result = await attempt(() => ({
        input: item,
        engine: resolveWineManagerStaging(sc.version as string, deps),
        calls: fresh(0)
      }))
      break
    }
    case 'locator':
      throw new Error('the locator op is run by runLocatorItem')
  }
  return {
    result: {
      ...(result as Record<string, unknown>),
      logs: sink.logs.map((l) => `${l.level} ${l.message}`)
    },
    spawns: [...built.tracer.records]
  }
}

interface LocatorItem {
  seedBins?: string[]
  hintWineBins?: string[]
  wineVersion?: { type: string; bin: string }
  /** Scripted answers for paths under /Applications: the operator's own are never read. */
  applications?: string[]
}

function runLocatorItem(
  profile: EngineOracleProfile,
  item: LocatorItem,
  realExists: (path: string) => boolean
): unknown {
  const P = (text: string): string => expandPlaceholders(text, profile)
  for (const bin of item.seedBins ?? []) {
    const dir = P(bin)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'cxbottle'), '')
  }
  const scripted = new Set(
    (item.applications ?? []).map((p) => `${p}/cxbottle`)
  )
  const spy = jest
    .spyOn(gracefulFs, 'existsSync')
    .mockImplementation((path) =>
      String(path).startsWith('/Applications/')
        ? scripted.has(String(path))
        : realExists(String(path))
    )
  try {
    const locator = createCrossoverLocator({
      paths: { userHome: profile.home }
    })
    const found = locator.resolveCrossoverBinDir({
      wineVersion: item.wineVersion
        ? { ...item.wineVersion, bin: P(item.wineVersion.bin) }
        : undefined,
      hintWineBins: item.hintWineBins?.map(P)
    } as never)
    return { input: item, binDir: found ?? null }
  } finally {
    spy.mockRestore()
  }
}

describeSkipOnWindows('engine decision oracle (87-13)', () => {
  const cases = buildDecisionCases()
  const spies: jest.SpyInstance[] = []
  const restorers: (() => void)[] = []
  const sink: { logs: LogLine[] } = { logs: [] }
  const realExists = existsSync

  beforeEach(() => {
    for (const [name, level] of [
      ['logDebug', 'DEBUG'],
      ['logInfo', 'INFO'],
      ['logWarning', 'WARNING'],
      ['logError', 'ERROR']
    ] as const) {
      spies.push(
        jest
          .spyOn(logger, name)
          .mockImplementation((message: unknown, options?: unknown) => {
            captureLog(sink.logs, level, message, options)
          })
      )
    }
    restorers.push(mockPlatform('mac'))
    restorers.push(pinClock(Date.UTC(2026, 10, 23)))
  })

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore()
    for (const restore of restorers.splice(0)) restore()
  })

  it.each(cases)('$id', async (c) => {
    const mode = oracleMode()
    await withEngineOracleProfile(async (profile) => {
      const before = JSON.stringify(snapshotTree(profile.home))
      const runtime = makeRuntime(profile)
      const outcomes: unknown[] = []
      const spawns: unknown[] = []
      for (const [index, item] of c.args.items.entries()) {
        if (c.op === 'locator') {
          outcomes.push(
            await attempt(() =>
              runLocatorItem(profile, item as LocatorItem, realExists)
            )
          )
          continue
        }
        const sc = resolveScenario(c.args.base, item)
        const outcome = await runItem(c.op, profile, runtime, sc, item, sink)
        outcomes.push(outcome.result)
        for (const record of outcome.spawns) {
          spawns.push({ item: index, ...(record as object) })
        }
      }
      const after = snapshotTree(profile.home)
      const treeUnchanged = JSON.stringify(after) === before
      if (c.op !== 'locator') {
        // Reading engine state never creates or edits a file (59-UAT G11).
        expect(treeUnchanged).toBe(true)
      }
      writeOrCompareGolden(
        CRATE,
        DECISION,
        c.id,
        {
          result: normalisePaths(
            {
              op: c.op,
              args: c.args,
              outcomes,
              treeUnchanged,
              pins: { current: ENGINE_PINS.current.id, retired: RETIRED_PIN_ID }
            },
            profile
          ),
          events: [],
          after: c.op === 'locator' ? normalisePaths(after, profile) : after,
          spawns: normalisePaths(spawns, profile)
        },
        mode
      )
    })
  })

  it('cases.json agrees with the generated case list, the MANIFEST agrees with both and holds one folder per case', () => {
    const file = join(goldenDir(CRATE, DECISION), 'cases.json')
    const mode = oracleMode()
    if (mode === 'write') {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, json(cases))
    } else if (mode === 'compare') {
      expect(json(cases)).toBe(readFileSync(file, 'utf8'))
    }
    syncManifest(CRATE, DECISION, cases, DECISION_FLOOR)
    assertManifest(CRATE, DECISION, cases, DECISION_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, DECISION, DECISION_FLOOR)
  })

  it('the matrix covers every cell the plan names, offline yes and no on every launch item', () => {
    const matrix = matrixCases()
    expect(matrix).toHaveLength(CX_STATES.length * SETTINGS.length * 2 * 2)
    const offlineOf = (c: DecisionCase): Set<boolean> =>
      new Set(
        c.args.items.map(
          (item) => (item.offline ?? c.args.base?.offline) as boolean
        )
      )
    const launch = cases.filter(
      (c) => c.op === 'launch' && !c.id.startsWith('launch-')
    )
    expect(launch.length).toBeGreaterThan(20)
    for (const c of launch) {
      expect(offlineOf(c)).toEqual(new Set([false, true]))
    }
    // The matrix splits offline across cases: every (CrossOver, setting, bottle) has both.
    const seen = new Map<string, Set<boolean>>()
    for (const c of matrix) {
      const b = c.args.base as Partial<Scenario>
      const cell = `${JSON.stringify(b.cx)}|${String(b.setting)}|${String(b.bottle)}`
      seen.set(cell, (seen.get(cell) ?? new Set()).add(b.offline as boolean))
    }
    expect(seen.size).toBe(CX_STATES.length * SETTINGS.length * 2)
    for (const offline of seen.values()) {
      expect(offline).toEqual(new Set([false, true]))
    }
    assertAtOrAboveFloor('decision cases', cases.length, DECISION_FLOOR)
  })

  it('no expected decision selects bottled Steam: the assertion trips on one that does', () => {
    expect(() =>
      assertNoBottledSteam({ kind: 'use', selection: { kind: 'crossover' } })
    ).not.toThrow()
    expect(() =>
      assertNoBottledSteam({
        kind: 'use',
        selection: { kind: 'bottled-steam' }
      })
    ).toThrow(/outside the allowed set/)
    expect(() =>
      assertNoBottledSteam({
        kind: 'use',
        selection: { kind: 'pinned' },
        logLines: ['engine=Bottled Steam']
      })
    ).toThrow(/bottled-Steam/)
    expect(() => assertNoBottledSteam({ kind: 'steam' })).toThrow()
  })

  it('no committed golden names the bottled-Steam engine', () => {
    const root = join(goldenDir(CRATE, DECISION), 'expected')
    if (oracleMode() === 'record' || !existsSync(root)) return
    for (const c of cases) {
      const text = readFileSync(join(root, c.id, 'result.json'), 'utf8')
      expect(BOTTLED_STEAM.test(text)).toBe(false)
    }
  })

  it('a cx-inconclusive golden keeps the marker, stops no wineserver, reads the marker only and writes nothing (WR-01)', () => {
    const root = join(goldenDir(CRATE, DECISION), 'expected')
    if (oracleMode() === 'record' || !existsSync(root)) return
    const result = JSON.parse(
      readFileSync(
        join(root, 'wr01-inconclusive-automatic', 'result.json'),
        'utf8'
      )
    ) as {
      outcomes: {
        input: { pins: string; marker: string; offline: boolean }
        decision: {
          kind: string
          selection: { kind: string; reason: string; pinId?: string }
          preflight: { inconclusive?: boolean }
          logLines: string[]
        }
        calls: string
      }[]
      treeUnchanged: boolean
    }
    const pinned = result.outcomes.find(
      (o) => o.input.pins === 'current' && o.input.marker === 'pinned'
    )
    expect(pinned?.decision.selection).toMatchObject({
      kind: 'pinned',
      reason: 'cx-inconclusive',
      pinId: ENGINE_PINS.current.id
    })
    expect(pinned?.decision.preflight.inconclusive).toBe(true)
    expect(pinned?.calls).toContain('markerSummary')
    expect(pinned?.calls).not.toContain('killCrossoverWineserver')
    expect(result.treeUnchanged).toBe(true)
    const kept = result.outcomes.filter(
      (o) => o.decision.selection?.reason === 'cx-inconclusive'
    )
    expect(kept.length).toBeGreaterThanOrEqual(10)
    for (const o of kept) {
      expect(o.calls).not.toContain('killCrossoverWineserver')
    }
  })
})

// ---------------------------------------------------------------------------------------------
// Demo status and the tested-version rules (Task 2).
//
// `--demo-status` is the declared real-profile arm (D-18, spike 060): CrossOver reads its licence
// from the real profile, so in production the probe inherits the process env (`replaceEnv` false,
// `CX_BOTTLE` the only key it sets) and a fake HOME would hide the licence. The golden runs the
// probe under the fake profile with scripted output: every case but the arm-shape one passes the
// fake profile's env (`replaceEnv` true), and the arm-shape case records the production call shape
// (no base env) without spawning, because the tracer answers from its script.
// ---------------------------------------------------------------------------------------------

type DemoOp = 'probe' | 'parse' | 'read-build' | 'tested' | 'notice' | 'bin-dir'

interface DemoCase {
  id: string
  op: DemoOp
  note: string
  args: { items: Item[] }
}

const UNREAD_NOTE =
  'production inherits the real profile (declared real-profile arm, D-18); the golden runs under the fake profile with scripted output'

function demoCases(): DemoCase[] {
  const probe = (id: string, note: string, items: Item[]): DemoCase => ({
    id,
    op: 'probe',
    note: `${note} (${UNREAD_NOTE})`,
    args: { items }
  })
  const one = (id: string, note: string, item: Item): DemoCase =>
    probe(id, note, [item])
  const bottle = 'GameLib-gog-1207658924'
  const out: DemoCase[] = [
    one('probe-standard', 'the licensed answer: Standard version', {
      bottleName: bottle,
      step: { code: 0, stdout: 'Standard version\n' }
    })
  ]
  for (const n of [12, 1, 0]) {
    out.push(
      one(`probe-trial-${n}`, `a trial with ${n} days remaining`, {
        bottleName: bottle,
        step: { code: 0, stdout: `Demo version (${n} days remaining)\n` }
      })
    )
  }
  for (const n of [3, 0, 400]) {
    out.push(
      one(`probe-expired-${n}`, `a trial that expired ${n} days ago`, {
        bottleName: bottle,
        step: { code: 0, stdout: `Demo version (expired ${n} days ago)\n` }
      })
    )
  }
  out.push(
    one('probe-last-line-wins', 'only the last non-blank line is read', {
      bottleName: bottle,
      step: { code: 0, stdout: 'cxwine: note\n\nStandard version\n\n' }
    }),
    one('probe-crlf-and-padding', 'CRLF line ends and padded lines parse', {
      bottleName: bottle,
      step: {
        code: 0,
        stdout: 'noise\r\n  Demo version (5 days remaining)  \r\n\r\n'
      }
    }),
    one(
      'probe-noise-after-status',
      'a line after the status makes it unrecognised',
      {
        bottleName: bottle,
        step: { code: 0, stdout: 'Standard version\nextra\n' }
      }
    ),
    one('probe-empty-output', 'empty stdout is unrecognised', {
      bottleName: bottle,
      step: { code: 0, stdout: '' }
    }),
    one('probe-singular-day', 'a singular day is not a trial form', {
      bottleName: bottle,
      step: { code: 0, stdout: 'Demo version (1 day remaining)\n' }
    }),
    one('probe-timeout-default', 'no result in the 15 s cap is a timeout', {
      bottleName: bottle,
      step: { code: null, timedOut: true }
    }),
    one('probe-timeout-custom', 'a caller timeout replaces the 15 s cap', {
      bottleName: bottle,
      timeoutMs: 3000,
      step: { code: null, timedOut: true }
    }),
    one(
      'probe-nonzero-with-output',
      'a nonzero exit keeps stderr and stdout, whitespace collapsed to one line',
      {
        bottleName: bottle,
        step: {
          code: 1,
          stdout: 'cxmessage: wrapper\n  fatal error\n',
          stderr: 'cxwine: failed\n\tsecond line\n'
        }
      }
    ),
    one(
      'probe-nonzero-long-output',
      'the nonzero detail cuts stderr at 200 and stdout at 400 characters',
      {
        bottleName: bottle,
        step: {
          code: 2,
          stdout: rep('o', 500),
          stderr: rep('e', 300)
        }
      }
    ),
    one(
      'probe-nonzero-no-code',
      'a run with no exit code (killed) is a nonzero exit',
      {
        bottleName: bottle,
        step: { code: null, stdout: '', stderr: 'killed' }
      }
    ),
    one('probe-spawn-error', 'a rejected spawn is a spawn error', {
      bottleName: bottle,
      step: { throws: 'spawn ENOENT' }
    }),
    one(
      'probe-output-truncated',
      'output cut at the 64 KiB buffer reads as whatever line survived',
      {
        bottleName: bottle,
        step: { code: 0, stdout: 'Demo version (1', truncated: true }
      }
    ),
    one(
      'probe-bottle-255-chars',
      'a 255 character bottle name is the longest accepted',
      {
        bottleName: rep('a', 255),
        step: { code: 0, stdout: 'Standard version\n' }
      }
    ),
    one(
      'probe-bottle-256-chars-refused',
      'an over-255-character bottle name is refused before any spawn',
      {
        bottleName: rep('a', 256),
        step: { code: 0, stdout: 'Standard version\n' }
      }
    ),
    probe(
      'probe-bottle-names-refused',
      'names the engine layer refuses are never spawned: a slash, a backslash, a parent path, a NUL, blank and padded',
      [
        'a/b',
        'a\\b',
        '..',
        'a..b',
        'a\u0000b',
        '',
        '   ',
        ' padded',
        'padded '
      ].map((bottleName) => ({
        bottleName,
        step: { code: 0, stdout: 'Standard version\n' }
      }))
    ),
    one(
      'probe-bottle-spaces-and-punctuation',
      'spaces and punctuation travel in CX_BOTTLE, not argv',
      {
        bottleName: 'My Game: (Test) 1.0 & more',
        step: { code: 0, stdout: 'Standard version\n' }
      }
    ),
    one(
      'probe-real-profile-arm-shape',
      'the production call shape: no base env, so the runner merges the process env under CX_BOTTLE (replaceEnv false)',
      {
        bottleName: bottle,
        baseEnv: 'inherit',
        step: { code: 0, stdout: 'Standard version\n' }
      }
    ),
    one(
      'probe-fake-profile-arm-shape',
      'the test call shape: a fake profile env used verbatim (replaceEnv true)',
      {
        bottleName: bottle,
        baseEnv: 'fake',
        step: { code: 0, stdout: 'Standard version\n' }
      }
    )
  )
  const strings = (
    id: string,
    op: DemoOp,
    note: string,
    items: Item[]
  ): DemoCase => ({
    id,
    op,
    note,
    args: { items }
  })
  out.push(
    strings(
      'parse-forms',
      'parse',
      'parseDemoStatus over the three forms and what surrounds them',
      [
        'Standard version',
        'Demo version (12 days remaining)',
        'Demo version (expired 3 days ago)',
        'a\nb\nStandard version',
        'Standard version\r\n',
        '  Standard version  '
      ].map((stdout) => ({ stdout }))
    ),
    strings(
      'parse-unrecognised',
      'parse',
      'parseDemoStatus over text that is not a form',
      [
        '',
        '\n\n',
        'standard version',
        'Standard  version',
        'Demo version (1 day remaining)',
        'Demo version (-1 days remaining)',
        'Demo version (expired -1 days ago)',
        'Demo version (expired 3 days ago) x',
        'Demo version (12 days remaining)\nStandard',
        'Demo version ( 12 days remaining)',
        'Demo version (1e3 days remaining)'
      ].map((stdout) => ({ stdout }))
    ),
    strings(
      'read-build-valid',
      'read-build',
      'readCrossoverBuild reads CFBundleVersion with plutil from the app bundle beside bin, in /Applications or ~/Applications',
      ['/Applications', '<HOME>/Applications', '/Volumes/Games/Apps'].map(
        (root) => ({
          binDir: `${root}/CrossOver.app/Contents/SharedSupport/CrossOver/bin`,
          step: { code: 0, stdout: '26.3.0.39832\n' }
        })
      )
    ),
    strings(
      'read-build-refused-before-spawn',
      'read-build',
      'a bin dir without the CrossOver suffix, or whose bundle is not an .app, reads null with no spawn',
      [
        '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver',
        '/Applications/CrossOver.app/bin',
        '/Applications/CrossOver/Contents/SharedSupport/CrossOver/bin',
        '/Contents/SharedSupport/CrossOver/bin',
        ''
      ].map((binDir) => ({
        binDir,
        step: { code: 0, stdout: '26.3.0.39832\n' }
      }))
    ),
    strings(
      'read-build-failures',
      'read-build',
      'a plutil failure or timeout reads null; a rejected tool run is recorded by class',
      [
        { step: { code: 1, stdout: '', stderr: 'no such key' } },
        { step: { code: null, timedOut: true } },
        { step: { code: 0, stdout: '26.3.0.39832\n', timedOut: true } },
        { step: { throws: 'tool failed' } }
      ].map((item) => ({
        binDir:
          '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin',
        ...item
      }))
    ),
    strings(
      'read-build-output-shapes',
      'read-build',
      'only a dotted four-number build is accepted; the output is trimmed',
      [
        '26.3.0.39832',
        '  26.3.0.39832\n',
        '26.3.0',
        '26.3.0.39832.1',
        '26.3.0.39832\n26.3.0.1',
        'v26.3.0.39832',
        '',
        '26.3.0.x',
        '26.3.0.39832 ',
        '０.１.２.３'
      ].map((stdout) => ({
        binDir:
          '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin',
        step: { code: 0, stdout }
      }))
    ),
    strings(
      'tested-builds',
      'tested',
      'isTestedCrossover and the untested log line for the tested build, other builds and an unreadable one',
      [
        '26.3.0.39832',
        '26.4.0.40000',
        '25.0.0.1',
        null,
        '',
        '26.3.0.39832 ',
        ' 26.3.0.39832'
      ].map((build) => ({ build }))
    ),
    strings(
      'tested-prototype-keys',
      'tested',
      'a build named like an Object.prototype key is not tested',
      ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'].map(
        (build) => ({ build })
      )
    ),
    strings(
      'notice-untested-flow',
      'notice',
      'shouldShowUntestedNotice until the build is dismissed, then never; the store key and the written list are recorded',
      [
        {
          steps: [
            { do: 'show', build: '26.4.0.40000' },
            { do: 'dismiss', build: '26.4.0.40000' },
            { do: 'show', build: '26.4.0.40000' },
            { do: 'show', build: '26.5.0.1' },
            { do: 'dismiss', build: '26.4.0.40000' },
            { do: 'dismiss', build: '26.5.0.1' },
            { do: 'show', build: '26.5.0.1' }
          ]
        }
      ]
    ),
    strings(
      'notice-tested-and-unreadable',
      'notice',
      'a tested build or an unreadable one never shows the notice, whatever the store holds',
      [
        {
          steps: [
            { do: 'show', build: '26.3.0.39832' },
            { do: 'show', build: null }
          ]
        },
        {
          initial: ['26.3.0.39832'],
          steps: [
            { do: 'show', build: '26.3.0.39832' },
            { do: 'show', build: null }
          ]
        }
      ]
    ),
    strings(
      'notice-malformed-builds-refused',
      'notice',
      'dismissUntestedNotice refuses a build that is not a dotted four-number string and writes nothing',
      [
        '../x',
        '26.4.0',
        '26.4.0.1.2',
        '26.4.0.x',
        '',
        ' 26.4.0.1',
        '26.4.0.1\n',
        '26.4.0.1; rm'
      ].map((build) => ({ steps: [{ do: 'dismiss', build }] }))
    ),
    strings(
      'notice-store-shapes',
      'notice',
      'a stored value that is not a list of strings reads as empty; non-string items are dropped when the list is written back',
      [
        { initial: 'not-a-list' },
        { initial: 5 },
        { initial: null },
        { initial: { '0': '26.4.0.1' } },
        { initial: [1, null, '26.4.0.1', { a: 1 }] },
        { initial: [] }
      ].map((item) => ({
        ...item,
        steps: [
          { do: 'show', build: '26.4.0.1' },
          { do: 'dismiss', build: '26.4.0.2' },
          { do: 'show', build: '26.4.0.2' }
        ]
      }))
    ),
    strings(
      'notice-dismissed-list-cap',
      'notice',
      'the dismissed list keeps its last 50 builds and does not repeat one',
      [
        { initialBuilds: { prefix: '26.9.0.', count: 49 } },
        { initialBuilds: { prefix: '26.9.0.', count: 50 } },
        { initialBuilds: { prefix: '26.9.0.', count: 60 } }
      ].map((item) => ({
        ...item,
        steps: [
          { do: 'dismiss', build: '26.4.0.1' },
          { do: 'dismiss', build: '26.4.0.1' },
          { do: 'dismiss', build: '26.4.0.2' },
          { do: 'show', build: '26.9.0.0' },
          { do: 'show', build: '26.9.0.59' }
        ]
      }))
    ),
    strings(
      'bin-dir-from-wine-bin',
      'bin-dir',
      'crossoverBinDirFromWineBin keeps the directory of a wine path that ends in the CrossOver bin suffix',
      [
        '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine',
        '<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine',
        '/SharedSupport/CrossOver/bin/wine',
        '/x/SharedSupport/CrossOver/bin/wine',
        '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine64',
        '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine/',
        '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin',
        'SharedSupport/CrossOver/bin/wine',
        '/usr/local/bin/wine',
        '',
        'wine'
      ].map((wineBin) => ({ wineBin }))
    ),
    strings(
      'bin-dir-non-strings',
      'bin-dir',
      'a wine bin that is not a string has no bin dir',
      [null, 5, true, ['a'], { a: 1 }].map((wineBin) => ({ wineBin }))
    )
  )
  return out
}

interface NoticeStep {
  do: 'show' | 'dismiss'
  build: string | null
}

async function runDemoItem(
  op: DemoOp,
  profile: EngineOracleProfile,
  item: Item,
  sink: { logs: LogLine[] }
): Promise<{ result: unknown; spawns: unknown[] }> {
  sink.logs = []
  const P = (text: string): string => expandPlaceholders(text, profile)
  const spawns: unknown[] = []
  const finish = (result: unknown) => ({
    result: {
      ...(result as Record<string, unknown>),
      logs: sink.logs.map((l) => `${l.level} ${l.message}`)
    },
    spawns
  })
  switch (op) {
    case 'probe': {
      const step = materialise(item.step) as ProbeStep
      const binDir = join(
        profile.home,
        'Applications',
        'CrossOver.app',
        'Contents',
        'SharedSupport',
        'CrossOver',
        'bin'
      )
      const env = profile.fake.childEnv({})
      const tracer = createSpawnTracer({
        baseEnv: env,
        scripted: [
          {
            program: join(binDir, 'wine'),
            argv: ['--demo-status'],
            ...step,
            repeat: true
          }
        ]
      })
      const runOptions: unknown[] = []
      const probe = createProbeDemoStatus({
        runner: {
          run: (program, argv, opts) => {
            runOptions.push({
              timeoutMs: opts?.timeoutMs ?? null,
              maxBufferBytes: opts?.maxBufferBytes ?? null,
              replaceEnv: opts?.replaceEnv ?? false,
              stdin: opts?.stdin ?? null
            })
            return tracer.runner.run(program, argv, opts)
          }
        }
      })
      const result = await attempt(async () => ({
        input: item,
        probe: await probe({
          binDir,
          bottleName: materialise(item.bottleName) as string,
          timeoutMs: item.timeoutMs as number | undefined,
          baseEnv: item.baseEnv === 'inherit' ? undefined : env
        }),
        runOptions
      }))
      spawns.push(...tracer.records)
      return finish(result)
    }
    case 'parse':
      return finish({
        input: item,
        status: parseDemoStatus(item.stdout as string)
      })
    case 'read-build': {
      const step = item.step as ProbeStep
      const toolCalls: unknown[] = []
      const runTool: RunTool = (tool, args, opts) => {
        toolCalls.push({ tool, args: [...args], timeoutMs: opts.timeoutMs })
        if (step.throws !== undefined) {
          return Promise.reject(new Error(step.throws))
        }
        return Promise.resolve({
          code: step.code === undefined ? 0 : step.code,
          stdout: step.stdout ?? '',
          stderr: step.stderr ?? '',
          timedOut: step.timedOut ?? false,
          aborted: false
        })
      }
      const result = await attempt(async () => ({
        input: item,
        build: await readCrossoverBuild(P(item.binDir as string), runTool),
        toolCalls
      }))
      return finish(result)
    }
    case 'tested': {
      const build = item.build as string | null
      return finish({
        input: item,
        tested: isTestedCrossover(build),
        logLine: untestedCrossoverLogLine(build)
      })
    }
    case 'notice': {
      const key = 'dismissedUntestedCrossoverBuilds'
      const data = new Map<string, unknown>()
      const initialBuilds = item.initialBuilds as
        | { prefix: string; count: number }
        | undefined
      if (initialBuilds) {
        data.set(
          key,
          Array.from(
            { length: initialBuilds.count },
            (_, n) => `${initialBuilds.prefix}${n}`
          )
        )
      } else if ('initial' in item) {
        data.set(key, item.initial)
      }
      const gets: string[] = []
      const sets: unknown[] = []
      const store = {
        get: (k: string, fallback: unknown): unknown => {
          gets.push(k)
          return data.has(k) ? data.get(k) : fallback
        },
        set: (k: string, value: unknown): void => {
          sets.push({ key: k, value })
          data.set(k, value)
        }
      }
      const results = ((item.steps ?? []) as NoticeStep[]).map((step) =>
        step.do === 'show'
          ? { step, shown: shouldShowUntestedNotice(step.build, store) }
          : {
              step,
              dismissed: dismissUntestedNotice(step.build as string, store)
            }
      )
      return finish({
        input: item,
        results,
        gets: gets.length,
        sets,
        finalValue: data.has(key) ? data.get(key) : { absent: true }
      })
    }
    case 'bin-dir':
      return finish({
        input: item,
        binDir:
          crossoverBinDirFromWineBin(
            typeof item.wineBin === 'string'
              ? P(item.wineBin)
              : (item.wineBin as never)
          ) ?? null
      })
  }
}

describeSkipOnWindows('demo status and tested-version oracle (87-13)', () => {
  const cases = demoCases()
  const spies: jest.SpyInstance[] = []
  const restorers: (() => void)[] = []
  const sink: { logs: LogLine[] } = { logs: [] }

  beforeEach(() => {
    for (const [name, level] of [
      ['logDebug', 'DEBUG'],
      ['logInfo', 'INFO'],
      ['logWarning', 'WARNING'],
      ['logError', 'ERROR']
    ] as const) {
      spies.push(
        jest
          .spyOn(logger, name)
          .mockImplementation((message: unknown, options?: unknown) => {
            captureLog(sink.logs, level, message, options)
          })
      )
    }
    restorers.push(mockPlatform('mac'))
    restorers.push(pinClock(Date.UTC(2026, 10, 23)))
  })

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore()
    for (const restore of restorers.splice(0)) restore()
  })

  it.each(cases)('$id', async (c) => {
    const mode = oracleMode()
    await withEngineOracleProfile(async (profile) => {
      const before = JSON.stringify(snapshotTree(profile.home))
      const outcomes: unknown[] = []
      const spawns: unknown[] = []
      for (const [index, item] of c.args.items.entries()) {
        const outcome = await runDemoItem(c.op, profile, item, sink)
        outcomes.push(outcome.result)
        for (const record of outcome.spawns) {
          spawns.push({ item: index, ...(record as object) })
        }
      }
      const after = snapshotTree(profile.home)
      expect(JSON.stringify(after)).toBe(before)
      writeOrCompareGolden(
        CRATE,
        DEMO_STATUS,
        c.id,
        {
          result: normalisePaths(
            { op: c.op, args: c.args, outcomes, treeUnchanged: true },
            profile
          ),
          events: [],
          after,
          spawns: normalisePaths(spawns, profile)
        },
        mode
      )
    })
  })

  it('cases.json agrees with the generated case list, the MANIFEST agrees with both and holds one folder per case', () => {
    const file = join(goldenDir(CRATE, DEMO_STATUS), 'cases.json')
    const mode = oracleMode()
    if (mode === 'write') {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, json(cases))
    } else if (mode === 'compare') {
      expect(json(cases)).toBe(readFileSync(file, 'utf8'))
    }
    syncManifest(CRATE, DEMO_STATUS, cases, DEMO_FLOOR)
    assertManifest(CRATE, DEMO_STATUS, cases, DEMO_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, DEMO_STATUS, DEMO_FLOOR)
  })

  it('every op is covered and the real-profile arm is named', () => {
    expect(new Set(cases.map((c) => c.op))).toEqual(
      new Set(['probe', 'parse', 'read-build', 'tested', 'notice', 'bin-dir'])
    )
    for (const c of cases.filter((x) => x.op === 'probe')) {
      expect(c.note).toContain('declared real-profile arm')
    }
  })

  const golden = (
    id: string
  ): {
    outcomes: Record<string, unknown>[]
    spawns: Record<string, unknown>[]
  } | null => {
    const root = join(goldenDir(CRATE, DEMO_STATUS), 'expected', id)
    if (oracleMode() === 'record' || !existsSync(root)) return null
    return {
      outcomes: (
        JSON.parse(readFileSync(join(root, 'result.json'), 'utf8')) as {
          outcomes: Record<string, unknown>[]
        }
      ).outcomes,
      spawns: JSON.parse(
        readFileSync(join(root, 'spawns.json'), 'utf8')
      ) as Record<string, unknown>[]
    }
  }

  it('the probe spawns <binDir>/wine --demo-status with CX_BOTTLE, an empty stdin, the 15 s cap and the 64 KiB buffer', () => {
    const g = golden('probe-standard')
    expect(g?.spawns).toHaveLength(1)
    expect(g?.spawns[0]).toMatchObject({
      program:
        '<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine',
      argv: ['--demo-status'],
      envDiff: { set: { CX_BOTTLE: 'GameLib-gog-1207658924' }, unset: [] },
      stdin: ''
    })
    expect(g?.outcomes[0]).toMatchObject({
      probe: { kind: 'ok', status: { kind: 'licensed' } },
      runOptions: [
        { timeoutMs: 15000, maxBufferBytes: 65536, replaceEnv: true, stdin: '' }
      ]
    })
  })

  it('the production arm records replaceEnv false; an over-long or unsafe bottle name spawns nothing', () => {
    expect(golden('probe-real-profile-arm-shape')?.outcomes[0]).toMatchObject({
      runOptions: [{ replaceEnv: false }]
    })
    expect(golden('probe-bottle-256-chars-refused')?.spawns).toEqual([])
    expect(golden('probe-bottle-256-chars-refused')?.outcomes[0]).toMatchObject(
      {
        probe: { kind: 'failed', reason: 'invalid-bottle' }
      }
    )
    expect(golden('probe-bottle-names-refused')?.spawns).toEqual([])
    expect(golden('probe-bottle-255-chars')?.spawns).toHaveLength(1)
  })

  it('the three status forms, the timeout, the nonzero exit and the spawn error are each recorded', () => {
    const status = (id: string): unknown =>
      (golden(id)?.outcomes[0] as { probe: unknown } | undefined)?.probe
    expect(status('probe-trial-12')).toMatchObject({
      status: { kind: 'trial', daysRemaining: 12 }
    })
    expect(status('probe-expired-3')).toMatchObject({
      status: { kind: 'expired', daysAgo: 3 }
    })
    expect(status('probe-timeout-default')).toMatchObject({ reason: 'timeout' })
    expect(status('probe-nonzero-with-output')).toMatchObject({
      reason: 'nonzero-exit'
    })
    expect(status('probe-spawn-error')).toMatchObject({ reason: 'spawn-error' })
    expect(status('probe-noise-after-status')).toMatchObject({
      status: { kind: 'unrecognised' }
    })
  })

  it('the tested-version rules: the tested build never shows the notice, an untested one shows until dismissed', () => {
    const flow = golden('notice-untested-flow')?.outcomes[0] as {
      results: { shown?: boolean; dismissed?: boolean }[]
    }
    expect(flow.results.map((r) => r.shown ?? r.dismissed)).toEqual([
      true,
      true,
      false,
      true,
      true,
      true,
      false
    ])
    const tested = golden('tested-builds')?.outcomes[0] as { tested: boolean }
    expect(tested.tested).toBe(true)
  })
})
