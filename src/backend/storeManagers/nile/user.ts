import {
  LogPrefix,
  logDebug,
  logError,
  logInfo,
  logWarning
} from 'backend/logger'
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
import { isMac } from 'backend/constants/environment'
import { getLoginWindowSeamOrThrow } from '../../humble/loginWindowSeam'

// Amazon-owned APEX domain. Suffix-matching happens Rust-side in
// `cookie_domain_matches`, so this single apex covers `www.amazon.com` (the
// host Amazon's own login flow runs on) without listing it separately --
// mirroring `legendary/user.ts`'s `EPIC_COOKIE_HOSTS` (apex-only).
//
// PAIRED LIST -- keep this in lockstep with `STORE_LOGOUT_COOKIE_DOMAINS` in
// `src-tauri/src/main.rs` (see that constant's own doc comment, which names
// this one back). A domain added on one side and not the other is a silent
// half-fix (T-35-41's drift risk, applied here to D-15).
const AMAZON_COOKIE_HOSTS = ['amazon.com'] as const

// A label that can never name a real window -- mirrors
// `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL` (`legendary/user.ts`) and
// `GOG_COOKIE_CLEAR_NO_WINDOW_LABEL` (`gog/user.ts`) exactly: Amazon's login
// window is already closed by the time `logout()` runs, so passing a label
// GUARANTEED never to resolve routes `humble_login_clear_cookies`/
// `humble_login_cookies_for_domain` (`src-tauri/src/main.rs`) straight to
// their macOS default-data-store fallback, gated by
// `store_logout_cookie_domain_matches`.
const AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL = 'amazon-cookie-clear-no-window'

// Phase 40 plan 04, D-15/T-40-04-07/-08: Amazon's logout leaves session
// cookies behind in the shared default cookie jar. This SUPERSEDES the prior
// accepted disposition recorded against this path (T-34.5-37, `accept`) --
// see `runnerAuthFlowRegistration.ts`'s `logoutAmazon` handler comment, which
// this plan updates in the same spirit as this function's own change.
// macOS-only, and never fatal to `logout()` -- see the caller's own comment.
async function clearAmazonCookiesForLogout(): Promise<void> {
  if (!isMac) {
    return
  }
  const seam = getLoginWindowSeamOrThrow()
  for (const host of AMAZON_COOKIE_HOSTS) {
    let beforeTotal: number | null = null
    try {
      const before = await seam.cookiesForDomain(
        AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL,
        host,
        []
      )
      beforeTotal = before.total
    } catch (error) {
      logWarning(
        `Amazon logout: cookie census failed for ${host}: ${error}`,
        LogPrefix.Nile
      )
    }

    const deleted = await seam.clearCookies(
      AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL,
      host
    )
    logInfo(
      `Amazon logout: cleared ${deleted} cookie(s) for ${host}`,
      LogPrefix.Nile
    )

    // wry's cookie-delete is known to lie about deletion (WebKit bug
    // #184938) -- `deleted` is the Rust side's own independent before/after
    // re-read (`verified_delete_count`), never the removal call's own signal.
    if (deleted === 0 && beforeTotal !== null && beforeTotal > 0) {
      logWarning(
        `Amazon logout: removed 0 cookies for ${host} despite a non-empty before-census (${beforeTotal})`,
        LogPrefix.Nile
      )
    }
  }
}

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

    // Credential-side cleanup runs FIRST and UNCONDITIONALLY relative to the
    // cookie-side step below (D-15, Phase 40 plan 04) -- a sign-out that
    // revoked the CLI session but left `userData` behind is worse than one
    // that left a stray cookie behind. The cookie step is wrapped in its own
    // try/catch below precisely so its failure can never retroactively skip
    // this, and can never make `logout()` itself reject.
    configStore.delete('userData')
    clearCache('nile')

    try {
      await clearAmazonCookiesForLogout()
    } catch (error) {
      logWarning(
        `Amazon logout: cookie clear failed: ${error}`,
        LogPrefix.Nile
      )
    }
  }

  static async getUserData(): Promise<NileUserData | undefined> {
    if (!existsSync(nileUserData)) {
      logError('current_user.json does not exist', LogPrefix.Nile)
      configStore.delete('userData')
      return
    }

    // nile 1.2.0 moved this file (user.json -> current_user.json) AND flattened
    // its payload: the fields that used to sit under `extensions.customer_info`
    // are now the top-level object. Reading the old shape against a 1.2.0 binary
    // yields `undefined` and silently logs the user out, so the binary bump in
    // meta/releaseTags.ts and this parse must always move together.
    const user: NileUserData = JSON.parse(readFileSync(nileUserData, 'utf-8'))
    if (!Object.keys(user).length) {
      logInfo('current_user.json is empty', LogPrefix.Nile)
      configStore.delete('userData')
      return
    }

    configStore.set('userData', user)
    logInfo('Saved user data to config file', LogPrefix.Nile)

    return user
  }

  public static isLoggedIn() {
    return configStore.get_nodefault('userData') || false
  }
}
