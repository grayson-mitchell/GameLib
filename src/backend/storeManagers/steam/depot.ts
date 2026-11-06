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

import { logInfo, logWarning, logError, LogPrefix } from 'backend/logger'
import {
  mkdir,
  readdir,
  stat,
  lstat,
  rm,
  readFile,
  writeFile,
  rename
} from 'node:fs/promises'
import { resolve, relative, isAbsolute, join } from 'path'
import {
  STEAM_COMMON_REDIST_APP_ID,
  INSTALLSCRIPT_FLAG,
  classifySharedRedist,
  declaredSharedRedistDepotIds,
  hasCmdMetachar,
  parseInstallScript,
  type InstallScriptEntry,
  type SharedRedistKind
} from './bridge/sharedRedists'
import { SteamUser } from './user'
import { sanitizeInstalldir } from './installLocation'
import { type ContentServerHostMeta } from './depot/decompress'
import { CdnAuthTokenCache } from './depot/cdnAuth'
import { writeAppManifest } from './depot/manifest'
import { classifyDepotError, type DepotErrorAction } from './depotErrors'
import { withTimeout, STEAM_PICS_TIMEOUT_MS } from './withTimeout'
import {
  DIRECTORY_FLAG,
  SYMLINK_FLAG,
  describeDepotFailure,
  type DownloadSteamDepotsOpts,
  type DepotPlanFile,
  type DepotPlanEntry,
  type DepotPlan,
  type SteamUserDepotClient,
  type RawContentServer
} from './depot/planModel'
import {
  assertNumericAppId,
  throwIfAborted,
  getDepotClient,
  withPlanBuildRetry,
  fetchAppInfo,
  loadContentManifestParser,
  fetchDepotPlanEntry,
  buildDepotPlan
} from './depot/plan'
import {
  resolveContainedPath,
  sha1File,
  type DepotDownloadFailure,
  type DepotDownloadResult,
  canWriteFullOwnership,
  shouldFinalizeAfterThrow
} from './depot/download'
export {
  CHUNK_CONCURRENCY,
  CHUNK_FETCH_ATTEMPTS,
  formatEta,
  rollingRateMiBs,
  PathTraversalError,
  resolveContainedPath,
  sha1File,
  canWriteFullOwnership,
  shouldFinalizeAfterThrow,
  downloadFileChunks
} from './depot/download'
export type { DepotDownloadFailure } from './depot/download'
import { downloadDepotFiles } from './depot/downloadFiles'
export {
  healReconciledFileModes,
  downloadDepotFiles
} from './depot/downloadFiles'
export {
  PLAN_BUILD_MAX_ATTEMPTS,
  buildDepotPlan,
  screenDepotPlanForSteamApi,
  prescreenBridgeDepots
} from './depot/plan'
export {
  DIRECTORY_FLAG,
  SYMLINK_FLAG,
  FAILURE_LOG_CAP,
  describeDepotFailure,
  EXECUTABLE_FLAG,
  CUSTOM_EXECUTABLE_FLAG,
  READONLY_FLAG,
  HIDDEN_FLAG
} from './depot/planModel'
export type {
  DownloadSteamDepotsOpts,
  DepotPlanFile,
  DepotPlan,
  RawContentServer
} from './depot/planModel'

// ─────────────────────────────────────────────────────────────────────────
// Quick 261025-rkj: Steamworks Common Redistributables (app 228980) for the
// bridge first-launch step.
//
// A game's appinfo declares shared depots with `depotfromapp: 228980`;
// depot/select.ts skips those (ownership gate + SharedDepots rule), so they
// never reach a bridge bottle. This entry point builds the descriptors
// directly from the game's appinfo, fetches key + manifest under the OWNER app
// 228980 (a free-download app), and downloads each depot into ONE shared cache.
// It deliberately does NOT use selectDepots / buildDepotPlan /
// downloadSteamDepots / finalizeToSteam: no ACF is wanted for 228980.

/** One downloaded shared redist depot, ready for the bottle runner. */
export interface SharedRedistDepot {
  depotId: string
  gid: string
  kind: SharedRedistKind
  /** `<Family> <Version>` from the installscript path, else `depot <id>`. */
  label: string
  /** Host path of the `Steamworks Shared` install dir holding `_CommonRedist`. */
  installDirHost: string
  entries: InstallScriptEntry[]
}

export interface DownloadSharedRedistOpts {
  /** `<dir>/common/Steamworks Shared/...` is written under this directory. */
  cacheSteamappsDir: string
  /** Trusted-profile opt-ins; widens the policy for depots the game declares only. */
  optInDepotIds: readonly string[]
  signal?: AbortSignal
  /** Called with the component label before a depot's full download starts. */
  onComponent?: (label: string) => void
  /** Test seam: defaults to {@link downloadDepotFiles}. */
  downloadFiles?: typeof downloadDepotFiles
  /** Phase 54: true only from the bridge install path, which may open the
   *  authenticated CM session. Play passes nothing, so a Play can reuse an
   *  already-open session but never open one. */
  allowLogon?: boolean
}

export interface SharedRedistDownloadResult {
  status: 'offline' | 'none' | 'ok'
  /** Depots downloaded and classified runnable (declared order). */
  depots: SharedRedistDepot[]
  /** Declared ids that could not be evaluated or downloaded: retry next launch. */
  failed: string[]
  /** Policy skips (kind 'other' and not opted in, or kind not establishable). */
  skipped: string[]
}

const SHARED_REDIST_INDEX_FILE = 'gamelib-shared-redist-index.json'
const SHARED_REDIST_DEFAULT_INSTALLDIR = 'Steamworks Shared'

/**
 * In-process FIFO lock per key (WR-02). Unlike a single-flight join, every waiter runs its OWN
 * closure once the holder releases, so it uses its own `signal` and `downloadFiles` and re-reads
 * the index, instead of inheriting another launch's. Keys: `depot:<cache>|<id>` around a
 * depot's whole script-then-full sequence (its two downloads write the same files), and
 * `index:<cache>` around every index read-modify-write. The depot lock may take the index lock;
 * never the reverse, so they cannot deadlock.
 */
const sharedRedistLocks = new Map<string, Promise<void>>()

async function withSharedRedistLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = sharedRedistLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const mine = new Promise<void>((r) => {
    release = r
  })
  const tail = prev.then(() => mine)
  sharedRedistLocks.set(key, tail)
  await prev
  try {
    return await fn()
  } finally {
    release()
    if (sharedRedistLocks.get(key) === tail) sharedRedistLocks.delete(key)
  }
}

async function readSharedRedistIndex(
  cacheSteamappsDir: string
): Promise<Record<string, string>> {
  try {
    const raw: unknown = JSON.parse(
      await readFile(join(cacheSteamappsDir, SHARED_REDIST_INDEX_FILE), 'utf8')
    )
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

let sharedRedistTmpSeq = 0

/**
 * Read-modify-write the shared cache index under the index lock, always from a fresh read, and
 * write it atomically: a unique temp file renamed over the index, so a crash never leaves torn
 * JSON and a concurrent writer never loses another run's entry (WR-02, IN-04).
 */
async function updateSharedRedistIndex(
  cacheSteamappsDir: string,
  mutate: (index: Record<string, string>) => void
): Promise<void> {
  await withSharedRedistLock(
    `index:${resolve(cacheSteamappsDir)}`,
    async () => {
      const index = await readSharedRedistIndex(cacheSteamappsDir)
      mutate(index)
      await mkdir(cacheSteamappsDir, { recursive: true })
      const target = join(cacheSteamappsDir, SHARED_REDIST_INDEX_FILE)
      const tmp = `${target}.${process.pid}.${++sharedRedistTmpSeq}.tmp`
      try {
        await writeFile(tmp, JSON.stringify(index, null, 2))
        await rename(tmp, target)
      } catch (err) {
        await rm(tmp, { force: true }).catch(() => undefined)
        throw err
      }
    }
  )
}

/**
 * The 228980 `config.installdir` as a cache-root segment (WR-03). It is a PICS string, so it gets
 * the same sanitizeInstalldir containment check a game installdir does, and additionally may not
 * carry a cmd metacharacter: every installer path is built under it and a `.cmd` reaches `cmd /c`.
 * Anything absent, blank or rejected falls back to {@link SHARED_REDIST_DEFAULT_INSTALLDIR}.
 */
function sharedRedistInstalldir(
  candidate: unknown,
  cacheSteamappsDir: string
): string {
  if (typeof candidate !== 'string' || !candidate.trim())
    return SHARED_REDIST_DEFAULT_INSTALLDIR
  try {
    const safe = sanitizeInstalldir(
      candidate,
      STEAM_COMMON_REDIST_APP_ID,
      cacheSteamappsDir
    )
    if (hasCmdMetachar(safe))
      throw new Error('installdir contains a cmd metacharacter')
    return safe
  } catch (err) {
    logWarning(
      `shared redists: rejected 228980 installdir ${JSON.stringify(candidate)}, using "${SHARED_REDIST_DEFAULT_INSTALLDIR}": ${String(err)}`,
      LogPrefix.Steam
    )
    return SHARED_REDIST_DEFAULT_INSTALLDIR
  }
}

function publicManifestGid(entry: unknown): string | undefined {
  const manifests = (
    entry as { manifests?: Record<string, unknown> } | undefined
  )?.manifests
  const m = manifests?.public
  if (typeof m === 'string' && m) return m
  const gid = (m as { gid?: unknown } | undefined)?.gid
  if ((typeof gid === 'string' || typeof gid === 'number') && String(gid))
    return String(gid)
  return undefined
}

/**
 * Why a GID-indexed depot's cached files cannot be trusted, or null when they can (WR-05). Every
 * regular manifest file must exist at its manifest size (symlinks must exist), and every file an
 * installscript process names directly must also match its manifest SHA1. Size over the whole set
 * catches a deleted or truncated file cheaply; the hash is spent only on the installer binaries.
 */
async function sharedRedistCacheProblem(
  installRoot: string,
  files: DepotPlanFile[],
  entries: InstallScriptEntry[]
): Promise<string | null> {
  const hashed = new Set<string>()
  for (const e of entries)
    for (const p of e.processes) {
      const m = /^%INSTALLDIR%[\\/](.+)$/i.exec(p.process.trim())
      if (m) hashed.add(m[1].replace(/\//g, '\\').toLowerCase())
    }
  for (const f of files) {
    const flags = f.flags ?? 0
    if (flags & DIRECTORY_FLAG) continue
    let path: string
    try {
      path = resolveContainedPath(installRoot, f.filename)
    } catch {
      return `unsafe path ${f.filename}`
    }
    try {
      if (flags & SYMLINK_FLAG) {
        await lstat(path)
        continue
      }
      const st = await stat(path)
      if (!st.isFile() || st.size !== Number(f.size))
        return `${f.filename} is ${st.isFile() ? `${st.size} bytes, expected ${String(f.size)}` : 'not a file'}`
    } catch {
      return `${f.filename} is missing`
    }
    if (!hashed.has(f.filename.replace(/\//g, '\\').toLowerCase())) continue
    const expected = Buffer.isBuffer(f.sha_content)
      ? f.sha_content.toString('hex')
      : String(f.sha_content ?? '')
    if (!expected) continue
    if ((await sha1File(path)).toLowerCase() !== expected.toLowerCase())
      return `${f.filename} does not match its manifest SHA1`
  }
  return null
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/**
 * Download the 228980 depots a game declares and classify each from its own installscript.
 * Every declared depot lands in exactly one of `depots`, `failed` or `skipped`. Never fold a
 * failure into `skipped`: the bottle runner settles its ledger when `failed` is empty, so a
 * misfiled failure would stop retries permanently. A throw from the game or 228980 appinfo
 * fetch propagates (the runner catches it and does not settle).
 */
export async function downloadSharedRedistDepots(
  gameAppId: string,
  opts: DownloadSharedRedistOpts
): Promise<SharedRedistDownloadResult> {
  assertNumericAppId(gameAppId)

  let release: (() => void) | null = null
  if (opts.allowLogon) {
    const lease = await SteamUser.acquireAuthenticated({
      reason: 'shared-redist',
      guidedAction: 'install',
      appName: gameAppId
    })
    if (lease.ok) release = lease.release
  } else {
    release =
      SteamUser.acquireOpenAuthenticated('shared-redist')?.release ?? null
  }
  if (!release) {
    logInfo(
      `shared redists: Steam client offline, skipping for ${gameAppId}${
        opts.allowLogon ? '' : ' (no open session and logon not allowed here)'
      }`,
      LogPrefix.Steam
    )
    return { status: 'offline', depots: [], failed: [], skipped: [] }
  }
  try {
    return await downloadSharedRedistDepotsLeased(gameAppId, opts)
  } finally {
    release()
  }
}

async function downloadSharedRedistDepotsLeased(
  gameAppId: string,
  opts: DownloadSharedRedistOpts
): Promise<SharedRedistDownloadResult> {
  const downloadFiles = opts.downloadFiles ?? downloadDepotFiles

  const gameInfo = await withPlanBuildRetry(
    opts.signal,
    (c) => fetchAppInfo(c, Number(gameAppId)),
    `sharedRedist game appinfo ${gameAppId}`
  )
  const declared = declaredSharedRedistDepotIds(gameInfo)
  if (declared.length === 0) {
    return { status: 'none', depots: [], failed: [], skipped: [] }
  }

  const redistInfo = await withPlanBuildRetry(
    opts.signal,
    (c) => fetchAppInfo(c, Number(STEAM_COMMON_REDIST_APP_ID)),
    'sharedRedist 228980 appinfo'
  )
  const installdir = sharedRedistInstalldir(
    (redistInfo as { config?: { installdir?: unknown } }).config?.installdir,
    opts.cacheSteamappsDir
  )
  const commonRoot = resolve(opts.cacheSteamappsDir, 'common')
  const installRoot = resolve(commonRoot, installdir)
  const installRel = relative(commonRoot, installRoot)
  if (!installRel || installRel.startsWith('..') || isAbsolute(installRel))
    throw new Error(
      `shared redist install root escapes ${commonRoot}: ${installRoot}`
    )
  const parser = await loadContentManifestParser()
  const optIn = new Set(opts.optInDepotIds)

  let hostInfo:
    | {
        hosts: string[]
        weightedLoads: Map<string, number>
        hostMeta: Map<string, ContentServerHostMeta>
        cdnAuth: CdnAuthTokenCache
      }
    | undefined
  const getHostInfo = async () => {
    if (!hostInfo) {
      const client = getDepotClient()
      const { hosts, weightedLoads, hostMeta } = await getContentServerHosts(
        client,
        Number(STEAM_COMMON_REDIST_APP_ID)
      )
      hostInfo = {
        hosts,
        weightedLoads,
        hostMeta,
        cdnAuth: new CdnAuthTokenCache(
          client,
          Number(STEAM_COMMON_REDIST_APP_ID)
        )
      }
    }
    return hostInfo
  }

  const download = async (
    entry: DepotPlanEntry,
    files: DepotPlanFile[]
  ): Promise<boolean> => {
    const h = await getHostInfo()
    const plan: DepotPlan = {
      appId: STEAM_COMMON_REDIST_APP_ID,
      depots: [{ ...entry, ownerAppId: STEAM_COMMON_REDIST_APP_ID, files }],
      totalBytes: files.reduce((sum, f) => sum + Number(f.size), 0),
      name: 'Steamworks Common Redistributables',
      skippedDepots: []
    }
    const result = await downloadFiles(plan, {
      targetSteamappsDir: opts.cacheSteamappsDir,
      installdir,
      hosts: h.hosts,
      hostWeightedLoads: h.weightedLoads,
      hostMeta: h.hostMeta,
      cdnAuth: h.cdnAuth,
      signal: opts.signal
    })
    return result.outcome === 'completed' && result.failures.length === 0
  }

  const depots: SharedRedistDepot[] = []
  const failed: string[] = []
  const skipped: string[] = []
  const cacheKey = resolve(opts.cacheSteamappsDir)

  for (const id of declared) {
    try {
      const gid = publicManifestGid(
        (redistInfo.depots as Record<string, unknown> | undefined)?.[id]
      )
      if (!gid) {
        logWarning(
          `shared redists: 228980 appinfo has no public manifest for depot ${id}`,
          LogPrefix.Steam
        )
        failed.push(id)
        continue
      }

      const entry = await withPlanBuildRetry(
        opts.signal,
        (c) =>
          fetchDepotPlanEntry(
            c,
            {
              id,
              manifest: gid,
              size: 0,
              ownerAppId: STEAM_COMMON_REDIST_APP_ID
            },
            parser
          ),
        `sharedRedist depot ${id}`
      )

      const scriptFiles = entry.files.filter(
        (f) => ((f.flags ?? 0) & INSTALLSCRIPT_FLAG) !== 0
      )
      if (scriptFiles.length !== 1) {
        logInfo(
          `shared redists: skipping depot ${id}, ${scriptFiles.length} installscript file(s) in manifest`,
          LogPrefix.Steam
        )
        skipped.push(id)
        continue
      }
      const scriptFile = scriptFiles[0]
      let scriptPath: string
      try {
        scriptPath = resolveContainedPath(installRoot, scriptFile.filename)
      } catch (err) {
        logWarning(
          `shared redists: skipping depot ${id}, unsafe installscript path: ${String(err)}`,
          LogPrefix.Steam
        )
        skipped.push(id)
        continue
      }

      // Everything that reads or writes this depot's cached files runs under one per-depot lock
      // (WR-02), so a concurrent launch waits, then re-reads the index and takes the fast path.
      const outcome = await withSharedRedistLock(
        `depot:${cacheKey}|${id}`,
        async (): Promise<
          | { kind: 'failed' }
          | { kind: 'skipped' }
          | { kind: 'ok'; depot: SharedRedistDepot }
        > => {
          if (opts.signal?.aborted) {
            logInfo(
              `shared redists: aborted before depot ${id}`,
              LogPrefix.Steam
            )
            return { kind: 'failed' }
          }

          // Read the installscript, from the GID index when present. A cached script that no
          // longer parses drops its index entry and is re-downloaded once before the depot is
          // given up on.
          const indexed = (await readSharedRedistIndex(opts.cacheSteamappsDir))[
            id
          ]
          let fromIndex = indexed === gid && (await pathExists(scriptPath))
          let entries: InstallScriptEntry[] | null = null
          let scriptFailed = false
          for (let attempt = 0; attempt < 2; attempt++) {
            if (!fromIndex) {
              const ok = await download(entry, [scriptFile])
              if (!ok) {
                scriptFailed = true
                break
              }
            }
            entries = parseInstallScript(await readFile(scriptPath, 'utf8'))
            if (entries === null && fromIndex) {
              logWarning(
                `shared redists: cached installscript for depot ${id} does not parse, re-downloading`,
                LogPrefix.Steam
              )
              await updateSharedRedistIndex(opts.cacheSteamappsDir, (i) => {
                delete i[id]
              })
              fromIndex = false
              continue
            }
            break
          }
          if (scriptFailed) {
            logWarning(
              `shared redists: installscript download failed for depot ${id}`,
              LogPrefix.Steam
            )
            return { kind: 'failed' }
          }
          if (entries === null) {
            logInfo(
              `shared redists: skipping depot ${id}, installscript did not parse`,
              LogPrefix.Steam
            )
            return { kind: 'skipped' }
          }

          const { kind, label } = classifySharedRedist(
            scriptFile.filename,
            entries
          )
          if (kind === 'other' && !optIn.has(id)) {
            logInfo(
              `shared redists: skipping depot ${id} (${label ?? scriptFile.filename}), not VC++/DirectX and not opted in`,
              LogPrefix.Steam
            )
            return { kind: 'skipped' }
          }
          const displayLabel = label ?? `depot ${id}`

          // The index only says the depot was complete once; check the files are still there
          // before the runner relies on them, and repair the cache when they are not (WR-05).
          if (fromIndex) {
            const problem = await sharedRedistCacheProblem(
              installRoot,
              entry.files,
              entries
            )
            if (problem) {
              logWarning(
                `shared redists: cached depot ${id} (${displayLabel}) is incomplete (${problem}), re-downloading`,
                LogPrefix.Steam
              )
              await updateSharedRedistIndex(opts.cacheSteamappsDir, (i) => {
                delete i[id]
              })
              fromIndex = false
            }
          }

          if (!fromIndex) {
            opts.onComponent?.(displayLabel)
            const ok = await download(entry, entry.files)
            if (!ok) {
              logWarning(
                `shared redists: download of depot ${id} (${displayLabel}) did not complete`,
                LogPrefix.Steam
              )
              return { kind: 'failed' }
            }
            await updateSharedRedistIndex(opts.cacheSteamappsDir, (i) => {
              i[id] = gid
            })
          }

          return {
            kind: 'ok',
            depot: {
              depotId: id,
              gid,
              kind,
              label: displayLabel,
              installDirHost: installRoot,
              entries
            }
          }
        }
      )
      if (outcome.kind === 'ok') depots.push(outcome.depot)
      else if (outcome.kind === 'skipped') skipped.push(id)
      else failed.push(id)
    } catch (err) {
      logWarning(
        `shared redists: depot ${id} could not be evaluated, will retry next launch: ${String(err)}`,
        LogPrefix.Steam
      )
      failed.push(id)
    }
  }

  return { status: 'ok', depots, failed, skipped }
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

interface FinalizeDepotEntry {
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

  // SteamID64 of the signed-in user, read from the persisted account — the
  // CM session may already be closed at finalize (a startup-resume finalize,
  // or the idle grace expiring under a long download), so the live client is
  // not the source. LastOwner is a STRING (64-bit), never a JS Number
  // (T-21-04). Falls back to manifest.ts's own "0" default when nothing is
  // persisted.
  const lastOwner = SteamUser.getPersistedSteamId64()

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

interface DepotDownloadOutcome {
  status: 'done' | 'error' | 'cancelled'
  error?: string
  /** 23.2-03 (G-23-01): depot ids skipped by the EResult-40 skip-and-warn
   *  policy (DepotPlan.skippedDepots), threaded out so plan 23.2-04 can
   *  surface a user-facing completion notice. Populated on every return path
   *  that occurs AFTER buildDepotPlan resolved — 'done', 'error' and
   *  'cancelled' alike. Left undefined on a throw before the plan ever
   *  existed (nothing to report). */
  skippedDepots?: string[]
  /** 37-02 (D-06/D-07): the structured affordance classifyDepotError
   *  assigned to `error` — carried alongside it on both 'error' return
   *  paths below so callers (games.ts) can render the right dialog
   *  affordance without re-classifying anything themselves. Undefined on
   *  every non-error status. */
  errorAction?: DepotErrorAction
}

/**
 * Quick 260927-v8i (D-01/D-02/D-03/D-05): the ONE shared, deterministic
 * selection this quick task exists to add. Both `formatDownloadFailureSummary`'s
 * `first:` fragment below and `downloadSteamDepots`' error-path classifier
 * argument now call this single function over the SAME `failures` array —
 * one call, one const, read twice — so the two can no longer independently
 * pick different records and describe/classify the same failed run two
 * different ways.
 *
 * (a) Why this needs to be deterministic at all: `failures` is populated by
 * `FILE_CONCURRENCY` workers racing to push onto the same array as each
 * fails, plus the run-level stall give-up appended whenever the whole run's
 * no-progress bound trips. Array order is real async completion order, not
 * semantic priority — reading `failures[0]` (what both consumers used to do,
 * independently) picked whichever failure happened to land first: a race,
 * not a decision.
 *
 * (b) Why the run-level record wins when both kinds of failure are present:
 * the run gave up — a single file failure alongside that give-up is usually
 * a symptom of the same dying run, not an independent cause the user should
 * be told to inspect. `classifyDepotError` reaches `isStallError`
 * (depotErrors.ts:283) for the run-level record and returns the real
 * localised `steam.download.error.stalled` copy with the actionable
 * `action: 'retry'` — a stronger diagnosis than an arbitrary file-level
 * failure such as a `sha1 mismatch`, classified `verifyFailed` with
 * `action: 'none'`.
 *
 * (c) Tier 1 — a preference for a NON-RETRYABLE file-level cause ahead of
 * the run-level record — was considered and DROPPED, on a measurement, not
 * an assumption: no file-level `DepotDownloadFailure` can carry a `.cause`
 * for which `isNonRetryableDepotError` (depotErrors.ts:81) returns true. The
 * only two sites in all of `src/` that ever stamp a numeric `.eresult`
 * property (`wrapDepotKeyError` here at depot.ts:610-612, and depot.ts:897)
 * both live inside `buildDepotPlan`, whose throws are caught by
 * `downloadSteamDepots`'s own OUTER catch and classified directly — they
 * never enter this array at all. So the shipped rule is two-tier, not
 * three, and no tier-1 mechanism or test exists for a case that cannot
 * happen today.
 *
 * (d) The residual this measurement leaves, named where the next reader
 * will see it: if a FUTURE change ever stamps a numeric `.eresult` onto
 * something thrown out of `downloadSingleFile` or `healReconciledFileModes`,
 * a permanent, non-retryable cause could be masked behind this function's
 * retryable-looking stalled copy — telling a user to retry something that
 * can never succeed. Nothing detects that today; a source gate over
 * `.eresult` assignment sites was considered and declined as too broad and
 * fragile to be worth the false confidence it would look like it bought.
 *
 * D-05: the non-empty precondition is inherited unchanged from the
 * `failures[0]` read this replaces — this function is not made total, and
 * its only production caller stays guarded by the entry gate at
 * depot.ts:3498 (`if (result.failures.length)`).
 */
export function selectPrimaryDepotFailure(
  failures: DepotDownloadFailure[]
): DepotDownloadFailure {
  return failures.find((f) => f.scope === 'run') ?? failures[0]
}

/**
 * Quick 260927-tpm (D-A/D-C): the aggregate download-failed log line's sole
 * formatter, factored out so the fix and its RED/GREEN tests share one
 * definition instead of the call site re-deriving the count inline. Reports
 * the FILE-level failure count only — a run-level give-up (tagged
 * `scope: 'run'`, see DepotDownloadFailure) is excluded from that count and
 * surfaced instead as its own trailing fragment, so N file failures always
 * reads as N, never N+1, while the run-level reason is still visible in the
 * same line. `failures` itself is untouched (D-B): every completeness-gate
 * reader upstream of this call keeps counting the unfiltered array exactly
 * as before — this function only changes how the array is DESCRIBED, not
 * what it contains.
 *
 * Quick 260927-v8i (D-01, superseding D-C): `first:` no longer reads
 * `failures[0]` directly — it reports whichever record
 * `selectPrimaryDepotFailure` selects above, which is the SAME record the
 * error-path classifier is fed (one shared call, D-03). Case C (a run that
 * stalls with zero files ever having failed individually) used to be
 * described as "the one case where `first:` and the run fragment describe
 * the same underlying record from two angles" — under D-01 that is now the
 * NORMAL case whenever any run-level record exists at all, not a coincidence
 * of array order.
 */
export function formatDownloadFailureSummary(
  appId: string,
  failures: DepotDownloadFailure[],
  classificationKey: string
): string {
  const fileFailures = failures.filter((f) => f.scope !== 'run')
  const runFailure = failures.find((f) => f.scope === 'run')
  const first = selectPrimaryDepotFailure(failures)
  const runFragment = runFailure ? `; run: ${runFailure.error}` : ''
  return (
    `downloadSteamDepots: appId=${appId} download failed — ` +
    `${fileFailures.length} file failure(s), classified as ` +
    `${classificationKey}; first: file="${first.file}" ` +
    `${describeDepotFailure(first.cause ?? first.error)}` +
    runFragment
  )
}

/**
 * Normalised depot path used to select files: backslashes to slashes, leading
 * slashes stripped, lowercased. Shared with bridge/originalRestore.ts so the
 * selector and the caller agree on one form.
 */
export function normalizeDepotPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

export interface DownloadSelectedDepotFilesOpts extends DownloadSteamDepotsOpts {
  /** Receives the {@link normalizeDepotPath} form of each candidate file. */
  select: (normalizedPath: string) => boolean
  /** Test seam: defaults to {@link downloadDepotFiles}. */
  downloadFiles?: typeof downloadDepotFiles
}

export interface DownloadSelectedDepotFilesResult {
  status: 'done' | 'cancelled' | 'error'
  /** The files fetched: manifest filename (Windows separators), size, lowercase hex sha1. */
  files: Array<{ filename: string; size: number; sha1: string }>
  error?: string
  failures?: DepotDownloadFailure[]
}

/**
 * Quick 261026-lif: fetch ONLY the manifest files `select` accepts into
 * `<targetSteamappsDir>/common/<installdir>/`. A partial fetch into a staging
 * tree: it never calls finalizeToSteam, so no appmanifest ACF is ever written.
 * Directory and symlink entries are never selected. NEVER throws: every
 * failure maps to a structured status.
 */
export async function downloadSelectedDepotFiles(
  appId: string,
  opts: DownloadSelectedDepotFilesOpts
): Promise<DownloadSelectedDepotFilesResult> {
  let lease: Awaited<ReturnType<typeof SteamUser.acquireAuthenticated>> | null =
    null
  try {
    lease = await SteamUser.acquireAuthenticated({
      reason: 'original-restore',
      guidedAction: 'install',
      appName: appId
    })
    if (!lease.ok) {
      throw new Error(
        `downloadSteamDepots: no authenticated Steam CM connection available for appId ${appId} (${lease.reason})`
      )
    }
    const plan = await buildDepotPlan(appId, opts)
    const picked: DownloadSelectedDepotFilesResult['files'] = []
    let totalBytes = 0
    const depots: DepotPlanEntry[] = []
    for (const depot of plan.depots) {
      const files = depot.files.filter((f) => {
        const flags = f.flags ?? 0
        if (flags & DIRECTORY_FLAG || flags & SYMLINK_FLAG) return false
        return opts.select(normalizeDepotPath(f.filename))
      })
      if (!files.length) continue
      for (const f of files) {
        totalBytes += Number(f.size)
        picked.push({
          filename: f.filename,
          size: Number(f.size),
          sha1: (Buffer.isBuffer(f.sha_content)
            ? f.sha_content.toString('hex')
            : String(f.sha_content)
          ).toLowerCase()
        })
      }
      depots.push({ ...depot, files })
    }
    if (!depots.length) return { status: 'done', files: [] }

    const filteredPlan: DepotPlan = { ...plan, depots, totalBytes }
    const client = getDepotClient()
    const {
      hosts,
      weightedLoads: hostWeightedLoads,
      hostMeta
    } = await getContentServerHosts(client, Number(appId))
    throwIfAborted(opts.signal)
    const cdnAuth = new CdnAuthTokenCache(client, Number(appId))
    const result = await (opts.downloadFiles ?? downloadDepotFiles)(
      filteredPlan,
      {
        targetSteamappsDir: opts.targetSteamappsDir,
        installdir: opts.installdir,
        hosts,
        hostWeightedLoads,
        cdnAuth,
        hostMeta,
        signal: opts.signal
      }
    )
    if (result.outcome === 'cancelled' || opts.signal?.aborted === true) {
      return { status: 'cancelled', files: picked }
    }
    if (result.failures.length) {
      const first = selectPrimaryDepotFailure(result.failures)
      return {
        status: 'error',
        files: picked,
        error: classifyDepotError(first.cause ?? first.error).message,
        failures: result.failures
      }
    }
    return { status: 'done', files: picked }
  } catch (err) {
    if (opts.signal?.aborted === true) return { status: 'cancelled', files: [] }
    return {
      status: 'error',
      files: [],
      error: classifyDepotError(err).message
    }
  } finally {
    if (lease?.ok) lease.release()
  }
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
  // 23.2-02 (D-08): true once downloadDepotFiles is about to be invoked —
  // set BEFORE that await, not after, so a throw inside downloadDepotFiles
  // with bytes already on disk still counts as "attempted." Feeds
  // shouldFinalizeAfterThrow, the catch block's only gate on whether
  // finalize() is even called.
  let downloadAttempted = false
  // 23.2-03 (G-23-01): captured from plan.skippedDepots immediately after
  // buildDepotPlan resolves, alongside displayName/buildid. Stays undefined
  // if buildDepotPlan itself threw (Case A) — a throw before the plan exists
  // has nothing to report.
  let skippedDepots: string[] | undefined

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
    skippedDepots = plan.skippedDepots

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
      // 23.2-02 (D-08): this write's serialized shape (empty InstalledDepots
      // block) is the SAME shape the D-08 stub produces, but this call site
      // is deliberately OUT OF SCOPE for that fix — buildDepotPlan already
      // returned successfully here (a real, honest "zero owned depots"
      // result), unlike the catch-path case D-08 targets, where
      // buildDepotPlan never returned at all.
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
        ? { status: 'cancelled', skippedDepots }
        : { status: 'done', skippedDepots }
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
    downloadAttempted = true
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
      return { status: 'cancelled', skippedDepots }
    }
    if (result.failures.length) {
      // D-06: surface the CLASSIFIED, plain-language message — never the raw
      // failure string — so the DownloadManager queue's existing generic
      // error+Retry UI shows something actionable ("Steam servers dropped
      // the connection", not a stack trace).
      // 37-02 (D-08): pass the preserved cause object (falls back to the
      // pre-flattened string only if no cause was captured), so
      // classifyDepotError can read `.code`/`.eresult` off it directly.
      // Quick 260927-v8i (D-01/D-03): ONE call to selectPrimaryDepotFailure
      // over the unfiltered array, read twice below — so the record fed to
      // the classifier and the record formatDownloadFailureSummary's
      // `first:` fragment describes are the same object by construction,
      // never two independent index-0 reads that could disagree on which
      // worker's failure happened to land first.
      const selectedFailure = selectPrimaryDepotFailure(result.failures)
      const classified = classifyDepotError(
        selectedFailure.cause ?? selectedFailure.error
      )
      // debug/steam-depot-unclassified-generic-error (F2): the classified
      // message is all the UI ever shows, and for the generic bucket that is
      // "The Steam download failed." — a sentence with no cause in it. Record
      // the aggregate the classifier was fed so the log can answer "how many
      // files, which ones, and what did the UNCLASSIFIED text actually say".
      // `classified.key` is logged too: it is the ONLY way to tell from a log
      // whether the generic fallback was reached (nothing matched) or a real
      // signature matched — the user-facing string cannot distinguish a
      // classified failure from an unclassified one.
      //
      // Quick 260927-tpm (D-A/D-C): the count below used to be
      // `result.failures.length` — every entry in the unfiltered array,
      // including a run-level stall give-up, so N failed files logged as
      // N+1. formatDownloadFailureSummary partitions the run-level record
      // out of the count (and surfaces it as its own trailing fragment).
      // Quick 260927-v8i: both this classifier input above and that
      // formatter's `first:` fragment now come from the ONE shared
      // selection (D-01) — this is exactly what that quick task changed.
      // `result.failures` itself stays unfiltered for every OTHER reader:
      // the file-COUNT partition is still 260927-tpm's, untouched here.
      logError(
        formatDownloadFailureSummary(appId, result.failures, classified.key),
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: classified.message,
        // 37-02 (D-06/D-07): thread the structured affordance out alongside
        // the message so games.ts can forward it without re-classifying.
        errorAction: classified.action,
        skippedDepots
      }
    }
    return { status: 'done', skippedDepots }
  } catch (err) {
    // Any thrown failure — plan-build error, content-server resolution
    // failure, anything — still funnels through the SAME finalize path
    // (Pattern 5): write whatever landed, never rethrow. 23.2-02 (D-08):
    // EXCEPT when nothing was ever attempted this run (buildDepotPlan threw
    // before downloadDepotFiles was ever reached, Case A,
    // 23.2-MANIFEST-WRITE-TAXONOMY.md) — in that case attempted is still []
    // and buildid is still undefined, so finalize() would write a
    // StateFlags=1026/buildid=0/empty-InstalledDepots stub over whatever
    // `.acf` already existed, even a complete prior install. Gated behind
    // shouldFinalizeAfterThrow (the only place this decision is made) so the
    // Phase 21 1026 verify-handoff (Case B: plan built, download attempted,
    // then failed/cancelled) is untouched — downloadAttempted is true there.
    if (shouldFinalizeAfterThrow({ downloadAttempted })) {
      await finalize().catch((finalizeErr) => {
        logWarning(
          [
            `downloadSteamDepots: finalizeToSteam itself failed for appId ${appId}:`,
            finalizeErr
          ],
          LogPrefix.Steam
        )
      })
    } else {
      logWarning(
        `downloadSteamDepots: plan-build failed for appId ${appId} before any depot was attempted — manifest deliberately left untouched (D-08)`,
        LogPrefix.Steam
      )
    }
    // D-UAT-05: a cancel issued during plan-building throws
    // DepotPlanAbortedError (or races with some OTHER thrown error while the
    // signal is already aborted) — checked via opts.signal?.aborted rather
    // than `instanceof` so either case still reports 'cancelled', matching
    // downloadDepotFiles's own signal-aborted -> 'cancelled' outcome instead
    // of surfacing a spurious error/Retry UI for a user-requested stop.
    if (opts.signal?.aborted) {
      return { status: 'cancelled', skippedDepots }
    }
    const classified = classifyDepotError(err)
    return {
      status: 'error',
      error: classified.message,
      errorAction: classified.action,
      skippedDepots
    }
  }
}
