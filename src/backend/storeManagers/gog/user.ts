import axios from 'axios'
import { existsSync, unlinkSync } from 'graceful-fs'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { GOGLoginData } from 'common/types'
import { configStore } from './electronStores'
import { isOnline } from '../../online_monitor'
import { GOGCredentials, UserData } from 'common/types/gog'
import { clearCache } from 'backend/utils'
import { app } from 'backend/platform'
import { gogdlAuthConfig } from './constants'
import { isMac } from 'backend/constants/environment'
import { getLoginWindowSeamOrThrow } from '../../humble/loginWindowSeam'

// GOG-owned APEX domain(s). Suffix-matching happens Rust-side in
// `cookie_domain_matches`, so this single apex covers every subdomain that may
// have set a session cookie against it (`login.gog.com`, `www.gog.com`, ...) --
// mirroring `legendary/user.ts`'s `EPIC_COOKIE_HOSTS` (apex-only, not every
// observed subdomain by hand).
//
// PAIRED LIST -- keep this in lockstep with `STORE_LOGOUT_COOKIE_DOMAINS` in
// `src-tauri/src/main.rs` (see that constant's own doc comment, which names
// this one back). A domain added on one side and not the other is a silent
// half-fix (T-35-41's drift risk, applied here to D-15).
const GOG_COOKIE_HOSTS = ['gog.com'] as const

// A label that can never name a real window -- mirrors
// `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL` (`legendary/user.ts`) exactly, including
// the reasoning: GOG's login window is already closed by the time `logout()`
// runs, so `app.get_webview_window(label)` was always going to resolve `None`
// for GOG's own label too. Passing a label that is GUARANTEED never to resolve
// makes that `None` explicit rather than incidental, and routes
// `humble_login_clear_cookies`/`humble_login_cookies_for_domain`
// (`src-tauri/src/main.rs`) straight to their macOS default-data-store
// fallback, gated by `store_logout_cookie_domain_matches`.
const GOG_COOKIE_CLEAR_NO_WINDOW_LABEL = 'gog-cookie-clear-no-window'

// Phase 40 plan 04, D-15/T-40-04-07/-08: GOG's logout leaves session cookies
// behind in the shared default cookie jar -- the store/wiki embed is what
// makes that leak user-visible for the first time (a navigable GOG tab whose
// login silently outlives an explicit sign-out). macOS-only: the Rust-side
// fallback this depends on is `#[cfg(target_os = "macos")]`, and no Tauri leg
// ships on Windows/Linux yet (Phase 38) -- there is no live target to clear
// cookies against off macOS today. Never fatal to `logout()` -- see the
// caller's own comment for why credential-side cleanup must never be blocked
// by this.
async function clearGogCookiesForLogout(): Promise<void> {
  if (!isMac) {
    return
  }
  const seam = getLoginWindowSeamOrThrow()
  for (const host of GOG_COOKIE_HOSTS) {
    let beforeTotal: number | null = null
    try {
      const before = await seam.cookiesForDomain(
        GOG_COOKIE_CLEAR_NO_WINDOW_LABEL,
        host,
        []
      )
      beforeTotal = before.total
    } catch (error) {
      // A failed BEFORE-census must never block the clear attempt below --
      // it only disables the zero-against-non-empty warning for this host.
      logWarning(
        `GOG logout: cookie census failed for ${host}: ${error}`,
        LogPrefix.Gog
      )
    }

    const deleted = await seam.clearCookies(
      GOG_COOKIE_CLEAR_NO_WINDOW_LABEL,
      host
    )
    logInfo(
      `GOG logout: cleared ${deleted} cookie(s) for ${host}`,
      LogPrefix.Gog
    )

    // wry's cookie-delete is known to lie about deletion (WebKit bug #184938)
    // -- `deleted` is the Rust side's own independent before/after re-read
    // (`verified_delete_count`), not the removal call's own signal. A zero
    // count against a non-empty before-census means the clear silently did
    // nothing and must be surfaced, not silently accepted as success.
    if (deleted === 0 && beforeTotal !== null && beforeTotal > 0) {
      logWarning(
        `GOG logout: removed 0 cookies for ${host} despite a non-empty before-census (${beforeTotal})`,
        LogPrefix.Gog
      )
    }
  }
}

function authLogSanitizer(line: string) {
  try {
    const output = JSON.parse(line)
    output.access_token = '<redacted>'
    output.session_id = '<redacted>'
    output.refresh_token = '<redacted>'
    output.user_id = '<redacted>'
    return JSON.stringify(output) + '\n'
  } catch {
    return line
  }
}

// Session-lifetime TTL cache for getCredentials() -- debug/gog-spawn-reduction.md fix 1.
// getCredentials() has 15 call sites (login/boot/library-refresh/presence/playtime/etc.)
// with no caching, each spawning its own `gogdl auth` subprocess. Every spawn carries a
// proven ~5-13s OS-level tax (see resolved/gogdl-spawn-tax.md) that cannot be fixed in
// this repo, so the only lever is call-count. `expires_in` (seconds) is GOG's own stated
// token lifetime; a safety margin avoids handing out a token that's about to expire
// mid-request. Cleared on logout() so a fresh login never reuses a stale account's token.
const CREDENTIALS_EXPIRY_SAFETY_MARGIN_MS = 60_000
let cachedCredentials: GOGCredentials | undefined
let cachedCredentialsFetchedAt = 0

// Maps a `gogdl auth --code` token-exchange response (GOGLoginData) into the
// GOGCredentials shape the fix-1 TTL cache stores -- debug/gog-spawn-reduction.md
// fix 5. This is a real type mismatch, not a formality: GOGLoginData only types
// the fields login() itself reads (access_token/refresh_token/user_id/expires_in/
// loginTime) and does NOT declare `token_type`/`scope`/`session_id`/`loginType`,
// which GOGCredentials requires. Confirmed via grep across every
// GOGUser.getCredentials() consumer in this codebase (games.ts, presence.ts,
// discounts/index.ts, library.ts, getUserDetails() above) that none of them ever
// read those four fields -- only `access_token`, `user_id`, and `expires_in` are
// ever consumed -- so placeholder values for the unread fields are safe here.
// Force-casting `data as GOGCredentials` instead would have silently hidden that
// GOGLoginData is missing fields GOGCredentials declares as required.
function loginDataToCredentials(data: GOGLoginData): GOGCredentials {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user_id: data.user_id,
    expires_in: data.expires_in,
    // Not present on GOGLoginData and not read by any getCredentials() consumer
    // (see comment above) -- placeholders only.
    token_type: 'bearer',
    scope: '',
    session_id: '',
    loginType: 0
  }
}

export class GOGUser {
  static async login(
    code: string
    // TODO: Write types for this
  ): Promise<{
    status: 'done' | 'error'
    data?: UserData
  }> {
    logInfo('Logging using GOG credentials', LogPrefix.Gog)

    // Gets token from GOG basaed on authorization code
    // Imported lazily to break a circular dependency (gog/user.ts <->
    // storeManagers/index.ts): 'index' eagerly constructs every store
    // manager at module scope, including `new SteamLibraryManager()`, which
    // faults with "is not a constructor" whenever anything importing this
    // file is itself required BEFORE storeManagers/index.ts has finished
    // resolving (e.g. a headless sidecar requiring
    // backend/storeManagers/steam/library.ts directly — Phase 27 Plan 02).
    const { libraryManagerMap } = await import('../index')
    const { stdout } = await libraryManagerMap['gog'].runRunnerCommand(
      ['auth', '--code', code],
      {
        abortId: 'gogdl-auth',
        logSanitizer: authLogSanitizer
      }
    )

    let data: GOGLoginData
    try {
      data = JSON.parse(stdout.trim())
      if (data?.error) {
        return { status: 'error' }
      }
    } catch (err) {
      // The stdout of `gogdl auth --code` IS the GOG token exchange response, which is why
      // `authLogSanitizer` (above) is passed to the `runRunnerCommand` call that produced it --
      // it rewrites access_token/refresh_token/session_id/user_id to <redacted> on the way into
      // the *runner* log. Interpolating `stdout` here bypassed that sanitizer completely and
      // wrote the unredacted payload into the *general* log (`logError` -> `heroicLogWriter` ->
      // `gamelib.log`), which `uploadLogFile` will POST verbatim to a public dpaste with a
      // 2-day expiry. Length + parse error only, matching the presence/length discipline
      // `humble/adapter.ts`'s describeSchemaFailure already uses (`bodyLength=`, never a body).
      //
      // Applying `authLogSanitizer` here instead would NOT have worked: its body is
      // `try { JSON.parse(line) ... } catch { return line }`, so it returns the line verbatim
      // whenever the line is not JSON -- which is exactly this branch's precondition.
      logError(
        `GOG login failed to parse std output from gogdl. stdoutLength: ${stdout.trim().length}, error ${err}`,
        LogPrefix.Gog
      )
      return { status: 'error' }
    }
    logInfo('Login Successful', LogPrefix.Gog)
    configStore.set('isLoggedIn', true)
    // Seed the fix-1 TTL cache directly from this `gogdl auth --code` exchange's own
    // stdout -- debug/gog-spawn-reduction.md fix 5. Without this, the cache is empty
    // right after login and the very next getCredentials() call (e.g. the post-login
    // library refresh) spawns its own redundant `gogdl auth`, even though this call's
    // stdout already IS a fresh token. Same expires_in-minus-safety-margin keying as
    // fix 1, cleared by the same logout() path.
    cachedCredentials = loginDataToCredentials(data)
    cachedCredentialsFetchedAt = Date.now()
    // `data.access_token` is already the fresh token this exact `gogdl auth --code` call
    // just obtained -- pass it straight through so `getUserDetails()` doesn't spawn a
    // SECOND `gogdl auth` subprocess (via `getCredentials()`) just to re-derive the same
    // value. Measured live (debug/manage-accounts-slow-update.md): that redundant call
    // cost a reproducible ~5s on the critical path between the OAuth window closing and
    // the frontend's in-progress screen clearing. `data.user_id` is threaded through too,
    // since the api.gog.com endpoint below is keyed by it -- nothing new is spawned to
    // obtain it, it's already in this exchange's own parsed stdout.
    const userDetails = await this.getUserDetails({
      access_token: data.access_token,
      user_id: data.user_id
    })
    return { status: 'done', data: userDetails }
  }

  // `credentials`: when the caller already has a fresh token in hand (only `login()`,
  // immediately after a `gogdl auth --code` exchange), pass it here to skip
  // `getCredentials()`'s own `gogdl auth` CLI subprocess call. Omit it (as the boot-time
  // caller in main.ts does) to keep the existing disk-read/refresh behavior. It carries
  // `user_id` alongside `access_token` because the api.gog.com/users/{user_id} endpoint
  // below is keyed by it -- passing both here means the caller's already-known user_id is
  // reused rather than re-derived, so nothing new is spawned to obtain it.
  public static async getUserDetails(
    credentials?: Pick<GOGCredentials, 'access_token' | 'user_id'>
  ) {
    if (!isOnline()) {
      logError('Unable to login information, Heroic offline', LogPrefix.Gog)
      return
    }
    logInfo('Checking if login is valid', LogPrefix.Gog)
    if (!this.isLoggedIn()) {
      logWarning('User is not logged in', LogPrefix.Gog)
      return
    }
    const resolved = credentials ?? (await this.getCredentials())
    const token = resolved?.access_token
    if (!token) {
      logError("No credentials, can't get login information", LogPrefix.Gog)
      return
    }
    const userId = resolved?.user_id
    if (!userId) {
      logError(
        "No user_id in credentials, can't get login information",
        LogPrefix.Gog
      )
      return
    }
    const response = await axios
      .get(`https://api.gog.com/users/${encodeURIComponent(userId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': `HeroicGamesLauncher/${app.getVersion()}`
        }
      })
      .catch((error) => {
        logError(['Error getting login information', error], LogPrefix.Gog)
      })

    if (!response) {
      return
    }

    const username: string | undefined = response.data?.username
    if (!username) {
      logError(
        'No username in api.gog.com/users response, not persisting userData',
        LogPrefix.Gog
      )
      return
    }

    // T-Q34-01 -- galaxyUserId/userId are sourced from our own resolved credentials,
    // NEVER from the response body, so a manipulated response cannot redirect the
    // playtime session URL to another user's id.
    const previous = configStore.get_nodefault('userData')
    if (previous?.galaxyUserId && previous.galaxyUserId !== userId) {
      logWarning(
        [
          'GOG userData.galaxyUserId drifted from a previously stored value -- GOG playtime',
          `session URLs are about to change. previous=${previous.galaxyUserId} new=${userId}`
        ].join(' '),
        LogPrefix.Gog
      )
    }

    const data: UserData = { userId, username, galaxyUserId: userId }

    configStore.set('userData', data)
    logInfo('Saved username to config file', LogPrefix.Gog)

    return data
  }
  /**
   * Loads user credentials from config
   * if needed refreshes token and returns new credentials
   * @returns user credentials
   */
  public static async getCredentials(): Promise<GOGCredentials | undefined> {
    if (!isOnline()) {
      logWarning('Unable to get credentials - app is offline', {
        prefix: LogPrefix.Gog
      })
      return
    }
    // TTL cache -- debug/gog-spawn-reduction.md fix 1. Skip the `gogdl auth` spawn
    // entirely if the last-fetched token is still within its own stated lifetime.
    if (
      cachedCredentials &&
      Date.now() - cachedCredentialsFetchedAt <
        cachedCredentials.expires_in * 1000 -
          CREDENTIALS_EXPIRY_SAFETY_MARGIN_MS
    ) {
      return cachedCredentials
    }
    // Lazy import — see the load-bearing comment on the sibling call in
    // login() above (breaks the gog/user.ts <-> storeManagers/index.ts cycle).
    const { libraryManagerMap } = await import('../index')
    const { stdout } = await libraryManagerMap['gog'].runRunnerCommand(
      ['auth'],
      {
        abortId: 'gogdl-get-credentials',
        logSanitizer: authLogSanitizer
      }
    )
    try {
      const credentials = JSON.parse(stdout) as GOGCredentials | undefined
      if (credentials) {
        cachedCredentials = credentials
        cachedCredentialsFetchedAt = Date.now()
      }
      return credentials
    } catch (error) {
      logError(['Error getting GOG credentials:', error])
      return undefined
    }
  }

  // D-15 (Phase 40 plan 04): stayed a plain (non-async-looking-mandatory)
  // function whose declared return is now a Promise, deliberately for
  // backward compatibility with `runnerAuthFlowRegistration.ts`'s `logoutGOG`
  // listener (`ipcMain.on`, never `ipcMain.handle`): every line above the
  // first `await` still runs SYNCHRONOUSLY the instant `logout()` is called,
  // exactly as it did before this method gained an `async` keyword -- credit
  // JS's own run-to-first-await semantics, not a special case here. That is
  // what lets the credential-side cleanup below run FIRST and run
  // UNCONDITIONALLY, even for a caller that never awaits the returned
  // promise. The cookie-side step is wrapped in its own try/catch so its
  // failure can never become the reason credential cleanup was skipped --
  // impossible by ORDER already, but the wrap also stops it becoming a
  // rejected `logout()` promise (an unhandled rejection at the `ipcMain.on`
  // call site, which cannot `.catch()` a fire-and-forget invocation).
  public static async logout() {
    clearCache('gog')
    configStore.clear()
    if (existsSync(gogdlAuthConfig)) {
      unlinkSync(gogdlAuthConfig)
    }
    cachedCredentials = undefined
    cachedCredentialsFetchedAt = 0
    logInfo('Logging user out', LogPrefix.Gog)

    try {
      await clearGogCookiesForLogout()
    } catch (error) {
      logWarning(`GOG logout: cookie clear failed: ${error}`, LogPrefix.Gog)
    }
  }

  /**
   * Test-only reset hook (debug/gog-spawn-reduction.md fix 1). `cachedCredentials` is a
   * module-level singleton that outlives any individual test's mocked `runRunnerCommand`
   * result (this project's Jest config has no `resetModules`), so a token cached by one
   * test would silently be reused by the next unless cleared here. Called from
   * `user.test.ts`'s `beforeEach`. Never called from production code.
   */
  public static __resetCredentialsCacheForTests(): void {
    cachedCredentials = undefined
    cachedCredentialsFetchedAt = 0
  }

  public static isLoggedIn() {
    return configStore.get_nodefault('isLoggedIn') || false
  }
}
