/**
 * The Steam launch's writes to Rust's engine state (Phase 87, 87-42, 87-56b, D-03, D-24). The running-games ledger and
 * the selection registry are Rust's (`gamelib-engine`, which the bottle switch reads). The ledger's answer is Rust's own
 * (`engine_ledger_mark_running`); the selection is also written to `engineSelectionView`, the write-through mirror the
 * synchronous bridge reads (`getBridgeBottleSettings`, the launch settings) stay on. A Rust write that fails is logged
 * and does not stop the launch or its cleanup.
 *
 * Each helper is awaited by an async caller; none arms a timer.
 */
import { existsSync } from 'graceful-fs'
import type { EngineSelection } from 'common/types/engine'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  clearEngineSelection,
  markGameRunning,
  markGameStopped
} from 'backend/enginewine/bottles'
import { engineSelectionView } from 'backend/enginewine/selectionView'
import {
  engineKeyFor,
  engineLogLabel,
  isNonCrossover,
  sanitizeBottleName
} from 'backend/enginewine/twin'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

function failed(what: string, error: unknown): void {
  logWarning([`engine: ${what} did not reach Rust:`, error], LogPrefix.Backend)
}

/**
 * The ledger's own validity rule for a Steam title: a bottle name that survives the sanitiser unchanged and a key that is
 * a Steam app id. It answers only when Rust cannot (a transport fault), so a launch is not refused for a fault the ledger
 * would have accepted.
 */
function ledgerAccepts(bottleName: string, key: string): boolean {
  return (
    sanitizeBottleName(bottleName) === bottleName &&
    engineKeyFor('steam', key) === key
  )
}

/**
 * `markGameRunning`: Rust's answer, false (and nothing recorded) for an unsafe bottle name or a key that is not an
 * engine key. When the call fails or answers something that is not a boolean, the ledger's validity rule answers.
 */
export async function recordGameRunning(
  rust: RustInvokeDeps,
  bottleName: string,
  key: string
): Promise<boolean> {
  try {
    const marked = await markGameRunning(rust, bottleName, key)
    if (typeof marked === 'boolean') return marked
    failed('the running game', 'unexpected reply')
  } catch (error) {
    failed('the running game', error)
  }
  return ledgerAccepts(bottleName, key)
}

/** `markGameStopped`: harmless for a game that is not recorded. */
export async function recordGameStopped(
  rust: RustInvokeDeps,
  bottleName: string,
  key: string
): Promise<void> {
  try {
    await markGameStopped(rust, bottleName, key)
  } catch (error) {
    failed('the stopped game', error)
  }
}

/** `clearEngineSelection`: the selection view now, Rust's registry after. */
export async function dropEngineSelection(
  rust: RustInvokeDeps,
  key: string
): Promise<void> {
  engineSelectionView.clear(key)
  try {
    await clearEngineSelection(rust, key)
  } catch (error) {
    failed('the selection clear', error)
  }
}

/**
 * Registers the engine a Steam launch is about to use for its title, in the view the synchronous reads share (the
 * registry's own rules moved here, T-87-93): the key must be a Steam app id, and a non-CrossOver selection must name a
 * wine and a wineserver binary that exist. The selection is stored as a copy. Answers whether it was registered; Rust
 * gets the selection with the bottle switch (`registerSelection`).
 */
export function setSteamEngineSelection(
  key: string,
  selection: EngineSelection
): boolean {
  if (engineKeyFor('steam', key) !== key) return false
  let copy: EngineSelection
  if (isNonCrossover(selection)) {
    if (
      !existsSync(selection.wineBin) ||
      !existsSync(selection.wineserverBin)
    ) {
      return false
    }
    copy = {
      ...selection,
      dxvk: selection.dxvk ? { ...selection.dxvk } : null
    }
  } else {
    copy = { ...selection }
  }
  engineSelectionView.apply(key, copy)
  logInfo(`Engine: ${key} uses ${engineLogLabel(copy)}`, LogPrefix.Backend)
  return true
}
