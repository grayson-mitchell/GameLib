/**
 * Pinned fallback engine: on-demand download, streaming sha256, contained
 * extraction and retention (phase 59, D-05 / D-08 / D-14).
 *
 * Sidecar exit contract: nothing runs at import. The in-flight map is empty at
 * boot and filled only inside ensurePinnedEngine; no timers are created here
 * (downloadFile owns its own sockets and only runs on first need).
 */
import type { ProcessRunner } from 'backend/process/types'
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
import type { AppPaths } from 'backend/process/context'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  createAbortController,
  deleteAbortController
} from 'backend/utils/aborthandler/aborthandler'
import type { OnlineMonitor } from 'backend/online_monitor'
import { calculateEta, downloadFile, extractFiles } from 'backend/utils'
import { ENGINE_PINS, type EnginePin, type PinnedArtifact } from './enginePins'

const MARKER = '.gamelib-pin.json'

export type FallbackDownloadProgress = {
  phase: 'downloading' | 'verifying' | 'extracting'
  artifact: 'wine' | 'dxvk'
  percentage?: number
  eta?: string
}

export type EnginePaths = {
  wineDir: string
  wineBin: string
  wineserverBin: string
  dxvkDir: string
}

type EnsureResult =
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

function wineDirName(pin: EnginePin): string {
  return pin.id
}
function dxvkDirName(pin: EnginePin): string {
  return `dxvk-macOS-${pin.dxvk.version}`
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

type InFlight = {
  promise: Promise<EnsureResult>
  listeners: Set<(p: FallbackDownloadProgress) => void>
  callers: number
  aborted: number
  controller: AbortController
}

export interface FallbackEngine {
  pinnedEngineRoot: () => string
  pinnedEnginePaths: (pin: EnginePin) => EnginePaths
  isPinnedEngineInstalled: (pin: EnginePin) => boolean
  ensurePinnedEngine: (
    pin: EnginePin,
    opts: {
      /** The process runner the archive extraction runs through (66.2-11). */
      runner: Pick<ProcessRunner, 'run'>
      onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
      onProgress?: (p: FallbackDownloadProgress) => void
      signal?: AbortSignal
    }
  ) => Promise<EnsureResult>
  pruneUnpinnedEngines: () => void
  sweepStaleEngineTemps: () => void
}

/**
 * One fallback-engine owner per boot (66.4-05): the artifact-install counter and the single-flight
 * download map are closure state, so concurrent callers sharing this instance dedupe. Construction
 * does no I/O and arms no timer.
 */
export function createFallbackEngine(deps: {
  paths: Pick<AppPaths, 'toolsPath'>
}): FallbackEngine {
  /** Artifact installs currently holding a `.tmp-*` dir (prune must not touch them). */
  let activeArtifactInstalls = 0
  const inFlight = new Map<string, InFlight>()

  function pinnedEngineRoot(): string {
    return join(deps.paths.toolsPath, 'steam-engines')
  }

  function pinnedEnginePaths(pin: EnginePin): EnginePaths {
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

  function isPinnedEngineInstalled(pin: EnginePin): boolean {
    return wineInstalled(pin) && dxvkInstalled(pin)
  }

  async function installArtifact(
    kind: 'wine' | 'dxvk',
    artifact: PinnedArtifact,
    finalDir: string,
    opts: {
      runner: Pick<ProcessRunner, 'run'>
      onProgress?: (p: FallbackDownloadProgress) => void
      signal?: AbortSignal
    }
  ): Promise<void> {
    const root = pinnedEngineRoot()
    mkdirSync(root, { recursive: true })
    activeArtifactInstalls++
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
        `Engine: downloading ${kind} ${artifact.version}`,
        LogPrefix.Backend
      )
      emit({ phase: 'downloading', percentage: 0 })
      try {
        await downloadFile({
          url: artifact.url,
          dest: dl,
          abortSignal: opts.signal,
          progressCallback: (
            bytes: number,
            speed: number,
            percentage: number
          ) =>
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
        throw new StageError(
          'hash-mismatch',
          `${kind}: unexpected archive size`
        )
      }
      logInfo(`Engine: verifying ${kind}`, LogPrefix.Backend)
      emit({ phase: 'verifying' })
      const digest = await sha256OfFile(archive)
      if (opts.signal?.aborted)
        throw new StageError('aborted', 'aborted during verify')
      if (digest !== artifact.sha256) {
        rmSync(archive, { force: true })
        throw new StageError('hash-mismatch', `${kind}: sha256 mismatch`)
      }

      logInfo(`Engine: extracting ${kind}`, LogPrefix.Backend)
      emit({ phase: 'extracting' })
      const res = await extractFiles(opts, {
        path: archive,
        destination: out,
        strip: 1
      })
      if (opts.signal?.aborted)
        throw new StageError('aborted', 'aborted during extract')
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
      if (opts.signal?.aborted)
        throw new StageError('aborted', 'aborted before install')
      if (existsSync(finalDir))
        rmSync(finalDir, { recursive: true, force: true })
      renameSync(out, finalDir)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
      activeArtifactInstalls--
    }
  }

  async function doEnsure(
    pin: EnginePin,
    opts: {
      runner: Pick<ProcessRunner, 'run'>
      onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
      onProgress?: (p: FallbackDownloadProgress) => void
      signal?: AbortSignal
    }
  ): Promise<EnsureResult> {
    const paths = pinnedEnginePaths(pin)
    if (isPinnedEngineInstalled(pin)) return { ok: true, paths }
    if (!opts.onlineMonitor.isOnline()) {
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

  function ensurePinnedEngine(
    pin: EnginePin,
    opts: {
      /** The process runner the archive extraction runs through (66.2-11). */
      runner: Pick<ProcessRunner, 'run'>
      onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
      onProgress?: (p: FallbackDownloadProgress) => void
      signal?: AbortSignal
    }
  ): Promise<EnsureResult> {
    let entry = inFlight.get(pin.id)
    const isFirst = !entry
    if (!entry) {
      // Registered with the shared registry so the sidecar's stdin-EOF release
      // (callAllAbortControllers) aborts the download: gamelib-conventions
      // sidecar exit contract, half 2 - in-flight work bounded at quit
      // (59-REVIEW WR-11). Shutdown aborts unconditionally; a caller's own
      // signal only counts toward the all-callers-aborted rule (WR-10).
      const id = `steam-engine-download:${pin.id}`
      const listeners = new Set<(p: FallbackDownloadProgress) => void>()
      entry = {
        promise: undefined as unknown as Promise<EnsureResult>,
        listeners,
        callers: 0,
        aborted: 0,
        controller: createAbortController(id)
      }
      inFlight.set(pin.id, entry)
    }
    const shared = entry
    if (opts.onProgress) shared.listeners.add(opts.onProgress)
    shared.callers++

    let early: Promise<EnsureResult> | null = null
    const signal = opts.signal
    if (signal) {
      let resolveEarly: (r: EnsureResult) => void = () => undefined
      const earlyP = new Promise<EnsureResult>((res) => {
        resolveEarly = res
      })
      const onAbort = () => {
        shared.aborted++
        if (opts.onProgress) shared.listeners.delete(opts.onProgress)
        if (shared.aborted >= shared.callers) {
          // nobody else is waiting: stop the shared download; the shared
          // promise then settles as 'aborted' after its temp dirs are removed
          shared.controller.abort()
        } else {
          resolveEarly({
            ok: false,
            reason: 'aborted',
            detail: 'aborted by caller'
          })
        }
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
      early = earlyP
    }

    if (isFirst) {
      const id = `steam-engine-download:${pin.id}`
      // start on a microtask so callers joining in the same tick still see
      // the first synchronous progress events
      shared.promise = Promise.resolve()
        .then(() =>
          doEnsure(pin, {
            runner: opts.runner,
            onlineMonitor: opts.onlineMonitor,
            onProgress: (p) => shared.listeners.forEach((l) => l(p)),
            signal: shared.controller.signal
          })
        )
        .finally(() => {
          if (inFlight.get(pin.id) === shared) inFlight.delete(pin.id)
          deleteAbortController(id)
        })
    }
    return early ? Promise.race([shared.promise, early]) : shared.promise
  }

  /** Keep the current and previous pins' directories; remove other engines. */
  function pruneUnpinnedEngines(): void {
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
        if (keep.has(name)) continue
        if (name.startsWith('.tmp-') && activeArtifactInstalls > 0) continue
        const full = join(root, name)
        if (!isContained(root, full) || full === root) continue
        const st = lstatSync(full)
        if (!st.isDirectory()) continue
        rmSync(full, { recursive: true, force: true })
      }
    } catch (err) {
      logWarning(`Engine: prune failed: ${String(err)}`, LogPrefix.Backend)
    }
  }

  /**
   * Boot-time sweep of `.tmp-*` unpack directories under the engine root (G20).
   *
   * An interrupted engine unpack (quit during "Unpacking built-in engine")
   * leaves `steam-engines/.tmp-*` behind, and pruneUnpinnedEngines only runs
   * after a successful install. Synchronous on purpose: the sidecar exit
   * contract forbids unbounded in-flight work at boot, so this creates no timer,
   * watcher, socket or child handle and leaves nothing running once it returns.
   * It cannot race an install: it runs before READY, and it also returns early
   * while an artifact install or engine download is in flight. Never throws.
   */
  function sweepStaleEngineTemps(): void {
    try {
      if (activeArtifactInstalls > 0 || inFlight.size > 0) return
      const root = pinnedEngineRoot()
      if (!existsSync(root)) return
      let removed = 0
      for (const name of readdirSync(root)) {
        if (!name.startsWith('.tmp-')) continue
        const full = join(root, name)
        try {
          if (!isContained(root, full) || full === root) continue
          if (!lstatSync(full).isDirectory()) continue
          rmSync(full, { recursive: true, force: true })
          removed++
        } catch (err) {
          logWarning(
            `Engine: could not remove stale temp ${name}: ${String(err)}`,
            LogPrefix.Backend
          )
        }
      }
      if (removed > 0) {
        logInfo(
          `Engine: removed ${removed} stale engine temp dir(s) at boot`,
          LogPrefix.Backend
        )
      }
    } catch (err) {
      logWarning(`Engine: temp sweep failed: ${String(err)}`, LogPrefix.Backend)
    }
  }

  return {
    pinnedEngineRoot,
    pinnedEnginePaths,
    isPinnedEngineInstalled,
    ensurePinnedEngine,
    pruneUnpinnedEngines,
    sweepStaleEngineTemps
  }
}
