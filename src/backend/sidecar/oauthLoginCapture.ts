/**
 * Pure per-runner OAuth redirect matcher + seam-driven capture driver (Phase 34.4.1 Plan 09,
 * D-04, REQ-34.4.1-08).
 *
 * This is the "wired" half of D-04's two-action decision ("the four get wired **and**
 * declared-blocked"). Plan 05 shipped the static declared-blocked surface
 * (`TauriLoginPanel.tsx`) naming the four unported backend channels; this module makes the
 * capture in front of that surface real: each of `legendary`/`gog`/`nile`/`zoom` opens a login
 * window through the SAME `LoginWindowSeam` Humble already drives (`backend/humble/
 * loginWindowSeam.ts`, plan 34.4.1-02), drains its `on_page_load`-sourced navigation events via
 * `takeEvents()`, and matches its own distinct redirect shape — never `login`/`authGOG`/
 * `authAmazon`/`authZoom` themselves, which stay unported until Phase 34.5 (SEAM Invariant B).
 *
 * `matchOAuthRedirect` is PURE (no seam, no timers, no I/O) so all four redirect shapes can be
 * proven by test independent of any capture-driving machinery — this IS the REQ-34.4.1-08
 * evidence the plan exists to produce.
 *
 * `captureOAuthLogin` mirrors `humble/user.ts`'s `watchForLogin()` deadline/poll/settle shape
 * (34.4.1-PATTERNS.md "Shared Patterns" 1/2/6), narrowed to this plan's needs: no cookie jar, no
 * liveness classifier (there is no anonymous-vs-authenticated ambiguity for an OAuth redirect —
 * the redirect URL itself is the signal), and a much shorter default deadline (five minutes vs
 * Humble's ten — an OAuth redirect is a single interaction, not an open-ended session watch).
 * `on_page_load`-sourced events only, drained via `takeEvents()` — no per-iframe navigation hook
 * is ever introduced here, because an ad iframe re-arming this deadline is exactly the failure
 * Pattern 6 forbids.
 *
 * Logging discipline (T-34.4.1-45, mirrors the cookie-value ban T-34.4.1-19): every `logInfo`/
 * `logWarning` call below carries only `runner`, `label`, `status`, a navigated page's `hostname`
 * (T-34.5-G6-11, plan 34.5-24 — never origin/pathname/search/href), or a diagnostic UA override's
 * `length` (T-34.5-G6-13) — never the captured `code`, `token`, or any `redirectUrl`/full `url`
 * value.
 */

import { getLoginWindowSeam } from '../humble/loginWindowSeam'
import { logInfo, logWarning, LogPrefix } from '../logger'
// Defined in common/types/ (not here) so common/types/ipc.ts's AsyncIPCFunctions.
// oauthCaptureLogin entry (Task 2) can reference both without common/ importing FROM
// backend/sidecar — the import direction is always common -> backend/frontend, never the
// reverse. Re-exported here so every existing caller of this module is unaffected.
import type { OAuthRunner, OAuthCaptureOutcome } from '../../common/types/oauthLogin'

export type { OAuthRunner, OAuthCaptureOutcome }

/** A single per-runner redirect match. `code` is `null` when the runner consumes the whole
 * redirect url rather than a single query param (reserved for a future runner shape — none of
 * the current four need it: all four resolve a non-null `code`). */
export interface OAuthRedirectMatch {
  code: string | null
  redirectUrl: string
}

// Reproduces `WebView/index.tsx` L229-237 exactly (the per-runner UA selection inside its
// `loadstop` handler), including Epic's distinct `EpicGamesLauncher` UA — read at plan-time off
// the live Electron source, not re-derived.
const USER_AGENTS: Record<OAuthRunner, string> = {
  legendary: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher',
  gog: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/200.0',
  nile: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/200.0',
  zoom: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/200.0'
}

// Half of Humble's LOGIN_WATCH_TIMEOUT_MS (ten minutes) — an OAuth redirect is a single,
// short-lived interaction, not an open-ended session watch.
const DEFAULT_DEADLINE_MS = 300_000
const DEFAULT_POLL_MS = 500

/**
 * DIAGNOSTIC seam (plan 34.5-24, F-34.5-G6-01 discriminator). Returns `USER_AGENTS[runner]`
 * unless `GAMELIB_OAUTH_UA_<RUNNER-UPPERCASED>` holds a non-empty, non-whitespace value, in which
 * case that value is used instead -- for that runner ONLY, every other runner's default is
 * unaffected. With the variable unset, empty, or whitespace-only, the return value is
 * byte-identical to the pre-existing `USER_AGENTS[runner]` lookup -- no behaviour change on the
 * default path.
 *
 * Why this exists rather than a source edit: plan 34.5-28 runs the same Epic login twice -- once
 * with Epic's stock `EpicGamesLauncher` agent, once with the Chrome-shaped agent GOG/Amazon
 * already use successfully -- and compares the two `nav host=` sequences this plan's Task 1 now
 * logs. Asking a developer to hand-edit and rebuild between the two arms would make the two arms
 * non-comparable (different binaries); an environment variable makes them one build, one variable.
 *
 * This is a DIAGNOSTIC-ONLY seam. Removing it later requires a live re-proof of whichever user
 * agent the discriminator (`34.5-G6-EPIC-DISCRIMINATOR.md`) selects as correct.
 */
export function resolveUserAgent(runner: OAuthRunner): string {
  const envVar = `GAMELIB_OAUTH_UA_${runner.toUpperCase()}`
  const override = process.env[envVar]
  if (override !== undefined && override.trim() !== '') {
    logInfo(
      `[oauthLoginCapture] runner=${runner} user-agent-override len=${override.length}`,
      LogPrefix.Backend
    )
    return override
  }
  return USER_AGENTS[runner]
}

/**
 * PURE. No seam, no timers, no logging of values. Parses `url` inside a try/catch that returns
 * `null` on a parse failure — a malformed url must never throw, for any runner.
 */
export function matchOAuthRedirect(
  runner: OAuthRunner,
  url: string
): OAuthRedirectMatch | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  switch (runner) {
    case 'legendary': {
      // WebView/index.tsx L268: `parsedUrl.hostname === 'localhost'` + a non-empty `code` param.
      if (parsed.hostname !== 'localhost') return null
      const code = parsed.searchParams.get('code')
      if (!code) return null
      return { code, redirectUrl: url }
    }
    case 'gog': {
      // Deliberate TIGHTENING of index.tsx L74's `gogEmbedRegExp`
      // (`new RegExp('https://embed.gog.com/on_login_success?')`), which treats the trailing
      // `?` as an optional preceding character and is an unanchored substring match — it would
      // match a url that merely CONTAINS that text anywhere, not just one whose host+path IS
      // embed.gog.com/on_login_success. This matcher requires both explicitly. The Electron
      // `<webview>` path keeps L74's original regex untouched — this tightening applies only to
      // this new capture path (T-34.4.1-44a).
      if (parsed.hostname !== 'embed.gog.com' || parsed.pathname !== '/on_login_success') {
        return null
      }
      const code = parsed.searchParams.get('code')
      if (!code) return null
      return { code, redirectUrl: url }
    }
    case 'nile': {
      // T-34.4.1-44b CLOSED for nile by this host check. Zoom's half of the same obligation is
      // VOID — D-02 drops zoom permanently, so no zoom code exists to anchor.
      //
      // `www.amazon.com` derives from upstream `imLinguin/nile`'s `openid.return_to` parameter
      // (`authorization.py`) — MEDIUM confidence (research Assumption A1) until live-gate item 3
      // confirms it against one real captured redirect. If that capture instead shows a
      // country-TLD variant (e.g. `amazon.co.uk`), the correct response is a documented suffix
      // match, NOT removing the anchor.
      if (parsed.hostname !== 'www.amazon.com') {
        if (parsed.searchParams.has('openid.oa2.authorization_code')) {
          // Sole automated evidence path for Assumption A1 — must survive until the live gate
          // records item 3. Origin ONLY: never the code, the full url, or parsed.search — a
          // captured authorization code is a credential (ASVS V5/V6).
          logWarning(
            `[oauthLoginCapture] runner=nile origin-mismatch origin=${parsed.origin}`,
            LogPrefix.Backend
          )
        }
        return null
      }
      const code = parsed.searchParams.get('openid.oa2.authorization_code')
      if (!code) return null
      return { code, redirectUrl: url }
    }
    case 'zoom': {
      // WebView/index.tsx L339 + L343: `li_token` present in the RESPONSE (never
      // `return_li_token=true`, which is a REQUEST param the login url itself carries) — and
      // `authZoom` takes the full redirect url, not the token value (`ipc.ts:240`), so
      // `redirectUrl` is what Task 3's hook actually forwards. Same host-free residual as `nile`
      // (T-34.4.1-44b) — the Electron original has no host constraint either.
      const token = parsed.searchParams.get('li_token')
      if (!token) return null
      return { code: token, redirectUrl: url }
    }
    default:
      return null
  }
}

/**
 * Opens a login window through the active `LoginWindowSeam`, drains `takeEvents()` until a
 * matching redirect or the deadline, and NEVER rejects — every failure resolves a typed outcome
 * (`sidecar-dialog-reject-crashes`). Settles exactly once through a single `settle()` helper that
 * clears every timer, awaits `seam.close(label)` inside its own try/catch (a close failure must
 * never change the resolved outcome), and only then resolves — so a caller awaiting this promise
 * never observes a "captured"/"timeout" outcome before the window it opened has actually been
 * asked to close.
 */
export function captureOAuthLogin(
  runner: OAuthRunner,
  loginUrl: string,
  options?: { deadlineMs?: number; pollMs?: number }
): Promise<OAuthCaptureOutcome> {
  const seam = getLoginWindowSeam()
  if (seam === null) {
    // The Electron build's answer — cheap and total, nothing opened.
    return Promise.resolve({ status: 'unsupported' })
  }

  // Re-bound to a non-null local: TS's control-flow narrowing of `seam` above does not persist
  // into the nested `settle`/`poll` function declarations below, since it cannot prove the outer
  // closure variable is never reassigned to null by the time they run (it is `const`, so it
  // actually can't be, but this rebinding makes that explicit rather than fighting the checker).
  const activeSeam = seam
  const deadlineMs = options?.deadlineMs ?? DEFAULT_DEADLINE_MS
  const pollMs = options?.pollMs ?? DEFAULT_POLL_MS

  return new Promise<OAuthCaptureOutcome>((resolve) => {
    let settled = false
    let label: string | null = null
    let pollInFlight = false
    let pollInterval: ReturnType<typeof setInterval> | null = null
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null
    // Plan 34.5-24 (F-34.5-G6-01 discriminator instrument). Tracks the last hostname LOGGED (not
    // merely observed) so a 500ms poll loop over a five-minute deadline cannot flood the log with
    // repeats of the SAME hostname -- only a transition to a NEW hostname (or the first hostname of
    // the attempt) is ever written.
    let lastLoggedHost: string | null = null

    async function settle(outcome: OAuthCaptureOutcome): Promise<void> {
      if (settled) return
      settled = true
      if (pollInterval !== null) clearInterval(pollInterval)
      if (deadlineTimer !== null) clearTimeout(deadlineTimer)
      if (label !== null) {
        const labelToClose = label
        try {
          await activeSeam.close(labelToClose)
        } catch (err) {
          logWarning(
            [`[oauthLoginCapture] runner=${runner} close failed (non-fatal):`, err],
            LogPrefix.Backend
          )
        }
      }
      logInfo(`[oauthLoginCapture] runner=${runner} status=${outcome.status}`, LogPrefix.Backend)
      resolve(outcome)
    }

    async function poll(): Promise<void> {
      if (settled || label === null || pollInFlight) return
      pollInFlight = true
      try {
        const events = await activeSeam.takeEvents(label)
        if (settled) return
        for (const event of events) {
          // T-34.5-G6-11: hostname ONLY -- never origin, pathname, search, or href. Epic's
          // redirect carries the authorization code in the query string (the `legendary` branch
          // below reads it via `searchParams.get('code')`), so logging anything past the hostname
          // would write a live credential into a log the user can upload. De-duplicated against
          // the last LOGGED hostname so a same-host poll sequence writes exactly one line.
          let navHost: string
          try {
            navHost = new URL(event.url).hostname
          } catch {
            navHost = '<unparseable>'
          }
          if (navHost !== lastLoggedHost) {
            lastLoggedHost = navHost
            logInfo(`[oauthLoginCapture] runner=${runner} nav host=${navHost}`, LogPrefix.Backend)
          }

          const match = matchOAuthRedirect(runner, event.url)
          if (match) {
            await settle({
              status: 'captured',
              runner,
              code: match.code,
              redirectUrl: match.redirectUrl
            })
            return
          }
        }
      } catch (err) {
        await settle({
          status: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      } finally {
        pollInFlight = false
      }
    }

    deadlineTimer = setTimeout(() => {
      void settle({ status: 'timeout' })
    }, deadlineMs)

    activeSeam
      .open(loginUrl, { visible: true, userAgent: resolveUserAgent(runner) })
      .then((openedLabel) => {
        if (settled) {
          // The capture already settled (e.g. the deadline fired) before open() resolved —
          // close the now-orphaned window immediately rather than leaking it.
          activeSeam.close(openedLabel).catch((err) => {
            logWarning(
              [`[oauthLoginCapture] runner=${runner} close failed (non-fatal):`, err],
              LogPrefix.Backend
            )
          })
          return
        }
        label = openedLabel
        logInfo(`[oauthLoginCapture] runner=${runner} label=${openedLabel}`, LogPrefix.Backend)
        pollInterval = setInterval(() => void poll(), pollMs)
        void poll()
      })
      .catch((err) => {
        void settle({
          status: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      })
  })
}
