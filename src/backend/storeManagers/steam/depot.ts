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

import { logWarning, LogPrefix } from 'backend/logger'
import type SteamUserLib from 'steam-user'
import {
  open,
  mkdir,
  readdir,
  stat,
  symlink,
  rm,
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
import { fetchChunk, type LzmaModule, type DepotChunk, type DecodeFn } from './depot/decompress'
import { DecompressPool } from './depot/decompressPool'
import { writeAppManifest } from './depot/manifest'
import { classifyDepotError } from './depotErrors'

/** Numeric-only guard for appId before any network/filesystem use (T-21-05). */
const NUMERIC_ID = /^\d+$/

/** EDepotFileFlag bit values, per steam-user's own authoritative enum
 *  (node_modules/steam-user/enums/EDepotFileFlag.js) — Directory = 64,
 *  Symlink = 512. Hardcoded here rather than imported since steam-user does
 *  not export this enum from its public entrypoint (CR-01 gap closure, 21-13). */
const DIRECTORY_FLAG = 64
const SYMLINK_FLAG = 512

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
   *  hostnames Plan 05's downloadDepotFiles needs to fetch chunks from. */
  getContentServers(
    appId: number,
    callback: (
      err: Error | null,
      servers: Array<{ Host?: string; vhost?: string }>
    ) => void
  ): void
}

type SteamUserDepotClient = InstanceType<typeof SteamUserLib> & SteamUserDepotExtras

function assertNumericAppId(appId: string): void {
  if (!NUMERIC_ID.test(appId)) {
    throw new Error(`downloadSteamDepots: rejected non-numeric appId "${appId}"`)
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

  const { packages } = await client.getProductInfo([], packageIds, true)

  const apps = new Set<number>()
  const depots = new Set<number>()
  for (const pkg of Object.values(packages ?? {})) {
    const info = (pkg as { packageinfo?: { appids?: unknown[]; depotids?: unknown[] } })
      .packageinfo
    for (const a of info?.appids ?? []) apps.add(Number(a))
    for (const d of info?.depotids ?? []) depots.add(Number(d))
  }
  return { apps, depots }
}

async function fetchAppInfo(
  client: SteamUserDepotClient,
  numericAppId: number
): Promise<SteamAppInfo> {
  const { apps } = await client.getProductInfo([numericAppId], [], true)
  const entry = apps?.[numericAppId]
  if (!entry) {
    throw new Error(`downloadSteamDepots: no PICS appinfo returned for appId ${numericAppId}`)
  }
  return entry.appinfo as unknown as SteamAppInfo
}

async function fetchDlcInfos(
  client: SteamUserDepotClient,
  appinfo: SteamAppInfo
): Promise<Record<string, SteamAppInfo>> {
  const dlcIds = dlcAppIds(appinfo)
  if (!dlcIds.length) return {}

  const { apps } = await client.getProductInfo(dlcIds, [], true)
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
    (mod as { default?: unknown }).default ?? (mod as unknown as ContentManifestModule)
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
 * Fetch, parse, and filename-decrypt a single depot's manifest. Filenames are
 * decrypted OURSELVES (steam-user truncates them at block boundaries — spike
 * 002 finding); every file size is coerced through Number() for the D-03 sum.
 */
async function fetchDepotPlanEntry(
  client: SteamUserDepotClient,
  numericAppId: number,
  descriptor: DepotDescriptor,
  parser: ContentManifestModule
): Promise<DepotPlanEntry> {
  const numericDepotId = Number(descriptor.id)

  const key = await new Promise<Buffer>((resolve, reject) => {
    client.getDepotDecryptionKey(numericAppId, numericDepotId, (err, k) =>
      err ? reject(err) : resolve(k)
    )
  })

  const raw = await new Promise<Buffer>((resolve, reject) => {
    client.getRawManifest(numericAppId, numericDepotId, descriptor.manifest, 'public', (err, m) =>
      err ? reject(err) : resolve(m)
    )
  })

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

  const client = getDepotClient()
  const numericAppId = Number(appId)

  const appinfo = await fetchAppInfo(client, numericAppId)
  throwIfAborted(opts.signal)
  const displayName = (appinfo as unknown as AppCommonName).common?.name ?? opts.installdir
  const owned = await getOwnedSets(client)
  throwIfAborted(opts.signal)
  const dlcInfos = await fetchDlcInfos(client, appinfo)
  throwIfAborted(opts.signal)

  const selectOpts: DepotSelectOpts = {
    os: opts.os,
    language: opts.language
  }
  const descriptors = selectAllDepots(appinfo, dlcInfos, owned, selectOpts)

  if (!descriptors.length) {
    return { appId, depots: [], totalBytes: 0, name: displayName }
  }

  const parser = await loadContentManifestParser()

  const depots: DepotPlanEntry[] = []
  let totalBytes = 0
  for (const descriptor of descriptors) {
    throwIfAborted(opts.signal)
    const entry = await fetchDepotPlanEntry(client, numericAppId, descriptor, parser)
    depots.push(entry)
    totalBytes += entry.files.reduce((sum, f) => sum + Number(f.size), 0)
  }

  return { appId, depots, totalBytes, name: displayName }
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

/** Thrown when a decrypted filename resolves outside the target install root (T-21-01). */
export class PathTraversalError extends Error {}

/**
 * Resolve `filename` against `root` and verify containment via relative()
 * BEFORE any fs call — path.join alone is not containment (Phase 18 lesson,
 * per user memory). A "../"-escaping filename never reaches open()/mkdir().
 */
function resolveContainedPath(root: string, filename: string): string {
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
 *  whole-file Buffer re-read (would defeat the point of streaming the write). */
function sha1File(path: string): Promise<string> {
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
  signal?: AbortSignal
}

export interface DepotDownloadFailure {
  file: string
  error: string
}

export interface DepotDownloadResult {
  outcome: 'completed' | 'cancelled'
  failures: DepotDownloadFailure[]
}

/**
 * Bounded chunk-level worker pool for ONE file. Never an unbounded fan-out
 * over every chunk in one go — peak in-flight fetchChunk calls is capped at
 * CHUNK_CONCURRENCY regardless of how many chunks the file has (T-21-02).
 * Chunks can land in any order — each is an independent positional
 * write, so cross-server retry (Plan 01 fetchChunk) stays safe as-is.
 */
async function downloadFileChunks(
  fd: FileHandle,
  depotId: string,
  key: Buffer,
  hosts: string[],
  lzma: LzmaModule,
  file: DepotPlanFile,
  fileSeed: number,
  signal: AbortSignal | undefined,
  onBytes: (n: number) => void,
  decode?: DecodeFn
): Promise<void> {
  const queue = [...file.chunks]
  const workerCount = Math.min(CHUNK_CONCURRENCY, queue.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
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
        const data = await fetchChunk(hosts, depotId, depotChunk, key, lzma, 4, decode)
        if (signal?.aborted) return

        await fd.write(data, 0, data.length, Number(chunk.offset))
        onBytes(data.length)
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
  onBytes: (n: number) => void,
  decode?: DecodeFn
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
    const resolvedTarget = resolve(dirname(dest), file.linktarget)
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
    return
  }

  const fd = await open(dest, 'w')
  try {
    await fd.truncate(Number(file.size))
    await downloadFileChunks(fd, depotId, key, hosts, lzma, file, fileSeed, signal, onBytes, decode)
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

  const installRoot = resolve(opts.targetSteamappsDir, 'common', opts.installdir)

  try {
    const jobs: Array<{ depotId: string; key: Buffer; file: DepotPlanFile; fileSeed: number }> = []
    let seed = 0
    for (const depot of plan.depots) {
      for (const file of depot.files) {
        jobs.push({ depotId: depot.depotId, key: depot.key, file, fileSeed: seed++ })
      }
    }

    const totalBytes = plan.totalBytes
    const failures: DepotDownloadFailure[] = []
    let doneBytes = 0
    let lastEmitBytes = 0
    let lastEmitTime = Date.now()
    const tStart = Date.now()

    const emitProgress = (force: boolean) => {
      const percentDelta = totalBytes > 0 ? ((doneBytes - lastEmitBytes) / totalBytes) * 100 : 0
      const timeDelta = Date.now() - lastEmitTime
      // THROTTLE (~1%/500ms), never per-chunk — an IPC flood on a fast LAN (T-21-12).
      if (!force && percentDelta < PROGRESS_THROTTLE_PERCENT && timeDelta < PROGRESS_THROTTLE_MS) {
        return
      }
      lastEmitBytes = doneBytes
      lastEmitTime = Date.now()

      const elapsedSec = (Date.now() - tStart) / 1000
      const bytesPerSec = elapsedSec > 0 ? doneBytes / elapsedSec : 0
      const remaining = Math.max(totalBytes - doneBytes, 0)
      const etaSec = bytesPerSec > 0 ? remaining / bytesPerSec : 0

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
          percent: totalBytes > 0 ? Math.min(100, Math.round((doneBytes / totalBytes) * 100)) : 0,
          bytes: getFileSize(doneBytes),
          // MiB/s (not raw bytes/sec) to match the UI's "MB/s" label + the
          // gog/legendary unit convention (UAT D-UAT-02).
          downSpeed: bytesPerSec / BYTES_PER_MIB,
          // HH:MM:SS, not raw "1247s" (UAT D-UAT-02).
          eta: Number.isFinite(etaSec) && etaSec > 0 ? formatEta(etaSec) : ''
        }
      })
    }

    const queue = [...jobs]
    const workerCount = Math.min(FILE_CONCURRENCY, queue.length)

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
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
              (n) => {
                doneBytes += n
                emitProgress(false)
              },
              pool.decode
            )
          } catch (err) {
            failures.push({ file: job.file.filename, error: (err as Error).message })
          }
        }
      })
    )

    emitProgress(true)

    return {
      outcome: opts.signal?.aborted ? 'cancelled' : 'completed',
      failures
    }
  } finally {
    // No workers leak across installs — shutdown() is safe to call even if
    // init() itself fell back to inline decode (it just terminates zero
    // workers in that case).
    await pool.shutdown()
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 21 (21-06): finalizeToSteam — the SINGLE recovery mechanism (Pattern
// 5, D-04/D-05/D-07). Cancel, failure, and full success ALL converge here:
// measure REAL bytes on disk (never a manifest-derived sum — spike 001: a
// summed total overshoots multi-depot installs by 236MB), write an honest
// (possibly-incomplete) InstalledDepots map into a StateFlags=1026 manifest
// via Plan 02's writeAppManifest, and stop. Steam's own verify-and-repair
// pass (spike 001) reconciles whatever is actually on disk against the real
// manifest — this module NEVER writes StateFlags "4" (T-21-07); only Steam's
// verify pass earns that value. The manifest write is always the LAST
// filesystem action so a Retry (re-invoking downloadSteamDepots) never races
// a partially-written .acf (D-07's non-conflicting-paths guarantee).
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
 * through (Pattern 5). Never writes StateFlags "4" (T-21-07) — only writes
 * "1026" via Plan 02's writeAppManifest, with a measured (not summed)
 * SizeOnDisk and the honest InstalledDepots map of whatever was attempted.
 */
export async function finalizeToSteam(appId: string, opts: FinalizeToSteamOpts): Promise<void> {
  assertNumericAppId(appId)

  const installRoot = resolve(opts.targetSteamappsDir, 'common', opts.installdir)
  const sizeOnDisk = await measureInstalledBytes(installRoot)

  // SteamID64 of the currently-authenticated user, if any — LastOwner is a
  // STRING (64-bit), never a JS Number (T-21-04). Falls back to manifest.ts's
  // own "0" default when no authenticated client is available (e.g. a future
  // Plan 08 startup-resume finalize invoked before reconnection completes).
  const lastOwner = SteamUser.getClient()?.steamID?.getSteamID64()

  await writeAppManifest(opts.targetSteamappsDir, {
    appId,
    installdir: opts.installdir,
    name: opts.name,
    sizeOnDisk: String(sizeOnDisk),
    lastOwner,
    installedDepots: opts.depots.map((d) => ({
      depotId: d.depotId,
      manifest: d.gid,
      size: d.size
    }))
  })
}

/**
 * Content-server hostnames for chunk download (Plan 05's downloadDepotFiles
 * `hosts` param) — steam-user's getContentServers is undocumented in
 * @types/steam-user (Pitfall 5), same discipline as getDepotDecryptionKey/
 * getRawManifest above.
 */
async function getContentServerHosts(
  client: SteamUserDepotClient,
  numericAppId: number
): Promise<string[]> {
  const servers = await new Promise<Array<{ Host?: string; vhost?: string }>>(
    (resolvePromise, reject) => {
      client.getContentServers(numericAppId, (err, s) => (err ? reject(err) : resolvePromise(s)))
    }
  )
  const hosts = servers.map((s) => s.Host ?? s.vhost).filter((h): h is string => Boolean(h))
  if (!hosts.length) {
    throw new Error('downloadSteamDepots: no content servers available')
  }
  return hosts
}

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

  const finalize = (): Promise<void> =>
    finalizeToSteam(appId, {
      targetSteamappsDir: opts.targetSteamappsDir,
      installdir: opts.installdir,
      name: displayName,
      depots: attempted
    })

  try {
    const plan = await buildDepotPlan(appId, opts)
    displayName = plan.name

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
      return { status: 'done' }
    }

    const client = getDepotClient()
    const hosts = await getContentServerHosts(client, Number(appId))
    throwIfAborted(opts.signal)

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: opts.targetSteamappsDir,
      installdir: opts.installdir,
      hosts,
      signal: opts.signal
    })

    // Manifest write is always the LAST fs action — after every file write
    // attempt, before returning control (D-07 no-race guarantee).
    await finalize()

    if (result.outcome === 'cancelled') {
      return { status: 'cancelled' }
    }
    if (result.failures.length) {
      // D-06: surface the CLASSIFIED, plain-language message — never the raw
      // failure string — so the DownloadManager queue's existing generic
      // error+Retry UI shows something actionable ("Steam servers dropped
      // the connection", not a stack trace).
      return { status: 'error', error: classifyDepotError(result.failures[0].error).message }
    }
    return { status: 'done' }
  } catch (err) {
    // Any thrown failure — plan-build error, content-server resolution
    // failure, anything — still funnels through the SAME finalize path
    // (Pattern 5): write whatever landed, never rethrow.
    await finalize().catch((finalizeErr) => {
      logWarning(
        [`downloadSteamDepots: finalizeToSteam itself failed for appId ${appId}:`, finalizeErr],
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
