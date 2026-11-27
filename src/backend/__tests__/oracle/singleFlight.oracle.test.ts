/**
 * The launch single-flight oracle (88.3-02, D-04, D-11, D-15, D-20, D-25): the TS `createLaunchFlights` table
 * (`src/backend/launchSingleFlight.ts`) recorded as the golden the Rust single flight (88.3-04) has to reproduce, before
 * any Rust single flight exists. Write mode exists in this file and nowhere else.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/single_flight/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), an object keyed by delta name
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json   what each caller finally received (or `pending`) and what the table still held
 *   expected/<case>/events.json   the ordered transcript of one case (see `Ev` below)
 *   (requests.json, spawns.json and tree.json are the harness's fixed files; a flight spawns nothing)
 *
 * A case is a step list over `createLaunchFlights()` tables:
 *   begin <caller>   a caller asks to run `<runner>:<app>` with a scripted body (`hold` never settles by itself)
 *   settle / reject  the held body of a caller resolves a value or rejects with a word
 *   await <caller>   the case waits for that caller's promise (optionally one microtask more)
 *   probe <caller>   asks again with a body that resolves at once: it RUNS when the entry was released and JOINS when
 *                    it was not, which is the only way to observe the private map
 *   flush            drains microtasks and one macrotask
 * and the transcript holds `step`, `run <caller>`, `joined <caller>` (and whether the joiner got the owner's own promise),
 * `onJoin <caller>` (and what the notifier did), `received <caller>`, `released <key>` / `still-held <key>`.
 *
 * A second family drives the same table through the real launcher entry,
 * `createLauncher(createFakeLauncherDeps(...).deps).launchEventCallback`, over a scripted game whose launch is held, and
 * records the WR-03 joiner line (a `logInfo` spy), the gameStatusUpdate pushes and every per-game log entry, so the
 * golden proves a joiner opens no second per-game log.
 *
 * Census (D-04, D-15): every title of `launchSingleFlight.test.ts` and `launcher_launchSingleFlight.test.ts`, and the
 * flight titles of `appRuntime.test.ts`, `launchDispatch.test.ts` and `adoptionStatus.test.ts`, is a named case; the other
 * titles of those three files are listed in `NOT_PORTED` with the phase that owns them.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * Behaviour that looks wrong is kept as recorded and listed in the plan SUMMARY under `D-20 candidates` (D-20); a fix is
 * never mixed into a golden diff.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import * as logger from 'backend/logger'
import * as environment from 'backend/constants/environment'
import { createLauncher, type LauncherDeps } from 'backend/launcher'
import {
  createLaunchFlights,
  type LaunchFlights
} from 'backend/launchSingleFlight'
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
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import { createFakeLauncherDeps } from 'backend/testUtils/launchOracle/fakeLauncherDeps'
import { PINNED_NOW } from 'backend/testUtils/launchOracle/funnelTrace'
import {
  injectPlatform,
  injectProbe,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import type { GameInfo, GameSettings, Runner } from 'common/types'
import type LogWriter from 'backend/logger/targetWriter'

const CRATE = 'gamelib-launch'
const SLICE = 'single_flight'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const SINGLE_FLIGHT_FLOOR = 24

const mode = engineWineOracleMode()

// ---- the case language -----------------------------------------------------------------------

/** What the owner's body does: never settles by itself, or settles at once. */
type Body = 'hold' | { resolves: unknown } | { rejects: string }
/** What the notifier does: nothing is passed, records, records and throws, records and returns a rejected promise. */
type OnJoin = 'none' | 'notify' | 'notify-steam' | 'throws' | 'rejects'
/** How long the case waits after a step: a macrotask (the default), one microtask, or not at all. */
type Settle = 'macro' | 'micro' | 'none'

type FlightStep =
  | {
      op: 'begin'
      caller: string
      runner: string
      app: string
      /** Which table the call goes to; two tables share nothing. Default `main`. */
      table?: string
      onJoin?: OnJoin
      body?: Body
      settle?: Settle
    }
  | { op: 'settle'; caller: string; value: unknown; settle?: Settle }
  | { op: 'reject'; caller: string; word: string; settle?: Settle }
  | { op: 'await'; caller: string; settle?: Settle }
  | {
      op: 'probe'
      caller: string
      runner: string
      app: string
      table?: string
    }
  | { op: 'flush' }

interface FlightCase {
  id: string
  /** What the case pins; it only reads well in `cases.json`. */
  note: string
  kind: 'flights'
  steps: FlightStep[]
}

/** What the scripted launcher world looks like: only what a flight case needs. */
interface LauncherScenario {
  online: boolean
  gameSettings: Partial<GameSettings>
  /** `info_recent_add` rejects with this message (CR-41); absent = it resolves. */
  recentAddRejects?: string
}

type LauncherStep =
  | { op: 'call'; caller: string; app: string }
  /** Resolves the nth `game.launch(...)` the case made (0-based). */
  | { op: 'finish'; launch: number; value: boolean }
  | { op: 'await'; caller: string }
  | { op: 'flush' }

interface LauncherCase {
  id: string
  note: string
  kind: 'launcher'
  scenario: LauncherScenario
  steps: LauncherStep[]
}

type FlightsOrLauncherCase = FlightCase | LauncherCase

type Ev = Record<string, unknown>
interface Recorded {
  result: unknown
  events: Ev[]
}

const flush = (settle: Settle = 'macro'): Promise<void> =>
  settle === 'none'
    ? Promise.resolve()
    : settle === 'micro'
      ? Promise.resolve()
      : new Promise<void>((resolve) => setImmediate(resolve))

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** A JSON snapshot taken now. */
function snap<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) =>
      v instanceof Error ? `${v.name}: ${v.message}` : v
    )
  ) as T
}

/** A rejection carries the message and no stack, so no source path reaches a committed golden. */
function scriptedError(message: string): Error {
  const error = new Error(message)
  error.stack = `Error: ${message}`
  return error
}

// ---- the flight recorder ---------------------------------------------------------------------

interface Deferred {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

/** Runs one flights case over fresh tables and returns its transcript. */
async function runFlightCase(c: FlightCase): Promise<Recorded> {
  const events: Ev[] = []
  const tables = new Map<string, LaunchFlights>()
  const tableOf = (name = 'main'): LaunchFlights => {
    let table = tables.get(name)
    if (!table) {
      table = createLaunchFlights()
      tables.set(name, table)
    }
    return table
  }
  /** The promise the latest owner of `table|key` got, to tell whether a joiner received that same promise. */
  const owners = new Map<string, Promise<unknown>>()
  const deferreds = new Map<string, Deferred>()
  const promises = new Map<string, Promise<unknown>>()
  const received = new Map<string, Ev>()

  const call = (
    caller: string,
    runner: string,
    app: string,
    table: string | undefined,
    onJoin: OnJoin,
    body: Body
  ): void => {
    const key = `${runner}:${app}`
    const ownerKey = `${table ?? 'main'}|${key}`
    let ran = false
    const run = (): Promise<unknown> => {
      ran = true
      events.push({ event: 'run', caller, key })
      if (body === 'hold') {
        return new Promise<unknown>((resolve, reject) => {
          deferreds.set(caller, { resolve, reject })
        })
      }
      return 'rejects' in body
        ? Promise.reject(scriptedError(body.rejects))
        : Promise.resolve(body.resolves)
    }
    const notify = (): void | Promise<void> => {
      const entry: Ev = { event: 'onJoin', caller, key }
      if (onJoin === 'notify-steam') entry.notice = 'already starting'
      if (onJoin === 'throws') entry.does = 'throws'
      if (onJoin === 'rejects') entry.does = 'rejects'
      events.push(entry)
      if (onJoin === 'throws') throw scriptedError('notify failed')
      if (onJoin === 'rejects') {
        return Promise.reject(scriptedError('notify rejected'))
      }
      return undefined
    }
    const promise = tableOf(table).singleFlightLaunch(
      runner,
      app,
      onJoin === 'none' ? () => undefined : notify,
      run
    )
    if (ran) {
      owners.set(ownerKey, promise)
    } else {
      events.push({
        event: 'joined',
        caller,
        key,
        samePromiseAsOwner: owners.get(ownerKey) === promise
      })
    }
    promises.set(caller, promise)
    promise.then(
      (value) => {
        const entry: Ev = { event: 'received', caller, value: snap(value) }
        events.push(entry)
        received.set(caller, entry)
      },
      (error: unknown) => {
        const entry: Ev = {
          event: 'received',
          caller,
          rejected: messageOf(error)
        }
        events.push(entry)
        received.set(caller, entry)
      }
    )
  }

  const held = (caller: string): Deferred => {
    const found = deferreds.get(caller)
    if (!found) throw new Error(`case ${c.id}: ${caller} holds no body`)
    return found
  }

  for (const step of c.steps) {
    events.push({ event: 'step', ...snap(step) })
    if (step.op === 'begin') {
      call(
        step.caller,
        step.runner,
        step.app,
        step.table,
        step.onJoin ?? 'none',
        step.body ?? 'hold'
      )
      await flush(step.settle)
    } else if (step.op === 'settle') {
      held(step.caller).resolve(step.value)
      await flush(step.settle)
    } else if (step.op === 'reject') {
      held(step.caller).reject(scriptedError(step.word))
      await flush(step.settle)
    } else if (step.op === 'await') {
      const promise = promises.get(step.caller)
      if (!promise) throw new Error(`case ${c.id}: no caller ${step.caller}`)
      await promise.then(
        () => undefined,
        () => undefined
      )
      if (step.settle === 'micro') await Promise.resolve()
      else await flush(step.settle)
    } else if (step.op === 'probe') {
      const key = `${step.runner}:${step.app}`
      const before = events.length
      call(step.caller, step.runner, step.app, step.table, 'none', {
        resolves: 'probe'
      })
      const probeEvents = events.splice(before)
      const joined = probeEvents.some((e) => e.event === 'joined')
      events.push(
        joined ? { event: 'still-held', key } : { event: 'released', key }
      )
      await flush()
    } else {
      await flush()
    }
  }
  await flush()

  const outcome: Record<string, unknown> = {}
  const pending: string[] = []
  for (const caller of promises.keys()) {
    const entry = received.get(caller)
    if (!entry) pending.push(caller)
    else if ('rejected' in entry) outcome[caller] = { rejected: entry.rejected }
    else outcome[caller] = { value: entry.value }
  }
  const recorded: Recorded = snap({
    result: { received: outcome, pending },
    events
  })
  // Release every body the case left held, so nothing outlives the case.
  for (const deferred of deferreds.values()) deferred.resolve(null)
  await flush()
  return recorded
}

// ---- the launcher recorder -------------------------------------------------------------------

/** jest's modern fake timers fake ONLY `Date`; every timer and microtask stays real. */
const REAL_EVERYTHING_BUT_DATE = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout'
] as const

const LAUNCH_RUNNERS: readonly Runner[] = [
  'legendary',
  'gog',
  'nile',
  'sideload',
  'steam'
]

/** Runs one launcher case: the real `launchEventCallback` over a scripted game whose launch is held. */
function runLauncherCase(c: LauncherCase): Promise<Recorded> {
  const s = c.scenario
  return withEngineOracleProfile(async (profile) => {
    const events: Ev[] = []
    const push = (event: Ev): void => {
      events.push(event)
    }
    const launchResolvers: ((value: boolean) => void)[] = []
    const promises = new Map<string, Promise<{ status: string }>>()
    const received = new Map<string, Ev>()

    const game = (appName: string) => ({
      isNative: () => true,
      getGameInfo: () =>
        ({
          app_name: appName,
          runner: 'legendary',
          title: appName,
          install: {}
        }) as unknown as GameInfo,
      getSettings: () => Promise.resolve(structuredClone(s.gameSettings)),
      launch: (_writer: LogWriter, ...rest: unknown[]) => {
        push({ event: 'launch', app: appName, args: snap(rest) })
        return new Promise<boolean>((resolve) => {
          launchResolvers.push(resolve)
        })
      },
      syncSaves: (...args: unknown[]) => {
        push({ event: 'syncSaves', app: appName, args: snap(args) })
        return Promise.resolve('')
      }
    })
    const libraryManagers = Object.fromEntries(
      LAUNCH_RUNNERS.map((runner) => [
        runner,
        { getGame: (appName: string) => game(appName) }
      ])
    ) as unknown as LauncherDeps['libraryManagers']
    const launchHooks = Object.fromEntries(
      LAUNCH_RUNNERS.map((runner) => [runner, {}])
    ) as unknown as LauncherDeps['launchHooks']

    const requestRustInvoke = ((channel: string, args: unknown[]) => {
      const event: Ev = { event: 'rust', channel, args: snap(args) }
      push(event)
      if (channel === 'engine_launch_select') {
        event.reply = { kind: 'skip' }
        return Promise.resolve({ kind: 'skip' })
      }
      if (channel === 'info_recent_add') {
        if (s.recentAddRejects !== undefined) {
          event.rejected = s.recentAddRejects
          return Promise.reject(scriptedError(s.recentAddRejects))
        }
        event.reply = null
        return Promise.resolve(null)
      }
      event.rejected = `unscripted rust channel "${channel}"`
      return Promise.reject(
        scriptedError(`single flight oracle: unscripted rust "${channel}"`)
      )
    }) as unknown as LauncherDeps['requestRustInvoke']

    const sendFrontendMessage = ((channel: string, ...args: unknown[]) => {
      push({ event: 'frontend', channel, args: snap(args) })
    }) as unknown as LauncherDeps['sendFrontendMessage']
    const bus = {
      emit: (channel: string, ...args: unknown[]) => {
        push({ event: 'bus', channel, args: snap(args) })
        return true
      }
    } as unknown as LauncherDeps['appRuntime']['events']

    const record = (member: string) => (): void => {
      push({ event: 'appState', member })
    }
    const appState = {
      raiseMainWindow: record('raiseMainWindow'),
      raiseMainWindowForInAppDialog: record('raiseMainWindowForInAppDialog'),
      hideMainWindow: record('hideMainWindow'),
      exit: record('exit'),
      wakeLock: {
        start: () => {
          push({ event: 'appState', member: 'wakeLock.start' })
          return 7
        },
        stop: () => {
          push({ event: 'appState', member: 'wakeLock.stop' })
        },
        isStarted: () => false
      }
    } as unknown as LauncherDeps['appState']

    const tsStore = {
      has: () => true,
      get: (_key: string, fallback: unknown) => fallback,
      set: (key: string, value: unknown) => {
        push({ event: 'tsStore', key, value: snap(value) })
      }
    }
    const stores = {
      kvs: { tsStore },
      runsForMe: {
        runsForMeStore: {
          get: (_key: string, fallback: unknown) => fallback,
          set: (key: string, value: unknown) => {
            push({ event: 'runsForMe', key, value: snap(value) })
          }
        }
      }
    } as unknown as LauncherDeps['stores']
    const config = {
      getSettings: () => ({
        minimizeOnLaunch: false,
        noTrayIcon: true,
        disableLogs: false,
        disablePlaytimeSync: true
      }),
      setSetting: () => undefined
    } as unknown as LauncherDeps['config']
    const gameConfigs = {
      get: () => ({
        getSettings: () => Promise.resolve({ verboseLogs: true }),
        setSetting: () => undefined
      })
    } as unknown as LauncherDeps['gameConfigs']

    const fake = createFakeLauncherDeps(profile, {
      overrides: {
        requestRustInvoke,
        sendFrontendMessage,
        appRuntime: { events: bus, launchFlights: createLaunchFlights() },
        libraryManagers,
        launchHooks,
        appState,
        stores,
        config,
        gameConfigs,
        onlineMonitor: { isOnline: () => s.online }
      } as Partial<LauncherDeps>
    })

    const restores = [
      injectPlatform('linux'),
      injectProbe(environment, 'isCLINoGui', false)
    ]
    await withInjected(restores, () =>
      withPinnedBaseEnv(profile.fake, async () => {
        jest.useFakeTimers({
          now: PINNED_NOW,
          doNotFake: [...REAL_EVERYTHING_BUT_DATE]
        })
        const general =
          (level: string) =>
          (text: unknown, prefix?: unknown): void => {
            push({
              event: 'log',
              level,
              prefix: snap(prefix ?? null),
              text: snap(text)
            })
          }
        const spies = [
          jest.spyOn(logger, 'logInfo').mockImplementation(general('info')),
          jest
            .spyOn(logger, 'logWarning')
            .mockImplementation(general('warning')),
          jest.spyOn(logger, 'logError').mockImplementation(general('error')),
          jest.spyOn(logger, 'logDebug').mockImplementation(general('debug')),
          // Calls through: the writer is real, only the open is recorded (a joiner must open none).
          jest
            .spyOn(logger, 'createGameLogWriter')
            .mockImplementation((...args) => {
              push({ event: 'openGameLog', args: snap(args) })
              return realCreateGameLogWriter(...args)
            }),
          jest
            .spyOn(logger, 'enqueueLogEntry')
            .mockImplementation((target, rotate, entry) => {
              push(
                'raw' in entry
                  ? {
                      event: 'gameLog',
                      target: snap(target),
                      rotate,
                      raw: entry.raw
                    }
                  : {
                      event: 'gameLog',
                      target: snap(target),
                      rotate,
                      level: entry.line.level,
                      prefix: entry.line.prefix,
                      text: snap(entry.line.msg)
                    }
              )
            }),
          jest
            .spyOn(logger, 'logLine')
            .mockImplementation((target, rotate, level, prefix, message) => {
              push({
                event: 'gameLog',
                target: snap(target),
                rotate,
                level,
                prefix,
                text: snap(message)
              })
            })
        ]
        try {
          const launcher = createLauncher(fake.deps)
          for (const step of c.steps) {
            push({ event: 'step', ...snap(step) })
            if (step.op === 'call') {
              const promise = launcher.launchEventCallback({
                appName: step.app,
                runner: 'legendary'
              })
              promises.set(step.caller, promise)
              promise.then(
                (value) => {
                  const entry: Ev = {
                    event: 'received',
                    caller: step.caller,
                    status: value.status
                  }
                  push(entry)
                  received.set(step.caller, entry)
                },
                (error: unknown) => {
                  const entry: Ev = {
                    event: 'received',
                    caller: step.caller,
                    rejected: messageOf(error)
                  }
                  push(entry)
                  received.set(step.caller, entry)
                }
              )
              await flush()
            } else if (step.op === 'finish') {
              const resolve = launchResolvers[step.launch]
              if (!resolve) {
                throw new Error(`case ${c.id}: no launch ${step.launch} yet`)
              }
              resolve(step.value)
              await flush()
            } else if (step.op === 'await') {
              const promise = promises.get(step.caller)
              if (!promise) {
                throw new Error(`case ${c.id}: no caller ${step.caller}`)
              }
              await promise.then(
                () => undefined,
                () => undefined
              )
              await flush()
            } else {
              await flush()
            }
          }
          await flush()
        } finally {
          for (const spy of spies) spy.mockRestore()
          jest.useRealTimers()
        }
      })
    )
    const outcome: Record<string, unknown> = {}
    const pending: string[] = []
    for (const caller of promises.keys()) {
      const entry = received.get(caller)
      if (!entry) pending.push(caller)
      else if ('rejected' in entry) {
        outcome[caller] = { rejected: entry.rejected }
      } else outcome[caller] = { status: entry.status }
    }
    // Nothing the case left held may outlive it.
    for (const resolve of launchResolvers) resolve(true)
    await flush()
    return normalisePaths(
      snap({ result: { received: outcome, pending }, events }),
      profile
    )
  })
}

/** The unspied writer factory, taken before any spy exists. */
const realCreateGameLogWriter = logger.createGameLogWriter

function recordCase(c: FlightsOrLauncherCase): Promise<Recorded> {
  return c.kind === 'flights' ? runFlightCase(c) : runLauncherCase(c)
}

// ---- the cases -------------------------------------------------------------------------------

const begin = (
  caller: string,
  runner: string,
  app: string,
  extra: Partial<Omit<Extract<FlightStep, { op: 'begin' }>, 'op'>> = {}
): FlightStep => ({ op: 'begin', caller, runner, app, ...extra })
const settle = (caller: string, value: unknown): FlightStep => ({
  op: 'settle',
  caller,
  value
})
const reject = (caller: string, word: string): FlightStep => ({
  op: 'reject',
  caller,
  word
})
const probe = (caller: string, runner: string, app: string): FlightStep => ({
  op: 'probe',
  caller,
  runner,
  app
})
const flights = (
  id: string,
  note: string,
  steps: FlightStep[]
): FlightCase => ({ id, note, kind: 'flights', steps })

/** The tracer (88.3-02 Task 1): one join, recorded through `createLaunchFlights`. */
function tracerCases(): FlightsOrLauncherCase[] {
  return [
    flights(
      'single-flight--a-second-begin-joins-the-first',
      "the tracer: a second begin on the same key runs nothing, its notifier runs once, both callers get the owner's result",
      [
        begin('a', 'steam', '1'),
        begin('b', 'steam', '1', { onJoin: 'notify' }),
        settle('a', 'ok')
      ]
    )
  ]
}

/** The five titles of `launchSingleFlight.test.ts`. */
function launchSingleFlightCases(): FlightsOrLauncherCase[] {
  const stem = 'launchSingleFlight'
  return [
    flights(
      `${stem}--${slug('singleFlightLaunch > joins a concurrent same-key call: run once, onJoin once, same result')}`,
      'two concurrent callers on steam:1: the body runs once, the notifier once, both receive ok',
      [
        begin('a', 'steam', '1', { onJoin: 'notify' }),
        begin('b', 'steam', '1', { onJoin: 'notify' }),
        settle('a', 'ok')
      ]
    ),
    flights(
      `${stem}--${slug('singleFlightLaunch > does not join a different appName or runner')}`,
      'steam:1 held; steam:2 and gog:1 each run their own body and no notifier fires',
      [
        begin('hold', 'steam', '1', { onJoin: 'notify' }),
        begin('other-app', 'steam', '2', {
          onJoin: 'notify',
          body: { resolves: true }
        }),
        begin('other-runner', 'gog', '1', {
          onJoin: 'notify',
          body: { resolves: true }
        }),
        settle('hold', true)
      ]
    ),
    flights(
      `${stem}--${slug('singleFlightLaunch > releases after settle so a later call runs again')}`,
      'a body that settled releases its entry: the probe after it runs instead of joining',
      [
        begin('a', 'steam', '1', { body: { resolves: 1 } }),
        probe('later', 'steam', '1')
      ]
    ),
    flights(
      `${stem}--${slug('singleFlightLaunch > owner rejection rejects both callers and releases')}`,
      'the owner rejects: both callers reject with boom and the entry is released',
      [
        begin('a', 'steam', '1'),
        begin('b', 'steam', '1', { onJoin: 'notify' }),
        reject('a', 'boom'),
        probe('again', 'steam', '1')
      ]
    ),
    flights(
      `${stem}--${slug('singleFlightLaunch > a throwing onJoin does not reject the joiner')}`,
      "a notifier that throws is swallowed: the joiner still receives the owner's ok",
      [
        begin('a', 'steam', '1'),
        begin('b', 'steam', '1', { onJoin: 'throws' }),
        settle('a', 'ok')
      ]
    )
  ]
}

/** The flight titles of `appRuntime.test.ts` (its other titles are `NOT_PORTED`). */
function appRuntimeCases(): FlightsOrLauncherCase[] {
  const stem = 'appRuntime'
  return [
    flights(
      `${stem}--${slug('launch single-flight > joins a second launch of the same game and runs the owner once')}`,
      'gog:g1 on one runtime: the owner body runs once, the notifier once, both receive done',
      [
        begin('first', 'gog', 'g1', { onJoin: 'notify' }),
        begin('second', 'gog', 'g1', { onJoin: 'notify' }),
        settle('first', 'done')
      ]
    ),
    flights(
      `${stem}--${slug('launch single-flight > releases the entry when the owner settles')}`,
      "the entry is already gone one microtask after the owner's promise is awaited (the finally runs before the awaiter)",
      [
        begin('first', 'gog', 'g1', {
          body: { resolves: 'x' },
          settle: 'none'
        }),
        { op: 'await', caller: 'first', settle: 'micro' },
        probe('second', 'gog', 'g1')
      ]
    ),
    flights(
      `${stem}--${slug('launch single-flight > does not join across runtimes')}`,
      'two tables share nothing: the same key on table b runs its own body while table a holds the owner',
      [
        begin('owner-a', 'gog', 'g1', { table: 'a' }),
        begin('other-b', 'gog', 'g1', {
          table: 'b',
          body: { resolves: null }
        }),
        settle('owner-a', null)
      ]
    )
  ]
}

/** The flight titles of `launchDispatch.test.ts` (its other titles are `NOT_PORTED`): the Steam notice is the notifier. */
function launchDispatchCases(): FlightsOrLauncherCase[] {
  const stem = 'launchDispatch'
  return [
    flights(
      `${stem}--${slug('WR-03: single-flight at the launch IPC entry > two concurrent dispatches launch once, record once, notify once')}`,
      'two dispatches of steam:999003: the body (launch and recent-game write) runs once, the already-starting notice fires once, both receive true',
      [
        begin('a', 'steam', '999003', { onJoin: 'notify-steam' }),
        begin('b', 'steam', '999003', { onJoin: 'notify-steam' }),
        settle('a', true)
      ]
    ),
    flights(
      `${stem}--${slug('WR-03: single-flight at the launch IPC entry > releases after settle: a later dispatch launches again')}`,
      'a settled dispatch releases the entry: the next dispatch of steam:999003 runs its own body',
      [
        begin('a', 'steam', '999003', {
          onJoin: 'notify-steam',
          body: { resolves: true }
        }),
        probe('later', 'steam', '999003')
      ]
    ),
    flights(
      `${stem}--${slug('Phase 81 D-05: the one-shot launch without Steam from the refused-restart notice > joins the Steam single flight: a second press gets the already-starting notice and launches nothing more')}`,
      'the without-Steam press and a second press share the steam flight: one body, one notice, both receive true',
      [
        begin('a', 'steam', '999003', { onJoin: 'notify-steam' }),
        begin('b', 'steam', '999003', { onJoin: 'notify-steam' }),
        settle('a', true)
      ]
    )
  ]
}

/** The restart-join title of `adoptionStatus.test.ts` (its other titles are `NOT_PORTED`). */
function adoptionStatusCases(): FlightsOrLauncherCase[] {
  const stem = 'adoptionStatus'
  return [
    flights(
      `${stem}--${slug('restartSteamNowForAdoption (D-02) > a second click and a Play pressed meanwhile join the flight: in-progress, one restart, no recent game (T-81-28)')}`,
      'the restart owns steam:APP, a second click and a Play both join (the notifier only sets a flag), the flight resolves false so a joining Play records no recent game',
      [
        begin('restart', 'steam', '112100', { onJoin: 'notify' }),
        begin('second-click', 'steam', '112100', { onJoin: 'notify' }),
        begin('play', 'steam', '112100', { onJoin: 'notify-steam' }),
        settle('restart', false)
      ]
    )
  ]
}

/** One more flight case beyond the titles: a held leader keeps every joiner waiting. */
function heldLeaderCases(): FlightsOrLauncherCase[] {
  return [
    flights(
      'single-flight--a-held-leader-keeps-its-joiners-waiting',
      'the leader never settles: two joiners are notified and receive nothing, and the entry is still held when probed',
      [
        begin('leader', 'steam', '1'),
        begin('joiner-1', 'steam', '1', { onJoin: 'notify' }),
        begin('joiner-2', 'steam', '1', { onJoin: 'notify-steam' }),
        probe('late', 'steam', '1')
      ]
    ),
    flights(
      'single-flight--a-rejecting-onjoin-does-not-reject-the-joiner',
      'a notifier that returns a rejected promise is swallowed as well: the joiner still receives ok',
      [
        begin('a', 'steam', '1'),
        begin('b', 'steam', '1', { onJoin: 'rejects' }),
        settle('a', 'ok')
      ]
    ),
    flights(
      'single-flight--a-joiner-gets-the-owners-own-promise',
      "the joiner is handed the owner's promise object itself, not a derived one (samePromiseAsOwner)",
      [
        begin('a', 'steam', '1'),
        begin('b', 'steam', '1', { onJoin: 'notify' }),
        settle('a', 7)
      ]
    ),
    flights(
      'single-flight--the-key-is-runner-and-app-name-joined-by-a-colon',
      'runner "a" with app "b:c" and runner "a:b" with app "c" make the same key `a:b:c`, so the second joins (recorded as the TS behaves)',
      [
        begin('first', 'a', 'b:c', { onJoin: 'notify' }),
        begin('second', 'a:b', 'c', { onJoin: 'notify' }),
        settle('first', 1)
      ]
    ),
    flights(
      'single-flight--a-rejected-owner-releases-and-the-next-begin-runs',
      'after an owner rejection the entry is gone: a new begin runs its own body and resolves',
      [
        begin('a', 'steam', '1', { body: { rejects: 'boom' } }),
        begin('b', 'steam', '1', { body: { resolves: 'fresh' } })
      ]
    ),
    flights(
      'single-flight--an-owner-that-settles-before-the-joiner-asks-does-not-join',
      'the owner settled and was released in an earlier step: a later begin on the same key runs its own body',
      [
        begin('a', 'steam', '1', { body: { resolves: 'one' } }),
        begin('b', 'steam', '1', {
          onJoin: 'notify',
          body: { resolves: 'two' }
        })
      ]
    )
  ]
}

/** The five titles of `launcher_launchSingleFlight.test.ts`, driven through the real launcher entry. */
function launcherCases(): FlightsOrLauncherCase[] {
  const stem = 'launcher_launchSingleFlight'
  const base: LauncherScenario = {
    online: false,
    gameSettings: { verboseLogs: true }
  }
  const title = (t: string): string => `${stem}--${slug(t)}`
  return [
    {
      id: title(
        'launchEventCallback single-flight (WR-03) > runs the body once for two concurrent calls and shares the result'
      ),
      note: 'two concurrent launches of Quail: one launch, one per-game log, two launching pushes and one done push; the joiner line is logged once; both callers receive done',
      kind: 'launcher',
      scenario: base,
      steps: [
        { op: 'call', caller: 'a', app: 'Quail' },
        { op: 'call', caller: 'b', app: 'Quail' },
        { op: 'finish', launch: 0, value: true },
        { op: 'await', caller: 'a' },
        { op: 'await', caller: 'b' }
      ]
    },
    {
      id: title(
        'launchEventCallback single-flight (WR-03) > releases after settle: a later call launches again'
      ),
      note: 'after the first launch settled, a second Play launches again (two launches, two per-game logs)',
      kind: 'launcher',
      scenario: base,
      steps: [
        { op: 'call', caller: 'a', app: 'Quail' },
        { op: 'finish', launch: 0, value: true },
        { op: 'await', caller: 'a' },
        { op: 'call', caller: 'b', app: 'Quail' },
        { op: 'finish', launch: 1, value: true },
        { op: 'await', caller: 'b' }
      ]
    },
    {
      id: title(
        'launchEventCallback single-flight (WR-03) > does not join a different appName'
      ),
      note: 'Quail and Wren launch at once: two launches, no joiner line',
      kind: 'launcher',
      scenario: base,
      steps: [
        { op: 'call', caller: 'a', app: 'Quail' },
        { op: 'call', caller: 'b', app: 'Wren' },
        { op: 'finish', launch: 0, value: true },
        { op: 'finish', launch: 1, value: true },
        { op: 'await', caller: 'a' },
        { op: 'await', caller: 'b' }
      ]
    },
    {
      id: title(
        'launchEventCallback single-flight (WR-03) > CR-41: a rejected recent-games write still finishes the launch > CR-41: offline, resolves done, sends done once and logs the failure'
      ),
      note: 'offline, info_recent_add rejects with write-failed: the launch still resolves done, done is sent once and the failure is one warning',
      kind: 'launcher',
      scenario: { ...base, recentAddRejects: 'info_recent_add:write-failed' },
      steps: [
        { op: 'call', caller: 'a', app: 'Quail' },
        { op: 'finish', launch: 0, value: true },
        { op: 'await', caller: 'a' }
      ]
    },
    {
      id: title(
        'launchEventCallback single-flight (WR-03) > CR-41: a rejected recent-games write still finishes the launch > CR-41: online with autoSyncSaves, the save upload still runs'
      ),
      note: 'online with autoSyncSaves, info_recent_add rejects: the save upload still runs and done is sent twice (once before the upload, once after)',
      kind: 'launcher',
      scenario: {
        online: true,
        gameSettings: {
          verboseLogs: true,
          autoSyncSaves: true,
          savesPath: '/saves'
        },
        recentAddRejects: 'info_recent_add:write-failed'
      },
      steps: [
        { op: 'call', caller: 'a', app: 'Quail' },
        { op: 'finish', launch: 0, value: true },
        { op: 'await', caller: 'a' }
      ]
    }
  ]
}

function singleFlightCases(): FlightsOrLauncherCase[] {
  return [
    ...tracerCases(),
    ...launchSingleFlightCases(),
    ...launcherCases(),
    ...appRuntimeCases(),
    ...launchDispatchCases(),
    ...adoptionStatusCases(),
    ...heldLeaderCases()
  ]
}

// ---- the census (D-04, D-15) -----------------------------------------------------------------

/** Titles of the three Steam and runtime files that are not about the flight, with the phase that owns them. */
const NOT_PORTED: Record<string, Record<string, string>> = {
  appRuntime: {
    'createAppRuntime > construction arms no timer and adds no listener':
      'Phase 98 (the runtime bus and boot-owned app runtime): not about the launch flight',
    'createAppRuntime > two runtimes have independent event buses':
      'Phase 98 (the runtime bus and boot-owned app runtime): not about the launch flight',
    'createAppRuntime > carries the typed progress and status events on one bus':
      'Phase 98 (the runtime bus and boot-owned app runtime): not about the launch flight',
    'createAppRuntime > the frontend-ready flag flips once per instance':
      'Phase 98 (the runtime bus and boot-owned app runtime): not about the launch flight'
  },
  launchDispatch: {
    'dispatchSteamLaunch > calls addRecentGame exactly once with the launched game info when launch() resolves true':
      'Phase 90.2 (the Steam launch dispatch, adoption gate and recent-game write): not about the launch flight',
    'dispatchSteamLaunch > calls addRecentGame ZERO times and returns false when launch() resolves false':
      'Phase 90.2 (the Steam launch dispatch, adoption gate and recent-game write): not about the launch flight',
    'dispatchSteamLaunch > still resolves true and logs a warning when addRecentGame rejects':
      'Phase 90.2 (the Steam launch dispatch, adoption gate and recent-game write): not about the launch flight',
    'quick 261117-q1t: the launchWithoutSteam game setting > D-06 (Phase 81): on, the adoption gate never runs: launchWithoutSteam() is called and launch() never is':
      'Phase 90.2 (the Steam launch dispatch, adoption gate and recent-game write): not about the launch flight',
    'quick 261117-q1t: the launchWithoutSteam game setting > D-06 (Phase 81) off or absent (%j): normal Steam launch, the gate runs inside launch()':
      'Phase 90.2 (the Steam launch dispatch, adoption gate and recent-game write): not about the launch flight',
    'quick 261117-q1t: the launchWithoutSteam game setting > unreadable settings: warns and uses the normal Steam launch':
      'Phase 90.2 (the Steam launch dispatch, adoption gate and recent-game write): not about the launch flight',
    'Phase 81 D-05: the one-shot launch without Steam from the refused-restart notice > a game that does not qualify launches nothing at all and answers false':
      'Phase 90.2 (the Steam launch dispatch, adoption gate and recent-game write): not about the launch flight',
    'Phase 81 D-05: the one-shot launch without Steam from the refused-restart notice > a game that qualifies launches without Steam once, never through Steam, and records the recent game':
      'Phase 90.2 (the Steam launch dispatch, adoption gate and recent-game write): not about the launch flight',
    'Phase 81 D-05: the one-shot launch without Steam from the refused-restart notice > a launch that did not start is not a recent game':
      'Phase 90.2 (the Steam launch dispatch, adoption gate and recent-game write): not about the launch flight',
    'Phase 81 D-05: the one-shot launch without Steam from the refused-restart notice > D-06: it never reads or writes the per-game setting':
      'Phase 90.2 (the Steam launch dispatch, adoption gate and recent-game write): not about the launch flight'
  },
  adoptionStatus: {
    'getSteamAdoptionStatus (D-01) > a stored valid record is pending, signed-in unknown':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'getSteamAdoptionStatus (D-01) > no record is not pending':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'getSteamAdoptionStatus (D-01) > a malformed stored value is not pending':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'getSteamAdoptionStatus (D-01) > only the asked appId counts':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'the signed-in cache and the page push (D-03, D-07) > getSteamAdoptionStatus reads the cached signed-in reading, null when none':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'the signed-in cache and the page push (D-03, D-07) > pushSteamAdoptionStatus sends one steamAdoptionStatusChanged with the stored state and a strictly increasing seq':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'the signed-in cache and the page push (D-03, D-07) > the push carries only appName, two status fields and a seq (T-81-29)':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'the signed-in cache and the page push (D-03, D-07) > pushSteamAdoptionStatus never throws when the push fails':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'the signed-in cache and the page push (D-03, D-07) > noteAdoptionSignedIn stores the reading and pushes once':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'the signed-in cache and the page push (D-03, D-07) > answerSteamAdoptionStatus includes the cached reading':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'answerSteamAdoptionStatus (T-81-27) > rejects %p with "not pending" and never throws':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'answerSteamAdoptionStatus (T-81-27) > a valid appId answers the status':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'answerSteamAdoptionStatus (T-81-27) > a store that throws answers "not pending"':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'restartSteamNowForAdoption (D-02) > no record and no GameLib install poll (not the 1026 edge): answers no-record and touches nothing':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'restartSteamNowForAdoption (D-02) > quits Steam gracefully and relaunches Steam itself, never a game; only that clears the record':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'restartSteamNowForAdoption (D-02) > a game running in Steam: the in-app notice without the launch action, record kept, Steam untouched':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'restartSteamNowForAdoption (D-02) > macOS: a running bridged game refuses Restart Steam now with the game-running notice (quick 261119-se9)':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'restartSteamNowForAdoption (D-02) > Steam never quits within 30 s: quit-timeout notice, only steam://exit fired, record kept':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'restartSteamNowForAdoption (D-02) > macOS with a go-offline wrap owed: steam-busy notice, Steam untouched':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'restartSteamNowForAdoption (D-02) > a throwing relaunch answers error and keeps the record':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'Restart Steam now at the GameLib 1026 edge, no pending record (D-02, Phase 81 Gap 2) > Steam not running: starts Steam with steam://open/main alone and answers relaunched':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'Restart Steam now at the GameLib 1026 edge, no pending record (D-02, Phase 81 Gap 2) > the handler body reaches the same restart end to end':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'Restart Steam now at the GameLib 1026 edge, no pending record (D-02, Phase 81 Gap 2) > with a record the poll status is never read and the restart is unchanged':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'Restart Steam now at the GameLib 1026 edge, no pending record (D-02, Phase 81 Gap 2) > Steam running (linux): the graceful restart, never a game, no status emits':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'Restart Steam now at the GameLib 1026 edge, no pending record (D-02, Phase 81 Gap 2) > Steam running (darwin): exits through the detached opener, then starts Steam':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'Restart Steam now at the GameLib 1026 edge, no pending record (D-02, Phase 81 Gap 2) > Steam not running (darwin): starts Steam, no steam://exit':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'Restart Steam now at the GameLib 1026 edge, no pending record (D-02, Phase 81 Gap 2) > a game running in Steam, Steam running: game-running notice, Steam untouched':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'Restart Steam now at the GameLib 1026 edge, no pending record (D-02, Phase 81 Gap 2) > a game running in Steam, Steam not running: game-running notice, Steam not started':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'Restart Steam now at the GameLib 1026 edge, no pending record (D-02, Phase 81 Gap 2) > macOS with a go-offline wrap owed, %s: steam-busy notice, Steam untouched':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'Restart Steam now at the GameLib 1026 edge, no pending record (D-02, Phase 81 Gap 2) > Steam never quits: quit-timeout notice, only steam://exit fired':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'Restart Steam now at the GameLib 1026 edge, no pending record (D-02, Phase 81 Gap 2) > fails closed on %s: no-record, nothing touched':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'openSteamForAdoption (D-03) > opens Steam forward: one argument, never activate:false':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'openSteamForAdoption (D-03) > Windows: the shell raises Steam first, then the URL still goes out':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'openSteamForAdoption (D-03) > Windows: a refused or failing raise never stops the open':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'openSteamForAdoption (D-03) > darwin: no shell raise, the URL alone (unchanged)':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'openSteamForAdoption (D-03) > linux: the shell raises first, then the URL goes out':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'the action handler bodies reject a bad appId before doing anything (T-81-27) > %p':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'the action handler bodies reject a bad appId before doing anything (T-81-27) > a valid appId reaches the game; a throwing lookup answers error and never rejects':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight',
    'the action handler bodies reject a bad appId before doing anything (T-81-27) > Open Steam through the handler body opens steam://open/main':
      'Phase 90.2 (Steam adoption status, restart and open Steam): not about the launch flight'
  }
}

/** The files a census reads: the stem their cases carry and where they live. */
const CENSUS_FILES: readonly { stem: string; path: string }[] = [
  {
    stem: 'launchSingleFlight',
    path: join(__dirname, '..', 'launchSingleFlight.test.ts')
  },
  {
    stem: 'launcher_launchSingleFlight',
    path: join(__dirname, '..', 'launcher_launchSingleFlight.test.ts')
  },
  { stem: 'appRuntime', path: join(__dirname, '..', 'appRuntime.test.ts') },
  {
    stem: 'launchDispatch',
    path: join(
      __dirname,
      '..',
      '..',
      'storeManagers',
      'steam',
      '__tests__',
      'launchDispatch.test.ts'
    )
  },
  {
    stem: 'adoptionStatus',
    path: join(
      __dirname,
      '..',
      '..',
      'storeManagers',
      'steam',
      '__tests__',
      'adoptionStatus.test.ts'
    )
  }
]

/** The documented Rust-side differences (D-19): delta name -> why the Rust single flight does not copy the TS here. */
const DELTAS: Record<string, string> = {}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describeSkipOnWindows('launch single-flight oracle (88.3-02)', () => {
  const built = singleFlightCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json(DELTAS))
  }
  const cases = loadCases<FlightsOrLauncherCase>(CRATE, SLICE)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('deltas.json is exactly the documented delta table', () => {
    const committed: unknown = JSON.parse(
      readFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), 'utf8')
    )
    expect(committed).toEqual(DELTAS)
  })

  it.each(cases)('$id', async (c) => {
    const recorded = await recordCase(c)
    writeOrCompareGolden(CRATE, SLICE, c.id, {
      result: recorded.result,
      events: recorded.events
    })
  })

  const byId = (id: string): FlightsOrLauncherCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`${id} is missing from cases.json`)
    return found
  }

  it('the tracer records run, joined, onJoin and both receipts in the order the TS made them', async () => {
    const { events, result } = await recordCase(
      byId('single-flight--a-second-begin-joins-the-first')
    )
    expect(result).toEqual({
      received: { a: { value: 'ok' }, b: { value: 'ok' } },
      pending: []
    })
    const names = events
      .filter((e) => e.event !== 'step')
      .map((e) => `${String(e.event)} ${String(e.caller)}`)
    expect(names).toEqual([
      'run a',
      'joined b',
      'onJoin b',
      'received a',
      'received b'
    ])
    expect(events.find((e) => e.event === 'joined')).toMatchObject({
      samePromiseAsOwner: true
    })
  })

  it('the launcher join case shows the WR-03 line once and opens no second per-game log', async () => {
    const { events } = await recordCase(
      byId(
        'launcher_launchSingleFlight--' +
          slug(
            'launchEventCallback single-flight (WR-03) > runs the body once for two concurrent calls and shares the result'
          )
      )
    )
    const joinLines = events.filter(
      (e) =>
        e.event === 'log' &&
        typeof e.text === 'string' &&
        e.text.includes('already in progress; joining it (WR-03)')
    )
    expect(joinLines).toHaveLength(1)
    expect(events.filter((e) => e.event === 'openGameLog')).toHaveLength(1)
    expect(events.filter((e) => e.event === 'launch')).toHaveLength(1)
    // One log was opened, so exactly one frame claims the rotation.
    expect(
      events.filter((e) => e.event === 'gameLog' && e.rotate === true)
    ).toHaveLength(1)
  })

  it('a case that never settles is read as pending, not as a result', async () => {
    const { result } = await recordCase(
      byId('single-flight--a-held-leader-keeps-its-joiners-waiting')
    )
    expect(result).toEqual({
      received: {},
      pending: ['leader', 'joiner-1', 'joiner-2', 'late']
    })
  })

  it('every title of the five test files is a named case or a reasoned exclusion', () => {
    const ids = cases.map((c) => c.id)
    for (const file of CENSUS_FILES) {
      const titles = tsTestTitles(file.path)
      const prefix = `${file.stem}--`
      const own = ids
        .filter((id) => id.startsWith(prefix))
        .map((id) => id.slice(prefix.length))
      assertCasesCoverTitles(own, titles, NOT_PORTED[file.stem] ?? {})
      expect(own.length + Object.keys(NOT_PORTED[file.stem] ?? {}).length).toBe(
        titles.length
      )
    }
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, cases.length)
    assertManifest(CRATE, SLICE, cases, SINGLE_FLIGHT_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, SINGLE_FLIGHT_FLOOR)
  })
})
