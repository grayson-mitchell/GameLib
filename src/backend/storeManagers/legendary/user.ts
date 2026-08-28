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
// Epic-owned APEX domains. Suffix-matching happens Rust-side in
// `cookie_domain_matches`, so each apex covers every subdomain that may have
// set a session cookie against it — mirroring humble/user.ts's disconnect()
// (T-34.4.1-30), which passes the apex 'humblebundle.com' rather than
// 'www.humblebundle.com'.
//
// PAIRED LIST — keep this in lockstep, entry for entry, with
// `EPIC_COOKIE_DOMAINS` in src-tauri/src/main.rs (see that constant's own doc
// comment, which names this one back). The Rust arm's macOS fallback only
// admits a domain that is a member of ITS set; a domain added here and not
// there returns `humble_login:no-window:{label}` — an ERROR, not a clear — and
// a domain added there and not here is simply never attempted. Either way the
// drift is a silent half-fix (T-35-41), which is why the two sides name each
// other in place rather than relying on a reviewer noticing.
//
// Why more than 'epicgames.com' (Phase 35 plan 09, operator decision
// D-09-CORRECTED, 2026-08-29): `35-AB-RETEST.md` Item 7 measured `EPIC_DEVICE`
// surviving an Epic logout on .fortnite.com, .twinmotion.com, .unrealengine.com
// and .metahuman.com. An 'epicgames.com' suffix filter cannot match any of them
// BY CONSTRUCTION. The accepted cost of an explicit hand-maintained list is that
// it can go stale if Epic adds a domain — chosen deliberately over a filter that
// cannot match, and over a blanket wipe, which stays banned (REQ-34.4.1-06):
// this jar is app-wide and holds Humble/GOG/Amazon sessions too.
const EPIC_COOKIE_HOSTS = [
  'epicgames.com',
  'fortnite.com',
  'unrealengine.com',
  'twinmotion.com',
  'metahuman.com'
] as const

// The ONE wipe step whose failure is fatal to logout(). See the wipeSteps loop
// at the bottom of logout() for the full rationale, including why the other
// steps deliberately stay warnings.
const FATAL_WIPE_STEP = 'clearEpicCookies'

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
              // ONE window for the whole sweep (Phase 35 plan 09): opened
              // above, looped over here, closed once in the `finally` below.
              // Deliberately NOT a window per domain — `seam.clearCookies`
              // takes a single host, so looping is the right shape, but each
              // extra hidden window is another chance to leak one.
              let total = 0
              const perDomain: string[] = []
              for (const host of EPIC_COOKIE_HOSTS) {
                const deleted = await seam.clearCookies(label, host)
                total += deleted
                perDomain.push(`${host}=${deleted}`)
                // Only COUNTS and DOMAIN names are logged — never a cookie
                // name, value, token or account identifier (mirrors
                // humble/user.ts's disconnect(); this repo is public,
                // T-35-04). `deleted` is a measured post-removal delta (Plan
                // 23), not an attempted count: it comes from a re-read of the
                // jar taken AFTER the removal ran.
                logInfo(
                  `Legendary logout: cleared ${deleted} ${host} cookie(s) (measured post-removal delta)`,
                  LogPrefix.Legendary
                )
              }
              // The per-domain breakdown is what makes an INCOMPLETE clear
              // diagnosable next time. A bare total is what let the previous
              // incompleteness hide for a whole phase: 'cleared 9' looked
              // healthy while four Epic-owned domains were never attempted at
              // all (35-AB-RETEST.md Item 7).
              logInfo(
                `Legendary logout: Epic cookie clear removed ${total} cookie(s) across ` +
                  `${EPIC_COOKIE_HOSTS.length} Epic-owned domain(s) — ${perDomain.join(', ')}`,
                LogPrefix.Legendary
              )
              // ASYMMETRY, deliberate: an INDIVIDUAL domain returning 0 is
              // legitimate and is NOT an error — a user may simply never have
              // visited twinmotion.com, so that domain has no cookies to
              // remove. Only a zero TOTAL means the clear achieved nothing,
              // and that is the failure this throw exists to surface
              // (T-35-39). Before Phase 35 plan 09 this was a logWarning the
              // wipe loop then swallowed, which is precisely the defect class
              // that produced the original lying self-report.
              if (total === 0) {
                throw new Error(
                  `Legendary logout: domain-scoped cookie clear removed nothing across all ` +
                    `${EPIC_COOKIE_HOSTS.length} Epic-owned domains (${perDomain.join(', ')})`
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

    // Phase 35 plan 09 (T-35-39, operator decision D-09-CORRECTED): exactly ONE
    // step — `clearEpicCookies`, named by FATAL_WIPE_STEP above — is fatal to
    // logout()'s reported outcome. Every other step keeps its original
    // warn-and-continue behaviour, unchanged in either direction. The reasoning,
    // stated here rather than left to be re-derived:
    //
    //   * `clearEpicCookies` is the step that establishes the security property
    //     logout exists to establish (the next user of this OS profile must not
    //     open the login window already authenticated). It is also the only step
    //     with a MEASURED success signal — a post-removal delta — so "it did
    //     nothing" is observable here and nowhere else. A failure that is
    //     observable and load-bearing must not be swallowed; swallowing it is
    //     the exact defect class that produced the original lying self-report.
    //   * ANY failure of that step is fatal, not just the zero-total one. A step
    //     that threw (a rejected Rust-side clear, a window that never opened)
    //     removed nothing either — treating "removed nothing" as fatal while
    //     treating "crashed, therefore also removed nothing" as a warning would
    //     just move the fail-open one level over.
    //   * The other steps stay WARNINGS on purpose. `clearEpicStorage` is
    //     origin-scoped and reports counts that are legitimately zero (a user
    //     with no localStorage), so it has no zero-delta contract to promote;
    //     the Electron branch's five session.fromPartition steps are a legacy
    //     path this phase is removing wholesale. Promoting either without a
    //     measured defect would convert an unmeasured risk into a new failure
    //     mode, and the plan explicitly forbids changing their behaviour
    //     silently in either direction.
    //
    // The failure is CAPTURED and rethrown AFTER the credential-side cleanup,
    // never instead of it: `configStore.delete('userInfo')` + `clearCache` are
    // the security boundary and MUST run unconditionally (T-34.5-19, ASVS V3,
    // see this function's own note above). The remaining wipe steps also still
    // run — a fatal cookie step must not take the storage step down with it.
    let fatalWipeFailure: Error | null = null
    for (const [name, step] of wipeSteps) {
      try {
        await step()
      } catch (err) {
        if (name === FATAL_WIPE_STEP) {
          logError(
            [
              `Legendary logout step ${name} FAILED (logout will report failure):`,
              err
            ],
            LogPrefix.Legendary
          )
          fatalWipeFailure =
            err instanceof Error
              ? err
              : new Error(`Legendary logout step ${name} failed`)
          continue
        }
        logWarning(
          [
            `Legendary logout cookie-clear step ${name} failed (continuing):`,
            err
          ],
          LogPrefix.Legendary
        )
      }
    }

    configStore.delete('userInfo')
    clearCache('legendary')

    if (fatalWipeFailure !== null) {
      throw fatalWipeFailure
    }
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
