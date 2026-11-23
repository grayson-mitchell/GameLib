/**
 * Keeps Rust's engine state and the sidecar's synchronous mirrors of it in step (Phase 87, 87-42, D-03, D-24). The
 * running-games ledger and the selection registry are Rust's (`gamelib-engine`, which the bottle switch reads), but
 * `engineDecision` and the launch settings still read both synchronously, so each write lands twice: in the local
 * mirror at once (the ledger here, the selection view), then in Rust through the shim. A Rust write that fails is
 * logged and does not stop the launch or its cleanup; the mirror already holds the truth for the sync reads, and the
 * switch, which reads Rust's, then sees one game fewer than there is, as it did before the ledger existed.
 *
 * Each helper is awaited by an async caller; none arms a timer.
 */
import { logWarning, LogPrefix } from 'backend/logger'
import {
  clearEngineSelection,
  markGameRunning,
  markGameStopped
} from 'backend/enginewine/bottles'
import { engineSelectionView } from 'backend/enginewine/selectionView'
import type { EngineRuntime } from './engineRuntime'
import type { EngineKey } from './gameKey'

type LedgerRuntime = Pick<EngineRuntime, 'ledger' | 'requestRustInvoke'>
type RegistryRuntime = Pick<EngineRuntime, 'registry' | 'requestRustInvoke'>

function failed(what: string, error: unknown): void {
  logWarning([`engine: ${what} did not reach Rust:`, error], LogPrefix.Backend)
}

/** `markGameRunning`: false (and nothing recorded) for an unsafe bottle name or a key that is not an engine key. */
export async function recordGameRunning(
  rt: LedgerRuntime,
  bottleName: string,
  key: EngineKey
): Promise<boolean> {
  const marked = rt.ledger.markGameRunning(bottleName, key)
  if (!marked) return false
  try {
    await markGameRunning(rt, bottleName, key)
  } catch (error) {
    failed('the running game', error)
  }
  return true
}

/** `markGameStopped`: harmless for a game that is not recorded. */
export async function recordGameStopped(
  rt: LedgerRuntime,
  bottleName: string,
  key: EngineKey
): Promise<void> {
  rt.ledger.markGameStopped(bottleName, key)
  try {
    await markGameStopped(rt, bottleName, key)
  } catch (error) {
    failed('the stopped game', error)
  }
}

/** `clearEngineSelection`: the selection view and the runtime's registry now, Rust's registry after. */
export async function dropEngineSelection(
  rt: RegistryRuntime,
  key: string
): Promise<void> {
  rt.registry.clearEngineSelection(key)
  engineSelectionView.clear(key)
  try {
    await clearEngineSelection(rt, key)
  } catch (error) {
    failed('the selection clear', error)
  }
}
