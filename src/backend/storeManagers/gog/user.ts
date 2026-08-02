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
      return JSON.parse(stdout) as GOGCredentials | undefined
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
    logInfo('Logging user out', LogPrefix.Gog)
  }

  public static isLoggedIn() {
    return configStore.get_nodefault('isLoggedIn') || false
  }
}
