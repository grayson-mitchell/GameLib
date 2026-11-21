/**
 * Switching a bridge bottle between engines (phase 59, D-07).
 *
 * Two engines must never share a live wineserver for one prefix, and DXVK must match the engine
 * that is about to run: installed for a non-CrossOver engine, removed before CrossOver runs (a
 * CrossOver bottle carries its own graphics stack). The engine that last prepared a bottle is
 * recorded in `<bottle>/.gamelib-engine.json`, versioned by the Phase 68 store engine (quick
 * 261109-w52, Phase 85 D-17); a marker written by a newer build is never overwritten. Rust decides
 * that (`store_version_gate`, see backend/stores/bottleVersionGate.ts): the async entry points ask it
 * first and the synchronous marker writers read the answer back.
 *
 * Nothing runs at import and there are no timers (sidecar exit contract).
 */
import type { OnlineMonitor } from 'backend/online_monitor'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import type { AppPaths } from 'backend/process/context'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { EngineServices } from './engineServices'
import type { GameSettings } from 'common/types'
import type { ProcessRunner } from 'backend/process/types'
import type { Tools } from 'backend/tools'
import {
  buildFallbackGameSettings,
  getBottleDir,
  killBottleWineServerWith,
  sanitizeBottleName
} from './bottlePrimitives'
import type { BottleLedger } from './bottleLedger'
import { ENGINE_PINS, pinById } from './enginePins'
import type { EnginePin } from './enginePins'
import type { FallbackEngine } from './fallbackEngine'
import type { EngineSelection, NonCrossoverEngine } from './engineTypes'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  BOTTLE_FILE_VERSION,
  ENGINE_MARKER_CHAIN,
  gateAllowsWrite
} from 'backend/stores/bottleVersionGate'
import type { BottleVersionGate } from 'backend/stores/bottleVersionGate'

export const ENGINE_MARKER_FILE = '.gamelib-engine.json'

const markerPath = (bottleDir: string): string =>
  join(bottleDir, ENGINE_MARKER_FILE)

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

/** What the switch reads from the boot: paths, the pinned-engine owner and the running-games ledger. */
export interface EngineSwitchContext {
  paths: Pick<AppPaths, 'userHome' | 'toolsPath'>
  fallback: Pick<
    FallbackEngine,
    | 'pinnedEngineRoot'
    | 'pinnedEnginePaths'
    | 'isPinnedEngineInstalled'
    | 'ensurePinnedEngine'
  >
  ledger: Pick<BottleLedger, 'otherGamesRunning'>
  /** The sidecar -> Rust transport: the bottle marker's version gate asks Rust (D-17). */
  requestRustInvoke: RustInvokeDeps['requestRustInvoke']
  /** The engine runtime's memo of the gate's answers, read by the synchronous marker writers. */
  bottleGate: BottleVersionGate
}

export interface EngineSwitchDeps {
  ctx: EngineSwitchContext
  getMonitorPhase: (key: string) => 'starting' | 'running' | null
  killWith: (
    ...args: Parameters<typeof killBottleWineServerWith> extends [
      unknown,
      ...infer R
    ]
      ? R
      : never
  ) => ReturnType<typeof killBottleWineServerWith>
  resolveCrossoverBinDir: () => Promise<string | undefined>
  installRemove: Tools['DXVK']['installRemove']
  /** Must be called while the CrossOver selection is the one registered for the game. */
  crossoverSettings: (key: string) => GameSettings
  fallbackSettings: (
    bottleName: string,
    engine: NonCrossoverEngine
  ) => GameSettings
  currentPinEngine: () => NonCrossoverEngine | null
  /** Makes a pinned engine available (downloads it when absent); null when that fails. */
  ensurePinEngine: (pin: EnginePin) => Promise<NonCrossoverEngine | null>
  /**
   * The title's own per-game bottle name (59-REVIEW WR-06). Supplied by Steam only; when absent
   * the shared-bottle refusal does not apply and an idle shared bottle may switch (D-16).
   */
  ownBottleName?: (key: string) => string | null
}

type PrepareResult =
  | { ok: true; changed: boolean }
  | {
      ok: false
      reason:
        | 'game-running'
        | 'dxvk-failed'
        | 'invalid-bottle'
        | 'shared-bottle'
        | 'bottle-busy'
        // the bottle's marker was written by a newer GameLib build (quick 261109-w52)
        | 'marker-newer'
      detail: string
    }

function defaultCurrentPinEngine(
  ctx: Pick<EngineSwitchContext, 'fallback'>
): NonCrossoverEngine | null {
  const pin = pinById(ENGINE_PINS.current.id)
  if (!pin || !ctx.fallback.isPinnedEngineInstalled(pin)) return null
  const p = ctx.fallback.pinnedEnginePaths(pin)
  return {
    wineBin: p.wineBin,
    wineserverBin: p.wineserverBin,
    label: pin.label,
    version: pin.wine.version,
    dxvk: { dir: p.dxvkDir, version: pin.dxvk.version }
  }
}

async function ensurePinEngineVia(
  ctx: EngineSwitchContext,
  runner: Pick<ProcessRunner, 'run'>,
  onlineMonitor: Pick<OnlineMonitor, 'isOnline'>,
  pin: EnginePin
): Promise<NonCrossoverEngine | null> {
  const res = await ctx.fallback.ensurePinnedEngine(pin, {
    runner,
    onlineMonitor
  })
  if (!res.ok) return null
  return {
    wineBin: res.paths.wineBin,
    wineserverBin: res.paths.wineserverBin,
    label: pin.label,
    version: pin.wine.version,
    dxvk: { dir: res.paths.dxvkDir, version: pin.dxvk.version }
  }
}

/** The kill and DXVK restore members of a switch, built from the injected engine services (66.1-22f). */
export function switchServicesFrom(
  services: Pick<
    EngineServices,
    | 'paths'
    | 'engineRuntime'
    | 'runner'
    | 'spawnAsync'
    | 'installRemove'
    | 'onlineMonitor'
    | 'globalGameSettings'
  >
): Pick<
  EngineSwitchDeps,
  | 'ctx'
  | 'killWith'
  | 'installRemove'
  | 'resolveCrossoverBinDir'
  | 'ensurePinEngine'
  | 'fallbackSettings'
> {
  const ctx = switchContextFrom(services)
  return {
    ctx,
    resolveCrossoverBinDir: () =>
      services.engineRuntime.crossover.resolveCrossoverBinDirAsync({
        runner: services.runner
      }),
    killWith: (...a) =>
      killBottleWineServerWith(
        { spawnAsync: services.spawnAsync, paths: services.paths },
        ...a
      ),
    installRemove: services.installRemove,
    ensurePinEngine: (pin) =>
      ensurePinEngineVia(ctx, services.runner, services.onlineMonitor, pin),
    fallbackSettings: (bottleName, engine) =>
      buildFallbackGameSettings(
        services.paths,
        bottleName,
        engine,
        services.globalGameSettings()
      )
  }
}

/** The switch's boot collaborators, read from the engine services. */
export function switchContextFrom(
  services: Pick<EngineServices, 'paths' | 'engineRuntime'>
): EngineSwitchContext {
  return {
    paths: services.paths,
    requestRustInvoke: services.engineRuntime.requestRustInvoke,
    bottleGate: services.engineRuntime.bottleGate,
    fallback: services.engineRuntime.fallback,
    ledger: services.engineRuntime.ledger
  }
}

/** Everything except what the caller supplies: `crossoverSettings` (store-specific) and the services-built `killWith`/`installRemove`. */
const defaultDeps = (
  ctx: EngineSwitchContext
): Omit<
  EngineSwitchDeps,
  | 'ctx'
  | 'crossoverSettings'
  | 'killWith'
  | 'installRemove'
  | 'resolveCrossoverBinDir'
  | 'ensurePinEngine'
  | 'fallbackSettings'
> => ({
  getMonitorPhase: () => null,
  currentPinEngine: () => defaultCurrentPinEngine(ctx)
})

function isInside(root: string, path: string): boolean {
  if (!isAbsolute(path)) return false
  const rel = relative(resolve(root), resolve(path))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * G22 (59-38): read-only view of the bottle's engine marker for the launch path. Never writes a
 * marker; null for an absent/unreadable marker or an unsafe bottle name. A crossover marker
 * contradicted by DXVK-macOS reads as the pin, as the switch treats it (76 review WR-01).
 */
export function readBottleEngineMarkerKind(
  ctx: Pick<EngineSwitchContext, 'paths' | 'fallback'>,
  bottleName: string
): 'crossover' | 'non-crossover' | null {
  try {
    if (sanitizeBottleName(bottleName) !== bottleName) return null
    const marker = viewMarker(getBottleDir(ctx.paths, bottleName), ctx)
    if (!marker) return null
    return marker.kind === 'crossover' ? 'crossover' : 'non-crossover'
  } catch {
    return null
  }
}

/**
 * WR-01: read-only marker kind plus the pin id (null unless a pinned marker). Same contract as
 * readBottleEngineMarkerKind: never infers or writes a marker.
 */
export function readBottleEngineMarkerSummary(
  ctx: Pick<EngineSwitchContext, 'paths' | 'fallback'>,
  bottleName: string
): {
  kind: 'crossover' | 'non-crossover'
  pinId: string | null
  /** The recorded Wine Manager version (id already regex-validated), else null. */
  wineManagerVersion: string | null
  /**
   * A pinned marker's recorded wineserver, only when it is inside the pinned-engine
   * root and named `wineserver` (T-59-60 pattern); else null.
   */
  pinWineserverBin: string | null
} | null {
  try {
    if (sanitizeBottleName(bottleName) !== bottleName) return null
    const marker = viewMarker(getBottleDir(ctx.paths, bottleName), ctx)
    if (!marker) return null
    const pinWineserverBin =
      marker.kind === 'pinned' &&
      typeof marker.wineserverBin === 'string' &&
      isInside(ctx.fallback.pinnedEngineRoot(), marker.wineserverBin) &&
      basename(marker.wineserverBin) === 'wineserver'
        ? marker.wineserverBin
        : null
    return {
      kind: marker.kind === 'crossover' ? 'crossover' : 'non-crossover',
      pinId: marker.kind === 'pinned' ? marker.id : null,
      wineManagerVersion: marker.kind === 'wine-manager' ? marker.id : null,
      pinWineserverBin
    }
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
export function restoreNeedsAbsentPin(
  ctx: Pick<EngineSwitchContext, 'paths' | 'fallback'>,
  bottleName: string
): boolean {
  try {
    if (sanitizeBottleName(bottleName) !== bottleName) return false
    const bottleDir = getBottleDir(ctx.paths, bottleName)
    const prev = viewMarker(bottleDir, ctx)
    if (!prev || prev.kind === 'crossover') return false
    const restoreNeeded =
      existsSync(join(bottleDir, DXVK_VERSION_FILE)) || prev.dxvk !== undefined
    if (!restoreNeeded) return false
    const pin =
      (prev.kind === 'pinned' ? pinById(prev.id) : null) ?? ENGINE_PINS.current
    if (ctx.fallback.isPinnedEngineInstalled(pin)) return false
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

function readMarker(
  bottleDir: string,
  ctx: Pick<EngineSwitchContext, 'fallback'>
): EngineMarker | null {
  try {
    const raw = JSON.parse(
      readFileSync(markerPath(bottleDir), 'utf8')
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
        isInside(ctx.fallback.pinnedEngineRoot(), dir) &&
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

function writeMarker(
  ctx: Pick<EngineSwitchContext, 'bottleGate'>,
  bottleDir: string,
  marker: EngineMarker
): boolean {
  const tmp = join(bottleDir, `${ENGINE_MARKER_FILE}.tmp-${process.pid}`)
  try {
    const gate = ctx.bottleGate.state(markerPath(bottleDir))
    if (!gateAllowsWrite(gate)) {
      logWarning(
        gate === undefined
          ? 'engine marker version gate was not asked first; not overwriting a marker that may be from a newer GameLib build'
          : 'engine marker is from a newer GameLib build; not overwriting it',
        LogPrefix.Backend
      )
      return false
    }
    writeFileSync(
      tmp,
      JSON.stringify({ ...marker, version: BOTTLE_FILE_VERSION }),
      { mode: 0o644 }
    )
    renameSync(tmp, markerPath(bottleDir))
    return true
  } catch (err) {
    rmSync(tmp, { force: true })
    logWarning(['engine marker write failed', err], LogPrefix.Backend)
    return false
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

/**
 * DXVK-macOS (`current_dxvk-macOS`) is installed only by non-CrossOver paths (createFallbackBottle,
 * the switch's installNextDxvk, launcher autoInstallDxvk gated on a non-CrossOver wine), and every
 * switch to CrossOver removes it. A bottle that carries it was set up by a non-CrossOver engine
 * (76-VERIFICATION CR-01).
 */
function hasStagingDxvk(bottleDir: string): boolean {
  return existsSync(join(bottleDir, DXVK_VERSION_FILE))
}

/**
 * Without a trusted marker: DXVK-macOS in the bottle means a non-CrossOver engine set it up
 * (CrossOver's own probe adds a Timestamp, 76 CR-01); otherwise a conf Timestamp means CrossOver;
 * otherwise the pin. CrossOver's template create() always writes a Timestamp, so a conf without
 * one was written by GameLib's own writeCxbottleConf.
 */
function inferMarker(
  bottleDir: string,
  currentPinEngine: () => NonCrossoverEngine | null
): EngineMarker {
  const pinned = (): EngineMarker => ({
    kind: 'pinned',
    id: ENGINE_PINS.current.id,
    wineserverBin: currentPinEngine()?.wineserverBin ?? ''
  })
  if (hasStagingDxvk(bottleDir)) return pinned()
  let conf = ''
  try {
    conf = readFileSync(join(bottleDir, 'cxbottle.conf'), 'utf8')
  } catch {
    // no conf: treated as the pin below
  }
  if (/Timestamp/.test(conf)) {
    return { kind: 'crossover', id: 'crossover', wineserverBin: '' }
  }
  return pinned()
}

/** A crossover marker contradicted by DXVK-macOS in the bottle (76 CR-01). */
function isContradictedCrossover(
  bottleDir: string,
  marker: EngineMarker | null
): boolean {
  return marker?.kind === 'crossover' && hasStagingDxvk(bottleDir)
}

/**
 * 76 review WR-01: the marker as the switch sees it, for the read-only views, without logging.
 * A contradicted crossover marker reads as the pinned marker inferMarker would give (DXVK-macOS
 * always infers the current pin). Its wineserver is left empty: the views never use it to act.
 */
function viewMarker(
  bottleDir: string,
  ctx: Pick<EngineSwitchContext, 'fallback'>
): EngineMarker | null {
  const marker = readMarker(bottleDir, ctx)
  if (isContradictedCrossover(bottleDir, marker)) {
    return { kind: 'pinned', id: ENGINE_PINS.current.id, wineserverBin: '' }
  }
  return marker
}

/** A crossover marker contradicted by DXVK-macOS in the bottle is not trusted (76 CR-01). */
function trustedMarker(
  bottleDir: string,
  bottleName: string,
  marker: EngineMarker | null
): EngineMarker | null {
  if (isContradictedCrossover(bottleDir, marker)) {
    logWarning(
      `engine marker for "${bottleName}" says crossover but DXVK-macOS is installed; treating it as inferred (76 CR-01)`,
      LogPrefix.Backend
    )
    return null
  }
  return marker
}

/** What a marker write needs: the bottle paths, the pin owner and the gate (transport plus memo). */
type MarkerCtx = Pick<
  EngineSwitchContext,
  'paths' | 'fallback' | 'requestRustInvoke' | 'bottleGate'
>

/**
 * Asks Rust whether the bottle's marker may be rewritten and remembers the answer for the
 * synchronous writers below. Every async entry that can reach `writeMarker` calls this first.
 */
async function primeMarkerGate(
  ctx: Pick<EngineSwitchContext, 'requestRustInvoke' | 'bottleGate'>,
  bottleDir: string
): Promise<void> {
  await ctx.bottleGate.prime(ctx, markerPath(bottleDir), ENGINE_MARKER_CHAIN)
}

/** False for a marker a newer build wrote, and for one whose gate nobody primed. */
function markerGateAllows(
  ctx: Pick<EngineSwitchContext, 'bottleGate'>,
  bottleDir: string
): boolean {
  return gateAllowsWrite(ctx.bottleGate.state(markerPath(bottleDir)))
}

/**
 * 76 gap (CR-01): persist the bottle's engine before any CrossOver probe touches cxbottle.conf.
 * Writes only for a provisioned bottle whose marker is missing or contradicted by DXVK-macOS.
 */
export async function reconcileBottleEngineMarker(
  ctx: MarkerCtx,
  bottleName: string
): Promise<'crossover' | 'pinned' | null> {
  try {
    if (sanitizeBottleName(bottleName) !== bottleName) return null
    const bottleDir = getBottleDir(ctx.paths, bottleName)
    if (!existsSync(join(bottleDir, 'cxbottle.conf'))) return null
    await primeMarkerGate(ctx, bottleDir)
    if (!markerGateAllows(ctx, bottleDir)) return null
    const marker = readMarker(bottleDir, ctx)
    if (trustedMarker(bottleDir, bottleName, marker)) return null
    const inferred = inferMarker(bottleDir, () => defaultCurrentPinEngine(ctx))
    if (!writeMarker(ctx, bottleDir, inferred)) return null
    logInfo(
      `engine marker for "${bottleName}" reconciled before the CrossOver pre-flight: ${identityOf(inferred)} (${marker ? 'crossover marker contradicted by DXVK-macOS' : 'missing'})`,
      LogPrefix.Backend
    )
    return inferred.kind === 'crossover' ? 'crossover' : 'pinned'
  } catch {
    return null
  }
}

async function markerWritable(
  ctx: MarkerCtx,
  bottleName: string
): Promise<{ bottleDir: string } | null> {
  if (sanitizeBottleName(bottleName) !== bottleName) return null
  const bottleDir = getBottleDir(ctx.paths, bottleName)
  if (!existsSync(bottleDir)) return null
  await primeMarkerGate(ctx, bottleDir)
  if (!markerGateAllows(ctx, bottleDir)) return null
  return { bottleDir }
}

/**
 * 76 gap (CR-01): the marker a pinned-engine bottle gets at creation, so it is never marker-less
 * when CrossOver's probe later adds a Timestamp.
 */
export async function recordPinnedBottleEngine(
  ctx: MarkerCtx,
  bottleName: string,
  pinId: string,
  engine: NonCrossoverEngine
): Promise<boolean> {
  try {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(pinId)) return false
    const target = await markerWritable(ctx, bottleName)
    if (!target) return false
    const marker: EngineMarker = {
      kind: 'pinned',
      id: pinId,
      wineserverBin: engine.wineserverBin
    }
    if (engine.dxvk && hasStagingDxvk(target.bottleDir)) {
      marker.dxvk = { dir: engine.dxvk.dir, version: engine.dxvk.version }
    }
    if (!writeMarker(ctx, target.bottleDir, marker)) return false
    logInfo(
      `engine marker for "${bottleName}" recorded at creation: pinned:${pinId}`,
      LogPrefix.Backend
    )
    return true
  } catch {
    return false
  }
}

/** D-07a: the marker a CrossOver-created bridge bottle gets at creation. */
export async function recordCrossoverBottleEngine(
  ctx: MarkerCtx,
  bottleName: string,
  binDir: string
): Promise<boolean> {
  try {
    const target = await markerWritable(ctx, bottleName)
    if (!target) return false
    const written = writeMarker(
      ctx,
      target.bottleDir,
      markerForBase({
        kind: 'crossover',
        reason: 'cx-healthy',
        crossoverBuild: null,
        binDir
      })
    )
    if (!written) return false
    logInfo(
      `engine marker for "${bottleName}" recorded at creation: crossover`,
      LogPrefix.Backend
    )
    return true
  } catch {
    return false
  }
}

/**
 * 76 review WR-02: a pinned marker with no recorded wineserver (inferred or reconciled while the
 * pin was not installed) resolves it from the marker's pin, else the current pin, once installed.
 */
function pinnedWineserverFallback(
  prev: EngineMarker,
  deps: EngineSwitchDeps
): string {
  if (prev.kind !== 'pinned') return ''
  const pin = pinById(prev.id) ?? ENGINE_PINS.current
  if (!deps.ctx.fallback.isPinnedEngineInstalled(pin)) return ''
  return deps.ctx.fallback.pinnedEnginePaths(pin).wineserverBin
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
        LogPrefix.Backend
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
  const bin = prev.wineserverBin || pinnedWineserverFallback(prev, deps)
  if (bin && !existsSync(bin)) {
    logInfo(
      `engine switch: no wineserver at ${basename(bin)} for "${bottleName}", nothing to stop`,
      LogPrefix.Backend
    )
    return
  }
  const allowed =
    isInside(deps.ctx.fallback.pinnedEngineRoot(), bin) ||
    isInside(join(deps.ctx.paths.toolsPath, 'wine'), bin) ||
    (binDir !== undefined &&
      resolve(bin) === resolve(join(binDir, 'wineserver')))
  if (!allowed) {
    logWarning(
      `engine switch: ignoring marker wineserver outside the engine roots for "${bottleName}"`,
      LogPrefix.Backend
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
  const installed = deps.ctx.fallback.isPinnedEngineInstalled(pin)
    ? deps.ctx.fallback.pinnedEnginePaths(pin)
    : null
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
export interface EngineSwitcher {
  prepareBottleForEngine: (args: PrepareArgs) => Promise<PrepareResult>
}

/**
 * One switcher per boot: the per-bottle in-flight map is closure state, so concurrent switches of
 * one bottle through this instance serialise; two instances share nothing (66.4-05).
 */
export function createEngineSwitcher(): EngineSwitcher {
  const inFlightSwitches = new Map<string, Promise<PrepareResult>>()

  function prepareBottleForEngine(args: PrepareArgs): Promise<PrepareResult> {
    // WR-02: one switch per bottle at a time. The legacy shared bottle is already refused before
    // any kill (WR-06); this covers the remaining launch-vs-install interleave on a per-game
    // bottle. A waiting call re-reads the marker in the body, so it never repeats a step.
    const tail = inFlightSwitches.get(args.bottleName)
    if (tail) {
      logInfo(
        `engine switch for "${args.bottleName}" waits for an in-flight switch (WR-02)`,
        LogPrefix.Backend
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

  return { prepareBottleForEngine }
}

type PrepareArgs = {
  key: string
  bottleName: string
  next: EngineSelection
  /** False when CrossOver cannot run (expired/missing): the restore then uses the built-in engine. */
  crossoverHealthy?: boolean
  /** Called once when a real engine change is about to start, before any kill or DXVK step. */
  onSwitching?: () => void
  deps: Partial<EngineSwitchDeps> &
    Pick<
      EngineSwitchDeps,
      | 'ctx'
      | 'crossoverSettings'
      | 'killWith'
      | 'installRemove'
      | 'resolveCrossoverBinDir'
      | 'ensurePinEngine'
      | 'fallbackSettings'
    >
}

async function prepareBottleForEngineBody(
  args: PrepareArgs
): Promise<PrepareResult> {
  const { key, bottleName, next } = args
  const crossoverHealthy = args.crossoverHealthy ?? true
  const deps: EngineSwitchDeps = {
    ...defaultDeps(args.deps.ctx),
    ...args.deps
  }
  // D-16: another game (any store) running in this bottle. Checked before any kill or rewrite.
  const busyRefusal = (): PrepareResult | null => {
    if (deps.ctx.ledger.otherGamesRunning(bottleName, key).length === 0)
      return null
    return {
      ok: false,
      reason: 'bottle-busy',
      detail: `another game is running in bottle "${bottleName}"`
    }
  }
  const bottleDir = getBottleDir(deps.ctx.paths, bottleName)
  if (sanitizeBottleName(bottleName) !== bottleName || !existsSync(bottleDir)) {
    return {
      ok: false,
      reason: 'invalid-bottle',
      detail: `bottle "${bottleName}" is not a valid existing bottle`
    }
  }
  // Never kill a wineserver under a running game (Pitfall 2).
  const phase = deps.getMonitorPhase(key)
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
      writeMarker(deps.ctx, bottleDir, markerFor(n))
      return { ok: true, changed: true }
    }
    const ok = await deps.installRemove(
      deps.fallbackSettings(bottleName, n),
      'dxvk',
      'backup',
      n.dxvk
    )
    if (!ok || !existsSync(dxvkMarkerPath)) {
      writeMarker(deps.ctx, bottleDir, markerFor(n, 'failed'))
      return {
        ok: false,
        reason: 'dxvk-failed',
        detail: `DXVK install failed for "${bottleName}"`
      }
    }
    writeMarker(
      deps.ctx,
      bottleDir,
      markerFor(n, { dir: n.dxvk.dir, version: n.dxvk.version })
    )
    return { ok: true, changed: true }
  }

  // Ask Rust before anything below can write the marker (D-17): the writers are synchronous and
  // read the answer back. A gate that cannot be asked is treated as a newer marker.
  await primeMarkerGate(deps.ctx, bottleDir)
  const marker = readMarker(bottleDir, deps.ctx)
  // Quick 261109-w52: a marker from a newer build is never inferred over or overwritten
  // (inferMarker would guess prev without the recorded DXVK dir, and the final write would
  // replace the only record). Same-engine launches proceed; every real change is refused.
  if (!markerGateAllows(deps.ctx, bottleDir)) {
    if (
      marker &&
      identityOf(marker) === identityOf(markerFor(next)) &&
      !(marker.dxvk === 'failed' && next.kind !== 'crossover' && next.dxvk)
    ) {
      return { ok: true, changed: false }
    }
    logWarning(
      `engine marker for "${bottleName}" is from a newer GameLib build; refusing engine change`,
      LogPrefix.Backend
    )
    return {
      ok: false,
      reason: 'marker-newer',
      detail: `bottle "${bottleName}" engine marker was written by a newer GameLib build`
    }
  }
  const known = trustedMarker(bottleDir, bottleName, marker)
  const prev = known ?? inferMarker(bottleDir, deps.currentPinEngine)
  const nextMarker = markerFor(next)
  if (identityOf(prev) === identityOf(nextMarker)) {
    if (prev.dxvk === 'failed' && next.kind !== 'crossover' && next.dxvk) {
      // The last switch into this engine left DXVK uninstalled: retry, no wineserver kill.
      return busyRefusal() ?? installNextDxvk(next)
    }
    if (!known) writeMarker(deps.ctx, bottleDir, nextMarker)
    return { ok: true, changed: false }
  }

  // D-16: a real engine change kills the bottle's wineserver and rewrites DXVK, so it never
  // happens under another running game of any store. Same-engine launches returned above.
  const busy = busyRefusal()
  if (busy) return busy

  // 59-REVIEW WR-06: a Steam title in the legacy shared bottle holds several titles; switching
  // its engine would kill and rewrite it under the others. Stores without an own-bottle notion
  // skip this; their idle shared bottle switches (D-16).
  if (deps.ownBottleName && deps.ownBottleName(key) !== bottleName) {
    return {
      ok: false,
      reason: 'shared-bottle',
      detail: `engine switch refused on shared bottle "${bottleName}" for ${key}`
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
    LogPrefix.Backend
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
      settings = { ...deps.crossoverSettings(key), winePrefix: bottleDir }
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
          LogPrefix.Backend
        )
      } else {
        logWarning(
          `engine switch: no CrossOver found to stop the restore's wineserver for "${bottleName}"`,
          LogPrefix.Backend
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
        writeMarker(deps.ctx, bottleDir, { ...prev, dxvk: 'failed' })
      }
      return {
        ok: false,
        reason: 'dxvk-failed',
        detail: `DXVK removal failed for "${bottleName}"`
      }
    }
  }

  writeMarker(deps.ctx, bottleDir, nextMarker)
  return { ok: true, changed: true }
}
