/**
 * The login-window seam's install (Phase 94 Plan 04, D-03): the `rustInvoke`-backed
 * `LoginWindowSeam` and the one call site of the slot's `install()` in the repo (T-34.4.1-10).
 *
 * Moved verbatim out of `humbleLoginFlowRegistration.ts` (Phase 34.4.1 Plan 02, D-01/D-02/D-04/
 * D-07/D-08, REQ-34.4.1-02/-13). A scheduled survivor, deleted by Phase 92: the GOG, Epic and
 * Amazon sign-in flows still drive the seam until the last OAuth flows port in 92, while the
 * Humble login registration beside it goes with the Humble TypeScript in 94. The install must not
 * die with the Humble registration, so it lives here, in a registration of its own that
 * `handlers.ts` calls before any registration that reads the slot (T-94-07).
 *
 * The channel names (`RUST_HUMBLE_LOGIN_*`, `RUST_HUMBLE_REVEAL_POST`) and the argument shapes are
 * unchanged.
 *
 * D-08 (Assumption A4 smoke hook, see the bottom of `registerLoginWindowSeam()`): env-gated,
 * `GAMELIB_LOGIN_SEAM_SMOKE=1` only, inert by default, exercises `WebviewWindowBuilder::build()`
 * off the main thread at the earliest point in the phase this is possible.
 */

import type { RequestRustInvoke } from '../host'
import {
  RUST_HUMBLE_LOGIN_OPEN,
  RUST_HUMBLE_LOGIN_COOKIES,
  RUST_HUMBLE_LOGIN_COOKIES_FOR_DOMAIN,
  RUST_HUMBLE_LOGIN_TAKE_EVENTS,
  RUST_HUMBLE_LOGIN_CLOSE,
  RUST_HUMBLE_LOGIN_CLEAR_COOKIES,
  RUST_HUMBLE_REVEAL_POST,
  RUST_HUMBLE_LOGIN_CLEAR_STORAGE
} from '../../common/types/sidecarTransport'
import type { AppInfo } from '../process/context'
import { standardBrowserUserAgent } from '../humble/userAgent'
import {
  type LoginWindowSeam,
  type LoginWindowSeamSlot,
  type LoginWindowCookie,
  type LoginWindowCookieRead,
  type LoginWindowNavEvent,
  type StorageClearCategoryResult,
  type LoginWindowStorageClearResult
} from '../login/loginWindowSeam'
import { logInfo, logWarning, LogPrefix } from '../logger'

/** Coerces one raw cookie entry from a `humble_login_cookies` response into `LoginWindowCookie`. */
function coerceCookie(raw: unknown): LoginWindowCookie {
  const entry = raw as {
    name?: unknown
    domain?: unknown
    value?: unknown
  } | null
  return {
    name: typeof entry?.name === 'string' ? entry.name : '',
    domain: typeof entry?.domain === 'string' ? entry.domain : null,
    value: typeof entry?.value === 'string' ? entry.value : ''
  }
}

/**
 * Coerces one raw navigation event from a `humble_login_take_events` response.
 *
 * Quick task 260803-eee Task 5: `'closed'` was ADDED to this allow-list alongside `'started'`/
 * `'finished'`. Before this change, an unrecognized `event` value defaulted to `'finished'` --
 * which would have silently swallowed a real window-close signal from Rust into a bogus,
 * non-matching nav event (its `url` would still coerce to `''`, so `matchOAuthRedirect` would
 * just return null and the close would vanish with no trace). This IS the layer the developer's
 * evidence pointed at: `oauthLoginCapture.ts`'s cancel-detection logic can only be as correct as
 * this allow-list lets a `'closed'` event actually reach it.
 */
function coerceNavEvent(raw: unknown): LoginWindowNavEvent {
  const entry = raw as { event?: unknown; url?: unknown } | null
  const event =
    entry?.event === 'started' ||
    entry?.event === 'finished' ||
    entry?.event === 'closed'
      ? entry.event
      : 'finished'
  return {
    event,
    url: typeof entry?.url === 'string' ? entry.url : ''
  }
}

/**
 * Coerces one category value from a `humble_login_clear_storage` response (Phase 34.4.1 Plan
 * 15, F-6 BLOCKING, T-34.4.1-67). A finite number or the literal string `'unsupported'` pass
 * through unchanged; anything else (missing key, boolean, non-finite number, arbitrary string)
 * is a malformed response and THROWS -- never silently coerced to `0`, which would recreate
 * F-6's exact failure mode one layer down (see `createRustLoginWindowSeam`'s own doc comment).
 */
function coerceStorageClearCategory(raw: unknown): StorageClearCategoryResult {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw
  }
  if (raw === 'unsupported') {
    return 'unsupported'
  }
  throw new Error(
    `humble_login_clear_storage: malformed category value (expected a finite number or 'unsupported'): ${JSON.stringify(raw)}`
  )
}

/**
 * Constructs the `rustInvoke`-backed `LoginWindowSeam` implementation. Every method coerces the
 * response into the declared return type and THROWS a descriptive Error on a malformed shape --
 * this is load-bearing, not defensive: `classifyCookieRead` (`loginWindowSeam.ts`) must see
 * `total: null` (the `UNSUPPORTED_OR_ERROR` verdict) rather than a silently coerced zero, or a dead
 * cookie API would misreport as `SUPPORTED_BUT_EMPTY`/`UNDECIDABLE` and defeat the whole point of
 * the discriminator (REQ-34.4.1-13). `cookies()` in particular must never coerce a missing/
 * non-numeric `total` to 0 -- conflating "the read threw" with "the jar is empty" recreates exactly
 * the failure this phase exists to prevent.
 */
export function createRustLoginWindowSeam(
  requestRustInvoke: RequestRustInvoke
): LoginWindowSeam {
  return {
    async open(url, options) {
      const result = await requestRustInvoke(RUST_HUMBLE_LOGIN_OPEN, [
        url,
        options.visible,
        options.userAgent
      ])
      if (typeof result !== 'string' || result.length === 0) {
        throw new Error(
          `humble_login_open: malformed response (expected a non-empty string label): ${JSON.stringify(result)}`
        )
      }
      return result
    },

    async cookies(label, host, names) {
      const result = await requestRustInvoke(RUST_HUMBLE_LOGIN_COOKIES, [
        label,
        host,
        names
      ])
      const record = result as { total?: unknown; matched?: unknown } | null
      if (
        !record ||
        typeof record.total !== 'number' ||
        !Array.isArray(record.matched)
      ) {
        throw new Error(
          `humble_login_cookies: malformed response (missing/non-numeric total, or non-array matched): ${JSON.stringify(result)}`
        )
      }
      const read: LoginWindowCookieRead = {
        total: record.total,
        matched: record.matched.map(coerceCookie)
      }
      return read
    },

    // Phase 34.4.1 Plan 22 (F-6 Defect A, REQ-34.4.1-GAP-07): the correctly-directed cookie
    // read `cookies()` above cannot answer -- see this method's own interface docstring
    // (`loginWindowSeam.ts`) for why the two are not interchangeable. Same malformed-response
    // guard as `cookies()`, deliberately: a missing/non-numeric `total` here would recreate
    // F-6's exact silent-degradation shape one layer down.
    async cookiesForDomain(label, domain, names) {
      const result = await requestRustInvoke(
        RUST_HUMBLE_LOGIN_COOKIES_FOR_DOMAIN,
        [label, domain, names]
      )
      const record = result as { total?: unknown; matched?: unknown } | null
      if (
        !record ||
        typeof record.total !== 'number' ||
        !Array.isArray(record.matched)
      ) {
        throw new Error(
          `humble_login_cookies_for_domain: malformed response (missing/non-numeric total, or non-array matched): ${JSON.stringify(result)}`
        )
      }
      const read: LoginWindowCookieRead = {
        total: record.total,
        matched: record.matched.map(coerceCookie)
      }
      return read
    },

    async takeEvents(label) {
      const result = await requestRustInvoke(RUST_HUMBLE_LOGIN_TAKE_EVENTS, [
        label
      ])
      if (!Array.isArray(result)) {
        throw new Error(
          `humble_login_take_events: malformed response (expected an array): ${JSON.stringify(result)}`
        )
      }
      return result.map(coerceNavEvent)
    },

    async close(label) {
      const result = await requestRustInvoke(RUST_HUMBLE_LOGIN_CLOSE, [label])
      if (typeof result !== 'boolean') {
        throw new Error(
          `humble_login_close: malformed response (expected a boolean): ${JSON.stringify(result)}`
        )
      }
      return result
    },

    async clearCookies(label, domain) {
      const result = await requestRustInvoke(RUST_HUMBLE_LOGIN_CLEAR_COOKIES, [
        label,
        domain
      ])
      if (typeof result !== 'number') {
        throw new Error(
          `humble_login_clear_cookies: malformed response (expected a number): ${JSON.stringify(result)}`
        )
      }
      return result
    },

    // Phase 34.4.1 Plan 04 (D-07/D-08, REQ-34.4.1-05): `humblePostRequest`'s ONE Tauri
    // transport branch. `csrfToken` crosses the wire as `null` (never `undefined`, which JSON
    // cannot represent) when absent -- the Rust arm's own `reveal_post_args` maps a missing
    // arg AND an explicit `null` to the same `None`, so either shape round-trips correctly.
    // `status`/`body` are load-bearing, not defensive, exactly like every other coercion in
    // this seam (see this function's own doc comment above): a malformed shape here must
    // throw, never silently coerce a missing status/body into a value the caller's
    // 2xx/non-2xx branch could misclassify.
    async revealPost(input) {
      const result = await requestRustInvoke(RUST_HUMBLE_REVEAL_POST, [
        input.originUrl,
        input.path,
        input.body,
        input.csrfToken ?? null,
        input.userAgent
      ])
      const record = result as { status?: unknown; body?: unknown } | null
      if (
        !record ||
        typeof record.status !== 'number' ||
        typeof record.body !== 'string'
      ) {
        throw new Error(
          `humble_reveal_post: malformed response (missing/non-numeric status, or non-string body): ${JSON.stringify(result)}`
        )
      }
      return { status: record.status, body: record.body }
    },

    // 34.4.1 gap cycle plan 15 (F-6 BLOCKING, D-08/Pitfall 3, T-34.4.1-66/-67/-70,
    // REQ-34.4.1-06/REQ-34.4.1-GAP-03): NOT yet called anywhere -- plan 16 wires this into the
    // two disconnect paths. Unlike every other method on this seam, this one's rejection is
    // deliberately propagated, not swallowed here -- plan 16's guarded `wipeSteps` entry owns
    // that swallow. A seam method that faked success on a structural failure would recreate
    // F-6's exact failure mode (disconnect silently not disconnecting) one layer down.
    async clearStorage(originUrl, userAgent) {
      const result = await requestRustInvoke(RUST_HUMBLE_LOGIN_CLEAR_STORAGE, [
        originUrl,
        userAgent
      ])
      const record = result as Record<string, unknown> | null
      if (!record || typeof record !== 'object') {
        throw new Error(
          `humble_login_clear_storage: malformed response (expected an object): ${JSON.stringify(result)}`
        )
      }
      const report: LoginWindowStorageClearResult = {
        localStorage: coerceStorageClearCategory(record.localStorage),
        sessionStorage: coerceStorageClearCategory(record.sessionStorage),
        indexedDB: coerceStorageClearCategory(record.indexedDB),
        caches: coerceStorageClearCategory(record.caches),
        serviceWorkers: coerceStorageClearCategory(record.serviceWorkers)
      }
      return report
    }
  }
}

/**
 * Installs the rustInvoke-backed login-window seam into the boot's slot. Called once from
 * `handlers.ts` (module scope), before every registration that reads the slot -- the OAuth,
 * runner-auth, dev Epic sweep and Humble login registrations. This module owns no side effects at
 * import time beyond the imports above; the caller decides when registration happens.
 */
export function registerLoginWindowSeam(
  loginWindowSeam: Pick<LoginWindowSeamSlot, 'install' | 'get'>,
  requestRustInvoke: RequestRustInvoke,
  appInfo: Pick<AppInfo, 'userAgentFallback'>
): void {
  // T-34.4.1-10: the ONE call site in the repo.
  loginWindowSeam.install(createRustLoginWindowSeam(requestRustInvoke))

  // ── Assumption A4 smoke hook (Task 4, blocking checkpoint) ─────────────────────────────────
  //
  // Inert unless GAMELIB_LOGIN_SEAM_SMOKE is exactly '1'. Fires exactly once at sidecar startup:
  // opens one WebviewWindow on https://example.com (deliberate: no vendor, no cookies, no
  // credentials) through this module's own seam, waits ~2s, closes it. Exercises
  // WebviewWindowBuilder::build() on a thread::spawn'd rustInvoke worker at the earliest point in
  // the phase this is possible (RESEARCH.md Assumptions Log A4). Keep this permanently -- it is
  // the cheapest reproduction harness for any future window-construction regression. Try/catch
  // wraps the whole hook so it can never affect a normal boot.
  if (process.env.GAMELIB_LOGIN_SEAM_SMOKE === '1') {
    // Deferred by one macrotask, and that placement is load-bearing (34.4.1-02 Task 4).
    //
    // `registerLoginWindowSeam()` runs at MODULE-IMPORT time: `bootstrap.ts` line 40 does a
    // static `import './handlers'`, and `handlers.ts` calls this function at its own module
    // scope. But the sidecar's file logger is not constructed until `initLogger()` inside
    // `bootstrap.ts`'s `init()` (line 133), which `sidecar/index.ts` calls only AFTER every
    // static import has been evaluated. So at this function's module-scope moment,
    // `heroicLogWriter` is still `undefined` and ANY `logInfo`/`logWarning` call here throws
    // `TypeError: Cannot read properties of undefined`. Inside an async IIFE that throw becomes
    // an unhandled rejection, which is swallowed — the gate then produces a booted app and zero
    // evidence in either direction, which is precisely how its first two runs were lost.
    //
    // `init()` is synchronous (`: void`) and calls `initLogger()` as its first statement, so a
    // single `setTimeout(0)` is sufficient and does not race: the whole synchronous
    // import-then-`init()` sequence has completed before this callback fires.
    setTimeout(() => {
      void (async () => {
        // Every branch logs, including both early exits, so "no output" can never again be
        // mistaken for "not run". `smokeLog` additionally falls back to stderr if the logger is
        // somehow still unavailable, so this gate can never be blackholed by its own logging.
        const smokeLog = (message: string, warn = false): void => {
          const line = `[loginSeamRegistration] GAMELIB_LOGIN_SEAM_SMOKE: ${message}`
          try {
            if (warn) {
              logWarning(line, LogPrefix.Backend)
            } else {
              logInfo(line, LogPrefix.Backend)
            }
          } catch {
            process.stderr.write(`${line}\n`)
          }
        }
        smokeLog('starting')
        try {
          const seam = loginWindowSeam.get()
          if (!seam) {
            smokeLog(
              'no seam installed — aborting (this is a FAIL, not a skip)',
              true
            )
            return
          }
          const label = await seam.open('https://example.com', {
            visible: true,
            userAgent: standardBrowserUserAgent({ appInfo })
          })
          smokeLog(`opened label=${label}`)
          await new Promise((resolve) => setTimeout(resolve, 2000))
          const closed = await seam.close(label)
          smokeLog(`closed=${closed}`)
        } catch (error) {
          smokeLog(
            `failed: ${error instanceof Error ? error.message : String(error)}`,
            true
          )
        }
      })()
    }, 0)
  }
}
