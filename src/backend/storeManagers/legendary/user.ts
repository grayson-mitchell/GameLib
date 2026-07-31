import { existsSync, readFileSync } from 'graceful-fs'

import { UserInfo } from 'common/types'
import { clearCache } from '../../utils'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { userInfo as user } from 'os'
import { session } from 'electron'
import { libraryManagerMap } from '..'
import { LegendaryCommand } from './commands'
import { NonEmptyString } from './commands/base'
import { configStore } from 'backend/constants/key_value_stores'
import { legendaryUserInfo } from './constants'
import { getLoginWindowSeam } from '../../humble/loginWindowSeam'
import { standardBrowserUserAgent } from '../../humble/userAgent'

// Opened HIDDEN purely to obtain a window handle whose jar can be cleared —
// no navigation/login flow ever runs against this url. Source:
// frontend/screens/WebView/loginRoutes.ts:45 (`EPIC_LOGIN_URL`).
const EPIC_LOGIN_ORIGIN = 'https://www.epicgames.com/id/login?responseType=code'
// Apex domain: suffix-matches every Epic auth cookie regardless of which
// epicgames.com subdomain actually sets it, mirroring humble/user.ts's
// disconnect() (T-34.4.1-30), which passes the apex 'humblebundle.com'
// rather than 'www.humblebundle.com'.
const EPIC_COOKIE_HOST = 'epicgames.com'

export class LegendaryUser {
  public static async login(
    authorizationCode: string
  ): Promise<{ status: 'done' | 'failed'; data: UserInfo | undefined }> {
    const command: LegendaryCommand = {
      subcommand: 'auth',
      '--code': NonEmptyString.parse(authorizationCode)
    }

    const errorMessage = (
      error: string
    ): { status: 'failed'; data: undefined } => {
      logError(['Failed to login with Legendary:', error], LogPrefix.Legendary)

      return { status: 'failed', data: undefined }
    }

    try {
      const res = await libraryManagerMap['legendary'].runRunnerCommand(
        command,
        {
          abortId: 'legendary-login',
          logMessagePrefix: 'Logging in'
        }
      )

      if (res.stderr.includes('ERROR: Logging in ')) {
        return errorMessage(res.stderr)
      }

      if (res.error || res.abort) {
        return errorMessage(res.error ?? 'abort by user')
      }

      const userInfo = this.getUserInfo()
      return { status: 'done', data: userInfo }
    } catch (error) {
      return errorMessage(`${error}`)
    }
  }

  public static async logout() {
    const command: LegendaryCommand = { subcommand: 'auth', '--delete': true }

    const res = await libraryManagerMap['legendary'].runRunnerCommand(command, {
      abortId: 'legendary-logout',
      logMessagePrefix: 'Logging out'
    })

    if (res.error || res.abort) {
      logError(
        ['Failed to logout:', res.error ?? 'abort by user'],
        LogPrefix.Legendary
      )
      return
    }

    // Phase 34.5 Plan 06 (T-34.5-19, ASVS V3): the credential-side cleanup
    // below (configStore.delete('userInfo') + clearCache('legendary')) is
    // the security boundary and MUST run unconditionally — even when every
    // cookie-side step in this block fails or throws. The cookie-side
    // cleanup is best-effort: a sign-out that revoked the CLI session but
    // left `userInfo` behind is worse than one that left a stray cookie
    // behind. This is the same shape humble/user.ts's disconnect() uses
    // (Phase 34.4.1 Plan 06, D-08).
    //
    // Electron path (seam === null): the ORIGINAL five session.fromPartition
    // clear calls, same order, now individually guarded so one failing call
    // can no longer abort the rest (previously a bare sequential await —
    // this is the only behavioral change on this path, and it can only ever
    // make logout MORE resilient, never less, when the real session API is
    // present).
    //
    // Tauri path (seam !== null): there is no session.fromPartition() shape
    // under the sidecar (electronStub.ts's stub returns `{}`, which has no
    // clear* methods and would throw a TypeError on the very first call,
    // aborting before configStore.delete/clearCache ever ran — the defect
    // this task fixes). Instead, open a HIDDEN window on Epic's login
    // origin and clear only Epic's own cookies through the domain-scoped
    // seam — never a blanket wipe (T-34.5-20): the app-wide cookie jar
    // shares Humble/GOG/Amazon cookies under Tauri (inherited T-34.4.1-47).
    //
    // Phase 34.4.1 Plan 16 (F-6's verbatim twin, BLOCKING closure — a
    // deliberate cross-phase edit into open Phase 34.5, recorded in this
    // plan's own SUMMARY so 34.5's gate inherits it knowingly): the
    // cookie-only step above left this Tauri branch covering only 1 of
    // Electron's 5 wipe categories, the exact same shape as
    // humble/user.ts's disconnect() before this same plan fixed it. A
    // second, INDEPENDENT 'clearEpicStorage' step now calls Plan 15's
    // `seam.clearStorage(EPIC_LOGIN_ORIGIN, ...)`, clearing localStorage,
    // sessionStorage, IndexedDB, Cache Storage and service-worker
    // registrations for Epic's own origin only (same-origin policy scopes
    // it structurally, mirroring `clearCookies`'s domain-suffix filter).
    // This closes the `storage`/`cache` categories. It is a SEPARATE
    // wipeSteps entry, not folded into the cookie step, so the guarded loop
    // below keeps treating the two independently. The window this
    // capability opens is opened AND closed entirely inside the Rust arm
    // itself (`humble_login_clear_storage`, Plan 15) — this call site never
    // holds a window handle of its own to leak.
    //
    // `clearAuthCache`/`clearHostResolverCache` have NO in-page JavaScript
    // equivalent — they are network-stack (HTTP auth / DNS resolver)
    // caches, not web storage, and no Tauri/wry API exposes them to
    // injected JS. This is DECLARED rather than silently dropped
    // (T-34.4.1-73, STRIDE Repudiation, accepted): the residual risk is a
    // cached HTTP auth credential or a DNS cache entry surviving a logout,
    // and NEITHER carries an Epic session — the actual harm (auto-signed-
    // back-in re-login) is fully closed by the cookie + storage steps
    // above. `seamBranchParity.test.ts`'s DECLARED check (Plan 16 Task 3)
    // requires this exact paragraph to name both categories and this
    // threat ID before it will accept the classification.
    const seam = getLoginWindowSeam()
    let wipeSteps: Array<[string, () => Promise<unknown>]>
    if (seam === null) {
      const ses = session.fromPartition('persist:epicstore')
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
          'clearEpicCookies',
          async () => {
            // Phase 34.4.1 Plan 23 (F-6 Defect B, deliberate cross-phase edit into open
            // Phase 34.5 -- see this plan's own SUMMARY): `seam.clearCookies` routes to
            // the exact SAME `humble_login_clear_cookies` Rust arm `humble/user.ts`'s
            // disconnect() uses. This call site carried F-6's Defect B (a returned count
            // that could never report failure, and on macOS a deletion that reported
            // success while deleting nothing) verbatim since Phase 34.5 plan 06 -- it was
            // never independently verified, only assumed fixed by inheritance once the
            // shared arm was fixed. Plan 23 fixed the arm for BOTH callers; this step adds
            // the observability Humble already had, so the fix is provable here too,
            // rather than merely assumed.
            const label = await seam.open(EPIC_LOGIN_ORIGIN, {
              visible: false,
              userAgent: standardBrowserUserAgent()
            })
            try {
              const deleted = await seam.clearCookies(label, EPIC_COOKIE_HOST)
              // Only the COUNT is logged — never a cookie name, domain, or
              // value (mirrors humble/user.ts's disconnect()). `deleted` is a
              // measured post-removal delta (Plan 23), not an attempted count:
              // it comes from a re-read of the jar taken AFTER the removal ran.
              logInfo(
                `Legendary logout: cleared ${deleted} ${EPIC_COOKIE_HOST} cookie(s) (measured post-removal delta)`,
                LogPrefix.Legendary
              )
              if (deleted === 0) {
                // Same loudness discipline as humble/user.ts's census discrepancy
                // warning: a domain-scoped clear that measured zero removed is a
                // signal worth a WARNING, not silence, even without a full census.
                logWarning(
                  `Legendary logout: domain-scoped cookie clear removed nothing for ${EPIC_COOKIE_HOST}`,
                  LogPrefix.Legendary
                )
              }
            } finally {
              // Closed unconditionally — even when clearCookies rejects —
              // so a failed clear never leaks the hidden window.
              await seam.close(label).catch((err) => {
                logWarning(
                  [
                    'Legendary logout: cookie-clear window close failed (non-fatal):',
                    err
                  ],
                  LogPrefix.Legendary
                )
              })
            }
          }
        ],
        [
          'clearEpicStorage',
          async () => {
            // Plan 15's clearStorage() opens and closes its OWN hidden
            // window inside the Rust arm (humble_login_clear_storage) — no
            // label is needed or returned here, unlike the cookie step
            // above.
            const report = await seam.clearStorage(
              EPIC_LOGIN_ORIGIN,
              standardBrowserUserAgent()
            )
            // Only COUNTS are logged — never a storage key or value
            // (mirrors humble/user.ts's disconnect()).
            logInfo(
              `Legendary logout: cleared storage — localStorage=${report.localStorage}, ` +
                `sessionStorage=${report.sessionStorage}, indexedDB=${report.indexedDB}, ` +
                `caches=${report.caches}, serviceWorkers=${report.serviceWorkers}`,
              LogPrefix.Legendary
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
          [`Legendary logout cookie-clear step ${name} failed (continuing):`, err],
          LogPrefix.Legendary
        )
      }
    }

    configStore.delete('userInfo')
    clearCache('legendary')
  }

  public static isLoggedIn() {
    return existsSync(legendaryUserInfo)
  }

  public static getUserInfo(): UserInfo | undefined {
    if (!LegendaryUser.isLoggedIn()) {
      configStore.delete('userInfo')
      return
    }
    try {
      const userInfoContent = readFileSync(legendaryUserInfo).toString()
      const userInfoObject = JSON.parse(userInfoContent)
      const info: UserInfo = {
        account_id: userInfoObject.account_id,
        displayName: userInfoObject.displayName,
        user: user().username
      }
      configStore.set('userInfo', info)
      return info
    } catch (error) {
      logError(
        [`User info file corrupted, check ${legendaryUserInfo}. Error:`, error],
        LogPrefix.Legendary
      )
      return
    }
  }
}
