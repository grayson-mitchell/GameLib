/**
 * Switching a bridge bottle between engines (phase 59, D-07).
 *
 * Two engines must never share a live wineserver for one prefix, and DXVK must match the engine
 * that is about to run: installed for a non-CrossOver engine, removed before CrossOver runs (a
 * CrossOver bottle carries its own graphics stack). The engine that last prepared a bottle is
 * recorded in `<bottle>/.gamelib-engine.json`.
 *
 * Nothing runs at import and there are no timers (sidecar exit contract).
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { toolsPath } from 'backend/constants/paths'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { GameSettings } from 'common/types'
import { DXVK } from 'backend/tools'
import {
  bridgeBottleNameFor,
  getBridgeBottleSettings,
  persistedWineBins
} from 'backend/storeManagers/steam/bottle'
import {
  buildFallbackGameSettings,
  getBottleDir,
  killBottleWineServerWith,
  sanitizeBottleName
} from './bottlePrimitives'
import { getBottleProcessMonitorPhase } from 'backend/storeManagers/steam/bottleProcessMonitor'
import { resolveCrossoverBinDirAsync } from 'backend/storeManagers/steam/crossoverLocation'
import { ENGINE_PINS, pinById } from './enginePins'
import type { EnginePin } from './enginePins'
import {
  ensurePinnedEngine,
  isPinnedEngineInstalled,
  pinnedEnginePaths,
  pinnedEngineRoot
} from './fallbackEngine'
import type { EngineSelection, NonCrossoverEngine } from './engineTypes'

export const ENGINE_MARKER_FILE = '.gamelib-engine.json'

const DXVK_VERSION_FILE = 'current_dxvk-macOS'
const KILL_TIMEOUT_MS = 15_000

type MarkerKind = 'crossover' | 'pinned' | 'wine-manager'
type MarkerDxvk = { dir: string; version: string } | 'failed'
type EngineMarker = {
  kind: MarkerKind
  id: string
  wineserverBin: string
  /** Installed DXVK, or 'failed' when a switch handed the bottle over but DXVK did not install. */
  dxvk?: MarkerDxvk
}

export interface EngineSwitchDeps {
  getMonitorPhase: (appId: string) => 'starting' | 'running' | null
  killWith: typeof killBottleWineServerWith
  resolveCrossoverBinDir: () => Promise<string | undefined>
  installRemove: typeof DXVK.installRemove
  /** Must be called while the CrossOver selection is the one registered for the app. */
  crossoverSettings: (appId: string) => GameSettings
  fallbackSettings: (
    bottleName: string,
    engine: NonCrossoverEngine
  ) => GameSettings
  currentPinEngine: () => NonCrossoverEngine | null
  /** Makes a pinned engine available (downloads it when absent); null when that fails. */
  ensurePinEngine: (pin: EnginePin) => Promise<NonCrossoverEngine | null>
  /** The title's own per-game bottle name (59-REVIEW WR-06). */
  ownBottleName: (appId: string) => string | null
}

export type PrepareResult =
  | { ok: true; changed: boolean }
  | {
      ok: false
      reason:
        | 'game-running'
        | 'dxvk-failed'
        | 'invalid-bottle'
        | 'shared-bottle'
      detail: string
    }

function defaultCurrentPinEngine(): NonCrossoverEngine | null {
  const pin = pinById(ENGINE_PINS.current.id)
  if (!pin || !isPinnedEngineInstalled(pin)) return null
  const p = pinnedEnginePaths(pin)
  return {
    wineBin: p.wineBin,
    wineserverBin: p.wineserverBin,
    label: pin.label,
    version: pin.wine.version,
    dxvk: { dir: p.dxvkDir, version: pin.dxvk.version }
  }
}

async function defaultEnsurePinEngine(
  pin: EnginePin
): Promise<NonCrossoverEngine | null> {
  const res = await ensurePinnedEngine(pin)
  if (!res.ok) return null
  return {
    wineBin: res.paths.wineBin,
    wineserverBin: res.paths.wineserverBin,
    label: pin.label,
    version: pin.wine.version,
    dxvk: { dir: res.paths.dxvkDir, version: pin.dxvk.version }
  }
}

const defaultDeps: EngineSwitchDeps = {
  getMonitorPhase: getBottleProcessMonitorPhase,
  killWith: killBottleWineServerWith,
  resolveCrossoverBinDir: () =>
    resolveCrossoverBinDirAsync({ hintWineBins: persistedWineBins() }),
  installRemove: (...args) => DXVK.installRemove(...args),
  crossoverSettings: getBridgeBottleSettings,
  fallbackSettings: buildFallbackGameSettings,
  currentPinEngine: defaultCurrentPinEngine,
  ensurePinEngine: defaultEnsurePinEngine,
  ownBottleName: bridgeBottleNameFor
}

function isInside(root: string, path: string): boolean {
  if (!isAbsolute(path)) return false
  const rel = relative(resolve(root), resolve(path))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * G22 (59-38): read-only view of the bottle's engine marker for the launch path. Never infers
 * or writes a marker; null for an absent/unreadable marker or an unsafe bottle name.
 */
export function readBottleEngineMarkerKind(
  bottleName: string
): 'crossover' | 'non-crossover' | null {
  try {
    if (sanitizeBottleName(bottleName) !== bottleName) return null
    const marker = readMarker(getBottleDir(bottleName))
    if (!marker) return null
    return marker.kind === 'crossover' ? 'crossover' : 'non-crossover'
  } catch {
    return null
  }
}

/**
 * G22 (59-38): true when switching this bottle back to a HEALTHY CrossOver would have to
 * download a pin that is not installed (the same conditions resolveRestoreSource and
 * prepareBottleForEngine use, read-only). False whenever the restore needs no pin download,
 * and for any unreadable state.
 */
export function restoreNeedsAbsentPin(bottleName: string): boolean {
  try {
    if (sanitizeBottleName(bottleName) !== bottleName) return false
    const bottleDir = getBottleDir(bottleName)
    const prev = readMarker(bottleDir)
    if (!prev || prev.kind === 'crossover') return false
    const restoreNeeded =
      existsSync(join(bottleDir, DXVK_VERSION_FILE)) || prev.dxvk !== undefined
    if (!restoreNeeded) return false
    const pin =
      (prev.kind === 'pinned' ? pinById(prev.id) : null) ?? ENGINE_PINS.current
    if (isPinnedEngineInstalled(pin)) return false
    // A healthy CrossOver restores from the marker's own DXVK copy without the pin.
    if (
      prev.dxvk &&
      prev.dxvk !== 'failed' &&
      existsSync(join(prev.dxvk.dir, 'x64'))
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

function readMarker(bottleDir: string): EngineMarker | null {
  try {
    const raw = JSON.parse(
      readFileSync(join(bottleDir, ENGINE_MARKER_FILE), 'utf8')
    ) as Partial<EngineMarker>
    const kinds: MarkerKind[] = ['crossover', 'pinned', 'wine-manager']
    if (
      !raw ||
      !kinds.includes(raw.kind as MarkerKind) ||
      typeof raw.id !== 'string' ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(raw.id) ||
      typeof raw.wineserverBin !== 'string'
    ) {
      return null
    }
    const out: EngineMarker = {
      kind: raw.kind as MarkerKind,
      id: raw.id,
      wineserverBin: raw.wineserverBin
    }
    // T-59-60: a hand-edited dir must not steer the DLL removal list elsewhere.
    const d: unknown = raw.dxvk
    if (d === 'failed') {
      out.dxvk = 'failed'
    } else if (d && typeof d === 'object') {
      const { dir, version } = d as { dir?: unknown; version?: unknown }
      if (
        typeof dir === 'string' &&
        isInside(pinnedEngineRoot(), dir) &&
        typeof version === 'string' &&
        /^[A-Za-z0-9._-]{1,64}$/.test(version)
      ) {
        out.dxvk = { dir, version }
      }
    }
    return out
  } catch {
    return null
  }
}

function writeMarker(bottleDir: string, marker: EngineMarker): void {
  const tmp = join(bottleDir, `${ENGINE_MARKER_FILE}.tmp-${process.pid}`)
  try {
    writeFileSync(tmp, JSON.stringify(marker), { mode: 0o644 })
    renameSync(tmp, join(bottleDir, ENGINE_MARKER_FILE))
  } catch (err) {
    rmSync(tmp, { force: true })
    logWarning(['engine marker write failed', err], LogPrefix.Steam)
  }
}

function markerFor(next: EngineSelection, dxvk?: MarkerDxvk): EngineMarker {
  const base = markerForBase(next)
  return dxvk === undefined ? base : { ...base, dxvk }
}

function markerForBase(next: EngineSelection): EngineMarker {
  if (next.kind === 'crossover') {
    return {
      kind: 'crossover',
      id: 'crossover',
      wineserverBin: join(next.binDir, 'wineserver')
    }
  }
  return {
    kind: next.kind,
    id: next.kind === 'pinned' ? next.pinId : next.managerVersion,
    wineserverBin: next.wineserverBin
  }
}

const identityOf = (m: { kind: MarkerKind; id: string }): string =>
  m.kind === 'crossover' ? 'crossover' : `${m.kind}:${m.id}`

/** Without a marker: a conf carrying a Timestamp was touched by CrossOver; otherwise the pin. */
function inferMarker(bottleDir: string, deps: EngineSwitchDeps): EngineMarker {
  let conf = ''
  try {
    conf = readFileSync(join(bottleDir, 'cxbottle.conf'), 'utf8')
  } catch {
    // no conf: treated as the pin below
  }
  if (/Timestamp/.test(conf)) {
    return { kind: 'crossover', id: 'crossover', wineserverBin: '' }
  }
  return {
    kind: 'pinned',
    id: ENGINE_PINS.current.id,
    wineserverBin: deps.currentPinEngine()?.wineserverBin ?? ''
  }
}

async function killPrevious(
  bottleName: string,
  prev: EngineMarker,
  deps: EngineSwitchDeps
): Promise<void> {
  const binDir = await deps.resolveCrossoverBinDir()
  if (prev.kind === 'crossover') {
    if (!binDir) {
      logWarning(
        `engine switch: no CrossOver found to stop its wineserver for "${bottleName}"`,
        LogPrefix.Steam
      )
      return
    }
    await deps.killWith(
      bottleName,
      join(binDir, 'wineserver'),
      { CX_ROOT: dirname(binDir) },
      KILL_TIMEOUT_MS
    )
    return
  }
  const bin = prev.wineserverBin
  if (bin && !existsSync(bin)) {
    logInfo(
      `engine switch: no wineserver at ${basename(bin)} for "${bottleName}", nothing to stop`,
      LogPrefix.Steam
    )
    return
  }
  const allowed =
    isInside(pinnedEngineRoot(), bin) ||
    isInside(join(toolsPath, 'wine'), bin) ||
    (binDir !== undefined &&
      resolve(bin) === resolve(join(binDir, 'wineserver')))
  if (!allowed) {
    logWarning(
      `engine switch: ignoring marker wineserver outside the engine roots for "${bottleName}"`,
      LogPrefix.Steam
    )
    return
  }
  await deps.killWith(bottleName, bin, { USER: 'crossover' }, KILL_TIMEOUT_MS)
}

/**
 * Where the DXVK DLL list for a restore comes from: the marker's recorded dir, else the pin the
 * bottle was prepared with, else the current pin (downloaded when it is not on disk).
 * `needWine`: the restore runs through the built-in engine (CrossOver unhealthy), so a source
 * with DXVK but no Wine binary (half-installed pin, IN-06) takes its Wine from the pin download.
 */
async function resolveRestoreSource(
  prev: EngineMarker,
  deps: EngineSwitchDeps,
  needWine: boolean
): Promise<NonCrossoverEngine | null> {
  const pin =
    (prev.kind === 'pinned' ? pinById(prev.id) : null) ?? ENGINE_PINS.current
  const installed = isPinnedEngineInstalled(pin) ? pinnedEnginePaths(pin) : null
  if (
    prev.dxvk &&
    prev.dxvk !== 'failed' &&
    existsSync(join(prev.dxvk.dir, 'x64'))
  ) {
    if (installed || !needWine) {
      return {
        wineBin: installed?.wineBin ?? '',
        wineserverBin: installed?.wineserverBin ?? '',
        label: pin.label,
        version: pin.wine.version,
        dxvk: prev.dxvk
      }
    }
    const fetched = await deps.ensurePinEngine(pin)
    if (!fetched) return null
    return { ...fetched, dxvk: prev.dxvk }
  }
  if (installed) {
    return {
      wineBin: installed.wineBin,
      wineserverBin: installed.wineserverBin,
      label: pin.label,
      version: pin.wine.version,
      dxvk: { dir: installed.dxvkDir, version: pin.dxvk.version }
    }
  }
  return deps.ensurePinEngine(pin)
}

/**
 * `deps.ensurePinEngine` is overridable: games.ts passes one that reports download progress
 * through the same engine-download statuses as a launch download.
 */
export function prepareBottleForEngine(
  args: PrepareArgs
): Promise<PrepareResult> {
  // WR-02: one switch per bottle at a time. The legacy shared bottle is already refused before
  // any kill (WR-06); this covers the remaining launch-vs-install interleave on a per-game
  // bottle. A waiting call re-reads the marker in the body, so it never repeats a step.
  const tail = inFlightSwitches.get(args.bottleName)
  if (tail) {
    logInfo(
      `engine switch for "${args.bottleName}" waits for an in-flight switch (WR-02)`,
      LogPrefix.Steam
    )
  }
  const mine: Promise<PrepareResult> = (async () => {
    if (tail) await tail.catch(() => undefined)
    return prepareBottleForEngineBody(args)
  })()
  inFlightSwitches.set(args.bottleName, mine)
  const clear = (): void => {
    if (inFlightSwitches.get(args.bottleName) === mine) {
      inFlightSwitches.delete(args.bottleName)
    }
  }
  mine.then(clear, clear)
  return mine
}

const inFlightSwitches = new Map<string, Promise<PrepareResult>>()

type PrepareArgs = {
  appId: string
  bottleName: string
  next: EngineSelection
  /** False when CrossOver cannot run (expired/missing): the restore then uses the built-in engine. */
  crossoverHealthy?: boolean
  /** Called once when a real engine change is about to start, before any kill or DXVK step. */
  onSwitching?: () => void
  deps?: Partial<EngineSwitchDeps>
}

async function prepareBottleForEngineBody(
  args: PrepareArgs
): Promise<PrepareResult> {
  const { appId, bottleName, next } = args
  const crossoverHealthy = args.crossoverHealthy ?? true
  const deps: EngineSwitchDeps = { ...defaultDeps, ...args.deps }
  const bottleDir = getBottleDir(bottleName)
  if (sanitizeBottleName(bottleName) !== bottleName || !existsSync(bottleDir)) {
    return {
      ok: false,
      reason: 'invalid-bottle',
      detail: `bottle "${bottleName}" is not a valid existing bottle`
    }
  }
  // Never kill a wineserver under a running game (Pitfall 2).
  const phase = deps.getMonitorPhase(appId)
  if (phase !== null) {
    return {
      ok: false,
      reason: 'game-running',
      detail: `a game is ${phase} in bottle "${bottleName}"`
    }
  }

  const dxvkMarkerPath = join(bottleDir, DXVK_VERSION_FILE)

  // Installs the next engine's DXVK. Once the previous wineserver is gone the bottle belongs to
  // `next`, so the marker is written on both outcomes (59-REVIEW WR-09).
  const installNextDxvk = async (
    n: Exclude<EngineSelection, { kind: 'crossover' }>
  ): Promise<PrepareResult> => {
    if (!n.dxvk) {
      writeMarker(bottleDir, markerFor(n))
      return { ok: true, changed: true }
    }
    const ok = await deps.installRemove(
      deps.fallbackSettings(bottleName, n),
      'dxvk',
      'backup',
      n.dxvk
    )
    if (!ok || !existsSync(dxvkMarkerPath)) {
      writeMarker(bottleDir, markerFor(n, 'failed'))
      return {
        ok: false,
        reason: 'dxvk-failed',
        detail: `DXVK install failed for "${bottleName}"`
      }
    }
    writeMarker(
      bottleDir,
      markerFor(n, { dir: n.dxvk.dir, version: n.dxvk.version })
    )
    return { ok: true, changed: true }
  }

  const marker = readMarker(bottleDir)
  const prev = marker ?? inferMarker(bottleDir, deps)
  const nextMarker = markerFor(next)
  if (identityOf(prev) === identityOf(nextMarker)) {
    if (prev.dxvk === 'failed' && next.kind !== 'crossover' && next.dxvk) {
      // The last switch into this engine left DXVK uninstalled: retry, no wineserver kill.
      return installNextDxvk(next)
    }
    if (!marker) writeMarker(bottleDir, nextMarker)
    return { ok: true, changed: false }
  }

  // 59-REVIEW WR-06: a legacy shared bottle holds several titles; switching its engine would
  // kill and rewrite it under the others.
  if (deps.ownBottleName(appId) !== bottleName) {
    return {
      ok: false,
      reason: 'shared-bottle',
      detail: `engine switch refused on shared bottle "${bottleName}" for appId ${appId}`
    }
  }

  // 59-REVIEW WR-05: resolve (and download) the restore source before anything is stopped, so
  // a missing source leaves the bottle and its marker exactly as they were.
  const restoreNeeded =
    next.kind === 'crossover' &&
    (existsSync(dxvkMarkerPath) || prev.dxvk !== undefined)
  let restoreSource: NonCrossoverEngine | null = null
  if (restoreNeeded) {
    restoreSource = await resolveRestoreSource(prev, deps, !crossoverHealthy)
    if (!restoreSource?.dxvk) {
      return {
        ok: false,
        reason: 'dxvk-failed',
        detail: `no DXVK source to restore "${bottleName}"`
      }
    }
  }

  args.onSwitching?.()
  logInfo(
    `engine switch for "${bottleName}": ${identityOf(prev)} -> ${identityOf(nextMarker)}`,
    LogPrefix.Steam
  )
  await killPrevious(bottleName, prev, deps)

  if (next.kind !== 'crossover') return installNextDxvk(next)

  if (restoreNeeded && restoreSource?.dxvk) {
    const source = restoreSource
    const sourceDxvk = restoreSource.dxvk
    // 59-UAT G7: the stock CrossOver settings carry the global winePrefix, not this bottle.
    // 59-UAT G10: every CrossOver wine step on an expired bottle blocks on CodeWeavers'
    // Expired Bottle dialog; the built-in engine never shows it, so an unhealthy CrossOver
    // restores through the built-in engine and stops that wineserver afterwards.
    let settings: GameSettings
    if (crossoverHealthy) {
      // 59-01 measurement: healthy CrossOver removed Staging-installed DXVK cleanly.
      settings = { ...deps.crossoverSettings(appId), winePrefix: bottleDir }
    } else {
      if (!source.wineBin || !source.wineserverBin) {
        return {
          ok: false,
          reason: 'dxvk-failed',
          detail: `no built-in engine to restore "${bottleName}" while CrossOver is unavailable`
        }
      }
      settings = {
        ...deps.fallbackSettings(bottleName, source),
        winePrefix: bottleDir
      }
    }
    const ok = await deps.installRemove(settings, 'dxvk', 'restore', sourceDxvk)
    if (crossoverHealthy) {
      // G30: the restore now returns while its CrossOver wineserver lingers, and the next
      // launch may run on a different runner (overlay clone, 60-RESEARCH Pitfall 2), so stop
      // it once, on both outcomes.
      const binDir = await deps.resolveCrossoverBinDir()
      if (binDir) {
        await deps.killWith(
          bottleName,
          join(binDir, 'wineserver'),
          { CX_ROOT: dirname(binDir) },
          KILL_TIMEOUT_MS
        )
        logInfo(
          `engine switch: stopped the restore's CrossOver wineserver for "${bottleName}"`,
          LogPrefix.Steam
        )
      } else {
        logWarning(
          `engine switch: no CrossOver found to stop the restore's wineserver for "${bottleName}"`,
          LogPrefix.Steam
        )
      }
    } else {
      await deps.killWith(
        bottleName,
        source.wineserverBin,
        { USER: 'crossover' },
        KILL_TIMEOUT_MS
      )
    }
    if (!ok || existsSync(dxvkMarkerPath)) {
      // CR-03: the restore may have deleted DLLs/overrides before failing; record that so the
      // next launch on either engine repairs the bottle instead of reporting changed:false.
      if (prev.kind !== 'crossover') {
        writeMarker(bottleDir, { ...prev, dxvk: 'failed' })
      }
      return {
        ok: false,
        reason: 'dxvk-failed',
        detail: `DXVK removal failed for "${bottleName}"`
      }
    }
  }

  writeMarker(bottleDir, nextMarker)
  return { ok: true, changed: true }
}
