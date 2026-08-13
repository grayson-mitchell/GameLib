import { LogPrefix, logDebug, logError, logInfo } from 'backend/logger'
import {
  NileLoginData,
  NileRegisterData,
  NileUserData
} from 'common/types/nile'
import { libraryManagerMap } from '..'
import { existsSync, readFileSync } from 'graceful-fs'
import { configStore } from './electronStores'
import { clearCache } from 'backend/utils'
import { nileUserData } from './constants'

function authLogSanitizer(line: string) {
  try {
    const output = JSON.parse(line)
    output.url = '<redacted>'
    output.code_verifier = '<redacted>'
    output.serial = '<redacted>'
    output.client_id = '<redacted>'
    return JSON.stringify(output) + '\n'
  } catch {
    return line
  }
}

// Quick task 260806-teb Task 2: in-flight-promise memoization around getLoginData()'s
// `runRunnerCommand` spawn, mirroring `src/backend/utils/systeminfo/index.ts:69-99`'s
// `inFlightSystemInfoFetch` exactly in structure. Under Tauri, two concurrent
// getAmazonLoginData() callers (e.g. a remounted WebView route) used to race two independent
// `nile auth --login --non-interactive` spawns -- each ~12.8s (pyinstaller-onefile-spawn-tax)
// -- instead of sharing the one already in flight.
//
// CRITICAL -- there is deliberately NO value cache and NO TTL here, unlike
// `GOGUser.getCredentials()`. `NileLoginData` carries single-use PKCE material
// (`code_verifier`, `serial`) consumed exactly once by the `authAmazon` -> `nile register`
// exchange. Reusing it across attempts would let a retry after a cancelled login replay stale
// PKCE material into `authAmazon` -- a correctness bug, not an optimisation. A future
// "consistency" pass must NOT add the TTL value cache that the GOG sibling has.
let inFlightLoginData: Promise<NileLoginData> | null = null

// F-34.5-G6-20 (site 1 of the pair) -- nile login/register payload objects are never logged
// whole. `NileLoginData` carries single-use PKCE material (`code_verifier`) plus the full OAuth
// authorize URL, which itself carries `client_id` and the code challenge -- only the URL's host,
// lengths, and presence booleans are safe to log.
function redactNileLoginData(d: NileLoginData) {
  let url_host: string
  try {
    url_host = new URL(d.url).host
  } catch {
    url_host = '<unparseable>'
  }
  return {
    url_host,
    code_verifier_len: d.code_verifier.length,
    serial_present: Boolean(d.serial),
    client_id_present: Boolean(d.client_id)
  }
}

// F-34.5-G6-17 (site 2 of the pair) -- nile login/register payload objects are never logged
// whole. `NileRegisterData` carries the single-use OAuth `code` and the PKCE `code_verifier` in
// cleartext -- only lengths and presence booleans are safe to log.
function redactNileRegisterData(d: NileRegisterData) {
  return {
    code_len: d.code.length,
    code_verifier_len: d.code_verifier.length,
    serial_present: Boolean(d.serial),
    client_id_present: Boolean(d.client_id)
  }
}

export class NileUser {
  static async getLoginData(): Promise<NileLoginData> {
    if (inFlightLoginData) {
      logDebug(
        'Getting login data from Nile: reusing an already in-flight fetch',
        LogPrefix.Nile
      )
      return inFlightLoginData
    }

    const fetchPromise = (async (): Promise<NileLoginData> => {
      logDebug('Getting login data from Nile', LogPrefix.Nile)
      const { stdout } = await libraryManagerMap['nile'].runRunnerCommand(
        ['auth', '--login', '--non-interactive'],
        {
          abortId: 'nile-auth',
          logSanitizer: authLogSanitizer
        }
      )
      const output: NileLoginData = JSON.parse(stdout)

      logInfo(
        ['Register data received (redacted):', redactNileLoginData(output)],
        LogPrefix.Nile
      )
      return output
    })()

    inFlightLoginData = fetchPromise
    try {
      return await fetchPromise
    } finally {
      // Identity check (systeminfo's own precedent) -- prevents a slow loser clearing a
      // newer winner's slot: if a call issued AFTER this one resolved already replaced
      // `inFlightLoginData` with its own fresh promise, this `finally` must not clear that.
      if (inFlightLoginData === fetchPromise) {
        inFlightLoginData = null
      }
    }
  }

  /**
   * Test-only reset hook (mirrors systeminfo's `__resetSystemInfoCacheForTests`). This
   * project's Jest config has no `resetModules`, so `inFlightLoginData` would otherwise leak
   * between tests in the same file. Never called from production code.
   */
  static __resetInFlightLoginDataForTests(): void {
    inFlightLoginData = null
  }

  static async login(
    data: NileRegisterData
  ): Promise<{ status: 'done' | 'failed'; user: NileUserData | undefined }> {
    logDebug(
      ['Got register data (redacted):', redactNileRegisterData(data)],
      LogPrefix.Nile
    )
    const { code, code_verifier, serial, client_id } = data
    // Nile prints output to stderr
    const { stderr: output } = await libraryManagerMap['nile'].runRunnerCommand(
      [
        'register',
        '--code',
        code,
        '--code-verifier',
        code_verifier,
        '--serial',
        serial,
        '--client-id',
        client_id
      ],
      { abortId: 'nile-login' }
    )

    const successRegex = /\[AUTH_MANAGER]:.*Succesfully registered a device/
    if (!successRegex.test(output)) {
      // Authentication failed
      logError(['Authentication failed:', output], LogPrefix.Nile)
      return {
        status: 'failed',
        user: undefined
      }
    }

    logInfo('Authentication successful', LogPrefix.Nile)
    const user = await this.getUserData()
    if (!user) {
      return {
        status: 'failed',
        user: undefined
      }
    }

    return {
      status: 'done',
      user
    }
  }

  static async logout() {
    const commandParts = ['auth', '--logout']

    const res = await libraryManagerMap['nile'].runRunnerCommand(commandParts, {
      abortId: 'nile-logout'
    })

    if (res.abort) {
      logError('Failed to logout: abort by user', LogPrefix.Nile)
      return
    }

    configStore.delete('userData')
    clearCache('nile')
  }

  static async getUserData(): Promise<NileUserData | undefined> {
    if (!existsSync(nileUserData)) {
      logError('user.json does not exist', LogPrefix.Nile)
      configStore.delete('userData')
      return
    }

    const user: { extensions: { customer_info: NileUserData } } = JSON.parse(
      readFileSync(nileUserData, 'utf-8')
    )
    if (!Object.keys(user).length) {
      logInfo('user.json is empty', LogPrefix.Nile)
      configStore.delete('userData')
      return
    }

    configStore.set('userData', user.extensions.customer_info)
    logInfo('Saved user data to config file', LogPrefix.Nile)

    return user.extensions.customer_info
  }

  public static isLoggedIn() {
    return configStore.get_nodefault('userData') || false
  }
}
