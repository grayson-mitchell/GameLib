// Depot plan building: appinfo/PICS fetch, per-depot plan entries, buildDepotPlan and the bridge prescreen (extracted from ../depot.ts, 62-09).

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { basename } from 'path'
import { SteamUser } from '../user'
import {
  selectAllDepots,
  dlcAppIds,
  type SteamAppInfo,
  type OwnedSets,
  type DepotDescriptor,
  type DepotSelectOpts
} from './select'
import { decryptFilename } from './crypto'
import {
  probeCaseInsensitiveVolume,
  resolveDepotPathCollisions
} from './pathCollisions'
import { getAppInfoDepotOrder, withAppInfoOrderCapture } from './appinfoOrder'
import { isNonRetryableDepotError } from '../depotErrors'
import { summarizeDepotFlags, formatDepotFlagsCensus } from './flagsCensus'
import {
  withTimeout,
  isTimeoutError,
  STEAM_PICS_TIMEOUT_MS,
  STEAM_PICS_BULK_TIMEOUT_MS
} from '../withTimeout'
import {
  NUMERIC_ID,
  type DownloadSteamDepotsOpts,
  type DepotPlanFile,
  type DepotPlanEntry,
  type DepotPlan,
  type AppCommonName,
  type ContentManifestModule,
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
 * D-UAT-05: buildDepotPlan's PICS/manifest network calls (acquireAuthenticated,
 * getProductInfo x3, getDepotDecryptionKey+getRawManifest PER OWNED DEPOT)
 * previously never consulted the AbortSignal at all — a stop()/cancel()
 * issued while the plan was still being built had NO effect until the whole
 * plan finished and downloadDepotFiles's own per-chunk signal checks took
 * over. For a many-depot game that phase can run long, so cancel appeared
 * "non-functional". Called between every major step below so an abort takes
 * effect within roughly one network round-trip instead of the whole plan.
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DepotPlanAbortedError()
  }
}

/** Never open a second logon (T-21-11). Phase 54: every caller holds an
 *  authenticated lease from SteamUser.acquireAuthenticated() (buildDepotPlan,
 *  downloadSelectedDepotFiles, downloadSharedRedistDepots), and the lease's
 *  client is the one SteamUser.getClient() returns while it is held. */
export function getDepotClient(): SteamUserDepotClient {
  const client = SteamUser.getClient()
  if (!client) {
    throw new Error(
      'downloadSteamDepots: no authenticated steam-user client available after acquireAuthenticated()'
    )
  }
  return client as unknown as SteamUserDepotClient
}

/** D-UAT-06: bounded reconnect+retry for buildDepotPlan's manifest/PICS phase.
 *  Total attempts a single plan-build network step (fetchAppInfo,
 *  getOwnedSets, fetchDlcInfos, or a single depot's fetchDepotPlanEntry) gets
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
      const result = await step(getDepotClient())
      if (label) {
        logInfo(
          `[Timing] buildDepotPlan/${label}: attempt ${attempt} succeeded in ${Date.now() - attemptStart}ms (total ${Date.now() - overallStart}ms)`,
          LogPrefix.Steam
        )
      }
      return result
    } catch (err) {
      lastErr = err
      if (label) {
        logInfo(
          `[Timing] buildDepotPlan/${label}: attempt ${attempt} FAILED after ${Date.now() - attemptStart}ms`,
          LogPrefix.Steam
        )
      }
      // D-UAT-08: a terminal EResult (FileNotFound/AccessDenied/...) from
      // getDepotDecryptionKey/getRawManifest recurs byte-for-byte identically
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
      // the outer lease (buildDepotPlan et al.) keeps the session alive, so
      // this inner lease is released at once.
      const retryLease = await SteamUser.acquireAuthenticated({
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
  client: SteamUserDepotClient,
  numericAppId: number
): Promise<SteamAppInfo> {
  // G-30-02 (30-07): bounded — see getOwnedSets above.
  const { apps } = await withTimeout(
    withAppInfoOrderCapture(client, () =>
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
  client: SteamUserDepotClient,
  appinfo: SteamAppInfo
): Promise<Record<string, SteamAppInfo>> {
  const dlcIds = dlcAppIds(appinfo)
  if (!dlcIds.length) return {}

  // G-30-02 (30-07): bounded — see getOwnedSets above. WR-03: many-appid bulk
  // fetch over the full DLC id list, so it uses STEAM_PICS_BULK_TIMEOUT_MS too.
  const { apps } = await withTimeout(
    withAppInfoOrderCapture(client, () =>
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
 * Dynamically loads steam-user's internal raw-manifest parser. The export path
 * is undocumented (Pitfall 5) — a loud throw here (not a silent failure) is
 * what surfaces a future steam-user version bump that moves/renames this file.
 */
export async function loadContentManifestParser(): Promise<ContentManifestModule> {
  const mod = await import('steam-user/components/content_manifest.js')
  const candidate =
    (mod as { default?: unknown }).default ??
    (mod as unknown as ContentManifestModule)
  if (typeof (candidate as ContentManifestModule)?.parse !== 'function') {
    throw new Error(
      'downloadSteamDepots: steam-user/components/content_manifest.js no longer exports a ' +
        'parse(buffer) function — this internal path is undocumented (T-21-10) and may have ' +
        'moved on a steam-user version bump. Pin the version and re-verify the export shape ' +
        'before proceeding.'
    )
  }
  return candidate as ContentManifestModule
}

/**
 * D-UAT-08: getDepotDecryptionKey/getRawManifest failures arrive as a bare
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
    `fetchDepotPlanEntry: couldn't get ${what} for depot ${descriptor.id} (app ${descriptor.ownerAppId}): eresult=${eresult ?? 'unknown'}${ownershipNote}`,
    LogPrefix.Steam
  )
  return wrapped
}

/**
 * Fetch, parse, and decrypt a single depot's manifest. Both `filename` and
 * `linktarget` (37-09) are decrypted OURSELVES (steam-user truncates them at
 * block boundaries — spike 002 finding); every file size is coerced through
 * Number() for the D-03 sum.
 *
 * D-UAT-08: getDepotDecryptionKey/getRawManifest are called with the depot's
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
  // going stale MID-buildDepotPlan (after the earlier getProductInfo calls
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
    `fetchDepotPlanEntry:${descriptor.id} getDepotDecryptionKey`
  )
}

export async function fetchDepotPlanEntry(
  client: SteamUserDepotClient,
  descriptor: DepotDescriptor,
  parser: ContentManifestModule
): Promise<DepotPlanEntry> {
  const key = await fetchDepotKey(client, descriptor)
  return fetchDepotManifestEntry(client, descriptor, key, parser)
}

/** The manifest half of {@link fetchDepotPlanEntry}, for a caller that already holds the key. */
async function fetchDepotManifestEntry(
  client: SteamUserDepotClient,
  descriptor: DepotDescriptor,
  key: Buffer,
  parser: ContentManifestModule
): Promise<DepotPlanEntry> {
  const numericDepotId = Number(descriptor.id)
  const numericOwnerAppId = Number(descriptor.ownerAppId)

  const raw = await withTimeout(
    new Promise<Buffer>((resolve, reject) => {
      client.getRawManifest(
        numericOwnerAppId,
        numericDepotId,
        descriptor.manifest,
        'public',
        (err, m) =>
          err
            ? reject(wrapDepotKeyError(err, descriptor, 'manifest'))
            : resolve(m)
      )
    }),
    STEAM_PICS_TIMEOUT_MS,
    `fetchDepotPlanEntry:${descriptor.id} getRawManifest`
  )

  const parsed = parser.parse(raw)
  const files: DepotPlanFile[] = (parsed.files ?? []).map((f) => ({
    filename: decryptFilename(f.filename, key),
    size: Number(f.size),
    sha_content: f.sha_content,
    flags: f.flags,
    // 37-09: linktarget is encrypted with the depot key in EXACTLY the same
    // format as filename (proto field 7, same message) and must be decrypted
    // here, not passed through — the write site symlinks this value verbatim.
    // Presence-conditional because decryptFilename('' | undefined) throws
    // (ERR_CRYPTO_INVALID_IV / TypeError) and most files have no linktarget.
    linktarget: f.linktarget
      ? decryptFilename(f.linktarget, key)
      : f.linktarget,
    chunks: f.chunks ?? []
  }))

  return {
    depotId: descriptor.id,
    gid: descriptor.manifest,
    key,
    files
  }
}

/**
 * Resolve every owned depot for `appId`, fetch + parse + decrypt each depot's
 * manifest, and return the enqueue-time DepotPlan (real summed totalBytes,
 * D-03). Gates on an authenticated Steam CM connection before any network work
 * (T-21-11) and validates appId as numeric before touching it at all (T-21-05).
 *
 * This is the PLAN-BUILDING half only — it never touches disk or the network
 * beyond PICS/manifest fetch. Exported (rather than kept private) so it stays
 * independently unit-testable, matching this module's own established
 * front-half/back-half split (21-04/21-05). `downloadSteamDepots` (Plan 06,
 * below downloadDepotFiles) is the public orchestrator that calls this, then
 * streams the files, then ALWAYS converges on finalizeToSteam — this function
 * itself still throws/rejects on a guard failure (non-numeric appId, no
 * authenticated connection), since it is an internal building block, not the
 * top-level entry point Plan 07's SteamGame.install() calls.
 */
export async function buildDepotPlan(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<DepotPlan> {
  assertNumericAppId(appId)
  throwIfAborted(opts.signal)

  // Phase 54: the plan body holds an authenticated lease for its whole
  // length (the gated, refcounted session in user.ts) and releases it on
  // every exit, including a thrown step error and an abort.
  const lease = await SteamUser.acquireAuthenticated({
    reason: opts.sessionReason ?? 'user-install',
    guidedAction: 'install',
    appName: appId
  })
  try {
    throwIfAborted(opts.signal)
    if (!lease.ok) {
      logWarning(
        `downloadSteamDepots: no authenticated Steam CM connection for appId ${appId} (${lease.reason})`,
        LogPrefix.Steam
      )
      throw new Error(
        `downloadSteamDepots: no authenticated Steam CM connection available for appId ${appId} (${lease.reason})`
      )
    }
    return await buildDepotPlanLeased(appId, opts)
  } finally {
    if (lease.ok) lease.release()
  }
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
  depots: DepotRefEntry[]
  /** Depot ids Steam refused with EResult 40 (Blocked), dropped from the install. */
  skippedDepots: string[]
}

/**
 * The CM-only half of {@link buildDepotPlan} (73-13, D-04): appinfo, ownership, depot selection
 * (select.ts) and one decryption key per selected depot. It never fetches or parses a manifest.
 * Precondition: the caller holds an authenticated lease (buildDepotPlan and the Rust install
 * path both do). Throws exactly what buildDepotPlan throws for the same failures.
 */
export async function buildDepotRefs(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<DepotRefsResult> {
  const numericAppId = Number(appId)

  // D-UAT-06: every PICS/manifest network step below runs through
  // withPlanBuildRetry — bounded reconnect+retry instead of a single
  // ensureConnected() up front and no recovery from a mid-loop CM drop.
  const appinfo = await withPlanBuildRetry(
    opts.signal,
    (client) => fetchAppInfo(client, numericAppId),
    'fetchAppInfo'
  )
  throwIfAborted(opts.signal)
  const displayName =
    (appinfo as unknown as AppCommonName).common?.name ?? opts.installdir
  // SPIKE 003 (throwaway): current public-branch buildid, for the StateFlags=4
  // full-ownership manifest. `depots.branches` is a special (non-depot) key not
  // modelled by SteamAppInfo, so read it via a narrow cast.
  const buildid = String(
    (
      appinfo as unknown as {
        depots?: { branches?: { public?: { buildid?: string | number } } }
      }
    ).depots?.branches?.public?.buildid ?? ''
  )
  const owned = await withPlanBuildRetry(
    opts.signal,
    (client) => getOwnedSets(client),
    'getOwnedSets'
  )
  throwIfAborted(opts.signal)
  const dlcInfos = await withPlanBuildRetry(
    opts.signal,
    (client) => fetchDlcInfos(client, appinfo),
    'fetchDlcInfos'
  )
  throwIfAborted(opts.signal)

  const selectOpts: DepotSelectOpts = {
    os: opts.os,
    language: opts.language
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
    const rawOrder = getAppInfoDepotOrder(descriptor.ownerAppId)
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
  return { appId, name: displayName, buildid, depots, skippedDepots }
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
    `buildDepotPlan: skipping depot ${descriptor.id} (app ${descriptor.ownerAppId}) for appId ${appId} — Steam refused the key/manifest with eresult=40 (Blocked); the install is continuing without it`,
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
    `buildDepotPlan: every selected depot for appId ${appId} was blocked by Steam (eresult=40) and had to be skipped: ${skippedDepots.join(', ')}`
  ) as Error & { eresult?: number }
  allSkippedErr.eresult = 40
  throw allSkippedErr
}

async function buildDepotPlanLeased(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<DepotPlan> {
  // [Timing] debug/steam-install-slow-start: total buildDepotPlan duration,
  // reported at every return/throw path below. Temporary instrumentation.
  const planStart = Date.now()

  const refs = await buildDepotRefs(appId, opts)
  const { name: displayName, buildid } = refs

  if (!refs.depots.length) {
    logInfo(
      `[Timing] buildDepotPlan: total ${Date.now() - planStart}ms for appId ${appId} (0 depots)`,
      LogPrefix.Steam
    )
    const emptyPlan: DepotPlan = {
      appId,
      depots: [],
      totalBytes: 0,
      name: displayName,
      buildid,
      // Nothing was ever selected here, so there is nothing to have skipped
      // (buildDepotRefs throws when every selected depot was blocked).
      skippedDepots: []
    }
    // 23-06: census logged on the returned plan before it leaves plan-build —
    // paired with downloadDepotFiles' stage=download-entry census so a
    // flags-dropping serialization boundary is directly observable (H5).
    logInfo(
      `steam-flags-census stage=plan-build appId=${appId} depots=0 ` +
        formatDepotFlagsCensus(summarizeDepotFlags(emptyPlan)) +
        ` skipped=${emptyPlan.skippedDepots.join(',')}`,
      LogPrefix.Steam
    )
    return emptyPlan
  }

  const parser = await loadContentManifestParser()

  const depots: DepotPlanEntry[] = []
  const skippedDepots: string[] = [...refs.skippedDepots]
  let totalBytes = 0
  for (const ref of refs.depots) {
    throwIfAborted(opts.signal)
    const descriptor: DepotDescriptor = {
      id: ref.depotId,
      manifest: ref.gid,
      size: 0,
      ownerAppId: ref.ownerAppId
    }
    let entry: DepotPlanEntry
    try {
      entry = await withPlanBuildRetry(
        opts.signal,
        (client) =>
          fetchDepotManifestEntry(client, descriptor, ref.key, parser),
        `fetchDepotPlanEntry:${descriptor.id}`
      )
    } catch (err) {
      // D-01: only the literal EResult 40 is skipped; every other
      // non-retryable code rethrows and still aborts the whole install.
      if (skipBlockedDepot(err, descriptor, appId)) {
        skippedDepots.push(descriptor.id)
        continue
      }
      throw err
    }
    entry.ownerAppId = ref.ownerAppId
    if (ref.appinfoRank !== undefined) entry.appinfoRank = ref.appinfoRank
    depots.push(entry)
    // D-03: totalBytes is downstream of the `continue` above — a skipped
    // depot's files never reach this accumulation.
    totalBytes += entry.files.reduce((sum, f) => sum + Number(f.size), 0)
  }

  throwIfAllDepotsSkipped(appId, depots.length, skippedDepots)

  // debug/steam-depot-unclassified-generic-error: two selected depots can
  // claim the SAME path with incompatible types (Fallout 2 ships `master.dat`
  // as a Directory marker in depot 38414 and as a 333MB file in 38415). Both
  // depots are correctly selected, so this must be resolved on the plan before
  // the write loop can race on it. Directory-marker drops are size 0; dropped
  // real files (appinfo-rank rule) are subtracted from `totalBytes` below.
  // quick 261026-nhy: on a case-insensitive destination volume, paths that
  // differ only in letter case are ONE file, so collisions are bucketed on
  // the case-folded path (probed once, read-only, and carried on the plan).
  const caseInsensitivePaths = await probeCaseInsensitiveVolume(
    opts.targetSteamappsDir
  )
  logInfo(
    `buildDepotPlan: appId=${appId} destination volume case-insensitive=${caseInsensitivePaths} (probed ${opts.targetSteamappsDir})`,
    LogPrefix.Steam
  )
  totalBytes -= resolveDepotPathCollisions(
    { appId, depots },
    { caseInsensitive: caseInsensitivePaths }
  ).droppedBytes

  logInfo(
    `[Timing] buildDepotPlan: total ${Date.now() - planStart}ms for appId ${appId} (${depots.length} depot(s))`,
    LogPrefix.Steam
  )

  const plan: DepotPlan = {
    appId,
    depots,
    totalBytes,
    name: displayName,
    buildid,
    skippedDepots,
    caseInsensitivePaths
  }
  // 23-06: census logged on the returned plan before it leaves plan-build —
  // paired with downloadDepotFiles' stage=download-entry census so a
  // flags-dropping serialization boundary is directly observable (H5).
  // 23.2-03: skipped-depot ids appended so a skip is observable before any
  // bytes download, even on a subsequently cancelled install.
  logInfo(
    `steam-flags-census stage=plan-build appId=${appId} depots=${depots.length} ` +
      formatDepotFlagsCensus(summarizeDepotFlags(plan)) +
      ` skipped=${skippedDepots.join(',')}`,
    LogPrefix.Steam
  )

  return plan
}

/**
 * D-51-06 (Phase 51 Plan 17): pure, side-effect-free classifier over an
 * already-built plan's file list -- never touches the network or disk.
 * Depot filenames use Windows separators (`system\steam_api64.dll`); they are
 * separator-normalised before the basename is taken.
 * Case-insensitive BASENAME match only (any directory), so
 * `backup/steam_api.dll.bak` is correctly NOT counted (its basename is
 * `steam_api.dll.bak`, not `steam_api.dll`).
 */
export function screenDepotPlanForSteamApi(
  plan: Pick<DepotPlan, 'depots'>
): 'none' | 'x86' | 'x64' | 'both' {
  let hasX86 = false
  let hasX64 = false
  for (const depot of plan.depots) {
    for (const file of depot.files) {
      // Depot manifest filenames use Windows separators; POSIX basename()
      // would not split them (todo 2026-10-22-bridge-prescreen-always-returns-none).
      const name = basename(file.filename.replace(/\\/g, '/')).toLowerCase()
      if (name === 'steam_api.dll') {
        hasX86 = true
      } else if (name === 'steam_api64.dll') {
        hasX64 = true
      }
    }
  }
  if (hasX86 && hasX64) return 'both'
  if (hasX64) return 'x64'
  if (hasX86) return 'x86'
  return 'none'
}

/**
 * D-51-06: the cheap pre-install screen ROADMAP sub-decision 2 left open --
 * measured by research as NOT free (a second, separate buildDepotPlan call,
 * PICS + manifest only, never chunk bytes). games.ts (Plan 17's install()
 * wiring) calls this BEFORE routing a pending-scan bridge title, so a
 * 64-bit-only title with no 64-bit shim never downloads into a bridge
 * bottle it can never run in.
 *
 * NEVER throws/rejects -- every failure mode (no CM connection, a PICS
 * error, an aborted signal) resolves 'unknown', which a caller must treat
 * exactly like "never screened" (T-51-37: a screen failure must never block
 * an install). `os` is always forced to 'windows' regardless of the
 * caller's own `opts.os` -- the bridge route is Windows-only, so screening
 * any other platform's depot selection would answer the wrong question.
 */
export async function prescreenBridgeDepots(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<'none' | 'x86' | 'x64' | 'both' | 'unknown'> {
  const prescreenStart = Date.now()
  let result: 'none' | 'x86' | 'x64' | 'both' | 'unknown'
  try {
    const plan = await buildDepotPlan(appId, {
      ...opts,
      os: 'windows',
      sessionReason: 'prescreen'
    })
    result = screenDepotPlanForSteamApi(plan)
  } catch (err) {
    logWarning(
      `[Timing] prescreenBridgeDepots: appId ${appId} failed, treating as 'unknown' (install proceeds): ${String(err)}`,
      LogPrefix.Steam
    )
    result = 'unknown'
  }
  logInfo(
    `[Timing] prescreenBridgeDepots: appId ${appId} result=${result} in ${Date.now() - prescreenStart}ms`,
    LogPrefix.Steam
  )
  return result
}
