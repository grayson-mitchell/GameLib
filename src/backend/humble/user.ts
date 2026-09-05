import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'

import {
  configStore,
  humbleLibraryStore,
  humbleSyncStore
} from './electronStores'
import { HUMBLE_BASE_URL, HUMBLE_LOGIN_URL } from './constants'
import { getGamekeys } from './adapter'
import { invalidateSyncGeneration } from './syncFence'
import { HumbleUserData } from 'common/types/humble'
import { standardBrowserUserAgent } from './userAgent'
import {
  getLoginWindowSeamOrThrow,
  classifyCookieRead,
  type CookieReadVerdict
} from './loginWindowSeam'
import { getHumbleSecretStore, type HumbleSecretKey } from './secretStore'

// Re-exported so existing callers (user.test.ts, plus the D-08
// GAMELIB_LOGIN_SEAM_SMOKE hook in humbleLoginFlowRegistration.ts) are
// unaffected by the round-6 move into its own module (see userAgent.ts's doc
// comment for why the move was needed). The `humbleGetLoginUserAgent` IPC
// handler that used to call this via ipc_handler.ts was removed by Phase 40
// Plan 03 (D-11) after a four-surface sweep found zero remaining callers.
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
// Exported (Phase 34.4.1 Plan 18, F-2) so a test can pin the value directly
// rather than re-deriving it — a later "tidy" of the logging fix in this same
// file must never alter timing under cover of that change.
export const COOKIE_POLL_INTERVAL_MS = 1500

// Poll-path validation throttle: a cookie VALUE that was just rejected is not
// re-validated by the poll more often than this. Deliberately NOT a
// permanent blacklist — Humble may keep the same value across the
// anonymous → authenticated transition — and a forced re-validation (D-17,
// relayed from the webview's navigation events) bypasses the throttle
// entirely (see watchForLogin). Exported for the same pinning reason as
// COOKIE_POLL_INTERVAL_MS above.
export const VALIDATION_THROTTLE_MS = 3000

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

// F-2 fix (Phase 34.4.1 Plan 18): low-frequency liveness heartbeat for the
// rejection-log collapse in watchForLogin()'s logRejectionStatus(). Elapsed-
// time based (not iteration-count based) so it stays meaningful if
// COOKIE_POLL_INTERVAL_MS's cadence ever changes. This is a NEW constant,
// added alongside the three above rather than replacing any of them — none
// of COOKIE_POLL_INTERVAL_MS/VALIDATION_THROTTLE_MS/LOGIN_WATCH_TIMEOUT_MS
// change value because of this fix.
const LOGIN_WATCH_LIVENESS_LOG_INTERVAL_MS = 30_000

// `'cancelled'` (quick task 260808-gl6) is the DELIBERATE-user-close outcome, kept
// distinct from `'error'` on purpose: `'error'` still means the watch could not
// continue (the UNDECIDABLE / UNSUPPORTED_OR_ERROR cookie-read verdicts below), and
// its frontend surface — the failure panel with a Retry button — must stay reachable
// for exactly those. A user who closes the sign-in window has not hit a failure and
// must not be shown one; the renderer navigates back to Manage Accounts instead.
type LoginResult = {
  status: 'done' | 'waiting' | 'error' | 'cancelled'
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
  configStore.set(
    'encryptionDegraded',
    !(await store.isAvailable('store-humble-secret'))
  )
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
  // never self-heals. Electron used to read the live partition cookie at
  // reveal time to close that gap; under the single Tauri-seam build there
  // is no live login window at reveal time to read through (the login watch
  // already settled and closed its window, T-34.4.1-18), so this always
  // returns the stored snapshot instead (Phase 39 Plan 05 collapse — the
  // live per-partition session read this comment used to describe is gone).
  // Main-process-only, same secrecy discipline as getCsrfToken(): the value
  // must NEVER be logged or included in any sendFrontendMessage payload.
  static async getLiveCsrfToken(): Promise<string | undefined> {
    // Requires the login-window seam to be installed — see
    // getLoginWindowSeamOrThrow()'s own doc comment. The returned seam is
    // not otherwise used here: there is no live login window at reveal time
    // to read through, so this always falls straight through to the stored
    // snapshot.
    getLoginWindowSeamOrThrow()
    logInfo(
      'Humble live csrf read: no live login window at reveal time — using stored snapshot',
      LogPrefix.Backend
    )
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

    // D-01/D-02 (Phase 34.4.1 Plan 03): there is no per-partition Electron
    // session shape under the Tauri sidecar (tauri-login-webview-cookies.md §
    // "Requirements" #7), so a seam is installed at sidecar startup and
    // drives a real Rust-owned login window instead. getLoginWindowSeamOrThrow()
    // enforces that precondition — if registerHumbleLoginFlows() has not yet
    // run, this throws rather than silently falling back to a dead path.
    const seam = getLoginWindowSeamOrThrow()

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

      // F-2 fix (Phase 34.4.1 Plan 18): the live gate found ~37 identical
      // "rejected candidate session" warnings over ~2.5 minutes for one
      // functionally-correct wait (one per throttled poll tick) — noisy, but
      // adjacent in shape to a genuinely wedged watch. logRejectionStatus()
      // collapses consecutive identical-status rejections to ONE line, logs
      // again on any status CHANGE (a transition is information and must
      // never be suppressed), and reports how many were suppressed since the
      // last line so no information is lost. A low-frequency, elapsed-time
      // liveness heartbeat (LOGIN_WATCH_LIVENESS_LOG_INTERVAL_MS) still fires
      // during a long unchanged wait, so the fix for "too noisy" cannot
      // create "silently wedged" — the strictly worse failure mode this gate
      // exists to catch. None of the poll cadence, validation throttle, or
      // deadline (and its navigation re-arm) are touched by this function.
      let lastLoggedRejectionStatus: string | null = null
      let suppressedSinceLastRejectionLog = 0
      let lastRejectionLogAt = 0

      // F-34.4.2-19 fix: the SUPPORTED_NONEMPTY branch's `if (!match) return`
      // (below, in checkCookie) previously had NO logging on its path at
      // all — the jar was live (total > 0) but `_simpleauth_sess` was never
      // present in the filtered `matched` set (e.g. the poll-direction
      // domain-match defect this same finding fixed elsewhere), and this
      // function returned in total silence, tick after tick, forever. The
      // liveness heartbeat above (`logRejectionStatus`) cannot help here — it
      // is only reachable AFTER `cookieValue` is assigned, which this path
      // never does. Mirrors `logRejectionStatus`'s own noise-reduction
      // shape (F-2, Phase 34.4.1 Plan 18) so this fix cannot re-introduce
      // the "one identical warning per throttled poll tick" noise problem
      // that fix was written to solve: log on the first tick, then only
      // every LOGIN_WATCH_LIVENESS_LOG_INTERVAL_MS thereafter while the
      // condition persists unchanged, reporting how many ticks were
      // suppressed so no information is lost. Counts only — `total` (the
      // unfiltered cookie count) and `matchedCount` (the filtered set's
      // size) — NEVER a cookie name or value.
      let lastCandidateNotFoundLogAt = 0
      let suppressedSinceLastCandidateNotFoundLog = 0

      function logCandidateNotFoundStatus(total: number, matchedCount: number) {
        const now = Date.now()
        if (
          lastCandidateNotFoundLogAt === 0 ||
          now - lastCandidateNotFoundLogAt >=
            LOGIN_WATCH_LIVENESS_LOG_INTERVAL_MS
        ) {
          logWarning(
            suppressedSinceLastCandidateNotFoundLog > 0
              ? [
                  `Humble login-window cookie jar is live but _simpleauth_sess was not found in the filtered set (status unchanged; ${suppressedSinceLastCandidateNotFoundLog} prior identical tick(s) suppressed):`,
                  `total=${total} matchedCount=${matchedCount}`
                ]
              : [
                  'Humble login-window cookie jar is live but _simpleauth_sess was not found in the filtered set:',
                  `total=${total} matchedCount=${matchedCount}`
                ],
            LogPrefix.Backend
          )
          lastCandidateNotFoundLogAt = now
          suppressedSinceLastCandidateNotFoundLog = 0
          return
        }
        suppressedSinceLastCandidateNotFoundLog += 1
      }

      function logRejectionStatus(status: string) {
        const now = Date.now()
        if (status !== lastLoggedRejectionStatus) {
          logWarning(
            suppressedSinceLastRejectionLog > 0
              ? [
                  `Humble login validation rejected candidate session (status changed; ${suppressedSinceLastRejectionLog} prior identical rejection(s) suppressed):`,
                  status
                ]
              : ['Humble login validation rejected candidate session:', status],
            LogPrefix.Backend
          )
          lastLoggedRejectionStatus = status
          suppressedSinceLastRejectionLog = 0
          lastRejectionLogAt = now
          return
        }
        if (now - lastRejectionLogAt >= LOGIN_WATCH_LIVENESS_LOG_INTERVAL_MS) {
          logWarning(
            [
              `Humble login still waiting (status unchanged; ${suppressedSinceLastRejectionLog} rejection(s) suppressed since the last line):`,
              status
            ],
            LogPrefix.Backend
          )
          suppressedSinceLastRejectionLog = 0
          lastRejectionLogAt = now
          return
        }
        suppressedSinceLastRejectionLog += 1
      }

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
        if (seamLabel !== null) {
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

          {
            if (seamLabel === null) return // window not open yet

            // REQ-34.4.1-03: drain main-frame-only nav events (Rust's
            // on_page_load hook, never on_navigation — a third-party ad
            // iframe must never re-arm this deadline) BEFORE the cookie read
            // on every tick. A 'finished' event re-arms the deadline and
            // forces this tick's read to bypass the throttle — the same
            // signal notifyLoginNavigated()'s forceRevalidate() relays today.
            //
            // F-34.4.2-19 fix: `'closed'` (pushed by main.rs's
            // `WindowEvent::Destroyed` handler on EVERY window this arm
            // builds, per that handler's own doc comment) used to be pushed
            // onto this SAME queue and never consumed — the poll only ever
            // discovered a closed window one tick later, indirectly, via the
            // NEXT `seam.cookies()` call throwing `humble_login:no-window:*`
            // (classified UNSUPPORTED_OR_ERROR below). Consuming it directly
            // here turns that one-tick-late, stringly-typed inference into
            // an immediate, explicit settle — the window is gone, so there
            // is nothing left to read. Not a race with this watch's OWN
            // programmatic close (`settle()`'s `seam.close()` call): by the
            // time that close happens `settled` is already `true`, so the
            // `if (settled || validationInFlight) return` guard immediately
            // below this block is what makes a self-triggered `'closed'`
            // harmless, not this check.
            //
            // Quick task 260808-gl6: this settles `'cancelled'`, NOT `'error'`. The
            // `WindowEvent::Destroyed` hook that pushes this event fires for a user
            // closing the window just as it does for any other teardown, and closing
            // the sign-in window is the ordinary way to back out of signing in — it is
            // a cancel, not a failure, and the renderer must not show a failure panel
            // for it. The two genuine-failure settles further below (UNDECIDABLE /
            // UNSUPPORTED_OR_ERROR) keep `'error'` and keep that panel.
            try {
              const events = await seam.takeEvents(seamLabel)
              if (events.some((event) => event.event === 'closed')) {
                logInfo(
                  `Humble login window ${seamLabel} closed before login completed — cancelling watch`,
                  LogPrefix.Backend
                )
                settle({ status: 'cancelled' })
                return
              }
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
            let matched: Array<{
              name: string
              domain: string | null
              value: string
            }> = []
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
            if (!match) {
              logCandidateNotFoundStatus(total ?? 0, matched.length)
              return
            }
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
              seamLabel,
              logRejectionStatus
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

      // Open the Rust-owned login window with the standard Chrome UA
      // (tauri-login-webview-cookies.md § "Why the UA is mandatory"). The
      // window must stay open for the whole poll — closing it destroys the
      // cookie handle even though the cookies survive (spike 015) — and is
      // closed exactly once, inside settle() above.
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
    })
  }

  private static async finishLogin(
    cookieValue: string,
    settle: (result: LoginResult) => void,
    isSettled: () => boolean,
    seamLabel: string | null,
    onRejected: (status: string) => void
  ): Promise<'done' | 'rejected' | 'transient'> {
    // NEVER pass cookieValue to a logger, or store it under any key other
    // than the encrypted+prefixed sessionCookie value (Pitfall 4 / T-10-05).
    // Passing the raw value to getGamekeys is fine — the
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
      // across anonymous → authenticated). Status-only (never the cookie
      // value) — logging itself is delegated to the caller's
      // logRejectionStatus() (F-2 fix, Phase 34.4.1 Plan 18), which collapses
      // consecutive identical-status rejections instead of logging every one.
      onRejected(gamekeys.status)
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
      const seam = getLoginWindowSeamOrThrow()
      if (seamLabel !== null) {
        // Read csrf_cookie from the SAME live login window whose
        // _simpleauth_sess candidate was just accepted — cookie-jar identity
        // matters here, so this must come from that specific window, not any
        // other seam-driven read.
        const csrfRead = await seam.cookies(seamLabel, 'www.humblebundle.com', [
          'csrf_cookie'
        ])
        const match = csrfRead.matched.find((c) => c.name === 'csrf_cookie')
        if (match && match.value) {
          await storeHumbleSecret('csrfToken', match.value)
        }
      }
    } catch (err) {
      logWarning(
        ['Humble csrf_cookie capture failed (non-fatal, optional):', err],
        LogPrefix.Backend
      )
    }

    // D-02: the tile shows a generic "Connected" label, never a username.
    // A best-effort post-login account-identity fetch used to run here and set
    // `username`. Removed by quick-260905-qjf: `/api/v1/user/info` is not a
    // route on Humble's API and never has been — 404 (hard failure, every
    // attempt) at Phase 10, re-confirmed live on 2026-09-05 against a session
    // proven live by a 200 on the sibling `/api/v1/user/order`. It never once
    // resolved `ok`, so `username` was ALWAYS undefined and `userData` was
    // never written; the removal is behaviour-preserving. The field is kept
    // explicit rather than dropped from the payloads below so a reader learns
    // WHY it is never populated. GlobalState converges on `isLoggedIn`, not
    // `username` (10-VALIDATION.md Fix 2).
    const username: string | undefined = undefined

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
        [
          'Humble startup health check failed (transient, health unknown):',
          err
        ],
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
      // S-09 (Phase 34.4.1 Plan 18 gap-cycle closure, D-GAP-03) / Phase 39
      // Plan 05 collapse: this backfill opens a temporary HIDDEN window
      // through the login-window seam -- the same shape disconnect()'s
      // clearHumbleCookies wipe step uses -- reads csrf_cookie through it,
      // and closes it in a `finally` so no path (success, rejection, or a
      // thrown open()) ever leaves it open. There is no LIVE login window
      // during a health check (unlike finishLogin's own csrf capture, which
      // runs during an active login), so a temporary one is the only way to
      // reach the jar. Best-effort/non-fatal, mirrors finishLogin's own
      // capture exactly: never blocks the health check, never logs the
      // value.
      const seam = getLoginWindowSeamOrThrow()
      let label: string | null = null
      try {
        label = await seam.open(HUMBLE_BASE_URL, {
          visible: false,
          userAgent: standardBrowserUserAgent()
        })
        const csrfRead = await seam.cookies(label, 'www.humblebundle.com', [
          'csrf_cookie'
        ])
        const match = csrfRead.matched.find((c) => c.name === 'csrf_cookie')
        if (match && match.value) {
          await storeHumbleSecret('csrfToken', match.value)
        }
      } catch (err) {
        logWarning(
          ['Humble csrf_cookie backfill failed (non-fatal, optional):', err],
          LogPrefix.Backend
        )
      } finally {
        if (label !== null) {
          const labelToClose = label
          await seam.close(labelToClose).catch((closeErr) => {
            logWarning(
              [
                'Humble csrf_cookie backfill window close failed (non-fatal):',
                closeErr
              ],
              LogPrefix.Backend
            )
          })
        }
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
    // Phase 34.4.1 Plans 06/16 (D-08, closes 34.4 D-05's declared partial; F-6
    // BLOCKING closure): the login cookies live in the sidecar's app-wide
    // webview jar, which is only reachable through a live webview handle
    // (tauri-login-webview-cookies.md § "Persistence and isolation"). A
    // single 'clearHumbleCookies' step opens a HIDDEN window (no visible UI
    // flash on disconnect), clears ONLY humblebundle.com cookies through the
    // domain-scoped Rust arm (T-34.4.1-30 — the jar holds Epic/GOG/Amazon
    // cookies too since Phase 34.5, so a blanket wipe would sign the user out
    // of storefronts they never touched), and closes the window in a
    // `finally` so no path — success, rejection, or a thrown open() — ever
    // leaves it open.
    //
    // A second, INDEPENDENT 'clearHumbleStorage' step calls Plan 15's
    // `seam.clearStorage(HUMBLE_BASE_URL, ...)`, which clears localStorage,
    // sessionStorage, IndexedDB, Cache Storage and service-worker registrations
    // for Humble's own origin only — same-origin policy scopes it structurally,
    // the same discipline `clearCookies`'s domain-suffix filter already
    // achieves for cookies (T-34.4.1-66). It is a SEPARATE wipeSteps entry
    // rather than folded into the cookie step, specifically so the guarded
    // loop below keeps treating the two independently — one failing must
    // never take the other down, which is the entire reason that loop
    // exists. The window this capability opens is opened AND closed entirely
    // inside the Rust arm itself (`humble_login_clear_storage`, Plan 15) —
    // this call site never holds a window handle of its own to leak.
    //
    // `clearAuthCache`/`clearHostResolverCache` have NO in-page JavaScript
    // equivalent — they are network-stack (HTTP auth / DNS resolver) caches,
    // not web storage, and no Tauri/wry API exposes them to injected JS. This
    // remains a DECLARED, standing residual limitation of this single wipe
    // path (T-34.4.1-73, STRIDE Repudiation, accepted) rather than a silent
    // drop: the residual risk is a cached HTTP auth credential or a DNS cache
    // entry surviving a disconnect, and NEITHER carries a Humble session —
    // the actual F-6 harm (auto-signed-back-in re-login) is fully closed by
    // the cookie + storage steps above. This paragraph naming both categories
    // and this threat ID is the durable record of that acceptance (see
    // Phase 39 Plan 04's SUMMARY for how the branch-comparison test that used
    // to validate it was dispositioned).
    const seam = getLoginWindowSeamOrThrow()
    const wipeSteps: Array<[string, () => Promise<unknown>]> = [
      [
        'clearHumbleCookies',
        async () => {
          const label = await seam.open(HUMBLE_BASE_URL, {
            visible: false,
            userAgent: standardBrowserUserAgent()
          })
          try {
            // Phase 34.4.1 gap-cycle plan 17 (F-5, item 3(b)): a paired
            // before/after jar census, taken INSIDE this step against the
            // SAME still-open window label the clear itself uses. F-7's
            // process lesson: a measurement scheduled AROUND an operation
            // cannot be reconstructed after the NEXT operation destroys its
            // "after" — so the paired reads live here, not in a later
            // diagnostic plan. The name filter is EMPTY (not just
            // '_simpleauth_sess') so `matched` counts every humblebundle.com
            // cookie — the domain-scope proof needs the whole Humble jar,
            // not one cookie. Only integers/fixed text are ever logged —
            // never a cookie name, domain, or value (T-34.4.1-34/-39,
            // T-34.4.1-75).
            //
            // Phase 34.4.1 Plan 22 (F-6 Defect A, REQ-34.4.1-GAP-07): this
            // call site previously read through the seam's OTHER cookie
            // method (the one `watchForLogin()`'s poll below correctly
            // keeps using) — the SAME page-host-first direction. That
            // direction is wrong here: with a FIXED apex
            // ('humblebundle.com') passed as the "host" argument,
            // `cookie_domain_matches`'s suffix branch can never fire, so it
            // only ever matched cookies whose domain attribute was the bare
            // string 'humblebundle.com' — every leading-dot- and
            // subdomain-scoped Humble cookie was silently excluded from
            // `matched`, and the three equalities below were being
            // evaluated against undercounted numbers (spike 016, live:
            // total=33, that direction=29, the correct direction=33 — see
            // `34.4.1-SPIKE-016-FINDINGS.md`). `cookiesForDomain` below asks
            // the correctly-directed question instead — the cookie's own
            // domain first, the fixed target second, mirroring
            // `clearCookies`'s own filter exactly.
            let everProvedLive = false
            interface Census {
              total: number | null
              matched: number
              verdict: CookieReadVerdict
            }
            const readCensus = async (): Promise<Census> => {
              try {
                const read = await seam.cookiesForDomain(
                  label,
                  'humblebundle.com',
                  []
                )
                if (read.total > 0) everProvedLive = true
                return {
                  total: read.total,
                  matched: read.matched.length,
                  verdict: classifyCookieRead({
                    total: read.total,
                    everProvedLive
                  })
                }
              } catch (err) {
                // A rejecting census read must NEVER block the clear or
                // throw out of disconnect() — the clear is the
                // user-visible operation; the census is evidence about it.
                logWarning(
                  [
                    'Humble disconnect: cookie census read failed (non-fatal, evidence unavailable for this side):',
                    err
                  ],
                  LogPrefix.Backend
                )
                return {
                  total: null,
                  matched: 0,
                  verdict: classifyCookieRead({ total: null, everProvedLive })
                }
              }
            }

            const before = await readCensus()
            const deleted = await seam.clearCookies(label, 'humblebundle.com')
            const after = await readCensus()

            const fmtSide = (c: Census) =>
              c.total === null
                ? 'total=unavailable, matched=unavailable, verdict=' + c.verdict
                : `total=${c.total}, matched=${c.matched}, verdict=${c.verdict}`
            const survivingNonHumble =
              after.total === null ? 'unavailable' : after.total - after.matched

            // The one census log line plan 20's gate greps for. Exact
            // format recorded verbatim in this plan's SUMMARY.
            logInfo(
              `Humble disconnect: cookie census before(${fmtSide(before)}) ` +
                `after(${fmtSide(after)}) deleted=${deleted} ` +
                `survivingNonHumble=${survivingNonHumble}`,
              LogPrefix.Backend
            )

            // Domain-scoped <=> M1 == 0 AND (T0 - T1) == M0 AND D == M0.
            // An UNDECIDABLE/unavailable side (either census read failed,
            // or the jar was never proven live) can never PASS this check —
            // it is reported as incomplete, never silently as a clean pass.
            if (before.total === null || after.total === null) {
              logWarning(
                'Humble disconnect: cookie census incomplete — domain-scope arithmetic cannot be verified (a census read was unavailable)',
                LogPrefix.Backend
              )
            } else {
              const failures: string[] = []
              if (after.matched !== 0) {
                failures.push(`matched-after=${after.matched} (expected 0)`)
              }
              const jarDelta = before.total - after.total
              if (jarDelta !== before.matched) {
                failures.push(
                  `jar shrank by ${jarDelta}, expected exactly matched-before=${before.matched}`
                )
              }
              if (deleted !== before.matched) {
                failures.push(
                  `deleted=${deleted}, expected matched-before=${before.matched}`
                )
              }
              if (failures.length > 0) {
                // A blanket wipe (or any other non-domain-scoped clear) must
                // be LOUD, never inferred later from an absent line.
                logWarning(
                  `Humble disconnect: cookie census discrepancy — clear may not have been domain-scoped: ${failures.join('; ')}`,
                  LogPrefix.Backend
                )
              }
            }

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
