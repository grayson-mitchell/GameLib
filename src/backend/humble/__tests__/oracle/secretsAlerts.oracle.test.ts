/**
 * The Humble secrets, expiry-digest, Steam app-id resolver and user-agent oracle (94-09 Task 2,
 * D-05, D-06, D-18, T-94-16), recorded from the TypeScript before any Rust for them.
 *
 * secrets: the real `SidecarHumbleSecretStore` (and the `SidecarKeyringSlotStore` under it) over a
 * scripted fake keyring (`fakeKeyring.ts`, nothing reaches the OS Keychain or a dev vault) on jest
 * fake timers for `Date` and `setTimeout`: the process-lifetime success cache, in-flight dedupe, the
 * 120 s failure memo (`KEYRING_FAILURE_MEMO_MS`), totality (never throws, never logs a value), the
 * three-state `readSecret`, invalidate-before-delete, the epoch fence on a read that races a
 * write, and the one-time plaintext-to-keyring migration with its read-back, the legacy key's
 * deletion and the `encryptionDegraded` write (Pitfall 14). A golden is `{input, steps, keyringCalls,
 * logs, result, keyringAfter, stateBefore, stateAfter}`; every log line is recorded and the case
 * fails when one carries the stored value.
 *
 * alerts: `detectAndNotifyExpirationTransitions` over the real notified-expiration store, a recording
 * notification slice, the real i18next at the sidecar's `en` locale (the `i18next.t` calls are
 * recorded with their params), and the host's own `toLocaleDateString()`. The date the digest shows
 * is the en-US `M/D/YYYY` the sidecar renders today: a host whose default locale differs fails the
 * case instead of recording its own format.
 *
 * app_id_resolver: the real resolver over the real `humble_steam_appid` store, the wire recorder
 * (`pointSteamStoreSearchAt`: the storesearch URL is module-private) and a recording `sleep` that
 * moves the fake clock; each golden holds the requests in order with the axios config the wire does
 * not show (the 8 s timeout, the params), the sleeps between them, the summary and the cache bytes.
 *
 * user_agent: `standardBrowserUserAgent` over the platform strings `login/__tests__/userAgent.test.ts`
 * uses and the edge shapes the function branches on, as `{input, output}`; that test replays them.
 *
 * No module mock: warnings are read through `jest.spyOn` on the logger, i18next is the real one
 * (`jest.unmock`), the keyring invalidation is a call-through spy on the slot store's prototype.
 * `GAMELIB_WRITE_HUMBLE_GOLDEN=1` writes the goldens and recordings; the default compares.
 */
import axios from 'axios'
import i18next from 'i18next'
import Backend from 'i18next-fs-backend/cjs'
import { join } from 'path'
import * as environment from 'backend/constants/environment'
import * as logger from 'backend/logger'
import { standardBrowserUserAgent } from 'backend/login/userAgent'
import { resolveAppInfo } from 'backend/host/appInfo'
import {
  SidecarHumbleSecretStore,
  migrateHumbleSecrets,
  startSidecarHumbleSecretStore
} from 'backend/sidecar/humbleSecretStore'
import { SidecarKeyringSlotStore } from 'backend/sidecar/keyringTokenStore'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { createTestStoreRoot } from 'backend/testUtils/testStoreRoot'
import {
  assertManifest,
  expectEmptyCasesToFail,
  PINNED_NOW_MS,
  syncManifest,
  withHumbleOracleProfile,
  withWireRecorder,
  writeOrCompareGolden
} from 'backend/testUtils/humbleOracle/harness'
import type { SyntheticResponse } from 'backend/testUtils/humbleOracle/wireRecorder'
import { i18nextLanguageOptions, localeFileSegments } from 'common/languages'
import type { AppSettings } from 'common/types'
import type { HumbleKey } from 'common/types/humble'
import { detectAndNotifyExpirationTransitions } from '../../expirationAlerts'
import { createHumbleStores } from '../../stores'
import {
  HUMBLE_APPID_RESOLVE_CAP,
  createSteamAppIdResolver,
  type HumbleSteamAppIdCacheEntry,
  type SteamStoreSearchItem
} from '../../steamAppIdResolver'
import {
  createFakeKeyring,
  type FakeKeyring,
  type FakeKeyringOptions
} from './fakeKeyring'
import { getAnswer } from './flight'
import { readableSnapshot, withUtc } from './flowHarness'
import { axiosEncode, storeSearch } from './libraryFixtures'

// The backend jest project shadows i18next with a key-echoing mock; the digest copy needs the real one.
jest.unmock('i18next')

const CASE_TIMEOUT_MS = 60_000
const SECRETS_FLOOR = 10
const ALERTS_FLOOR = 6
const RESOLVER_FLOOR = 6
const USER_AGENT_FLOOR = 5

/** The stored secret every case uses: visibly fake and not shaped like a session cookie. */
const SECRET = 'fake-secret-value-0001'
const SECRET_B = 'fake-secret-value-0002'
const CSRF = 'fake-secret-value-0003'
const SESSION_SLOT = 'humble-session'
const CSRF_SLOT = 'humble-csrf'

/** Fakes `Date`, `setTimeout` and `setInterval` only: the in-process promise chains stay real. */
const FAKE_TIMERS: {
  doNotFake: (
    | 'hrtime'
    | 'nextTick'
    | 'performance'
    | 'queueMicrotask'
    | 'requestAnimationFrame'
    | 'cancelAnimationFrame'
    | 'requestIdleCallback'
    | 'cancelIdleCallback'
    | 'setImmediate'
    | 'clearImmediate'
  )[]
} = {
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
}

const nextImmediate = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve))
/** Lets every promise chain that needs no I/O finish (the fake keyring and the clock are in-process). */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await nextImmediate()
}

type Stores = ReturnType<typeof createHumbleStores>

interface LogLine {
  seq: number
  atMs: number
  level: 'debug' | 'info' | 'warn'
  message: string
}

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

/** The three logger levels the cases read, recorded in order with the fake clock's time. */
function captureLogs(stamp: () => { seq: number; atMs: number }): {
  logs: LogLine[]
  restore: () => void
} {
  const logs: LogLine[] = []
  const spies = (['debug', 'info', 'warn'] as const).map((level) =>
    jest
      .spyOn(
        logger,
        level === 'debug'
          ? 'logDebug'
          : level === 'info'
            ? 'logInfo'
            : 'logWarning'
      )
      .mockImplementation((...args: unknown[]) => {
        logs.push({ ...stamp(), level, message: formatLog(args[0]) })
      })
  )
  return { logs, restore: () => spies.forEach((spy) => spy.mockRestore()) }
}

// ---------------------------------------------------------------------------------------------
// secrets
// ---------------------------------------------------------------------------------------------

interface SecretEnv {
  readonly store: SidecarHumbleSecretStore
  readonly stores: Stores
  readonly keyring: FakeKeyring
  readonly keyringCalls: readonly unknown[]
  /** Moves the fake clock and lets the keyring's own timers and the chains behind them finish. */
  advance(ms: number): Promise<void>
  mark(kind: string, data?: unknown): void
}

interface SecretCase {
  id: string
  about: string
  keyring?: FakeKeyringOptions
  /** State written through the real config store before the case. */
  prepare?: (stores: Stores) => void
  script: (env: SecretEnv) => Promise<unknown>
}

const secretCases: SecretCase[] = []
const addSecret = (c: SecretCase): void => {
  secretCases.push(c)
}

async function runSecretCase(c: SecretCase): Promise<unknown> {
  return withUtc(() =>
    withHumbleOracleProfile(async (profile) => {
      jest.useFakeTimers({ now: PINNED_NOW_MS, ...FAKE_TIMERS })
      let seq = 0
      const stamp = (): { seq: number; atMs: number } => ({
        seq: seq++,
        atMs: Date.now() - PINNED_NOW_MS
      })
      const steps: unknown[] = []
      const keyringCalls: unknown[] = []
      const { logs, restore } = captureLogs(stamp)
      // A call-through spy: the original runs, the spy only notes the order.
      const originalInvalidate = Reflect.get(
        SidecarKeyringSlotStore.prototype,
        'invalidateCache'
      ) as (this: SidecarKeyringSlotStore) => void
      const invalidateSpy = jest
        .spyOn(SidecarKeyringSlotStore.prototype, 'invalidateCache')
        .mockImplementation(function (this: unknown) {
          keyringCalls.push({
            ...stamp(),
            op: 'invalidateCache',
            slot: (this as { slot: string }).slot
          })
          originalInvalidate.call(this as SidecarKeyringSlotStore)
        })
      try {
        const registry = createStoreRegistry()
        const root = createTestStoreRoot(profile.userData)
        const stores = createHumbleStores({ registry, root })
        c.prepare?.(stores)
        const stateBefore = readableSnapshot(profile.userData)
        const keyring = createFakeKeyring({
          ...c.keyring,
          onCall: (call) => {
            Object.assign(call, stamp())
            keyringCalls.push(call)
          }
        })
        const store = new SidecarHumbleSecretStore(keyring.requestRustInvoke)
        const env: SecretEnv = {
          store,
          stores,
          keyring,
          keyringCalls,
          advance: async (ms) => {
            jest.advanceTimersByTime(ms)
            await flush()
          },
          mark: (kind, data) => {
            steps.push({
              ...stamp(),
              kind,
              ...(data === undefined ? {} : { data })
            })
          }
        }
        const result = await c.script(env)
        await flush()

        // T-94-16: no log line carries a stored value, whole or in part.
        const text = logs.map((l) => l.message).join('\n')
        for (const value of [SECRET, SECRET_B, CSRF]) {
          expect(text).not.toContain(value)
        }
        return {
          input: {
            about: c.about,
            keyringInitial: c.keyring?.initial ?? {}
          },
          steps,
          keyringCalls,
          logs,
          ...(result === undefined
            ? {}
            : { result: JSON.parse(JSON.stringify(result)) as unknown }),
          keyringAfter: keyring.slots(),
          stateBefore,
          stateAfter: readableSnapshot(profile.userData)
        }
      } finally {
        invalidateSpy.mockRestore()
        restore()
        jest.useRealTimers()
      }
    })
  )
}

const HEALTHY = { initial: { [SESSION_SLOT]: SECRET, [CSRF_SLOT]: CSRF } }

addSecret({
  id: 'read-caches-a-present-value-for-the-process-lifetime',
  about:
    'Two reads and a three-state read of a present slot: one keyring_get, the rest from the cache',
  keyring: HEALTHY,
  script: async (env) => {
    const first = await env.store.getSecret('sessionCookie')
    await env.advance(24 * 60 * 60 * 1000)
    env.mark('a day later')
    const second = await env.store.getSecret('sessionCookie')
    const third = await env.store.readSecret('sessionCookie', 'boot-probe')
    return { first, second, third }
  }
})

addSecret({
  id: 'read-caches-an-absent-slot-as-empty',
  about:
    'A null keyring answer is the healthy first-run case: absent, cached, never logged as a failure',
  script: async (env) => {
    const first = await env.store.readSecret('sessionCookie', 'boot-probe')
    const second = await env.store.readSecret('sessionCookie', 'boot-probe')
    return {
      first,
      second,
      getSecret: await env.store.getSecret('sessionCookie')
    }
  }
})

addSecret({
  id: 'concurrent-reads-share-one-keyring-call',
  about:
    'Three reads issued while the keyring is slow join the one in-flight read: one keyring_get, three answers',
  keyring: {
    ...HEALTHY,
    behave: { keyring_get: () => ({ delayMs: 500 }) }
  },
  script: async (env) => {
    const reads = [
      env.store.getSecret('sessionCookie'),
      env.store.readSecret('sessionCookie', 'boot-probe'),
      env.store.getSecret('sessionCookie')
    ]
    env.mark('three reads issued, the keyring has not answered')
    await env.advance(500)
    return Promise.all(reads)
  }
})

addSecret({
  id: 'failure-memo-answers-unreadable-without-a-keyring-call-for-120-s',
  about:
    'A failed read is memoised for KEYRING_FAILURE_MEMO_MS (120000): the second read at 60 s and the third at 119999 ms make no keyring call; the fourth, at 120000 ms, asks again',
  keyring: {
    initial: { [SESSION_SLOT]: SECRET },
    behave: {
      keyring_get: (n) => (n === 0 ? { fail: 'keyring is locked' } : undefined)
    }
  },
  script: async (env) => {
    const at0 = await env.store.readSecret('sessionCookie', 'boot-probe')
    await env.advance(60_000)
    const at60s = await env.store.readSecret('sessionCookie', 'boot-probe')
    await env.advance(59_999)
    const at119999 = await env.store.readSecret('sessionCookie', 'boot-probe')
    await env.advance(1)
    const at120000 = await env.store.readSecret('sessionCookie', 'boot-probe')
    return { at0, at60s, at119999, at120000 }
  }
})

addSecret({
  id: 'failure-is-classified-timeout-or-unavailable-per-slot',
  about:
    'A message with timeout or timed out is unreadable/timeout, any other failure unreadable/unavailable; each slot has its own memo',
  keyring: {
    ...HEALTHY,
    behave: {
      keyring_get: (_n, slot) =>
        slot === SESSION_SLOT
          ? { fail: 'keyring read timed out after 45 s' }
          : { fail: 'access to the keychain was denied' }
    }
  },
  script: async (env) => ({
    session: await env.store.readSecret('sessionCookie', 'boot-probe'),
    csrf: await env.store.readSecret('csrfToken', 'boot-probe')
  })
})

addSecret({
  id: 'getsecret-is-total-on-a-failing-keyring',
  about:
    'getSecret on a rejecting keyring resolves the empty string: it never throws, the failure is logged once and the memo line names no value',
  keyring: {
    ...HEALTHY,
    behave: { keyring_get: () => ({ fail: 'keyring is locked' }) }
  },
  script: async (env) => ({ value: await env.store.getSecret('sessionCookie') })
})

addSecret({
  id: 'set-invalidates-then-writes-then-serves-the-next-read-from-cache',
  about:
    'setSecret drops the cache, writes through keyring_set and caches the new value: the following read makes no keyring_get',
  script: async (env) => {
    await env.store.setSecret('sessionCookie', SECRET)
    const read = await env.store.getSecret('sessionCookie')
    const available = await env.store.isAvailable('store-humble-secret')
    return { read, available }
  }
})

addSecret({
  id: 'set-failure-is-total-and-leaves-the-cache-cold',
  about:
    'A rejecting keyring_set is a warning, never a throw; the next read goes to the keyring (the cache stayed invalidated)',
  keyring: {
    initial: { [SESSION_SLOT]: SECRET_B },
    behave: { keyring_set: () => ({ fail: 'keyring is full' }) }
  },
  script: async (env) => {
    await env.store.setSecret('sessionCookie', SECRET)
    return { read: await env.store.getSecret('sessionCookie') }
  }
})

addSecret({
  id: 'clear-invalidates-before-each-delete',
  about:
    'clearSecrets invalidates each slot cache before its keyring_delete (the order in keyringCalls), then a read is the cached empty value with no keyring_get',
  keyring: HEALTHY,
  script: async (env) => {
    const before = await env.store.getSecret('sessionCookie')
    await env.store.clearSecrets()
    env.mark('after clearSecrets')
    const after = await env.store.getSecret('sessionCookie')
    const csrfAfter = await env.store.getSecret('csrfToken')
    return { before, after, csrfAfter }
  }
})

addSecret({
  id: 'clear-failure-is-total-and-never-resurrects-a-cached-value',
  about:
    'Both deletes reject: two warnings, no throw; the cache was invalidated first, so the read goes to the keyring instead of serving the stale value',
  keyring: {
    ...HEALTHY,
    behave: { keyring_delete: () => ({ fail: 'keyring is locked' }) }
  },
  script: async (env) => {
    const before = await env.store.getSecret('sessionCookie')
    await env.store.clearSecrets()
    return { before, after: await env.store.getSecret('sessionCookie') }
  }
})

addSecret({
  id: 'a-read-in-flight-never-overwrites-a-newer-write',
  about:
    'A slow read returns the old value after setSecret wrote a new one: the epoch fence keeps the cache on the new value',
  keyring: {
    initial: { [SESSION_SLOT]: SECRET },
    behave: {
      keyring_get: (n) =>
        n === 0 ? { delayMs: 1000, then: { answer: SECRET } } : undefined
    }
  },
  script: async (env) => {
    const slowRead = env.store.getSecret('sessionCookie')
    env.mark('a slow read is in flight')
    await env.store.setSecret('sessionCookie', SECRET_B)
    await env.advance(1000)
    const slow = await slowRead
    const afterwards = await env.store.getSecret('sessionCookie')
    return { slow, afterwards }
  }
})

addSecret({
  id: 'invalidate-clears-the-failure-memo',
  about:
    'invalidateCache drops the memo along with the value: the read right after a failure asks the keyring again',
  keyring: {
    initial: { [SESSION_SLOT]: SECRET },
    behave: {
      keyring_get: (n) => (n === 0 ? { fail: 'keyring is locked' } : undefined)
    }
  },
  script: async (env) => {
    const failed = await env.store.readSecret('sessionCookie', 'boot-probe')
    env.store.invalidateCache('sessionCookie')
    const again = await env.store.readSecret('sessionCookie', 'boot-probe')
    return { failed, again }
  }
})

addSecret({
  id: 'availability-probe-is-cached-and-deduped-and-a-failure-is-not-cached',
  about:
    'Three concurrent isAvailable calls issue one keyring_available; a rejecting probe answers false and is not cached, so the next call asks again',
  keyring: {
    behave: {
      keyring_available: (n) =>
        n === 0
          ? { delayMs: 200 }
          : n === 1
            ? { fail: 'keyring is locked' }
            : undefined
    }
  },
  script: async (env) => {
    const probes = [
      env.store.isAvailable('first'),
      env.store.isAvailable('second'),
      env.store.isAvailable('third')
    ]
    await env.advance(200)
    const concurrent = await Promise.all(probes)
    const cached = await env.store.isAvailable('cached')
    env.store.invalidateCache('sessionCookie')
    const failing = await env.store.isAvailable('after-invalidate')
    const retried = await env.store.isAvailable('retry')
    return { concurrent, cached, failing, retried }
  }
})

addSecret({
  id: 'slow-keyring-read-fails-as-a-timeout-after-the-rust-bound',
  about:
    'The keyring read fails 45 s in with a timeout message: classified timeout, memoised from the failure time',
  keyring: {
    ...HEALTHY,
    behave: {
      keyring_get: () => ({
        delayMs: 45_000,
        then: { fail: 'keyring read timed out' }
      })
    }
  },
  script: async (env) => {
    const read = env.store.readSecret('sessionCookie', 'boot-probe')
    await env.advance(45_000)
    const first = await read
    await env.advance(119_999)
    const memo = await env.store.readSecret('sessionCookie', 'boot-probe')
    return { first, memo }
  }
})

addSecret({
  id: 'the-two-slots-are-independent',
  about:
    'Reading, failing and clearing one slot leaves the other slot cached and healthy',
  keyring: {
    ...HEALTHY,
    behave: {
      keyring_get: (_n, slot) =>
        slot === CSRF_SLOT ? { fail: 'keyring is locked' } : undefined
    }
  },
  script: async (env) => {
    const session = await env.store.readSecret('sessionCookie', 'boot-probe')
    const csrf = await env.store.readSecret('csrfToken', 'boot-probe')
    const sessionAgain = await env.store.getSecret('sessionCookie')
    return { session, csrf, sessionAgain }
  }
})

// -- the one-time plaintext-to-keyring migration (Pitfall 14) -------------------------------------

const withPlaintext =
  (sessionCookie: boolean, csrfToken: boolean) =>
  (stores: Stores): void => {
    if (sessionCookie) stores.configStore.set('sessionCookie', SECRET)
    if (csrfToken) stores.configStore.set('csrfToken', CSRF)
    stores.configStore.set('isLoggedIn', true)
    stores.configStore.set('encryptionDegraded', true)
  }

/** The migration's deps over the SAME keyring the case's store uses (its call log is shared). */
const migrationDeps = (env: SecretEnv) => ({
  stores: { humble: env.stores },
  requestRustInvoke: env.keyring.requestRustInvoke
})

addSecret({
  id: 'migration-moves-both-secrets-with-a-read-back',
  about:
    'Each plaintext secret is written to its slot, read back, compared, and only then deleted from the config; encryptionDegraded is written false. A read before the migration cached the empty slot, so the migration must invalidate that cache',
  prepare: withPlaintext(true, true),
  script: async (env) => {
    const before = await env.store.getSecret('sessionCookie')
    await migrateHumbleSecrets(env.store, migrationDeps(env))
    const after = await env.store.getSecret('sessionCookie')
    const csrfAfter = await env.store.getSecret('csrfToken')
    return { before, after, csrfAfter }
  }
})

addSecret({
  id: 'migration-with-nothing-to-migrate-makes-no-keyring-call',
  about:
    'No plaintext secret in the config: the healthy already-migrated case, no keyring call, no log, the config is untouched',
  prepare: (stores) => {
    stores.configStore.set('isLoggedIn', true)
    stores.configStore.set('encryptionDegraded', false)
  },
  script: async (env) => {
    await migrateHumbleSecrets(env.store, migrationDeps(env))
  }
})

addSecret({
  id: 'migration-write-failure-leaves-the-plaintext-in-place',
  about:
    'keyring_set rejects: one warning naming the failure, the plaintext and encryptionDegraded stay as they were, no read-back is attempted',
  prepare: withPlaintext(true, true),
  keyring: { behave: { keyring_set: () => ({ fail: 'keyring is locked' }) } },
  script: async (env) => {
    await migrateHumbleSecrets(env.store, migrationDeps(env))
  }
})

addSecret({
  id: 'migration-read-back-failure-leaves-the-plaintext-in-place',
  about:
    'The read-back rejects: the plaintext is kept and one warning is logged',
  prepare: withPlaintext(true, false),
  keyring: { behave: { keyring_get: () => ({ fail: 'keyring is locked' }) } },
  script: async (env) => {
    await migrateHumbleSecrets(env.store, migrationDeps(env))
  }
})

addSecret({
  id: 'migration-read-back-mismatch-is-never-rounded-up-to-success',
  about:
    'The read-back answers a different value: the plaintext is kept, one warning, and neither value appears in any log line',
  prepare: withPlaintext(true, false),
  keyring: {
    behave: { keyring_get: () => ({ answer: 'fake-secret-value-9999' }) }
  },
  script: async (env) => {
    await migrateHumbleSecrets(env.store, migrationDeps(env))
  }
})

addSecret({
  id: 'migration-is-per-secret-so-a-csrf-failure-never-strands-the-session',
  about:
    'The session write fails and the csrf one succeeds: the csrf plaintext is migrated and deleted, the session plaintext stays',
  prepare: withPlaintext(true, true),
  keyring: {
    behave: {
      keyring_set: (_n, slot) =>
        slot === SESSION_SLOT ? { fail: 'keyring is locked' } : undefined
    }
  },
  script: async (env) => {
    await migrateHumbleSecrets(env.store, migrationDeps(env))
  }
})

addSecret({
  id: 'migration-only-the-csrf-token-is-plaintext',
  about:
    'Only csrfToken is stored in plaintext: only its slot is written and read back',
  prepare: withPlaintext(false, true),
  script: async (env) => {
    await migrateHumbleSecrets(env.store, migrationDeps(env))
  }
})

addSecret({
  id: 'boot-hook-logs-the-install-line-and-fires-the-migration',
  about:
    'startSidecarHumbleSecretStore logs the keyring-backed receipt line and runs the migration without being awaited; the golden is read after it settles',
  prepare: withPlaintext(true, true),
  script: async (env) => {
    startSidecarHumbleSecretStore(env.store, migrationDeps(env))
    await env.advance(0)
  }
})

// ---------------------------------------------------------------------------------------------
// alerts: the expiry digest
// ---------------------------------------------------------------------------------------------

const LOCALES_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'public',
  'locales'
)

/** The sidecar's i18next init, as `meta/genI18nGolden.ts` and `sidecar/bootstrap.ts` do it (locale en). */
async function initSidecarI18next(): Promise<void> {
  // The default instance, because that is the one `expirationAlerts.ts` calls.
  // eslint-disable-next-line import-x/no-named-as-default-member
  await i18next.use(Backend).init({
    initImmediate: false,
    backend: {
      allowMultiLoading: false,
      loadPath: (lng: string, namespace: string) =>
        join(LOCALES_DIR, ...localeFileSegments(lng, namespace))
    },
    debug: false,
    returnEmptyString: false,
    returnNull: false,
    fallbackLng: 'en',
    ...i18nextLanguageOptions('en'),
    ns: ['translation', 'gamelib'],
    defaultNS: 'translation'
  })
}

const humbleKey = (
  n: number,
  title: string,
  expiration: string | null
): HumbleKey => ({
  gamekey: `fake-gamekey-${String(n).padStart(4, '0')}`,
  machineName: `fake_game_${n}_steam`,
  state: 'UNREVEALED',
  title,
  platform: 'steam',
  expiration,
  origin: 'Fake Bundle',
  ownedElsewhere: false,
  matchConfidence: 'none'
})

interface AlertRun {
  keys: HumbleKey[]
  suppress?: boolean
  /** The settings gate for this run (default on). */
  notify?: boolean
}

interface AlertCase {
  id: string
  about: string
  steamDeckGameMode?: boolean
  prepare?: (stores: Stores) => void
  runs: AlertRun[]
}

const alertCases: AlertCase[] = []

const EXPIRES_A = '2027-01-02T00:00:00.000Z'
const EXPIRES_B = '2027-12-31T00:00:00.000Z'
const EXPIRES_C = '2028-03-05T00:00:00.000Z'

alertCases.push({
  id: 'one-key-gains-an-expiration-single-copy',
  about:
    'count 1: the single title and body with the en-US M/D/YYYY date; the notified record is written',
  runs: [{ keys: [humbleKey(1, 'Fake Game One', EXPIRES_A)] }]
})
alertCases.push({
  id: 'two-keys-gain-expirations-plural-copy',
  about: 'count 2: the plural title and body',
  runs: [
    {
      keys: [
        humbleKey(1, 'Fake Game One', EXPIRES_A),
        humbleKey(2, 'Fake Game Two', EXPIRES_B)
      ]
    }
  ]
})
alertCases.push({
  id: 'five-keys-gain-expirations-plural-copy',
  about: 'count 5: the plural body names the count',
  runs: [
    {
      keys: [1, 2, 3, 4, 5].map((n) =>
        humbleKey(n, `Fake Game ${n}`, EXPIRES_B)
      )
    }
  ]
})
alertCases.push({
  id: 'a-hostile-title-is-escaped-by-the-digest-copy',
  about:
    'The single body interpolates the title through the default escaping of i18next',
  runs: [{ keys: [humbleKey(1, `Tom & Jerry's <b>"Cheese"</b>`, EXPIRES_A)] }]
})
alertCases.push({
  id: 'the-same-expiration-never-re-fires-a-moved-one-does',
  about:
    'D-92 dedupe: the same date on the next sync is silent; a moved date fires again with the new date',
  runs: [
    { keys: [humbleKey(1, 'Fake Game One', EXPIRES_A)] },
    { keys: [humbleKey(1, 'Fake Game One', EXPIRES_A)] },
    { keys: [humbleKey(1, 'Fake Game One', EXPIRES_C)] }
  ]
})
alertCases.push({
  id: 'first-sync-seeds-the-baseline-without-a-notification',
  about:
    'suppressNotifications on the first sync records every expiration and shows nothing; the next sync with the same dates is silent too',
  runs: [
    {
      keys: [
        humbleKey(1, 'Fake Game One', EXPIRES_A),
        humbleKey(2, 'Fake Game Two', EXPIRES_B)
      ],
      suppress: true
    },
    {
      keys: [
        humbleKey(1, 'Fake Game One', EXPIRES_A),
        humbleKey(2, 'Fake Game Two', EXPIRES_B)
      ]
    }
  ]
})
alertCases.push({
  id: 'the-settings-gate-off-advances-the-state-silently',
  about:
    'notifyHumbleExpirations off: nothing is shown but the dedupe store still advances, so turning it on does not re-fire the same date',
  runs: [
    { keys: [humbleKey(1, 'Fake Game One', EXPIRES_A)], notify: false },
    { keys: [humbleKey(1, 'Fake Game One', EXPIRES_A)] }
  ]
})
alertCases.push({
  id: 'steam-deck-game-mode-suppresses-the-toast-and-advances-the-state',
  about:
    'The Pitfall 4 guard: no OS notification in Steam Deck Game Mode, the record is still written',
  steamDeckGameMode: true,
  runs: [{ keys: [humbleKey(1, 'Fake Game One', EXPIRES_A)] }]
})
alertCases.push({
  id: 'legacy-machine-name-entry-is-backfilled-to-the-composite-key',
  about:
    'WR-01: a pre-migration entry keyed by machineName alone is copied to gamekey:machineName; the same date then never fires',
  prepare: (stores) => {
    stores.humbleNotifiedExpirationStore.set('fake_game_1_steam', {
      expiration: EXPIRES_A
    })
  },
  runs: [{ keys: [humbleKey(1, 'Fake Game One', EXPIRES_A)] }]
})
alertCases.push({
  id: 'keys-without-an-expiration-are-ignored',
  about:
    'A null expiration is never a transition: nothing shown, nothing written',
  runs: [{ keys: [humbleKey(1, 'Fake Game One', null)] }]
})
alertCases.push({
  id: 'only-the-new-key-counts-in-a-mixed-sync',
  about:
    'One already-notified key and one new: count 1, so the single copy names only the new key',
  prepare: (stores) => {
    stores.humbleNotifiedExpirationStore.set(
      'fake-gamekey-0001:fake_game_1_steam',
      { expiration: EXPIRES_A }
    )
  },
  runs: [
    {
      keys: [
        humbleKey(1, 'Fake Game One', EXPIRES_A),
        humbleKey(2, 'Fake Game Two', EXPIRES_B)
      ]
    }
  ]
})

/** The native `Date` prototype, taken before any fake clock replaces the global `Date`. */
const NATIVE_DATE_PROTOTYPE = Date.prototype

async function runAlertCase(c: AlertCase): Promise<unknown> {
  return withUtc(() =>
    withHumbleOracleProfile((profile) => {
      jest.useFakeTimers({ now: PINNED_NOW_MS, ...FAKE_TIMERS })
      // The digest date is `new Date(expiration).toLocaleDateString()`: the host's default
      // locale, which differs per machine (this checkout's is en-NZ, CI's is en-US). The golden
      // pins the en-US `M/D/YYYY` the plan names by supplying that locale where the call names
      // none; nothing else about the call changes.
      const toLocaleDateString: Date['toLocaleDateString'] = Reflect.get(
        NATIVE_DATE_PROTOTYPE,
        'toLocaleDateString'
      )
      const dateSpy = jest
        .spyOn(NATIVE_DATE_PROTOTYPE, 'toLocaleDateString')
        .mockImplementation(function (
          this: Date,
          locales?: Intl.LocalesArgument,
          options?: Intl.DateTimeFormatOptions
        ) {
          return toLocaleDateString.call(this, locales ?? 'en-US', options)
        })
      const tSpy = jest.spyOn(i18next, 't')
      const deckRestore = c.steamDeckGameMode
        ? jest.replaceProperty(environment, 'isSteamDeckGameMode', true)
        : undefined
      try {
        const registry = createStoreRegistry()
        const root = createTestStoreRoot(profile.userData)
        const stores = createHumbleStores({ registry, root })
        c.prepare?.(stores)
        const stateBefore = readableSnapshot(profile.userData)
        const config = createTestGlobalConfig({ notifyHumbleExpirations: true })
        const shown: { title: string; body: string }[] = []
        const notifications = {
          show: (n: { title: string; body: string }) => {
            shown.push({ title: n.title, body: n.body })
          }
        }
        const runs: unknown[] = []
        for (const run of c.runs) {
          config.set({
            notifyHumbleExpirations: run.notify !== false
          } as AppSettings)
          shown.length = 0
          tSpy.mockClear()
          detectAndNotifyExpirationTransitions(
            {
              config,
              notifications: notifications as never,
              stores: { humble: stores }
            },
            run.keys,
            { suppressNotifications: run.suppress === true }
          )
          runs.push({
            keys: run.keys.map((k) => ({
              gamekey: k.gamekey,
              machineName: k.machineName,
              title: k.title,
              expiration: k.expiration
            })),
            suppressNotifications: run.suppress === true,
            notifyHumbleExpirations: run.notify !== false,
            i18nCalls: tSpy.mock.calls.map(
              (args) => JSON.parse(JSON.stringify(args)) as unknown
            ),
            notifications: [...shown]
          })
        }
        return {
          input: {
            about: c.about,
            locale: 'en',
            dateLocale: 'en-US (pinned, the host default is not recorded)',
            steamDeckGameMode: c.steamDeckGameMode === true
          },
          runs,
          stateBefore,
          stateAfter: readableSnapshot(profile.userData)
        }
      } finally {
        deckRestore?.restore()
        tSpy.mockRestore()
        dateSpy.mockRestore()
        jest.useRealTimers()
      }
    })
  )
}

// ---------------------------------------------------------------------------------------------
// app_id_resolver
// ---------------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const termTarget = (term: string): string =>
  `/api/storesearch/?term=${axiosEncode(term)}&l=english&cc=US`

interface ResolverRun {
  titles: string[]
  /** Reports stale once this many requests have been made (a disconnect or a newer sync). */
  staleAfterRequests?: number
}

interface ResolverCase {
  id: string
  about: string
  synthetic: SyntheticResponse[]
  seed?: Record<string, HumbleSteamAppIdCacheEntry>
  runs: ResolverRun[]
}

const resolverCases: ResolverCase[] = []
const app = (id: number, name: string): SteamStoreSearchItem => ({
  type: 'app',
  name,
  id
})

resolverCases.push({
  id: 'a-unique-app-hit-is-cached-with-the-term-version',
  about:
    'The Steam delivery suffix is stripped from the search term; one unique type app item whose normalised name equals the title is an id; the miss TTL is not involved',
  synthetic: [storeSearch('Portal 2', [app(620, 'Portal 2')])],
  runs: [{ titles: ['Portal 2 (Steam)'] }]
})
resolverCases.push({
  id: 'no-items-is-a-cached-miss',
  about:
    'An empty item list is a miss, recorded with checkedAt and the term version',
  synthetic: [storeSearch('Fake Missing Game', [])],
  runs: [{ titles: ['Fake Missing Game'] }]
})
resolverCases.push({
  id: 'ambiguous-and-non-app-results-are-misses',
  about:
    'Two apps with the same normalised name, a DLC item and a near-miss name are all misses, never a guess',
  synthetic: [
    storeSearch('Twin Game', [app(1, 'Twin Game'), app(2, 'Twin Game')]),
    storeSearch('Dlc Only Game', [
      { type: 'dlc', name: 'Dlc Only Game', id: 3 }
    ]),
    storeSearch('Deluxe Near Miss', [app(4, 'Deluxe Near Miss Deluxe Edition')])
  ],
  runs: [{ titles: ['Twin Game', 'Dlc Only Game', 'Deluxe Near Miss'] }]
})
resolverCases.push({
  id: 'requests-go-out-in-order-with-a-350-ms-gap-between-them',
  about:
    'Three titles: the request order is the title order and a 350 ms sleep sits between requests (none before the first), the clock moving by it',
  synthetic: [
    storeSearch('Fake Game Alpha', [app(11, 'Fake Game Alpha')]),
    storeSearch('Fake Game Beta', []),
    storeSearch('Fake Game Gamma', [app(13, 'Fake Game Gamma')])
  ],
  runs: [{ titles: ['Fake Game Alpha', 'Fake Game Beta', 'Fake Game Gamma'] }]
})
resolverCases.push({
  id: 'a-pass-is-capped-at-40-requests',
  about: `45 uncached titles: ${HUMBLE_APPID_RESOLVE_CAP} are requested, the other 5 stay deferred and are not cached`,
  synthetic: Array.from({ length: 45 }, (_, i) =>
    storeSearch(`Fake Capped Game ${String(i + 1).padStart(2, '0')}`, [])
  ),
  runs: [
    {
      titles: Array.from(
        { length: 45 },
        (_, i) => `Fake Capped Game ${String(i + 1).padStart(2, '0')}`
      )
    }
  ]
})
resolverCases.push({
  id: 'the-first-error-stops-the-pass-and-is-never-cached',
  about:
    'A 500 on the second title is an error: the pass stops, the failed title and the rest stay deferred, only the first answer is cached',
  synthetic: [
    storeSearch('Fake Game Alpha', [app(11, 'Fake Game Alpha')]),
    getAnswer(termTarget('Fake Game Beta'), 500, '', 'text/plain'),
    storeSearch('Fake Game Gamma', [])
  ],
  runs: [{ titles: ['Fake Game Alpha', 'Fake Game Beta', 'Fake Game Gamma'] }]
})
resolverCases.push({
  id: 'a-200-without-an-items-array-is-an-error-not-a-miss',
  about:
    'An HTML captive-portal page and a JSON object with no items are both errors (kept out of the 7-day miss cache)',
  synthetic: [
    getAnswer(
      termTarget('Fake Portal Page'),
      200,
      '<html>sign in</html>',
      'text/html'
    ),
    getAnswer(termTarget('Fake No Items'), 200, '{}', 'application/json')
  ],
  runs: [{ titles: ['Fake Portal Page'] }, { titles: ['Fake No Items'] }]
})
resolverCases.push({
  id: 'cached-hits-and-fresh-misses-skip-the-request-stale-ones-retry',
  about:
    'A cached id and a miss under 7 days old at the current term version make no request; a miss over 7 days old and a pre-term-version miss are asked again',
  seed: {
    'fake cached game': {
      appId: '111',
      checkedAt: PINNED_NOW_MS - 30 * DAY_MS,
      termVersion: 2
    },
    'fake fresh miss': {
      appId: null,
      checkedAt: PINNED_NOW_MS - 6 * DAY_MS,
      termVersion: 2
    },
    'fake expired miss': {
      appId: null,
      checkedAt: PINNED_NOW_MS - 8 * DAY_MS,
      termVersion: 2
    },
    'fake legacy miss': { appId: null, checkedAt: PINNED_NOW_MS - 1 * DAY_MS }
  },
  synthetic: [
    storeSearch('Fake Expired Miss', [app(21, 'Fake Expired Miss')]),
    storeSearch('Fake Legacy Miss', [])
  ],
  runs: [
    {
      titles: [
        'Fake Cached Game',
        'Fake Fresh Miss',
        'Fake Expired Miss',
        'Fake Legacy Miss'
      ]
    }
  ]
})
resolverCases.push({
  id: 'a-stale-fence-stops-the-pass-after-the-first-request',
  about:
    'isStale turns true after one request (a disconnect or a newer sync): no further request',
  synthetic: [
    storeSearch('Fake Game Alpha', [app(11, 'Fake Game Alpha')]),
    storeSearch('Fake Game Beta', [])
  ],
  runs: [
    { titles: ['Fake Game Alpha', 'Fake Game Beta'], staleAfterRequests: 1 }
  ]
})
resolverCases.push({
  id: 'the-term-keeps-punctuation-and-drops-trademark-symbols',
  about:
    'The search term is the title minus trademark symbols and the Steam suffix, punctuation and case kept; the match normalises fully',
  synthetic: [
    storeSearch('Tom & Jerry: Chase', [app(31, 'Tom & Jerry: Chase')]),
    storeSearch('Café Racer', [app(32, 'Cafe Racer')])
  ],
  runs: [
    { titles: ['Tom & Jerry™: Chase (Steam Key)', 'Café Racer - Steam Key'] }
  ]
})
resolverCases.push({
  id: 'duplicate-titles-are-one-request',
  about: 'Titles that normalise to the same key are asked once',
  synthetic: [storeSearch('Fake Game Alpha', [app(11, 'Fake Game Alpha')])],
  runs: [
    {
      titles: [
        'Fake Game Alpha',
        'fake game alpha (Steam)',
        'FAKE GAME ALPHA [Steam]'
      ]
    }
  ]
})

async function runResolverCase(c: ResolverCase): Promise<unknown> {
  return withUtc(() =>
    withHumbleOracleProfile(async (profile) => {
      jest.useFakeTimers({ now: PINNED_NOW_MS, ...FAKE_TIMERS })
      let seq = 0
      const stamp = (): { seq: number; atMs: number } => ({
        seq: seq++,
        atMs: Date.now() - PINNED_NOW_MS
      })
      const { logs, restore } = captureLogs(stamp)
      const trace: unknown[] = []
      let interceptorId: number | undefined
      try {
        const registry = createStoreRegistry()
        const root = createTestStoreRoot(profile.userData)
        const stores = createHumbleStores({ registry, root })
        for (const [key, entry] of Object.entries(c.seed ?? {})) {
          stores.humbleSteamAppIdStore.set(key, entry)
        }
        const stateBefore = readableSnapshot(profile.userData)
        const resolver = createSteamAppIdResolver({
          cache: stores.humbleSteamAppIdStore,
          sleep: (ms) => {
            trace.push({ ...stamp(), kind: 'sleep', ms })
            jest.advanceTimersByTime(ms)
            return Promise.resolve()
          }
        })
        let requests: unknown
        const summaries: unknown[] = []
        await withWireRecorder(
          {
            slice: 'app_id_resolver',
            caseId: c.id,
            synthetic: c.synthetic
          },
          async (recorder) => {
            let requested = 0
            // Sees the request as the resolver configured it, before the origin is rewritten: the
            // axios config the wire does not show (the 8 s timeout, the params).
            interceptorId = axios.interceptors.request.use((config) => {
              requested++
              trace.push({
                ...stamp(),
                kind: 'request',
                params: config.params as unknown,
                timeoutMs: config.timeout,
                userAgent: String(config.headers.get('User-Agent'))
              })
              return config
            })
            for (const run of c.runs) {
              const before = requested
              const summary = await resolver.resolvePending(run.titles, {
                isStale: () =>
                  run.staleAfterRequests !== undefined &&
                  requested - before >= run.staleAfterRequests
              })
              summaries.push({
                titles: run.titles,
                summary,
                lookups: run.titles.map((title) => ({
                  title,
                  cached: resolver.lookupCached(title) ?? null
                }))
              })
            }
            requests = [...recorder.requests]
          }
        )
        return {
          input: { about: c.about, seed: c.seed ?? {} },
          trace,
          runs: summaries,
          requests,
          logs,
          stateBefore,
          stateAfter: readableSnapshot(profile.userData)
        }
      } finally {
        if (interceptorId !== undefined) {
          axios.interceptors.request.eject(interceptorId)
        }
        restore()
        jest.useRealTimers()
      }
    })
  )
}

// ---------------------------------------------------------------------------------------------
// user_agent
// ---------------------------------------------------------------------------------------------

interface UserAgentCase {
  id: string
  about: string
  userAgentFallback: string
}

const uaCases: UserAgentCase[] = [
  ...(['darwin', 'win32', 'linux'] as const).map((platform) => ({
    id: `app-info-fallback-${platform}`,
    about: `The fallback resolveAppInfo builds for ${platform}`,
    userAgentFallback: resolveAppInfo({
      platform,
      osRelease: '',
      isPackaged: false
    }).userAgentFallback
  })),
  {
    id: 'electron-default-fallback-strips-the-app-and-electron-tokens',
    about:
      'The typical Electron default: GameLib/ and Electron/ tokens are dropped, the Chrome version kept',
    userAgentFallback:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) GameLib/1.0.0 Chrome/142.0.7444.52 Electron/41.1.1 Safari/537.36'
  },
  {
    id: 'a-different-chrome-version-is-carried-through',
    about: 'The Chrome token follows the fallback, never a hardcoded version',
    userAgentFallback:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.1.2 Safari/537.36'
  },
  {
    id: 'no-chrome-token-only-strips-electron',
    about:
      'Defensive branch: no Chrome/ token, so only the Electron/ token is removed',
    userAgentFallback:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Electron/41.1.1 Safari/537.36'
  },
  {
    id: 'no-platform-parenthesis-only-strips-electron',
    about:
      'Defensive branch: not Mozilla/5.0 (...)-shaped, so only the Electron/ token is removed',
    userAgentFallback: 'GameLibWebview/1.0 Chrome/142.0.7444.52 Electron/41.1.1'
  },
  {
    id: 'empty-fallback-is-empty',
    about: 'An empty fallback yields an empty string and does not throw',
    userAgentFallback: ''
  }
]

// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------

const secretIds = [...secretCases.map((c) => c.id)]
const alertIds = alertCases.map((c) => c.id)
const resolverIds = resolverCases.map((c) => c.id)
const uaIds = uaCases.map((c) => c.id)

describe('Humble secrets oracle: the keyring-backed secret owner and its migration', () => {
  it.each(secretCases.map((c) => [c.id, c] as const))(
    '%s',
    async (_id, c) => {
      writeOrCompareGolden('secrets', c.id, await runSecretCase(c))
    },
    CASE_TIMEOUT_MS
  )

  it('has the vacuous-pass guards', () => {
    syncManifest('secrets', secretIds, SECRETS_FLOOR)
    assertManifest('secrets', secretIds, SECRETS_FLOOR)
    expectEmptyCasesToFail('secrets', SECRETS_FLOOR)
  })
})

describe('Humble alerts oracle: the expiry digest', () => {
  beforeAll(initSidecarI18next)

  it.each(alertCases.map((c) => [c.id, c] as const))(
    '%s',
    async (_id, c) => {
      writeOrCompareGolden('alerts', c.id, await runAlertCase(c))
    },
    CASE_TIMEOUT_MS
  )

  it('has the vacuous-pass guards', () => {
    syncManifest('alerts', alertIds, ALERTS_FLOOR)
    assertManifest('alerts', alertIds, ALERTS_FLOOR)
    expectEmptyCasesToFail('alerts', ALERTS_FLOOR)
  })
})

describe('Humble app-id resolver oracle: the Steam storesearch pass', () => {
  it.each(resolverCases.map((c) => [c.id, c] as const))(
    '%s',
    async (_id, c) => {
      writeOrCompareGolden('app_id_resolver', c.id, await runResolverCase(c))
    },
    CASE_TIMEOUT_MS
  )

  it('has the vacuous-pass guards', () => {
    syncManifest('app_id_resolver', resolverIds, RESOLVER_FLOOR)
    assertManifest('app_id_resolver', resolverIds, RESOLVER_FLOOR)
    expectEmptyCasesToFail('app_id_resolver', RESOLVER_FLOOR)
  })
})

describe('standardBrowserUserAgent oracle: the vectors login/__tests__/userAgent.test.ts replays', () => {
  it.each(uaCases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    writeOrCompareGolden('user_agent', c.id, {
      about: c.about,
      input: { userAgentFallback: c.userAgentFallback },
      output: standardBrowserUserAgent({
        appInfo: { userAgentFallback: c.userAgentFallback }
      })
    })
  })

  it('has the vacuous-pass guards', () => {
    syncManifest('user_agent', uaIds, USER_AGENT_FLOOR)
    assertManifest('user_agent', uaIds, USER_AGENT_FLOOR)
    expectEmptyCasesToFail('user_agent', USER_AGENT_FLOOR)
  })
})
