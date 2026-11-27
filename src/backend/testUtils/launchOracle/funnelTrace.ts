/**
 * The recorder of the launch funnel oracle (88.3-01, D-11, D-12, D-13, D-22, D-25).
 *
 * `recordFunnel` drives the REAL `createLauncher(deps).launchEventCallback(params)` (the TS launch funnel,
 * `runLaunchEventCallback` in `src/backend/launcher.ts`) over scripted dependencies and returns the ordered
 * transcript the Rust funnel (88.3-04, 88.3-05) has to reproduce: every status update, backend-bus emit, gamelib.log
 * line, per-game log frame, Rust request with its reply, store-hook call, store write, host call and script run, in the
 * order the TS made them, then the result or the rejection. Nothing the transcript holds is typed by a person: a scenario
 * is only the INPUT (what each collaborator answers), and the golden is whatever the TS did with it.
 *
 * Isolation and determinism:
 *  - one shared, ordered event list: every recorder below writes into it, so the interleaving of (say) a log line and a
 *    Rust request is part of the record, not lost across separate arrays;
 *  - `createFakeLauncherDeps` supplies the base (paths in the fake HOME, a dep nobody scripted throws by name); every
 *    member the funnel reaches is replaced by a recording one that answers from the scenario;
 *  - `jest.spyOn` on the logger module records the gamelib.log lines (`logInfo|Warning|Error|Debug`) and the per-game log
 *    frames (`enqueueLogEntry`, `logLine`, the clock field dropped); never `jest.mock`, which a backend-di ceiling counts;
 *  - the platform and `isCLINoGui` are injected, so the macOS and non-macOS branches record on one machine;
 *  - jest's modern fake timers fake ONLY `Date` (every timer and microtask stays real), pinned to `PINNED_NOW`; the clock
 *    moves by `sessionMs` inside the scripted `launch` hook and nowhere else, so `firstPlayed`, `lastPlayed` and
 *    `totalPlayed` are deterministic;
 *  - every case runs on a fresh fake HOME on the pinned base env, and every recorded path is normalised to the harness
 *    placeholders.
 *
 * Two-profile rule: this is the isolated half only; the recorder spawns nothing and never reads the real HOME.
 */
import { join } from 'path'
import * as logger from 'backend/logger'
import * as environment from 'backend/constants/environment'
import { createLauncher } from 'backend/launcher'
import { createLaunchFlights } from 'backend/launchSingleFlight'
import {
  normalisePaths,
  withEngineOracleProfile,
  type OraclePlatform
} from 'backend/testUtils/engineWineOracle/harness'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import { createFakeLauncherDeps } from 'backend/testUtils/launchOracle/fakeLauncherDeps'
import {
  injectPlatform,
  injectProbe,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import type { LauncherDeps } from 'backend/launcher'
import type LogWriter from 'backend/logger/targetWriter'
import type {
  GameInfo,
  GameSettings,
  InstallPlatform,
  LaunchOption,
  Runner
} from 'common/types'

/** What `Date` says at the start of every case: 2026-01-01T00:00:00.000Z. */
export const PINNED_NOW = Date.UTC(2026, 0, 1)

/** The id the scripted display-sleep blocker hands out. */
export const WAKE_LOCK_ID = 7

/** How a scripted collaborator answers: it resolves a value or rejects with a message. */
export type Answer = { resolves: unknown } | { rejects: string }

/**
 * What a Rust channel answers: one `Answer` for every call, or a `sequence` whose nth entry answers the nth call of that
 * channel (the last entry answers every call after it), so a second Play can meet a different reply than the first.
 */
export type RustAnswer = Answer | { sequence: readonly Answer[] }

export interface FunnelScenario {
  runner: Runner
  appName: string
  title: string
  /** `game.isNative()`. */
  native: boolean
  /** The injected host: it decides the hide-window rule (`isMac`) and the runs-for-me write (`process.platform`). */
  platform: OraclePlatform
  /** The injected `isCLINoGui` probe. */
  isCLINoGui: boolean
  /**
   * `game.getGameInfo().install.install_path`: `none` leaves it unset, `present` names a folder that exists in the fake
   * HOME, `absent` names one that does not.
   */
  installPath: 'none' | 'present' | 'absent'
  /** `game.getGameInfo().install.platform` (the engine step's request carries it). */
  installPlatform?: InstallPlatform
  /** `onlineMonitor.isOnline()` for the first Play. */
  online: boolean
  /** The monitor goes offline while `game.getSettings()` is read (the request must say so). */
  goesOfflineDuringGetSettings?: boolean
  /** A second Play on the same launcher, after the monitor is set to `online` (the flag is never latched). */
  playAgain?: { online: boolean }
  /** The `tsStore` before the Play: whether it already holds the app, and its stored `totalPlayed`. */
  tsStore: { hasApp: boolean; totalPlayed: number }
  /** `config.getSettings()` (the global settings). */
  globalSettings: {
    minimizeOnLaunch: boolean
    noTrayIcon: boolean
    disableLogs: boolean
    disablePlaytimeSync: boolean
  }
  /** `game.getSettings()`, read separately from the per-game config below, as the TS does. */
  gameSettings: Partial<GameSettings>
  /** `gameConfigs.get(app).getSettings()`: only `verboseLogs` is read from it. */
  gameConfigSettings: { verboseLogs: boolean }
  /** The `LaunchParams` beyond the app name and runner. */
  params: {
    launchArguments?: LaunchOption
    skipVersionCheck?: boolean
    args?: string[]
  }
  /** A reply per Rust channel. An unlisted channel rejects by name. */
  rust: Record<string, RustAnswer>
  hooks: {
    /** `game.launch(...)`. */
    launch: Answer
    /** `game.syncSaves(...)`. */
    syncSaves: Answer
    /** `libraryManagers.gog.getGame(app).updateGOGPlaytime(...)`. */
    updateGOGPlaytime: Answer
    /** The store defines `setPresence` and `clearPresence` (gog does). */
    presence: boolean
    /** The store defines `persistBottleWineVersion` (steam does). */
    persistBottleWineVersion: boolean
  }
  /** What `commandRunner.runScriptForGame` answers. */
  scripts: { before: Answer; after: Answer }
  /** The wall time the scripted `launch` takes, in ms. */
  sessionMs: number
}

type Patch<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] | Answer
    ? T[K]
    : T[K] extends Record<string, unknown> | undefined
      ? Partial<NonNullable<T[K]>>
      : T[K]
}

/** The scenario every case starts from: a native legendary launch with nothing else going on. */
export function baseFunnelScenario(): FunnelScenario {
  return {
    runner: 'legendary',
    appName: 'alpha',
    title: 'Alpha',
    native: true,
    platform: 'linux',
    isCLINoGui: false,
    installPath: 'none',
    online: true,
    tsStore: { hasApp: false, totalPlayed: 0 },
    globalSettings: {
      minimizeOnLaunch: false,
      noTrayIcon: false,
      disableLogs: false,
      disablePlaytimeSync: false
    },
    gameSettings: {
      verboseLogs: true,
      autoSyncSaves: false,
      savesPath: '',
      gogSaves: [],
      wineVersion: {
        name: 'Wine-Test',
        bin: '/pins/wines/Wine-Test/bin/wine',
        type: 'wine'
      }
    },
    gameConfigSettings: { verboseLogs: true },
    params: {},
    rust: {
      engine_launch_select: { resolves: { kind: 'skip' } },
      info_recent_add: { resolves: null }
    },
    hooks: {
      launch: { resolves: true },
      syncSaves: { resolves: null },
      updateGOGPlaytime: { resolves: null },
      presence: false,
      persistBottleWineVersion: false
    },
    scripts: { before: { resolves: true }, after: { resolves: true } },
    sessionMs: 90_000
  }
}

/** `baseFunnelScenario()` with `patch` laid over it: a nested group is merged one level deep, anything else replaced. */
export function funnelScenario(patch: Patch<FunnelScenario>): FunnelScenario {
  const base = baseFunnelScenario() as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    const current = base[key]
    base[key] =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      !('resolves' in value) &&
      !('rejects' in value) &&
      !('sequence' in value)
        ? { ...current, ...value }
        : value
  }
  return base as unknown as FunnelScenario
}

/** One thing the funnel did, in the order it did it. */
export type FunnelEvent =
  /** The start of a Play (the second Play of a scenario is `n: 2`). */
  | { kind: 'play'; n: number }
  /** `sendFrontendMessage(channel, ...args)`: the renderer push. */
  | { kind: 'frontend'; channel: string; args: unknown[] }
  /** `appRuntime.events.emit(channel, ...args)`: the backend bus. */
  | { kind: 'bus'; channel: string; args: unknown[] }
  /** A gamelib.log line: the level, the prefix argument as given, the message as given. */
  | { kind: 'log'; level: string; prefix: unknown; text: unknown }
  /** A per-game or runner log frame at the forwarder boundary: target, rotate flag and the entry. */
  | {
      kind: 'gameLog'
      target: unknown
      rotate: boolean
      raw?: string
      level?: string
      prefix?: string
      text?: unknown
    }
  /** A Rust request and what the script answered (`reply`, or `rejected` with the message). */
  | {
      kind: 'rust'
      channel: string
      args: unknown[]
      reply?: unknown
      rejected?: string
    }
  /**
   * A call into a store hook or the game object: `getSettings`, `syncSaves`, `launch` (with `writer`, the log writer it
   * was handed: its target and whether its rotation was already claimed by an earlier frame), `setPresence`,
   * `clearPresence`, `persistBottleWineVersion`, `updateGOGPlaytime`.
   */
  | {
      kind: 'hook'
      hook: string
      runner: Runner
      args: unknown[]
      writer?: { target: unknown; rotationClaimed: boolean }
    }
  /** A `tsStore.set`. */
  | { kind: 'tsStore'; op: 'set'; key: string; value: unknown }
  /** A runs-for-me store write. */
  | { kind: 'runsForMe'; op: 'set'; key: string; value: unknown }
  /** `config.getSettings` / `config.setSetting`. */
  | { kind: 'config'; member: string; args: unknown[] }
  /** `gameConfigs.get(app).getSettings` / `.setSetting`. */
  | { kind: 'gameConfig'; member: string; appName: string; args: unknown[] }
  /** `appState.hideMainWindow`, `wakeLock.start`, `wakeLock.stop`, `exit`. */
  | { kind: 'appState'; member: string; args: unknown[] }
  /** `dialogs.showMessageBox` / `showErrorBox` (the funnel itself shows none: Rust does). */
  | { kind: 'dialog'; member: string; args: unknown[] }
  /** `commandRunner.runScriptForGame`, with the settings it was handed. */
  | {
      kind: 'script'
      when: string
      appName: string
      wine: string | null
      beforeLaunchScriptPath: string | null
      afterLaunchScriptPath: string | null
      target: unknown
    }

/** How one Play ended. */
export type FunnelOutcome = { status: string } | { rejected: string }

export interface FunnelTranscript {
  result: { plays: FunnelOutcome[] }
  events: FunnelEvent[]
}

/** The `Date`-only fake clock: every other timer and microtask stays real. */
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

/** A JSON snapshot taken NOW: a later in-place change (the wine self-heal) must not rewrite what was recorded. */
function snap<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) =>
      v instanceof Error ? `${v.name}: ${v.message}` : v
    )
  ) as T
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * A scripted rejection carries the message and nothing else: an `Error`'s stack names the machine's own source paths, and
 * a log line that prints it (`logWriter.logError(exception)`) would put them into a committed golden.
 */
function scriptedError(message: string): Error {
  const error = new Error(message)
  error.stack = `Error: ${message}`
  return error
}

function answer(scripted: Answer): Promise<unknown> {
  return 'rejects' in scripted
    ? Promise.reject(scriptedError(scripted.rejects))
    : Promise.resolve(scripted.resolves)
}

/**
 * Runs one scenario through the real TS launch funnel on a fresh fake HOME and returns its transcript, paths normalised.
 * The scenario's collaborators are scripted; an unscripted Rust channel rejects by name.
 */
export function recordFunnel(
  scenario: FunnelScenario
): Promise<FunnelTranscript> {
  const s = scenario
  const installFolder = (home: string): string => join(home, 'Games', s.appName)

  return withEngineOracleProfile(
    async (profile) => {
      const events: FunnelEvent[] = []
      const push = (event: FunnelEvent): void => {
        events.push(event)
      }
      let online = s.online

      const info = (): Partial<GameInfo> => ({
        app_name: s.appName,
        runner: s.runner,
        title: s.title,
        install: {
          ...(s.installPath !== 'none' && {
            install_path: installFolder(profile.home)
          }),
          ...(s.installPlatform !== undefined && {
            platform: s.installPlatform
          })
        }
      })

      const rustCalls = new Map<string, number>()
      const requestRustInvoke = ((channel: string, args: unknown[]) => {
        const event: FunnelEvent = {
          kind: 'rust',
          channel,
          args: snap(args)
        }
        push(event)
        const call = rustCalls.get(channel) ?? 0
        rustCalls.set(channel, call + 1)
        const entry = Object.prototype.hasOwnProperty.call(s.rust, channel)
          ? s.rust[channel]
          : undefined
        const scripted =
          entry && 'sequence' in entry
            ? entry.sequence[Math.min(call, entry.sequence.length - 1)]
            : entry
        const reply = scripted
          ? answer(scripted)
          : Promise.reject(
              scriptedError(
                `funnel trace: unscripted rust channel "${channel}"`
              )
            )
        return reply.then(
          (value) => {
            event.reply = snap(value === undefined ? null : value)
            return value
          },
          (error: unknown) => {
            event.rejected = messageOf(error)
            throw error
          }
        )
      }) as unknown as LauncherDeps['requestRustInvoke']

      const sendFrontendMessage = ((channel: string, ...args: unknown[]) => {
        push({ kind: 'frontend', channel, args: snap(args) })
      }) as unknown as LauncherDeps['sendFrontendMessage']

      const bus = {
        emit: (channel: string, ...args: unknown[]) => {
          push({ kind: 'bus', channel, args: snap(args) })
          return true
        }
      } as unknown as LauncherDeps['appRuntime']['events']

      const hookCall = (
        hook: string,
        args: unknown[],
        writer?: LogWriter
      ): void =>
        push({
          kind: 'hook',
          hook,
          runner: s.runner,
          args: snap(args),
          ...(writer && {
            writer: {
              target: snap(writer.target),
              rotationClaimed: events.some(
                (e) =>
                  e.kind === 'gameLog' &&
                  e.rotate &&
                  JSON.stringify(e.target) === JSON.stringify(writer.target)
              )
            }
          })
        })

      const game = {
        isNative: () => s.native,
        getGameInfo: () => info() as GameInfo,
        getSettings: () => {
          hookCall('getSettings', [])
          if (s.goesOfflineDuringGetSettings) online = false
          return Promise.resolve(structuredClone(s.gameSettings))
        },
        launch: (
          logWriter: LogWriter,
          launchArguments: unknown,
          args: unknown,
          skipVersionCheck: unknown
        ) => {
          hookCall(
            'launch',
            [launchArguments, args, skipVersionCheck],
            logWriter
          )
          // The game ran for `sessionMs`: the only place the pinned clock moves.
          jest.setSystemTime(Date.now() + s.sessionMs)
          return answer(s.hooks.launch)
        },
        syncSaves: (...args: unknown[]) => {
          hookCall('syncSaves', args)
          return answer(s.hooks.syncSaves)
        },
        updateGOGPlaytime: (...args: unknown[]) => {
          hookCall('updateGOGPlaytime', args)
          return answer(s.hooks.updateGOGPlaytime)
        }
      }
      const library = Object.fromEntries(
        (['legendary', 'gog', 'nile', 'sideload', 'steam'] as const).map(
          (runner) => [runner, { getGame: () => game }]
        )
      ) as unknown as LauncherDeps['libraryManagers']

      const hooks: Record<string, unknown> = {
        ...(s.hooks.presence && {
          setPresence: (appName: string) => {
            hookCall('setPresence', [appName])
            return Promise.resolve()
          },
          clearPresence: () => {
            hookCall('clearPresence', [])
            return Promise.resolve()
          }
        }),
        ...(s.hooks.persistBottleWineVersion && {
          persistBottleWineVersion: (wineVersion: unknown) => {
            hookCall('persistBottleWineVersion', [wineVersion])
            return Promise.resolve()
          }
        })
      }
      const launchHooks = Object.fromEntries(
        (['legendary', 'gog', 'nile', 'sideload', 'steam'] as const).map(
          (runner) => [runner, hooks]
        )
      ) as unknown as LauncherDeps['launchHooks']

      const recordAppState = (member: string) => (): void => {
        push({ kind: 'appState', member, args: [] })
      }
      const appState = {
        raiseMainWindow: recordAppState('raiseMainWindow'),
        raiseMainWindowForInAppDialog: recordAppState(
          'raiseMainWindowForInAppDialog'
        ),
        hideMainWindow: recordAppState('hideMainWindow'),
        exit: recordAppState('exit'),
        wakeLock: {
          start: (type: string) => {
            push({ kind: 'appState', member: 'wakeLock.start', args: [type] })
            return WAKE_LOCK_ID
          },
          stop: (id: number) => {
            push({ kind: 'appState', member: 'wakeLock.stop', args: [id] })
          },
          isStarted: () => false
        }
      } as unknown as LauncherDeps['appState']

      const dialogs = {
        displayAcks: {},
        showMessageBox: (...args: unknown[]) => {
          push({ kind: 'dialog', member: 'showMessageBox', args: snap(args) })
          return Promise.reject(
            scriptedError('funnel trace: the funnel shows no dialog of its own')
          )
        },
        showErrorBox: (...args: unknown[]) => {
          push({ kind: 'dialog', member: 'showErrorBox', args: snap(args) })
          return Promise.resolve()
        }
      } as unknown as LauncherDeps['dialogs']

      const commandRunner = {
        runScriptForGame: (
          gameInfo: GameInfo,
          settings: GameSettings,
          when: 'before' | 'after',
          writer: LogWriter
        ) => {
          push({
            kind: 'script',
            when,
            appName: gameInfo.app_name,
            wine: settings.wineVersion?.name ?? null,
            beforeLaunchScriptPath: settings.beforeLaunchScriptPath ?? null,
            afterLaunchScriptPath: settings.afterLaunchScriptPath ?? null,
            target: snap(writer.target)
          })
          return answer(s.scripts[when])
        }
      } as unknown as LauncherDeps['commandRunner']

      const tsStore = {
        has: () => s.tsStore.hasApp,
        get: (key: string, fallback: unknown) =>
          key.endsWith('.totalPlayed') ? s.tsStore.totalPlayed : fallback,
        set: (key: string, value: unknown) => {
          push({ kind: 'tsStore', op: 'set', key, value: snap(value) })
        }
      }
      const runsForMeStore = {
        get: (_key: string, fallback: unknown) => fallback,
        set: (key: string, value: unknown) => {
          push({ kind: 'runsForMe', op: 'set', key, value: snap(value) })
        }
      }
      const stores = {
        kvs: { tsStore },
        runsForMe: { runsForMeStore }
      } as unknown as LauncherDeps['stores']

      const config = {
        getSettings: () => {
          push({ kind: 'config', member: 'getSettings', args: [] })
          return { ...s.globalSettings }
        },
        setSetting: (...args: unknown[]) => {
          push({
            kind: 'config',
            member: 'setSetting',
            args: snap(args.slice(0, 2))
          })
        }
      } as unknown as LauncherDeps['config']

      const gameConfigs = {
        get: (appName: string) => ({
          getSettings: () => {
            push({
              kind: 'gameConfig',
              member: 'getSettings',
              appName,
              args: []
            })
            return Promise.resolve({ ...s.gameConfigSettings })
          },
          setSetting: (...args: unknown[]) => {
            push({
              kind: 'gameConfig',
              member: 'setSetting',
              appName,
              args: snap(args)
            })
          }
        })
      } as unknown as LauncherDeps['gameConfigs']

      const fake = createFakeLauncherDeps(profile, {
        overrides: {
          requestRustInvoke,
          sendFrontendMessage,
          appRuntime: { events: bus, launchFlights: createLaunchFlights() },
          libraryManagers: library,
          launchHooks,
          appState,
          dialogs,
          commandRunner,
          stores,
          config,
          gameConfigs,
          onlineMonitor: { isOnline: () => online }
        } as Partial<LauncherDeps>
      })

      const outcomes: FunnelOutcome[] = []
      const restores = [
        injectPlatform(s.platform),
        injectProbe(environment, 'isCLINoGui', s.isCLINoGui)
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
                kind: 'log',
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
            jest
              .spyOn(logger, 'enqueueLogEntry')
              .mockImplementation((target, rotate, entry) => {
                push(
                  'raw' in entry
                    ? {
                        kind: 'gameLog',
                        target: snap(target),
                        rotate,
                        raw: entry.raw
                      }
                    : {
                        kind: 'gameLog',
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
                  kind: 'gameLog',
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
            const plays = s.playAgain ? 2 : 1
            for (let n = 1; n <= plays; n++) {
              if (n === 2 && s.playAgain) online = s.playAgain.online
              push({ kind: 'play', n })
              try {
                const result = await launcher.launchEventCallback({
                  appName: s.appName,
                  runner: s.runner,
                  ...s.params
                })
                outcomes.push({ status: result.status })
              } catch (error) {
                outcomes.push({ rejected: messageOf(error) })
              }
            }
          } finally {
            for (const spy of spies) spy.mockRestore()
            jest.useRealTimers()
          }
        })
      )
      return normalisePaths(
        snap({ result: { plays: outcomes }, events }),
        profile
      )
    },
    {
      seed:
        s.installPath === 'present'
          ? [{ path: `<HOME>/Games/${s.appName}`, dir: true as const }]
          : []
    }
  )
}
