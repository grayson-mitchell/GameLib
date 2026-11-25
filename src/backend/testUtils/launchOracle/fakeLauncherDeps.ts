/**
 * The recording `LauncherDeps` every Phase 88.1 golden drives the real TS launcher with (88.1-01, D-11,
 * D-12, D-13).
 *
 * A launch golden runs the real `createLauncher(deps)` members. What the launcher reaches through
 * `deps` (Rust over `requestRustInvoke`, the renderer push, the backend event bus, notifications,
 * dialogs, the per-store launch hooks, the library managers, the host paths) is answered here by a
 * scripted fake that RECORDS every call in order, so a golden pins both what the launcher returned and
 * what it asked its collaborators for.
 *
 * Rules the fakes keep:
 *  - nothing is answered by default: an unscripted Rust channel rejects by name, an unscripted dialog
 *    rejects by name, a dep nobody scripted throws by name on first use, so a case never passes by
 *    leaning on an answer it did not write down;
 *  - paths come from the fake HOME profile (`withEngineOracleProfile`), never from the real one;
 *  - nothing here is a module mock: the recorders are plain objects and the log writer is a plain
 *    class instance (the backend-di ceilings count `jest.mock`);
 *  - hook bodies are stubs that record. 91 and 92 own what the store hooks do inside.
 *
 * A plan that needs a dep this file does not model passes it in `options.overrides`, which replaces
 * the member wholesale; no plan edits this file after 88.1-01.
 */
import { join } from 'path'
import type { LauncherDeps } from 'backend/launcher'
import type { StoreLaunchHooks } from 'backend/storeManagers'
import type { EngineOracleProfile } from 'backend/testUtils/engineWineOracle/harness'
import type LogWriter from 'backend/logger/targetWriter'
import type { GameInfo, GameSettings, Runner } from 'common/types'

const RUNNERS: readonly Runner[] = [
  'legendary',
  'gog',
  'nile',
  'sideload',
  'steam'
]

/** One library entry a case scripts: what `getGame(app)` answers for it. */
export interface FakeGame {
  native?: boolean
  info?: Partial<GameInfo>
  settings?: Partial<GameSettings>
}

export interface FakeLauncherOptions {
  /** A reply per Rust channel: a value, or a function of the call's args (may throw or reject). */
  rust?: Record<string, unknown>
  /** The `response` of each `showMessageBox` call, in order. An exhausted list rejects. */
  dialogAnswers?: number[]
  /** `onlineMonitor.isOnline()`; default `true`. */
  online?: boolean
  /** Library entries keyed `<runner>:<appName>`. An unlisted game throws by name. */
  games?: Record<string, FakeGame>
  /** What a hook answers, keyed `<runner>.<member>`; an unlisted hook records and answers `undefined`. */
  hooks?: Record<string, unknown>
  /** Members of `LauncherDeps` replaced wholesale. */
  overrides?: Partial<LauncherDeps>
}

export interface FakeLauncherDeps {
  deps: LauncherDeps
  /** Every `requestRustInvoke(channel, args)`. */
  requests: { channel: string; args: unknown[] }[]
  /** Every renderer push and backend-event emit. */
  frontend: { kind: 'send' | 'emit'; channel: string; args: unknown[] }[]
  /** Every `notifications.show`. */
  notifications: { title?: string; body?: string }[]
  /** Every dialog call. */
  dialogs: { kind: 'message' | 'error'; options: unknown; answer?: number }[]
  /** Every `launchHooks[runner].<member>(...)` call. */
  hooks: { runner: Runner; member: string; args: unknown[] }[]
  /** Every `appState` call. */
  appState: { member: string; args: unknown[] }[]
  /** How many times `onlineMonitor.isOnline()` was asked. */
  onlineAsked: () => number
}

/** A dep nobody scripted: any use of it throws, naming the dep. `then` and symbols stay undefined. */
function unscripted(name: string): never {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then' || typeof property === 'symbol') {
          return undefined
        }
        throw new Error(
          `fake launcher deps: unscripted dep "${name}.${String(property)}"`
        )
      }
    }
  ) as never
}

/**
 * Builds the recording deps over `profile`. The returned `deps` is what `createLauncher` takes; the
 * rest are the recorders a case reads back.
 */
export function createFakeLauncherDeps(
  profile: EngineOracleProfile,
  options: FakeLauncherOptions = {}
): FakeLauncherDeps {
  const requests: FakeLauncherDeps['requests'] = []
  const frontend: FakeLauncherDeps['frontend'] = []
  const notifications: FakeLauncherDeps['notifications'] = []
  const dialogs: FakeLauncherDeps['dialogs'] = []
  const hooks: FakeLauncherDeps['hooks'] = []
  const appState: FakeLauncherDeps['appState'] = []
  let onlineAsked = 0
  const answers = [...(options.dialogAnswers ?? [])]
  const scriptedRust = options.rust ?? {}

  const requestRustInvoke = ((channel: string, args: unknown[]) => {
    requests.push({ channel, args })
    if (!Object.prototype.hasOwnProperty.call(scriptedRust, channel)) {
      return Promise.reject(
        new Error(`fake launcher deps: unscripted rust channel "${channel}"`)
      )
    }
    const reply = scriptedRust[channel]
    // A scripted function may throw or reject: both reach the caller as a rejection.
    return new Promise((resolve) => {
      resolve(
        typeof reply === 'function'
          ? (reply as (a: unknown[]) => unknown)(args)
          : reply
      )
    })
  }) as unknown as LauncherDeps['requestRustInvoke']

  const sendFrontendMessage = ((channel: string, ...args: unknown[]) => {
    frontend.push({ kind: 'send', channel, args })
  }) as unknown as LauncherDeps['sendFrontendMessage']

  const events = {
    emit: (channel: string, ...args: unknown[]) => {
      frontend.push({ kind: 'emit', channel, args })
      return true
    }
  } as unknown as LauncherDeps['appRuntime']['events']

  const library = Object.fromEntries(
    RUNNERS.map((runner) => [
      runner,
      {
        getGame: (appName: string) => {
          const entry = options.games?.[`${runner}:${appName}`]
          if (!entry) {
            throw new Error(
              `fake launcher deps: unscripted game "${runner}:${appName}"`
            )
          }
          return {
            isNative: () => entry.native ?? false,
            getGameInfo: () => ({ app_name: appName, runner, ...entry.info }),
            getSettings: () => Promise.resolve({ ...entry.settings })
          }
        }
      }
    ])
  ) as unknown as LauncherDeps['libraryManagers']

  const launchHooks = Object.fromEntries(
    RUNNERS.map((runner) => {
      const member =
        (name: keyof StoreLaunchHooks) =>
        (...args: unknown[]) => {
          hooks.push({ runner, member: name, args })
          const scripted = options.hooks?.[`${runner}.${name}`]
          const answer =
            typeof scripted === 'function'
              ? (scripted as (...a: unknown[]) => unknown)(...args)
              : scripted
          return name === 'resolveOfflineMode'
            ? answer
            : Promise.resolve(answer)
        }
      const stub: StoreLaunchHooks = {
        prepareLaunch: member('prepareLaunch') as never,
        setPresence: member('setPresence') as never,
        clearPresence: member('clearPresence') as never,
        resolveOfflineMode: member('resolveOfflineMode') as never,
        isOverlayEnabled: member('isOverlayEnabled') as never,
        persistBottleWineVersion: member('persistBottleWineVersion') as never
      }
      return [runner, stub]
    })
  ) as unknown as LauncherDeps['launchHooks']

  const appStateFake = Object.fromEntries(
    [
      'raiseMainWindow',
      'raiseMainWindowForInAppDialog',
      'hideMainWindow',
      'exit'
    ].map((name) => [
      name,
      (...args: unknown[]) => {
        appState.push({ member: name, args })
      }
    ])
  ) as Record<string, (...a: unknown[]) => void>
  const wakeLock = {
    request: (...args: unknown[]) => {
      appState.push({ member: 'wakeLock.request', args })
      return 1
    },
    release: (...args: unknown[]) => {
      appState.push({ member: 'wakeLock.release', args })
    }
  }

  const dialogsFake = {
    displayAcks: unscripted('dialogs.displayAcks'),
    showMessageBox: (opts: unknown) => {
      const response = answers.shift()
      dialogs.push({ kind: 'message', options: opts, answer: response })
      if (response === undefined) {
        return Promise.reject(
          new Error('fake launcher deps: unscripted dialog answer')
        )
      }
      return Promise.resolve({ response })
    },
    showErrorBox: (title?: string, content?: string) => {
      dialogs.push({ kind: 'error', options: { title, content } })
      return Promise.resolve()
    }
  } as unknown as LauncherDeps['dialogs']

  const deps = {
    // The host slices, answered and recorded.
    requestRustInvoke,
    sendFrontendMessage,
    appRuntime: {
      events,
      launchFlights: unscripted('appRuntime.launchFlights')
    },
    notifications: {
      show: (opts: { title?: string; body?: string }) => {
        notifications.push(opts)
      }
    },
    dialogs: dialogsFake,
    appState: { ...appStateFake, wakeLock },
    launchHooks,
    libraryManagers: library,
    onlineMonitor: {
      isOnline: () => {
        onlineAsked += 1
        return options.online ?? true
      }
    },
    // Paths come from the fake HOME; the bundled known-fix layer sits inside it (the reader oracle's layout).
    paths: {
      ...profile.paths,
      bundledFixesPath: join(profile.home, 'public', 'fixes')
    },
    // Nobody scripted these: a launcher that reaches for one fails by name.
    commandRunner: unscripted('commandRunner'),
    runner: unscripted('runner'),
    spawnAsync: unscripted('spawnAsync'),
    stores: unscripted('stores'),
    config: unscripted('config'),
    gameConfigs: unscripted('gameConfigs'),
    infoCaches: unscripted('infoCaches'),
    appInfo: unscripted('appInfo'),
    aborts: unscripted('aborts'),
    steamBottle: unscripted('steamBottle'),
    steamLaunchRuntime: unscripted('steamLaunchRuntime'),
    ...options.overrides
  } as unknown as LauncherDeps

  return {
    deps,
    requests,
    frontend,
    notifications,
    dialogs,
    hooks,
    appState,
    onlineAsked: () => onlineAsked
  }
}

/** One call a recording log writer saw: `parts` are the arguments after the awaited promises. */
export interface WriterEntry {
  level: 'debug' | 'info' | 'warning' | 'error' | 'raw'
  parts: unknown[]
}

/**
 * A `LogWriter`-compatible recorder (`logDebug|Info|Warning|Error`, `writeString`, `close`).
 * Entries are recorded in CALL order, not settle order: the slot is claimed when the call is made
 * and filled once its promise parts have settled, so a later call whose promise settles first does
 * not overtake an earlier one. `writeString` records `{ level: 'raw', parts: [text] }`.
 *
 * `entries()` waits for every pending slot, so a case reads the log only after the writer is quiet.
 */
export function recordingLogWriter(): {
  writer: LogWriter
  entries: () => Promise<WriterEntry[]>
} {
  const slots: Promise<WriterEntry>[] = []
  const claim = (level: WriterEntry['level'], parts: unknown[]) => {
    slots.push(
      Promise.all(parts).then((settled) => ({ level, parts: settled }))
    )
    return Promise.resolve()
  }
  const level =
    (name: Exclude<WriterEntry['level'], 'raw'>) =>
    (...parts: unknown[]) =>
      claim(name, parts)
  const writer = {
    logDebug: level('debug'),
    logInfo: level('info'),
    logWarning: level('warning'),
    logError: level('error'),
    writeString: (text: string | Promise<string>) => claim('raw', [text]),
    close: () => claim('raw', ['============= End of log ============='])
  } as unknown as LogWriter
  return { writer, entries: () => Promise.all(slots) }
}
