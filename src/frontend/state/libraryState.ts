import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import type { RefreshOptions, Runner } from 'common/types'
import { bindStoreHooks, registerStoreForReset } from './storeKit'

// Phase 69 D-09 reverse bridge: library domain store skeleton. authState (D-10
// puts auth before library) reaches the library through these action slots.
// Until the library wave the GlobalState class installs the implementations via
// installLibraryBridgeSlots; 69-16..69-19 add the library fields, replace each
// slot with the real implementation and delete the class install.

// GAP CYCLE 4 (34.5-33): `origin` identifies which call site triggered a
// refresh. Kept local rather than added to the shared RefreshOptions.
export type RefreshLibraryOptions = RefreshOptions & { origin?: string }

interface LibraryBridgeSlots {
  refreshLibrary: (options: RefreshLibraryOptions) => Promise<void>
  resetRunnerLibrary: (runner: Runner) => void
  setRefreshing: (value: boolean) => void
}

type LibraryState = LibraryBridgeSlots

const notInstalled = (name: string) => {
  window.api.logError(
    `library slot ${name} called before GlobalState installed it`
  )
}

const useLibraryStateRaw = create<LibraryState>()(
  subscribeWithSelector(
    (): LibraryState => ({
      refreshLibrary: async () => notInstalled('refreshLibrary'),
      resetRunnerLibrary: () => notInstalled('resetRunnerLibrary'),
      setRefreshing: () => notInstalled('setRefreshing')
    })
  )
)

registerStoreForReset(useLibraryStateRaw)

/** Installs the class-owned implementations; called once from GlobalState. */
export function installLibraryBridgeSlots(impl: LibraryBridgeSlots): void {
  useLibraryStateRaw.setState({
    refreshLibrary: impl.refreshLibrary,
    resetRunnerLibrary: impl.resetRunnerLibrary,
    setRefreshing: impl.setRefreshing
  })
}

const useLibraryState = bindStoreHooks(useLibraryStateRaw)
export default useLibraryState
