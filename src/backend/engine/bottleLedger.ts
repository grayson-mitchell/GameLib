/**
 * Per-bottle running-games ledger (phase 61, D-16).
 *
 * Maps a bottle name to the set of engine keys running in it, for every
 * store, so an engine step can see another game in the same bottle before it
 * tears the shared wineserver down. In-memory only; empty at module load, no
 * timers, no I/O (sidecar exit contract).
 */
import { logInfo, LogPrefix } from 'backend/logger'
import { sanitizeBottleName } from './bottlePrimitives'
import { isEngineKey } from './gameKey'
import type { EngineKey } from './gameKey'

function validBottle(bottleName: unknown): bottleName is string {
  return (
    typeof bottleName === 'string' &&
    sanitizeBottleName(bottleName) === bottleName
  )
}

export interface BottleLedger {
  markGameRunning: (bottleName: string, key: EngineKey) => boolean
  markGameStopped: (bottleName: string, key: EngineKey) => void
  gamesRunningIn: (bottleName: string) => EngineKey[]
  otherGamesRunning: (bottleName: string, key: EngineKey) => EngineKey[]
  /** Number of bottles with at least one running game (tests). */
  size: () => number
}

export function createBottleLedger(): BottleLedger {
  const ledger = new Map<string, Set<EngineKey>>()

  const gamesRunningIn = (bottleName: string): EngineKey[] => {
    if (!validBottle(bottleName)) return []
    return [...(ledger.get(bottleName) ?? [])]
  }

  return {
    markGameRunning(bottleName, key) {
      if (!validBottle(bottleName) || !isEngineKey(key)) return false
      let set = ledger.get(bottleName)
      if (!set) {
        set = new Set()
        ledger.set(bottleName, set)
      }
      set.add(key)
      logInfo(
        `BottleLedger: ${key} running in ${bottleName}`,
        LogPrefix.Backend
      )
      return true
    },
    markGameStopped(bottleName, key) {
      const set = ledger.get(bottleName)
      if (!set) return
      set.delete(key)
      if (set.size === 0) ledger.delete(bottleName)
    },
    gamesRunningIn,
    otherGamesRunning(bottleName, key) {
      return gamesRunningIn(bottleName).filter((k) => k !== key)
    },
    size: () => ledger.size
  }
}
