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

const ledger = new Map<string, Set<EngineKey>>()

function validBottle(bottleName: unknown): bottleName is string {
  return (
    typeof bottleName === 'string' &&
    sanitizeBottleName(bottleName) === bottleName
  )
}

export function markGameRunning(bottleName: string, key: EngineKey): boolean {
  if (!validBottle(bottleName) || !isEngineKey(key)) return false
  let set = ledger.get(bottleName)
  if (!set) {
    set = new Set()
    ledger.set(bottleName, set)
  }
  set.add(key)
  logInfo(`BottleLedger: ${key} running in ${bottleName}`, LogPrefix.Backend)
  return true
}

export function markGameStopped(bottleName: string, key: EngineKey): void {
  const set = ledger.get(bottleName)
  if (!set) return
  set.delete(key)
  if (set.size === 0) ledger.delete(bottleName)
}

export function gamesRunningIn(bottleName: string): EngineKey[] {
  if (!validBottle(bottleName)) return []
  return [...(ledger.get(bottleName) ?? [])]
}

export function otherGamesRunning(
  bottleName: string,
  key: EngineKey
): EngineKey[] {
  return gamesRunningIn(bottleName).filter((k) => k !== key)
}

export function __resetBottleLedgerForTests(): void {
  ledger.clear()
}

export function __bottleLedgerSizeForTests(): number {
  return ledger.size
}
