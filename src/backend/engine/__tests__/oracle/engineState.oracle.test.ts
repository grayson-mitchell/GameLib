/**
 * The engine-state oracle (87-14, D-08): the per-title engine badge state the game page shows
 * (the CrossOver trial notice at 7 days or fewer, the untested-build notice and its dismissal, the
 * no-CrossOver note), the notice store `store_cache/steam_engine_notices.json` byte for byte, the
 * launch decision the owner records and publishes (`engineStateChanged`), the overlay, exit and
 * launch-deadline notices, and `getGameEngineState` for a non-Steam game, recorded as goldens the
 * Rust `gamelib-engine` state slice later has to reproduce.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite golden/state/expected/
 *   (default)                        compare, offline
 * Nothing here reaches the network and nothing spawns: the preflight, the CrossOver bin dir and the
 * bottle's readiness are scripted values (the decision layer's own goldens are 87-13's), and the
 * runner is the spawn tracer with no script, so a stray spawn would fail loudly.
 *
 * Real in this slice: `createEngineState`, `dismissUntestedNotice`, `shouldShowUntestedNotice`,
 * `getGameEngineState`, the notice store (`CacheStore` over a `StoreRoot` rooted at the fake
 * userData, so the recorded bytes are the ones a boot writes). The timestamps the store writes
 * come from `Date()`, which prints in the machine's zone: `Date.prototype.toString` is replaced
 * with the same format in UTC (`Mon Nov 23 2026 12:00:00 GMT+0000 (Coordinated Universal Time)`)
 * so the golden does not depend on the machine.
 *
 * What is recorded per case (result.json): every step's result in order (a state, a boolean, the
 * dismissal's `{ok}`; a thrown error by its message) with the probes that step ran, the
 * notice store file's bytes afterwards, every log line. events.json is the `engineStateChanged`
 * sequence. tree.json is the profile tree afterwards.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  pinClock,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile
} from 'backend/testUtils/engineWineOracle/harness'
import { oracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import {
  captureLog,
  type LogLine
} from 'backend/testUtils/engineWineOracle/toolsOracleSupport'
import { createFakeBottleGateRust } from 'backend/testUtils/fakeBottleGateRust'
import { createTestStoreRoot } from 'backend/testUtils/testStoreRoot'
import { createSpawnAsync } from 'backend/spawnAsync'
import * as logger from 'backend/logger'
import type { EngineState } from 'common/types/engine'
import { ENGINE_PINS } from '../../enginePins'
import { createEngineRuntime } from '../../engineRuntime'
import { createEngineStores } from '../../engineNoticeStore'
import { createEngineState, type EngineStateDeps } from '../../engineState'
import type { EffectiveEngine } from '../../engineConfig'
import type { CrossoverPreflight, LaunchDecision } from '../../engineDecision'
import type { EngineServices } from '../../engineServices'
import type { EngineSelection } from '../../engineTypes'
import { getGameEngineState } from '../../gameEngineState'
import type { EngineNoticeStore } from '../../testedCrossoverVersions'

const CRATE = 'gamelib-engine'
const SLICE = 'state'
/** The case count this plan commits as a floor; a later edit may raise it, never lower it. */
const FLOOR = 35

/** The date the case starts at; a step may move it on. */
const START = Date.UTC(2026, 10, 23, 12, 0, 0)
const BIN =
  '<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
const SEED_STAMP =
  'Mon Nov 23 2026 11:00:00 GMT+0000 (Coordinated Universal Time)'

type EffectiveName =
  | 'automatic'
  | 'crossover'
  | 'pinned'
  | 'wine-manager'
  | { legacy: string }

interface Step {
  op:
    | 'state'
    | 'dismiss'
    | 'launch'
    | 'overlay'
    | 'overlay-exit'
    | 'deadline'
    | 'publisher'
    | 'advance'
    | 'game-state'
  /** The game's app name; the runner defaults to `legendary`. */
  game?: string
  runner?: string
  /** Present (even null) replaces the whole identity argument. */
  identity?: unknown
  bin?: 'present' | 'absent'
  /** Present (even null) is the bottle name; absent is `oracle-bottle`. */
  bottle?: string | null
  withoutBottle?: boolean
  ready?: boolean
  effective?: EffectiveName
  /** A scripted preflight, `throws`, or `unscripted` (a call to it fails by name). */
  preflight?: unknown
  isMac?: boolean
  overrideEligible?: boolean
  overlayEligible?: boolean
  wineTools?: boolean
  concurrent?: number
  args?: unknown
  kind?: 'use' | 'unavailable'
  override?: string
  selection?: string
  step?: string
  title?: unknown
  seconds?: number
  mode?: 'throw' | 'ok'
  ms?: number
  globalSettings?: Record<string, unknown>
}

interface StateCase {
  id: string
  note: string
  /** The notice store before: absent, a count of dismissed builds, raw keys, or a corrupt file. */
  store?: {
    builds?: number
    raw?: Record<string, unknown>
    corrupt?: true
  }
  steps: Step[]
}

interface Rep {
  repeat: { char: string; count: number }
}

/** A long input is stored as a generator so the case file stays small. */
function materialise<T>(value: T): T {
  if (Array.isArray(value)) return value.map(materialise) as T
  if (value !== null && typeof value === 'object') {
    const rep = (value as Partial<Rep>).repeat
    if (rep) return rep.char.repeat(rep.count) as T
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, materialise(v)])
    ) as T
  }
  return value
}

/** `$BIN` in a scripted value is the CrossOver bin dir under the fake HOME. */
function expandValue<T>(value: T, profile: EngineOracleProfile): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      return expandPlaceholders(node.split('$BIN').join(BIN), profile)
    }
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => [k, walk(v)])
      )
    }
    return node
  }
  return walk(value) as T
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]
const two = (n: number): string => String(n).padStart(2, '0')

/** What `Date()` prints, in UTC: the one format the store's `__timestamp` values use. */
function utcDateString(date: Date): string {
  return `${DAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${two(date.getUTCDate())} ${date.getUTCFullYear()} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`
}

/** The notice file as a boot writes it: the values, the version envelope, the nested timestamps. */
function noticeDocument(values: Record<string, unknown>): string {
  return JSON.stringify(
    {
      ...values,
      __internal__: { gamelib: { schemaVersion: 1 } },
      __timestamp: Object.fromEntries(
        Object.keys(values).map((key) => [key, SEED_STAMP])
      )
    },
    null,
    '\t'
  )
}

const STORE_FILE = '<USERDATA>/store_cache/steam_engine_notices.json'

function storeSeed(
  store: StateCase['store']
): { path: string; text: string } | null {
  if (!store) return null
  if (store.corrupt) return { path: STORE_FILE, text: 'not json {' }
  if (store.builds !== undefined) {
    const builds = Array.from(
      { length: store.builds },
      (_, i) => `27.0.0.${i + 1}`
    )
    return {
      path: STORE_FILE,
      text: noticeDocument({ dismissedUntestedCrossoverBuilds: builds })
    }
  }
  return { path: STORE_FILE, text: noticeDocument(store.raw ?? {}) }
}

function effectiveFor(name: EffectiveName | undefined): EffectiveEngine {
  if (name === undefined || name === 'automatic') {
    return { kind: 'override', id: 'automatic', source: 'derived' }
  }
  if (name === 'crossover') {
    return { kind: 'override', id: 'crossover', source: 'stored' }
  }
  if (name === 'pinned') {
    return {
      kind: 'override',
      id: `pinned:${ENGINE_PINS.current.id}`,
      source: 'stored'
    }
  }
  if (name === 'wine-manager') {
    return { kind: 'override', id: 'wine-manager:11.0-1', source: 'stored' }
  }
  return { kind: 'legacy', label: name.legacy }
}

/** `crossover:cx-healthy`, `pinned:cx-missing`, `wine-manager:override`: a full selection. */
function selectionFor(
  shorthand: string,
  profile: EngineOracleProfile
): EngineSelection {
  const [kind, reason] = shorthand.split(':') as [string, string]
  const pin = ENGINE_PINS.current
  const engines = join(profile.toolsPath, 'steam-engines')
  if (kind === 'crossover') {
    return {
      kind: 'crossover',
      reason: reason as 'cx-healthy' | 'cx-inconclusive' | 'override',
      crossoverBuild: '26.3.0.39832',
      binDir: expandPlaceholders(BIN, profile)
    }
  }
  const bin = (dir: string): string =>
    join(engines, dir, 'Contents', 'Resources', 'wine', 'bin')
  if (kind === 'pinned') {
    return {
      kind: 'pinned',
      pinId: pin.id,
      reason: reason as 'cx-missing' | 'cx-expired' | 'cx-broken' | 'override',
      wineBin: join(bin(pin.id), 'wine'),
      wineserverBin: join(bin(pin.id), 'wineserver'),
      label: pin.label,
      version: pin.wine.version,
      dxvk: {
        dir: join(engines, `dxvk-macOS-${pin.dxvk.version}`),
        version: pin.dxvk.version
      }
    }
  }
  return {
    kind: 'wine-manager',
    managerVersion: '11.0-1',
    reason: reason as 'override' | 'cx-inconclusive',
    wineBin: join(engines, 'wm', 'bin', 'wine'),
    wineserverBin: join(engines, 'wm', 'bin', 'wineserver'),
    label: 'Wine-Staging 11.0-1',
    version: '11.0-1',
    dxvk: null
  }
}

interface SentEvent {
  channel: string
  args: unknown[]
}

describeSkipOnWindows('engine state oracle (87-14)', () => {
  const cases = loadCases<StateCase>(CRATE, SLICE)
  const restorers: (() => void)[] = []
  const spies: jest.SpyInstance[] = []

  beforeEach(() => {
    restorers.push(pinClock(START))
    spies.push(
      jest.spyOn(Date.prototype, 'toString').mockImplementation(function (
        this: Date
      ) {
        return utcDateString(this)
      })
    )
  })

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore()
    for (const restore of restorers.splice(0)) restore()
  })

  it.each(cases)('$id', async (c) => {
    const logs: LogLine[] = []
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
            captureLog(logs, level, message, options)
          })
      )
    }
    const seed = storeSeed(c.store)
    await withEngineOracleProfile(
      async (profile) => {
        const events: SentEvent[] = []
        let clockMs = START
        let publishMode: 'throw' | 'ok' = 'ok'
        const root = createTestStoreRoot(profile.userData)
        const { noticeStore } = createEngineStores({ root })
        const owner = createEngineState({
          publish: (state: EngineState) => {
            if (publishMode === 'throw') {
              throw new Error('renderer push failed')
            }
            events.push({ channel: 'engineStateChanged', args: [state] })
          },
          now: () => clockMs,
          isMac: () => true,
          noticeStore: () => noticeStore as unknown as EngineNoticeStore
        })
        const tracer = createSpawnTracer({
          baseEnv: profile.fake.childEnv({}),
          scripted: []
        })
        const gate = createFakeBottleGateRust()
        const services = {
          spawnAsync: createSpawnAsync({ runner: tracer.runner }),
          runner: tracer.runner,
          paths: {
            userHome: profile.home,
            toolsPath: profile.toolsPath,
            gamesConfigPath: profile.paths.gamesConfigPath,
            configPath: profile.paths.configPath
          },
          engineRuntime: createEngineRuntime({
            clock: {} as never,
            paths: { userHome: profile.home, toolsPath: profile.toolsPath },
            aborts: {
              create: () => ({}) as never,
              delete: () => undefined
            } as never,
            requestRustInvoke: gate.requestRustInvoke
          }),
          wineManagerReleases: () => [],
          globalSettings: (): Record<string, unknown> => ({}),
          engineState: owner
        } as unknown as EngineServices

        const identityOf = (step: Step): unknown =>
          'identity' in step
            ? step.identity
            : {
                runner: step.runner ?? 'legendary',
                appName: step.game ?? 'game-a'
              }
        const bottleOf = (step: Step): string | null =>
          'bottle' in step ? (step.bottle ?? null) : 'oracle-bottle'

        const steps: unknown[] = []
        for (const rawStep of c.steps) {
          const step = materialise(rawStep)
          const record = async (): Promise<Record<string, unknown>> => {
            switch (step.op) {
              case 'state':
              case 'game-state': {
                const calls: string[] = []
                const spec = step.preflight
                const sharedDeps = {
                  resolveCrossoverBinDir: () =>
                    Promise.resolve(
                      step.bin === 'absent'
                        ? undefined
                        : expandPlaceholders(BIN, profile)
                    ),
                  isBottleReady: () => step.ready !== false,
                  preflight: async (bottle: string) => {
                    calls.push(bottle)
                    await Promise.resolve()
                    if (spec === 'throws') throw new Error('probe failed')
                    if (spec === 'unscripted' || spec === undefined) {
                      throw new Error('unscripted preflight call')
                    }
                    return expandValue(spec, profile) as CrossoverPreflight
                  }
                }
                if (step.op === 'game-state') {
                  const gameServices = {
                    ...services,
                    globalSettings: (): Record<string, unknown> =>
                      expandValue(step.globalSettings ?? {}, profile)
                  } as EngineServices
                  const state = await getGameEngineState(
                    gameServices,
                    identityOf(step),
                    { ...sharedDeps, isMac: step.isMac ?? true }
                  )
                  return { state, preflightCalls: calls }
                }
                const deps = {
                  ...sharedDeps,
                  bottleFor: () => bottleOf(step),
                  stateWithoutBottle: step.withoutBottle === true,
                  overrideEligible: () => step.overrideEligible ?? true,
                  overlayEligible: step.overlayEligible === true,
                  wineToolsEligible: () => step.wineTools === true,
                  effective: () => effectiveFor(step.effective),
                  isMac: step.isMac ?? true
                } as unknown as EngineStateDeps
                const count = step.concurrent ?? 1
                const states = await Promise.all(
                  Array.from({ length: count }, () =>
                    owner.getEngineState(identityOf(step), deps)
                  )
                )
                return {
                  state: count === 1 ? states[0] : states,
                  preflightCalls: calls
                }
              }
              case 'dismiss':
                return {
                  returned: await owner.dismissEngineNotice(
                    step.args,
                    noticeStore as unknown as EngineNoticeStore
                  )
                }
              case 'launch': {
                const identity = {
                  runner: step.runner ?? 'legendary',
                  appName: step.game ?? 'game-a'
                }
                const override = (step.override ?? 'automatic') as never
                const decision: LaunchDecision =
                  step.kind === 'unavailable'
                    ? {
                        kind: 'unavailable',
                        override,
                        detail: 'engine not available'
                      }
                    : {
                        kind: 'use',
                        selection: selectionFor(
                          step.selection as string,
                          profile
                        ),
                        preflight: expandValue(
                          (step.preflight ?? null) as CrossoverPreflight | null,
                          profile
                        ),
                        pin: null,
                        needsDownload: false,
                        override,
                        logLines: []
                      }
                const before = events.length
                owner.recordLaunchDecision(
                  identity,
                  decision,
                  step.bottle ?? 'oracle-bottle',
                  {
                    bottleFor: () => 'oracle-bottle',
                    overrideEligible: () => true,
                    overlayEligible: false,
                    effective: () => effectiveFor(step.effective)
                  } as unknown as Parameters<
                    typeof owner.recordLaunchDecision
                  >[3]
                )
                return { published: events.length - before }
              }
              case 'overlay':
                return {
                  returned: owner.publishOverlayNotice(
                    {
                      runner: step.runner ?? 'legendary',
                      appName: step.game ?? 'game-a'
                    },
                    step.step as never
                  )
                }
              case 'overlay-exit':
                return {
                  returned: owner.publishOverlayExitNotice({
                    runner: step.runner ?? 'legendary',
                    appName: step.game ?? 'game-a'
                  })
                }
              case 'deadline':
                return {
                  returned: owner.publishLaunchDeadlineNotice(
                    {
                      runner: step.runner ?? 'legendary',
                      appName: step.game ?? 'game-a'
                    },
                    {
                      title: step.title as string,
                      seconds: step.seconds as number
                    }
                  )
                }
              case 'publisher':
                publishMode = step.mode ?? 'ok'
                return { mode: publishMode }
              default:
                clockMs += step.ms ?? 0
                jest.setSystemTime(clockMs)
                return { now: clockMs }
            }
          }
          let outcome: Record<string, unknown>
          try {
            outcome = await record()
          } catch (error) {
            outcome = {
              threw: error instanceof Error ? error.message : String(error)
            }
          }
          steps.push({ step: rawStep, ...outcome, eventsSoFar: events.length })
        }

        const storeFile = join(
          profile.userData,
          'store_cache',
          'steam_engine_notices.json'
        )
        writeOrCompareGolden(CRATE, SLICE, c.id, {
          result: normalisePaths(
            {
              note: c.note,
              seeded: seed ? readSeed(seed.text) : null,
              steps,
              storeFile: existsSync(storeFile)
                ? readFileSync(storeFile, 'utf8')
                : null,
              logs
            },
            profile
          ),
          events: normalisePaths(events, profile),
          after: normalisePaths(snapshotTree(profile.home), profile),
          spawns: normalisePaths([...tracer.records], profile)
        })
      },
      {
        seed: seed ? [{ path: seed.path, text: seed.text }] : []
      }
    )
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, FLOOR)
    assertManifest(CRATE, SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest guard', () => {
    expectEmptyCasesToFail(CRATE, SLICE, FLOOR)
  })

  it('the cases cover every behaviour the plan names', () => {
    const ids = new Set(cases.map((c) => c.id))
    for (const id of [
      'trial-notice-8-days',
      'trial-notice-7-days',
      'trial-notice-0-days',
      'trial-expired',
      'untested-build-shown',
      'untested-build-dismissed',
      'untested-dismissal-cap-50',
      'dismiss-no-crossover',
      'launch-fallback-notice-seq',
      'overlay-notice-needs-published-state',
      'overlay-exit-and-deadline-notices',
      'store-corrupt-read-keeps-file',
      'game-state-non-steam',
      'state-steam-bridge-game'
    ]) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('the corrupt notices file is kept byte for byte when it is only read (FND-06)', () => {
    const file = join(
      goldenDir(CRATE, SLICE),
      'expected',
      'store-corrupt-read-keeps-file',
      'result.json'
    )
    if (oracleMode() === 'write' || !existsSync(file)) return
    const result = JSON.parse(readFileSync(file, 'utf8')) as {
      storeFile: string | null
    }
    expect(result.storeFile).toBe('not json {')
  })
})

/** The seeded document as recorded: the corrupt text as is, a valid one parsed. */
function readSeed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}
