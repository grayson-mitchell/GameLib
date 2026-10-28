/**
 * Phase 56 D-04/D-05/D-06: the genuine Valve client set for DRM mode,
 * fetched from Valve's own CDN onto the user's machine and never shipped.
 *
 * The package follows the current `steam_client_win64` manifest's
 * `bins_win64` node and is verified against that manifest's own `sha2`; no
 * sha is pinned in GameLib. Trust rests on TLS plus a three-host allowlist
 * plus `sha2`; no manifest signature scheme is invented (RESEARCH Pitfall 9).
 *
 * This module never throws: every failure is a `DrmStepResult` error with
 * step `valve-fetch` (transport) or `valve-verify` (content).
 *
 * Sidecar exit contract: nothing runs at import or boot. Every network wait
 * is bounded by an unref'd deadline and registered with the app abort
 * handler, so `callAllAbortControllers()` at stdin EOF ends it. The unzip
 * child is unref'd and killed on its own deadline.
 *
 * Must NOT import backend/launcher or backend/utils statically (utils imports
 * launcher); axios is reached through a lazy import. It does not import
 * the app path constants either: the caller passes `appFolder` (56-04).
 */

import { parse } from '@node-steam/vdf'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createReadStream, createWriteStream, promises as fsp } from 'fs'
import { join } from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import {
  createAbortController,
  deleteAbortController
} from 'backend/utils/aborthandler/aborthandler'
import { buildDrmPaths } from './drmPaths'
import { drmStepError, type DrmStepResult } from './steamclientLayerMode'

// ts-prune-ignore-next
export const VALVE_CLIENT_BASES = [
  'https://client-update.akamai.steamstatic.com',
  'https://steamcdn-a.akamaihd.net/client',
  'https://media.steampowered.com/client'
] as const

// ts-prune-ignore-next
export const VALVE_CLIENT_MANIFEST_NAME = 'steam_client_win64'

// ts-prune-ignore-next
export const VALVE_CLIENT_DLLS = [
  'steamclient64.dll',
  'tier0_s64.dll',
  'vstdlib_s64.dll'
] as const

// ts-prune-ignore-next
export const MAX_VALVE_MANIFEST_BYTES = 512 * 1024
// ts-prune-ignore-next
export const MAX_VALVE_PACKAGE_BYTES = 200 * 1024 * 1024
// ts-prune-ignore-next
export const MAX_VALVE_DLL_BYTES = 128 * 1024 * 1024

const FILE_RE = /^bins_win64\.zip\.[0-9a-f]{40}$/
const SHA2_RE = /^[0-9a-f]{64}$/
const VERSION_RE = /^[0-9]{1,20}$/
const FORBIDDEN_KEY_RE = /"(__proto__|constructor|prototype)"/

const HOST_UPDATE = 'client-update.akamai.steamstatic.com'
const ROOT_PATH_RE = /^\/[A-Za-z0-9._-]+$/
const CLIENT_PATH_RE = /^\/client\/[A-Za-z0-9._-]+$/

// ts-prune-ignore-next
export function isAllowedValveUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.href !== url) return false
    if (parsed.protocol !== 'https:') return false
    if (
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.port !== '' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return false
    }
    if (parsed.hostname === HOST_UPDATE) {
      if (!ROOT_PATH_RE.test(parsed.pathname)) return false
    } else if (
      parsed.hostname === 'steamcdn-a.akamaihd.net' ||
      parsed.hostname === 'media.steampowered.com'
    ) {
      if (!CLIENT_PATH_RE.test(parsed.pathname)) return false
    } else {
      return false
    }
    const last = parsed.pathname.split('/').pop() ?? ''
    return last !== '.' && last !== '..' && !last.includes('..')
  } catch {
    return false
  }
}

// ts-prune-ignore-next
export function valveManifestUrl(base: string): string | null {
  const url = `${base}/${VALVE_CLIENT_MANIFEST_NAME}`
  return isAllowedValveUrl(url) ? url : null
}

// ts-prune-ignore-next
export function valvePackageUrl(base: string, file: string): string | null {
  if (typeof file !== 'string' || !FILE_RE.test(file)) return null
  const url = `${base}/${file}`
  return isAllowedValveUrl(url) ? url : null
}

// ts-prune-ignore-next
export type ValveClientPackage = {
  manifestVersion: string
  file: string
  sha2: string
  size: number
}

type Fail = { ok: false; reason: string }

function own(obj: unknown, key: string): unknown {
  if (
    obj !== null &&
    typeof obj === 'object' &&
    Object.prototype.hasOwnProperty.call(obj, key)
  ) {
    return (obj as Record<string, unknown>)[key]
  }
  return undefined
}

// ts-prune-ignore-next
export function parseValveClientManifest(
  text: unknown
): { ok: true; pkg: ValveClientPackage } | Fail {
  try {
    if (typeof text !== 'string') return { ok: false, reason: 'not text' }
    if (Buffer.byteLength(text) > MAX_VALVE_MANIFEST_BYTES) {
      return { ok: false, reason: 'manifest too large' }
    }
    // Before parse: @node-steam/vdf assigns block keys with stack[top][key],
    // so a "__proto__" block would write into Object.prototype.
    const forbidden = FORBIDDEN_KEY_RE.exec(text)
    if (forbidden) {
      return { ok: false, reason: `forbidden key ${forbidden[1]}` }
    }
    const root = parse(text)
    const win64 = own(root, 'win64')
    if (win64 === undefined) return { ok: false, reason: 'no win64 root' }
    const bins = own(win64, 'bins_win64')
    if (bins === undefined) return { ok: false, reason: 'no bins_win64 node' }

    const file = own(bins, 'file')
    if (typeof file !== 'string' || !FILE_RE.test(file)) {
      return { ok: false, reason: 'bad bins_win64 file' }
    }
    const sha2 = own(bins, 'sha2')
    if (typeof sha2 !== 'string') {
      return { ok: false, reason: 'sha2 is not a hex string' }
    }
    if (!SHA2_RE.test(sha2)) {
      return { ok: false, reason: 'bad bins_win64 sha2' }
    }
    const rawSize = own(bins, 'size')
    let size = NaN
    if (typeof rawSize === 'number' && Number.isSafeInteger(rawSize)) {
      size = rawSize
    } else if (typeof rawSize === 'string' && /^[0-9]{1,10}$/.test(rawSize)) {
      size = Number(rawSize)
    }
    if (!(size >= 1 && size <= MAX_VALVE_PACKAGE_BYTES)) {
      return { ok: false, reason: 'bad bins_win64 size' }
    }
    const rawVersion = own(win64, 'version')
    let version = ''
    if (typeof rawVersion === 'number') {
      if (Number.isSafeInteger(rawVersion) && rawVersion >= 0) {
        version = String(rawVersion)
      }
    } else if (typeof rawVersion === 'string') {
      version = rawVersion
    }
    if (!VERSION_RE.test(version)) {
      return { ok: false, reason: 'bad manifest version' }
    }
    return { ok: true, pkg: { manifestVersion: version, file, sha2, size } }
  } catch {
    return { ok: false, reason: 'manifest did not parse' }
  }
}

// ts-prune-ignore-next
export type ValveFetchText = (
  url: string,
  opts: { signal: AbortSignal; maxBytes: number }
) => Promise<string>

// ts-prune-ignore-next
export type ValveFetchToFile = (
  url: string,
  destPath: string,
  opts: { signal: AbortSignal; maxBytes: number }
) => Promise<{ bytes: number }>

// ts-prune-ignore-next
export type ValveUnzipRunner = (
  args: readonly string[],
  opts: { timeoutMs: number }
) => Promise<{
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}>

// ts-prune-ignore-next
export type ValveClientReady = {
  clientDir: string
  manifestVersion: string
  dlls: { steamclient64: string; tier0: string; vstdlib: string }
  source: 'cache' | 'download'
}

// ts-prune-ignore-next
export type ValveClientDeps = {
  fetchText?: ValveFetchText
  fetchToFile?: ValveFetchToFile
  runUnzip?: ValveUnzipRunner
  manifestTimeoutMs?: number
  packageTimeoutMs?: number
  onFetchStart?: () => void
}

const VALVE_MANIFEST_TIMEOUT_MS = 30_000
const VALVE_PACKAGE_TIMEOUT_MS = 600_000
const VALVE_UNZIP_TIMEOUT_MS = 120_000
const META_NAME = 'valve-client.json'
const META_MAX_BYTES = 16 * 1024
const UNZIP_OUTPUT_CAP = 256 * 1024

type ValveFail = { reason: string }

function unrefHandle(handle: unknown): void {
  ;(handle as { unref?: () => void } | null | undefined)?.unref?.()
}

const defaultFetchText: ValveFetchText = async (url, { signal, maxBytes }) => {
  const { axiosClient } = await import('backend/utils')
  const response = await axiosClient.get<string>(url, {
    responseType: 'text',
    transformResponse: (d) => d,
    signal,
    timeout: 30_000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    // A redirect could leave the host allowlist, so none is followed.
    maxRedirects: 0,
    validateStatus: (s) => s === 200
  })
  return String(response.data)
}

const defaultFetchToFile: ValveFetchToFile = async (
  url,
  destPath,
  { signal, maxBytes }
) => {
  const { axiosClient } = await import('backend/utils')
  const response = await axiosClient.get(url, {
    responseType: 'stream',
    signal,
    timeout: 30_000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    maxRedirects: 0,
    validateStatus: (s) => s === 200
  })
  const body = response.data as NodeJS.ReadableStream & {
    destroy: (e?: Error) => void
  }
  const declared = Number(response.headers?.['content-length'])
  if (Number.isFinite(declared) && declared > maxBytes) {
    body.destroy()
    throw new Error(`content-length ${declared} exceeds ${maxBytes}`)
  }
  let bytes = 0
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length
      if (bytes > maxBytes) cb(new Error(`download exceeds ${maxBytes} bytes`))
      else cb(null, chunk)
    }
  })
  await pipeline(
    body,
    counter,
    createWriteStream(destPath, { flags: 'wx', mode: 0o600 })
  )
  return { bytes }
}

const defaultRunUnzip: ValveUnzipRunner = async (args, { timeoutMs }) => {
  // unzip needs no user profile, so it gets the isolated half of the
  // two-profile rule. The env comes from createFakeHomeProfile().childEnv()
  // and is never a hand-rolled literal.
  const profile = createFakeHomeProfile({ prefix: 'gamelib-unzip-' })
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
      const child = spawn('/usr/bin/unzip', [...args], {
        env: profile.childEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })
      unrefHandle(child)
      unrefHandle(child.stdout)
      unrefHandle(child.stderr)
      child.stdout?.on('data', (d: Buffer) => {
        if (stdout.length < UNZIP_OUTPUT_CAP) stdout += d.toString('utf8')
      })
      child.stderr?.on('data', (d: Buffer) => {
        if (stderr.length < UNZIP_OUTPUT_CAP) stderr += d.toString('utf8')
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

// An external abort (stdin EOF) must end the whole step, not fall through to
// the next CDN base.
class ExternalAbortError extends Error {
  constructor() {
    super('download aborted')
  }
}

async function downloadBounded<T>(
  abortId: string,
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
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
          timedOut
            ? new Error(`download timed out after ${timeoutMs} ms`)
            : new ExternalAbortError()
        )
      if (controller.signal.aborted) onAbort()
      else controller.signal.addEventListener('abort', onAbort, { once: true })
    })
    const fetching = run(controller.signal)
    // A fetch that loses the race must not become an unhandled rejection.
    fetching.catch(() => undefined)
    return await Promise.race([fetching, aborted])
  } finally {
    clearTimeout(timer)
    deleteAbortController(abortId)
  }
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

const SORTED_DLLS = [...VALVE_CLIENT_DLLS].sort()
const EXPECTED_DIR_ENTRIES = [...VALVE_CLIENT_DLLS, META_NAME].sort()

type ValveMeta = {
  schema: 1
  manifestVersion: string
  packageFile: string
  packageSha2: string
  files: Record<string, { size: number; sha256: string }>
}

function readyFor(dir: string, manifestVersion: string): ValveClientReady {
  return {
    clientDir: dir,
    manifestVersion,
    dlls: {
      steamclient64: join(dir, 'steamclient64.dll'),
      tier0: join(dir, 'tier0_s64.dll'),
      vstdlib: join(dir, 'vstdlib_s64.dll')
    },
    source: 'cache'
  }
}

async function verifyValveClientDir(
  dir: string
): Promise<({ ok: true } & { ready: ValveClientReady }) | (Fail & object)> {
  try {
    const st = await fsp.lstat(dir)
    if (!st.isDirectory() || st.isSymbolicLink()) {
      return { ok: false, reason: 'not a real directory' }
    }
    const entries = (await fsp.readdir(dir)).sort()
    if (JSON.stringify(entries) !== JSON.stringify(EXPECTED_DIR_ENTRIES)) {
      return { ok: false, reason: 'unexpected directory contents' }
    }
    const metaPath = join(dir, META_NAME)
    const mst = await fsp.lstat(metaPath)
    if (!mst.isFile() || mst.isSymbolicLink() || mst.size > META_MAX_BYTES) {
      return { ok: false, reason: 'bad metadata file' }
    }
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8')) as ValveMeta
    if (
      meta?.schema !== 1 ||
      typeof meta.manifestVersion !== 'string' ||
      !VERSION_RE.test(meta.manifestVersion) ||
      typeof meta.packageFile !== 'string' ||
      !FILE_RE.test(meta.packageFile) ||
      typeof meta.packageSha2 !== 'string' ||
      !SHA2_RE.test(meta.packageSha2)
    ) {
      return { ok: false, reason: 'bad metadata fields' }
    }
    for (const name of SORTED_DLLS) {
      const entry = own(meta.files, name) as
        | { size?: unknown; sha256?: unknown }
        | undefined
      if (
        !entry ||
        typeof entry.size !== 'number' ||
        typeof entry.sha256 !== 'string' ||
        !SHA2_RE.test(entry.sha256)
      ) {
        return { ok: false, reason: `bad metadata for ${name}` }
      }
      const full = join(dir, name)
      const fst = await fsp.lstat(full)
      if (!fst.isFile() || fst.isSymbolicLink()) {
        return { ok: false, reason: `${name} is not a regular file` }
      }
      if (fst.size !== entry.size) {
        return { ok: false, reason: `${name} has the wrong size` }
      }
      if ((await hashFile(full)) !== entry.sha256) {
        return { ok: false, reason: `${name} sha256 mismatch` }
      }
    }
    return { ok: true, ready: readyFor(dir, meta.manifestVersion) }
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err)
    }
  }
}

const LIST_LINE_RE =
  /^\s*(\d+)\s+\S+\s+\S+\s+(steamclient64\.dll|tier0_s64\.dll|vstdlib_s64\.dll)\s*$/

function parseListing(stdout: string): ValveFail | null {
  const seen = new Map<string, number>()
  for (const line of stdout.split(/\r?\n/)) {
    const m = LIST_LINE_RE.exec(line)
    if (!m) continue
    if (seen.has(m[2])) return { reason: `duplicate entry ${m[2]}` }
    seen.set(m[2], Number(m[1]))
  }
  for (const name of VALVE_CLIENT_DLLS) {
    const len = seen.get(name)
    if (len === undefined) return { reason: `package lacks ${name}` }
    if (!(len >= 1 && len <= MAX_VALVE_DLL_BYTES)) {
      return { reason: `${name} length ${len} out of range` }
    }
  }
  return null
}

async function listVersionDirs(root: string): Promise<string[]> {
  const names = await fsp.readdir(root)
  return names
    .filter((n) => VERSION_RE.test(n))
    .sort((a, b) =>
      a.length !== b.length ? b.length - a.length : a < b ? 1 : -1
    )
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function installOnce(
  paths: NonNullable<ReturnType<typeof buildDrmPaths>>,
  deps: ValveClientDeps
): Promise<DrmStepResult<ValveClientReady>> {
  const root = paths.valveClientRoot
  const fetchText = deps.fetchText ?? defaultFetchText
  const fetchToFile = deps.fetchToFile ?? defaultFetchToFile
  const runUnzip = deps.runUnzip ?? defaultRunUnzip
  let tempDir: string | undefined
  try {
    await fsp.mkdir(root, { recursive: true, mode: 0o700 })
    const rst = await fsp.lstat(root)
    if (!rst.isDirectory() || rst.isSymbolicLink()) {
      return drmStepError(
        'valve-verify',
        'valve-client root is not a real directory'
      )
    }

    // Cache first (D-05): a verified per-version dir needs no network.
    for (const v of await listVersionDirs(root)) {
      const dir = paths.valveClientDir(v)
      if (!dir) continue
      const check = await verifyValveClientDir(dir)
      if (check.ok) {
        logInfo(`valve client: using cached ${v}`, LogPrefix.Steam)
        return { status: 'ok', ...check.ready, source: 'cache' }
      }
    }

    deps.onFetchStart?.()

    let manifestText: string | undefined
    let winningBase: string | undefined
    let lastMessage = 'no base tried'
    for (const base of VALVE_CLIENT_BASES) {
      const url = valveManifestUrl(base)
      if (!url) continue
      try {
        manifestText = await downloadBounded(
          'drm-valve-client:manifest',
          (signal) =>
            fetchText(url, { signal, maxBytes: MAX_VALVE_MANIFEST_BYTES }),
          deps.manifestTimeoutMs ?? VALVE_MANIFEST_TIMEOUT_MS
        )
        winningBase = base
        break
      } catch (err) {
        lastMessage = errText(err)
        if (err instanceof ExternalAbortError) break
      }
    }
    if (manifestText === undefined || winningBase === undefined) {
      return drmStepError(
        'valve-fetch',
        'all Valve CDN bases failed: ' + lastMessage
      )
    }

    const parsed = parseValveClientManifest(manifestText)
    if (!parsed.ok)
      return drmStepError('valve-verify', 'manifest: ' + parsed.reason)
    const pkg = parsed.pkg
    const target = paths.valveClientDir(pkg.manifestVersion)
    if (!target) return drmStepError('valve-verify', 'manifest: bad version')

    tempDir = await fsp.mkdtemp(join(root, '.partial-'))
    const zipPath = join(tempDir, 'package.zip')
    const outDir = join(tempDir, 'out')

    const bases = [
      winningBase,
      ...VALVE_CLIENT_BASES.filter((b) => b !== winningBase)
    ]
    let fetched = false
    lastMessage = 'no base tried'
    for (const base of bases) {
      const url = valvePackageUrl(base, pkg.file)
      if (!url) continue
      try {
        await fsp.rm(zipPath, { force: true })
        await downloadBounded(
          'drm-valve-client:package',
          (signal) => fetchToFile(url, zipPath, { signal, maxBytes: pkg.size }),
          deps.packageTimeoutMs ?? VALVE_PACKAGE_TIMEOUT_MS
        )
        fetched = true
        winningBase = base
        break
      } catch (err) {
        lastMessage = errText(err)
        if (err instanceof ExternalAbortError) break
      }
    }
    if (!fetched) {
      return drmStepError(
        'valve-fetch',
        'all Valve CDN bases failed: ' + lastMessage
      )
    }

    const zst = await fsp.lstat(zipPath)
    if (!zst.isFile() || zst.isSymbolicLink() || zst.size !== pkg.size) {
      return drmStepError(
        'valve-verify',
        `package size ${zst.size} does not match manifest ${pkg.size}`
      )
    }
    if ((await hashFile(zipPath)) !== pkg.sha2) {
      return drmStepError(
        'valve-verify',
        'package sha256 does not match manifest sha2'
      )
    }

    const unzipTimeout = VALVE_UNZIP_TIMEOUT_MS
    const listing = await runUnzip(['-l', zipPath, ...VALVE_CLIENT_DLLS], {
      timeoutMs: unzipTimeout
    })
    if (listing.timedOut || listing.code !== 0) {
      return drmStepError('valve-verify', 'unzip listing failed')
    }
    const listFail = parseListing(listing.stdout)
    if (listFail) return drmStepError('valve-verify', listFail.reason)

    await fsp.mkdir(outDir, { mode: 0o700 })
    // Explicit entry names only; never a bare extract-all.
    const extract = await runUnzip(
      ['-qq', '-n', zipPath, ...VALVE_CLIENT_DLLS, '-d', outDir],
      { timeoutMs: unzipTimeout }
    )
    if (extract.timedOut || extract.code !== 0) {
      return drmStepError('valve-verify', 'unzip extraction failed')
    }

    const extracted = (await fsp.readdir(outDir)).sort()
    if (JSON.stringify(extracted) !== JSON.stringify(SORTED_DLLS)) {
      return drmStepError('valve-verify', 'unexpected files extracted')
    }
    const files: ValveMeta['files'] = {}
    for (const name of SORTED_DLLS) {
      const full = join(outDir, name)
      const st = await fsp.lstat(full)
      if (!st.isFile() || st.isSymbolicLink()) {
        return drmStepError('valve-verify', `${name} is not a regular file`)
      }
      if (!(st.size >= 1 && st.size <= MAX_VALVE_DLL_BYTES)) {
        return drmStepError('valve-verify', `${name} size out of range`)
      }
      files[name] = { size: st.size, sha256: await hashFile(full) }
    }
    const meta: ValveMeta = {
      schema: 1,
      manifestVersion: pkg.manifestVersion,
      packageFile: pkg.file,
      packageSha2: pkg.sha2,
      files
    }
    await fsp.writeFile(join(outDir, META_NAME), JSON.stringify(meta), {
      flag: 'wx',
      mode: 0o600
    })
    const check = await verifyValveClientDir(outDir)
    if (!check.ok) {
      return drmStepError('valve-verify', 'extracted files: ' + check.reason)
    }

    let stale: string | undefined
    try {
      await fsp.lstat(target)
      stale = join(root, `.stale-${process.pid}-${Date.now()}`)
      await fsp.rename(target, stale)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    try {
      await fsp.rename(outDir, target)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EEXIST' || code === 'ENOTEMPTY') {
        const won = await verifyValveClientDir(target)
        if (won.ok) return { status: 'ok', ...won.ready, source: 'download' }
      }
      throw err
    } finally {
      if (stale) await fsp.rm(stale, { recursive: true, force: true })
    }

    // Best-effort prune of older versions: 56-09 copies the DLLs into the
    // bottle, so no running process uses the cache dir.
    try {
      for (const v of await listVersionDirs(root)) {
        if (v === pkg.manifestVersion) continue
        const old = paths.valveClientDir(v)
        if (!old) continue
        const ost = await fsp.lstat(old)
        if (ost.isDirectory() && !ost.isSymbolicLink()) {
          await fsp.rm(old, { recursive: true, force: true })
        }
      }
    } catch {
      // pruning is cosmetic
    }

    logInfo(
      `valve client: downloaded and verified ${pkg.manifestVersion} from ${
        new URL(winningBase).host
      }`,
      LogPrefix.Steam
    )
    return {
      status: 'ok',
      ...readyFor(target, pkg.manifestVersion),
      source: 'download'
    }
  } catch (err) {
    return drmStepError('valve-verify', err)
  } finally {
    if (tempDir) {
      await fsp
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined)
    }
  }
}

const inFlight = new Map<string, Promise<DrmStepResult<ValveClientReady>>>()

/**
 * Returns the verified Valve client DLLs, from the per-manifest-version cache
 * when present, otherwise after one bounded download. Never rejects.
 */
// ts-prune-ignore-next
export async function ensureValveClient(
  opts: { appFolder: string },
  deps: ValveClientDeps = {}
): Promise<DrmStepResult<ValveClientReady>> {
  try {
    const paths = buildDrmPaths(opts.appFolder)
    if (!paths) return drmStepError('valve-fetch', 'invalid app folder')
    const pending = inFlight.get(paths.valveClientRoot)
    if (pending) return await pending
    const run = installOnce(paths, deps)
      .then((result) => {
        if (result.status === 'error') {
          logWarning(
            `valve client: ${result.step} ${result.cause}`,
            LogPrefix.Steam
          )
        }
        return result
      })
      .finally(() => inFlight.delete(paths.valveClientRoot))
    inFlight.set(paths.valveClientRoot, run)
    return await run
  } catch (err) {
    return drmStepError('valve-verify', err)
  }
}
