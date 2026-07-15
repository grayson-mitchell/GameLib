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
import { open, mkdir, type FileHandle } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative, dirname, isAbsolute } from 'path'
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
import { fetchChunk, type LzmaModule, type DepotChunk } from './depot/decompress'

/** Numeric-only guard for appId before any network/filesystem use (T-21-05). */
const NUMERIC_ID = /^\d+$/

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
}

type SteamUserDepotClient = InstanceType<typeof SteamUserLib> & SteamUserDepotExtras

function assertNumericAppId(appId: string): void {
  if (!NUMERIC_ID.test(appId)) {
    throw new Error(`downloadSteamDepots: rejected non-numeric appId "${appId}"`)
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
 */
export async function downloadSteamDepots(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<DepotPlan> {
  assertNumericAppId(appId)

  const connected = await SteamUser.ensureConnected()
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
  const owned = await getOwnedSets(client)
  const dlcInfos = await fetchDlcInfos(client, appinfo)

  const selectOpts: DepotSelectOpts = {
    os: opts.os,
    language: opts.language
  }
  const descriptors = selectAllDepots(appinfo, dlcInfos, owned, selectOpts)

  if (!descriptors.length) {
    return { appId, depots: [], totalBytes: 0 }
  }

  const parser = await loadContentManifestParser()

  const depots: DepotPlanEntry[] = []
  let totalBytes = 0
  for (const descriptor of descriptors) {
    const entry = await fetchDepotPlanEntry(client, numericAppId, descriptor, parser)
    depots.push(entry)
    totalBytes += entry.files.reduce((sum, f) => sum + Number(f.size), 0)
  }

  return { appId, depots, totalBytes }
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
  onBytes: (n: number) => void
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

        const data = await fetchChunk(hosts, depotId, depotChunk, key, lzma)
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
  onBytes: (n: number) => void
): Promise<void> {
  const dest = resolveContainedPath(installRoot, file.filename)
  await mkdir(dirname(dest), { recursive: true })

  if (!file.chunks.length || Number(file.size) === 0) {
    const empty = await open(dest, 'w')
    await empty.close()
    return
  }

  const fd = await open(dest, 'w')
  try {
    await fd.truncate(Number(file.size))
    await downloadFileChunks(fd, depotId, key, hosts, lzma, file, fileSeed, signal, onBytes)
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

  const installRoot = resolve(opts.targetSteamappsDir, 'common', opts.installdir)

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
    const downSpeed = elapsedSec > 0 ? doneBytes / elapsedSec : 0
    const remaining = Math.max(totalBytes - doneBytes, 0)
    const etaSec = downSpeed > 0 ? remaining / downSpeed : 0

    // Exact shape library.ts's pollInstallOnce() (L944-953) already speaks —
    // the DownloadManager needs zero changes for the native depot-download path.
    sendFrontendMessage('progressUpdate', {
      appName: plan.appId,
      runner: 'steam',
      status: 'installing',
      progress: {
        // Denominator is the REAL multi-depot summed total (D-03), never a
        // single depot's own bytes.
        percent: totalBytes > 0 ? Math.round((doneBytes / totalBytes) * 100) : 0,
        bytes: getFileSize(doneBytes),
        downSpeed,
        eta: Number.isFinite(etaSec) ? `${Math.round(etaSec)}s` : ''
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
            }
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
}
