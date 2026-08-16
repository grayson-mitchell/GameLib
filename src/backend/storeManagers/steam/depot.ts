// Phase 21 (21-04): Depot-download orchestrator — front half.
//
// Given an appId, an authenticated steam-user CM connection, and a target
// directory + os filter, resolves every OWNED depot (Plan 01 select.ts),
// fetches + parses each depot's raw manifest, decrypts filenames (steam-user
// truncates them — Plan 01 crypto.ts does this correctly), and computes the
// REAL total byte count summed across every depot (D-03) — replacing the
// pc_requirements-derived estimate `getSteamInstallSize` used previously.
//
// This is the enqueue-time contract the DownloadManager needs before a single
// chunk is fetched. The streaming download loop is Plan 05; recovery/finalize
// (writeAppManifest) is Plan 06 — this module only builds the plan.

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type SteamUserLib from 'steam-user'
import {
  open,
  mkdir,
  readdir,
  stat,
  symlink,
  rm,
  chmod,
  type FileHandle
} from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative, dirname, isAbsolute, join } from 'path'
import { getFileSize } from 'backend/utils'
import { sendFrontendMessage } from '../../ipc'
import { SteamUser } from './user'
import {
  selectAllDepots,
  dlcAppIds,
  type SteamAppInfo,
  type OwnedSets,
  type DepotDescriptor,
  type DepotSelectOpts
} from './depot/select'
import { decryptFilename } from './depot/crypto'
import {
  fetchChunk,
  isDecodeStageError,
  type LzmaModule,
  type DepotChunk,
  type DecodeFn,
  type OnChunkAttempt,
  type ContentServerHostMeta
} from './depot/decompress'
import { HostHealthTracker } from './depot/hostHealth'
import { CdnAuthTokenCache } from './depot/cdnAuth'
import { StallTracker } from './depot/stallTracker'
import { DecompressPool } from './depot/decompressPool'
import { writeAppManifest } from './depot/manifest'
import { applyDepotFileFlags } from './depot/fileAttributes'
import { reconcilePartialState } from './depot/reconcile'
import { classifyDepotError, isNonRetryableDepotError } from './depotErrors'
import { summarizeDepotFlags, formatDepotFlagsCensus } from './depot/flagsCensus'
import {
  withTimeout,
  isTimeoutError,
  STEAM_PICS_TIMEOUT_MS,
  STEAM_PICS_BULK_TIMEOUT_MS
} from './withTimeout'

/** Numeric-only guard for appId before any network/filesystem use (T-21-05). */
const NUMERIC_ID = /^\d+$/

/** EDepotFileFlag bit values, per steam-user's own authoritative enum
 *  (node_modules/steam-user/enums/EDepotFileFlag.js) — Directory = 64,
 *  Symlink = 512. Hardcoded here rather than imported since steam-user does
 *  not export this enum from its public entrypoint (CR-01 gap closure, 21-13).
 *  Exported (23-06) so depot/flagsCensus.ts's census summarizer imports
 *  these rather than re-literalling the numeric bit values. */
export const DIRECTORY_FLAG = 64
export const SYMLINK_FLAG = 512
// SPIKE 003 finding: EDepotFileFlag.Executable (32) / CustomExecutable (128).
// Steam's 1026 verify pass sets the +x bit from these flags; the StateFlags=4
// full-ownership path skips verify, so GameLib must apply them itself or the
// game binary lands non-executable and launch fails with macOS `os error 256`.
export const EXECUTABLE_FLAG = 32
export const CUSTOM_EXECUTABLE_FLAG = 128
// Phase 23 (23-01, D-06): ReadOnly/Hidden — the other half of the same gap.
// Steam's 1026 verify pass would also set these; StateFlags=4 skips verify,
// so GameLib must apply them itself via depot/fileAttributes.ts.
export const READONLY_FLAG = 8
export const HIDDEN_FLAG = 16

/**
 * Per-`downloadDepotFiles`-invocation chmod/mode-application counters (23-06,
 * G-23-02 trace instrumentation). MUST be created fresh for every invocation
 * — NEVER module-level. `downloadDepotFiles` is single-flight PER APPID
 * (23-05), not globally single-flight, so two concurrent installs for
 * different appIds are supported, regression-tested product behavior; a
 * module-level counter would let one run's chmods silently corrupt another
 * run's count (the exact cross-run leak T-23-27 exists to prevent — 23-08
 * turns `chmodAttempts` into the fail-closed input for the StateFlags=4/1026
 * decision).
 */
export interface DepotModeCounters {
  /** Incremented only on the branch that actually calls `chmod(dest, 0o755)`. */
  chmodAttempts: number
  /** Incremented on every entry to `applyEDepotFileModes`, regardless of
   *  which branch (if any) fires. */
  modeCallsites: number
}

export interface DownloadSteamDepotsOpts {
  targetSteamappsDir: string
  installdir: string
  /** Required — never defaulted to the host OS here (select.ts's own discipline). */
  os: string
  language?: string
  signal?: AbortSignal
}

/** One chunk within a depot manifest file, exactly as steam-user's raw manifest
 *  parser returns it (offset/sha/cb_original — consumed unmodified by Plan 05's
 *  streaming download loop). */
export interface DepotPlanChunk {
  sha: string | Buffer
  cb_original: number | string
  offset: number | string
  [key: string]: unknown
}

/** One file within a depot manifest, with its filename DECRYPTED — steam-user's
 *  own filename field is truncated at block boundaries and must never be used
 *  directly (RESEARCH.md "Don't Hand-Roll" / spike 002 finding). */
export interface DepotPlanFile {
  filename: string
  size: number
  sha_content: string | Buffer
  chunks: DepotPlanChunk[]
  flags?: number
  /** Symlink target, from the manifest's `linktarget` (protobuf field 7,
   *  content_manifest.proto) — only meaningful when `flags & Symlink` (512). */
  linktarget?: string
}

/** One resolved + manifest-fetched depot, ready for Plan 05's chunk download. */
export interface DepotPlanEntry {
  /** Steam depot id. STRING — never coerced to Number (T-21-04). */
  depotId: string
  /** 64-bit manifest GID. STRING — never coerced to Number (T-21-04). */
  gid: string
  /** Per-depot decryption key from getDepotDecryptionKey. */
  key: Buffer
  files: DepotPlanFile[]
}

/**
 * The full enqueue-time contract the DownloadManager needs before a single
 * chunk is fetched: every owned depot, resolved + manifest-fetched + filename-
 * decrypted, plus the REAL total byte count summed across ALL depots (D-03).
 */
export interface DepotPlan {
  appId: string
  depots: DepotPlanEntry[]
  /** Real total bytes, summed across every depot's files (D-03). */
  totalBytes: number
  /** PICS appinfo.common.name — falls back to the caller's installdir when
   *  PICS returns no display name. Used by finalizeToSteam's manifest `name`
   *  field (Plan 06). */
  name: string
  /** Current `public` branch buildid from PICS appinfo
   *  (appinfo.depots.branches.public.buildid), captured ONCE at plan-build
   *  time (D-02). Threaded unconditionally to finalizeToSteam — required
   *  (non-empty, non-"0") for canWriteFullOwnership to earn StateFlags=4; a
   *  "0"/absent buildid makes Steam flag UpdateRequired and always fails the
   *  gate. Never re-derived by a second PICS read (RESEARCH.md Pitfall 4). */
  buildid?: string
}

/** Narrow, ADDITIONAL view of PICS appinfo's `common.name` field — not part of
 *  select.ts's own SteamAppInfo (which only needs depots/extended). Widened
 *  locally here purely to read the display name for the manifest writer. */
interface AppCommonName {
  common?: { name?: string }
}

/** Minimal surface of the raw-manifest parser this module depends on. steam-user's
 *  export path (`steam-user/components/content_manifest.js`) is undocumented and
 *  could move on a version bump (Pitfall 5, T-21-10) — every access to it goes
 *  through this shape, with a loud throw if the shape is ever missing. */
interface ContentManifestModule {
  parse(raw: Buffer): { files: RawManifestFile[] }
}

interface RawManifestFile {
  filename: string
  size: string | number
  sha_content: string | Buffer
  flags?: number
  chunks?: DepotPlanChunk[]
  linktarget?: string
}

/** steam-user client surface this module depends on that @types/steam-user does
 *  NOT declare — getDepotDecryptionKey/getRawManifest are undocumented callback
 *  APIs (Pitfall 5). Isolated here so every untyped call is visible in one place;
 *  everything else (getProductInfo, licenses) uses the real published types. */
interface SteamUserDepotExtras {
  getDepotDecryptionKey(
    appId: number,
    depotId: number,
    callback: (err: Error | null, key: Buffer) => void
  ): void
  getRawManifest(
    appId: number,
    depotId: number,
    gid: string,
    branch: string,
    callback: (err: Error | null, raw: Buffer) => void
  ): void
  /** Also undocumented in @types/steam-user (Pitfall 5) — resolves the CDN
   *  hostnames Plan 05's downloadDepotFiles needs to fetch chunks from.
   *  Full field list per node_modules/steam-user/components/cdn.js's own
   *  mapping (confirmed by reading source, not guessed) — widened in
   *  diagnostic cycle 4 (debug/steam-install-slow-start, lead (a)) so the RAW
   *  directory response (load/weightedload/preferred_server/etc, the ranking
   *  data the real Steam client uses) could be logged before reduction.
   *  `Host`/`vhost`/`weightedload` are now ACTIVELY consumed (cycle 5, via
   *  `reduceContentServers`/`getContentServerHosts` below) to seed
   *  HostHealthTracker's weightedload-aware cold-start selection — the rest
   *  remain diagnostic-only. Note: this method takes only an optional
   *  `appid` filter — steam-user's cdn.js has no count/limit parameter to
   *  request a larger server pool. */
  getContentServers(
    appId: number,
    callback: (err: Error | null, servers: RawContentServer[]) => void
  ): void
  /** CDN-auth implementation cycle: also undocumented in @types/steam-user
   *  (Pitfall 5) — verified directly against the INSTALLED steam-user@5.3.0
   *  source (node_modules/steam-user/components/03-messages.js:419-491). A
   *  plain, non-private prototype method ("Send a raw message") — cycle 11
   *  (debug/steam-install-slow-start, "DECISION 2026-07-19: OPTION B")
   *  switched depot/cdnAuth.ts from steam-user's own `_sendUnified` wrapper
   *  (whose ENCODE step throws for `ContentServerDirectory.GetCDNAuthToken#1`
   *  — that RPC's compiled classes were never wired into steam-user's
   *  private protobufs lookup map, confirmed by exhaustively enumerating all
   *  294 registered keys) to this lower-level method `_sendUnified` itself
   *  delegates to, supplying an already-encoded `Buffer` body directly — see
   *  depot/cdnAuth.ts's module doc comment (CYCLE 11 UPDATE section) for the
   *  full evidence trail. */
  _send(
    header: { msg: number; proto: { target_job_name: string } },
    body: Buffer,
    callback: (body: unknown, hdr?: { proto?: { eresult?: number } }) => void
  ): void
}

type SteamUserDepotClient = InstanceType<typeof SteamUserLib> &
  SteamUserDepotExtras

function assertNumericAppId(appId: string): void {
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
 * D-UAT-05: buildDepotPlan's PICS/manifest network calls (ensureConnected,
 * getProductInfo x3, getDepotDecryptionKey+getRawManifest PER OWNED DEPOT)
 * previously never consulted the AbortSignal at all — a stop()/cancel()
 * issued while the plan was still being built had NO effect until the whole
 * plan finished and downloadDepotFiles's own per-chunk signal checks took
 * over. For a many-depot game that phase can run long, so cancel appeared
 * "non-functional". Called between every major step below so an abort takes
 * effect within roughly one network round-trip instead of the whole plan.
 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DepotPlanAbortedError()
  }
}

/** Never open a second logon (T-21-11) — reuse the same authenticated client
 *  library.ts's refresh() reaches via SteamUser.ensureConnected()/getClient(). */
function getDepotClient(): SteamUserDepotClient {
  const client = SteamUser.getClient()
  if (!client) {
    throw new Error(
      'downloadSteamDepots: no authenticated steam-user client available after ensureConnected()'
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
export const PLAN_BUILD_RETRY_DELAY_MS = 500

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
 * never reached). On failure, re-runs SteamUser.ensureConnected() (which
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
async function withPlanBuildRetry<T>(
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
      // `await SteamUser.ensureConnected()` returns instantly on the stale
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
      await SteamUser.ensureConnected()
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

async function fetchAppInfo(
  client: SteamUserDepotClient,
  numericAppId: number
): Promise<SteamAppInfo> {
  // G-30-02 (30-07): bounded — see getOwnedSets above.
  const { apps } = await withTimeout(
    client.getProductInfo([numericAppId], [], true),
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
    client.getProductInfo(dlcIds, [], true),
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
async function loadContentManifestParser(): Promise<ContentManifestModule> {
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
  return wrapped
}

/**
 * Fetch, parse, and filename-decrypt a single depot's manifest. Filenames are
 * decrypted OURSELVES (steam-user truncates them at block boundaries — spike
 * 002 finding); every file size is coerced through Number() for the D-03 sum.
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
async function fetchDepotPlanEntry(
  client: SteamUserDepotClient,
  descriptor: DepotDescriptor,
  parser: ContentManifestModule
): Promise<DepotPlanEntry> {
  const numericDepotId = Number(descriptor.id)
  const numericOwnerAppId = Number(descriptor.ownerAppId)

  // G-30-02 (30-07, checker finding #3 extension): these bare callback-Promise
  // CM round-trips are the SAME call-class as getProductInfo above — a socket
  // going stale MID-buildDepotPlan (after the earlier getProductInfo calls
  // already succeeded) could otherwise hang here just as easily. Bounded so a
  // stale-but-present CM socket rejects within STEAM_PICS_TIMEOUT_MS instead
  // of parking this await forever.
  const key = await withTimeout(
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
    linktarget: f.linktarget,
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

  // [Timing] debug/steam-install-slow-start: total buildDepotPlan duration,
  // reported at every return/throw path below. Temporary instrumentation.
  const planStart = Date.now()

  const connected = await SteamUser.ensureConnected()
  throwIfAborted(opts.signal)
  if (!connected) {
    logWarning(
      `downloadSteamDepots: no authenticated Steam CM connection for appId ${appId}`,
      LogPrefix.Steam
    )
    throw new Error(
      `downloadSteamDepots: no authenticated Steam CM connection available for appId ${appId}`
    )
  }

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

  if (!descriptors.length) {
    logInfo(
      `[Timing] buildDepotPlan: total ${Date.now() - planStart}ms for appId ${appId} (0 depots)`,
      LogPrefix.Steam
    )
    const emptyPlan: DepotPlan = {
      appId,
      depots: [],
      totalBytes: 0,
      name: displayName,
      buildid
    }
    // 23-06: census logged on the returned plan before it leaves plan-build —
    // paired with downloadDepotFiles' stage=download-entry census so a
    // flags-dropping serialization boundary is directly observable (H5).
    logInfo(
      `steam-flags-census stage=plan-build appId=${appId} depots=0 ` +
        formatDepotFlagsCensus(summarizeDepotFlags(emptyPlan)),
      LogPrefix.Steam
    )
    return emptyPlan
  }

  const parser = await loadContentManifestParser()

  const depots: DepotPlanEntry[] = []
  let totalBytes = 0
  for (const descriptor of descriptors) {
    throwIfAborted(opts.signal)
    const entry = await withPlanBuildRetry(
      opts.signal,
      (client) => fetchDepotPlanEntry(client, descriptor, parser),
      `fetchDepotPlanEntry:${descriptor.id}`
    )
    depots.push(entry)
    totalBytes += entry.files.reduce((sum, f) => sum + Number(f.size), 0)
  }

  logInfo(
    `[Timing] buildDepotPlan: total ${Date.now() - planStart}ms for appId ${appId} (${depots.length} depot(s))`,
    LogPrefix.Steam
  )

  const plan: DepotPlan = { appId, depots, totalBytes, name: displayName, buildid }
  // 23-06: census logged on the returned plan before it leaves plan-build —
  // paired with downloadDepotFiles' stage=download-entry census so a
  // flags-dropping serialization boundary is directly observable (H5).
  logInfo(
    `steam-flags-census stage=plan-build appId=${appId} depots=${depots.length} ` +
      formatDepotFlagsCensus(summarizeDepotFlags(plan)),
    LogPrefix.Steam
  )

  return plan
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 21 (21-05): Streaming chunk-download loop.
//
// Consumes a DepotPlan (Plan 04) and writes every file's bytes to disk via
// positional writes to an open fd — NEVER a whole-file Buffer.alloc (RESEARCH
// Pattern 2 / D-14's "no fallback for 50GB+" requirement). Chunk fetches
// within a single file are bounded by CHUNK_CONCURRENCY (NOT an unbounded
// fan-out over every chunk in one go — a multi-GB file can hold thousands of
// ~1MB chunks, so firing them all at once would defeat the size-independent
// memory bound, T-21-02). Every decrypted filename is containment-checked
// against the common/{installdir} root BEFORE any fs call (T-21-01). Progress
// is throttled and emitted in the exact shape library.ts's pollInstallOnce()
// already speaks, so the DownloadManager needs zero changes (D-01/D-03).
// AbortSignal is consulted before every chunk/file so a queue-cancel stops
// the loop promptly (D-02).
//
// Deliberately a SEPARATE exported function (not folded into
// downloadSteamDepots itself) — it operates "on top of" an already-built
// DepotPlan, has no dependency on the authenticated SteamUser client, and
// stays independently unit-testable (mirrors 21-04's own precedent of
// scoping each function to exactly what it needs).
// ─────────────────────────────────────────────────────────────────────────

/** Bounded chunk-level concurrency PER FILE — never an unbounded fan-out over
 *  every chunk in one go (T-21-02). Small on purpose: a single multi-GB file
 *  can hold thousands of ~1MB chunks. */
export const CHUNK_CONCURRENCY = 4
/** Bounded file-level concurrency across ALL depots' files (spike-proven queue pattern). */
export const FILE_CONCURRENCY = 8
/** Debug/steam-install-slow-start gap closure: per-chunk retry budget passed to
 *  fetchChunk (host-rotating retry across content servers). fetchChunk's own
 *  docstring documents a ~16% per-chunk transient failure rate at
 *  FILE_CONCURRENCY=8 without retry — over the thousands of chunks a large
 *  modern game holds, the previous attempts=4 gave too little headroom: the
 *  probability that AT LEAST ONE chunk exhausts every attempt approaches
 *  certainty, and a single exhausted chunk currently escalates the WHOLE
 *  install to a hard "Steam servers dropped the connection" failure
 *  (downloadSteamDepots' failures.length check) even though that CDN chunk
 *  retry never touches the authenticated SteamUser CM/session connection at
 *  all. Raised (not unbounded) — still backed off, still host-rotating,
 *  extends rather than replaces the existing mechanism. */
export const CHUNK_FETCH_ATTEMPTS = 8

/** Bytes per MiB — the DownloadManager UI renders `downSpeed` with a "MB/s" label
 *  and the gog/legendary runners emit MiB/s, so the native path must too (was
 *  raw bytes/sec, ~1e6× too large — UAT D-UAT-02). */
const BYTES_PER_MIB = 1024 * 1024

/** Formats an ETA in seconds as `HH:MM:SS` for the DownloadManager ETA field —
 *  matches the gog/legendary runners' formatted-string convention. Emitting raw
 *  `${sec}s` produced unreadable values like "1247s" (UAT D-UAT-02). */
export function formatEta(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
const PROGRESS_THROTTLE_MS = 500
const PROGRESS_THROTTLE_PERCENT = 1

/** Forces a progressUpdate at least once per second, independent of chunk
 *  completion. Without this, the DownloadManager ProgressHeader graph freezes
 *  for however long chunk completions bunch up (warm-up, large files, decode-
 *  pool backlog under load) -- observed gaps of ~30s in practice. */
const PROGRESS_HEARTBEAT_MS = 1000

/** Minimum window (seconds) for a meaningful rolling-rate sample. A forced
 *  emit right after a throttled one can have a sub-millisecond delta; dividing
 *  by it yields a garbage spike, so below this we reuse the previous rate. */
const MIN_RATE_WINDOW_SEC = 0.05

/**
 * Rolling (instantaneous) transfer rate in MiB/s over the window since the last
 * emit — NOT a cumulative average since the download started, so the figure
 * tracks the CURRENT rate and drops promptly when the transfer slows or stalls.
 * Reuses `previousMiBs` when the window is too small to be meaningful (a forced
 * emit landing right on top of a throttled one). Pure + exported for testing.
 */
export function rollingRateMiBs(
  bytesDelta: number,
  msDelta: number,
  previousMiBs: number
): number {
  const secDelta = msDelta / 1000
  if (secDelta < MIN_RATE_WINDOW_SEC) return previousMiBs
  const rate = bytesDelta / secDelta / BYTES_PER_MIB
  return rate > 0 ? rate : 0
}

/** Thrown when a decrypted filename resolves outside the target install root (T-21-01). */
export class PathTraversalError extends Error {}

/**
 * Resolve `filename` against `root` and verify containment via relative()
 * BEFORE any fs call — path.join alone is not containment (Phase 18 lesson,
 * per user memory). A "../"-escaping filename never reaches open()/mkdir().
 */
export function resolveContainedPath(root: string, filename: string): string {
  const dest = resolve(root, filename.replace(/\\/g, '/'))
  const rel = relative(root, dest)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new PathTraversalError(
      `downloadDepotFiles: rejected path-traversal filename "${filename}" (escapes ${root})`
    )
  }
  return dest
}

/** Streaming whole-file SHA1 — a ReadStream piped through createHash, never a
 *  whole-file Buffer re-read (would defeat the point of streaming the write).
 *  Exported for reuse by depot/reconcile.ts (Phase 23, 23-03, D-04) — the
 *  Shared Patterns rule requires reconciliation compose this, not
 *  reimplement it. */
export function sha1File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk: string | Buffer) => hash.update(chunk))
    stream.on('end', () => resolvePromise(hash.digest('hex')))
  })
}

export interface DownloadDepotFilesOpts {
  targetSteamappsDir: string
  installdir: string
  /** Content-server hostnames from client.getContentServers() — caller-supplied
   *  so this loop stays decoupled from the SteamUser client for testability. */
  hosts: string[]
  /** Debug/steam-install-slow-start (cycle 5): the content-server directory's
   *  own `weightedload` ranking per host (cycle-4 lead (a) — captured in
   *  getContentServerHosts's RAW dump but previously discarded entirely).
   *  Seeds HostHealthTracker's cold-start PRIOR (depot/hostHealth.ts) so a
   *  fresh download run favors the directory's own low-weightedload (local,
   *  less-loaded) edges from the very first attempt, instead of treating
   *  every host as an equal blind round-robin candidate. Optional — omitting
   *  it (every pre-cycle-5 caller/test) leaves HostHealthTracker's cold-start
   *  behavior byte-for-byte unchanged. */
  hostWeightedLoads?: ReadonlyMap<string, number>
  /** Debug/steam-install-slow-start (cycle 6): CDN auth token cache, created
   *  in downloadSteamDepots (where the authenticated client is available —
   *  this loop stays decoupled from the SteamUser client for testability,
   *  same discipline as `hosts` above) and threaded down to every fetchChunk
   *  call. Optional — omitting it (every pre-cycle-6 caller/test) leaves
   *  every chunk/manifest URL byte-for-byte unchanged (no token appended). */
  cdnAuth?: CdnAuthTokenCache
  /** Debug/steam-install-slow-start (cycle 7): per-host `https_support`/
   *  `usetokenauth` directory metadata (see depot/decompress.ts's
   *  `ContentServerHostMeta`), threaded down to every fetchChunk call for
   *  EXACT steam-user URL-scheme/token parity. Optional — omitting it
   *  (every pre-cycle-7 caller/test) leaves fetchChunk's URL byte-for-byte
   *  unchanged (hardcoded https://, no token). */
  hostMeta?: ReadonlyMap<string, ContentServerHostMeta>
  signal?: AbortSignal
}

export interface DepotDownloadFailure {
  file: string
  error: string
}

export interface DepotDownloadResult {
  outcome: 'completed' | 'cancelled'
  failures: DepotDownloadFailure[]
  /** Every planned file for this run was attempted (queue fully drained, no
   *  abort mid-way) AND every attempt succeeded (no failures). False when
   *  the run was cancelled before every job was processed, or when any job
   *  failed. Phase 23 (23-02, D-01): feeds canWriteFullOwnership. */
  allFilesVerifiedThisRun: boolean
  /** Every EDepotFileFlag mode application (exec/readonly/hidden, 23-01) for
   *  this run succeeded. A mode-application failure already surfaces as a
   *  DepotDownloadFailure, so this is currently derived from the same
   *  failures list — kept as an explicit field so the completeness gate
   *  never has to re-derive it ad-hoc (Phase 23, 23-02). */
  allModesApplied: boolean
}

/**
 * Phase 23 (23-02, D-01/D-02): the single completeness gate deciding whether
 * finalizeToSteam may write StateFlags=4 (full ownership, no Steam verify
 * pass) instead of the safe 1026 verify-handoff. Fails CLOSED — every input
 * must be unambiguously present and good; any missing/ambiguous field (an
 * absent buildid, a non-'completed' outcome, a single failure, an unverified
 * file, an unapplied mode) resolves to false, never true. This is the ONLY
 * place this decision is made — both the fresh-install path (this plan) and
 * the future resume/reconciliation path (D-04) must call this exact function
 * rather than inlining the check, so the two paths can never silently
 * diverge (RESEARCH.md Pitfall 2).
 */
export function canWriteFullOwnership(opts: {
  outcome: 'completed' | 'cancelled'
  failures: DepotDownloadFailure[]
  buildid?: string
  allFilesVerified: boolean
  allModesApplied: boolean
}): boolean {
  return (
    opts.outcome === 'completed' &&
    opts.failures.length === 0 &&
    !!opts.buildid &&
    opts.buildid !== '0' &&
    opts.allFilesVerified === true &&
    opts.allModesApplied === true
  )
}

/**
 * Bounded chunk-level worker pool for ONE file. Never an unbounded fan-out
 * over every chunk in one go — peak in-flight fetchChunk calls is capped at
 * CHUNK_CONCURRENCY regardless of how many chunks the file has (T-21-02).
 * Chunks can land in any order — each is an independent positional
 * write, so cross-server retry (Plan 01 fetchChunk) stays safe as-is.
 */
/**
 * Exported (cycle 7) so its re-queue/stall give-up behavior is directly
 * unit-testable without going through the full downloadDepotFiles/
 * downloadSteamDepots stack — mirrors this module's existing precedent of
 * exporting internal helpers (resolveContainedPath, sha1File,
 * canWriteFullOwnership) purely for test surface, not for external callers.
 */
export async function downloadFileChunks(
  fd: FileHandle,
  depotId: string,
  key: Buffer,
  hosts: string[],
  lzma: LzmaModule,
  file: DepotPlanFile,
  fileSeed: number,
  signal: AbortSignal | undefined,
  onBytes: (diskBytes: number, netBytes: number) => void,
  decode?: DecodeFn,
  /** Debug/steam-install-slow-start (cycle 2): forwarded to every fetchChunk
   *  call so the caller can aggregate per-host attempt/timeout/error stats
   *  across the whole file — optional, additive, no behavior change. */
  onAttempt?: OnChunkAttempt,
  /** Debug/steam-install-slow-start (cycle 3): shared, per-DOWNLOAD-RUN
   *  health-aware host selector — see depot/hostHealth.ts. Optional,
   *  additive: omitting it (no existing caller/test does) leaves fetchChunk's
   *  plain round-robin selection unchanged. */
  hostHealth?: HostHealthTracker,
  /** Debug/steam-install-slow-start (cycle 6): shared, per-DOWNLOAD-RUN CDN
   *  auth token cache — see depot/cdnAuth.ts. Optional, additive: omitting it
   *  leaves fetchChunk's URL unchanged (no token appended). */
  cdnAuth?: CdnAuthTokenCache,
  /** Debug/steam-install-slow-start (cycle 7): per-host https_support/
   *  usetokenauth directory metadata — see depot/decompress.ts's
   *  ContentServerHostMeta. Optional, additive. */
  hostMeta?: ReadonlyMap<string, ContentServerHostMeta>,
  /** Debug/steam-install-slow-start (cycle 7): shared, per-DOWNLOAD-RUN
   *  forward-progress clock — see depot/stallTracker.ts. When supplied, a
   *  chunk that exhausts fetchChunk's CHUNK_FETCH_ATTEMPTS budget is
   *  RE-QUEUED (retried again later by whichever worker picks it up next)
   *  instead of aborting this whole file, UNLESS the run has genuinely
   *  stalled (no forward progress anywhere for STALL_TIMEOUT_MS) — in which
   *  case it is a real, honest failure. Omitting it (every pre-cycle-7
   *  caller/test) preserves the EXACT pre-cycle-7 behavior: a chunk
   *  exhausting its attempts immediately fails this file. */
  stallTracker?: StallTracker,
  /** Phase 25 (multi-host fan-out, MHOST-02/03): this file's own slot within
   *  downloadDepotFiles' FILE_CONCURRENCY pool — combined below with this
   *  function's own CHUNK_CONCURRENCY-pool index so every concurrently-
   *  running chunk worker across the WHOLE run gets a distinct small
   *  integer forwarded into fetchChunk's workerSlot (see RESEARCH.md
   *  Assumptions Log A2). A defaulted param (not a bare `?:`) so it stays a
   *  plain `number` under strict mode. Optional, additive: omitting it —
   *  every pre-Phase-25 caller/test — combines as 0, reproducing the exact
   *  chunk-pool-only slot. */
  fileWorkerSlot: number = 0
): Promise<void> {
  const queue = [...file.chunks]
  const workerCount = Math.min(CHUNK_CONCURRENCY, queue.length)

  await Promise.all(
    Array.from({ length: workerCount }, async (_, chunkWorkerSlot) => {
      while (queue.length) {
        if (signal?.aborted) return
        const chunk = queue.shift()!
        const depotChunk: DepotChunk = {
          sha: chunk.sha,
          cb_original: chunk.cb_original,
          attemptSeed: hosts.length ? fileSeed % hosts.length : 0
        }

        // Phase 21 gap closure (21-15, D-UAT-03): `decode` is the injected
        // worker-pool decoder (DecompressPool.decode) — moves decrypt ->
        // decompress -> sha1-verify off the main thread. Undefined falls
        // back to fetchChunk's own default (inline decodeChunk), unchanged.
        // netBytes = compressed bytes actually fetched over the wire (for the
        // download rate); data.length = decompressed bytes written to disk.
        let netBytes = 0
        try {
          const data = await fetchChunk(
            hosts,
            depotId,
            depotChunk,
            key,
            lzma,
            CHUNK_FETCH_ATTEMPTS,
            decode,
            (n) => {
              netBytes = n
            },
            onAttempt,
            hostHealth,
            cdnAuth,
            hostMeta,
            // debug/steam-cancel-abort-thread-a: threads the cancel signal
            // INTO fetchChunk's own retry/backoff loop (previously this
            // worker loop only checked signal?.aborted before/after calling
            // fetchChunk, never while it was mid-retry — the ~62s hardware
            // hang) so a cancel interrupts an in-flight attempt immediately
            // instead of waiting for it to naturally exhaust or succeed.
            signal,
            // Phase 25 (multi-host fan-out): combines this file's own
            // FILE_CONCURRENCY-pool slot with this chunk worker's own
            // CHUNK_CONCURRENCY-pool index so every concurrently-running
            // worker across the whole run maps to a distinct small integer
            // — see RESEARCH.md Assumptions Log A2. Both operands are plain
            // `number` (default-param / Array.from index), so the raw
            // arithmetic needs no `?? 0` coalesce under strict mode.
            fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot
          )
          if (signal?.aborted) return

          await fd.write(data, 0, data.length, Number(chunk.offset))
          onBytes(data.length, netBytes)
          // Debug/steam-install-slow-start (cycle 7): resets the WHOLE-RUN
          // stall clock — this file's forward progress counts as forward
          // progress for every OTHER file/worker in this download run too
          // (host health, like forward progress, is a property of the run,
          // never of a single file).
          stallTracker?.recordProgress()
        } catch (err) {
          if (signal?.aborted) return
          // Debug/steam-install-slow-start (cycle 17, retry-storm
          // resilience): a decode-stage failure — fetchChunk exhausted its
          // whole CHUNK_FETCH_ATTEMPTS/host-rotation budget with a
          // ChunkDecodeError as the last cause (unknown_container/
          // sha1_mismatch/size_mismatch/bad_footer_magic/decode_failed) — is
          // DETERMINISTIC given (ciphertext, key): see
          // depot/decompress.ts's isDecodeStageError doc comment for the
          // hardware evidence (the identical encrypted chunk failed
          // unknown_container on ALL 6 content servers, all 555 attempts,
          // byte-identical ciphertext across hosts). Re-queuing it below for
          // ANOTHER full pass — the mechanism this cycle otherwise leaves
          // completely unchanged for every transient network/HTTP failure —
          // can never succeed and is exactly what collapsed one hardware
          // run's throughput (11,063 total attempt rotations across the
          // run; 555 on this one chunk alone) before this fix. Rethrown
          // immediately as an honest per-chunk failure, same shape as the
          // existing stalled-run path below, WITHOUT waiting for
          // stallTracker to separately notice a global stall. The
          // sha1(decompressed) === expectedSha integrity gate itself
          // (T-21-03, enforced inside decodeChunk) is completely
          // unchanged — this only stops RE-ATTEMPTING a chunk that gate has
          // already, deterministically, rejected; it never weakens what
          // counts as a pass.
          if (isDecodeStageError(err)) {
            throw err
          }
          // Debug/steam-install-slow-start (cycle 7, PART 3): a chunk
          // exhausting its local CHUNK_FETCH_ATTEMPTS budget must NOT abort
          // this whole FILE — re-queue it for another pass rather than
          // letting the throw propagate out of this Promise.all and kill
          // every other in-flight chunk-worker for this file, UNLESS the
          // download run has genuinely stalled (no forward progress
          // anywhere for STALL_TIMEOUT_MS), in which case this is a real,
          // honest failure — never an unbounded retry loop. Omitting
          // stallTracker (every pre-cycle-7 caller/test) rethrows
          // immediately, preserving the exact pre-cycle-7 behavior.
          if (stallTracker && !stallTracker.hasStalled()) {
            queue.push(chunk)
            continue
          }
          if (stallTracker) {
            throw new Error(
              `${(err as Error).message} (download stalled: no forward progress for ` +
                `${stallTracker.msSinceProgress()}ms across the whole run)`
            )
          }
          throw err
        }
      }
    })
  )
}

/**
 * Download one file: containment-check its destination (BEFORE any fs call,
 * T-21-01), pre-size + positional-write every chunk (never a whole-file
 * Buffer.alloc, T-21-02), then verify the whole-file SHA1 by STREAMING the
 * written bytes back off disk (never re-reading the whole file into RAM,
 * T-21-03). A mismatch is thrown — the caller records it as a failure, never
 * silently accepted.
 */
async function downloadSingleFile(
  installRoot: string,
  depotId: string,
  key: Buffer,
  hosts: string[],
  lzma: LzmaModule,
  file: DepotPlanFile,
  fileSeed: number,
  signal: AbortSignal | undefined,
  onBytes: (diskBytes: number, netBytes: number) => void,
  decode?: DecodeFn,
  /** Debug/steam-install-slow-start (cycle 2): forwarded to downloadFileChunks
   *  — optional, additive, no behavior change. */
  onAttempt?: OnChunkAttempt,
  /** Debug/steam-install-slow-start (cycle 3): forwarded to downloadFileChunks
   *  — see depot/hostHealth.ts. Optional, additive. */
  hostHealth?: HostHealthTracker,
  /** Debug/steam-install-slow-start (cycle 6): forwarded to downloadFileChunks
   *  — see depot/cdnAuth.ts. Optional, additive. */
  cdnAuth?: CdnAuthTokenCache,
  /** Debug/steam-install-slow-start (cycle 7): forwarded to downloadFileChunks
   *  — see depot/decompress.ts's ContentServerHostMeta. Optional, additive. */
  hostMeta?: ReadonlyMap<string, ContentServerHostMeta>,
  /** Debug/steam-install-slow-start (cycle 7): forwarded to downloadFileChunks
   *  — see depot/stallTracker.ts. Optional, additive. */
  stallTracker?: StallTracker,
  /** Phase 25 (multi-host fan-out, MHOST-02/03): forwarded to
   *  downloadFileChunks — see its own doc comment. A defaulted param (not a
   *  bare `?:`) so it stays a plain `number` under strict mode. Optional,
   *  additive: omitting it — every pre-Phase-25 caller/test — combines as 0.
   */
  fileWorkerSlot: number = 0,
  /** 23-06 (G-23-02 trace instrumentation): this RUN's own mode-application
   *  counters, forwarded to applyEDepotFileModes. Optional, additive:
   *  omitting it (every pre-23-06 caller/test) leaves mode-application
   *  behavior byte-for-byte unchanged — counting is side-channel only. */
  counters?: DepotModeCounters
): Promise<void> {
  const dest = resolveContainedPath(installRoot, file.filename)
  await mkdir(dirname(dest), { recursive: true })

  // Directory manifest entry (flags & Directory) — a REAL directory, never an
  // empty regular file. Must be checked BEFORE the size===0 fast path below,
  // since directory entries are also size 0 with no chunks (CR-01).
  if (file.flags && file.flags & DIRECTORY_FLAG) {
    await mkdir(dest, { recursive: true })
    return
  }

  // Symlink manifest entry (flags & Symlink) — a REAL, containment-checked
  // symlink pointing at the manifest's own linktarget, never an empty regular
  // file with the LinkTarget discarded (CR-01).
  if (file.flags && file.flags & SYMLINK_FLAG) {
    if (!file.linktarget) {
      throw new Error(
        `downloadDepotFiles: symlink manifest entry for ${file.filename} has no linktarget`
      )
    }
    // WR-02 (23-code-review): normalize backslash-separated relative segments
    // the same way resolveContainedPath does for filenames — resolve() does
    // not treat '\' as a separator, so an unnormalized Windows-style
    // linktarget would resolve as one literal path component rather than
    // nested directories (a broken symlink, not a traversal escape: '\' is
    // not a real separator on POSIX so no actual escape is possible either
    // way — this keeps the containment check consistent with the one
    // function up).
    const resolvedTarget = resolve(
      dirname(dest),
      file.linktarget.replace(/\\/g, '/')
    )
    const relToRoot = relative(installRoot, resolvedTarget)
    if (relToRoot.startsWith('..') || isAbsolute(relToRoot)) {
      throw new PathTraversalError(
        `downloadDepotFiles: rejected symlink "${file.filename}" whose target ` +
          `"${file.linktarget}" escapes ${installRoot}`
      )
    }
    // Idempotent like the mkdir(recursive) / open('w') branches above:
    // symlink() throws EEXIST if dest already exists, so a retry of a
    // partially-succeeded install (D-07) would fail that file forever. Clear
    // any stale entry first (force ignores a missing path).
    await rm(dest, { force: true })
    await symlink(file.linktarget, dest)
    return
  }

  if (!file.chunks.length || Number(file.size) === 0) {
    if (Number(file.size) !== 0) {
      // WR-02: a size>0 file with zero chunks is a corrupt/mis-parsed
      // manifest — treat as a recorded failure, never a silent empty success.
      throw new Error(
        `downloadDepotFiles: manifest reported ${file.filename} size=${file.size} but zero chunks`
      )
    }
    const empty = await open(dest, 'w')
    await empty.close()

    // Phase 23 (23-08 Task 2b): a zero-byte manifest entry can still carry
    // an Executable/CustomExecutable/ReadOnly/Hidden flag — this early
    // return used to skip mode application entirely, unlike the non-empty
    // path below (the `if (file.flags)` block after the sha1 check), so a
    // zero-byte executable-flagged entry landed without +x. The
    // Directory(64)/Symlink(512) branches above already returned before
    // this point (WR-01), so any flags reaching here are safe to hand to
    // applyEDepotFileModes. A mode-application failure is recorded the same
    // way the non-empty path already does (T-23-03) — never a silent
    // success.
    if (file.flags) {
      const modeResult = await applyEDepotFileModes(dest, file.flags, counters)
      if (!modeResult.ok) {
        throw new Error(
          `downloadDepotFiles: failed to apply file mode flags for ${file.filename}: ${modeResult.error}`
        )
      }
    }
    return
  }

  const fd = await open(dest, 'w')
  try {
    await fd.truncate(Number(file.size))
    await downloadFileChunks(
      fd,
      depotId,
      key,
      hosts,
      lzma,
      file,
      fileSeed,
      signal,
      onBytes,
      decode,
      onAttempt,
      hostHealth,
      cdnAuth,
      hostMeta,
      stallTracker,
      fileWorkerSlot
    )
  } finally {
    await fd.close()
  }

  if (signal?.aborted) return

  const expected = Buffer.isBuffer(file.sha_content)
    ? file.sha_content.toString('hex')
    : String(file.sha_content)
  const got = await sha1File(dest)
  if (got !== expected) {
    throw new Error(
      `downloadDepotFiles: whole-file SHA1 mismatch for ${file.filename}: ${got} != ${expected}`
    )
  }

  // SPIKE 003 finding / Phase 23 (23-01, D-06): apply the manifest's full
  // EDepotFileFlag mode set. Under the 1026 handoff Steam's verify pass sets
  // these; the StateFlags=4 full-ownership path does not run verify, so
  // without this the game binary/config would land with the wrong mode (a
  // missing +x fails launch with `os error 256` on macOS). sha1 guarantees
  // CONTENT, not filesystem mode — so this is required for full ownership
  // regardless of the spike flag (harmless under 1026: Steam would set the
  // same bits anyway). A failure here is NOT swallowed: it throws so the
  // caller (downloadDepotFiles) records it as a DepotDownloadFailure, never
  // a silent success (T-23-03) — a mode failure must be visible to the
  // completeness gate the same way a SHA1 mismatch already is.
  if (file.flags) {
    const modeResult = await applyEDepotFileModes(dest, file.flags, counters)
    if (!modeResult.ok) {
      throw new Error(
        `downloadDepotFiles: failed to apply file mode flags for ${file.filename}: ${modeResult.error}`
      )
    }
  }

  // Phase 23 (23-08 Task 3, G-23-02 VERDICT: H2): SECONDARY Mach-O fallback,
  // never the primary fix — only ever supplements a manifest that supplied
  // no Executable/CustomExecutable flag for this file. See
  // applyMachOExecutableFallback's own doc comment for the full rationale.
  await applyMachOExecutableFallback(dest, file.filename, file.flags)
}

/**
 * Applies the full EDepotFileFlag mode set (chmod 0o755 for Executable/
 * CustomExecutable, applyDepotFileFlags for ReadOnly/Hidden) to an
 * already-landed file at `dest`. Shared by downloadSingleFile's
 * post-sha1-verify step AND the reconciled-file mode-heal loop in
 * downloadDepotFiles (Phase 23, 23-03, D-04) — a reconciled (skipped-
 * download) file must get the exact same mode treatment a freshly-downloaded
 * one gets, so an older partial install's missing modes are healed even
 * though the bytes themselves are untouched. Never throws for the exec
 * chmod step (matches the pre-23-03 code); a ReadOnly/Hidden failure is
 * surfaced via applyDepotFileFlags's own { ok, error } shape, letting each
 * caller decide its own DepotDownloadFailure wording.
 *
 * `counters` (23-06, G-23-02 trace instrumentation) is optional and purely
 * additive — a side-channel counter increment, never a behavior change.
 * `modeCallsites` increments on every call regardless of branch; `chmodAttempts`
 * increments only on the branch that actually calls `chmod(dest, 0o755)`.
 */
async function applyEDepotFileModes(
  dest: string,
  flags: number,
  counters?: DepotModeCounters
): Promise<{ ok: boolean; error?: string }> {
  if (counters) counters.modeCallsites++

  if (flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG)) {
    if (counters) counters.chmodAttempts++
    await chmod(dest, 0o755)
  }

  if (flags & (READONLY_FLAG | HIDDEN_FLAG)) {
    return applyDepotFileFlags(dest, flags, process.platform)
  }

  return { ok: true }
}

// ── Phase 23 (23-08 Task 3, G-23-02 VERDICT: H2) — Mach-O executable
// fallback ──────────────────────────────────────────────────────────────
// SECONDARY compensator, never the primary fix. 23-TRACE.md's Live run 2
// VERDICT is H2 CONFIRMED: HUMANKIND's own manifest carries flagBearing=140
// but executableFlagged=0 (distinctFlagValues=[64], Directory only) — the
// manifest genuinely has no EDepotFileFlag executable bits for this
// fallback's primary sibling (applyEDepotFileModes) to apply, and this is
// the NORMAL case for native macOS titles per the trace's cross-title
// census (2 of 3 censused titles carry zero executable flags, the third
// exactly one), not an anomaly to special-case. Steam's own HUMANKIND
// install carries 18,002/18,809 files +x despite its manifest supplying
// zero — the real client derives execute bits by some OTHER means for these
// titles. This fallback narrows that gap for POSIX platforms only, by
// reading the already-landed file's own Mach-O magic bytes — content-gated,
// NEVER path-gated (this file contains zero non-comment "Contents/MacOS"
// occurrences — the 23-08 grep gate). The manifest's own EDepotFileFlag
// executable bits remain the PRIMARY contract; this only fires when the
// manifest supplied none for a file that IS a genuine Mach-O executable.

/** Mach-O / fat-binary magic constants (mach-o/loader.h, mach-o/fat.h). */
const MH_MAGIC = 0xfeedface
const MH_MAGIC_64 = 0xfeedfacf
const FAT_MAGIC = 0xcafebabe

/** mach_header/mach_header_64 `filetype` values this fallback treats as
 *  "should carry +x". MH_EXECUTE is a real executable; MH_DYLIB is a shared
 *  library — 23-TRACE.md's own Live run 1 evidence shows Steam marks BOTH
 *  +x (freetype6.dylib lands -rwxr-xr-x beside freetype6.bundle, which does
 *  not). MH_BUNDLE (0x8) is deliberately excluded: Steam leaves Mach-O
 *  bundles WITHOUT +x (WazHack's unitypurchasing.bundle, HUMANKIND's own
 *  freetype6.bundle) since they are dlopen'd, never exec'd — a naive "any
 *  Mach-O gets +x" rule would over-apply relative to Steam's own behavior,
 *  which is exactly the subtype-discrimination constraint 23-TRACE.md
 *  raises for this fallback. */
const MH_EXECUTE = 0x2
const MH_DYLIB = 0x6

/** Reads a mach_header/mach_header_64's `filetype` field (the 4th uint32,
 *  right after magic/cputype/cpusubtype) at `headerOffset`, in whichever
 *  byte order `detectMachOEndianness` already determined for this header —
 *  the two functions must never disagree on endianness. */
function readMachOFiletype(
  buf: Buffer,
  headerOffset: number,
  bigEndian: boolean
): number | undefined {
  const filetypeOffset = headerOffset + 12
  if (buf.length < filetypeOffset + 4) return undefined
  return bigEndian
    ? buf.readUInt32BE(filetypeOffset)
    : buf.readUInt32LE(filetypeOffset)
}

/** Detects a thin (single-architecture) Mach-O header at `offset` and
 *  returns its byte order — little-endian first (the normal case on
 *  today's Intel/Apple-Silicon Macs, where MH_MAGIC_64 (0xfeedfacf) is
 *  stored in the host's own little-endian order), then big-endian (legacy
 *  PowerPC-era files; included since the plan explicitly calls for both
 *  orderings). Returns undefined for anything that isn't a recognized
 *  Mach-O magic at this offset. */
function detectMachOEndianness(
  buf: Buffer,
  offset: number
): boolean | undefined {
  if (buf.length < offset + 4) return undefined
  const magicLE = buf.readUInt32LE(offset)
  if (magicLE === MH_MAGIC || magicLE === MH_MAGIC_64) return false
  const magicBE = buf.readUInt32BE(offset)
  if (magicBE === MH_MAGIC || magicBE === MH_MAGIC_64) return true
  return undefined
}

/**
 * Determines whether the first bytes of an already-landed file (`buf`,
 * however many bytes were actually read — never the whole file, T-21-02
 * discipline) represent a Mach-O EXECUTE or DYLIB image. Content-gated
 * ONLY — magic bytes, never a path pattern. Handles both a thin
 * (single-arch) Mach-O header and a fat (universal) binary's first
 * architecture slice, per 23-TRACE.md's own subtype-discrimination
 * constraint (bundle vs executable/dylib), not merely "is this file
 * Mach-O at all".
 */
function isExecutableMachO(buf: Buffer): boolean {
  const thinBigEndian = detectMachOEndianness(buf, 0)
  if (thinBigEndian !== undefined) {
    const filetype = readMachOFiletype(buf, 0, thinBigEndian)
    return filetype === MH_EXECUTE || filetype === MH_DYLIB
  }

  // fat_header/fat_arch are always written big-endian on disk, per Apple's
  // own spec, regardless of the contained architectures' byte order
  // (mach-o/fat.h). Only the FIRST slice is inspected — a universal
  // binary's slices share one filetype in practice (all EXECUTE or all
  // DYLIB).
  if (buf.length >= 8 && buf.readUInt32BE(0) === FAT_MAGIC) {
    const nfatArch = buf.readUInt32BE(4)
    const fatArchOffset = 8 // sizeof(fat_header)
    if (nfatArch >= 1 && buf.length >= fatArchOffset + 20) {
      // fat_arch: cputype(4) cpusubtype(4) offset(4) size(4) align(4)
      const sliceOffset = buf.readUInt32BE(fatArchOffset + 8)
      const sliceBigEndian = detectMachOEndianness(buf, sliceOffset)
      if (sliceBigEndian !== undefined) {
        const filetype = readMachOFiletype(buf, sliceOffset, sliceBigEndian)
        return filetype === MH_EXECUTE || filetype === MH_DYLIB
      }
    }
  }

  return false
}

/** Bytes read from the landed file's head to decide Mach-O-ness. Bounded and
 *  small (T-21-02's "never RAM-buffer a whole file" discipline) — reads via
 *  a single positional FileHandle.read, never the whole file. */
const MACHO_PROBE_BYTES = 4096

/**
 * SECONDARY, POSIX-only compensator (23-08 Task 3, G-23-02 H2 verdict):
 * applies chmod 0o755 to an already-landed, already-manifest-mode-applied
 * file if (a) the manifest did NOT already flag it Executable/
 * CustomExecutable, and (b) its own bytes are a Mach-O EXECUTE or DYLIB
 * image. No-op on Windows (no POSIX exec bit there). Never invoked for
 * Directory(64)/Symlink(512) manifest entries — those return from
 * `downloadSingleFile` before this function is ever called (WR-01's own
 * discipline, reused here rather than reimplemented). Resolves via the
 * caller's already-`resolveContainedPath`-resolved `dest`; never
 * `path.join` (T-23-08). No subprocess is ever spawned — this is a
 * built-in `chmod`, not a shelled-out command. Every failure (read or
 * chmod) is swallowed and logged, never thrown: this is a best-effort
 * secondary measure and must never fail a file whose PRIMARY manifest-
 * driven contract already succeeded above. Logs loudly whenever it DOES
 * fire, so a manifest missing its own executable flags stays VISIBLE
 * rather than silently patched over.
 */
async function applyMachOExecutableFallback(
  dest: string,
  filename: string,
  flags: number | undefined
): Promise<void> {
  if (process.platform === 'win32') return
  if (flags && flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG)) return

  try {
    const handle = await open(dest, 'r')
    let bytesRead: number
    const buf = Buffer.alloc(MACHO_PROBE_BYTES)
    try {
      ;({ bytesRead } = await handle.read(buf, 0, MACHO_PROBE_BYTES, 0))
    } finally {
      await handle.close()
    }
    if (bytesRead < 8 || !isExecutableMachO(buf.subarray(0, bytesRead))) {
      return
    }

    await chmod(dest, 0o755)
    logWarning(
      `downloadDepotFiles: applied secondary Mach-O executable fallback ` +
        `(chmod 0o755) to "${filename}" — its manifest carried no ` +
        `Executable/CustomExecutable flag, but its own bytes are a ` +
        `Mach-O EXECUTE/DYLIB image (G-23-02 H2 verdict, 23-TRACE.md)`,
      LogPrefix.Steam
    )
  } catch (err) {
    logWarning(
      [
        `downloadDepotFiles: Mach-O executable fallback failed for ${filename}, continuing without it:`,
        err
      ],
      LogPrefix.Steam
    )
  }
}

/**
 * Re-applies EDepotFileFlag modes to every reconciled (skipped-download) file
 * in `plan` that is not in `jobFiles` — heals a prior session that sha1-
 * verified a file's CONTENT as complete but never actually ran (or never
 * finished) mode application for it. Exported and shared by BOTH
 * `downloadDepotFiles`' own post-reconciliation heal step (fresh-install/
 * live-resume path) AND `library.ts`'s startup-resume path
 * (`buildResumeFinalizeOpts`, Phase 23 code-review CR-01 gap closure) so the
 * two callers can never silently diverge on this discipline — mirrors
 * `canWriteFullOwnership`'s own single-source-of-truth rule.
 *
 * Directory(64)/Symlink(512) manifest entries are explicitly skipped — the
 * same early-return guard `downloadSingleFile` itself applies before ever
 * reaching mode application (23-code-review WR-01): a directory or symlink
 * path must never be handed to chmod/attrib.exe, since `file.flags` is
 * truthy for those entries too (e.g. `Directory | ReadOnly` = 72) and a
 * `chmod(dirPath, 0o444)` would strip a directory's traversable bit.
 *
 * `counters` (23-06, G-23-02 trace instrumentation) is an OPTIONAL trailing
 * param — omitting it (library.ts's own startup-resume call site, unchanged
 * by this plan) leaves behavior byte-for-byte identical; `downloadDepotFiles`
 * threads its own per-run counters through here so the download-complete
 * census also reflects modes applied while healing reconciled files.
 */
export async function healReconciledFileModes(
  plan: DepotPlan,
  installRoot: string,
  jobFiles: Set<DepotPlanFile>,
  counters?: DepotModeCounters
): Promise<{ allModesHealed: boolean; failures: DepotDownloadFailure[] }> {
  const failures: DepotDownloadFailure[] = []
  let allModesHealed = true

  for (const depot of plan.depots) {
    for (const file of depot.files) {
      if (jobFiles.has(file) || !file.flags) continue
      if (file.flags & (DIRECTORY_FLAG | SYMLINK_FLAG)) continue
      const dest = resolveContainedPath(installRoot, file.filename)
      const modeResult = await applyEDepotFileModes(dest, file.flags, counters)
      if (!modeResult.ok) {
        allModesHealed = false
        failures.push({
          file: file.filename,
          error: `failed to re-apply file mode flags on reconciled file: ${modeResult.error}`
        })
      }
    }
  }

  return { allModesHealed, failures }
}

/**
 * Download every file across every depot in `plan`, streaming to disk with
 * bounded file- and chunk-level concurrency, containment + SHA1 verification,
 * throttled DownloadManager progress (D-01/D-03, matches library.ts
 * pollInstallOnce()'s progressUpdate shape exactly), and prompt AbortSignal
 * cancel (D-02). Failures are collected, never swallowed — a per-file error
 * (traversal, SHA1 mismatch, exhausted chunk retries) does not stop the rest
 * of the download.
 */
export async function downloadDepotFiles(
  plan: DepotPlan,
  opts: DownloadDepotFilesOpts
): Promise<DepotDownloadResult> {
  const lzmaModule = await import('lzma')
  const lzma = ((lzmaModule as { default?: LzmaModule }).default ??
    lzmaModule) as unknown as LzmaModule

  // Phase 21 gap closure (21-15, D-UAT-03): move LZMA/zlib chunk decompress
  // off the main thread onto a worker_threads pool. `lzma` above is kept as
  // the inline-fallback codec — pool.decode transparently falls back to
  // inline main-thread decodeChunk if the pool never initializes, so a
  // pool-init failure never blocks the install (LOCKED requirement).
  const pool = new DecompressPool()
  await pool.init()

  const installRoot = resolve(
    opts.targetSteamappsDir,
    'common',
    opts.installdir
  )

  // 23-06: census logged on the RECEIVED plan at download entry — paired
  // with buildDepotPlan's own stage=plan-build census so a flags-dropping
  // serialization boundary between plan-build and download is directly
  // observable (H5). Emitting the SAME census at both points is the point.
  logInfo(
    `steam-flags-census stage=download-entry appId=${plan.appId} ` +
      formatDepotFlagsCensus(summarizeDepotFlags(plan)),
    LogPrefix.Steam
  )

  // 23-06: fresh per-invocation mode-application counters (G-23-02 trace
  // instrumentation) — NEVER module-level (see DepotModeCounters doc comment;
  // 23-05's per-appId single-flight means two different appIds can be
  // downloading concurrently, and module-level counters would let one run's
  // chmods corrupt another's count).
  const modeCounters: DepotModeCounters = { chmodAttempts: 0, modeCallsites: 0 }

  try {
    // Phase 23 (23-03, D-04): reconcile on-disk state BEFORE building the
    // download job list — a present, sha1-verified file is never
    // re-downloaded (D-05: reconciliation fills first-install/resume gaps
    // only, it never owns updates). A reconciliation-time error (e.g. a
    // path-traversal filename) must never abort the WHOLE run — fall back
    // to the pre-23-03 full job list so every file still goes through
    // downloadSingleFile's own per-job try/catch, which already records a
    // per-file traversal/mismatch as a DepotDownloadFailure without ever
    // crashing the loop (T-21-01 preserved).
    let jobs: Array<{
      depotId: string
      key: Buffer
      file: DepotPlanFile
      fileSeed: number
    }>
    try {
      jobs = (await reconcilePartialState(plan, installRoot)).jobs
    } catch (err) {
      logWarning(
        [
          `downloadDepotFiles: reconciliation failed, falling back to a full re-download:`,
          err
        ],
        LogPrefix.Steam
      )
      jobs = []
      let fallbackSeed = 0
      for (const depot of plan.depots) {
        for (const file of depot.files) {
          jobs.push({
            depotId: depot.depotId,
            key: depot.key,
            file,
            fileSeed: fallbackSeed++
          })
        }
      }
    }

    const totalBytes = plan.totalBytes
    const failures: DepotDownloadFailure[] = []

    // Every file the reconciler skipped (already sha1-verified, not
    // re-downloaded) still needs its EDepotFileFlag modes re-applied
    // idempotently — heals an older partial download whose modes were never
    // set (RESEARCH.md Pattern 3). A failure here is NOT swallowed: it's
    // recorded the same way a fresh-download mode-application failure
    // already is (T-23-03), so a healing failure also blocks the
    // completeness gate below. Shared with library.ts's startup-resume path
    // (healReconciledFileModes, 23-code-review CR-01) — including its
    // Directory(64)/Symlink(512) skip guard (23-code-review WR-01), so a
    // manifest entry combining those bits with ReadOnly/Hidden can never
    // reach chmod/attrib.exe against a directory or symlink path here either.
    const jobFiles = new Set(jobs.map((j) => j.file))
    const { failures: healFailures } = await healReconciledFileModes(
      plan,
      installRoot,
      jobFiles,
      modeCounters
    )
    failures.push(...healFailures)

    let doneBytes = 0 // decompressed bytes written to disk — drives percent + disk rate
    let netBytes = 0 // compressed bytes fetched over the wire — drives download rate
    let lastEmitBytes = 0
    let lastEmitNetBytes = 0
    let lastEmitTime = Date.now()
    let lastDownSpeed = 0 // MiB/s — reused across sub-window forced emits
    let lastDiskSpeed = 0 // MiB/s
    const tStart = Date.now()

    // Debug/steam-install-slow-start (cycle 3): ONE tracker for this whole
    // download run, shared across every file/depot — host health is a
    // property of the RUN (which content-server edges are currently good),
    // never per-file. See depot/hostHealth.ts for the root-cause writeup and
    // scoring/blacklist mechanics. Cycle 5: seeded with the directory's own
    // weightedload ranking (opts.hostWeightedLoads) so cold-start selection
    // favors the local, low-weightedload edges immediately.
    const hostHealth = new HostHealthTracker(opts.hostWeightedLoads)

    // Debug/steam-install-slow-start (cycle 7): ONE forward-progress clock
    // for this whole download run, shared across every file/depot — see
    // depot/stallTracker.ts. Lets downloadFileChunks re-queue an exhausted
    // chunk instead of aborting its whole file, as long as the run overall
    // keeps making progress; only a genuine, sustained run-wide stall gives
    // up honestly.
    const stallTracker = new StallTracker()

    // Debug/steam-install-slow-start (cycle 2): the chunk-fetch retry/rotation/
    // timeout path was previously completely invisible in the dev log — this
    // block makes it observable without changing any retry/backoff/rotation
    // behavior (fetchChunk's onAttempt hook is purely a reporting callback).
    // Aggregated PER HOST (not per-chunk — a multi-thousand-chunk install would
    // flood the log) and flushed periodically via the existing heartbeat below.
    interface HostStat {
      attempts: number
      successes: number
      timeouts: number
      errors: number
      totalMs: number
      // Debug/steam-install-slow-start (diagnostic re-open, cycle 9): per-
      // reason failure counts (HTTP status / error name-or-code) for
      // outcome==='error' attempts only -- timeouts are already
      // unambiguously CHUNK_FETCH_TIMEOUT_MS firing (see `timeouts` above)
      // and are not broken down further. Purely observational: read only by
      // logChunkStreamStats below, never by any selection/retry/backoff
      // logic.
      reasons: Map<string, number>
    }
    const hostStats = new Map<string, HostStat>()
    let totalAttempts = 0
    let totalRotations = 0 // attempt index > 0 -- a chunk that needed >1 host
    let totalTimeouts = 0
    let firstByteMs: number | undefined
    const onAttempt: OnChunkAttempt = (ev) => {
      totalAttempts++
      if (ev.attempt > 0) totalRotations++
      if (ev.outcome === 'timeout') totalTimeouts++
      const stat = hostStats.get(ev.host) ?? {
        attempts: 0,
        successes: 0,
        timeouts: 0,
        errors: 0,
        totalMs: 0,
        reasons: new Map<string, number>()
      }
      stat.attempts++
      stat.totalMs += ev.ms
      if (ev.outcome === 'success') stat.successes++
      else if (ev.outcome === 'timeout') stat.timeouts++
      else {
        stat.errors++
        if (ev.reason)
          stat.reasons.set(ev.reason, (stat.reasons.get(ev.reason) ?? 0) + 1)
      }
      hostStats.set(ev.host, stat)
    }

    // Ranks hosts worst-first (timeouts+errors desc) and caps the line length —
    // a large install can resolve dozens of content-server hosts, and logging
    // every one every ~15s would itself become log noise.
    const logChunkStreamStats = () => {
      const elapsedSec = Math.round((Date.now() - tStart) / 1000)
      const percent =
        totalBytes > 0 ? Math.round((doneBytes / totalBytes) * 100) : 0
      // Debug/steam-install-slow-start (cycle 3): tags each host with the
      // hostHealth tracker's own live unhealthy/healthy verdict — lets a
      // hardware reproduction confirm the scoring/blacklist logic is actually
      // deprioritizing the same hosts the raw a/ok/to/err counts suggest are
      // bad, without having to cross-reference two separate systems by hand.
      const worst = Array.from(hostStats.entries())
        .map(([host, s]) => ({
          host,
          ...s,
          avgMs: s.attempts ? Math.round(s.totalMs / s.attempts) : 0,
          unhealthy: hostHealth.snapshot(host).unhealthy,
          // Debug/steam-install-slow-start (cycle 5): the directory's own
          // weightedload for this host, when known — lets a hardware
          // reproduction directly confirm the low-weightedload local caches
          // are absorbing the attempts and the high-weightedload (130) CDN
          // fallbacks are receiving little/none, per the fix directive.
          weightedload: opts.hostWeightedLoads?.get(host),
          // Debug/steam-install-slow-start (cycle 7): the scheme this host is
          // actually being requested over (mandatory-https vs http) + whether
          // it's a usetokenauth server — lets a hardware reproduction confirm
          // alibaba (https_support='unavailable') is now requested over http,
          // and that NO host is quietly triggering a token fetch.
          scheme:
            opts.hostMeta?.get(host)?.httpsSupport === 'mandatory'
              ? 'https'
              : 'http',
          usetokenauth: !!opts.hostMeta?.get(host)?.usetokenauth,
          // CDN-auth implementation cycle: the directory's own `type` for
          // this host (CDN vs SteamCache) — lets a hardware validation run
          // directly confirm the widened `wantsCdnAuthToken` gate (PART 2)
          // is firing for type=CDN hosts and NOT for type=SteamCache ones,
          // and that a token is actually being acquired (via the separate
          // `[Timing] CDN auth token acquired` log line) for the hosts that
          // previously flipped 403 -> ok.
          type: opts.hostMeta?.get(host)?.type,
          // Debug/steam-install-slow-start (diagnostic re-open, cycle 9):
          // compact failure-reason breakdown for this host's `errors`
          // count, worst (most frequent) reason first, capped at 4 distinct
          // reasons so a host with many different failure signatures still
          // renders a bounded line. Empty string when there are no
          // outcome==='error' attempts for this host yet.
          errBreakdown: Array.from(s.reasons.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([reason, count]) => `${reason}:${count}`)
            .join(',')
        }))
        .sort((a, b) => b.timeouts + b.errors - (a.timeouts + a.errors))
        .slice(0, 6)
        .map(
          (s) =>
            `${s.host}[a=${s.attempts} ok=${s.successes} to=${s.timeouts} ` +
            `err=${s.errors}${s.errBreakdown ? `{${s.errBreakdown}}` : ''} ` +
            `avgMs=${s.avgMs}${s.weightedload !== undefined ? ` wl=${s.weightedload}` : ''} ` +
            `scheme=${s.scheme}${s.usetokenauth ? ' usetokenauth' : ''}` +
            `${s.type ? ` type=${s.type}` : ''}${s.unhealthy ? ' UNHEALTHY' : ''}]`
        )
        .join(' ')
      logInfo(
        `[Timing] chunk-stream stats @${elapsedSec}s: percent=${percent}% ` +
          `downSpeedMiBs=${lastDownSpeed.toFixed(2)} diskSpeedMiBs=${lastDiskSpeed.toFixed(2)} ` +
          `totalAttempts=${totalAttempts} rotations=${totalRotations} timeouts=${totalTimeouts} ` +
          `hosts=${hostStats.size} worstHosts=[${worst}]`,
        LogPrefix.Steam
      )
    }

    const emitProgress = (force: boolean) => {
      const percentDelta =
        totalBytes > 0 ? ((doneBytes - lastEmitBytes) / totalBytes) * 100 : 0
      const timeDelta = Date.now() - lastEmitTime
      // THROTTLE (~1%/500ms), never per-chunk — an IPC flood on a fast LAN (T-21-12).
      if (
        !force &&
        percentDelta < PROGRESS_THROTTLE_PERCENT &&
        timeDelta < PROGRESS_THROTTLE_MS
      ) {
        return
      }

      // Rolling/instantaneous rates over the window since the last emit (not a
      // cumulative average since start), so both figures reflect the CURRENT
      // rate and drop promptly on a stall. downSpeed = network (compressed)
      // transfer; diskSpeed = write (decompressed) throughput — for game assets
      // the decompressed rate typically reads higher than the wire rate.
      lastDownSpeed = rollingRateMiBs(
        netBytes - lastEmitNetBytes,
        timeDelta,
        lastDownSpeed
      )
      lastDiskSpeed = rollingRateMiBs(
        doneBytes - lastEmitBytes,
        timeDelta,
        lastDiskSpeed
      )

      lastEmitBytes = doneBytes
      lastEmitNetBytes = netBytes
      lastEmitTime = Date.now()

      // ETA stays a STABLE estimate from the cumulative average install rate
      // (disk bytes since start) — an instantaneous ETA would jitter every frame.
      const elapsedSec = (Date.now() - tStart) / 1000
      const avgBytesPerSec = elapsedSec > 0 ? doneBytes / elapsedSec : 0
      const remaining = Math.max(totalBytes - doneBytes, 0)
      const etaSec = avgBytesPerSec > 0 ? remaining / avgBytesPerSec : 0

      // Exact shape library.ts's pollInstallOnce() (L944-953) already speaks —
      // the DownloadManager needs zero changes for the native depot-download path.
      sendFrontendMessage('progressUpdate', {
        appName: plan.appId,
        runner: 'steam',
        status: 'installing',
        progress: {
          // Denominator is the REAL multi-depot summed total (D-03), never a
          // single depot's own bytes.
          // WR-03: clamp to 100 — doneBytes can exceed totalBytes (matches
          // library.ts pollInstallOnce's own Math.min(100, ...) clamp).
          percent:
            totalBytes > 0
              ? Math.min(100, Math.round((doneBytes / totalBytes) * 100))
              : 0,
          bytes: getFileSize(doneBytes),
          // MiB/s (not raw bytes/sec) to match the UI's "MB/s" label + the
          // gog/legendary unit convention (UAT D-UAT-02).
          downSpeed: lastDownSpeed,
          diskSpeed: lastDiskSpeed,
          // HH:MM:SS, not raw "1247s" (UAT D-UAT-02).
          eta: Number.isFinite(etaSec) && etaSec > 0 ? formatEta(etaSec) : ''
        }
      })
    }

    const queue = [...jobs]
    const workerCount = Math.min(FILE_CONCURRENCY, queue.length)

    // Wall-clock heartbeat: forces emitProgress(true) every PROGRESS_HEARTBEAT_MS
    // regardless of chunk completion, so the graph advances even when chunk
    // completions bunch up. Started just before the worker fan-out and cleared
    // in the finally below on BOTH normal completion and throw/abort -- never
    // leaks a dangling interval past this Promise.all's own lifetime.
    //
    // Debug/steam-install-slow-start (cycle 2): also flushes the chunk-stream
    // stats log every STATS_LOG_EVERY_TICKS ticks (~15s at the 1s heartbeat
    // cadence) -- deliberately reuses this SAME interval rather than starting a
    // second one, preserving the existing "exactly one setInterval" test
    // contract (depot.test.ts's heartbeat-cadence test).
    const STATS_LOG_EVERY_TICKS = 15
    let heartbeatTicks = 0
    const heartbeat = setInterval(() => {
      emitProgress(true)
      heartbeatTicks++
      if (heartbeatTicks % STATS_LOG_EVERY_TICKS === 0) {
        logChunkStreamStats()
      }
    }, PROGRESS_HEARTBEAT_MS)
    try {
      await Promise.all(
        Array.from({ length: workerCount }, async (_, fileWorkerSlot) => {
          while (queue.length) {
            // Checked per-file AND per-chunk (inside downloadFileChunks) so a
            // queue-cancel stops issuing new work promptly (D-02).
            if (opts.signal?.aborted) return
            const job = queue.shift()!
            try {
              await downloadSingleFile(
                installRoot,
                job.depotId,
                job.key,
                opts.hosts,
                lzma,
                job.file,
                job.fileSeed,
                opts.signal,
                (disk, net) => {
                  // Debug/steam-install-slow-start (cycle 2): time from the
                  // start of this streaming phase (tStart, set right before the
                  // heartbeat/worker fan-out) to the very FIRST decompressed
                  // byte landing on disk -- explains the reported "long lag
                  // before it initiated" independently of buildDepotPlan's
                  // already-measured ~3.5s (which ends before this phase
                  // starts).
                  if (firstByteMs === undefined && disk > 0) {
                    firstByteMs = Date.now() - tStart
                    logInfo(
                      `[Timing] downloadDepotFiles: first bytes written after ${firstByteMs}ms`,
                      LogPrefix.Steam
                    )
                  }
                  doneBytes += disk
                  netBytes += net
                  emitProgress(false)
                },
                pool.decode,
                onAttempt,
                hostHealth,
                opts.cdnAuth,
                opts.hostMeta,
                stallTracker,
                // Phase 25 (multi-host fan-out): this file's own slot in the
                // FILE_CONCURRENCY pool, combined inside downloadSingleFile
                // -> downloadFileChunks with the chunk pool's own index.
                fileWorkerSlot,
                // 23-06: this RUN's own mode-application counters (G-23-02
                // trace instrumentation) — scoped per invocation, see
                // DepotModeCounters doc comment.
                modeCounters
              )
            } catch (err) {
              failures.push({
                file: job.file.filename,
                error: (err as Error).message
              })
            }
          }
        })
      )
    } finally {
      clearInterval(heartbeat)
    }

    emitProgress(true)
    // Debug/steam-install-slow-start (cycle 2): always log a final stats
    // snapshot regardless of where heartbeatTicks landed relative to
    // STATS_LOG_EVERY_TICKS, so a short run (or one that fails before the
    // first periodic flush) still leaves a stats line in the log — total
    // attempts/timeouts/rotations are always meaningful even at totalBytes=0.
    if (totalAttempts > 0) {
      logChunkStreamStats()
    }

    // Phase 23 (23-02, D-01): a job left in `queue` means the run aborted
    // before every planned file was even attempted — never "verified".
    const allJobsAttempted = queue.length === 0

    // 23-06: final census, now including the RUNTIME counters that only
    // exist once the download has actually run — chmodAttempts/modeCallsites
    // discriminate H3 (modes applied then lost) from H1/H4, and
    // jobCount/reconciledSkipped discriminate H4 (reconciler + heal loop both
    // skipped the same files via their respective `!file.flags` guards).
    const finalCensus = summarizeDepotFlags(plan)
    logInfo(
      `steam-flags-census stage=download-complete appId=${plan.appId} ` +
        formatDepotFlagsCensus(finalCensus, {
          chmodAttempts: modeCounters.chmodAttempts,
          modeCallsites: modeCounters.modeCallsites,
          jobCount: jobs.length,
          reconciledSkipped: finalCensus.totalFiles - jobs.length
        }),
      LogPrefix.Steam
    )

    // Phase 23 (23-08 Task 2a): `allModesApplied` used to be vacuously
    // `failures.length === 0` — true even when ZERO mode applications were
    // ever attempted (T-23-27). Fail closed: if the manifest claims
    // executable-flagged entries (finalCensus.executableFlagged > 0) but
    // THIS RUN's own chmodAttempts is 0, the completeness gate must decline
    // StateFlags=4 regardless of `failures` being empty — forcing the
    // byte-identical StateFlags=1026 verify-handoff (D-01) instead of an
    // unproven `4`. Reads ONLY this run's own modeCounters (never
    // module-level, see the DepotModeCounters doc comment) so a concurrent
    // install of a DIFFERENT appId (23-05 supports this) can never satisfy
    // this run's gate on another run's behalf.
    //
    // Deliberately NOT triggered when executableFlagged === 0 (T-23-28): a
    // manifest that genuinely has no executable-flagged entries (a pure
    // data depot, or — per 23-TRACE.md's H2 verdict — a native macOS title
    // whose manifest never carries Executable/CustomExecutable bits at all)
    // must still earn allModesApplied: true here; an over-strict gate would
    // force every such install to 1026 and silently destroy the whole
    // phase's value. G-23-02's fix for THAT case is 23-08 Task 3's
    // narrowly-scoped Mach-O fallback, which operates independently of this
    // gate.
    const executableClaimedByManifest = finalCensus.executableFlagged > 0
    const modesActuallyAppliedThisRun = modeCounters.chmodAttempts > 0
    const allModesApplied =
      failures.length === 0 &&
      (!executableClaimedByManifest || modesActuallyAppliedThisRun)

    if (executableClaimedByManifest && !modesActuallyAppliedThisRun) {
      logWarning(
        `downloadDepotFiles: appId=${plan.appId} manifest claims ` +
          `executableFlagged=${finalCensus.executableFlagged} but this ` +
          `run's chmodAttempts=0 — failing closed to StateFlags=1026 ` +
          `instead of an unproven StateFlags=4 (G-23-02/T-23-27)`,
        LogPrefix.Steam
      )
    }

    return {
      outcome: opts.signal?.aborted ? 'cancelled' : 'completed',
      failures,
      allFilesVerifiedThisRun: allJobsAttempted && failures.length === 0,
      allModesApplied
    }
  } finally {
    // No workers leak across installs — shutdown() is safe to call even if
    // init() itself fell back to inline decode (it just terminates zero
    // workers in that case).
    await pool.shutdown()
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 21 (21-06)/Phase 23 (23-02): finalizeToSteam — the SINGLE recovery
// mechanism (Pattern 5, D-04/D-05/D-07). Cancel, failure, and full success
// ALL converge here: measure REAL bytes on disk (never a manifest-derived
// sum — spike 001: a summed total overshoots multi-depot installs by
// 236MB), then decide StateFlags via the canWriteFullOwnership completeness
// gate (D-01/D-02, spike-003 VALIDATED). When the gate earns it, writes a
// trustworthy StateFlags=4 (full ownership, Steam runs no verify pass) with
// the real public-branch buildid and download-complete byte counts; when it
// doesn't — any missing/ambiguous signal — falls back to the unchanged,
// unconditional StateFlags=1026 verify-handoff Phase 21 already shipped
// (Steam's own verify-and-repair pass reconciles whatever landed against the
// real manifest). The manifest write is always the LAST filesystem action so
// a Retry (re-invoking downloadSteamDepots) never races a partially-written
// .acf (D-07's non-conflicting-paths guarantee).
// ─────────────────────────────────────────────────────────────────────────

export interface FinalizeDepotEntry {
  /** Steam depot id. STRING — never coerced to Number (T-21-04). */
  depotId: string
  /** 64-bit manifest GID. STRING — never coerced to Number (T-21-04). */
  gid: string
  /** Depot's declared size in bytes (from the DepotPlan, NOT what's actually
   *  on disk — SizeOnDisk is separately measured below). */
  size: number
}

export interface FinalizeToSteamOpts {
  targetSteamappsDir: string
  installdir: string
  name: string
  /** Every depot ATTEMPTED, regardless of per-file success/failure — an
   *  honest, possibly-incomplete InstalledDepots map (D-04). */
  depots: FinalizeDepotEntry[]
  /** Current public-branch buildid, threaded from the plan-time PICS capture
   *  (DepotPlan.buildid) — NEVER re-derived by a second PICS call here
   *  (D-02, RESEARCH.md Pitfall 4). A "0"/absent buildid reads to Steam as
   *  UpdateRequired and always fails the canWriteFullOwnership gate below. */
  buildid?: string
  /** D-01/D-02 completeness-gate inputs, threaded from the DepotDownloadResult
   *  of the run that just attempted this install/resume. Optional: a caller
   *  that omits these (e.g. a finalize invoked with no download attempt at
   *  all) fails CLOSED to the safe 1026 fallback — canWriteFullOwnership
   *  never resolves true on an absent/undefined input. */
  outcome?: 'completed' | 'cancelled'
  failures?: DepotDownloadFailure[]
  allFilesVerified?: boolean
  allModesApplied?: boolean
}

/**
 * Recursively sums real file sizes under `root` — the measured on-disk byte
 * total finalizeToSteam writes as SizeOnDisk, NEVER a DepotPlan-derived sum
 * (spike 001: summed totals overshoot multi-depot installs by 236MB). Missing
 * root (nothing landed yet, e.g. a connection failure before any file write)
 * measures as 0, not an error — an honest empty state is still a valid
 * finalize target (D-04).
 */
async function measureInstalledBytes(root: string): Promise<number> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return 0
  }

  let total = 0
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      total += await measureInstalledBytes(full)
    } else if (entry.isFile()) {
      total += (await stat(full)).size
    }
  }
  return total
}

/**
 * The single recovery function cancel, failure, and success ALL funnel
 * through (Pattern 5). Writes StateFlags "4" (full ownership, Steam runs no
 * verify pass) ONLY when canWriteFullOwnership earns it from the threaded
 * completeness-gate inputs (D-01/D-02, spike-003 VALIDATED); otherwise falls
 * back to the unchanged "1026" verify-handoff via manifest.ts's own default,
 * with a measured (not summed) SizeOnDisk and the honest InstalledDepots map
 * of whatever was attempted.
 */
export async function finalizeToSteam(
  appId: string,
  opts: FinalizeToSteamOpts
): Promise<void> {
  assertNumericAppId(appId)

  const installRoot = resolve(
    opts.targetSteamappsDir,
    'common',
    opts.installdir
  )
  const sizeOnDisk = await measureInstalledBytes(installRoot)

  // SteamID64 of the currently-authenticated user, if any — LastOwner is a
  // STRING (64-bit), never a JS Number (T-21-04). Falls back to manifest.ts's
  // own "0" default when no authenticated client is available (e.g. a future
  // Plan 08 startup-resume finalize invoked before reconnection completes).
  const lastOwner = SteamUser.getClient()?.steamID?.getSteamID64()

  // Phase 23 (23-02, D-01/D-02): the single completeness-gate call site.
  // buildid is ONLY ever the caller-supplied opts.buildid (plan-time PICS
  // capture, D-02) — a fresh PICS product-info lookup is never issued here
  // (RESEARCH.md Pitfall 4). Every gate input defaults to a value that fails
  // CLOSED when the caller omits it (e.g. today's startup-resume finalize,
  // Wave 3), matching canWriteFullOwnership's own fail-closed contract.
  const canWrite4 = canWriteFullOwnership({
    outcome: opts.outcome ?? 'cancelled',
    failures: opts.failures ?? [],
    buildid: opts.buildid,
    allFilesVerified: opts.allFilesVerified ?? false,
    allModesApplied: opts.allModesApplied ?? false
  })
  if (canWrite4) {
    logInfo(
      `Writing StateFlags=4 full-ownership manifest for appId ${appId} ` +
        `(sizeOnDisk=${sizeOnDisk}, buildid=${opts.buildid})`,
      LogPrefix.Steam
    )
  }

  await writeAppManifest(opts.targetSteamappsDir, {
    appId,
    installdir: opts.installdir,
    name: opts.name,
    sizeOnDisk: String(sizeOnDisk),
    lastOwner,
    stateFlags: canWrite4 ? '4' : undefined,
    bytes: canWrite4 ? String(sizeOnDisk) : undefined,
    buildid: canWrite4 ? opts.buildid : undefined,
    installedDepots: opts.depots.map((d) => ({
      depotId: d.depotId,
      manifest: d.gid,
      size: d.size
    }))
  })
}

/** Raw per-server shape client.getContentServers resolves with — the full
 *  field set steam-user's cdn.js actually returns (confirmed by reading
 *  source, widened in diagnostic cycle 4 from a Host/vhost-only declaration).
 *  `usetokenauth` added cycle 7 (steam-install-slow-start): steam-user's own
 *  cdn.js `getContentServers` reduction has this field HARD-CODED commented
 *  out (`//usetokenauth: '1'`) in the installed steam-user@5.3.0 source — so
 *  in practice it is always absent/undefined from every real directory
 *  response observed so far — but is declared as a real field (not assumed
 *  always-false) so a future steam-user version that DOES populate it is
 *  honored automatically by `reduceContentServers`'s `usetokenauth === 1`
 *  check below, matching steam-user's own `contentServer.usetokenauth == 1`
 *  gate exactly.
 *  Named + exported so `reduceContentServers` below is directly testable
 *  against fixture data without a live CM round-trip. */
export interface RawContentServer {
  Host?: string
  vhost?: string
  type?: string
  sourceid?: number
  cell?: number
  // Debug/steam-install-slow-start (cycle 8): the directory's REAL response
  // returns `load`/`weightedload` as STRINGS (confirmed via the cycle-4/5
  // RAW JSON dump, e.g. `"weightedload": "130"`), not numbers — widened from
  // `number` to `number | string` to match what steam-user's cdn.js actually
  // hands back. `reduceContentServers` below coerces via `Number(...)`
  // (NaN-guarded) before storing into `weightedLoads`.
  load?: number | string
  weightedload?: number | string
  preferred_server?: boolean
  NumEntriesInClientList?: number
  https_support?: string
  usetokenauth?: number
  allowed_app_ids?: number[]
}

/**
 * Debug/steam-install-slow-start (cycle 5): pure reduction of the raw
 * directory response into (a) the flat hostname list downloadDepotFiles has
 * always consumed, (b) a hostname -> weightedload PARALLEL MAP —
 * threading through the directory's own load-based ranking (cycle-4 lead
 * (a): the exact field this reduction previously discarded via
 * `servers.map((s) => s.Host ?? s.vhost)`) so HostHealthTracker can seed its
 * cold-start PRIOR from it (depot/hostHealth.ts), and (c, cycle 7) a
 * hostname -> ContentServerHostMeta PARALLEL MAP carrying `https_support`/
 * `usetokenauth` so fetchChunk can build the URL with EXACT steam-user
 * parity (depot/decompress.ts). A server missing/invalid `weightedload` is
 * simply omitted from that map (not defaulted to a synthetic worst-case
 * value) — HostHealthTracker treats an absent entry as "no prior signal",
 * falling through to its pre-cycle-5 neutral behavior for that host, never
 * inventing a ranking the directory didn't actually supply. Extracted as a
 * standalone pure function (no client/network dependency) so this mapping
 * is directly unit-testable.
 */
export function reduceContentServers(servers: RawContentServer[]): {
  hosts: string[]
  weightedLoads: Map<string, number>
  hostMeta: Map<string, ContentServerHostMeta>
} {
  const hosts: string[] = []
  const weightedLoads = new Map<string, number>()
  const hostMeta = new Map<string, ContentServerHostMeta>()
  for (const s of servers) {
    const host = s.Host ?? s.vhost
    if (!host) continue
    hosts.push(host)
    // Debug/steam-install-slow-start (cycle 8): the directory returns
    // `weightedload` as a STRING on real responses (e.g. "130"), not a
    // number — the pre-cycle-8 `typeof s.weightedload === 'number'` guard
    // silently dropped every real-world entry, leaving `weightedLoads`
    // permanently empty (`[Timing] ... weightedLoads=0` for every hardware
    // run) and making the weightedload-aware selection (cycle 5) inert.
    // Coerce via `Number(...)` regardless of the source type, still
    // NaN-guarded so a missing/malformed value is omitted (never defaulted
    // to a synthetic worst-case ranking) rather than stored as `NaN`.
    if (s.weightedload !== undefined && s.weightedload !== null) {
      const numWeightedload = Number(s.weightedload)
      if (Number.isFinite(numWeightedload)) {
        weightedLoads.set(host, numWeightedload)
      }
    }
    // Cycle 7: `usetokenauth === 1` mirrors steam-user's OWN
    // `contentServer.usetokenauth == 1` gate exactly (cdn.js's downloadChunk)
    // — never a loose truthy check, so a stray non-1 value never
    // accidentally turns on token fetching for a server that didn't ask.
    // CDN-auth implementation cycle, PART 2: `type` is threaded alongside so
    // decompress.ts's `wantsCdnAuthToken` can widen the gate to `type ===
    // 'CDN'` -- this codebase's own directory captures never see
    // `usetokenauth` populated, but the RESEARCH SPIKE's content_log.txt
    // evidence shows the real client authenticates unconditionally on every
    // type=CDN host regardless of that flag.
    hostMeta.set(host, {
      httpsSupport: s.https_support,
      usetokenauth: s.usetokenauth === 1,
      type: s.type
    })
  }
  return { hosts, weightedLoads, hostMeta }
}

/**
 * Content-server hostnames (+ weightedload ranking, cycle 5; + per-host
 * https_support/usetokenauth metadata, cycle 7) for chunk download (Plan
 * 05's downloadDepotFiles `hosts`/`hostWeightedLoads`/`hostMeta` params) —
 * steam-user's getContentServers is undocumented in @types/steam-user
 * (Pitfall 5), same discipline as getDepotDecryptionKey/getRawManifest above.
 */
async function getContentServerHosts(
  client: SteamUserDepotClient,
  numericAppId: number
): Promise<{
  hosts: string[]
  weightedLoads: Map<string, number>
  hostMeta: Map<string, ContentServerHostMeta>
}> {
  // [Timing] debug/steam-install-slow-start: this is a live client.getContentServers
  // CM round-trip that runs AFTER buildDepotPlan (already fully instrumented) and
  // BEFORE downloadDepotFiles's first byte — previously unmeasured, and a candidate
  // for the "stuck at 0%" gap the buildDepotPlan-only timing couldn't account for.
  const start = Date.now()
  // G-30-02 (30-07, checker finding #3 extension): bounded — same call-class
  // and rationale as fetchDepotPlanEntry's getDepotDecryptionKey/getRawManifest
  // above; a stale CM socket here would otherwise hang the pre-download phase
  // just as easily as a stale getProductInfo call.
  const servers = await withTimeout(
    new Promise<RawContentServer[]>((resolvePromise, reject) => {
      client.getContentServers(numericAppId, (err, s) =>
        err ? reject(err) : resolvePromise(s)
      )
    }),
    STEAM_PICS_TIMEOUT_MS,
    'getContentServerHosts getContentServers'
  )
  // [Timing] debug/steam-install-slow-start diagnostic lead (a) — ONE-TIME raw
  // dump of the directory response BEFORE we reduce it below. Kept (cycle 5):
  // this is exactly how the cycle-4 capture that motivated this cycle's
  // weightedload-aware selection was read, and remains the fastest way to
  // confirm/deny the directory's ranking on the next hardware run.
  logInfo(
    `[Timing] getContentServerHosts RAW for appId ${numericAppId}: ${JSON.stringify(servers)}`,
    LogPrefix.Steam
  )
  const { hosts, weightedLoads, hostMeta } = reduceContentServers(servers)
  logInfo(
    `[Timing] getContentServerHosts: getContentServers for appId ${numericAppId} took ` +
      `${Date.now() - start}ms, hosts=${hosts.length}, weightedLoads=${weightedLoads.size}`,
    LogPrefix.Steam
  )
  if (!hosts.length) {
    throw new Error('downloadSteamDepots: no content servers available')
  }
  return { hosts, weightedLoads, hostMeta }
}

// Debug/steam-install-slow-start: cycle 2 tried a periodic (3min)
// getContentServers re-fetch that spliced a fresh host list in place,
// hypothesizing that individual degrading/rate-limited edges could be
// dropped by re-resolving the pool. DISPROVEN by the cycle-3 hardware
// reproduction with per-host stats instrumentation: Steam returned the
// IDENTICAL 6-host list every refresh for the whole run ("replaced host list
// (6 -> 6)", same hostnames) — the CDN assigns a fixed edge set per
// app/region and re-resolving it changes nothing. REPLACED (cycle 3) by
// depot/hostHealth.ts's health-aware selection below, which works WITHIN the
// same fixed host pool instead of trying to refresh it away.

export interface DepotDownloadOutcome {
  status: 'done' | 'error' | 'cancelled'
  error?: string
}

/**
 * The public depot-download orchestrator — Plan 07's SteamGame.install() call
 * site. Builds the DepotPlan (buildDepotPlan), resolves content-server hosts,
 * streams every file to disk (downloadDepotFiles), and ALWAYS converges on
 * finalizeToSteam: on full success, on a partial/failed download, on
 * AbortSignal cancel, and on any thrown error from plan-building itself
 * (Pattern 5, D-04/D-05/D-07). The manifest write is always the LAST
 * filesystem action before returning control. NEVER throws — every failure
 * mode maps to a structured outcome the caller (Plan 07) and the
 * DownloadManager queue consume directly, the same convention gog/legendary's
 * own install() functions already use.
 */
export async function downloadSteamDepots(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<DepotDownloadOutcome> {
  const attempted: FinalizeDepotEntry[] = []
  let displayName = opts.installdir
  // D-02: captured once from the DepotPlan (plan-time PICS read) so
  // finalizeToSteam can thread the real buildid into a StateFlags=4
  // manifest — never re-derived by a second PICS call (Pitfall 4).
  let buildid: string | undefined
  // D-01: the completeness-gate inputs from the download run this
  // orchestration actually performed. Undefined (never assigned) on the
  // zero-depot early-return and the thrown-error catch path below — both
  // correctly fail CLOSED to the 1026 fallback via finalizeToSteam's own
  // opts-omitted defaults.
  let lastResult: DepotDownloadResult | undefined

  // D-UAT-09 (21-17): an aborted signal forces the outcome threaded into
  // finalizeToSteam to 'cancelled' regardless of what lastResult.outcome
  // says — closes the race where a user cancel landing after the last
  // in-loop signal check would otherwise let downloadDepotFiles's own
  // 'completed' outcome flow straight through to canWriteFullOwnership.
  // canWriteFullOwnership itself is untouched (still requires
  // outcome==='completed'); this is the single call site deciding what
  // outcome value it ever sees.
  const finalize = (): Promise<void> => {
    const cancelled =
      lastResult?.outcome === 'cancelled' || opts.signal?.aborted === true
    return finalizeToSteam(appId, {
      targetSteamappsDir: opts.targetSteamappsDir,
      installdir: opts.installdir,
      name: displayName,
      depots: attempted,
      buildid,
      outcome: cancelled ? 'cancelled' : lastResult?.outcome,
      failures: lastResult?.failures,
      allFilesVerified: lastResult?.allFilesVerifiedThisRun,
      allModesApplied: lastResult?.allModesApplied
    })
  }

  try {
    const plan = await buildDepotPlan(appId, opts)
    displayName = plan.name
    buildid = plan.buildid

    for (const d of plan.depots) {
      attempted.push({
        depotId: d.depotId,
        gid: d.gid,
        size: d.files.reduce((sum, f) => sum + Number(f.size), 0)
      })
    }

    if (!plan.depots.length) {
      // Nothing owned/matching this OS — still finalize (honest, empty
      // state) so a dangling prior partial attempt is never left unresolved.
      await finalize()
      // WR-02 (21-17): honor an abort on this early return exactly like the
      // main path (L2119) and the thrown-error path (L2152) do. If the signal
      // was aborted after buildDepotPlan resolved with zero depots, finalize()
      // above already forced the honest 'cancelled'/1026 manifest; reporting
      // 'done' here would skip games.ts runNativeDepotDownload's cancelled
      // branch and thus never call markSteamInstallIncomplete — surfacing an
      // aborted install as if it had succeeded. Returning 'cancelled' routes
      // it through the SAME abort->cancelled->mark chain (is_installed=false,
      // steamResumePending=true) as the other two abort return paths.
      return opts.signal?.aborted === true
        ? { status: 'cancelled' }
        : { status: 'done' }
    }

    const client = getDepotClient()
    const {
      hosts,
      weightedLoads: hostWeightedLoads,
      hostMeta
    } = await getContentServerHosts(client, Number(appId))
    throwIfAborted(opts.signal)

    // Debug/steam-install-slow-start: cycle 2's periodic host-list refresh
    // (disproven — see the comment above getContentServerHosts) is REPLACED
    // by health-aware selection WITHIN this fixed host list, applied inside
    // downloadDepotFiles via its own HostHealthTracker (depot/hostHealth.ts).
    // Cycle 5: hostWeightedLoads threads the directory's own load-based
    // ranking (cycle-4 lead (a)) into that tracker's cold-start PRIOR.
    // Cycle 6: one CdnAuthTokenCache per download run — created here (where
    // the authenticated `client` is available) and threaded through
    // downloadDepotFiles the same way hosts/hostWeightedLoads already are, so
    // fetchChunk's chunk URLs CAN carry a real per-depot+host CDN auth
    // token (see depot/cdnAuth.ts). Cycle 7: gated strictly behind
    // `hostMeta`'s per-host `usetokenauth` flag inside fetchChunk itself —
    // cycle 6's unconditional fetch is DISPROVEN (see depot/decompress.ts's
    // fetchChunk doc comment); in practice this cache stays dormant.
    // hostMeta also threads https_support so fetchChunk can build the exact
    // steam-user URL scheme per host (unlocks http-only edges like alibaba).
    const cdnAuth = new CdnAuthTokenCache(client, Number(appId))
    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: opts.targetSteamappsDir,
      installdir: opts.installdir,
      hosts,
      hostWeightedLoads,
      cdnAuth,
      hostMeta,
      signal: opts.signal
    })
    lastResult = result

    // Manifest write is always the LAST fs action — after every file write
    // attempt, before returning control (D-07 no-race guarantee).
    await finalize()

    if (result.outcome === 'cancelled' || opts.signal?.aborted === true) {
      return { status: 'cancelled' }
    }
    if (result.failures.length) {
      // D-06: surface the CLASSIFIED, plain-language message — never the raw
      // failure string — so the DownloadManager queue's existing generic
      // error+Retry UI shows something actionable ("Steam servers dropped
      // the connection", not a stack trace).
      return {
        status: 'error',
        error: classifyDepotError(result.failures[0].error).message
      }
    }
    return { status: 'done' }
  } catch (err) {
    // Any thrown failure — plan-build error, content-server resolution
    // failure, anything — still funnels through the SAME finalize path
    // (Pattern 5): write whatever landed, never rethrow.
    await finalize().catch((finalizeErr) => {
      logWarning(
        [
          `downloadSteamDepots: finalizeToSteam itself failed for appId ${appId}:`,
          finalizeErr
        ],
        LogPrefix.Steam
      )
    })
    // D-UAT-05: a cancel issued during plan-building throws
    // DepotPlanAbortedError (or races with some OTHER thrown error while the
    // signal is already aborted) — checked via opts.signal?.aborted rather
    // than `instanceof` so either case still reports 'cancelled', matching
    // downloadDepotFiles's own signal-aborted -> 'cancelled' outcome instead
    // of surfacing a spurious error/Retry UI for a user-requested stop.
    if (opts.signal?.aborted) {
      return { status: 'cancelled' }
    }
    return { status: 'error', error: classifyDepotError(err).message }
  }
}
