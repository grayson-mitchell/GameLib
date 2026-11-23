import type { EngineSelection } from 'common/types/engine'
import { sidecarInternalSendArgs } from 'common/types/ipc/sidecarInternal'
import type { IpcRegistry } from 'backend/sidecar/ipcRegistry'

/**
 * The engine selection view (Phase 87, 87-42, D-24): a write-through mirror of Rust's `gamelib-engine` registry
 * (`bottles::registry`), so the synchronous reads that cannot await a Rust call (the `getBridgeBottleSettings`
 * chain and the launch settings) stay synchronous. Rust owns the registry; this Map only ever holds what Rust
 * answered or was told:
 *
 * - `engine_bottle_prepare` replies with the selection the bottle is now on (and registers it in Rust), applied by
 *   the caller through {@link engineSelectionView.apply};
 * - the clear shim's reply and the registry's own change frames (`engineSelectionChanged`, sent when Rust changes
 *   its registry by itself: a launch deadline, a game exit) are applied here too, by {@link registerEngineSelectionView}.
 *
 * Until the launch moves into Rust (Phase 88) the still-TS launch step also registers a selection before the switch
 * (`engineRuntime.registry.setEngineSelection`, which validates it and writes here), because the switch refusal
 * `dxvk-failed` keeps launching on the selection that was set, as the TS always did.
 *
 * The cross-language vectors are `selection_registry.json` (replayed by `selectionView.test.ts`). A module Map: no
 * timer, no handle, nothing at load (the sidecar exit contract). A reset is for tests.
 */
const selections = new Map<string, EngineSelection>()

export const engineSelectionView = {
  /** `getEngineSelection`: the selection registered for the key, or undefined. */
  get(key: string): EngineSelection | undefined {
    return selections.get(key)
  },
  /** Registers `selection` for `key`, or drops the key for `null`: Rust's answer, applied. */
  apply(key: string, selection: EngineSelection | null): void {
    if (selection === null) selections.delete(key)
    else selections.set(key, selection)
  },
  /** `clearEngineSelection`: harmless for a key that has none. */
  clear(key: string): void {
    selections.delete(key)
  },
  /** Forgets every selection (tests). */
  reset(): void {
    selections.clear()
  }
}

/**
 * Wires Rust's `engineSelectionChanged` frame into the view. The frame is shell-originated (it is not in the
 * renderer allow-list) and is validated again here, so a malformed one is dropped, not applied. One call from
 * `handlers.ts`; it creates no timer or handle.
 */
export function registerEngineSelectionView(
  ipc: Pick<IpcRegistry, 'on'>
): void {
  ipc.on('engineSelectionChanged', (_event: unknown, ...args: unknown[]) => {
    const parsed =
      sidecarInternalSendArgs.engineSelectionChanged.safeParse(args)
    if (!parsed.success) return
    const [{ key, selection }] = parsed.data
    engineSelectionView.apply(key, selection)
  })
}
