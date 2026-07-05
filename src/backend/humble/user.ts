import { app, BrowserWindow, safeStorage, session } from 'electron'

import { logWarning, LogPrefix } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'

import { configStore } from './electronStores'
import {
  HUMBLE_BASE_URL,
  HUMBLE_LOGIN_PARTITION,
  HUMBLE_LOGIN_URL,
  HUMBLE_TOKEN_PREFIX,
  HUMBLE_TOKEN_STORE_KEY
} from './constants'
import { getAccountIdentity, getGamekeys } from './adapter'
import { HumbleUserData } from 'common/types/humble'

/**
 * HumbleUser — the HACCT-01/02/03 auth service.
 *
 * Opens the login BrowserWindow (D-05/D-06/D-07), captures + encrypts the
 * `_simpleauth_sess` cookie (Pattern 2, mirrors steam/user.ts), fetches the
 * account identity, runs the startup/401 expiry health check (D-08/D-09),
 * and handles reconnect (D-11, keeps the `humble-login` partition) vs
 * disconnect (D-07, wipes the whole partition).
 *
 * Discipline (Pitfall 4 / T-10-05): the raw session cookie is NEVER passed to
 * a logger call, NEVER stored under any key except the encrypted+prefixed
 * `sessionCookie` value, and NEVER included in a `humbleAuthState` push.
 */

// Backstop cookie-detection poll cadence (Open Question 3) — supplements the
// did-navigate/did-navigate-in-page hooks, which may not fire on every
// SPA-style post-login state change on humblebundle.com [ASSUMED].
const COOKIE_POLL_INTERVAL_MS = 1500

// Poll-path identity-validation throttle: a cookie VALUE that was just
// rejected is not re-validated by the poll more often than this. Deliberately
// NOT a permanent blacklist — Humble may keep the same value across the
// anonymous → authenticated transition — and top-level navigations bypass
// the throttle entirely (see openLoginWindow).
const VALIDATION_THROTTLE_MS = 3000

/**
 * Standard (non-Electron) browser user agent for the login window.
 *
 * Google's SSO detects embedded browsers via the `Electron/x.y.z` and
 * app-name UA tokens and then restricts auth options — forcing passkey-only
 * verification (WebAuthn platform authenticators are unavailable inside a
 * BrowserWindow, so that prompt can never complete) or blocking outright
 * with `disallowed_useragent`. Presenting a plain Chrome UA restores the
 * password / "Try another way" flows.
 *
 * Derived from Electron's own `app.userAgentFallback` (NOT hardcoded) so the
 * platform token and Chrome version stay in parity with the actual runtime
 * Chromium — a stale hardcoded Chrome version is itself an embedded-browser
 * signal. Exported for unit testing.
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

// ── HumbleUser static class ────────────────────────────────────────────────

export class HumbleUser {
  private static loginWindow: BrowserWindow | null = null

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
    return HumbleUser.openLoginWindow()
  }

  // ── HACCT-02: Reconnect (D-09/D-11 — SAME partition, no clearX call) ─────

  static async reconnect(): Promise<LoginResult> {
    return HumbleUser.openLoginWindow()
  }

  private static openLoginWindow(): Promise<LoginResult> {
    // Tear down a stale window from a previous attempt, if any is still open.
    if (HumbleUser.loginWindow) {
      try {
        HumbleUser.loginWindow.close()
      } catch {
        // ignore — window may already be gone
      }
      HumbleUser.loginWindow = null
    }

    const ses = session.fromPartition(HUMBLE_LOGIN_PARTITION)
    const win = new BrowserWindow({
      width: 480,
      height: 640,
      webPreferences: { session: ses, contextIsolation: true }
    })
    HumbleUser.loginWindow = win
    // Present a standard Chrome UA so third-party SSO (Google) offers its
    // normal password/"Try another way" flows instead of embedded-browser
    // restrictions (passkey-only / disallowed_useragent). Must be set before
    // loadURL so the very first request already carries it.
    win.webContents.userAgent = standardBrowserUserAgent()
    void win.loadURL(HUMBLE_LOGIN_URL)

    return new Promise<LoginResult>((resolve) => {
      let settled = false

      // Humble sets a `_simpleauth_sess` cookie for ANONYMOUS visitors too —
      // the login page's very first navigation already carries one. A cookie
      // value is therefore only a login CANDIDATE; finishLogin() validates it
      // against the identity endpoint before anything is stored.
      //
      // IMPORTANT: Humble may keep the SAME cookie value across the
      // anonymous → authenticated transition (the session id stays, only the
      // server-side state elevates). A rejected value therefore must NEVER be
      // permanently skipped — it is only THROTTLED on the poll path (so the
      // 1.5s poll doesn't hammer the identity endpoint), and a top-level
      // navigation (did-navigate / did-navigate-in-page — e.g. the SSO
      // redirect landing back on humblebundle.com) ALWAYS forces a fresh
      // validation regardless of value match or throttle.
      let lastRejectedValue: string | null = null
      let lastRejectedAt = 0
      // Overlapping did-navigate events + poll ticks must not race concurrent
      // validations (they could double-store or double-settle).
      let validationInFlight = false

      // Hoisted function declarations so `settle`/`checkCookie` can reference
      // each other regardless of textual order — both only ever run
      // asynchronously (event/interval callbacks), well after this
      // executor's synchronous setup below has completed.
      function settle(result: LoginResult) {
        if (settled) return
        settled = true
        clearInterval(pollInterval)
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
          // within the throttle window. Navigations bypass this entirely.
          if (
            !forceValidation &&
            cookieValue === lastRejectedValue &&
            Date.now() - lastRejectedAt < VALIDATION_THROTTLE_MS
          ) {
            return
          }

          validationInFlight = true
          try {
            const outcome = await HumbleUser.finishLogin(
              cookieValue,
              win,
              settle
            )
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

      win.webContents.on('did-navigate', () => void checkCookie(true))
      win.webContents.on('did-navigate-in-page', () => void checkCookie(true))
      const pollInterval = setInterval(
        () => void checkCookie(false),
        COOKIE_POLL_INTERVAL_MS
      )

      // D-06: closing the window before any cookie is captured is a silent
      // cancel — no error, no toast, the tile just stays disconnected.
      win.on('closed', () => {
        HumbleUser.loginWindow = null
        settle({ status: 'waiting' })
      })
    })
  }

  private static async finishLogin(
    cookieValue: string,
    win: BrowserWindow,
    settle: (result: LoginResult) => void
  ): Promise<'done' | 'rejected' | 'transient'> {
    // NEVER pass cookieValue to a logger, or store it under any key other
    // than the encrypted+prefixed sessionCookie value (Pitfall 4 / T-10-05).
    // Passing the raw value to getAccountIdentity is fine — the adapter
    // already receives it on every call and never logs it.

    // Validate BEFORE storing anything: Humble hands `_simpleauth_sess` to
    // anonymous visitors, so an unvalidated cookie here is most likely NOT an
    // authenticated session. Only an identity-endpoint 'ok' proves login.
    let identity: Awaited<ReturnType<typeof getAccountIdentity>>
    try {
      identity = await getAccountIdentity(cookieValue)
    } catch (err) {
      // Transient/unexpected failure (network etc.) — do NOT record a
      // rejection; the next tick retries the same cookie immediately.
      logWarning(
        ['Humble identity validation during login failed:', err],
        LogPrefix.Backend
      )
      return 'transient'
    }

    if (identity.status !== 'ok') {
      // Anonymous/unauthenticated cookie value: store NOTHING, keep the
      // window open so the user can complete the real login. The caller
      // throttles poll-path re-validation of this value; navigations always
      // re-check it (the value may stay IDENTICAL across anonymous →
      // authenticated). Status-only log (never the cookie value) — if this
      // warning keeps firing AFTER a successful login, the identity endpoint
      // itself is failing for authenticated sessions: D-14 fallback evidence.
      logWarning(
        [
          'Humble identity check rejected candidate session:',
          identity.status,
          '(endpoint: /api/v1/user/info)'
        ],
        LogPrefix.Backend
      )
      return 'rejected'
    }

    const encrypted = encryptCookie(cookieValue)
    configStore.set(HUMBLE_TOKEN_STORE_KEY, encrypted)
    configStore.set('isLoggedIn', true)
    configStore.set('expired', false)
    configStore.set('userData', identity.data)
    const username = identity.data.username

    HumbleUser.loginWindow = null
    // Settle before closing the window — closing fires the 'closed' handler,
    // which would otherwise race to also settle this same promise.
    settle({ status: 'done', username })
    win.close()
    return 'done'
  }

  // ── HACCT-02: Startup/401 expiry health check (D-08/D-09) ────────────────

  static async checkHealthAndFlagExpiry(): Promise<void> {
    const cookie = HumbleUser.getCredentials()
    if (!cookie) return

    const result = await getGamekeys(cookie)
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
    const ses = session.fromPartition(HUMBLE_LOGIN_PARTITION)
    await ses.clearStorageData()
    await ses.clearCache()
    await ses.clearAuthCache()
    await ses.clearHostResolverCache()
    await ses.clearData()
    // D-04: does NOT touch any audit-log/REVEALED-flag store — none exists
    // yet in Phase 10; this is forward policy for Phase 11/14.
    configStore.clear()
  }
}
