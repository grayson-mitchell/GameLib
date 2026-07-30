import { session } from 'electron'

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'

import { configStore, humbleLibraryStore, humbleSyncStore } from './electronStores'
import {
  HUMBLE_BASE_URL,
  HUMBLE_LOGIN_PARTITION,
  HUMBLE_LOGIN_URL
} from './constants'
import { getAccountIdentity, getGamekeys } from './adapter'
import { invalidateSyncGeneration } from './syncFence'
import { HumbleUserData } from 'common/types/humble'
import { standardBrowserUserAgent } from './userAgent'
import { getLoginWindowSeam, classifyCookieRead } from './loginWindowSeam'
import { getHumbleSecretStore, type HumbleSecretKey } from './secretStore'

// Re-exported so existing callers (ipc_handler.ts's humbleGetLoginUserAgent
// handler, user.test.ts) are unaffected by the round-6 move into its own
// module (see userAgent.ts's doc comment for why the move was needed).
export { standardBrowserUserAgent }

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

// WR-03: hard deadline on the login watch. The only external teardown signal
// is the renderer's humbleStopLogin on route unmount — which never fires
// across window.location.reload() (epic/gog/amazon/zoom/steam logout paths)
// or a renderer crash, orphaning the watch into an INDEFINITE cookie poll +
// Humble validation loop (C5 never-hammer violation once an anonymous
// _simpleauth_sess exists). The deadline settles { status: 'waiting' }
// (silent cancel, no store writes) and is RE-ARMED on every
// notifyLoginNavigated() relay so an actively-navigating user is never cut
// off mid-login.
export const LOGIN_WATCH_TIMEOUT_MS = 10 * 60_000

type LoginResult = {
  status: 'done' | 'waiting' | 'error'
  username?: string
}

// ── Credential encryption seam ───────────────────────────────────────────
// Phase 34.4.1 Plan 12 (gap-cycle closure for F-1/S-10, REQ-34.4.1-02/
// REQ-34.4.1-GAP-02): the encryptionAvailable/encryptCookie/decryptCookie
// free functions that used to live here have moved verbatim into
// secretStore.ts's ElectronHumbleSecretStore — this is the ONLY place their
// bodies exist now. `user.ts` never touches the Electron encryption API
// directly again; every read/write goes through `getHumbleSecretStore()`.
//
// The user-visible "encryption degraded" flag stays HERE (not in the seam):
// it is a UI concern, driven off `isAvailable()`, that the Manage Accounts
// tile surfaces — required deviation (success criterion 5 / Pitfall 5) from
// Steam's verbatim behavior (log-only), which under-delivers for Humble.
// WR-07: the healthy path always clears the flag (explicitly `false`, not
// merely "not set to true") — a user who once logged in with encryption
// unavailable and later re-logs in on a fixed system must not keep seeing
// the stale reduced-encryption warning.
async function storeHumbleSecret(
  key: HumbleSecretKey,
  value: string
): Promise<void> {
  const store = getHumbleSecretStore()
  await store.setSecret(key, value)
  configStore.set('encryptionDegraded', !(await store.isAvailable()))
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

  // Async since Phase 34.4.1 Plan 12: routed through getHumbleSecretStore(),
  // whose keyring-backed implementation (plan 13) cannot be synchronous.
  // Precedent: storeManagers/steam/user.ts's SteamUser.getCredentials() has
  // been async since Phase 28 for exactly this reason.
  static async getCredentials(): Promise<string | undefined> {
    const cookie = await getHumbleSecretStore().getSecret('sessionCookie')
    if (!cookie) return undefined
    return cookie
  }

  // ── Phase 14 (T-14-04): optional CSRF token for the reveal endpoint ──────
  // Mirrors getCredentials() exactly — same seam-routed pattern. Main-
  // process-only: this value must NEVER be included in any
  // sendFrontendMessage payload or HumbleAuthState (see finishLogin's
  // capture site and the class-level doc comment above).
  static async getCsrfToken(): Promise<string | undefined> {
    const token = await getHumbleSecretStore().getSecret('csrfToken')
    if (!token) return undefined
    return token
  }

  // WR-03 (14-REVIEW): the stored csrfToken is a SNAPSHOT (login capture /
  // health-check backfill, both gated on absence) while humblePostRequest
  // attaches the LIVE `persist:humble` cookie jar natively. If Humble
  // rotates `csrf_cookie`, every reveal thereafter sends a header that no
  // longer matches the cookie — a genuine 403 → 15-minute cooldown that
  // never self-heals. This reads the live partition cookie at reveal time so
  // header and cookie agree by construction; the stored snapshot is only a
  // fallback cache for when the partition read fails/finds nothing.
  // Main-process-only, same secrecy discipline as getCsrfToken(): the value
  // must NEVER be logged or included in any sendFrontendMessage payload.
  static async getLiveCsrfToken(): Promise<string | undefined> {
    const seam = getLoginWindowSeam()
    if (seam !== null) {
      // Under the Tauri seam there is no live login window at reveal time —
      // the login watch already settled and closed its window (T-34.4.1-18).
      // Reading via the seam here would require a label this call never has,
      // and would otherwise hit the sidecar's `{}` electronStub session shape
      // if it fell through to session.fromPartition below. Return the stored
      // snapshot directly rather than throwing a TypeError into the catch.
      // Electron behavior (below) is unchanged.
      logInfo(
        'Humble live csrf read: seam installed, no live login window at reveal time — using stored snapshot',
        LogPrefix.Backend
      )
      return HumbleUser.getCsrfToken()
    }
    try {
      const ses = session.fromPartition(HUMBLE_LOGIN_PARTITION)
      const cookies = await ses.cookies.get({
        url: HUMBLE_BASE_URL,
        name: 'csrf_cookie'
      })
      if (cookies.length > 0 && cookies[0].value) {
        return cookies[0].value
      }
    } catch (err) {
      logWarning(
        [
          'Humble live csrf_cookie read failed (falling back to stored snapshot):',
          err
        ],
        LogPrefix.Backend
      )
    }
    return HumbleUser.getCsrfToken()
  }

  // Debug session humble-reveal-key-fails: round 5 added getFullCookieHeader()
  // here (a main-process read of the live `persist:humble` partition's full
  // cookie jar, hand-joined into a Cookie header string) to mirror what a
  // real browser auto-attaches. Round 6's checkpoint evidence (status=403,
  // contentType=text/html, looksLikeHtml=true — a Cloudflare Bot Management
  // challenge page) FALSIFIED that mechanism as sufficient: it was live in
  // the running build (fullCookieJarPresent=true) and Cloudflare still
  // blocked the request. The root cause was never the cookie CONTENTS — it
  // was axios's non-browser TLS/HTTP transport fingerprint, which no amount
  // of header/cookie fidelity can fix. Round 6 routes the reveal POST
  // through Electron's own Chromium network stack instead (see adapter.ts's
  // humblePostRequest), which sources the partition's cookies NATIVELY via
  // `useSessionCookies`/`credentials: 'include'` — making this hand-built
  // mirror redundant. Removed rather than left as dead code so a future
  // debugging round does not mistake it for a still-active fix.

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

    // D-01/D-02 (Phase 34.4.1 Plan 03): under Electron, `getLoginWindowSeam()`
    // always returns null (nothing in the Electron build ever calls
    // setLoginWindowSeam) — the `seam === null` branches below are the
    // ORIGINAL, untouched session.fromPartition() behavior. Under the Tauri
    // sidecar there is no session.fromPartition() shape at all
    // (tauri-login-webview-cookies.md § "Requirements" #7), so a seam is
    // installed at sidecar startup and drives a real Rust-owned login window
    // instead.
    const seam = getLoginWindowSeam()

    let ses: ReturnType<typeof session.fromPartition> | null = null
    if (seam === null) {
      ses = session.fromPartition(HUMBLE_LOGIN_PARTITION)
      // Reinforcement UA set (Task 2's webview `useragent` attribute is the
      // primary application point) so any main-process-initiated request on
      // this partition also presents a standard Chrome UA.
      ses.setUserAgent(standardBrowserUserAgent())
    }

    return new Promise<LoginResult>((resolve) => {
      let settled = false

      // Seam-path-only state. `seamLabel` is the Rust-owned login window's
      // label, set once seam.open() resolves (null until then, and stays
      // null on the Electron path). `everProvedLive` is the liveness proof
      // classifyCookieRead needs to distinguish a genuinely empty jar from a
      // dead cookie API (tauri-login-webview-cookies.md § "Liveness proof
      // before any poll") — Humble hands 33 cookies to an ANONYMOUS visitor,
      // so a first read of zero means the channel is dead, not "not logged
      // in yet".
      let seamLabel: string | null = null
      let everProvedLive = false

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
      // notifyLoginNavigated, or from a main-frame `finished` nav event
      // drained from Rust) ALWAYS re-checks regardless of value match or
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
        clearTimeout(watchDeadline)
        HumbleUser.activeWatch = null
        resolve(result)
        // T-34.4.1-18: close the Rust-owned login window exactly once, on
        // every exit path (done, waiting, error, stop, deadline). Floated —
        // a close() rejection must never throw out of settle() and strand
        // this promise (WR-06 float discipline).
        if (seam !== null && seamLabel !== null) {
          const labelToClose = seamLabel
          seam.close(labelToClose).catch((err) => {
            logWarning(
              ['Humble login window close failed (non-fatal):', err],
              LogPrefix.Backend
            )
          })
        }
      }

      async function checkCookie(forceValidation: boolean) {
        if (settled || validationInFlight) return
        try {
          let cookieValue: string | undefined

          if (seam === null) {
            // ── Electron path (unchanged) ─────────────────────────────────
            const cookies = await ses!.cookies.get({
              url: HUMBLE_BASE_URL,
              name: '_simpleauth_sess'
            })
            if (settled || validationInFlight) return
            if (cookies.length === 0) return
            cookieValue = cookies[0].value
          } else {
            // ── Tauri seam path ─────────────────────────────────────────────
            if (seamLabel === null) return // window not open yet

            // REQ-34.4.1-03: drain main-frame-only nav events (Rust's
            // on_page_load hook, never on_navigation — a third-party ad
            // iframe must never re-arm this deadline) BEFORE the cookie read
            // on every tick. A 'finished' event re-arms the deadline and
            // forces this tick's read to bypass the throttle — the same
            // signal notifyLoginNavigated()'s forceRevalidate() relays today.
            try {
              const events = await seam.takeEvents(seamLabel)
              if (events.some((event) => event.event === 'finished')) {
                armDeadline()
                forceValidation = true
              }
            } catch (err) {
              logWarning(
                ['Humble login nav-event drain failed (non-fatal):', err],
                LogPrefix.Backend
              )
            }
            if (settled || validationInFlight) return

            let total: number | null
            let matched: Array<{ name: string; domain: string | null; value: string }> =
              []
            try {
              // Deliberate host: the Rust arm does a proper domain-SUFFIX
              // match, so the apex-domain `_simpleauth_sess` cookie IS
              // returned for the 'www.' host — this is exactly the case
              // wry's naive per-URL cookie filter silently drops on macOS
              // (tauri-login-webview-cookies.md § "The killer").
              const read = await seam.cookies(
                seamLabel,
                'www.humblebundle.com',
                ['_simpleauth_sess']
              )
              total = read.total
              matched = read.matched
            } catch (err) {
              total = null
              logWarning(
                ['Humble login-window cookie read failed:', err],
                LogPrefix.Backend
              )
            }
            if (settled || validationInFlight) return
            if (total !== null && total > 0) everProvedLive = true

            const verdict = classifyCookieRead({ total, everProvedLive })
            if (verdict === 'UNDECIDABLE') {
              // NEVER continue polling on this verdict — empty and no-op are
              // indistinguishable by construction.
              logWarning(
                `Humble login-window cookie read UNDECIDABLE for window ${seamLabel} — aborting watch loudly (never poll on this verdict)`,
                LogPrefix.Backend
              )
              settle({ status: 'error' })
              return
            }
            if (verdict === 'UNSUPPORTED_OR_ERROR') {
              logWarning(
                `Humble login-window cookie read UNSUPPORTED_OR_ERROR for window ${seamLabel} — aborting watch`,
                LogPrefix.Backend
              )
              settle({ status: 'error' })
              return
            }
            if (verdict === 'SUPPORTED_BUT_EMPTY') {
              return // genuine "not logged in yet"
            }
            // SUPPORTED_NONEMPTY — the jar is live, but the CANDIDATE cookie
            // may still be absent from the filtered set (not logged in yet).
            const match = matched.find((c) => c.name === '_simpleauth_sess')
            if (!match) return
            cookieValue = match.value
          }

          if (cookieValue === undefined) return

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
            const outcome = await HumbleUser.finishLogin(
              cookieValue,
              settle,
              () => settled,
              seam !== null ? seamLabel : null
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

      const pollInterval = setInterval(
        () => void checkCookie(false),
        COOKIE_POLL_INTERVAL_MS
      )

      // WR-03: watch deadline — a watch orphaned by a renderer reload/crash
      // must never poll + re-validate against Humble indefinitely. Settling
      // { status: 'waiting' } is the same silent cancel as stopLogin().
      let watchDeadline: ReturnType<typeof setTimeout>
      function armDeadline() {
        clearTimeout(watchDeadline)
        watchDeadline = setTimeout(
          () => settle({ status: 'waiting' }),
          LOGIN_WATCH_TIMEOUT_MS
        )
      }
      armDeadline()

      HumbleUser.activeWatch = {
        // D-06: stopping before any cookie is accepted is a silent cancel —
        // no error, no toast, the tile just stays disconnected.
        stop: () => settle({ status: 'waiting' }),
        forceRevalidate: () => {
          // A navigation relay proves the user is still actively logging in
          // — re-arm the deadline so they are never cut off mid-flow.
          armDeadline()
          void checkCookie(true)
        }
      }

      if (seam !== null) {
        // Tauri path: open the Rust-owned login window with the standard
        // Chrome UA (tauri-login-webview-cookies.md § "Why the UA is
        // mandatory"). The window must stay open for the whole poll —
        // closing it destroys the cookie handle even though the cookies
        // survive (spike 015) — and is closed exactly once, inside settle()
        // above.
        seam
          .open(HUMBLE_LOGIN_URL, {
            visible: true,
            userAgent: standardBrowserUserAgent()
          })
          .then((openedLabel) => {
            if (settled) {
              // The watch already settled (e.g. stopLogin() fired) before
              // open() resolved — close the now-orphaned window immediately
              // rather than leaking it.
              seam.close(openedLabel).catch((err) => {
                logWarning(
                  ['Humble login window close failed (non-fatal):', err],
                  LogPrefix.Backend
                )
              })
              return
            }
            seamLabel = openedLabel
          })
          .catch((err) => {
            logWarning(
              ['Humble login window open failed:', err],
              LogPrefix.Backend
            )
            settle({ status: 'error' })
          })
      }
    })
  }

  private static async finishLogin(
    cookieValue: string,
    settle: (result: LoginResult) => void,
    isSettled: () => boolean,
    seamLabel: string | null
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

    // WR-03 / D-06: stopLogin() may have settled the watch ({ status:
    // 'waiting' }) WHILE the gamekeys validation above was in flight. A
    // silent cancel means NO store writes — the frontend already believes
    // the login was cancelled, so committing state here would leave the
    // backend logged-in while the tile shows disconnected until restart.
    if (isSettled()) return 'transient'

    await storeHumbleSecret('sessionCookie', cookieValue)
    configStore.set('isLoggedIn', true)
    configStore.set('expired', false)

    // Phase 14 (T-14-04, RESEARCH.md Pitfall A): opportunistically capture
    // the csrf_cookie value at the SAME login moment as _simpleauth_sess.
    // The reveal endpoint's CSRF requirement is unconfirmed — absence is
    // NON-FATAL (no error, nothing stored) and never blocks login
    // completion; the Plan 06 live checkpoint decides whether it is
    // actually required. Same encryption treatment as the session cookie.
    // Main-process-only: NEVER included in sendFrontendMessage/HumbleAuthState.
    try {
      const seam = getLoginWindowSeam()
      if (seam !== null && seamLabel !== null) {
        // Tauri path: read csrf_cookie from the SAME live login window whose
        // _simpleauth_sess candidate was just accepted, via the seam rather
        // than session.fromPartition (which has no shape under Tauri).
        const csrfRead = await seam.cookies(seamLabel, 'www.humblebundle.com', [
          'csrf_cookie'
        ])
        const match = csrfRead.matched.find((c) => c.name === 'csrf_cookie')
        if (match && match.value) {
          await storeHumbleSecret('csrfToken', match.value)
        }
      } else {
        const csrfSes = session.fromPartition(HUMBLE_LOGIN_PARTITION)
        const csrfCookies = await csrfSes.cookies.get({
          url: HUMBLE_BASE_URL,
          name: 'csrf_cookie'
        })
        if (csrfCookies.length > 0 && csrfCookies[0].value) {
          await storeHumbleSecret('csrfToken', csrfCookies[0].value)
        }
      }
    } catch (err) {
      logWarning(
        ['Humble csrf_cookie capture failed (non-fatal, optional):', err],
        LogPrefix.Backend
      )
    }

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

    // WR-06: push the authoritative state so the renderer converges even if
    // the /loginweb/humble route unmounted before the login promise's
    // callback ran (GlobalState's handleHumbleAuthState listener absorbs
    // this regardless of route lifecycle). Cookie-free by type (T-10-09).
    sendFrontendMessage('humbleAuthState', {
      isLoggedIn: true,
      username,
      expired: false
    })

    settle({ status: 'done', username })
    return 'done'
  }

  // ── HACCT-02: Startup/401 expiry health check (D-08/D-09) ────────────────

  static async checkHealthAndFlagExpiry(): Promise<void> {
    const cookie = await HumbleUser.getCredentials()
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

    // Debug session humble-reveal-key-fails / T-14-04 gap fix: csrf_cookie
    // was previously ONLY ever captured inside finishLogin() (an active
    // login/reconnect flow) — an account that was already connected before
    // that capture code shipped (or any session where the opportunistic
    // capture missed) would NEVER get a csrfToken, silently sending every
    // reveal POST without the 'csrf-prevention-token' header (RESEARCH.md
    // Pitfall A). This confirmed-healthy ('ok') session is exactly the
    // moment the csrf_cookie is known to be readable from the SAME partition
    // finishLogin reads — so opportunistically backfill it here too,
    // self-healing the gap without requiring the user to disconnect/
    // reconnect. Best-effort/non-fatal, mirrors finishLogin's own capture
    // exactly (never blocks the health check, never logs the value).
    if (result.status === 'ok' && !(await HumbleUser.getCsrfToken())) {
      try {
        const csrfSes = session.fromPartition(HUMBLE_LOGIN_PARTITION)
        const csrfCookies = await csrfSes.cookies.get({
          url: HUMBLE_BASE_URL,
          name: 'csrf_cookie'
        })
        if (csrfCookies.length > 0 && csrfCookies[0].value) {
          await storeHumbleSecret('csrfToken', csrfCookies[0].value)
        }
      } catch (err) {
        logWarning(
          [
            'Humble csrf_cookie backfill failed (non-fatal, optional):',
            err
          ],
          LogPrefix.Backend
        )
      }
    }
  }

  // ── HACCT-03: Disconnect (D-07 — full partition wipe) ─────────────────────

  static async disconnect(): Promise<void> {
    // CR-01: fence off any IN-FLIGHT sync before the wipes. A running
    // HumbleLibrary sync captured the cookie at start and would otherwise
    // keep making authenticated requests, silently repopulate the
    // library/sync stores cleared below, and push the pre-disconnect key
    // inventory back over the renderer's cleared state — stale/cross-account
    // inventory bleed (HSYNC-02/D-04).
    invalidateSyncGeneration()

    // The stored credential is the canonical secret — remove it FIRST, so a
    // failed partition-clear step can never leave the (possibly
    // plaintext-degraded) sessionCookie on disk after a user-confirmed
    // disconnect (WR-02 / T-10-07).
    configStore.clear()

    // Phase 34.4.1 gap-cycle plan 13 (F-1 BLOCKING closure): clear the
    // keyring-backed session/csrf secrets too, as part of the SAME credential
    // cleanup as the configStore.clear() line just above -- distinct from the
    // partition/browser storage clearing below (and from plan 16's
    // browser-side storage clearing further out), neither of which replaces
    // the other. configStore.clear() stays FIRST and this call is guarded so
    // a rejection can never abort it or throw out of disconnect() -- the
    // configStore credential delete remains the security boundary (WR-02/
    // T-10-07); this is best-effort cleanup layered on top of it, not a
    // replacement for it. getHumbleSecretStore().clearSecrets() is already
    // total (never rejects) for both the Electron and keyring-backed
    // implementations, but this guard is defense in depth matching the
    // wipeSteps discipline below.
    try {
      await getHumbleSecretStore().clearSecrets()
    } catch (err) {
      logWarning(
        ['Humble disconnect: keyring secret clear failed (non-fatal):', err],
        LogPrefix.Backend
      )
    }

    // Phase 11 (HSYNC-02/D-04): the library cache + sync-state are fully
    // reconstructible from a re-sync, so they are wiped alongside the
    // credential — a stale key inventory must never survive a disconnect.
    humbleLibraryStore.clear()
    humbleSyncStore.clear()

    // Best-effort wipe: each step guarded individually so one rejected
    // step does not abort the rest. Partial failures are logged (never
    // thrown) — the disconnect itself already succeeded once the credential
    // store is cleared.
    //
    // Phase 34.4.1 Plan 06 (D-08, closes 34.4 D-05's declared partial): under
    // Electron this is the ORIGINAL, untouched five-step session.fromPartition
    // wipe. Under Tauri there is no session.fromPartition() shape at all — the
    // login cookies live in the sidecar's app-wide webview jar, which is only
    // reachable through a live webview handle (tauri-login-webview-cookies.md
    // § "Persistence and isolation"). A single 'clearHumbleCookies' step opens
    // a HIDDEN window (no visible UI flash on disconnect), clears ONLY
    // humblebundle.com cookies through the domain-scoped Rust arm (T-34.4.1-30
    // — the jar will hold Epic/GOG/Amazon cookies once Phase 34.5 lands, so a
    // blanket wipe would sign the user out of storefronts they never touched),
    // and closes the window in a `finally` so no path — success, rejection, or
    // a thrown open() — ever leaves it open.
    //
    // Phase 34.4.1 Plan 16 (F-6 BLOCKING closure): the cookie-only step above
    // left the Tauri branch covering only 1 of Electron's 5 wipe categories
    // (`cookies` vs `storage`/`cache`/`authCache`/`hostResolver`/`cookies` via
    // `clearStorageData`/`clearCache`/`clearAuthCache`/`clearHostResolverCache`/
    // `clearData`) — a genuine functional AND privacy regression: localStorage/
    // IndexedDB/service workers survived a disconnect, so the very next login
    // window auto-signed the next person on a shared machine straight back in.
    // A second, INDEPENDENT 'clearHumbleStorage' step now calls Plan 15's
    // `seam.clearStorage(HUMBLE_BASE_URL, ...)`, which clears localStorage,
    // sessionStorage, IndexedDB, Cache Storage and service-worker registrations
    // for Humble's own origin only — same-origin policy scopes it structurally,
    // the same discipline `clearCookies`'s domain-suffix filter already
    // achieves for cookies (T-34.4.1-66). This closes the `storage`/`cache`
    // categories. It is a SEPARATE wipeSteps entry rather than folded into the
    // cookie step, specifically so the guarded loop below keeps treating the
    // two independently — one failing must never take the other down, which is
    // the entire reason that loop exists. The window this capability opens is
    // opened AND closed entirely inside the Rust arm itself
    // (`humble_login_clear_storage`, Plan 15) — this call site never holds a
    // window handle of its own to leak.
    //
    // `clearAuthCache`/`clearHostResolverCache` have NO in-page JavaScript
    // equivalent — they are network-stack (HTTP auth / DNS resolver) caches,
    // not web storage, and no Tauri/wry API exposes them to injected JS. This
    // is DECLARED rather than silently dropped (T-34.4.1-73, STRIDE Repudiation,
    // accepted): the residual risk is a cached HTTP auth credential or a DNS
    // cache entry surviving a disconnect, and NEITHER carries a Humble session
    // — the actual F-6 harm (auto-signed-back-in re-login) is fully closed by
    // the cookie + storage steps above. `seamBranchParity.test.ts`'s DECLARED
    // check (Plan 16 Task 3) requires this exact paragraph to name both
    // categories and this threat ID before it will accept the classification.
    const seam = getLoginWindowSeam()
    let wipeSteps: Array<[string, () => Promise<unknown>]>
    if (seam === null) {
      const ses = session.fromPartition(HUMBLE_LOGIN_PARTITION)
      wipeSteps = [
        ['clearStorageData', async () => ses.clearStorageData()],
        ['clearCache', async () => ses.clearCache()],
        ['clearAuthCache', async () => ses.clearAuthCache()],
        ['clearHostResolverCache', async () => ses.clearHostResolverCache()],
        ['clearData', async () => ses.clearData()]
      ]
    } else {
      wipeSteps = [
        [
          'clearHumbleCookies',
          async () => {
            const label = await seam.open(HUMBLE_BASE_URL, {
              visible: false,
              userAgent: standardBrowserUserAgent()
            })
            try {
              const deleted = await seam.clearCookies(label, 'humblebundle.com')
              // Only the COUNT is logged — never a cookie name, domain, or
              // value (T-34.4.1-34, the removed-getFullCookieHeader discipline
              // this file already enforces elsewhere).
              logInfo(
                `Humble disconnect: cleared ${deleted} humblebundle.com cookie(s)`,
                LogPrefix.Backend
              )
            } finally {
              // Closed unconditionally — even when clearCookies rejects —
              // so a failed clear never leaks the hidden window.
              await seam.close(label).catch((err) => {
                logWarning(
                  [
                    'Humble disconnect: cookie-clear window close failed (non-fatal):',
                    err
                  ],
                  LogPrefix.Backend
                )
              })
            }
          }
        ],
        [
          'clearHumbleStorage',
          async () => {
            // Plan 15's clearStorage() opens and closes its OWN hidden window
            // inside the Rust arm (humble_login_clear_storage) — no label is
            // needed or returned here, unlike the cookie step above.
            const report = await seam.clearStorage(
              HUMBLE_BASE_URL,
              standardBrowserUserAgent()
            )
            // Only COUNTS are logged — never a storage key or value
            // (T-34.4.1-34 discipline, same as the cookie step above).
            logInfo(
              `Humble disconnect: cleared storage — localStorage=${report.localStorage}, ` +
                `sessionStorage=${report.sessionStorage}, indexedDB=${report.indexedDB}, ` +
                `caches=${report.caches}, serviceWorkers=${report.serviceWorkers}`,
              LogPrefix.Backend
            )
          }
        ]
      ]
    }
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
    // D-04/D-30/D-42/D-43/D-59: deliberately does NOT touch
    // humbleRevealedStore, humbleOwnershipOverrideStore, or
    // humbleGiftedAtStore (or the future audit log). All three stores now
    // exist (Phase 11/12/13) and MUST survive a disconnect/reconnect cycle
    // — clearing humbleRevealedStore here would regress a previously-revealed
    // key back to UNREVEALED (Pitfall 1), permanently forfeiting its
    // gift-link opportunity; clearing humbleOwnershipOverrideStore would
    // silently drop a user's "Not the same game" correction, re-blocking a
    // future claim (e.g. Phase 14's C2 protection); and clearing
    // humbleGiftedAtStore would silently drop the double-gift guard, letting
    // an already-gifted key be gifted again — none of these are tied to the
    // actual disconnect action. Extend this policy for Phase 14's audit log
    // the same way; never delete this exclusion.
  }
}
