/**
 * The Humble user-flow oracle (94-09 Task 1, D-05, D-06, D-24): the login watch, reconnect,
 * stopLogin, disconnect, the three-state session probe, the health check and the Humble arm of
 * `applySignInVerdict`, recorded from the TypeScript on a fake clock (`userHarness.ts`).
 *
 * Each case drives the real `HumbleUser` over a scripted login-window seam fake, the wire recorder
 * (`getSessionStatus` as it appears on the socket), the real secret store over a fake keyring (no
 * real Keychain, T-94-16), the real sign-in outcome owner and the real humble stores, on a fresh
 * `createFakeHomeProfile()`. Time moves only when the script ticks: `COOKIE_POLL_INTERVAL_MS` at a
 * time. The golden is `{input, steps, seamCalls, requests, secretOps, outcomeNotes, outcomePushes,
 * pushes, fenceCalls, logs, result, stateBefore, stateAfter, keyringAfter}`; the Rust login watch
 * (94-17, 94-18) replays the same seam script, requests and clock and must produce the same lists.
 *
 * Plan wording that could not hold as written, and what is recorded instead:
 *  - "a dead-API case (every read returns zero cookies) that ends at the deadline": a jar that
 *    returns zero from the first read is `UNDECIDABLE` and aborts the watch with `error` on the
 *    first tick (`classifyCookieRead`), it never reaches the deadline. That case is recorded as
 *    it behaves; the deadline cases are a live jar that never holds a session cookie (400 ticks)
 *    and a window that never opens (no poll at all).
 *  - "a recording fake secret store": the secret store is the real `SidecarHumbleSecretStore` over a
 *    fake keyring, because the invalidate-before-delete order the disconnect golden must show is
 *    the real slot store's. The keyring is a closure map; nothing reaches the OS.
 *
 * `GAMELIB_WRITE_HUMBLE_GOLDEN=1` writes the goldens and the wire recordings; the default compares
 * and replays offline.
 */
import { applySignInVerdict } from 'backend/signInProbe/verdict'
import { createTestSignInProbe } from 'backend/testUtils/testSignInProbe'
import {
  assertManifest,
  expectEmptyCasesToFail,
  PINNED_NOW_MS,
  syncManifest,
  withHumbleOracleProfile,
  writeOrCompareGolden
} from 'backend/testUtils/humbleOracle/harness'
import type { SignInProbeOutcome } from 'common/signInState'
import * as logger from 'backend/logger'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createTestStoreRoot } from 'backend/testUtils/testStoreRoot'
import { createHumbleStores } from '../../stores'
import { HUMBLE_COOKIE_CLEAR_HANDLE_ORIGIN } from '../../constants'
import { LOGIN_WATCH_TIMEOUT_MS, COOKIE_POLL_INTERVAL_MS } from '../../user'
import { readableSnapshot, withUtc } from './flowHarness'
import {
  CSRF_COOKIE,
  LEGACY_COOKIE,
  ORY_COOKIE,
  ORY_COOKIE_VALUE,
  OTHER_COOKIE,
  anonymous,
  authenticated,
  runUserCase,
  sessionStatusAnswer,
  type UserCaseOptions,
  type UserEnv
} from './userHarness'

const SLICE = 'user'
const USER_FLOOR = 15
const CASE_TIMEOUT_MS = 60_000

type Stores = ReturnType<typeof createHumbleStores>

// ---------------------------------------------------------------------------------------------
// State the cases start from (written through the real stores, so the bytes are the TS writer's)
// ---------------------------------------------------------------------------------------------

const HUMBLE_SESSION_SLOT = 'humble-session'
const HUMBLE_CSRF_SLOT = 'humble-csrf'

const SIGNED_IN_KEYRING = {
  initial: {
    [HUMBLE_SESSION_SLOT]: ORY_COOKIE_VALUE,
    [HUMBLE_CSRF_SLOT]: 'REDACTED'
  }
}
const SESSION_ONLY_KEYRING = {
  initial: { [HUMBLE_SESSION_SLOT]: ORY_COOKIE_VALUE }
}

const COMPOSITE = 'fake-gamekey-0001:fake_game_one_steam'

/** A signed-in account with all eleven state files populated. */
function signedIn({ stores }: { stores: Stores }): void {
  stores.configStore.set('isLoggedIn', true)
  stores.configStore.set('encryptionDegraded', false)
  stores.configStore.set('userData', { username: 'REDACTED' })
  stores.humbleLibraryStore.set('fake-gamekey-0001', {
    gamekey: 'fake-gamekey-0001',
    keys: []
  } as never)
  stores.humbleSyncStore.set('state', { syncedAt: PINNED_NOW_MS } as never)
  stores.humbleRevealedStore.set('fake_game_one_steam', {
    revealedAt: PINNED_NOW_MS
  })
  stores.humbleOwnershipOverrideStore.set('fake_game_one_steam', {
    overriddenAt: PINNED_NOW_MS
  })
  stores.humbleGiftedAtStore.set('fake_game_one_steam', {
    giftedAt: PINNED_NOW_MS
  })
  stores.humbleAuditStore.set(COMPOSITE, [
    {
      event: 'reveal',
      at: PINNED_NOW_MS,
      outcome: 'ok',
      title: 'Fake Game One',
      platform: 'steam'
    }
  ])
  stores.humbleLocalRedeemedStore.set(COMPOSITE, {
    redeemedAt: PINNED_NOW_MS,
    source: 'user'
  })
  stores.humbleNotifiedExpirationStore.set(COMPOSITE, {
    expiration: '2027-01-01T00:00:00.000Z'
  })
  stores.humbleSettleDeclinedStore.set(COMPOSITE, { declinedAt: PINNED_NOW_MS })
  stores.humbleSteamAppIdStore.set('fake game one', {
    appId: '1',
    checkedAt: PINNED_NOW_MS,
    termVersion: 2
  })
}

/** Signed in, and the session is known expired. */
function signedInExpired(env: { stores: Stores }): void {
  signedIn(env)
  env.stores.configStore.set('expired', true)
}

/** Signed in with a stored session and no stored CSRF token (the health-check backfill case). */
const SIGNED_IN_NO_USER_DATA = ({ stores }: { stores: Stores }): void => {
  stores.configStore.set('isLoggedIn', true)
}

// ---------------------------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------------------------

interface UserCase extends Omit<UserCaseOptions, 'slice' | 'caseId'> {
  id: string
}
const cases: UserCase[] = []
const add = (c: UserCase): void => {
  cases.push(c)
}

/** Starts a watch (`startLogin` or `reconnect`) and lets the seam's `open` resolve. */
async function begin(
  env: UserEnv,
  method: 'startLogin' | 'reconnect' = 'startLogin'
): Promise<{ login: ReturnType<UserEnv['user']['startLogin']> }> {
  const login = env.watch(method, env.user[method]())
  await env.settle()
  // Wrapped: returning the promise itself would make `await begin()` wait for the whole watch.
  return { login }
}

// -- the login watch ---------------------------------------------------------------------------

add({
  id: 'login-ory-session-authenticated',
  about:
    'A fresh sign-in: the jar is live without a session cookie, then an ory_session_* cookie and the CSRF cookie appear; session-status validates, the secrets are stored, the watch is done',
  synthetic: [authenticated()],
  script: async (env) => {
    env.setJar([OTHER_COOKIE])
    const { login } = await begin(env)
    await env.tick()
    env.mark('the session and CSRF cookies appear')
    env.setJar([OTHER_COOKIE, ORY_COOKIE, CSRF_COOKIE])
    await env.tick()
    return login
  }
})

add({
  id: 'login-legacy-simpleauth-cookie-authenticated',
  about:
    'The legacy _simpleauth_sess cookie is the fallback candidate: the secret is the bare value and the request sends it as the _simpleauth_sess cookie',
  synthetic: [authenticated()],
  script: async (env) => {
    env.setJar([LEGACY_COOKIE, CSRF_COOKIE])
    const { login } = await begin(env)
    await env.tick()
    return login
  }
})

add({
  id: 'login-ory-cookie-wins-over-legacy',
  about: 'Both cookies in the jar: the ory_session_* one is the candidate',
  synthetic: [authenticated()],
  script: async (env) => {
    env.setJar([LEGACY_COOKIE, ORY_COOKIE])
    const { login } = await begin(env)
    await env.tick()
    return login
  }
})

add({
  id: 'login-no-csrf-cookie-is-not-fatal',
  about:
    'A validated session without a csrf_cookie: nothing is stored for it and the watch still completes',
  synthetic: [authenticated()],
  script: async (env) => {
    env.setJar([ORY_COOKIE])
    const { login } = await begin(env)
    await env.tick()
    return login
  }
})

add({
  id: 'login-csrf-read-failure-is-not-fatal',
  about:
    'The csrf_cookie read rejects after the session was accepted: one warning, the sign-in is kept',
  synthetic: [authenticated()],
  seam: {
    cookies: (n) => {
      if (n === 0) {
        return { total: 33, matched: [ORY_COOKIE] }
      }
      throw new Error('cookie jar closed')
    }
  },
  script: async (env) => {
    const { login } = await begin(env)
    await env.tick()
    return login
  }
})

add({
  id: 'login-encryption-unavailable-flags-degraded',
  about:
    'The keyring reports unavailable at store time: the secret is still stored and encryptionDegraded is written true',
  synthetic: [authenticated()],
  keyring: {
    behave: { keyring_available: () => ({ answer: false }) }
  },
  script: async (env) => {
    env.setJar([ORY_COOKIE, CSRF_COOKIE])
    const { login } = await begin(env)
    await env.tick()
    return login
  }
})

add({
  id: 'login-clears-a-stale-degraded-flag-and-expiry',
  about:
    'A reconnect on a healthy keyring clears a stale expired and encryptionDegraded: the explicit false is written',
  synthetic: [authenticated()],
  prepare: (env) => {
    signedInExpired(env)
    env.stores.configStore.set('encryptionDegraded', true)
  },
  script: async (env) => {
    env.setJar([ORY_COOKIE])
    const { login } = await begin(env, 'reconnect')
    await env.tick()
    return login
  }
})

add({
  id: 'login-reconnect-keeps-the-user-state',
  about:
    'reconnect() is the same watch; the seven user-state files and the library survive it',
  synthetic: [authenticated()],
  prepare: signedInExpired,
  keyring: SIGNED_IN_KEYRING,
  script: async (env) => {
    env.setJar([ORY_COOKIE, CSRF_COOKIE])
    const { login } = await begin(env, 'reconnect')
    await env.tick()
    return login
  }
})

add({
  id: 'login-anonymous-candidate-is-throttled-then-accepted',
  about:
    'An anonymous candidate is rejected and not re-validated by the poll inside VALIDATION_THROTTLE_MS (3000), re-validated once the window has passed, accepted when the session becomes authenticated',
  synthetic: [anonymous(), anonymous(), authenticated()],
  script: async (env) => {
    env.setJar([ORY_COOKIE, CSRF_COOKIE])
    const { login } = await begin(env)
    await env.tick(5)
    return login
  }
})

add({
  id: 'login-rejection-log-collapses-and-heartbeats',
  about:
    'Identical rejections log once, then a liveness line every 30 s with the suppressed count; the status change to unknown logs at once',
  synthetic: [
    ...Array.from({ length: 11 }, () => anonymous()),
    sessionStatusAnswer(200, { status: 'second-factor-pending' }),
    authenticated()
  ],
  script: async (env) => {
    env.setJar([ORY_COOKIE, CSRF_COOKIE])
    const { login } = await begin(env)
    await env.tick(25)
    return login
  }
})

add({
  id: 'login-forced-revalidation-bypasses-the-throttle',
  about:
    'notifyLoginNavigated() re-validates the same rejected value inside the throttle window and re-arms the deadline',
  synthetic: [anonymous(), authenticated()],
  script: async (env) => {
    env.setJar([ORY_COOKIE, CSRF_COOKIE])
    const { login } = await begin(env)
    await env.tick()
    env.mark('notifyLoginNavigated() relayed')
    env.user.notifyLoginNavigated()
    await env.settle()
    return login
  }
})

add({
  id: 'login-nav-finished-event-forces-validation',
  about:
    'A main-frame finished event from the window forces this tick through the throttle',
  synthetic: [anonymous(), authenticated()],
  script: async (env) => {
    env.setJar([ORY_COOKIE, CSRF_COOKIE])
    const { login } = await begin(env)
    await env.tick()
    env.queueEvents({
      event: 'started',
      url: 'https://auth.humblebundle.com/login'
    })
    env.queueEvents({
      event: 'finished',
      url: 'https://www.humblebundle.com/home/library'
    })
    await env.tick()
    return login
  }
})

add({
  id: 'login-nav-finished-event-rearms-the-deadline',
  about:
    'A finished event at 9 minutes pushes the 10-minute deadline out; the watch is still waiting at 18 minutes and settles waiting at 19',
  script: async (env) => {
    env.setJar([OTHER_COOKIE])
    const { login } = await begin(env)
    await env.tick(360)
    env.mark('a finished navigation event arrives at nine minutes')
    env.queueEvents({
      event: 'finished',
      url: 'https://auth.humblebundle.com/login'
    })
    await env.tick(1)
    await env.tick(359)
    env.mark('eighteen minutes: not yet settled')
    await env.tick(1)
    await env.tick(60)
    return login
  }
})

add({
  id: 'login-live-jar-without-a-candidate-ends-at-the-deadline',
  about:
    'A live jar that never holds a session cookie polls every 1500 ms for LOGIN_WATCH_TIMEOUT_MS (400 ticks), logging the not-found line once per 30 s, then settles waiting and closes the window',
  script: async (env) => {
    env.setJar([OTHER_COOKIE])
    const { login } = await begin(env)
    await env.tick(LOGIN_WATCH_TIMEOUT_MS / COOKIE_POLL_INTERVAL_MS)
    return login
  }
})

add({
  id: 'login-window-never-opens-ends-at-the-deadline',
  about:
    'open() never resolves: every tick returns before a read, the deadline settles waiting without closing anything; the late open is closed on arrival',
  seam: {
    open: () =>
      new Promise<string>((resolve) => {
        setTimeout(
          () => resolve('login-humble-late'),
          LOGIN_WATCH_TIMEOUT_MS + 5000
        )
      })
  },
  script: async (env) => {
    const { login } = await begin(env)
    await env.tick(LOGIN_WATCH_TIMEOUT_MS / COOKIE_POLL_INTERVAL_MS)
    env.mark('the deadline has passed; open() resolves afterwards')
    await env.advance(6000)
    return login
  }
})

add({
  id: 'login-dead-cookie-api-aborts-on-the-first-tick',
  about:
    'Every read returns zero cookies and the jar was never proven live: UNDECIDABLE, the watch settles error at the first poll and never polls on it',
  seam: { cookies: () => ({ total: 0, matched: [] }) },
  script: async (env) => {
    const { login } = await begin(env)
    await env.tick(3)
    return login
  }
})

add({
  id: 'login-live-then-empty-jar-keeps-polling',
  about:
    'A jar that proved live and then reads zero is SUPPORTED_BUT_EMPTY, a genuine not-yet-signed-in, and keeps polling',
  seam: {
    cookies: (n) =>
      n === 0 ? { total: 33, matched: [] } : { total: 0, matched: [] }
  },
  script: async (env) => {
    const { login } = await begin(env)
    await env.tick(4)
    env.mark('stopLogin()')
    env.user.stopLogin()
    await env.settle()
    return login
  }
})

add({
  id: 'login-cookie-read-failure-aborts',
  about:
    'The first cookie read throws: UNSUPPORTED_OR_ERROR settles error and closes the window',
  seam: {
    cookies: () => {
      throw new Error('humble_login:no-window:login-humble-0')
    }
  },
  script: async (env) => {
    const { login } = await begin(env)
    await env.tick()
    return login
  }
})

add({
  id: 'login-window-open-failure',
  about:
    'open() rejects: one warning, the watch settles error without closing anything',
  seam: {
    open: () => {
      throw new Error('window build failed')
    }
  },
  script: async (env) => {
    const { login } = await begin(env)
    return login
  }
})

add({
  id: 'login-window-closed-by-the-user-cancels',
  about:
    'A closed event from the window settles cancelled (not error) and closes the label once',
  script: async (env) => {
    env.setJar([OTHER_COOKIE])
    const { login } = await begin(env)
    await env.tick()
    env.queueEvents({ event: 'closed', url: '' })
    await env.tick()
    return login
  }
})

add({
  id: 'login-nav-event-drain-failure-is-not-fatal',
  about: 'takeEvents rejects: a warning, and the same tick still reads the jar',
  synthetic: [authenticated()],
  seam: {
    takeEvents: () => {
      throw new Error('drain failed')
    }
  },
  script: async (env) => {
    env.setJar([ORY_COOKIE, CSRF_COOKIE])
    const { login } = await begin(env)
    await env.tick()
    return login
  }
})

add({
  id: 'login-validation-failure-is-transient-and-retried-at-once',
  about:
    'A thrown session-status request records no rejection: the very next tick retries the same value',
  synthetic: [authenticated()],
  onSessionStatus: (n) => (n === 0 ? { throw: 'socket hang up' } : undefined),
  script: async (env) => {
    env.setJar([ORY_COOKIE, CSRF_COOKIE])
    const { login } = await begin(env)
    await env.tick(2)
    return login
  }
})

add({
  id: 'login-stop-during-validation-writes-nothing',
  about:
    'stopLogin() lands while session-status is in flight: the late authenticated answer stores nothing',
  synthetic: [authenticated()],
  onSessionStatus: (_n, env) => {
    env.user.stopLogin()
    return undefined
  },
  script: async (env) => {
    env.setJar([ORY_COOKIE, CSRF_COOKIE])
    const { login } = await begin(env)
    await env.tick()
    return login
  }
})

add({
  id: 'login-stop-while-watching',
  about:
    'stopLogin() while waiting is a silent cancel: waiting, no store writes, the window closed',
  script: async (env) => {
    env.setJar([OTHER_COOKIE])
    const { login } = await begin(env)
    await env.tick(2)
    env.mark('stopLogin()')
    env.user.stopLogin()
    await env.settle()
    await env.tick(2)
    return login
  }
})

add({
  id: 'login-stop-before-open-resolves-closes-the-orphan',
  about:
    'stopLogin() before open() resolves: waiting at once, and the window that opens afterwards is closed immediately',
  seam: {
    open: () =>
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('login-humble-late'), 2000)
      })
  },
  script: async (env) => {
    const { login } = await begin(env)
    env.mark('stopLogin()')
    env.user.stopLogin()
    await env.advance(2500)
    return login
  }
})

add({
  id: 'login-stop-and-navigation-relay-without-a-watch-do-nothing',
  about:
    'stopLogin() and notifyLoginNavigated() with no watch make no seam call and no write',
  script: async (env) => {
    env.user.stopLogin()
    env.user.notifyLoginNavigated()
    await env.settle()
    return { loggedIn: env.user.isLoggedIn() }
  }
})

add({
  id: 'login-a-second-start-tears-down-the-first-watch',
  about:
    'startLogin() while a watch is active settles the first as waiting and closes its window; the second completes',
  synthetic: [authenticated()],
  script: async (env) => {
    env.setJar([OTHER_COOKIE])
    const first = env.watch('first startLogin', env.user.startLogin())
    await env.settle()
    await env.tick()
    const second = env.watch('second startLogin', env.user.startLogin())
    await env.settle()
    env.setJar([ORY_COOKIE, CSRF_COOKIE])
    await env.tick()
    return { first: await first, second: await second }
  }
})

// -- disconnect ---------------------------------------------------------------------------------

const JAR_BEFORE_DISCONNECT = [ORY_COOKIE, CSRF_COOKIE, OTHER_COOKIE] as const

add({
  id: 'disconnect-wipes-credentials-and-keeps-the-user-state',
  about:
    'Fence first, then config, the outcome note, the keyring (cache invalidated before each delete), library and sync; storage then cookies (cookies LAST, the window closed). The seven user-state files and the Steam app-id cache are byte-identical',
  prepare: signedIn,
  keyring: SIGNED_IN_KEYRING,
  script: async (env) => {
    env.setJar(JAR_BEFORE_DISCONNECT)
    await env.user.disconnect({ isMac: false })
    return { loggedIn: env.user.isLoggedIn() }
  }
})

add({
  id: 'disconnect-on-macos-opens-the-cookie-window-on-humble',
  about:
    'isMac keeps the live origin for the cookie-clear window; the other hosts use the never-loaded handle origin',
  prepare: signedIn,
  keyring: SIGNED_IN_KEYRING,
  script: async (env) => {
    env.setJar(JAR_BEFORE_DISCONNECT)
    await env.user.disconnect({ isMac: true })
  }
})

add({
  id: 'disconnect-handle-origin-off-macos',
  about: `Off macOS the cookie-clear window opens ${HUMBLE_COOKIE_CLEAR_HANDLE_ORIGIN}`,
  prepare: signedIn,
  keyring: SIGNED_IN_KEYRING,
  script: async (env) => {
    env.setJar(JAR_BEFORE_DISCONNECT)
    await env.user.disconnect({ isMac: false })
  }
})

add({
  id: 'disconnect-signed-out-twice-is-harmless',
  about:
    'A second disconnect on an already-cleared account fences, clears and wipes again without throwing',
  prepare: signedIn,
  keyring: SIGNED_IN_KEYRING,
  script: async (env) => {
    env.setJar(JAR_BEFORE_DISCONNECT)
    await env.user.disconnect({ isMac: false })
    env.mark('disconnect again')
    env.setJar([])
    await env.user.disconnect({ isMac: false })
  }
})

add({
  id: 'disconnect-keyring-delete-failure-never-throws',
  about:
    'Both keyring deletes fail: warnings from the slot store, the cache is still invalidated first, disconnect completes the wipes',
  prepare: signedIn,
  keyring: {
    ...SIGNED_IN_KEYRING,
    behave: { keyring_delete: () => ({ fail: 'keyring locked' }) }
  },
  script: async (env) => {
    env.setJar(JAR_BEFORE_DISCONNECT)
    await env.user.disconnect({ isMac: false })
    env.mark(
      'a read after the failed delete goes to the keyring, not a stale cache'
    )
    return { sessionAfter: (await env.user.getCredentials()) ?? null }
  }
})

add({
  id: 'disconnect-storage-clear-failure-continues-to-cookies',
  about:
    'clearStorage rejects: one warning, the cookie step still runs after it',
  prepare: signedIn,
  keyring: SIGNED_IN_KEYRING,
  seam: {
    clearStorage: () => {
      throw new Error('storage window failed')
    }
  },
  script: async (env) => {
    env.setJar(JAR_BEFORE_DISCONNECT)
    await env.user.disconnect({ isMac: false })
  }
})

add({
  id: 'disconnect-cookie-window-open-failure-continues',
  about:
    'The cookie-clear open() rejects: a warning, nothing to close, disconnect returns',
  prepare: signedIn,
  keyring: SIGNED_IN_KEYRING,
  seam: {
    open: () => {
      throw new Error('window build failed')
    }
  },
  script: async (env) => {
    env.setJar(JAR_BEFORE_DISCONNECT)
    await env.user.disconnect({ isMac: false })
  }
})

add({
  id: 'disconnect-clear-cookies-failure-still-closes-the-window',
  about:
    'clearCookies rejects: the window is closed in the finally and the wipe step logs one warning',
  prepare: signedIn,
  keyring: SIGNED_IN_KEYRING,
  seam: {
    clearCookies: () => {
      throw new Error('delete failed')
    }
  },
  script: async (env) => {
    env.setJar(JAR_BEFORE_DISCONNECT)
    await env.user.disconnect({ isMac: false })
  }
})

add({
  id: 'disconnect-window-close-failure-is-a-warning',
  about: 'close() rejects after the clear: a non-fatal warning',
  prepare: signedIn,
  keyring: SIGNED_IN_KEYRING,
  seam: {
    close: () => {
      throw new Error('already gone')
    }
  },
  script: async (env) => {
    env.setJar(JAR_BEFORE_DISCONNECT)
    await env.user.disconnect({ isMac: false })
  }
})

add({
  id: 'disconnect-census-flags-a-clear-that-was-not-domain-scoped',
  about:
    'The clear reports 3 deleted but the jar is unchanged: the census arithmetic names every failed equality in one warning',
  prepare: signedIn,
  keyring: SIGNED_IN_KEYRING,
  seam: { clearCookies: () => 3 },
  script: async (env) => {
    env.setJar(JAR_BEFORE_DISCONNECT)
    await env.user.disconnect({ isMac: false })
  }
})

add({
  id: 'disconnect-census-read-failure-is-incomplete-evidence',
  about:
    'The before-census read throws: a warning for the read and an incomplete-census warning; the clear still runs',
  prepare: signedIn,
  keyring: SIGNED_IN_KEYRING,
  seam: {
    cookiesForDomain: (n) => {
      if (n === 0) throw new Error('census read failed')
      return { total: 30, matched: [] }
    }
  },
  script: async (env) => {
    env.setJar(JAR_BEFORE_DISCONNECT)
    await env.user.disconnect({ isMac: false })
  }
})

add({
  id: 'disconnect-census-on-a-jar-never-proven-live',
  about:
    'Zero cookies before and after: the verdict is UNDECIDABLE on both sides and is logged as such',
  prepare: signedIn,
  keyring: SIGNED_IN_KEYRING,
  seam: {
    cookiesForDomain: () => ({ total: 0, matched: [] }),
    clearCookies: () => 0
  },
  script: async (env) => {
    await env.user.disconnect({ isMac: false })
  }
})

add({
  id: 'disconnect-without-an-account',
  about:
    'disconnect on a profile that never signed in: the wipes run over empty state without throwing',
  script: async (env) => {
    env.setJar([OTHER_COOKIE])
    await env.user.disconnect({ isMac: false })
  }
})

// -- probeSession ---------------------------------------------------------------------------------

const probeCase = (
  id: string,
  about: string,
  synthetic: UserCase['synthetic'],
  extra: Partial<UserCase> = {}
): void =>
  add({
    id,
    about,
    synthetic,
    keyring: SESSION_ONLY_KEYRING,
    prepare: SIGNED_IN_NO_USER_DATA,
    script: async (env) => ({
      outcome: await env.user.probeSession('boot-probe')
    }),
    ...extra
  })

probeCase('probe-authenticated-is-healthy', 'session-status authenticated', [
  authenticated()
])
probeCase(
  'probe-anonymous-is-expired',
  'session-status anonymous is the only expired',
  [anonymous()]
)
probeCase(
  'probe-unrecognised-status-is-unknown',
  'A status word that is neither authenticated nor anonymous',
  [sessionStatusAnswer(200, { status: 'second-factor-pending' })]
)
probeCase(
  'probe-http-403-is-unknown',
  'access_denied is a backoff signal, never a re-login trigger',
  [sessionStatusAnswer(403, { status: 'anonymous' })]
)
probeCase('probe-http-500-is-unknown', 'A server error is unknown', [
  sessionStatusAnswer(500, {})
])
probeCase(
  'probe-network-failure-is-unknown-with-a-warning',
  'A thrown request: unknown, one warning with the message only',
  [],
  {
    onSessionStatus: () => ({ throw: 'socket hang up' })
  }
)
probeCase(
  'probe-empty-slot-is-unknown-without-a-request',
  'An absent session slot behind a connected flag is not proof of expiry: no request',
  [],
  {
    keyring: {}
  }
)
probeCase(
  'probe-unreadable-keyring-is-unknown-without-a-request',
  'A keyring that cannot be read is never evidence of absence: no request',
  [],
  {
    keyring: {
      ...SESSION_ONLY_KEYRING,
      behave: { keyring_get: () => ({ fail: 'keyring timed out' }) }
    }
  }
)
probeCase(
  'probe-reads-the-secret-once',
  'Two probes in a row: the second is answered by the secret cache, no second keyring_get',
  [authenticated(), authenticated()],
  {
    script: async (env) => {
      const first = await env.user.probeSession('boot-probe')
      const second = await env.user.probeSession('humble-health-check')
      return { first, second }
    }
  }
)

// -- checkHealthAndFlagExpiry ---------------------------------------------------------------------

const healthCase = (
  id: string,
  about: string,
  synthetic: UserCase['synthetic'],
  extra: Partial<UserCase> = {}
): void =>
  add({
    id,
    about,
    synthetic,
    keyring: SESSION_ONLY_KEYRING,
    prepare: signedIn,
    script: async (env) => {
      env.setJar([ORY_COOKIE, CSRF_COOKIE])
      return { outcome: await env.user.checkHealthAndFlagExpiry() }
    },
    ...extra
  })

healthCase(
  'health-expired-latches-the-flag-and-pushes',
  'An anonymous session flags expired and pushes the cookie-free humbleAuthState with the stored username; no CSRF backfill',
  [anonymous()]
)
healthCase(
  'health-healthy-backfills-the-csrf-token-through-a-hidden-window',
  'A healthy session with no stored CSRF opens a hidden window on the Humble origin, reads csrf_cookie, stores it and closes the window',
  [authenticated()]
)
healthCase(
  'health-healthy-with-a-stored-csrf-token-opens-no-window',
  'A healthy session whose CSRF token is already stored makes no seam call',
  [authenticated()],
  { keyring: SIGNED_IN_KEYRING }
)
healthCase(
  'health-backfill-without-a-csrf-cookie-stores-nothing',
  'The window shows no csrf_cookie: nothing stored, the window is closed',
  [authenticated()],
  {
    script: async (env) => {
      env.setJar([ORY_COOKIE])
      return { outcome: await env.user.checkHealthAndFlagExpiry() }
    }
  }
)
healthCase(
  'health-backfill-open-failure-is-not-fatal',
  'open() rejects in the backfill: a warning, no close (no label), the outcome is still healthy',
  [authenticated()],
  {
    seam: {
      open: () => {
        throw new Error('window build failed')
      }
    }
  }
)
healthCase(
  'health-backfill-close-failure-is-a-warning',
  'close() rejects after the backfill read: a warning, the CSRF token is stored',
  [authenticated()],
  {
    seam: {
      close: () => {
        throw new Error('already gone')
      }
    }
  }
)
healthCase(
  'health-unknown-changes-nothing',
  'An unrecognised status flags nothing and pushes nothing',
  [sessionStatusAnswer(200, { status: 'second-factor-pending' })]
)
healthCase(
  'health-access-denied-changes-nothing',
  'A 403 is the C5 backoff signal: no flag, no push, no backfill',
  [sessionStatusAnswer(403, {})]
)
healthCase(
  'health-network-failure-changes-nothing',
  'An offline start is unknown',
  [],
  {
    onSessionStatus: () => ({ throw: 'getaddrinfo ENOTFOUND' })
  }
)

// -- getUserDetails / isLoggedIn ------------------------------------------------------------------

add({
  id: 'user-details-after-sign-in',
  about: 'isLoggedIn() and getUserDetails() over a stored account',
  prepare: signedIn,
  script: (env) =>
    Promise.resolve({
      isLoggedIn: env.user.isLoggedIn(),
      userDetails: env.user.getUserDetails() ?? null
    })
})
add({
  id: 'user-details-on-a-fresh-profile',
  about: 'No account: not logged in and no user data (never a default)',
  script: (env) =>
    Promise.resolve({
      isLoggedIn: env.user.isLoggedIn(),
      userDetails: env.user.getUserDetails() ?? null
    })
})

// ---------------------------------------------------------------------------------------------
// The Humble arm of applySignInVerdict (the D-24 reference 94-27 ports)
// ---------------------------------------------------------------------------------------------

interface VerdictCase {
  id: string
  about: string
  outcome: SignInProbeOutcome
  expiredBefore: boolean
  userData: boolean
  /** A sign-in or sign-out lands between the probe's capture and its verdict. */
  epochMoves: boolean
}

const verdictCases: VerdictCase[] = []
for (const outcome of ['expired', 'healthy', 'unknown'] as const) {
  for (const expiredBefore of [false, true]) {
    verdictCases.push({
      id: `verdict-${outcome}-when-${expiredBefore ? 'latched' : 'clear'}`,
      about: `outcome ${outcome}, the persisted expired flag ${expiredBefore ? 'set' : 'not set'}`,
      outcome,
      expiredBefore,
      userData: true,
      epochMoves: false
    })
  }
  verdictCases.push({
    id: `verdict-${outcome}-with-a-moved-epoch-applies-nothing`,
    about: `outcome ${outcome} after a sign-in landed: a stale epoch writes nothing and pushes nothing`,
    outcome,
    expiredBefore: outcome === 'healthy',
    userData: true,
    epochMoves: true
  })
}
verdictCases.push({
  id: 'verdict-expired-without-user-data-pushes-no-username',
  about: 'The push carries username only when userData is stored',
  outcome: 'expired',
  expiredBefore: false,
  userData: false,
  epochMoves: false
})

async function runVerdictCase(c: VerdictCase): Promise<unknown> {
  return withUtc(() =>
    withHumbleOracleProfile((profile) => {
      const lines: string[] = []
      const infoSpy = jest
        .spyOn(logger, 'logInfo')
        .mockImplementation((message: unknown) => {
          lines.push(String(message))
        })
      try {
        const registry = createStoreRegistry()
        const root = createTestStoreRoot(profile.userData)
        const stores = createHumbleStores({ registry, root })
        stores.configStore.set('isLoggedIn', true)
        if (c.userData)
          stores.configStore.set('userData', { username: 'REDACTED' })
        if (c.expiredBefore) stores.configStore.set('expired', true)
        const stateBefore = readableSnapshot(profile.userData)
        const probe = createTestSignInProbe()
        const epochAtStart = probe.epochs.capture('humble')
        if (c.epochMoves) probe.outcomes.noteSignInSucceeded('humble')
        const pushes: unknown[] = []
        const result = applySignInVerdict(
          {
            stores: { humble: stores },
            epochs: probe.epochs,
            sendFrontendMessage: ((channel: string, payload: unknown) => {
              pushes.push({
                channel,
                payload: JSON.parse(JSON.stringify(payload)) as unknown
              })
              return true
            }) as never
          },
          'humble',
          c.outcome,
          epochAtStart
        )
        return {
          input: {
            about: c.about,
            outcome: c.outcome,
            expiredBefore: c.expiredBefore,
            userData: c.userData,
            epochMoves: c.epochMoves
          },
          result,
          pushes,
          logs: lines,
          expiredAfter: stores.configStore.get_nodefault('expired') ?? null,
          stateBefore,
          stateAfter: readableSnapshot(profile.userData)
        }
      } finally {
        infoSpy.mockRestore()
      }
    })
  )
}

// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------

const allIds = [...cases.map((c) => c.id), ...verdictCases.map((c) => c.id)]

describe('Humble user oracle: login watch, disconnect, probe, health and the verdict', () => {
  it.each(cases.map((c) => [c.id, c] as const))(
    '%s',
    async (_id, c) => {
      const { id, ...options } = c
      const golden = await runUserCase({ slice: SLICE, caseId: id, ...options })
      writeOrCompareGolden(SLICE, id, golden)
    },
    CASE_TIMEOUT_MS
  )

  it.each(verdictCases.map((c) => [c.id, c] as const))(
    '%s',
    async (_id, c) => {
      writeOrCompareGolden(SLICE, c.id, await runVerdictCase(c))
    },
    CASE_TIMEOUT_MS
  )
})

describe('Humble user oracle: guards', () => {
  it('has the vacuous-pass guards', () => {
    syncManifest(SLICE, allIds, USER_FLOOR)
    assertManifest(SLICE, allIds, USER_FLOOR)
  })

  it('an empty case list fails the floor', () => {
    expectEmptyCasesToFail(SLICE, USER_FLOOR)
  })

  it('every case id is a distinct plain name', () => {
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})
