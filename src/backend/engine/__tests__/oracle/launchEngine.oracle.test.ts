/**
 * The launch-step oracle (87-15, D-01, D-08): the engine step of every non-Steam launch on macOS
 * (`selectEngineForLaunch`: skip, legacy, use and refused, offline, the fallback toast), the
 * launch-settings overlay, `armEngineLaunchDeadline` with its watcher and its cancel reasons,
 * `endEngineLaunch`, and the dialog and notice rules (a dialog on every refused attempt;
 * `showEngineNotice` never raises the window, the WR-02 fix), recorded as goldens the Rust
 * `gamelib-engine` launch slice later has to reproduce. The process-match vectors
 * (`vectors/process_match.json`) pin `gameProcessWatch`'s match forms and the `ps` / `pgrep` parse.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite golden/launch/expected/ and vectors/process_match.json
 *   (default)                        compare, offline
 * Nothing here reaches the network and nothing spawns: the runner is the spawn tracer with no
 * script, so a stray spawn fails loudly, and `ps` is a scripted listing.
 *
 * Real in this slice: `selectEngineForLaunch`, the real decision (`decideLaunchEngine` over a
 * scripted CrossOver: its bin dir, probe, build and wineserver kill), the engine registry, the
 * launch-settings registry, the bottle ledger, the deadline registry, `watchForGameProcess`
 * (over a scripted `ps` listing and the recording clock), `showEngineDialog`,
 * `showEngineNotice`, `notifyEngineFallback`, the engine-state owner that publishes
 * `engineStateChanged`, and the offline gate's reads of the bottle marker over the fake profile.
 * Scripted: the bottle's existence, the per-game bottle creation, the pinned-engine download
 * (it seeds the installed engine files on success), the engine switch (`prepareBottleForEngine`,
 * its own goldens are 87-11's) and the status line. Every host surface (notification, window
 * raise, in-app dialog frame, acknowledgement id) is a recording fake, so the zero-raise rule for a
 * notice is recorded from the TS run and never typed by hand.
 *
 * Time is one recording clock: every timer set, fire, clear and `unref` (the watcher's) is a trace
 * entry with its fake-clock time, in order, interleaved with the host calls. `advance` moves the
 * clock timer by timer and drains the microtasks between them, so a poll's await finishes before
 * the next one is due.
 *
 * What is recorded per case (result.json): the case's note and every step in order, each with the
 * step's result, the trace entries it produced, the engine registry and overlay state after it, the
 * bottle ledger, the lines written to the game's launch log and the number of events published so
 * far. events.json is the `engineStateChanged` sequence. tree.json is the profile afterwards.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  loadCases,
  normalisePaths,
  pinClock,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile
} from 'backend/testUtils/engineWineOracle/harness'
import {
  fixturesRoot,
  oracleMode
} from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import {
  captureLog,
  type LogLine
} from 'backend/testUtils/engineWineOracle/toolsOracleSupport'
import { createFakeBottleGateRust } from 'backend/testUtils/fakeBottleGateRust'
import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createSpawnAsync } from 'backend/spawnAsync'
import * as i18nModule from 'i18next'
import * as logger from 'backend/logger'
import type { Game } from 'common/types/game_manager'
import type { GameSettings } from 'common/types'
import type { EngineState } from 'common/types/engine'
import type { Clock, TimerHandle } from 'backend/process/types'
import { createEngineRuntime } from '../../engineRuntime'
import { createEngineState } from '../../engineState'
import { ENGINE_PINS } from '../../enginePins'
import { getBottleDir } from '../../bottlePrimitives'
import { perGameBottleName } from '../../perGameBottle'
import { engineKeyFor, type EngineKey } from '../../gameKey'
import { engineLogLabel, type EngineSelection } from '../../engineTypes'
import type { EffectiveEngine } from '../../engineConfig'
import { isCrossoverMissing } from '../../engineDecision'
import type { DemoStatusProbe } from '../../demoStatus'
import type { EngineServices } from '../../engineServices'
import type { EngineNoticeStore } from '../../testedCrossoverVersions'
import {
  armEngineLaunchDeadline,
  endEngineLaunch,
  selectEngineForLaunch,
  type LaunchEngineDeps,
  type LaunchEngineStep
} from '../../launchEngine'
import { watchForGameProcess } from '../../gameProcessWatch'
import { buildEngines, buildBottle, fixtureByName } from './fixtureBottles'

const CRATE = 'gamelib-engine'
const SLICE = 'launch'
/** The case count this plan commits as a floor; a later edit may raise it, never lower it. */
const FLOOR = 5
/** The process-match vectors this plan commits as a floor. */

/** The date the case starts at. */
const START = Date.UTC(2026, 10, 23, 12, 0, 0)
/** The CrossOver bin dir the scripted CrossOver resolves to. */
const BIN =
  '<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
const CX_BUILD = '26.3.0.39832'

type EffectiveName =
  | 'automatic'
  | 'crossover'
  | 'pinned'
  | 'wine-manager'
  | { legacy: string }

type CxName =
  | 'healthy'
  | 'trial'
  | 'expired'
  | 'missing'
  | 'missing-wine'
  | 'not-executable'
  | 'broken'
  | 'unrecognised'
  | 'invalid-bottle'

interface World {
  cx?: CxName
  effective?: EffectiveName
  isMac?: boolean
  /** Does the game's bottle exist (the provisioned check). Default true. */
  provisioned?: boolean
  ensureBottle?: 'done' | 'error'
  ensure?: 'ok' | 'ok-no-files' | 'fail' | 'aborted'
  prepare?:
    | 'ok'
    | 'ok-changed'
    | 'dxvk-failed'
    | 'bottle-busy'
    | 'game-running'
    | 'shared-bottle'
    | 'other'
  prepareSwitching?: boolean
}

interface GameSpec {
  runner?: string
  appName?: string
  title?: string
  native?: boolean
  platform?: string
  /** `$BIN`, `$PERGAME`, `$BOTTLE` and the profile placeholders are expanded. */
  installPath?: string
  settings?: Record<string, unknown>
}

interface Step {
  op:
    | 'select'
    | 'settings'
    | 'prime'
    | 'overlay'
    | 'registry-clear'
    | 'arm'
    | 'advance'
    | 'end'
    | 'quit'
  world?: World
  offline?: boolean
  purpose?: 'launch' | 'setup'
  /** settings: `game`, `null` or a key string. */
  key?: string | null
  stored?: Record<string, unknown>
  /** prime: the selection to register. */
  selection?: 'crossover' | 'pinned'
  /** prime / overlay: `bottle`, `plain` or `none`. */
  prefix?: 'bottle' | 'plain' | 'none'
  action?: 'set' | 'get' | 'clear'
  binDir?: string
  /** arm */
  watcher?: 'real' | 'none'
  nullKey?: true
  listing?: (string | string[])[]
  pollMs?: number
  maxDurationMs?: number
  ms?: number
}

interface LaunchCase {
  id: string
  note: string
  /** The pinned-engine files seeded before the case. */
  engines?: 'installed'
  /** Fixture bottles seeded before the case. */
  bottles?: string[]
  game?: GameSpec
  world?: World
  steps: Step[]
}

type Trace = Record<string, unknown>

const flush = (): Promise<void> => new Promise((r) => setImmediate(r))

/** The pinned selection the `prime` step registers: the current pin, as the decision builds it. */
function pinnedSelection(profile: EngineOracleProfile): EngineSelection {
  const pin = ENGINE_PINS.current
  const bin = join(
    profile.toolsPath,
    'steam-engines',
    pin.id,
    'Contents',
    'Resources',
    'wine',
    'bin'
  )
  return {
    kind: 'pinned',
    pinId: pin.id,
    reason: 'cx-missing',
    wineBin: join(bin, 'wine'),
    wineserverBin: join(bin, 'wineserver'),
    label: pin.label,
    version: pin.wine.version,
    dxvk: {
      dir: join(
        profile.toolsPath,
        'steam-engines',
        `dxvk-macOS-${pin.dxvk.version}`
      ),
      version: pin.dxvk.version
    }
  }
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

function probeFor(cx: CxName): DemoStatusProbe {
  switch (cx) {
    case 'trial':
      return {
        kind: 'ok',
        status: { kind: 'trial', daysRemaining: 5 },
        elapsedMs: 0
      }
    case 'expired':
      return {
        kind: 'ok',
        status: { kind: 'expired', daysAgo: 9 },
        elapsedMs: 0
      }
    case 'broken':
      return {
        kind: 'failed',
        reason: 'nonzero-exit',
        detail: 'exit 3',
        elapsedMs: 0
      }
    case 'unrecognised':
      return { kind: 'ok', status: { kind: 'unrecognised' }, elapsedMs: 0 }
    case 'invalid-bottle':
      return {
        kind: 'failed',
        reason: 'invalid-bottle',
        detail: 'no such bottle',
        elapsedMs: 0
      }
    default:
      return { kind: 'ok', status: { kind: 'licensed' }, elapsedMs: 0 }
  }
}

/** One clock for the case: records every timer set, fire, clear and `unref`. */
function createRecordingClock(rec: (entry: Trace) => void) {
  const fake = createFakeClock(0)
  const dues = new Map<number, number>()
  const clock: Clock = {
    now: () => fake.now(),
    setTimeout(fn, ms, opts) {
      const due = fake.now() + Math.max(0, ms)
      const handle = fake.setTimeout(
        () => {
          dues.delete(handle.id)
          rec({ op: 'timer-fire', at: fake.now(), due })
          fn()
        },
        ms,
        opts
      )
      dues.set(handle.id, due)
      rec({
        op: 'timer-set',
        at: fake.now(),
        ms,
        due,
        keepAlive: opts?.keepAlive?.reason ?? null
      })
      return handle
    },
    setInterval: (fn, ms, opts) => fake.setInterval(fn, ms, opts),
    clear(handle) {
      const due = dues.get(handle.id)
      rec({
        op: 'timer-clear',
        at: fake.now(),
        due: due ?? null,
        pending: due !== undefined
      })
      dues.delete(handle.id)
      fake.clear(handle)
    }
  }
  return {
    clock,
    fake,
    dueOf: (handle: TimerHandle) => dues.get(handle.id) ?? null,
    nextDue: (): number | undefined =>
      dues.size === 0 ? undefined : Math.min(...dues.values())
  }
}

interface SelectedResult {
  kind: string
  key?: string
  selection?: unknown
  prefix?: unknown
}

function summarise(step: LaunchEngineStep): SelectedResult {
  switch (step.kind) {
    case 'skip':
      return { kind: 'skip' }
    case 'legacy':
    case 'refused':
      return { kind: step.kind, key: step.key }
    default:
      return {
        kind: 'use',
        key: step.key,
        selection: step.selection,
        prefix: step.prefix
      }
  }
}

describeSkipOnWindows('launch step oracle (87-15)', () => {
  const cases = loadCases<LaunchCase>(CRATE, SLICE)
  const restorers: (() => void)[] = []
  const spies: jest.SpyInstance[] = []

  // The backend project maps `i18next` to a mock whose `t` returns the key. The goldens record
  // what a user reads, so `t` is routed to a real instance over the shipped English catalogue: a
  // dialog's recorded body carries its interpolated reason, detail, title and seconds.
  let translate: (key: string, ...rest: unknown[]) => string
  beforeAll(async () => {
    const actual = jest.requireActual<typeof import('i18next')>('i18next')
    const instance = actual.createInstance()
    const catalogue = JSON.parse(
      readFileSync(
        join(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          '..',
          'public',
          'locales',
          'en',
          'gamelib.json'
        ),
        'utf8'
      )
    ) as Record<string, unknown>
    await instance.init({
      lng: 'en',
      fallbackLng: 'en',
      ns: ['gamelib'],
      defaultNS: 'gamelib',
      resources: { en: { gamelib: catalogue } },
      interpolation: { escapeValue: false },
      initImmediate: false
    })
    translate = (key, ...rest) =>
      (instance.t as (k: string, ...r: unknown[]) => string)(key, ...rest)
  })

  beforeEach(() => {
    restorers.push(pinClock(START))
    spies.push(
      jest
        .spyOn(i18nModule, 't')
        .mockImplementation(((key: string, ...rest: unknown[]) =>
          translate(key, ...rest)) as never)
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
    await withEngineOracleProfile(async (profile) => {
      const expand = (text: string): string => expandPlaceholders(text, profile)
      if (c.engines) buildEngines(profile.toolsPath, c.engines, expand)
      for (const name of c.bottles ?? []) {
        buildBottle(profile.home, fixtureByName(name), expand)
      }

      const trace: Trace[] = []
      const rec = (entry: Trace): void => {
        trace.push(entry)
      }
      const recording = createRecordingClock(rec)
      const events: { channel: string; args: unknown[] }[] = []
      const store = new Map<string, unknown>()
      const owner = createEngineState({
        publish: (state: EngineState) => {
          events.push({ channel: 'engineStateChanged', args: [state] })
        },
        now: () => START + recording.fake.now(),
        isMac: () => true,
        noticeStore: () =>
          ({
            get: (key: string, fallback: unknown) =>
              store.has(key) ? store.get(key) : fallback,
            set: (key: string, value: unknown) => {
              store.set(key, value)
            }
          }) as unknown as EngineNoticeStore
      })
      const tracer = createSpawnTracer({
        baseEnv: profile.fake.childEnv({}),
        scripted: []
      })
      const gate = createFakeBottleGateRust()
      let ackCounter = 0
      const notices = {
        notifications: {
          show: (n: { title: string; body: string }) => {
            rec({ op: 'notify', title: n.title, body: n.body })
          }
        },
        appState: {
          raiseMainWindow: () => rec({ op: 'raiseMainWindow' }),
          raiseMainWindowForInAppDialog: () =>
            rec({ op: 'raiseMainWindowForInAppDialog' })
        },
        dialogs: {
          displayAcks: {
            newId: () => `ack-${++ackCounter}`,
            track: (ackId: string) => rec({ op: 'trackAck', ackId })
          },
          showErrorBox: () => rec({ op: 'showErrorBox' }),
          showMessageBox: () => rec({ op: 'showMessageBox' })
        },
        sendFrontendMessage: (channel: string, ...args: unknown[]) => {
          rec({ op: 'sendFrontendMessage', channel, args })
          return true
        },
        appRuntime: {}
      }
      const services = {
        spawnAsync: createSpawnAsync({ runner: tracer.runner }),
        runner: tracer.runner,
        installRemove: () => {
          throw new Error('unscripted installRemove')
        },
        paths: profile.paths,
        engineRuntime: createEngineRuntime({
          clock: recording.clock,
          paths: { userHome: profile.home, toolsPath: profile.toolsPath },
          aborts: {
            create: () => ({}) as never,
            delete: () => undefined
          } as never,
          requestRustInvoke: gate.requestRustInvoke
        }),
        wineManagerReleases: () => [],
        globalSettings: (): Record<string, unknown> => ({}),
        globalGameSettings: () => ({}) as GameSettings,
        onlineMonitor: { isOnline: () => true },
        engineState: owner,
        notices
      } as unknown as EngineServices
      const rt = services.engineRuntime

      const spec = c.game ?? {}
      const runner = spec.runner ?? 'legendary'
      const appName = spec.appName ?? 'Quail'
      const title = spec.title ?? 'Quail'
      const perGame = perGameBottleName(runner, appName) ?? ''
      const bottleDir = getBottleDir(services.paths, perGame)
      /** `$ZINSTALL` is the install dir in its `Z:` form (backslashes), set once the dir is known. */
      let zInstall = ''
      const expandValue = <T>(value: T): T => {
        const walk = (node: unknown): unknown => {
          if (typeof node === 'string') {
            return expand(
              node
                .split('$BIN')
                .join(BIN)
                .split('$PERGAME')
                .join(perGame)
                .split('$BOTTLE')
                .join(bottleDir)
                .split('$ZINSTALL')
                .join(zInstall)
            )
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
      const installPath = expandValue(spec.installPath ?? '<HOME>/Games/Quail')
      zInstall = `Z:${installPath.split('/').join('\\')}`
      const storedSettings = expandValue(
        spec.settings ?? {
          wineVersion: {
            type: 'crossover',
            bin: '$BIN/wine',
            name: 'CrossOver'
          },
          wineCrossoverBottle: '$PERGAME',
          winePrefix: '<HOME>/old-prefix'
        }
      ) as unknown as GameSettings
      const game = {
        isNative: () => spec.native === true,
        getGameInfo: () => ({
          runner,
          app_name: appName,
          title,
          install: {
            platform: spec.platform ?? 'windows',
            install_path: installPath
          }
        }),
        getSettings: () => Promise.resolve(storedSettings),
        stop: () => rec({ op: 'game.stop' })
      } as unknown as Game
      const key = engineKeyFor(runner, appName) as EngineKey
      const binDir = expand(BIN)
      const ledgerBottles = [
        ...new Set([perGame, storedSettings.wineCrossoverBottle ?? ''])
      ].filter((b) => b !== '')

      let world: World = { ...(c.world ?? {}) }
      const writerLines: string[] = []
      const logWriter = {
        logInfo: (line: string) => {
          writerLines.push(line)
          return Promise.resolve()
        }
      }

      const decisionDeps = () => {
        const cx = world.cx ?? 'healthy'
        return {
          killCrossoverWineserver: (bottle: string, dir: string) => {
            rec({ op: 'killWineserver', bottle, binDir: dir })
            return Promise.resolve()
          },
          wineManagerReleases: () => [],
          runner: tracer.runner,
          paths: services.paths,
          engineRuntime: services.engineRuntime,
          resolveCrossoverBinDir: () => {
            rec({ op: 'resolveCrossoverBinDir', found: cx !== 'missing' })
            return Promise.resolve(cx === 'missing' ? undefined : binDir)
          },
          fileExists: (p: string) =>
            p.startsWith(binDir) ? cx !== 'missing-wine' : existsSync(p),
          isExecutable: (p: string) =>
            p.startsWith(binDir) && cx !== 'not-executable',
          probe: (args: { bottleName: string }) => {
            rec({ op: 'probe', bottle: args.bottleName })
            return Promise.resolve(probeFor(cx))
          },
          readBuild: () => Promise.resolve(CX_BUILD),
          retrySettleMs: 0
        }
      }

      const overrides = (): Partial<LaunchEngineDeps> => ({
        isMac: () => world.isMac ?? true,
        readEffective: () => effectiveFor(world.effective),
        isProvisioned: (bottle) => {
          rec({ op: 'isProvisioned', bottle })
          return world.provisioned ?? true
        },
        ensureGameBottle: (a) => {
          rec({ op: 'ensureGameBottle', bottle: a.bottleName, key: a.key })
          return Promise.resolve(
            world.ensureBottle === 'error'
              ? { status: 'error' as const, error: 'cxbottle create failed' }
              : {
                  status: 'done' as const,
                  createdHere: true,
                  engine: 'crossover' as const
                }
          )
        },
        isCrossoverMissing: () => isCrossoverMissing(decisionDeps()),
        decisionDeps,
        ensurePinned: (a) => {
          rec({
            op: 'ensurePinned',
            pin: a.pin.id,
            appName: a.appName,
            runner: a.runner
          })
          const mode = world.ensure ?? 'ok'
          if (mode === 'ok') {
            buildEngines(profile.toolsPath, 'installed', expand)
            return Promise.resolve({ ok: true } as never)
          }
          if (mode === 'ok-no-files') {
            return Promise.resolve({ ok: true } as never)
          }
          return Promise.resolve({
            ok: false,
            aborted: mode === 'aborted',
            reason: 'network',
            error: 'connection reset'
          } as never)
        },
        prepare: (a) => {
          rec({
            op: 'prepare',
            key: a.key,
            bottleName: a.bottleName,
            next: engineLogLabel(a.next),
            nextKind: a.next.kind,
            crossoverHealthy: a.crossoverHealthy,
            crossoverSettings: normalisePaths(
              a.deps.crossoverSettings(a.key),
              profile
            )
          })
          if (world.prepareSwitching) a.onSwitching?.()
          const mode = world.prepare ?? 'ok'
          if (mode === 'ok' || mode === 'ok-changed') {
            return Promise.resolve({
              ok: true,
              changed: mode === 'ok-changed'
            } as never)
          }
          return Promise.resolve({
            ok: false,
            reason: mode,
            detail: `scripted ${mode}`
          } as never)
        },
        sendStatus: (update) => rec({ op: 'sendStatus', update })
      })

      const stateAfter = (k: string | null) => ({
        registry:
          k === null ? null : (rt.registry.getEngineSelection(k) ?? null),
        overlay:
          k === null
            ? null
            : (rt.launchSettings.getLaunchOverlayContext(k) ?? null),
        ledger: Object.fromEntries(
          ledgerBottles.map((b) => [b, [...rt.ledger.gamesRunningIn(b)].sort()])
        ),
        activeDeadlines: rt.deadlines.activeCount()
      })

      let armSeq = 0
      const steps: unknown[] = []
      for (const rawStep of c.steps) {
        const step = rawStep
        if (step.world) world = { ...world, ...step.world }
        const traceFrom = trace.length
        const writerFrom = writerLines.length
        let outcome: Record<string, unknown>
        try {
          outcome = await (async (): Promise<Record<string, unknown>> => {
            switch (step.op) {
              case 'select': {
                const result = await selectEngineForLaunch(
                  services,
                  game,
                  {
                    offline: step.offline ?? false,
                    logWriter: logWriter as never,
                    purpose: step.purpose
                  },
                  overrides()
                )
                return { result: summarise(result) }
              }
              case 'settings': {
                const stored = expandValue(
                  step.stored ?? {}
                ) as unknown as GameSettings
                const before = JSON.stringify(stored)
                const target =
                  step.key === undefined || step.key === 'game' ? key : step.key
                const out = rt.launchSettings.getLaunchSettings(target, stored)
                return {
                  key: target,
                  returned: out,
                  sameObject: out === stored,
                  inputUnchanged: JSON.stringify(stored) === before
                }
              }
              case 'prime': {
                const sel: EngineSelection =
                  step.selection === 'pinned'
                    ? pinnedSelection(profile)
                    : {
                        kind: 'crossover',
                        reason: 'cx-healthy',
                        crossoverBuild: CX_BUILD,
                        binDir
                      }
                const accepted = rt.registry.setEngineSelection(key, sel)
                if (step.prefix !== 'none') {
                  rt.launchSettings.setLaunchOverlayContext(
                    key,
                    step.prefix === 'plain'
                      ? { prefix: { kind: 'plain' } }
                      : { prefix: { kind: 'bottle', bottleName: perGame } }
                  )
                }
                return { accepted }
              }
              case 'overlay': {
                if (step.action === 'set') {
                  rt.launchSettings.setLaunchOverlayContext(
                    key,
                    step.prefix === 'plain'
                      ? { prefix: { kind: 'plain' } }
                      : {
                          prefix: { kind: 'bottle', bottleName: perGame },
                          ...(step.binDir === undefined
                            ? {}
                            : { binDir: expandValue(step.binDir) })
                        }
                  )
                } else if (step.action === 'clear') {
                  rt.launchSettings.clearLaunchOverlayContext(key)
                }
                return {
                  context:
                    rt.launchSettings.getLaunchOverlayContext(key) ?? null
                }
              }
              case 'registry-clear':
                rt.registry.clearEngineSelection(key)
                return { cleared: true }
              case 'arm': {
                armSeq += 1
                const listing = step.listing ?? [[]]
                let polls = 0
                armEngineLaunchDeadline(
                  services,
                  game,
                  step.nullKey ? null : key,
                  {
                    watch: (args) => {
                      rec({
                        op: 'watch',
                        installPath: normalisePaths(args.installPath, profile),
                        bottleDir: normalisePaths(args.bottleDir, profile),
                        started: step.watcher !== 'none'
                      })
                      if (step.watcher === 'none') return null
                      return watchForGameProcess({
                        ...args,
                        ...(step.pollMs === undefined
                          ? {}
                          : { pollMs: step.pollMs }),
                        ...(step.maxDurationMs === undefined
                          ? {}
                          : { maxDurationMs: step.maxDurationMs }),
                        deps: {
                          processListing: () => {
                            const item =
                              listing[Math.min(polls, listing.length - 1)]
                            polls += 1
                            rec({
                              op: 'listing',
                              at: recording.fake.now(),
                              n: polls,
                              result: item === 'throw' ? 'throws' : 'lines'
                            })
                            if (item === 'throw') {
                              return Promise.reject(new Error('ps failed'))
                            }
                            const lines = Array.isArray(item)
                              ? item
                              : [item ?? '']
                            return Promise.resolve(
                              expandValue(lines).join('\n')
                            )
                          },
                          setTimer: (fn, ms) => {
                            const handle = recording.clock.setTimeout(fn, ms)
                            return Object.assign(handle, {
                              unref: () =>
                                rec({
                                  op: 'timer-unref',
                                  due: recording.dueOf(handle)
                                })
                            })
                          },
                          clearTimer: (handle) =>
                            recording.clock.clear(handle as TimerHandle),
                          homeDir: () => profile.home
                        }
                      })
                    }
                  }
                )
                return { arm: armSeq }
              }
              case 'advance': {
                const target = recording.fake.now() + (step.ms ?? 0)
                for (;;) {
                  const next = recording.nextDue()
                  if (next === undefined || next > target) break
                  // `Date` reads the due time while the timer fires (the watcher logs its age).
                  jest.setSystemTime(START + next)
                  recording.fake.advance(next - recording.fake.now())
                  await flush()
                }
                jest.setSystemTime(START + target)
                recording.fake.advance(target - recording.fake.now())
                await flush()
                return { now: recording.fake.now() }
              }
              case 'end':
                endEngineLaunch(rt, key)
                return { ended: true }
              default:
                // quit: the host exits with whatever is armed. Nothing is cancelled and nothing
                // fires; what is left is what keeps (or does not keep) the process alive.
                return {
                  activeDeadlines: rt.deadlines.activeCount(),
                  pendingTimers: recording.fake.pendingCount(),
                  keepAliveReasons: recording.fake.keepAliveReasons()
                }
            }
          })()
        } catch (error) {
          outcome = {
            threw: error instanceof Error ? error.message : String(error)
          }
        }
        steps.push(
          normalisePaths(
            {
              step: rawStep,
              ...outcome,
              trace: trace.slice(traceFrom),
              launchLog: writerLines.slice(writerFrom),
              after: stateAfter(key),
              eventsSoFar: events.length
            },
            profile
          )
        )
      }

      writeOrCompareGolden(CRATE, SLICE, c.id, {
        result: normalisePaths({ note: c.note, steps, logs }, profile),
        events: normalisePaths(events, profile),
        after: normalisePaths(snapshotTree(profile.home), profile),
        spawns: normalisePaths([...tracer.records], profile)
      })
    })
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
      'skip-native',
      'legacy-override',
      'use-crossover-healthy',
      'fallback-cx-missing-pin-installed',
      'launch-settings-crossover-overlay'
    ]) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('the pinned-fallback case records the fallback toast notification', () => {
    if (oracleMode() === 'write') return
    const file = join(
      fixturesRoot(CRATE),
      'golden',
      SLICE,
      'expected',
      'fallback-cx-missing-pin-installed',
      'result.json'
    )
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('CrossOver not found — using built-in engine')
  })
})
