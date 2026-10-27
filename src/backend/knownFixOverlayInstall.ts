/**
 * Verified on-demand installer for tier-2 known-fix overlays (quick
 * 261027-n77).
 *
 * Locked decisions: the payload is a GameLib-hosted, sha256-pinned download.
 * The URL and every sum come from `common/knownFixOverlayCatalogue` (shipped
 * in the signed app), never from the host. Fail-open: any problem logs a
 * warning, installs nothing and returns null so the game launches without the
 * overlay; this module never rejects.
 *
 * Sidecar exit contract: the only in-flight work is the archive download. It
 * is bounded by a deadline (unref'd timer) and registered with the app abort
 * handler, so `callAllAbortControllers()` at stdin EOF cancels it. Nothing runs
 * at boot: install happens only inside a launch whose profile names an overlay.
 *
 * Extraction is done in Node (zlib + an in-repo ustar reader), deliberately: no
 * `tar` child process, so no spawn site to isolate.
 *
 * Must NOT import backend/launcher or backend/utils statically (utils imports
 * launcher); axios is reached through a lazy import.
 */

import { createHash } from 'crypto'
import { createReadStream, promises as fsPromises } from 'fs'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import {
  KnownFixOverlayCatalogueEntry,
  overlayArchiveUrl
} from 'common/knownFixOverlayCatalogue'
import { knownFixOverlaysPath } from 'backend/constants/paths'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  createAbortController,
  deleteAbortController
} from 'backend/utils/aborthandler/aborthandler'
import { readOverlayTarGz } from './knownFixOverlayArchive'

const OVERLAY_DOWNLOAD_TIMEOUT_MS = 120_000
const ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/
const EXTRA_UNCOMPRESSED_BYTES = 1024 * 1024

export type OverlayArchiveFetch = (
  url: string,
  opts: { signal: AbortSignal; maxBytes: number }
) => Promise<Buffer>

export interface OverlayInstallDeps {
  overlaysRoot?: string
  fetchArchive?: OverlayArchiveFetch
  timeoutMs?: number
}

interface OverlayLogContext {
  label: string
  logPrefix: LogPrefix
}

function overlayInstallDir(
  entry: KnownFixOverlayCatalogueEntry,
  root: string = knownFixOverlaysPath
): string {
  return join(root, entry.id)
}

async function isRealDir(path: string): Promise<boolean> {
  const st = await fsPromises.lstat(path)
  return st.isDirectory() && !st.isSymbolicLink()
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolveHash(hash.digest('hex')))
  })
}

export async function verifyInstalledOverlay(
  dir: string,
  entry: KnownFixOverlayCatalogueEntry
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const subdir = join(dir, entry.pluginSubdir)
    // dir, every intermediate directory down to the plugin dir: real dirs only
    const chain = [dir]
    let acc = dir
    for (const seg of entry.pluginSubdir.split('/')) {
      acc = join(acc, seg)
      chain.push(acc)
    }
    for (const d of chain) {
      if (!(await isRealDir(d))) {
        return { ok: false, reason: `${d} is not a real directory` }
      }
    }
    for (const f of entry.files) {
      const full = join(dir, f.path)
      const st = await fsPromises.lstat(full)
      if (!st.isFile() || st.isSymbolicLink()) {
        return { ok: false, reason: `${f.path} is not a regular file` }
      }
      if (st.size !== f.size) {
        return { ok: false, reason: `${f.path} has the wrong size` }
      }
      if ((await hashFile(full)) !== f.sha256) {
        return { ok: false, reason: `${f.path} sha256 mismatch` }
      }
    }
    // GStreamer loads anything in the plugin dir: it must hold exactly the
    // pinned files. Extras elsewhere (an operator's SHA256SUMS) are tolerated.
    const prefix = `${entry.pluginSubdir}/`
    const want = entry.files
      .filter((f) => f.path.startsWith(prefix))
      .map((f) => f.path.slice(prefix.length))
      .sort()
    const have = (await fsPromises.readdir(subdir)).sort()
    if (JSON.stringify(want) !== JSON.stringify(have)) {
      return {
        ok: false,
        reason: `${entry.pluginSubdir} holds unexpected files`
      }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err)
    }
  }
}

const defaultFetchArchive: OverlayArchiveFetch = async (
  url,
  { signal, maxBytes }
) => {
  const { axiosClient } = await import('backend/utils')
  // The 30 s per-request axios timeout covers a stalled socket; the outer
  // deadline bounds the whole transfer.
  const response = await axiosClient.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    signal,
    timeout: 30_000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    maxRedirects: 5,
    validateStatus: (s) => s === 200
  })
  return Buffer.from(response.data)
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function downloadBounded(
  id: string,
  url: string,
  maxBytes: number,
  fetchArchive: OverlayArchiveFetch,
  timeoutMs: number
): Promise<Buffer> {
  const abortId = `known-fix-overlay:${id}`
  const controller = createAbortController(abortId)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  try {
    const aborted = new Promise<never>((_, reject) => {
      const onAbort = () =>
        reject(new Error(`download aborted or timed out after ${timeoutMs} ms`))
      if (controller.signal.aborted) onAbort()
      else controller.signal.addEventListener('abort', onAbort, { once: true })
    })
    const fetching = fetchArchive(url, { signal: controller.signal, maxBytes })
    // A fetch that loses the race must not become an unhandled rejection.
    fetching.catch(() => undefined)
    return await Promise.race([fetching, aborted])
  } finally {
    clearTimeout(timer)
    deleteAbortController(abortId)
  }
}

const inFlight = new Map<string, Promise<string | null>>()

async function installOnce(
  entry: KnownFixOverlayCatalogueEntry,
  ctx: OverlayLogContext,
  root: string,
  target: string,
  deps: OverlayInstallDeps
): Promise<string | null> {
  const { id } = entry
  const { label, logPrefix } = ctx
  let tempDir: string | undefined
  try {
    const existing = await verifyInstalledOverlay(target, entry)
    if (existing.ok) {
      logInfo(`${label}: overlay ${id} already installed, verified`, logPrefix)
      return target
    }

    await fsPromises.mkdir(root, { recursive: true })
    const buf = await downloadBounded(
      id,
      overlayArchiveUrl(entry),
      entry.archiveSize,
      deps.fetchArchive ?? defaultFetchArchive,
      deps.timeoutMs ?? OVERLAY_DOWNLOAD_TIMEOUT_MS
    )
    if (buf.length !== entry.archiveSize) {
      throw new Error(
        `archive size ${buf.length} does not match the pinned ${entry.archiveSize}`
      )
    }
    if (sha256Hex(buf) !== entry.archiveSha256) {
      throw new Error('archive sha256 does not match the pin')
    }
    const expected = new Map(entry.files.map((f) => [f.path, f.size]))
    const total = entry.files.reduce((n, f) => n + f.size, 0)
    const files = await readOverlayTarGz(
      buf,
      expected,
      total + EXTRA_UNCOMPRESSED_BYTES
    )

    tempDir = await fsPromises.mkdtemp(join(root, `.${id}.partial-`))
    for (const [path, data] of files) {
      const full = join(tempDir, path)
      await fsPromises.mkdir(dirname(full), { recursive: true })
      await fsPromises.writeFile(full, data, { flag: 'wx', mode: 0o644 })
    }
    const check = await verifyInstalledOverlay(tempDir, entry)
    if (!check.ok)
      throw new Error(`extracted files failed verification: ${check.reason}`)

    let stale: string | undefined
    try {
      await fsPromises.lstat(target)
      stale = join(root, `.${id}.stale-${process.pid}-${Date.now()}`)
      await fsPromises.rename(target, stale)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    try {
      await fsPromises.rename(tempDir, target)
      tempDir = undefined
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EEXIST' || code === 'ENOTEMPTY') {
        const won = await verifyInstalledOverlay(target, entry)
        if (won.ok) return target
      }
      throw err
    } finally {
      if (stale) await fsPromises.rm(stale, { recursive: true, force: true })
    }
    logInfo(`${label}: overlay ${id} downloaded and installed`, logPrefix)
    return target
  } catch (err) {
    logWarning(
      `${label}: overlay ${id} not installed (${
        err instanceof Error ? err.message : String(err)
      }); launching without it`,
      logPrefix
    )
    return null
  } finally {
    if (tempDir) {
      await fsPromises
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined)
    }
  }
}

/** Returns the verified install dir, or null (after a warning). Never rejects. */
export async function ensureOverlayInstalled(
  entry: KnownFixOverlayCatalogueEntry,
  ctx: OverlayLogContext,
  deps: OverlayInstallDeps = {}
): Promise<string | null> {
  try {
    if (!ID_PATTERN.test(entry.id)) throw new Error('invalid overlay id')
    const root = resolve(deps.overlaysRoot ?? knownFixOverlaysPath)
    const target = overlayInstallDir(entry, root)
    const rel = relative(root, resolve(target))
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('install dir escapes the overlays root')
    }
    const pending = inFlight.get(target)
    if (pending) return await pending
    const run = installOnce(entry, ctx, root, target, deps).finally(() =>
      inFlight.delete(target)
    )
    inFlight.set(target, run)
    return await run
  } catch (err) {
    logWarning(
      `${ctx.label}: overlay ${entry.id} not installed (${
        err instanceof Error ? err.message : String(err)
      }); launching without it`,
      ctx.logPrefix
    )
    return null
  }
}
