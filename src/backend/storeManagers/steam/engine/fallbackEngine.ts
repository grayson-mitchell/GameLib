/**
 * Pinned fallback engine: on-demand download, streaming sha256, contained
 * extraction and retention (phase 59, D-05 / D-08 / D-14).
 *
 * Sidecar exit contract: nothing runs at import. The in-flight map is empty at
 * boot and filled only inside ensurePinnedEngine; no timers are created here
 * (downloadFile owns its own sockets and only runs on first need).
 */
import { createHash } from 'crypto'
import {
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { toolsPath } from 'backend/constants/paths'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isOnline } from 'backend/online_monitor'
import { calculateEta, downloadFile, extractFiles } from 'backend/utils'
import { ENGINE_PINS, type EnginePin, type PinnedArtifact } from './enginePins'

const MARKER = '.gamelib-pin.json'

export type FallbackDownloadProgress = {
  phase: 'downloading' | 'verifying' | 'extracting'
  artifact: 'wine' | 'dxvk'
  percentage?: number
  eta?: string
}

type EnginePaths = {
  wineDir: string
  wineBin: string
  wineserverBin: string
  dxvkDir: string
}

export type EnsureResult =
  | { ok: true; paths: EnginePaths }
  | {
      ok: false
      reason:
        | 'offline'
        | 'download-failed'
        | 'hash-mismatch'
        | 'extract-failed'
        | 'aborted'
      detail: string
    }

export function pinnedEngineRoot(): string {
  return join(toolsPath, 'steam-engines')
}

function wineDirName(pin: EnginePin): string {
  return pin.id
}
function dxvkDirName(pin: EnginePin): string {
  return `dxvk-macOS-${pin.dxvk.version}`
}

export function pinnedEnginePaths(pin: EnginePin): EnginePaths {
  const root = pinnedEngineRoot()
  const wineDir = join(root, wineDirName(pin))
  const wineBinDir = join(wineDir, 'Contents', 'Resources', 'wine', 'bin')
  return {
    wineDir,
    wineBin: join(wineBinDir, 'wine'),
    wineserverBin: join(wineBinDir, 'wineserver'),
    dxvkDir: join(root, dxvkDirName(pin))
  }
}

function markerMatches(dir: string, artifact: PinnedArtifact): boolean {
  try {
    const m = JSON.parse(readFileSync(join(dir, MARKER), 'utf8')) as {
      sha256?: string
    }
    return m.sha256 === artifact.sha256
  } catch {
    return false
  }
}

function wineInstalled(pin: EnginePin): boolean {
  const p = pinnedEnginePaths(pin)
  return (
    existsSync(p.wineBin) &&
    existsSync(p.wineserverBin) &&
    markerMatches(p.wineDir, pin.wine)
  )
}

function dxvkInstalled(pin: EnginePin): boolean {
  const p = pinnedEnginePaths(pin)
  return (
    existsSync(join(p.dxvkDir, 'x32')) &&
    existsSync(join(p.dxvkDir, 'x64')) &&
    markerMatches(p.dxvkDir, pin.dxvk)
  )
}

export function isPinnedEngineInstalled(pin: EnginePin): boolean {
  return wineInstalled(pin) && dxvkInstalled(pin)
}

export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((res, rej) => {
    const s = createReadStream(path)
    s.on('data', (chunk) => hash.update(chunk))
    s.on('error', rej)
    s.on('end', () => res())
  })
  return hash.digest('hex')
}

function isContained(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Every symlink under root must resolve (logically and really) inside root. */
function assertContained(root: string): void {
  const realRoot = realpathSync(root)
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const st = lstatSync(full)
      if (st.isSymbolicLink()) {
        const logical = resolve(dirname(full), readlinkSync(full))
        if (!isContained(root, logical) && !isContained(realRoot, logical)) {
          throw new Error(`symlink escapes extraction root: ${full}`)
        }
        let real: string | null = null
        try {
          real = realpathSync(full)
        } catch {
          real = null // dangling inside the root is acceptable
        }
        if (real !== null && !isContained(realRoot, real)) {
          throw new Error(`symlink escapes extraction root: ${full}`)
        }
      } else if (st.isDirectory()) {
        walk(full)
      }
    }
  }
  walk(root)
}

class StageError extends Error {
  constructor(
    readonly reason: Exclude<EnsureResult, { ok: true }>['reason'],
    detail: string
  ) {
    super(detail)
  }
}

async function installArtifact(
  kind: 'wine' | 'dxvk',
  artifact: PinnedArtifact,
  finalDir: string,
  opts: {
    onProgress?: (p: FallbackDownloadProgress) => void
    signal?: AbortSignal
  }
): Promise<void> {
  const root = pinnedEngineRoot()
  mkdirSync(root, { recursive: true })
  const tmp = mkdtempSync(join(root, `.tmp-${kind}-`))
  const emit = (p: Omit<FallbackDownloadProgress, 'artifact'>) =>
    opts.onProgress?.({ ...p, artifact: kind })
  try {
    if (opts.signal?.aborted) throw new StageError('aborted', 'aborted')
    const dl = join(tmp, 'dl')
    const out = join(tmp, 'out')
    mkdirSync(dl)
    mkdirSync(out)
    const archive = join(dl, artifact.archiveName)

    logInfo(
      `Steam engine: downloading ${kind} ${artifact.version}`,
      LogPrefix.Steam
    )
    emit({ phase: 'downloading', percentage: 0 })
    try {
      await downloadFile({
        url: artifact.url,
        dest: dl,
        abortSignal: opts.signal,
        progressCallback: (bytes: number, speed: number, percentage: number) =>
          emit({
            phase: 'downloading',
            percentage,
            eta: calculateEta(bytes, speed, artifact.size) ?? undefined
          })
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (opts.signal?.aborted || msg.includes('Download stopped'))
        throw new StageError('aborted', msg)
      throw new StageError('download-failed', msg)
    }
    if (opts.signal?.aborted) throw new StageError('aborted', 'aborted')

    if (!existsSync(archive) || statSync(archive).size !== artifact.size) {
      throw new StageError('hash-mismatch', `${kind}: unexpected archive size`)
    }
    logInfo(`Steam engine: verifying ${kind}`, LogPrefix.Steam)
    emit({ phase: 'verifying' })
    const digest = await sha256OfFile(archive)
    if (digest !== artifact.sha256) {
      rmSync(archive, { force: true })
      throw new StageError('hash-mismatch', `${kind}: sha256 mismatch`)
    }

    logInfo(`Steam engine: extracting ${kind}`, LogPrefix.Steam)
    emit({ phase: 'extracting' })
    const res = await extractFiles({
      path: archive,
      destination: out,
      strip: 1
    })
    if (res.status !== 'done') {
      throw new StageError('extract-failed', `${kind}: tar failed`)
    }
    try {
      assertContained(out)
    } catch (err) {
      throw new StageError(
        'extract-failed',
        err instanceof Error ? err.message : String(err)
      )
    }
    writeFileSync(
      join(out, MARKER),
      JSON.stringify({ sha256: artifact.sha256, version: artifact.version })
    )
    if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true })
    renameSync(out, finalDir)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const inFlight = new Map<string, Promise<EnsureResult>>()

async function doEnsure(
  pin: EnginePin,
  opts: {
    onProgress?: (p: FallbackDownloadProgress) => void
    signal?: AbortSignal
  }
): Promise<EnsureResult> {
  const paths = pinnedEnginePaths(pin)
  if (isPinnedEngineInstalled(pin)) return { ok: true, paths }
  if (!isOnline()) {
    return { ok: false, reason: 'offline', detail: 'no network connection' }
  }
  try {
    if (!dxvkInstalled(pin))
      await installArtifact('dxvk', pin.dxvk, paths.dxvkDir, opts)
    if (!wineInstalled(pin))
      await installArtifact('wine', pin.wine, paths.wineDir, opts)
  } catch (err) {
    if (err instanceof StageError) {
      return { ok: false, reason: err.reason, detail: err.message }
    }
    return {
      ok: false,
      reason: 'download-failed',
      detail: err instanceof Error ? err.message : String(err)
    }
  }
  if (pin === ENGINE_PINS.current || pin === ENGINE_PINS.previous) {
    pruneUnpinnedEngines()
  }
  return { ok: true, paths }
}

export function ensurePinnedEngine(
  pin: EnginePin,
  opts: {
    onProgress?: (p: FallbackDownloadProgress) => void
    signal?: AbortSignal
  } = {}
): Promise<EnsureResult> {
  const existing = inFlight.get(pin.id)
  if (existing) return existing
  const p = doEnsure(pin, opts).finally(() => {
    inFlight.delete(pin.id)
  })
  inFlight.set(pin.id, p)
  return p
}

/** Keep the current and previous pins' directories; remove other engines. */
export function pruneUnpinnedEngines(): void {
  const root = pinnedEngineRoot()
  try {
    if (!existsSync(root)) return
    const keep = new Set<string>()
    for (const pin of [ENGINE_PINS.current, ENGINE_PINS.previous]) {
      if (!pin) continue
      keep.add(wineDirName(pin))
      keep.add(dxvkDirName(pin))
    }
    for (const name of readdirSync(root)) {
      if (keep.has(name) || name.startsWith('.tmp-')) continue
      const full = join(root, name)
      if (!isContained(root, full) || full === root) continue
      const st = lstatSync(full)
      if (!st.isDirectory()) continue
      rmSync(full, { recursive: true, force: true })
    }
  } catch (err) {
    logWarning(`Steam engine: prune failed: ${err}`, LogPrefix.Steam)
  }
}
