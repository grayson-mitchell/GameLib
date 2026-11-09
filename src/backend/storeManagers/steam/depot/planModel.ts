// Depot plan model: flag constants, plan/option interfaces and steam-user client types (extracted from ../depot.ts, 62-09).

import type SteamUserLib from 'steam-user'
import { type AuthSessionReason } from '../userTypes'

/** Numeric-only guard for appId before any network/filesystem use (T-21-05). */
export const NUMERIC_ID = /^\d+$/

/** EDepotFileFlag bit values, per steam-user's own authoritative enum
 *  (node_modules/steam-user/enums/EDepotFileFlag.js) — Directory = 64,
 *  Symlink = 512. Hardcoded here rather than imported since steam-user does
 *  not export this enum from its public entrypoint (CR-01 gap closure, 21-13).
 *  Exported (23-06) so depot/flagsCensus.ts's census summarizer imports
 *  these rather than re-literalling the numeric bit values. */
export const DIRECTORY_FLAG = 64
export const SYMLINK_FLAG = 512

/** debug/steam-depot-unclassified-generic-error (F2): how many individual
 *  per-file download failures downloadDepotFiles logs in full before
 *  suppressing the rest. A stalled 19k-file title can fail thousands of
 *  files; the aggregate logged at the throw site always reports the true
 *  total, so the cap costs no information about SCALE, only about which
 *  specific files beyond the first N. */
export const FAILURE_LOG_CAP = 10

/**
 * Render a thrown depot failure for the log with the fields that actually
 * discriminate causes — `code` (fs/HTTP errors: EISDIR, ENOSPC, ECONNRESET)
 * and `eresult` (Steam CM errors) — which `(err as Error).message` alone
 * drops. These are the exact two properties classifyDepotError reads
 * (37-02 D-08), so a failure that reaches the UNCLASSIFIED generic bucket
 * now leaves behind the same evidence the classifier saw and rejected.
 *
 * Exported for depot.test.ts. Never throws: a non-Error thrown value
 * (string, undefined, a rejected non-Error) must still produce a log line
 * rather than replacing a download failure with a TypeError.
 */
export function describeDepotFailure(err: unknown): string {
  // Only string/number are rendered for code/eresult: an object-valued
  // property would stringify to a useless "[object Object]" and is better
  // omitted than logged as noise (also what keeps this no-base-to-string
  // clean rather than suppressed).
  const scalar = (v: unknown): string | undefined =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : undefined

  if (typeof err !== 'object' || err === null) {
    return typeof err === 'string' ? err : String(err)
  }

  const e = err as { message?: unknown; code?: unknown; eresult?: unknown }
  const parts: string[] = []
  if (typeof e.message === 'string' && e.message) {
    parts.push(e.message)
  } else if (err instanceof Error) {
    // `new Error('')` — no message, but the name still identifies the class.
    parts.push(err.name)
  }

  const code = scalar(e.code)
  if (code !== undefined) parts.push(`code=${code}`)
  const eresult = scalar(e.eresult)
  if (eresult !== undefined) parts.push(`eresult=${eresult}`)

  return parts.length ? parts.join(' ') : '[non-Error value thrown]'
}
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
// Not exported (this and DownloadSteamDepotsOpts, DepotPlanChunk, DepotPlanEntry,
// PLAN_BUILD_RETRY_DELAY_MS, TARGET_INFLIGHT_CHUNKS, DownloadDepotFilesOpts,
// DepotDownloadResult, FinalizeDepotEntry and DepotDownloadOutcome elsewhere in this
// file): verified to have no importer anywhere -- every cross-file mention is a prose
// comment, not an import (`pnpm find-deadcode` / ts-prune flagged the previously-exported
// forms as over-broad `export` keywords).
export interface DepotModeCounters {
  /** Incremented only on the branch that actually calls `chmod(dest, 0o755)`. */
  chmodAttempts: number
  /** Incremented on every entry to `applyEDepotFileModes`, regardless of
   *  which branch (if any) fires. */
  modeCallsites: number
}

/**
 * One failed file (or, with `scope: 'run'`, the whole run). Lives here rather than in the TS
 * download module so the Rust error map and `selectPrimaryDepotFailure` outlive it (73-19).
 */
export interface DepotDownloadFailure {
  file: string
  error: string
  /** 37-02: the original thrown value, so classifyDepotError can read `.code`/`.eresult` off it
   *  instead of the flattened `error` string. Optional: not every producer has one. */
  cause?: unknown
  /** Quick 260927-tpm: tags a run-level give-up (the stall bound) so it can be told apart from a
   *  per-file failure. Absent means file-level. */
  scope?: 'run'
}

export interface DownloadSteamDepotsOpts {
  targetSteamappsDir: string
  installdir: string
  /** Required — never defaulted to the host OS here (select.ts's own discipline). */
  os: string
  language?: string
  signal?: AbortSignal
  /** Phase 54, internal: the reason logged with the lease buildDepotPlan
   *  acquires. Defaults to 'user-install'; prescreenBridgeDepots passes
   *  'prescreen'. Never user-facing. */
  sessionReason?: AuthSessionReason
}

/** One chunk within a depot manifest file, exactly as steam-user's raw manifest
 *  parser returns it (offset/sha/cb_original — consumed unmodified by Plan 05's
 *  streaming download loop). */
interface DepotPlanChunk {
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
  /** Symlink target, DECRYPTED here (37-09) exactly like `filename` above —
   *  from the manifest's `linktarget` (protobuf field 7, content_manifest.proto)
   *  — only meaningful when `flags & Symlink` (512). */
  linktarget?: string
}

/** One resolved + manifest-fetched depot, ready for Plan 05's chunk download. */
interface DepotPlanEntry {
  /** Steam depot id. STRING — never coerced to Number (T-21-04). */
  depotId: string
  /** 64-bit manifest GID. STRING — never coerced to Number (T-21-04). */
  gid: string
  /** Per-depot decryption key from getDepotDecryptionKey. */
  key: Buffer
  files: DepotPlanFile[]
  /** The app whose PICS appinfo this depot was enumerated from. */
  ownerAppId?: string
  /** Zero-based position of this depot in the RAW appinfo `depots` section of
   *  `ownerAppId` (Steam's own order -- see depot/appinfoOrder.ts). Undefined
   *  when that order could not be recovered. Only comparable between depots
   *  with the same `ownerAppId`. */
  appinfoRank?: number
}

/**
 * The full enqueue-time contract the DownloadManager needs before a single
 * chunk is fetched: every owned depot, resolved + manifest-fetched + filename-
 * and linktarget-decrypted (37-09), plus the REAL total byte count summed
 * across ALL depots (D-03).
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
  /** 23.2-03 (G-23-01, D-01/D-02/D-03): depot ids that were selected and
   *  owned, but dropped from this plan because Steam refused their
   *  decryption key or manifest with `EResult 40 (Blocked)`. Required (not
   *  optional) so every construction site must decide it explicitly — the
   *  same discipline `canWriteFullOwnership`'s fail-closed shape uses.
   *  STRINGS end-to-end, never coerced through `Number()` (T-21-04). Reported
   *  downstream via `DepotDownloadOutcome.skippedDepots`; never used to drive
   *  any retry/repair path (D-05 — no recovery). */
  skippedDepots: string[]
  /** quick 261026-nhy: whether buildDepotPlan judged the destination volume
   *  case-insensitive. resolveDepotPathCollisions and
   *  verifyStructuralIntegrity's collision fallback must key paths the same
   *  way, so the decision rides on the plan. Optional (absent = case-sensitive)
   *  so existing fixtures compile. Recomputed by every buildDepotPlan, so a
   *  resume never carries a stale value; the plan is handed in-process to
   *  downloadDepotFiles and crosses no serialization boundary. */
  caseInsensitivePaths?: boolean
}

/** Narrow, ADDITIONAL view of PICS appinfo's `common.name` field — not part of
 *  select.ts's own SteamAppInfo (which only needs depots/extended). Widened
 *  locally here purely to read the display name for the manifest writer. */
export interface AppCommonName {
  common?: { name?: string }
}

/** steam-user client surface this module depends on that @types/steam-user does
 *  NOT declare — getDepotDecryptionKey is an undocumented callback API (Pitfall 5).
 *  Manifests are fetched by Rust (D-01), so getRawManifest is gone from this view. Isolated here so every untyped call is visible in one place;
 *  everything else (getProductInfo, licenses) uses the real published types. */
interface SteamUserDepotExtras {
  getDepotDecryptionKey(
    appId: number,
    depotId: number,
    callback: (err: Error | null, key: Buffer) => void
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
  /** 73-13: steam-user cdn.js getManifestRequestCode (promise form, 10 s built-in timeout).
   *  Undocumented in @types/steam-user (Pitfall 5); the Rust job asks for a fresh code per
   *  manifest through this. */
  getManifestRequestCode(
    appId: number,
    depotId: number,
    manifestId: string,
    branch: string
  ): Promise<{ requestCode: unknown }>
}

export type SteamUserDepotClient = InstanceType<typeof SteamUserLib> &
  SteamUserDepotExtras

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
