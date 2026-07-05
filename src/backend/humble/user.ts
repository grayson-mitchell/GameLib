import { app, safeStorage, session } from 'electron'

import { logWarning, LogPrefix } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'

import { configStore } from './electronStores'
import {
  HUMBLE_BASE_URL,
  HUMBLE_LOGIN_PARTITION,
  HUMBLE_TOKEN_PREFIX,
  HUMBLE_TOKEN_STORE_KEY
} from './constants'
import { getAccountIdentity, getGamekeys } from './adapter'
import { HumbleUserData } from 'common/types/humble'

/**
 * HumbleUser — the HACCT-01/02/03 auth service.
 *
 * The login surface is the embedded Stores WebView's `/loginweb/humble` route
 * (D-05); this file runs a main-process WATCH over the shared
 * `persist:humble` partition (D-18), captures + encrypts the
 * `_simpleauth_sess` cookie (Pattern 2, mirrors steam/user.ts) once the
 * gamekeys endpoint proves it authenticated (D-16), fetches the account
 * identity best-effort (D-02), runs the startup/401 expiry health check
 * (D-08/D-09), and handles reconnect (D-11, keeps the partition) vs
 * disconnect (D-07, wipes the whole partition).
 *
 * Discipline (Pitfall 4 / T-10-05): the raw session cookie is NEVER passed to
 * a logger call, NEVER stored under any key except the encrypted+prefixed
 * `sessionCookie` value, and NEVER included in a `humbleAuthState` push.
 */

// Backstop cookie-detection poll cadence (Open Question 3) — supplements the
// renderer's navigation relay (humbleLoginNavigated), which may not fire on
// every SPA-style post-login state change on humblebundle.com [ASSUMED].
const COOKIE_POLL_INTERVAL_MS = 1500

// Poll-path validation throttle: a cookie VALUE that was just rejected is not
// re-validated by the poll more often than this. Deliberately NOT a
// permanent blacklist — Humble may keep the same value across the
// anonymous → authenticated transition — and a forced re-validation (D-17,
// relayed from the webview's navigation events) bypasses the throttle
// entirely (see watchForLogin).
const VALIDATION_THROTTLE_MS = 3000

/**
 * Standard (non-Electron) browser user agent for the login surface.
 *
 * Google's SSO detects embedded browsers via the `Electron/x.y.z` and
 * app-name UA tokens and then restricts auth options — forcing passkey-only
 * verification (WebAuthn platform authenticators are unavailable inside an
 * embedded browser, so that prompt can never complete) or blocking outright
 * with `disallowed_useragent`. Presenting a plain Chrome UA restores the
 * password / "Try another way" flows.
 *
 * Derived from Electron's own `app.userAgentFallback` (NOT hardcoded) so the
 * platform token and Chrome version stay in parity with the actual runtime
 * Chromium — a stale hardcoded Chrome version is itself an embedded-browser
 * signal. Exported for unit testing and for the `humbleGetLoginUserAgent` IPC
 * handler (the webview's `useragent` attribute is the primary application
 * point; setting it on the partition session here is reinforcement).
 */
export function standardBrowserUserAgent(): string {
  const fallback = app.userAgentFallback
  const platform = /^Mozilla\/5\.0 \(([^)]+)\)/.exec(fallback)?.[1]
  const chromeVersion = /Chrome\/(\S+)/.exec(fallback)?.[1]
  if (!platform || !chromeVersion) {
    // Defensive: the fallback shape is stable across Electron versions, but
    // if it ever changes, at least strip the Electron-identifying token.
    return fallback.replace(/ Electron\/\S+/, '')
  }
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
}

type LoginResult = {
  status: 'done' | 'waiting' | 'error'
  username?: string
}

// ── Encryption helpers ────────────────────────────────────────────────────
// Mirrors src/backend/storeManagers/steam/user.ts's encryptToken/decryptToken
// shape exactly, renamed for Humble's TOKEN_PREFIX. Required deviation
// (success criterion 5 / Pitfall 5): when encryption is unavailable, this
// records a user-visible `encryptionDegraded` flag in addition to the dev
// log — Steam's verbatim behavior (log-only) under-delivers here.

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptCookie(plain: string): string {
  if (!plain) return ''
  if (!encryptionAvailable()) {
    logWarning(
      'safeStorage unavailable — storing Humble session in plaintext (degraded encryption)',
      LogPrefix.Backend
    )
    // Warn-and-store (Open Question 1 recommendation): do not refuse to
    // persist the session, but make the degradation user-visible so the
    // Manage Accounts tile can surface it rather than storing silently.
    configStore.set('encryptionDegraded', true)
    return plain
  }
  const ciphertext = safeStorage.encryptString(plain).toString('base64')
  return `${HUMBLE_TOKEN_PREFIX}${ciphertext}`
}

function decryptCookie(stored: string): string {
  if (!stored) return ''
  if (!stored.startsWith(HUMBLE_TOKEN_PREFIX)) {
    // Legacy/plaintext fallback (degraded-encryption path above)
    return stored
  }
  if (!encryptionAvailable()) return ''
  try {
    const buf = Buffer.from(stored.slice(HUMBLE_TOKEN_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch (err) {
    logWarning(
      ['Failed to decrypt Humble session cookie:', err],
      LogPrefix.Backend
    )
    return ''
  }
}

// Handle to the currently-running login watch (if any), so stopLogin() /
// notifyLoginNavigated() (D-06/D-17) can reach it without a BrowserWindow to
// hang events off of. Hoisted to a static field per D-17's guidance —
// unrelated to the promise itself, which is what startLogin/reconnect return.
type ActiveWatch = {
  stop: () => void
  forceRevalidate: () => void
}

// ── HumbleUser static class ────────────────────────────────────────────────

export class HumbleUser {
  private static activeWatch: ActiveWatch | null = null

  // ── HACCT-01/02: login state ─────────────────────────────────────────────

  static isLoggedIn(): boolean {
    return Boolean(configStore.get_nodefault('isLoggedIn'))
  }

  static getUserDetails(): HumbleUserData | undefined {
    return configStore.get_nodefault('userData')
  }

  static getCredentials(): string | undefined {
    const stored = configStore.get_nodefault('sessionCookie')
    if (!stored || typeof stored !== 'string') return undefined

    const cookie = decryptCookie(stored)
    if (!cookie) return undefined
    return cookie
  }

  // ── HACCT-01: Login (D-05/D-06/D-07) ─────────────────────────────────────

  static async startLogin(): Promise<LoginResult> {
    return HumbleUser.watchForLogin()
  }

  // ── HACCT-02: Reconnect (D-09/D-11 — SAME partition, no clearX call) ─────

  static async reconnect(): Promise<LoginResult> {
    return HumbleUser.watchForLogin()
  }

  // D-06: silent cancel when the /loginweb/humble route unmounts before a
  // candidate cookie is accepted — settles { status: 'waiting' }, no store
  // writes.
  static stopLogin(): void {
    HumbleUser.activeWatch?.stop()
  }

  // D-17: relayed from the webview's did-navigate/did-navigate-in-page
  // events. Forces an immediate re-validation bypassing the poll-path
  // throttle, since a top-level navigation (e.g. the SSO redirect landing
  // back on humblebundle.com) may carry an authenticated cookie under a
  // value that was JUST rejected.
  static notifyLoginNavigated(): void {
    HumbleUser.activeWatch?.forceRevalidate()
  }

  private static watchForLogin(): Promise<LoginResult> {
    // Tear down a stale watch from a previous attempt, if any is still
    // active.
    if (HumbleUser.activeWatch) {
      HumbleUser.activeWatch.stop()
      HumbleUser.activeWatch = null
    }

    const ses = session.fromPartition(HUMBLE_LOGIN_PARTITION)
    // Reinforcement UA set (Task 2's webview `useragent` attribute is the
    // primary application point) so any main-process-initiated request on
    // this partition also presents a standard Chrome UA.
    ses.setUserAgent(standardBrowserUserAgent())

    return new Promise<LoginResult>((resolve) => {
      let settled = false

      // Humble sets a `_simpleauth_sess` cookie for ANONYMOUS visitors too —
      // the login page's very first navigation already carries one. A cookie
      // value is therefore only a login CANDIDATE; finishLogin() validates it
      // against the gamekeys endpoint (D-16) before anything is stored.
      //
      // IMPORTANT: Humble may keep the SAME cookie value across the
      // anonymous → authenticated transition (the session id stays, only the
      // server-side state elevates). A rejected value therefore must NEVER be
      // permanently skipped — it is only THROTTLED on the poll path (so the
      // 1.5s poll doesn't hammer the gamekeys endpoint), and a forced
      // re-validation (relayed from the webview's navigation events via
      // notifyLoginNavigated) ALWAYS re-checks regardless of value match or
      // throttle.
      let lastRejectedValue: string | null = null
      let lastRejectedAt = 0
      // Overlapping forced-revalidation calls + poll ticks must not race
      // concurrent validations (they could double-store or double-settle).
      let validationInFlight = false

      // Hoisted function declarations so `settle`/`checkCookie` can reference
      // each other regardless of textual order — both only ever run
      // asynchronously (interval/forced-revalidation callbacks), well after
      // this executor's synchronous setup below has completed.
      function settle(result: LoginResult) {
        if (settled) return
        settled = true
        clearInterval(pollInterval)
        HumbleUser.activeWatch = null
        resolve(result)
      }

      async function checkCookie(forceValidation: boolean) {
        if (settled || validationInFlight) return
        try {
          const cookies = await ses.cookies.get({
            url: HUMBLE_BASE_URL,
            name: '_simpleauth_sess'
          })
          if (settled || validationInFlight) return
          if (cookies.length === 0) return

          const cookieValue = cookies[0].value

          // Poll-path throttle only: skip when the SAME value was rejected
          // within the throttle window. Forced revalidation bypasses this
          // entirely.
          if (
            !forceValidation &&
            cookieValue === lastRejectedValue &&
            Date.now() - lastRejectedAt < VALIDATION_THROTTLE_MS
          ) {
            return
          }

          validationInFlight = true
          try {
            const outcome = await HumbleUser.finishLogin(cookieValue, settle)
            if (outcome === 'rejected') {
              lastRejectedValue = cookieValue
              lastRejectedAt = Date.now()
            }
            // 'transient' records no throttle state — the next tick retries
            // the same value immediately.
          } finally {
            validationInFlight = false
          }
        } catch (err) {
          logWarning(
            ['Humble login cookie check failed:', err],
            LogPrefix.Backend
          )
        }
      }

      const pollInterval = setInterval(
        () => void checkCookie(false),
        COOKIE_POLL_INTERVAL_MS
      )

      HumbleUser.activeWatch = {
        // D-06: stopping before any cookie is accepted is a silent cancel —
        // no error, no toast, the tile just stays disconnected.
        stop: () => settle({ status: 'waiting' }),
        forceRevalidate: () => void checkCookie(true)
      }
    })
  }

  private static async finishLogin(
    cookieValue: string,
    settle: (result: LoginResult) => void
  ): Promise<'done' | 'rejected' | 'transient'> {
    // NEVER pass cookieValue to a logger, or store it under any key other
    // than the encrypted+prefixed sessionCookie value (Pitfall 4 / T-10-05).
    // Passing the raw value to getGamekeys/getAccountIdentity is fine — the
    // adapter already receives it on every call and never logs it.

    // Validate BEFORE storing anything: Humble hands `_simpleauth_sess` to
    // anonymous visitors, so an unvalidated cookie here is most likely NOT an
    // authenticated session. Only a gamekeys-endpoint 'ok' proves login
    // (D-16) — this is the authoritative signal, shared with the D-13 live
    // validation gate.
    let gamekeys: Awaited<ReturnType<typeof getGamekeys>>
    try {
      gamekeys = await getGamekeys(cookieValue)
    } catch (err) {
      // Transient/unexpected failure (network etc.) — do NOT record a
      // rejection; the next tick retries the same cookie immediately.
      logWarning(
        ['Humble login validation during login failed:', err],
        LogPrefix.Backend
      )
      return 'transient'
    }

    if (gamekeys.status !== 'ok') {
      // Anonymous/unauthenticated cookie value: store NOTHING, keep the
      // watch running so the user can complete the real login. The caller
      // throttles poll-path re-validation of this value; forced
      // revalidations always re-check it (the value may stay IDENTICAL
      // across anonymous → authenticated). Status-only log (never the cookie
      // value).
      logWarning(
        ['Humble login validation rejected candidate session:', gamekeys.status],
        LogPrefix.Backend
      )
      return 'rejected'
    }

    const encrypted = encryptCookie(cookieValue)
    configStore.set(HUMBLE_TOKEN_STORE_KEY, encrypted)
    configStore.set('isLoggedIn', true)
    configStore.set('expired', false)

    // D-02: identity is fetched BEST-EFFORT after acceptance. A failed
    // identity fetch (or a thrown error) must NEVER block login completion —
    // the tile falls back to a generic "Connected" label (username
    // undefined) and no userData is written.
    let username: string | undefined
    try {
      const identity = await getAccountIdentity(cookieValue)
      if (identity.status === 'ok') {
        configStore.set('userData', identity.data)
        username = identity.data.username
      } else {
        logWarning(
          [
            'Humble post-login identity fetch failed (best-effort, login already accepted):',
            identity.status
          ],
          LogPrefix.Backend
        )
      }
    } catch (err) {
      logWarning(
        [
          'Humble post-login identity fetch threw (best-effort, login already accepted):',
          err
        ],
        LogPrefix.Backend
      )
    }

    settle({ status: 'done', username })
    return 'done'
  }

  // ── HACCT-02: Startup/401 expiry health check (D-08/D-09) ────────────────

  static async checkHealthAndFlagExpiry(): Promise<void> {
    const cookie = HumbleUser.getCredentials()
    if (!cookie) return

    let result: Awaited<ReturnType<typeof getGamekeys>>
    try {
      result = await getGamekeys(cookie)
    } catch (err) {
      // Transient/network failure (e.g. offline app start) — health is
      // UNKNOWN, so do not flag expiry and do not push any state. Without
      // this catch the rejection propagates through the humbleCheckHealth
      // IPC handler to the renderer's fire-and-forget call as an unhandled
      // rejection on every offline start. Message/status only — never the
      // cookie.
      logWarning(
        ['Humble startup health check failed (transient, health unknown):', err],
        LogPrefix.Backend
      )
      return
    }
    if (result.status === 'session_expired') {
      configStore.set('expired', true)
      const userData = configStore.get_nodefault('userData')
      sendFrontendMessage('humbleAuthState', {
        isLoggedIn: true,
        username: userData?.username,
        expired: true
      })
    }
    // access_denied (403) is a Humble-side C5 backoff signal, NOT a re-login
    // trigger (D-08) — intentionally no state change on that path.
  }

  // ── HACCT-03: Disconnect (D-07 — full partition wipe) ─────────────────────

  static async disconnect(): Promise<void> {
    // The stored credential is the canonical secret — remove it FIRST, so a
    // failed partition-clear step can never leave the (possibly
    // plaintext-degraded) sessionCookie on disk after a user-confirmed
    // disconnect (WR-02 / T-10-07).
    configStore.clear()

    // Best-effort partition wipe: each step guarded individually so one
    // rejected Electron session API call does not abort the rest. Partial
    // failures are logged (never thrown) — the disconnect itself already
    // succeeded once the credential store is cleared.
    const ses = session.fromPartition(HUMBLE_LOGIN_PARTITION)
    const wipeSteps: Array<[string, () => Promise<unknown>]> = [
      ['clearStorageData', async () => ses.clearStorageData()],
      ['clearCache', async () => ses.clearCache()],
      ['clearAuthCache', async () => ses.clearAuthCache()],
      ['clearHostResolverCache', async () => ses.clearHostResolverCache()],
      ['clearData', async () => ses.clearData()]
    ]
    for (const [name, step] of wipeSteps) {
      try {
        await step()
      } catch (err) {
        logWarning(
          [`Humble partition wipe step ${name} failed (continuing):`, err],
          LogPrefix.Backend
        )
      }
    }
    // D-04: does NOT touch any audit-log/REVEALED-flag store — none exists
    // yet in Phase 10; this is forward policy for Phase 11/14.
  }
}
