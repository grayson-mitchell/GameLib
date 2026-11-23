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

/**
 * Where the selections are kept: the boot's is `engineSelectionView` (87-42, D-24), the write-through mirror of
 * Rust's registry the synchronous bridge reads share; a test gets a private map.
 */
export interface SelectionStore {
  get: (key: string) => EngineSelection | undefined
  apply: (key: string, selection: EngineSelection | null) => void
  clear: (key: string) => void
}

function privateStore(): SelectionStore {
  const map = new Map<string, EngineSelection>()
  return {
    get: (key) => map.get(key),
    apply(key, selection) {
      if (selection === null) map.delete(key)
      else map.set(key, selection)
    },
    clear: (key) => void map.delete(key)
  }
}

export function createEngineRegistry(
  store: SelectionStore = privateStore()
): EngineRegistry {
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
      store.apply(key, copy)
      logInfo(`Engine: ${key} uses ${engineLogLabel(copy)}`, LogPrefix.Backend)
      return true
    },
    getEngineSelection: (key) => store.get(key),
    clearEngineSelection(key) {
      store.clear(key)
    }
  }
}
