/**
 * Session-scoped engine registry (phase 59, D-07).
 *
 * Mirrors the `drmBridgeRunners` precedent in bottle.ts: the engine chosen for
 * a title lives only in this in-memory map, is set per launch by the launch
 * path (59-10) and cleared when the game stops (monitor onStopped), on the
 * launch deadline path and on the launch-error path. Nothing is persisted, so
 * falling back is never stored state. The map is empty at module load (sidecar
 * exit contract).
 */
import { existsSync } from 'graceful-fs'
import { logInfo, LogPrefix } from 'backend/logger'
import { engineLogLabel, isNonCrossover } from './engineTypes'
import type { EngineSelection } from './engineTypes'

const engineSelections = new Map<string, EngineSelection>()

export function setEngineSelection(
  appId: string,
  sel: EngineSelection
): boolean {
  if (!/^[0-9]{1,10}$/.test(String(appId))) return false
  let copy: EngineSelection
  if (isNonCrossover(sel)) {
    if (!existsSync(sel.wineBin) || !existsSync(sel.wineserverBin)) {
      return false
    }
    copy = { ...sel, dxvk: sel.dxvk ? { ...sel.dxvk } : null }
  } else {
    copy = { ...sel }
  }
  engineSelections.set(appId, copy)
  logInfo(
    `SteamEngine: appId ${appId} uses ${engineLogLabel(copy)}`,
    LogPrefix.Steam
  )
  return true
}

export function getEngineSelection(appId: string): EngineSelection | undefined {
  return engineSelections.get(appId)
}

export function clearEngineSelection(appId: string): void {
  engineSelections.delete(appId)
}
