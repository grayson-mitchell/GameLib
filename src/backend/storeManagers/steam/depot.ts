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
import {
  mkdir,
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
import {
  DIRECTORY_FLAG,
  SYMLINK_FLAG,
  type DepotPlanFile,
  type DepotPlanEntry,
  type DepotPlan
} from './depot/planModel'
import {
  assertNumericAppId,
  getDepotClient,
  withPlanBuildRetry,
  fetchAppInfo,
  loadContentManifestParser,
  fetchDepotPlanEntry
} from './depot/plan'
import { resolveContainedPath, sha1File } from './depot/download'
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
import { getContentServerHosts } from './depot/contentServers'
export { reduceContentServers } from './depot/contentServers'
export {
  selectPrimaryDepotFailure,
  formatDownloadFailureSummary,
  normalizeDepotPath,
  downloadSelectedDepotFiles,
  downloadSteamDepots
} from './depot/outcome'
export type {
  DownloadSelectedDepotFilesOpts,
  DownloadSelectedDepotFilesResult
} from './depot/outcome'
export { finalizeToSteam } from './depot/finalize'
export type { FinalizeToSteamOpts } from './depot/finalize'
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
