// Depot planning, CM half only (73-19, D-01): appinfo/PICS fetch, ownership, depot selection, depot
// keys and the bridge prescreen entry. No manifest is fetched or parsed here; Rust does that.

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { prescreenBridgeDepotsRust } from '../depotRust/secondary'
import { chooseInstallBranch, resolveUserBetaKey } from './betaBranch'
import {
  selectAllDepots,
  dlcAppIds,
  branchManifestGid,
  type SteamAppInfo,
  type OwnedSets,
  type DepotDescriptor,
  type DepotSelectOpts
} from './select'
import type { AppinfoOrder } from './appinfoOrder'
import { isNonRetryableDepotError } from '../depotErrors'
import {
  withTimeout,
  isTimeoutError,
  STEAM_PICS_TIMEOUT_MS,
  STEAM_PICS_BULK_TIMEOUT_MS
} from '../withTimeout'
import {
  NUMERIC_ID,
  type DepotSteamUser,
  type DownloadSteamDepotsOpts,
  type AppCommonName,
  type SteamUserDepotClient
} from './planModel'

export function assertNumericAppId(appId: string): void {
  if (!NUMERIC_ID.test(appId)) {
    throw new Error(
      `downloadSteamDepots: rejected non-numeric appId "${appId}"`
    )
  }
}

/** Sentinel error D-UAT-05's abort checks throw — downloadSteamDepots's catch
 *  block recognizes it (via opts.signal?.aborted, not instanceof, so ANY
 *  error racing with an already-aborted signal is still reported as
 *  'cancelled' rather than 'error') and maps it to a cancelled outcome
 *  instead of classifyDepotError's generic error surface. */
class DepotPlanAbortedError extends Error {
  constructor() {
    super('downloadSteamDepots: aborted during plan build')
    this.name = 'DepotPlanAbortedError'
  }
}

/**
 * D-UAT-05: the CM calls of a depot plan (acquireAuthenticated, getProductInfo x3,
 * getDepotDecryptionKey PER OWNED DEPOT) once never consulted the AbortSignal, so a cancel
 * issued while they ran had no effect until they all finished. For a many-depot game that phase
 * can run long. Called between every major step so an abort takes effect within roughly one
 * network round-trip.
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DepotPlanAbortedError()
  }
}

/** Never open a second logon (T-21-11). Phase 54: every caller holds an
 *  authenticated lease from SteamUser.acquireAuthenticated() (the depotRust entry points and
 *  downloadSharedRedistDepots), and the lease's
 *  client is the one SteamUser.getClient() returns while it is held. */
export function getDepotClient(
  steamUser: Pick<DepotSteamUser, 'getClient'>
): SteamUserDepotClient {
  const client = steamUser.getClient()
  if (!client) {
    throw new Error(
      'downloadSteamDepots: no authenticated steam-user client available after acquireAuthenticated()'
    )
  }
  return client as unknown as SteamUserDepotClient
}

/** D-UAT-06: bounded reconnect+retry for the CM phase of a depot plan.
 *  Total attempts a single plan-build network step (fetchAppInfo,
 *  getOwnedSets, fetchDlcInfos, or a single depot's fetchDepotKey) gets
 *  before its failure is allowed to propagate. Bounded — never unbounded —
 *  so a GENUINE, non-recoverable failure still surfaces promptly as an
 *  honest error instead of hanging (fix goal #2). */
export const PLAN_BUILD_MAX_ATTEMPTS = 3
/** Fixed pause between a failed attempt and the next retry, given AFTER
 *  ensureConnected() has already (re)settled — steam-user's own
 *  autoRelogin/ensureConnected already waits out the real reconnect race;
 *  this is just a short courtesy pause before hitting the CM again. */
const PLAN_BUILD_RETRY_DELAY_MS = 500

/** Resolves after `ms`, or immediately if/when `signal` aborts — so a cancel
 *  issued while a plan-build retry is backing off still takes effect
 *  promptly (never weakens D-UAT-05's abort semantics, D-UAT-06 fix goal #3). */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolvePromise()
      },
      { once: true }
    )
  })
}

/**
 * Runs `step` against the CURRENT authenticated client, retrying up to
 * PLAN_BUILD_MAX_ATTEMPTS times on failure (D-UAT-06). A mid-loop Steam CM
 * connection drop during the manifest/PICS phase previously hard-failed the
 * whole plan build with no recovery — for a large multi-depot game this
 * phase can run long enough for a transient drop to occur before a single
 * chunk is ever streamed (the chunk-phase retry in downloadDepotFiles is
 * never reached). On failure, re-runs SteamUser.acquireAuthenticated() (which
 * transparently reconnects — steam-user nulls out `steamID` the instant the
 * CM connection drops, so a stale `connected` check would never catch this)
 * and re-resolves getDepotClient() before the next attempt, since a
 * reconnect creates a NEW client instance — reusing the old (dead) client
 * reference would just fail again. throwIfAborted is consulted before every
 * attempt and the retry backoff is abort-interruptible, so a user cancel
 * during a retry wait still takes effect promptly (D-UAT-05 abort semantics
 * preserved — a network drop is never reported as a user cancel and a user
 * cancel is never silently retried).
 */
export async function withPlanBuildRetry<T>(
  steamUser: Pick<DepotSteamUser, 'getClient' | 'acquireAuthenticated'>,
  signal: AbortSignal | undefined,
  step: (client: SteamUserDepotClient) => Promise<T>,
  // [Timing] debug/steam-install-slow-start: optional label for temporary
  // per-step duration logging (see below). undefined = no logging (keeps
  // existing call sites/tests that don't pass a label unaffected).
  label?: string
): Promise<T> {
  let lastErr: unknown
  const overallStart = Date.now()
  for (let attempt = 1; attempt <= PLAN_BUILD_MAX_ATTEMPTS; attempt++) {
    throwIfAborted(signal)
    const attemptStart = Date.now()
    try {
      const result = await step(getDepotClient(steamUser))
      if (label) {
        logInfo(
          `[Timing] buildDepotRefs/${label}: attempt ${attempt} succeeded in ${Date.now() - attemptStart}ms (total ${Date.now() - overallStart}ms)`,
          LogPrefix.Steam
        )
      }
      return result
    } catch (err) {
      lastErr = err
      if (label) {
        logInfo(
          `[Timing] buildDepotRefs/${label}: attempt ${attempt} FAILED after ${Date.now() - attemptStart}ms`,
          LogPrefix.Steam
        )
      }
      // D-UAT-08: a terminal EResult (FileNotFound/AccessDenied/...) from
      // getDepotDecryptionKey recurs byte-for-byte identically
      // on every retry — it is never a transient CM drop. Fail fast instead
      // of burning all PLAN_BUILD_MAX_ATTEMPTS attempts (and the misleading
      // "connection dropped" copy classifyDepotError previously fell back to
      // after 3 pointless reconnects) on an error retrying can never fix.
      // WR-02: a withTimeout timeout is also non-retryable. The retry's
      // a bare reconnect returns instantly on the stale
      // fast-path socket (client.steamID still populated), so every retry
      // re-issues the same CM call against the same dead socket and re-hangs
      // a full bound — burning PLAN_BUILD_MAX_ATTEMPTS x bound instead of the
      // documented single deadline. Fail fast after ONE bound instead.
      if (isNonRetryableDepotError(err) || isTimeoutError(err)) {
        throw err
      }
      if (attempt === PLAN_BUILD_MAX_ATTEMPTS) break
      logWarning(
        [
          `downloadSteamDepots: plan-build step failed (attempt ${attempt}/${PLAN_BUILD_MAX_ATTEMPTS}), reconnecting and retrying:`,
          err
        ],
        LogPrefix.Steam
      )
      // Phase 54: the reconnect is a wrapped cold connect owned by SteamUser;
      // the outer lease (buildDepotRefs' caller) keeps the session alive, so
      // this inner lease is released at once.
      const retryLease = await steamUser.acquireAuthenticated({
        reason: 'plan-retry'
      })
      if (retryLease.ok) retryLease.release()
      throwIfAborted(signal)
      await delay(PLAN_BUILD_RETRY_DELAY_MS, signal)
    }
  }
  throw lastErr
}

/**
 * Owned appIds + depotIds derived from the authenticated user's package
 * licenses. Depot ownership is granted at the PACKAGE level (spike 001) — an
 * anonymous/PICS-only connection cannot supply this, which is why this must
 * run over the authenticated CM connection, never a second/anonymous one.
 */
async function getOwnedSets(client: SteamUserDepotClient): Promise<OwnedSets> {
  const packageIds = (client.licenses ?? [])
    .map((l) => (l as { package_id?: number }).package_id)
    .filter((id): id is number => typeof id === 'number')

  // G-30-02 (30-07): bounded so a stale-but-present CM socket rejects instead
  // of parking this await forever. WR-03: this is a BULK PICS fetch over every
  // package license — node-steam-user #144 flags large-library population as
  // legitimately slow, so it uses the larger STEAM_PICS_BULK_TIMEOUT_MS to
  // avoid false-tripping a healthy-but-slow large-library user.
  const { packages } = await withTimeout(
    client.getProductInfo([], packageIds, true),
    STEAM_PICS_BULK_TIMEOUT_MS,
    'getOwnedSets getProductInfo'
  )

  const apps = new Set<number>()
  const depots = new Set<number>()
  for (const pkg of Object.values(packages ?? {})) {
    const info = (
      pkg as { packageinfo?: { appids?: unknown[]; depotids?: unknown[] } }
    ).packageinfo
    for (const a of info?.appids ?? []) apps.add(Number(a))
    for (const d of info?.depotids ?? []) depots.add(Number(d))
  }
  return { apps, depots }
}

export async function fetchAppInfo(
  appinfoOrder: Pick<AppinfoOrder, 'withAppInfoOrderCapture'>,
  client: SteamUserDepotClient,
  numericAppId: number
): Promise<SteamAppInfo> {
  // G-30-02 (30-07): bounded — see getOwnedSets above.
  const { apps } = await withTimeout(
    appinfoOrder.withAppInfoOrderCapture(client, () =>
      client.getProductInfo([numericAppId], [], true)
    ),
    STEAM_PICS_TIMEOUT_MS,
    'fetchAppInfo getProductInfo'
  )
  const entry = apps?.[numericAppId]
  if (!entry) {
    throw new Error(
      `downloadSteamDepots: no PICS appinfo returned for appId ${numericAppId}`
    )
  }
  return entry.appinfo as unknown as SteamAppInfo
}

async function fetchDlcInfos(
  appinfoOrder: Pick<AppinfoOrder, 'withAppInfoOrderCapture'>,
  client: SteamUserDepotClient,
  appinfo: SteamAppInfo
): Promise<Record<string, SteamAppInfo>> {
  const dlcIds = dlcAppIds(appinfo)
  if (!dlcIds.length) return {}

  // G-30-02 (30-07): bounded — see getOwnedSets above. WR-03: many-appid bulk
  // fetch over the full DLC id list, so it uses STEAM_PICS_BULK_TIMEOUT_MS too.
  const { apps } = await withTimeout(
    appinfoOrder.withAppInfoOrderCapture(client, () =>
      client.getProductInfo(dlcIds, [], true)
    ),
    STEAM_PICS_BULK_TIMEOUT_MS,
    'fetchDlcInfos getProductInfo'
  )
  const out: Record<string, SteamAppInfo> = {}
  for (const id of dlcIds) {
    const entry = apps?.[id]
    if (entry) out[String(id)] = entry.appinfo as unknown as SteamAppInfo
  }
  return out
}

/**
 * D-UAT-08: getDepotDecryptionKey failures arrive as a bare
 * steam-user EResult name ("FileNotFound") with no depot/app context —
 * classifyDepotError's CDN/connection-drop pattern then swallowed them into
 * the misleading "Steam servers dropped the connection" copy. Wrap with the
 * depot id + owning appId + real EResult name so the failure is diagnosable,
 * and preserve `err.eresult` on the wrapped error so both
 * isNonRetryableDepotError (withPlanBuildRetry's fail-fast) and
 * classifyDepotError (the final user-facing message) still recognize it.
 */
function wrapDepotKeyError(
  err: Error,
  descriptor: DepotDescriptor,
  what: string
): Error {
  const wrapped = new Error(
    `couldn't get ${what} for depot ${descriptor.id} (app ${descriptor.ownerAppId}): ${err.message}`
  )
  const eresult = (err as Error & { eresult?: number }).eresult
  if (typeof eresult === 'number') {
    ;(wrapped as Error & { eresult?: number }).eresult = eresult
  }
  // G-23-01 (23-09, observability half only): log at the failure site — not
  // only inside the eventual install-failed message — naming the depot id,
  // the owning appId, and the EResult, so a blocked/terminal depot-key
  // failure is diagnosable without waiting for the whole install to fail and
  // get classified. Never logs the decryption key, the manifest GID payload,
  // or any account identifier (T-23-31) — only the three fields above, the
  // same ones wrapDepotKeyError's own message already composes.
  const ownershipNote =
    eresult === 40
      ? ' — GameLib selected this depot via the package-ownership gate; owning a depot does not guarantee Steam will issue its key'
      : ''
  logWarning(
    `fetchDepotKey: couldn't get ${what} for depot ${descriptor.id} (app ${descriptor.ownerAppId}): eresult=${eresult ?? 'unknown'}${ownershipNote}`,
    LogPrefix.Steam
  )
  return wrapped
}

/**
 * One depot's decryption key. The manifest itself is fetched and parsed by Rust (D-01).
 *
 * D-UAT-08: getDepotDecryptionKey is called with the depot's
 * OWNING appId (descriptor.ownerAppId — the base game for a base-app depot,
 * or the DLC/sub-app's own appId for a depot enumerated from that DLC's PICS
 * entry), never unconditionally the base game's appId. Steam authorizes some
 * depots (e.g. a DLC's own native macOS depots) only under the DLC/sub-app's
 * appId even though selectAllDepots's union makes the depot available to the
 * base game's install — requesting with the wrong appId fails with a
 * terminal FileNotFound/AccessDenied EResult (never a transient CM drop).
 */
export async function fetchDepotKey(
  client: SteamUserDepotClient,
  descriptor: DepotDescriptor
): Promise<Buffer> {
  const numericDepotId = Number(descriptor.id)
  const numericOwnerAppId = Number(descriptor.ownerAppId)

  // G-30-02 (30-07, checker finding #3 extension): these bare callback-Promise
  // CM round-trips are the SAME call-class as getProductInfo above — a socket
  // going stale MID-buildDepotRefs (after the earlier getProductInfo calls
  // already succeeded) could otherwise hang here just as easily. Bounded so a
  // stale-but-present CM socket rejects within STEAM_PICS_TIMEOUT_MS instead
  // of parking this await forever.
  return withTimeout(
    new Promise<Buffer>((resolve, reject) => {
      client.getDepotDecryptionKey(
        numericOwnerAppId,
        numericDepotId,
        (err, k) =>
          err
            ? reject(wrapDepotKeyError(err, descriptor, 'decryption key'))
            : resolve(k)
      )
    }),
    STEAM_PICS_TIMEOUT_MS,
    `fetchDepotKey:${descriptor.id} getDepotDecryptionKey`
  )
}

/** One selected depot with its decryption key and no manifest: what a Rust job needs from Node. */
export interface DepotRefEntry {
  depotId: string
  /** 64-bit manifest GID, a string end to end. */
  gid: string
  /** Never logged. */
  key: Buffer
  ownerAppId: string
  /** Position in the owner app's raw appinfo `depots` section; see depot/appinfoOrder.ts. */
  appinfoRank?: number
}

export interface DepotRefsResult {
  appId: string
  name: string
  buildid: string
  /** quick 261110-up7: the Steam beta branch selection, buildid and request codes use. */
  branch: string
  depots: DepotRefEntry[]
  /** Depot ids Steam refused with EResult 40 (Blocked), dropped from the install. */
  skippedDepots: string[]
  /** Every numeric depot id with a manifest on the branch (or public), across the base app and
   *  every fetched DLC app, with NO ownership/OS/language/arch/realm filter (WR-01). */
  branchDepotIds: string[]
  /** DLC app ids whose appinfo was actually fetched this run. */
  fetchedDlcAppIds: string[]
  /** False when the branch depot list cannot be shown complete: no numeric base depot, or a
   *  listed DLC app has no fetched entry. A retire decision needs this true. */
  branchDepotListComplete: boolean
}

/** The unfiltered branch depot list and completeness (WR-01). Pure. */
export function collectBranchDepotList(
  appinfo: SteamAppInfo,
  dlcInfos: Record<string, SteamAppInfo>,
  branch: string
): Pick<
  DepotRefsResult,
  'branchDepotIds' | 'fetchedDlcAppIds' | 'branchDepotListComplete'
> {
  const seen = new Set<string>()
  const branchDepotIds: string[] = []
  const take = (info: SteamAppInfo | undefined) => {
    for (const [id, d] of Object.entries(info?.depots ?? {})) {
      if (!/^\d+$/.test(id)) continue
      if (!branchManifestGid(d, branch, id, { log: false })) continue
      if (seen.has(id)) continue
      seen.add(id)
      branchDepotIds.push(id)
    }
  }
  take(appinfo)
  for (const dlc of Object.values(dlcInfos)) take(dlc)
  const baseHasDepots = Object.keys(appinfo?.depots ?? {}).some((k) =>
    /^\d+$/.test(k)
  )
  const missingDlc = dlcAppIds(appinfo).some((id) => !(String(id) in dlcInfos))
  return {
    branchDepotIds,
    fetchedDlcAppIds: Object.keys(dlcInfos),
    branchDepotListComplete: baseHasDepots && !missingDlc
  }
}

/**
 * The CM half of a depot job (73-13, D-04): appinfo, ownership, depot selection (select.ts) and
 * one decryption key per selected depot. It never fetches or parses a manifest; Rust does (D-01).
 * Precondition: the caller holds an authenticated lease (every depotRust entry point does).
 */
/** SteamID64 and Steam root for the localconfig.vdf leg; steamRoot only when there is an id. */
function resolveSteamIdentity(
  steamUser: Pick<DepotSteamUser, 'getPersistedSteamId64'>,
  config: DownloadSteamDepotsOpts['config']
): {
  steamId64?: string
  steamRoot?: string
} {
  const steamId64 = steamUser.getPersistedSteamId64()
  if (!steamId64) return {}
  try {
    const { defaultSteamPath } = config.getSettings()
    return { steamId64, steamRoot: defaultSteamPath.replaceAll("'", '') }
  } catch {
    return { steamId64 }
  }
}

export async function buildDepotRefs(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<DepotRefsResult> {
  const numericAppId = Number(appId)

  // D-UAT-06: every PICS/manifest network step below runs through
  // withPlanBuildRetry — bounded reconnect+retry instead of a single
  // ensureConnected() up front and no recovery from a mid-loop CM drop.
  const appinfo = await withPlanBuildRetry(
    opts.steamUser,
    opts.signal,
    (client) =>
      fetchAppInfo(opts.installRuntime.appinfoOrder, client, numericAppId),
    'fetchAppInfo'
  )
  throwIfAborted(opts.signal)
  const displayName =
    (appinfo as unknown as AppCommonName).common?.name ?? opts.installdir
  // quick 261110-up7: the branch the user picked in Steam (explicit override, else ACF
  // BetaKey, else localconfig.vdf), checked against the app's real branch list; anything
  // unusable falls back to 'public'.
  const requested =
    opts.branch ??
    (await resolveUserBetaKey(opts.installRuntime.depotJobs.transport, {
      appId,
      steamappsDir: opts.targetSteamappsDir,
      ...resolveSteamIdentity(opts.steamUser, opts.config)
    }))
  const branch = chooseInstallBranch(appinfo, requested, appId)
  // SPIKE 003 (throwaway): the chosen branch's current buildid, for the StateFlags=4
  // full-ownership manifest. `depots.branches` is a special (non-depot) key not
  // modelled by SteamAppInfo, so read it via a narrow cast.
  const buildid = String(
    (
      appinfo as unknown as {
        depots?: {
          branches?: Record<string, { buildid?: string | number } | undefined>
        }
      }
    ).depots?.branches?.[branch]?.buildid ?? ''
  )
  const owned = await withPlanBuildRetry(
    opts.steamUser,
    opts.signal,
    (client) => getOwnedSets(client),
    'getOwnedSets'
  )
  throwIfAborted(opts.signal)
  const dlcInfos = await withPlanBuildRetry(
    opts.steamUser,
    opts.signal,
    (client) =>
      fetchDlcInfos(opts.installRuntime.appinfoOrder, client, appinfo),
    'fetchDlcInfos'
  )
  throwIfAborted(opts.signal)

  const selectOpts: DepotSelectOpts = {
    os: opts.os,
    language: opts.language,
    branch
  }
  const descriptors = selectAllDepots(
    appinfo,
    dlcInfos,
    owned,
    selectOpts,
    appId
  )

  const depots: DepotRefEntry[] = []
  // G-23-01 (D-01/D-02/D-03): depot ids Steam refused with EResult 40
  // (Blocked) — dropped from the plan, install continues without them.
  const skippedDepots: string[] = []
  for (const descriptor of descriptors) {
    throwIfAborted(opts.signal)
    let key: Buffer
    try {
      key = await withPlanBuildRetry(
        opts.steamUser,
        opts.signal,
        (client) => fetchDepotKey(client, descriptor),
        `fetchDepotKey:${descriptor.id}`
      )
    } catch (err) {
      // D-01: narrowed to the LITERAL 40, never isNonRetryableDepotError —
      // that set also contains 8/9/15/17/42/43, and 15 (AccessDenied) / 17
      // (Banned) plausibly signal a genuine account/ownership problem that
      // must not be silently downgraded to "skipped a depot".
      if (skipBlockedDepot(err, descriptor, appId)) {
        skippedDepots.push(descriptor.id)
        continue
      }
      throw err
    }
    const rawOrder = opts.installRuntime.appinfoOrder.getAppInfoDepotOrder(
      descriptor.ownerAppId
    )
    const rank = rawOrder ? rawOrder.indexOf(descriptor.id) : -1
    depots.push({
      depotId: descriptor.id,
      gid: descriptor.manifest,
      key,
      ownerAppId: descriptor.ownerAppId ?? appId,
      ...(rank >= 0 ? { appinfoRank: rank } : {})
    })
  }

  throwIfAllDepotsSkipped(appId, depots.length, skippedDepots)
  return {
    appId,
    name: displayName,
    buildid,
    branch,
    depots,
    skippedDepots,
    ...collectBranchDepotList(appinfo, dlcInfos, branch)
  }
}

/** True (and logs) when `err` is Steam's EResult 40 (Blocked) for a depot: skip it, keep going. */
function skipBlockedDepot(
  err: unknown,
  descriptor: DepotDescriptor,
  appId: string
): boolean {
  const eresult = (err as Error & { eresult?: number }).eresult
  if (eresult !== 40) return false
  // logInfo, not logWarning — a skip is informational (the install is
  // continuing). Never logs the decryption key, the manifest GID payload,
  // or any account identifier (T-23-31).
  logInfo(
    `buildDepotRefs: skipping depot ${descriptor.id} (app ${descriptor.ownerAppId}) for appId ${appId} — Steam refused the key/manifest with eresult=40 (Blocked); the install is continuing without it`,
    LogPrefix.Steam
  )
  return true
}

/**
 * T-23.2-16: without this guard, a plan reduced to zero depots would fall
 * through downloadSteamDepots' zero-depot early return and report
 * { status: 'done' } — an install that downloaded NOTHING reported as a
 * success. eresult is set to 40 so classifyDepotError still maps this to
 * the existing steam.download.error.depotBlocked copy.
 */
function throwIfAllDepotsSkipped(
  appId: string,
  keptCount: number,
  skippedDepots: string[]
): void {
  if (keptCount || !skippedDepots.length) return
  const allSkippedErr = new Error(
    `buildDepotRefs: every selected depot for appId ${appId} was blocked by Steam (eresult=40) and had to be skipped: ${skippedDepots.join(', ')}`
  ) as Error & { eresult?: number }
  allSkippedErr.eresult = 40
  throw allSkippedErr
}

/**
 * D-51-06: the cheap pre-install screen, run before a pending-scan bridge title is routed so a
 * 64-bit-only title with no 64-bit shim never downloads into a bridge bottle it can never run
 * in. Rust answers it from a manifest summary (D-02); see prescreenBridgeDepotsRust.
 *
 * NEVER throws/rejects -- every failure mode (no CM connection, a PICS error, an aborted signal)
 * resolves 'unknown', which a caller must treat exactly like "never screened" (T-51-37). `os` is
 * always forced to 'windows': the bridge route is Windows-only.
 */
export async function prescreenBridgeDepots(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<'none' | 'x86' | 'x64' | 'both' | 'unknown'> {
  const prescreenStart = Date.now()
  const result = await prescreenBridgeDepotsRust(appId, opts)
  logInfo(
    `[Timing] prescreenBridgeDepots: appId ${appId} result=${result} in ${Date.now() - prescreenStart}ms`,
    LogPrefix.Steam
  )
  return result
}
