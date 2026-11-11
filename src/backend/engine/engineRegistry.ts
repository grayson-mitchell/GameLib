/**
 * Session-scoped engine registry (phase 59, D-07).
 *
 * Mirrors the `drmBridgeRunners` precedent in bottle.ts: the engine chosen for
 * a title lives only in this in-memory map (one per boot, 66.4-05), is set per launch by the launch
 * path (59-10) and cleared when the game stops (monitor onStopped), on the
 * launch deadline path and on the launch-error path. Nothing is persisted, so
 * falling back is never stored state. The map is empty at construction (sidecar
 * exit contract).
 */
import { existsSync } from 'graceful-fs'
import { logInfo, LogPrefix } from 'backend/logger'
import { isEngineKey } from './gameKey'
import { engineLogLabel, isNonCrossover } from './engineTypes'
import type { EngineSelection } from './engineTypes'

export interface EngineRegistry {
  setEngineSelection: (key: string, sel: EngineSelection) => boolean
  getEngineSelection: (key: string) => EngineSelection | undefined
  clearEngineSelection: (key: string) => void
}

export function createEngineRegistry(): EngineRegistry {
  const engineSelections = new Map<string, EngineSelection>()
  return {
    setEngineSelection(key, sel) {
      if (!isEngineKey(key)) return false
      let copy: EngineSelection
      if (isNonCrossover(sel)) {
        if (!existsSync(sel.wineBin) || !existsSync(sel.wineserverBin)) {
          return false
        }
        copy = { ...sel, dxvk: sel.dxvk ? { ...sel.dxvk } : null }
      } else {
        copy = { ...sel }
      }
      engineSelections.set(key, copy)
      logInfo(`Engine: ${key} uses ${engineLogLabel(copy)}`, LogPrefix.Backend)
      return true
    },
    getEngineSelection: (key) => engineSelections.get(key),
    clearEngineSelection(key) {
      engineSelections.delete(key)
    }
  }
}
