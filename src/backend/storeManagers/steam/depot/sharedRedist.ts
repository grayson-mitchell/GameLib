// Steamworks Common Redistributables download (extracted from ../depot.ts, 62-10).

import { getContentServerHosts } from './contentServers'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { mkdir, stat, rm, readFile, writeFile, rename } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join } from 'path'
import {
  STEAM_COMMON_REDIST_APP_ID,
  classifySharedRedist,
  declaredSharedRedistDepotIds,
  hasCmdMetachar,
  readInstallScript,
  type InstallScriptEntry,
  type SharedRedistKind
} from '../bridge/sharedRedists'
import { sanitizeInstalldir } from '../installLocation'
import { CdnAuthTokenCache } from './cdnAuth'
import {
  assertNumericAppId,
  getDepotClient,
  withPlanBuildRetry,
  fetchAppInfo,
  fetchDepotKey,
  type DepotRefEntry
} from './plan'
import type { DepotSteamUser } from './planModel'
import type { DepotRuntime } from '../steamInstallRuntime'
import type { SharedRedistLocks } from './sharedRedistLocks'
import { resolveContainedPath } from '../depotPaths'
import {
  downloadSharedRedistDepotsRust,
  sharedRedistInstallscriptsRust,
  verifySharedRedistDepotRust,
  type SharedRedistHostInfo,
  type SharedRedistJobArgs
} from '../depotRust/install'

// ─────────────────────────────────────────────────────────────────────────
// Quick 261025-rkj: Steamworks Common Redistributables (app 228980) for the
// bridge first-launch step.
//
// A game's appinfo declares shared depots with `depotfromapp: 228980`;
// depot/select.ts skips those (ownership gate + SharedDepots rule), so they
// never reach a bridge bottle. This entry point builds the descriptors
// directly from the game's appinfo, fetches each depot key under the OWNER app
// 228980 (a free-download app), and runs each depot as a Rust job (D-12) into
// ONE shared cache. Rust reads the manifests (D-01); TS only ever sees the
// installscript filenames from a manifest summary (D-02). It deliberately
// does NOT use selectDepots / downloadSteamDepots: no ACF is wanted for 228980.

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
  /** The boot-owned install runtime (appinfo order tap, CDN schema, locks, job registry). */
  installRuntime: DepotRuntime
  /** The boot-owned authenticated Steam session (D-66.3-16). */
  steamUser: DepotSteamUser
  /** `<dir>/common/Steamworks Shared/...` is written under this directory. */
  cacheSteamappsDir: string
  /** Trusted-profile opt-ins; widens the policy for depots the game declares only. */
  optInDepotIds: readonly string[]
  signal?: AbortSignal
  /** The Rust transport the installscript read goes through (75 D-06). */
  rust: RustInvokeDeps
  /** Called with the component label before a depot's full download starts. */
  onComponent?: (label: string) => void
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

/**
 * Read-modify-write the shared cache index under the index lock, always from a fresh read, and
 * write it atomically: a unique temp file renamed over the index, so a crash never leaves torn
 * JSON and a concurrent writer never loses another run's entry (WR-02, IN-04).
 */
async function updateSharedRedistIndex(
  locks: SharedRedistLocks,
  cacheSteamappsDir: string,
  mutate: (index: Record<string, string>) => void
): Promise<void> {
  await locks.withSharedRedistLock(
    `index:${resolve(cacheSteamappsDir)}`,
    async () => {
      const index = await readSharedRedistIndex(cacheSteamappsDir)
      mutate(index)
      await mkdir(cacheSteamappsDir, { recursive: true })
      const target = join(cacheSteamappsDir, SHARED_REDIST_INDEX_FILE)
      const tmp = `${target}.${process.pid}.${locks.nextTmpSeq()}.tmp`
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
    const lease = await opts.steamUser.acquireAuthenticated({
      reason: 'shared-redist',
      guidedAction: 'install',
      appName: gameAppId
    })
    if (lease.ok) release = lease.release
  } else {
    release =
      opts.steamUser.acquireOpenAuthenticated('shared-redist')?.release ?? null
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
  const gameInfo = await withPlanBuildRetry(
    opts.steamUser,
    opts.signal,
    (c) => fetchAppInfo(opts.installRuntime.appinfoOrder, c, Number(gameAppId)),
    `sharedRedist game appinfo ${gameAppId}`
  )
  const declared = declaredSharedRedistDepotIds(gameInfo)
  if (declared.length === 0) {
    return { status: 'none', depots: [], failed: [], skipped: [] }
  }

  const redistInfo = await withPlanBuildRetry(
    opts.steamUser,
    opts.signal,
    (c) =>
      fetchAppInfo(
        opts.installRuntime.appinfoOrder,
        c,
        Number(STEAM_COMMON_REDIST_APP_ID)
      ),
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
  const optIn = new Set(opts.optInDepotIds)
  const locks = opts.installRuntime.sharedRedistLocks

  let hostInfo: SharedRedistHostInfo | undefined
  const getHostInfo = async (): Promise<SharedRedistHostInfo> => {
    if (!hostInfo) {
      const client = getDepotClient(opts.steamUser)
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
          Number(STEAM_COMMON_REDIST_APP_ID),
          opts.installRuntime.cdnSchema
        )
      }
    }
    return hostInfo
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

      const key = await withPlanBuildRetry(
        opts.steamUser,
        opts.signal,
        (c) =>
          fetchDepotKey(c, {
            id,
            manifest: gid,
            size: 0,
            ownerAppId: STEAM_COMMON_REDIST_APP_ID
          }),
        `sharedRedist depot ${id}`
      )
      const ref: DepotRefEntry = {
        depotId: id,
        gid,
        key,
        ownerAppId: STEAM_COMMON_REDIST_APP_ID
      }
      const job: SharedRedistJobArgs = {
        steamUser: opts.steamUser,
        appId: STEAM_COMMON_REDIST_APP_ID,
        ref,
        cacheSteamappsDir: opts.cacheSteamappsDir,
        installdir,
        host: await getHostInfo(),
        registry: opts.installRuntime.depotJobs,
        signal: opts.signal
      }

      const scriptFiles = await sharedRedistInstallscriptsRust(job)
      const scriptFile = scriptFiles[0]
      if (scriptFiles.length !== 1 || scriptFile === undefined) {
        logInfo(
          `shared redists: skipping depot ${id}, ${scriptFiles.length} installscript file(s) in manifest`,
          LogPrefix.Steam
        )
        skipped.push(id)
        continue
      }
      let scriptPath: string
      try {
        scriptPath = resolveContainedPath(installRoot, scriptFile)
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
      const outcome = await locks.withSharedRedistLock(
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
              const ok = await downloadSharedRedistDepotsRust({
                ...job,
                selectPaths: [scriptFile]
              })
              if (!ok) {
                scriptFailed = true
                break
              }
            }
            entries = await readInstallScript(opts.rust, scriptPath)
            if (entries === null && fromIndex) {
              logWarning(
                `shared redists: cached installscript for depot ${id} does not parse, re-downloading`,
                LogPrefix.Steam
              )
              await updateSharedRedistIndex(
                locks,
                opts.cacheSteamappsDir,
                (i) => {
                  delete i[id]
                }
              )
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

          const { kind, label } = classifySharedRedist(scriptFile, entries)
          if (kind === 'other' && !optIn.has(id)) {
            logInfo(
              `shared redists: skipping depot ${id} (${label ?? scriptFile}), not VC++/DirectX and not opted in`,
              LogPrefix.Steam
            )
            return { kind: 'skipped' }
          }
          const displayLabel = label ?? `depot ${id}`

          // The index only says the depot was complete once; verify the files are still there
          // before the runner relies on them, and repair the cache when they are not (WR-05).
          if (fromIndex) {
            const missing = await verifySharedRedistDepotRust(job)
            if (missing === null || missing.length > 0) {
              const problem =
                missing === null
                  ? 'verify did not complete'
                  : `${missing.length} file(s) missing or mismatched, first ${missing[0]}`
              logWarning(
                `shared redists: cached depot ${id} (${displayLabel}) is incomplete (${problem}), re-downloading`,
                LogPrefix.Steam
              )
              await updateSharedRedistIndex(
                locks,
                opts.cacheSteamappsDir,
                (i) => {
                  delete i[id]
                }
              )
              fromIndex = false
            }
          }

          if (!fromIndex) {
            opts.onComponent?.(displayLabel)
            const ok = await downloadSharedRedistDepotsRust(job)
            if (!ok) {
              logWarning(
                `shared redists: download of depot ${id} (${displayLabel}) did not complete`,
                LogPrefix.Steam
              )
              return { kind: 'failed' }
            }
            await updateSharedRedistIndex(
              locks,
              opts.cacheSteamappsDir,
              (i) => {
                i[id] = gid
              }
            )
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
