/**
 * The stateful-flow harness the Humble library and state oracles share (94-08 Tasks 2 and 3, D-06,
 * D-07). `runFlowCase` runs one case the way the boot builds Humble:
 *   - a fresh `createFakeHomeProfile()` and a real `StoreRoot` rooted at its `userData`
 *     (`createTestStoreRoot`), the real humble and steam store families on it, so the bytes a flow
 *     leaves behind are the ones the TS writer produces (the in-process disk sink is the shell's
 *     one writer in miniature, `testUtils/diskStoreSink.ts`);
 *   - `createHumbleServices` (the real `HumbleUser` and library), an in-memory secret store holding a
 *     fake cookie, the real Steam session reading the real steam stores, the real Steam app-id
 *     resolver, and a recording `sendFrontendMessage`;
 *   - the wire recorder as the network (`withWireRecorder`): the adapter's and the resolver's
 *     requests land on it, in synthetic mode when writing and replayed offline when comparing;
 *   - the channel handlers `registerHumbleFlows` registers, called through an IPC registry, so the
 *     server-side re-validation of the override and gift-link channels is part of what is recorded;
 *   - the date pinned to 2026-11-24T12:00Z (only `Date`, no timer is faked) and the host time zone
 *     switched to UTC, because `CacheStore.set` writes `Date()` (a local-zone string) into every
 *     timestamp it keeps.
 * No module is mocked. The logger is real, `expirationAlerts`' digest and `console.warn` are read
 * with `jest.spyOn`.
 *
 * A golden is `{input, calls, requests, stateAfter}`: each call is `{name, args, result, events,
 * warnings, expiryDigest, notifications}` where `events` are the frontend messages pushed while it
 * ran and `stateAfter` holds the exact text of every Humble state file.
 *
 * The Steam app-id pass is started by a sync and not awaited by it: `settleAppIdPass` waits for the
 * pass to have answered, so the events it raises belong to a call of their own.
 */
import { runInThisContext } from 'vm'
import type { GameInfo } from 'common/types'
import type { FrontendMessages } from 'common/types/ipc'
import * as expirationAlerts from '../../expirationAlerts'
import { registerHumbleFlows } from '../../../sidecar/humbleFlowRegistration'
import {
  createIpcRegistry,
  type IpcRegistry
} from '../../../sidecar/ipcRegistry'
import { createHumbleServices, type HumbleServices } from '../../index'
import { createHumbleStores } from '../../stores'
import type { HumbleSecretKey, HumbleSecretStore } from '../../secretStore'
import { createSteamStores } from 'backend/storeManagers/steam/stores'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createLoginWindowSeamSlot } from 'backend/login/loginWindowSeam'
import { TEST_APP_INFO } from 'backend/testUtils/testContext'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { createTestSignInProbe } from 'backend/testUtils/testSignInProbe'
import { createTestSteamUser } from 'backend/testUtils/testSteamUser'
import { createTestStoreRoot } from 'backend/testUtils/testStoreRoot'
import {
  seedHumbleState,
  snapshotHumbleState,
  withHumbleOracleProfile,
  withWireRecorder,
  PINNED_NOW_MS,
  type HumbleOracleProfile,
  type HumbleSeedFile
} from 'backend/testUtils/humbleOracle/harness'
import type { SyntheticResponse } from 'backend/testUtils/humbleOracle/wireRecorder'
import { compressAdapterGaps, FAKE_COOKIE } from './flight'

/** The synthetic cookie a case's secret store answers. */
export { FAKE_COOKIE }

export interface FlowEvent {
  channel: string
  payload: unknown
}

export interface RecordedCall {
  name: string
  args: unknown[]
  result: unknown
  events: FlowEvent[]
  warnings: string[]
  expiryDigest: { keyCount: number; suppressNotifications: boolean }[]
  notifications: unknown[]
}

export interface FlowSteam {
  loggedIn: boolean
  /** The owned Steam library the cases seed (`fixtures/steamGames.ts`). */
  games: readonly GameInfo[]
}

export interface FlowOptions {
  slice: string
  caseId: string
  synthetic: readonly SyntheticResponse[]
  /** The cookie the secret store holds; `''` is a signed-out secret store. Default: the fake cookie. */
  cookie?: string
  /** State files written before the stores are built. */
  seed?: Readonly<Record<string, HumbleSeedFile>>
  steam?: FlowSteam
  /** Run the real expiry digest instead of only recording that it was called. */
  realDigest?: boolean
  script: (env: FlowEnv) => Promise<void>
}

export interface FlowEnv {
  readonly profile: HumbleOracleProfile
  readonly services: HumbleServices
  /** The real store families, for a case that reads or reshapes a store between two calls. */
  readonly stores: {
    humble: ReturnType<typeof createHumbleStores>
    steam: ReturnType<typeof createSteamStores>
  }
  readonly events: FlowEvent[]
  /** Runs on every frontend message as it is pushed (a disconnect that lands mid-sync). */
  onEvent: ((event: FlowEvent) => void) | undefined
  /** Calls a registered Humble channel handler, recording the call. */
  ipc(channel: string, ...args: unknown[]): Promise<unknown>
  /** Calls a registered channel handler `count` times at once, recording one call. */
  concurrent(
    channel: string,
    count: number,
    ...args: unknown[]
  ): Promise<unknown>
  /** Calls a library method that has no sidecar channel, recording the call. */
  direct(
    name: string,
    args: unknown[],
    fn: () => unknown | Promise<unknown>
  ): Promise<unknown>
  /** Changes the Steam session and the owned library the cases read. */
  setSteam(steam: FlowSteam): void
  setCookie(cookie: string): void
  /** Moves the pinned date forward. */
  advance(ms: number): void
  /** Waits for the Steam app-id pass to hold `entries` answers, then lets its events land. */
  settleAppIdPass(entries: number): Promise<void>
  /** A mutation made as part of the case (a seed in the middle of a flow); recorded as a call. */
  step(name: string, args: unknown[], fn: () => unknown): Promise<unknown>
  /** The exact text of every Humble state file now. */
  snapshot(): Record<string, { utf8: string } | { base64: string }>
  /** Every call recorded so far. */
  readonly calls: readonly RecordedCall[]
}

// ---------------------------------------------------------------------------------------------
// The time zone and the date
// ---------------------------------------------------------------------------------------------

/**
 * Jest hands a test a COPY of `process.env`: assigning `TZ` there never reaches the real
 * environment. The real process is the one of the outer context (the `pureLogic.oracle` finding).
 */
const realProcess = runInThisContext('process') as NodeJS.Process

class OracleHostError extends Error {}

async function withUtc<T>(fn: () => Promise<T>): Promise<T> {
  const before = realProcess.env.TZ
  realProcess.env.TZ = 'UTC'
  try {
    const offset = new Date(2026, 5, 1).getTimezoneOffset()
    if (offset !== 0) {
      throw new OracleHostError(
        `this host ignored TZ=UTC (offset ${offset}): refusing to record a case whose timestamps are zone-dependent`
      )
    }
    return await fn()
  } finally {
    if (before === undefined) delete realProcess.env.TZ
    else realProcess.env.TZ = before
  }
}

/** Fakes `Date` and nothing else: sockets and timers stay real. */
function pinDate(nowMs: number): () => void {
  jest.useFakeTimers({
    now: nowMs,
    doNotFake: [
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
    ]
  })
  return () => jest.useRealTimers()
}

const realSetTimeout = setTimeout
const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => realSetTimeout(resolve, ms))

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

function memorySecretStore(initial: string): {
  store: HumbleSecretStore
  set(cookie: string): void
} {
  const secrets: Partial<Record<HumbleSecretKey, string>> = {}
  if (initial !== '') secrets.sessionCookie = initial
  return {
    store: {
      isAvailable: async () => true,
      getSecret: async (key) => secrets[key] ?? '',
      setSecret: async (key, value) => {
        secrets[key] = value
      },
      clearSecrets: async () => {
        delete secrets.sessionCookie
        delete secrets.csrfToken
      }
    },
    set(cookie) {
      if (cookie === '') delete secrets.sessionCookie
      else secrets.sessionCookie = cookie
    }
  }
}

/** Plain, JSON-safe copy of a value; `undefined` becomes `null`. */
function plain(value: unknown): unknown {
  return value === undefined
    ? null
    : (JSON.parse(JSON.stringify(value)) as unknown)
}

/** A snapshot as the exact text of each file (base64 only for bytes that are not UTF-8). */
function readableSnapshot(
  userData: string
): Record<string, { utf8: string } | { base64: string }> {
  const out: Record<string, { utf8: string } | { base64: string }> = {}
  for (const [rel, base64] of Object.entries(snapshotHumbleState(userData))) {
    const bytes = Buffer.from(base64, 'base64')
    const text = bytes.toString('utf8')
    out[rel] = Buffer.from(text, 'utf8').equals(bytes)
      ? { utf8: text }
      : { base64 }
  }
  return out
}

/** What a golden's `input` records about the seeds, so a Rust replay can rebuild the case. */
function describeSeed(
  seed: Readonly<Record<string, HumbleSeedFile>> | undefined
): Record<string, HumbleSeedFile> {
  return { ...(seed ?? {}) }
}

// ---------------------------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------------------------

export async function runFlowCase(options: FlowOptions): Promise<unknown> {
  return withUtc(() =>
    withHumbleOracleProfile(async (profile) => {
      const restoreDate = pinDate(PINNED_NOW_MS)
      const restoreGaps = compressAdapterGaps()
      const events: FlowEvent[] = []
      const warnings: string[] = []
      const digest: RecordedCall['expiryDigest'] = []
      const shown: unknown[] = []
      const calls: RecordedCall[] = []

      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation((...args: unknown[]) => {
          warnings.push(args.map((a) => String(a)).join(' '))
        })
      const realDigest = expirationAlerts.detectAndNotifyExpirationTransitions
      const digestSpy = jest
        .spyOn(expirationAlerts, 'detectAndNotifyExpirationTransitions')
        .mockImplementation((deps, keys, opts) => {
          digest.push({
            keyCount: keys.length,
            suppressNotifications: opts.suppressNotifications
          })
          if (options.realDigest) realDigest(deps, keys, opts)
        })

      try {
        if (options.seed) seedHumbleState(profile.userData, options.seed)
        const registry = createStoreRegistry()
        const root = createTestStoreRoot(profile.userData)
        const humble = createHumbleStores({ registry, root })
        const steam = createSteamStores({ registry, root })
        const stores = { humble, steam }
        const secrets = memorySecretStore(options.cookie ?? FAKE_COOKIE)

        const setSteam = (next: FlowSteam): void => {
          steam.configStore.set('isLoggedIn', next.loggedIn)
          steam.steamLibraryStore.set('games', [...next.games] as never)
        }
        if (options.steam) setSteam(options.steam)

        const sendFrontendMessage = ((
          channel: keyof FrontendMessages,
          ...args: unknown[]
        ) => {
          const event = {
            channel,
            payload: plain(args.length > 1 ? args : args[0])
          }
          events.push(event)
          env.onEvent?.(event)
          return true
        }) as never

        const services = createHumbleServices({
          stores,
          secretStore: secrets.store,
          steamUser: createTestSteamUser({ stores: { steam } as never }),
          signInOutcomes: createTestSignInProbe().outcomes,
          appInfo: TEST_APP_INFO,
          sendFrontendMessage,
          loginWindowSeam: createLoginWindowSeamSlot()
        })
        const ipc: IpcRegistry = createIpcRegistry()
        const config = createTestGlobalConfig()
        const notifications = {
          show: (n: unknown) => {
            shown.push(plain(n))
          }
        }
        registerHumbleFlows({
          config,
          notifications: notifications as never,
          ipc,
          humble: services
        })

        const record = async (
          name: string,
          args: unknown[],
          fn: () => unknown | Promise<unknown>
        ): Promise<unknown> => {
          events.length = 0
          warnings.length = 0
          digest.length = 0
          shown.length = 0
          let result: unknown
          try {
            result = plain(await fn())
          } catch (error) {
            result = { threw: (error as Error).message }
          }
          calls.push({
            name,
            args: plain(args) as unknown[],
            result,
            events: [...events],
            warnings: [...warnings],
            expiryDigest: [...digest],
            notifications: [...shown]
          })
          return result
        }

        const env: FlowEnv = {
          profile,
          services,
          stores,
          events,
          onEvent: undefined,
          calls,
          concurrent: (channel, count, ...args) =>
            record(`${channel} x${count}`, args, () => {
              const handler = ipc.getHandler(channel)
              if (!handler)
                throw new Error(`no handler registered for ${channel}`)
              return Promise.all(
                Array.from({ length: count }, () => handler(undefined, ...args))
              )
            }),
          ipc: (channel, ...args) =>
            record(channel, args, () => {
              const handler = ipc.getHandler(channel)
              if (!handler)
                throw new Error(`no handler registered for ${channel}`)
              return handler(undefined, ...args)
            }),
          direct: (name, args, fn) => record(name, args, fn),
          step: (name, args, fn) => record(name, args, fn),
          setSteam,
          setCookie: secrets.set,
          advance: (ms) => jest.setSystemTime(Date.now() + ms),
          settleAppIdPass: (entries) =>
            // The wait is inside the recorded call: the events the pass raises (the patch and
            // the recompute it triggers) belong to it, not to the sync that started it.
            record('settleAppIdPass', [entries], async () => {
              const answered = (): number =>
                Array.from(humble.humbleSteamAppIdStore.entries()).length
              for (let i = 0; i < 400 && answered() < entries; i++) {
                await pause(25)
              }
              if (answered() < entries) {
                throw new Error(
                  `the Steam app-id pass answered fewer than ${entries} titles`
                )
              }
              // The pass patches the cache and recomputes ownership in microtasks after its last
              // answer.
              await pause(50)
              return null
            }).then(() => undefined),
          snapshot: () => readableSnapshot(profile.userData)
        }

        let requests: unknown
        await withWireRecorder(
          {
            slice: options.slice,
            caseId: options.caseId,
            synthetic: options.synthetic
          },
          async (recorder) => {
            await options.script(env)
            requests = [...recorder.requests]
          }
        )
        return {
          input: {
            cookie: options.cookie === '' ? 'none' : 'fake',
            steam: options.steam
              ? {
                  loggedIn: options.steam.loggedIn,
                  games: options.steam.games.map((g) => ({
                    app_name: g.app_name,
                    title: g.title
                  }))
                }
              : null,
            seed: describeSeed(options.seed)
          },
          calls,
          requests,
          stateAfter: env.snapshot()
        }
      } finally {
        digestSpy.mockRestore()
        warnSpy.mockRestore()
        restoreGaps()
        restoreDate()
      }
    })
  )
}
