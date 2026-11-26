/**
 * The user-flow harness of the Humble oracle (94-09 Task 1, D-05, D-06, D-18, T-94-16): it drives
 * the real `HumbleUser` the way the boot builds it, over
 *   - a real `StoreRoot` and the real humble store family on a fresh `createFakeHomeProfile()`
 *     (the bytes a flow leaves behind are the TS writer's, `diskStoreSink.ts`);
 *   - the real `SidecarHumbleSecretStore` over a scripted fake keyring (`fakeKeyring.ts`), so no case
 *     reaches the real Keychain and the secret cache and its invalidate-before-delete order are the
 *     production ones;
 *   - a scripted `LoginWindowSeam` that records every call and answers per step (the cookie jar the
 *     script sets, the nav events it queues, a failing method it scripts);
 *   - the wire recorder as the network (`withWireRecorder`), so `getSessionStatus` is recorded as it
 *     appears on the socket (94-06);
 *   - the real sign-in outcome owner (`createTestSignInProbe`), wrapped to record the
 *     `noteSignInSucceeded` and `noteSignedOut` calls;
 *   - jest fake timers for `Date`, `setTimeout` and `setInterval` only (the watch's poll interval and
 *     its ten-minute deadline), so the clock moves in `COOKIE_POLL_INTERVAL_MS` steps while sockets
 *     and `setImmediate` stay real.
 * No module is mocked: the logger is read with `jest.spyOn`, the secret cache's invalidation with a
 * call-through spy on the slot store's prototype, and the three session-status hooks are an axios
 * interceptor (the `pointSteamStoreSearchAt` mechanism).
 *
 * A golden is `{input, steps, seamCalls, requests, secretOps, outcomeNotes, outcomePushes, pushes,
 * fenceCalls, logs, result, stateBefore, stateAfter}`. Every recorded entry except `requests` carries
 * `seq` (one counter across all of them, so their order is reconstructible) and `atMs` (milliseconds
 * since the pinned start, on the fake clock). The recorder's base URL becomes the real Humble origin
 * in the text, so a golden is the same on every host.
 */
import { COOKIE_POLL_INTERVAL_MS, HumbleUser } from '../../user'
import { createHumbleStores } from '../../stores'
import { SidecarHumbleSecretStore } from 'backend/sidecar/humbleSecretStore'
import { SidecarKeyringSlotStore } from 'backend/sidecar/keyringTokenStore'
import {
  createLoginWindowSeamSlot,
  type LoginWindowCookie,
  type LoginWindowCookieRead,
  type LoginWindowNavEvent,
  type LoginWindowSeam,
  type LoginWindowStorageClearResult
} from 'backend/login/loginWindowSeam'
import * as logger from 'backend/logger'
import axios from 'axios'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createTestStoreRoot } from 'backend/testUtils/testStoreRoot'
import {
  createTestSignInProbe,
  type TestSignInProbe
} from 'backend/testUtils/testSignInProbe'
import {
  PINNED_NOW_MS,
  seedHumbleState,
  withHumbleOracleProfile,
  withWireRecorder,
  type HumbleOracleProfile,
  type HumbleSeedFile
} from 'backend/testUtils/humbleOracle/harness'
import type { SyntheticResponse } from 'backend/testUtils/humbleOracle/wireRecorder'
import type { SendFrontendMessage } from 'backend/host/frontendMessage'
import {
  createFakeKeyring,
  type FakeKeyring,
  type FakeKeyringOptions,
  type KeyringCall
} from './fakeKeyring'
import { readableSnapshot, withUtc } from './flowHarness'

/** What every case's real jar, appInfo and cookies are built from: visibly fake values only. */
export const USER_AGENT_FALLBACK =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) GameLib/1.0.0 Chrome/142.0.7444.52 Electron/41.1.1 Safari/537.36'

/** The session-cookie value the secret store holds and the wire carries. */
export const ORY_COOKIE_VALUE = 'ory_session_fake=REDACTED'

export const ORY_COOKIE: LoginWindowCookie = {
  name: 'ory_session_fake',
  domain: '.humblebundle.com',
  value: 'REDACTED'
}
export const LEGACY_COOKIE: LoginWindowCookie = {
  name: '_simpleauth_sess',
  domain: '.humblebundle.com',
  value: 'REDACTED'
}
export const CSRF_COOKIE: LoginWindowCookie = {
  name: 'csrf_cookie',
  domain: '.humblebundle.com',
  value: 'REDACTED'
}
/** A cookie the jar holds that is not a session candidate (the anonymous jar is 33 cookies). */
export const OTHER_COOKIE: LoginWindowCookie = {
  name: 'fake_tracking',
  domain: '.humblebundle.com',
  value: 'REDACTED'
}

/** How many cookies of other sites the jar holds besides Humble's (Epic, GOG, Amazon, ...). */
const OTHER_SITES_COOKIES = 30

/** A `getSessionStatus` answer for the `/api/auth/session-status` target. */
export function sessionStatusAnswer(
  status: number,
  body: unknown
): SyntheticResponse {
  return {
    method: 'GET',
    target: '/api/auth/session-status',
    status,
    headers: [['content-type', 'application/json']],
    body: JSON.stringify(body)
  }
}
export const authenticated = (): SyntheticResponse =>
  sessionStatusAnswer(200, { status: 'authenticated' })
export const anonymous = (): SyntheticResponse =>
  sessionStatusAnswer(200, { status: 'anonymous' })

export interface SeamCall {
  seq: number
  atMs: number
  op: string
  args: unknown[]
  result?: unknown
  threw?: string
}

/** What one scripted seam method does for call number `n` (0-based, per method). */
export interface SeamScript {
  open?: (n: number, url: string) => string | Promise<string>
  cookies?: (
    n: number,
    label: string,
    host: string,
    names: string[]
  ) => LoginWindowCookieRead | Promise<LoginWindowCookieRead>
  cookiesForDomain?: (
    n: number,
    label: string,
    domain: string,
    names: string[]
  ) => LoginWindowCookieRead | Promise<LoginWindowCookieRead>
  takeEvents?: (
    n: number,
    label: string
  ) => LoginWindowNavEvent[] | Promise<LoginWindowNavEvent[]>
  close?: (n: number, label: string) => boolean | Promise<boolean>
  clearCookies?: (
    n: number,
    label: string,
    domain: string
  ) => number | Promise<number>
  clearStorage?: (
    n: number,
    origin: string
  ) => LoginWindowStorageClearResult | Promise<LoginWindowStorageClearResult>
}

export interface LogLine {
  seq: number
  atMs: number
  level: 'info' | 'warn'
  message: string
}

export interface UserEnv {
  readonly user: HumbleUser
  readonly stores: ReturnType<typeof createHumbleStores>
  readonly profile: HumbleOracleProfile
  readonly keyring: FakeKeyring
  readonly probe: TestSignInProbe
  /** Sets the login window's cookie jar: Humble's cookies and how many others the jar holds. */
  setJar(humble: readonly LoginWindowCookie[], others?: number): void
  /** Queues the nav events the next `takeEvents` drains. */
  queueEvents(...events: LoginWindowNavEvent[]): void
  /** Moves the fake clock one poll interval at a time, settling I/O after each, `count` times. */
  tick(count?: number): Promise<void>
  /** Moves the fake clock by `ms` in one step, then settles. */
  advance(ms: number): Promise<void>
  /** Lets in-flight I/O and promise chains finish. */
  settle(): Promise<void>
  /** A line in the golden's `steps`: what the script did or saw, at this point of the flow. */
  mark(kind: string, data?: unknown): void
  /** Records the promise's result as a step when it settles, and returns it. */
  watch<T>(label: string, promise: Promise<T>): Promise<T>
  /** The text of every Humble state file now. */
  snapshot(): ReturnType<typeof readableSnapshot>
  /** The recorded session-status calls so far, for a hook that wants the call number. */
  sessionStatusCalls(): number
}

export interface UserCaseOptions {
  slice: string
  caseId: string
  /** What the case is about, one line, kept in the golden. */
  about: string
  synthetic?: readonly SyntheticResponse[]
  /** State written through the real stores before the flow starts. */
  prepare?: (env: {
    stores: ReturnType<typeof createHumbleStores>
    profile: HumbleOracleProfile
  }) => void
  /** Raw state files written before the stores are built. */
  seed?: Readonly<Record<string, HumbleSeedFile>>
  keyring?: FakeKeyringOptions
  seam?: SeamScript
  /**
   * Runs before a session-status request leaves (call `n`, 0-based). Returning `{throw}` makes that
   * request fail before the wire, the way a dropped connection does.
   */
  onSessionStatus?: (n: number, env: UserEnv) => { throw: string } | undefined
  script: (env: UserEnv) => Promise<unknown>
}

const realSetTimeout = setTimeout
const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => realSetTimeout(resolve, ms))
const nextImmediate = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve))

/** A log argument as the golden shows it: text, and an error as its message. */
function formatLog(message: unknown): string {
  const parts = Array.isArray(message) ? message : [message]
  return parts
    .map((part) =>
      part instanceof Error
        ? part.message
        : typeof part === 'string'
          ? part
          : JSON.stringify(part)
    )
    .join(' ')
}

/** Never pass a recorded value to a golden unchanged when it holds the recorder's port. */
function hostIndependent(value: unknown, baseUrl: string): unknown {
  return JSON.parse(
    JSON.stringify(value).split(baseUrl).join('https://www.humblebundle.com')
  ) as unknown
}

export async function runUserCase(options: UserCaseOptions): Promise<unknown> {
  return withUtc(() =>
    withHumbleOracleProfile(async (profile) => {
      jest.useFakeTimers({
        now: PINNED_NOW_MS,
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
          'clearImmediate'
        ]
      })
      let seq = 0
      const stamp = (): { seq: number; atMs: number } => ({
        seq: seq++,
        atMs: Date.now() - PINNED_NOW_MS
      })
      const steps: unknown[] = []
      const seamCalls: SeamCall[] = []
      const secretOps: unknown[] = []
      const outcomeNotes: unknown[] = []
      const pushes: unknown[] = []
      const fenceCalls: unknown[] = []
      const logs: LogLine[] = []
      const keyringLines: string[] = []

      const record = (level: LogLine['level'], message: unknown): void => {
        const text = formatLog(message)
        if (text.startsWith('SidecarKeyringSlotStore(')) {
          keyringLines.push(text)
          return
        }
        logs.push({ ...stamp(), level, message: text })
      }
      const infoSpy = jest
        .spyOn(logger, 'logInfo')
        .mockImplementation((message: unknown) => {
          record('info', message)
        })
      const warnSpy = jest
        .spyOn(logger, 'logWarning')
        .mockImplementation((message: unknown) => {
          record('warn', message)
        })
      // A call-through spy: the original runs, the spy only notes that it did.
      const originalInvalidate = Reflect.get(
        SidecarKeyringSlotStore.prototype,
        'invalidateCache'
      ) as (this: SidecarKeyringSlotStore) => void
      const invalidateSpy = jest
        .spyOn(SidecarKeyringSlotStore.prototype, 'invalidateCache')
        .mockImplementation(function (this: unknown) {
          secretOps.push({
            ...stamp(),
            op: 'invalidateCache',
            slot: (this as { slot: string }).slot
          })
          originalInvalidate.call(this as SidecarKeyringSlotStore)
        })

      let inFlight = 0
      let sessionCalls = 0
      const ejects: number[] = []
      let env: UserEnv | undefined

      try {
        if (options.seed) seedHumbleState(profile.userData, options.seed)
        const registry = createStoreRegistry()
        const root = createTestStoreRoot(profile.userData)
        const stores = createHumbleStores({ registry, root })
        options.prepare?.({ stores, profile })
        const stateBefore = readableSnapshot(profile.userData)

        const keyring = createFakeKeyring({
          ...options.keyring,
          onCall: (call: KeyringCall) => {
            Object.assign(call, stamp())
            secretOps.push(call)
          }
        })
        const secretStore = new SidecarHumbleSecretStore(
          keyring.requestRustInvoke
        )

        // The seam: records every call, answers from the jar or the case's script.
        let jar = {
          humble: [] as readonly LoginWindowCookie[],
          others: OTHER_SITES_COOKIES
        }
        const queued: LoginWindowNavEvent[] = []
        const counts: Record<string, number> = {}
        const nextCount = (op: string): number =>
          (counts[op] = (counts[op] ?? -1) + 1)
        const jarRead = (names: string[]): LoginWindowCookieRead => ({
          total: jar.humble.length + jar.others,
          matched: jar.humble.filter(
            (c) => names.length === 0 || names.includes(c.name)
          )
        })
        const call = async <T>(
          op: string,
          args: unknown[],
          answer: () => T | Promise<T>
        ): Promise<T> => {
          const entry: SeamCall = { ...stamp(), op, args }
          seamCalls.push(entry)
          try {
            const result = await answer()
            entry.result = result
            return result
          } catch (error) {
            entry.threw = (error as Error).message
            throw error
          }
        }
        const { seam: script = {} } = options
        const seam: LoginWindowSeam = {
          open: (url, opts) =>
            call('open', [url, opts], () => {
              const n = nextCount('open')
              return script.open ? script.open(n, url) : `login-humble-${n}`
            }),
          cookies: (label, host, names) =>
            call('cookies', [label, host, names], () => {
              const n = nextCount('cookies')
              return script.cookies
                ? script.cookies(n, label, host, names)
                : jarRead(names)
            }),
          cookiesForDomain: (label, domain, names) =>
            call('cookiesForDomain', [label, domain, names], () => {
              const n = nextCount('cookiesForDomain')
              return script.cookiesForDomain
                ? script.cookiesForDomain(n, label, domain, names)
                : jarRead(names)
            }),
          takeEvents: (label) =>
            call('takeEvents', [label], () => {
              const n = nextCount('takeEvents')
              if (script.takeEvents) return script.takeEvents(n, label)
              return queued.splice(0, queued.length)
            }),
          close: (label) =>
            call('close', [label], () => {
              const n = nextCount('close')
              return script.close ? script.close(n, label) : true
            }),
          clearCookies: (label, domain) =>
            call('clearCookies', [label, domain], () => {
              const n = nextCount('clearCookies')
              if (script.clearCookies)
                return script.clearCookies(n, label, domain)
              // The domain-scoped clear: Humble's cookies go, the other sites' stay.
              const deleted = jar.humble.length
              jar = { humble: [], others: jar.others }
              return deleted
            }),
          revealPost: () =>
            Promise.reject(new Error('the user oracle never posts a reveal')),
          clearStorage: (origin, userAgent) =>
            call('clearStorage', [origin, userAgent], () => {
              const n = nextCount('clearStorage')
              return script.clearStorage
                ? script.clearStorage(n, origin)
                : {
                    localStorage: 0,
                    sessionStorage: 0,
                    indexedDB: 0,
                    caches: 0,
                    serviceWorkers: 0
                  }
            })
        }
        const seamSlot = createLoginWindowSeamSlot()
        seamSlot.install(seam)

        const probe = createTestSignInProbe()
        const signInOutcomes = {
          ...probe.outcomes,
          noteSignInSucceeded: (
            store: Parameters<typeof probe.outcomes.noteSignInSucceeded>[0]
          ) => {
            outcomeNotes.push({
              ...stamp(),
              call: 'noteSignInSucceeded',
              store
            })
            probe.outcomes.noteSignInSucceeded(store)
          },
          noteSignedOut: (
            store: Parameters<typeof probe.outcomes.noteSignedOut>[0]
          ) => {
            outcomeNotes.push({ ...stamp(), call: 'noteSignedOut', store })
            probe.outcomes.noteSignedOut(store)
          }
        }
        const sendFrontendMessage = ((channel: string, ...args: unknown[]) => {
          pushes.push({
            ...stamp(),
            channel,
            payload: JSON.parse(
              JSON.stringify(args.length > 1 ? args : (args[0] ?? null))
            ) as unknown
          })
          return true
        }) as unknown as SendFrontendMessage

        const user = new HumbleUser({
          stores: { humble: stores },
          secretStore,
          loginWindowSeam: seamSlot,
          syncFence: {
            invalidate: () => {
              fenceCalls.push({ ...stamp(), call: 'invalidate' })
            }
          },
          signInOutcomes: signInOutcomes as never,
          appInfo: { userAgentFallback: USER_AGENT_FALLBACK },
          sendFrontendMessage
        })

        const settle = async (): Promise<void> => {
          let quiet = 0
          for (let i = 0; i < 4000 && quiet < 3; i++) {
            await nextImmediate()
            if (inFlight > 0) {
              quiet = 0
              await pause(1)
            } else {
              quiet++
            }
          }
          if (inFlight > 0) throw new Error('a request never completed')
        }

        env = {
          user,
          stores,
          profile,
          keyring,
          probe,
          setJar: (humble, others = OTHER_SITES_COOKIES) => {
            jar = { humble, others }
          },
          queueEvents: (...events) => {
            queued.push(...events)
          },
          tick: async (count = 1) => {
            for (let i = 0; i < count; i++) {
              jest.advanceTimersByTime(COOKIE_POLL_INTERVAL_MS)
              await settle()
            }
          },
          advance: async (ms) => {
            jest.advanceTimersByTime(ms)
            await settle()
          },
          settle,
          mark: (kind, data) => {
            steps.push({
              ...stamp(),
              kind,
              ...(data === undefined ? {} : { data })
            })
          },
          watch: (label, promise) => {
            void promise.then(
              (value) => {
                env?.mark(`${label} settled`, value)
              },
              (error: Error) => {
                env?.mark(`${label} rejected`, error.message)
              }
            )
            return promise
          },
          snapshot: () => readableSnapshot(profile.userData),
          sessionStatusCalls: () => sessionCalls
        }
        const runEnv = env

        let requests: unknown
        let baseUrl = ''
        let scriptResult: unknown
        await withWireRecorder(
          {
            slice: options.slice,
            caseId: options.caseId,
            synthetic: options.synthetic ?? []
          },
          async (recorder) => {
            baseUrl = recorder.baseUrl
            ejects.push(
              axios.interceptors.request.use((config) => {
                inFlight++
                const url = typeof config.url === 'string' ? config.url : ''
                if (
                  url.startsWith(`${recorder.baseUrl}/api/auth/session-status`)
                ) {
                  const n = sessionCalls++
                  runEnv.mark('session-status request', { call: n })
                  const action = options.onSessionStatus?.(n, runEnv)
                  if (action) {
                    runEnv.mark(
                      'session-status request fails before the wire',
                      {
                        call: n,
                        message: action.throw
                      }
                    )
                    config.adapter = () =>
                      Promise.reject(new Error(action.throw))
                  }
                }
                return config
              })
            )
            const responseEject = axios.interceptors.response.use(
              (response) => {
                inFlight--
                return response
              },
              (error: unknown) => {
                inFlight--
                throw error
              }
            )
            try {
              scriptResult = await options.script(runEnv)
              await settle()
              requests = [...recorder.requests]
            } finally {
              user.stopLogin()
              for (const eject of ejects.splice(0)) {
                axios.interceptors.request.eject(eject)
              }
              axios.interceptors.response.eject(responseEject)
            }
          }
        )

        const allText = [...logs.map((l) => l.message), ...keyringLines].join(
          '\n'
        )
        for (const value of Object.values(keyring.slots())) {
          if (value.length > 0 && !/^REDACTED$/.test(value)) {
            // The synthetic stored value is never in a log line, whole or in part.
            expect(allText).not.toContain(value)
          }
        }
        expect(allText).not.toContain(ORY_COOKIE_VALUE)

        const golden = {
          input: {
            about: options.about,
            keyringInitial: options.keyring?.initial ?? {},
            seed: options.seed ?? {}
          },
          steps,
          seamCalls,
          requests,
          secretOps,
          outcomeNotes,
          outcomePushes: probe.pushed,
          outcomesAfter: probe.outcomes.get(),
          pushes,
          fenceCalls,
          logs,
          ...(scriptResult === undefined
            ? {}
            : { result: JSON.parse(JSON.stringify(scriptResult)) as unknown }),
          stateBefore,
          stateAfter: runEnv.snapshot(),
          keyringAfter: keyring.slots()
        }
        return hostIndependent(golden, baseUrl)
      } finally {
        for (const eject of ejects.splice(0)) {
          axios.interceptors.request.eject(eject)
        }
        invalidateSpy.mockRestore()
        warnSpy.mockRestore()
        infoSpy.mockRestore()
        jest.useRealTimers()
      }
    })
  )
}
