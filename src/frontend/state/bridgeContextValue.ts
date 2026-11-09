import type { ContextType } from 'frontend/types'
import useUiState from './uiState'

// Phase 69 D-09 bridge: GlobalState re-renders when a store that owns a
// context field changes, and spreads the stores' current values into the
// Provider value so unconverted consumers keep reading them from context.
// Each later slice plan adds its store to both functions; 69-24 deletes this
// file together with GlobalState.tsx.

/** Subscribes `onChange` to every bridged store. Lasts for the app's life (D-07). */
export function subscribeBridge(onChange: () => void): void {
  useUiState.subscribe(onChange)
}

/** The store-owned context fields, read at call time. */
export function bridgedContextSlice(): Partial<ContextType> {
  const ui = useUiState.getState()
  return {
    platform: ui.platform,
    error: ui.error,
    isFullscreen: ui.isFullscreen,
    isFrameless: ui.isFrameless,
    activeController: ui.activeController,
    connectivity: ui.connectivity,
    dialogModalOptions: ui.dialogModalOptions,
    externalLinkDialogOptions: ui.externalLinkDialogOptions,
    showRedeemKeyDialog: ui.showRedeemKeyDialog,
    showDialogModal: ui.showDialogModal,
    showResetDialog: ui.showResetDialog,
    handleExternalLinkDialog: ui.handleExternalLinkDialog,
    handleRedeemKeyDialog: ui.handleRedeemKeyDialog
  }
}
