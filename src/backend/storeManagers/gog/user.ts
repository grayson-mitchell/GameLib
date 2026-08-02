import axios from 'axios'
import { existsSync, unlinkSync } from 'graceful-fs'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { GOGLoginData } from 'common/types'
import { configStore } from './electronStores'
import { isOnline } from '../../online_monitor'
import { GOGCredentials, UserData } from 'common/types/gog'
import { clearCache } from 'backend/utils'
import { app } from 'electron'
import { gogdlAuthConfig } from './constants'

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
      logError(
        `GOG login failed to parse std output from gogdl. stdout: ${stdout.trim()}, error ${err}`,
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
    // the frontend's in-progress screen clearing.
    const userDetails = await this.getUserDetails(data.access_token)
    return { status: 'done', data: userDetails }
  }

  // `accessToken`: when the caller already has a fresh token in hand (only `login()`,
  // immediately after a `gogdl auth --code` exchange), pass it here to skip
  // `getCredentials()`'s own `gogdl auth` CLI subprocess call. Omit it (as the boot-time
  // caller in main.ts does) to keep the existing disk-read/refresh behavior.
  public static async getUserDetails(accessToken?: string) {
    if (!isOnline()) {
      logError('Unable to login information, Heroic offline', LogPrefix.Gog)
      return
    }
    logInfo('Checking if login is valid', LogPrefix.Gog)
    if (!this.isLoggedIn()) {
      logWarning('User is not logged in', LogPrefix.Gog)
      return
    }
    const token = accessToken ?? (await this.getCredentials())?.access_token
    if (!token) {
      logError("No credentials, can't get login information", LogPrefix.Gog)
      return
    }
    const response = await axios
      .get(`https://embed.gog.com/userData.json`, {
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

    const data: UserData = response.data

    //Exclude email, it won't be needed
    delete data.email

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
        cachedCredentials.expires_in * 1000 - CREDENTIALS_EXPIRY_SAFETY_MARGIN_MS
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

  public static logout() {
    clearCache('gog')
    configStore.clear()
    if (existsSync(gogdlAuthConfig)) {
      unlinkSync(gogdlAuthConfig)
    }
    cachedCredentials = undefined
    cachedCredentialsFetchedAt = 0
    logInfo('Logging user out', LogPrefix.Gog)
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
