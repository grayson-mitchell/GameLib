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
            const label = await seam.open(EPIC_LOGIN_ORIGIN, {
              visible: false,
              userAgent: standardBrowserUserAgent()
            })
            try {
              const deleted = await seam.clearCookies(label, EPIC_COOKIE_HOST)
              // Only the COUNT is logged — never a cookie name, domain, or
              // value (mirrors humble/user.ts's disconnect()).
              logInfo(
                `Legendary logout: cleared ${deleted} ${EPIC_COOKIE_HOST} cookie(s)`,
                LogPrefix.Legendary
              )
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
