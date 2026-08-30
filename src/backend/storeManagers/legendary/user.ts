import { existsSync, readFileSync } from 'graceful-fs'

import { UserInfo } from 'common/types'
import { clearCache } from '../../utils'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { userInfo as user } from 'os'
import { session } from 'backend/platform'
import { libraryManagerMap } from '..'
import { LegendaryCommand } from './commands'
import { NonEmptyString } from './commands/base'
import { configStore } from 'backend/constants/key_value_stores'
import { legendaryUserInfo } from './constants'
import {
  getLoginWindowSeam,
  classifyCookieRead,
  type CookieReadVerdict
} from '../../humble/loginWindowSeam'
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
              //
              // Phase 35 plan 23 (REQ-35-07, D-35-19-15, CR-04 part 2): a bare
              // per-domain delta cannot tell "no cookies were present" from
              // "the clear did not work" — D-35-19-15 measured exactly that
              // ambiguity live (four of five domains returned 0, only the
              // primary domain exercised a real removal). This ports
              // humble/user.ts's disconnect() before/after jar CENSUS so every
              // zero is self-interpreting. `everProvedLive` is SHARED across
              // the whole sweep (every host, both sides) — mirroring Humble's
              // single flag — because it exists to prove the cookiesForDomain
              // RPC channel itself still works, a property of the channel, not
              // of any one domain's content: once ANY read anywhere in this
              // sweep has returned a non-zero unfiltered jar size, a LATER
              // zero from any other host is trustworthy as "genuinely empty"
              // rather than "the read API silently did nothing"
              // (navigator-clipboard-noops-under-tauri, applied to cookies).
              let everProvedLive = false

              interface HostCookieCensus {
                // The UNFILTERED jar size at this read, or `null` if the read
                // itself rejected. Proves the read CHANNEL is alive,
                // independent of which host was queried.
                jarTotal: number | null
                // Cookies whose own domain is `host` or a subdomain of it —
                // the domain-scoped count for THIS host specifically.
                matched: number
                // classifyCookieRead over the JAR-WIDE `jarTotal` — the
                // log-facing verdict, mirroring humble/user.ts's disconnect()
                // census exactly.
                verdict: CookieReadVerdict
              }

              const readHostCensus = async (
                host: string
              ): Promise<HostCookieCensus> => {
                try {
                  const read = await seam.cookiesForDomain(label, host, [])
                  if (read.total > 0) everProvedLive = true
                  return {
                    jarTotal: read.total,
                    matched: read.matched.length,
                    verdict: classifyCookieRead({
                      total: read.total,
                      everProvedLive
                    })
                  }
                } catch (err) {
                  // A rejecting census read must NEVER block or fail the
                  // clear — the clear is the user-visible operation, the
                  // census is evidence about it (mirrors
                  // humble/user.ts's disconnect()).
                  logWarning(
                    [
                      `Legendary logout: ${host} cookie census read failed (non-fatal, evidence unavailable for this side):`,
                      err
                    ],
                    LogPrefix.Legendary
                  )
                  return {
                    jarTotal: null,
                    matched: 0,
                    verdict: classifyCookieRead({
                      total: null,
                      everProvedLive
                    })
                  }
                }
              }

              const fmtSide = (c: HostCookieCensus): string =>
                c.jarTotal === null
                  ? `total=unavailable, matched=unavailable, verdict=${c.verdict}`
                  : `total=${c.jarTotal}, matched=${c.matched}, verdict=${c.verdict}`

              // Domain-scoped liveness classification, used ONLY for the
              // fatality decision below (CR-04 part 2, D-35-19-15) — never
              // logged directly, so gamelib.log never carries two
              // differently-scoped verdicts side by side. Classifying on
              // `matched` (not `jarTotal`) is what lets a genuinely Epic-empty
              // jar (a legendary CLI-only auth, or a profile migrated from
              // another launcher, with Humble/GOG/Steam cookies still present
              // elsewhere in the same shared jar) read as SUPPORTED_BUT_EMPTY
              // rather than SUPPORTED_NONEMPTY: `matched` reflects THIS host's
              // own cookies, and the shared `everProvedLive` flag is what
              // makes a matched-zero here trustworthy rather than
              // indistinguishable from a dead read channel.
              const domainVerdict = (c: HostCookieCensus): CookieReadVerdict =>
                classifyCookieRead({ total: c.matched, everProvedLive })

              let total = 0
              const perDomain: string[] = []
              const hostRecords: Array<{
                host: string
                before: HostCookieCensus
                deleted: number
              }> = []
              for (const host of EPIC_COOKIE_HOSTS) {
                const before = await readHostCensus(host)
                const deleted = await seam.clearCookies(label, host)
                const after = await readHostCensus(host)
                hostRecords.push({ host, before, deleted })
                total += deleted
                perDomain.push(`${host}=${deleted}`)
                // Only COUNTS, VERDICT enum values and DOMAIN names are
                // logged — never a cookie name, value, token or account
                // identifier (mirrors humble/user.ts's disconnect(); this
                // repo is public, T-35-04). `deleted` is a measured
                // post-removal delta (Plan 23), not an attempted count: it
                // comes from a re-read of the jar taken AFTER the removal
                // ran. The census format below is recorded verbatim in
                // 35-23-SUMMARY.md because plan 35-29 greps the live
                // gamelib.log for it.
                logInfo(
                  `Legendary logout: cleared ${deleted} ${host} cookie(s) (measured post-removal delta) ` +
                    `— cookie census before(${fmtSide(before)}) after(${fmtSide(after)})`,
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
              // Phase 35 plan 23 (CR-04 part 2, D-35-19-15): fatality is now
              // decided from the per-host BEFORE census, not from the bare
              // summed total alone. Three cases, in priority order:
              //
              //   1. A host whose domain-scoped BEFORE census proves it was
              //      genuinely populated (`domainVerdict` SUPPORTED_NONEMPTY)
              //      but whose measured post-removal delta is zero — the
              //      clear is BROKEN for that specific host. Checked
              //      REGARDLESS of the summed total, because a healthy
              //      primary-domain clear can mask a broken secondary-domain
              //      clear inside a nonzero sum — exactly the shape
              //      D-35-19-15 measured live (four of five domains returned
              //      0, and a bare sum could not tell "broken" from "never
              //      visited").
              //   2. Otherwise, a nonzero summed total is a clean success —
              //      something real was removed and no host was proven
              //      broken.
              //   3. Otherwise (summed total is zero and no host was proven
              //      broken): if EVERY host's domain census proves the jar
              //      was genuinely empty for Epic specifically
              //      (SUPPORTED_BUT_EMPTY, not merely unreadable), the logout
              //      is NOT fatal — a user who authenticated through a path
              //      that seeds no Epic cookies in this data store (a
              //      legendary CLI `auth`, or a profile migrated from another
              //      launcher) legitimately has nothing to clear. Otherwise
              //      fail CLOSED, exactly as before this plan: an unreadable
              //      jar must never be treated as an empty one — that is
              //      precisely the substitution CR-04 part 2 is about.
              const brokenHosts = hostRecords.filter(
                (r) =>
                  domainVerdict(r.before) === 'SUPPORTED_NONEMPTY' &&
                  r.deleted === 0
              )
              if (brokenHosts.length > 0) {
                throw new Error(
                  `Legendary logout: domain-scoped cookie clear removed nothing for ` +
                    `${brokenHosts.map((r) => r.host).join(', ')} despite the jar proving ` +
                    `cookies were present beforehand (${perDomain.join(', ')})`
                )
              } else if (total === 0) {
                const allProvenEmpty = hostRecords.every(
                  (r) => domainVerdict(r.before) === 'SUPPORTED_BUT_EMPTY'
                )
                if (allProvenEmpty) {
                  logInfo(
                    `Legendary logout: Epic cookie jar was already empty across all ` +
                      `${EPIC_COOKIE_HOSTS.length} Epic-owned domains — nothing to clear`,
                    LogPrefix.Legendary
                  )
                } else {
                  throw new Error(
                    `Legendary logout: domain-scoped cookie clear removed nothing across all ` +
                      `${EPIC_COOKIE_HOSTS.length} Epic-owned domains (${perDomain.join(', ')})`
                  )
                }
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
