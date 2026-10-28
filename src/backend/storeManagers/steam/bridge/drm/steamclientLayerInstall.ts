/**
 * Phase 56 D-18 / D-02: the on-demand, separately licensed `lsteamclient`
 * component (the DRM-mode `component` setup step).
 *
 * Every URL and sum comes from `common/steamclientLayerCatalogue`, shipped in
 * the signed app, never from the host. This installer fails closed: a typed
 * `DrmStepResult` with `component-missing` (no catalogue entry, or the asset
 * could not be fetched) or `component-verify` (anything fetched or cached that
 * does not match). It never throws, and a failure installs nothing. Unlike the
 * overlay installer, the launch does not continue without the component (D-13).
 *
 * Sidecar exit contract: nothing runs at import or boot. The download is
 * bounded by an unref'd deadline and registered with the abort handler, so
 * `callAllAbortControllers()` at stdin EOF ends it. The codesign child is
 * unref'd and SIGKILLed on its own deadline.
 *
 * Extraction happens in Node through the strict `readOverlayTarGz`, with no tar
 * child process.
 *
 * Trust widening (RESEARCH F6, Pitfall 1): `lsteamclient.so` is deliberately
 * unsigned, because Wine builtins fail to load once codesigned. It lives under
 * a 0700 app-data directory, its pinned sha256 is checked before each use, and
 * any signature is removed after extraction. See THIRD-PARTY-NOTICES.md.
 *
 * Must NOT import backend/launcher or backend/utils statically (utils imports
 * launcher); axios is reached through a lazy import. It does not import
 * the app path constants either: the caller passes `appFolder` (56-04).
 */

import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createReadStream, promises as fsp } from 'fs'
import { join } from 'path'

import {
  STEAMCLIENT_LAYER_RELEASE_REPO,
  SteamclientLayerCatalogueEntry,
  lookupSteamclientLayer,
  steamclientLayerArchiveUrl,
  steamclientLayerFileNames
} from 'common/steamclientLayerCatalogue'
import { readOverlayTarGz } from 'backend/knownFixOverlayArchive'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import {
  createAbortController,
  deleteAbortController
} from 'backend/utils/aborthandler/aborthandler'
import { buildDrmPaths, steamclientLayerComponentId } from './drmPaths'
import { drmStepError, type DrmStepResult } from './steamclientLayerMode'

const STEAMCLIENT_LAYER_DOWNLOAD_TIMEOUT_MS = 300_000
const CODESIGN_TIMEOUT_MS = 30_000
const CODESIGN_OUTPUT_CAP = 64 * 1024
const EXTRA_UNCOMPRESSED_BYTES = 1024 * 1024
const HEX64 = /^[0-9a-f]{64}$/
const URL_PREFIX = `https://github.com/${STEAMCLIENT_LAYER_RELEASE_REPO}/releases/download/steamclient-layer-cx`

/**
 * 56-08 reads `lsteamclientDll`, `lsteamclientSo` and `detourPayload`; 56-09
 * reads `componentDir` (`lsteamclient.dll` and `steam.exe`).
 */
// ts-prune-ignore-next
export type SteamclientLayerReady = {
  componentId: string
  componentDir: string
  crossoverBuild: string
  files: {
    lsteamclientDll: string
    lsteamclientSo: string
    detourPayload: string
    helperExe: string
    licence: string
    notice: string
  }
  source: 'cache' | 'download'
}

// ts-prune-ignore-next
export type SteamclientLayerArchiveFetch = (
  url: string,
  opts: { signal: AbortSignal; maxBytes: number }
) => Promise<Buffer>

// ts-prune-ignore-next
export type CodesignRunner = (
  args: readonly string[],
  opts: { timeoutMs: number }
) => Promise<{
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}>

// ts-prune-ignore-next
export type SteamclientLayerInstallDeps = {
  fetchArchive?: SteamclientLayerArchiveFetch
  runCodesign?: CodesignRunner
  lookupEntry?: (
    crossoverBuild: string
  ) => SteamclientLayerCatalogueEntry | undefined
  timeoutMs?: number
  codesignTimeoutMs?: number
  /** 56-11 maps this to its progress label; 56-11 chooses the label. */
  onFetchStart?: () => void
}

type Verify = { ok: true } | { ok: false; reason: string }

const errText = (err: unknown) =>
  err instanceof Error ? err.message : String(err)

function unrefHandle(handle: unknown): void {
  ;(handle as { unref?: () => void } | null | undefined)?.unref?.()
}

async function isRealDir(path: string): Promise<boolean> {
  const st = await fsp.lstat(path)
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

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

const defaultFetchArchive: SteamclientLayerArchiveFetch = async (
  url,
  { signal, maxBytes }
) => {
  const { axiosClient } = await import('backend/utils')
  // GitHub release downloads redirect to its object store, so redirects are
  // followed. Integrity rests on the pinned sha256, not on the host.
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

const defaultRunCodesign: CodesignRunner = async (args, { timeoutMs }) => {
  // codesign needs no user profile, so it gets the isolated half of the
  // two-profile rule. The env comes from createFakeHomeProfile().childEnv()
  // and is never a hand-rolled literal.
  const profile = createFakeHomeProfile({ prefix: 'gamelib-codesign-' })
  let timer: NodeJS.Timeout | undefined
  try {
    return await new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      let timedOut = false
      const done = (code: number | null) => {
        if (settled) return
        settled = true
        resolve({ code, stdout, stderr, timedOut })
      }
      const child = spawn('/usr/bin/codesign', [...args], {
        env: profile.childEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })
      unrefHandle(child)
      unrefHandle(child.stdout)
      unrefHandle(child.stderr)
      child.stdout?.on('data', (d: Buffer) => {
        if (stdout.length < CODESIGN_OUTPUT_CAP) stdout += d.toString('utf8')
      })
      child.stderr?.on('data', (d: Buffer) => {
        if (stderr.length < CODESIGN_OUTPUT_CAP) stderr += d.toString('utf8')
      })
      timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
        done(null)
      }, timeoutMs)
      timer.unref?.()
      child.on('error', () => done(null))
      child.on('close', (code) => done(code))
    })
  } finally {
    if (timer) clearTimeout(timer)
    profile.dispose()
  }
}

async function downloadBounded(
  abortId: string,
  url: string,
  maxBytes: number,
  fetchArchive: SteamclientLayerArchiveFetch,
  timeoutMs: number
): Promise<Buffer> {
  const controller = createAbortController(abortId)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  timer.unref?.()
  try {
    const aborted = new Promise<never>((_, reject) => {
      const onAbort = () =>
        reject(
          new Error(
            timedOut
              ? `download timed out after ${timeoutMs} ms`
              : 'download aborted'
          )
        )
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

/** Never throws. The dir must hold exactly the pinned files, nothing else. */
async function verifyComponentDir(
  dir: string,
  entry: SteamclientLayerCatalogueEntry
): Promise<Verify> {
  try {
    if (!(await isRealDir(dir))) {
      return { ok: false, reason: `${dir} is not a real directory` }
    }
    const want = entry.files.map((f) => f.path).sort()
    const have = (await fsp.readdir(dir)).sort()
    if (JSON.stringify(want) !== JSON.stringify(have)) {
      return { ok: false, reason: 'component dir holds unexpected files' }
    }
    for (const f of entry.files) {
      const full = join(dir, f.path)
      const st = await fsp.lstat(full)
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
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: errText(err) }
  }
}

function checkEntry(
  entry: SteamclientLayerCatalogueEntry,
  build: string,
  componentId: string
): string | null {
  if (entry.id !== componentId) return 'id does not match the component id'
  if (entry.crossoverBuild !== build) return 'build does not match'
  if (entry.release.tag !== componentId) return 'release tag does not match'
  if (entry.release.repo !== STEAMCLIENT_LAYER_RELEASE_REPO) {
    return 'release repo is not the GameLib repo'
  }
  if (!steamclientLayerArchiveUrl(entry).startsWith(URL_PREFIX)) {
    return 'download URL is outside the GameLib release path'
  }
  const paths = entry.files.map((f) => f.path).sort()
  if (
    JSON.stringify(paths) !== JSON.stringify(steamclientLayerFileNames(build))
  ) {
    return 'file set is not the six-name component set'
  }
  for (const f of entry.files) {
    if (!HEX64.test(f.sha256)) return `${f.path} sha256 is malformed`
    if (!Number.isSafeInteger(f.size) || f.size <= 0) {
      return `${f.path} size is malformed`
    }
  }
  if (!HEX64.test(entry.archiveSha256)) return 'archive sha256 is malformed'
  if (!Number.isSafeInteger(entry.archiveSize) || entry.archiveSize <= 0) {
    return 'archive size is malformed'
  }
  return null
}

type Ready = DrmStepResult<SteamclientLayerReady>

function ready(
  entry: SteamclientLayerCatalogueEntry,
  target: string,
  source: 'cache' | 'download'
): Ready {
  return {
    status: 'ok',
    componentId: entry.id,
    componentDir: target,
    crossoverBuild: entry.crossoverBuild,
    files: {
      lsteamclientDll: join(target, 'lsteamclient.dll'),
      lsteamclientSo: join(target, 'lsteamclient.so'),
      detourPayload: join(target, `detour-cx${entry.crossoverBuild}.bin`),
      helperExe: join(target, 'steam.exe'),
      licence: join(target, 'LICENSE.lsteamclient'),
      notice: join(target, 'NOTICE')
    },
    source
  }
}

const inFlight = new Map<string, Promise<Ready>>()

async function installOnce(
  entry: SteamclientLayerCatalogueEntry,
  componentRoot: string,
  target: string,
  deps: SteamclientLayerInstallDeps
): Promise<Ready> {
  const { id } = entry
  let tempDir: string | undefined
  try {
    await fsp.mkdir(componentRoot, { recursive: true, mode: 0o700 })
    const rootStat = await fsp.lstat(componentRoot)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return drmStepError(
        'component-verify',
        'component root is not a real directory'
      )
    }
    await fsp.chmod(componentRoot, 0o700)

    if ((await verifyComponentDir(target, entry)).ok) {
      return ready(entry, target, 'cache')
    }

    deps.onFetchStart?.()
    let buf: Buffer
    try {
      buf = await downloadBounded(
        `drm-steamclient-layer:${entry.crossoverBuild}`,
        steamclientLayerArchiveUrl(entry),
        entry.archiveSize,
        deps.fetchArchive ?? defaultFetchArchive,
        deps.timeoutMs ?? STEAMCLIENT_LAYER_DOWNLOAD_TIMEOUT_MS
      )
    } catch (err) {
      return drmStepError(
        'component-missing',
        'download failed: ' + errText(err)
      )
    }

    if (buf.length !== entry.archiveSize) {
      return drmStepError(
        'component-verify',
        `archive size ${buf.length} does not match the pinned ${entry.archiveSize}`
      )
    }
    if (sha256Hex(buf) !== entry.archiveSha256) {
      return drmStepError(
        'component-verify',
        'archive sha256 does not match the pin'
      )
    }
    let files: Map<string, Buffer>
    try {
      const total = entry.files.reduce((n, f) => n + f.size, 0)
      files = await readOverlayTarGz(
        buf,
        new Map(entry.files.map((f) => [f.path, f.size])),
        total + EXTRA_UNCOMPRESSED_BYTES
      )
    } catch (err) {
      return drmStepError('component-verify', 'archive: ' + errText(err))
    }

    tempDir = await fsp.mkdtemp(join(componentRoot, `.${id}.partial-`))
    for (const [path, data] of files) {
      await fsp.writeFile(join(tempDir, path), data, {
        flag: 'wx',
        mode: 0o644
      })
    }
    const extracted = await verifyComponentDir(tempDir, entry)
    if (!extracted.ok) {
      return drmStepError(
        'component-verify',
        'extracted files failed verification: ' + extracted.reason
      )
    }

    const signed = await (deps.runCodesign ?? defaultRunCodesign)(
      ['--remove-signature', join(tempDir, 'lsteamclient.so')],
      { timeoutMs: deps.codesignTimeoutMs ?? CODESIGN_TIMEOUT_MS }
    )
    if (signed.timedOut || signed.code !== 0) {
      const first = signed.stderr.split('\n')[0]?.trim()
      return drmStepError(
        'component-verify',
        'codesign --remove-signature failed: ' +
          (signed.timedOut ? 'timed out' : first || `exit ${signed.code}`)
      )
    }
    if (!(await verifyComponentDir(tempDir, entry)).ok) {
      return drmStepError(
        'component-verify',
        'lsteamclient.so changed after signature removal'
      )
    }

    let stale: string | undefined
    try {
      await fsp.lstat(target)
      stale = join(componentRoot, `.${id}.stale-${process.pid}-${Date.now()}`)
      await fsp.rename(target, stale)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    try {
      await fsp.rename(tempDir, target)
      tempDir = undefined
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EEXIST' || code === 'ENOTEMPTY') {
        if ((await verifyComponentDir(target, entry)).ok) {
          return ready(entry, target, 'download')
        }
      }
      throw err
    } finally {
      if (stale) await fsp.rm(stale, { recursive: true, force: true })
    }
    logInfo(`steamclient-layer: ${id} downloaded and verified`, LogPrefix.Steam)
    return ready(entry, target, 'download')
  } catch (err) {
    return drmStepError('component-verify', err)
  } finally {
    if (tempDir) {
      await fsp
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined)
    }
  }
}

/** Installs or verifies the pinned component. Never rejects. */
// ts-prune-ignore-next
export async function ensureSteamclientLayerComponent(
  opts: { appFolder: string; crossoverBuild: string },
  deps: SteamclientLayerInstallDeps = {}
): Promise<Ready> {
  const result = await resolveComponent(opts, deps)
  if (result.status === 'error') {
    logWarning(
      `steamclient-layer: ${result.step} ${result.cause}`,
      LogPrefix.Steam
    )
  }
  return result
}

async function resolveComponent(
  opts: { appFolder: string; crossoverBuild: string },
  deps: SteamclientLayerInstallDeps
): Promise<Ready> {
  try {
    const paths = buildDrmPaths(opts.appFolder)
    if (!paths) return drmStepError('component-missing', 'invalid app folder')
    const componentId = steamclientLayerComponentId(opts.crossoverBuild)
    if (!componentId) {
      return drmStepError('component-missing', 'invalid CrossOver build')
    }
    const entry = (deps.lookupEntry ?? lookupSteamclientLayer)(
      opts.crossoverBuild
    )
    if (!entry) {
      return drmStepError(
        'component-missing',
        `no steamclient-layer component for CrossOver ${opts.crossoverBuild}`
      )
    }
    const bad = checkEntry(entry, opts.crossoverBuild, componentId)
    if (bad) {
      return drmStepError(
        'component-verify',
        'catalogue entry inconsistent: ' + bad
      )
    }
    const target = paths.componentDir(componentId)
    if (!target)
      return drmStepError('component-missing', 'invalid component id')

    const pending = inFlight.get(target)
    if (pending) return await pending
    const run = installOnce(entry, paths.componentRoot, target, deps).finally(
      () => inFlight.delete(target)
    )
    inFlight.set(target, run)
    return await run
  } catch (err) {
    return drmStepError('component-verify', err)
  }
}
