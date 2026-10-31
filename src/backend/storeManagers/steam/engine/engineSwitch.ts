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
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { toolsPath } from 'backend/constants/paths'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { GameSettings } from 'common/types'
import { DXVK } from 'backend/tools'
import {
  buildFallbackGameSettings,
  getBottleDir,
  getBridgeBottleSettings,
  killBottleWineServerWith,
  sanitizeBottleName
} from '../bottle'
import { getBottleProcessMonitorPhase } from '../bottleProcessMonitor'
import { resolveCrossoverBinDirAsync } from '../crossoverLocation'
import { steamBottleConfigStore } from '../electronStores'
import { ENGINE_PINS, pinById } from './enginePins'
import {
  isPinnedEngineInstalled,
  pinnedEnginePaths,
  pinnedEngineRoot
} from './fallbackEngine'
import type { EngineSelection, NonCrossoverEngine } from './engineTypes'

export const ENGINE_MARKER_FILE = '.gamelib-engine.json'

const DXVK_VERSION_FILE = 'current_dxvk-macOS'
const KILL_TIMEOUT_MS = 15_000

/**
 * Which engine runs the DXVK restore when moving back to CrossOver. Recorded by the wave 0
 * probe in 59-01-SUMMARY.md (`dxvk_restore_engine: crossover`, `dxvk_restore_clean: yes`):
 * CrossOver removed Staging-installed DXVK cleanly and the bottle booted afterwards.
 */
const DXVK_RESTORE_ENGINE: 'crossover' | 'staging' = 'crossover'
const restoreEngine = (): 'crossover' | 'staging' => DXVK_RESTORE_ENGINE

type MarkerKind = 'crossover' | 'pinned' | 'wine-manager'
type EngineMarker = { kind: MarkerKind; id: string; wineserverBin: string }

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
}

export type PrepareResult =
  | { ok: true; changed: boolean }
  | {
      ok: false
      reason: 'game-running' | 'dxvk-failed' | 'invalid-bottle'
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

const defaultDeps: EngineSwitchDeps = {
  getMonitorPhase: getBottleProcessMonitorPhase,
  killWith: killBottleWineServerWith,
  resolveCrossoverBinDir: () => {
    const bin = steamBottleConfigStore.get_nodefault('wineVersion')?.bin
    return resolveCrossoverBinDirAsync({ hintWineBins: bin ? [bin] : [] })
  },
  installRemove: (...args) => DXVK.installRemove(...args),
  crossoverSettings: getBridgeBottleSettings,
  fallbackSettings: buildFallbackGameSettings,
  currentPinEngine: defaultCurrentPinEngine
}

function isInside(root: string, path: string): boolean {
  if (!isAbsolute(path)) return false
  const rel = relative(resolve(root), resolve(path))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
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
    return {
      kind: raw.kind as MarkerKind,
      id: raw.id,
      wineserverBin: raw.wineserverBin
    }
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

function markerFor(next: EngineSelection): EngineMarker {
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

export async function prepareBottleForEngine(args: {
  appId: string
  bottleName: string
  next: EngineSelection
  deps?: Partial<EngineSwitchDeps>
}): Promise<PrepareResult> {
  const { appId, bottleName, next } = args
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

  const marker = readMarker(bottleDir)
  const prev = marker ?? inferMarker(bottleDir, deps)
  const nextMarker = markerFor(next)
  if (identityOf(prev) === identityOf(nextMarker)) {
    if (!marker) writeMarker(bottleDir, nextMarker)
    return { ok: true, changed: false }
  }

  logInfo(
    `engine switch for "${bottleName}": ${identityOf(prev)} -> ${identityOf(nextMarker)}`,
    LogPrefix.Steam
  )
  await killPrevious(bottleName, prev, deps)

  const dxvkMarkerPath = join(bottleDir, DXVK_VERSION_FILE)
  if (next.kind !== 'crossover') {
    if (next.dxvk) {
      const ok = await deps.installRemove(
        deps.fallbackSettings(bottleName, next),
        'dxvk',
        'backup',
        next.dxvk
      )
      if (!ok || !existsSync(dxvkMarkerPath)) {
        return {
          ok: false,
          reason: 'dxvk-failed',
          detail: `DXVK install failed for "${bottleName}"`
        }
      }
    }
  } else if (existsSync(dxvkMarkerPath)) {
    const pin = deps.currentPinEngine()
    // installRemove needs the DLL list, which only a DXVK source dir can supply.
    if (!pin?.dxvk) {
      logWarning(
        `engine switch: no DXVK source to restore from for "${bottleName}"; leaving DXVK in place`,
        LogPrefix.Steam
      )
    } else {
      const settings =
        restoreEngine() === 'staging'
          ? deps.fallbackSettings(bottleName, pin)
          : deps.crossoverSettings(appId)
      const ok = await deps.installRemove(settings, 'dxvk', 'restore', pin.dxvk)
      if (!ok) {
        return {
          ok: false,
          reason: 'dxvk-failed',
          detail: `DXVK removal failed for "${bottleName}"`
        }
      }
    }
  }

  writeMarker(bottleDir, nextMarker)
  return { ok: true, changed: true }
}
