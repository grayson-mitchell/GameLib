import { create } from 'zustand'
import { GameInfo } from 'common/types'

export interface SteamLibraryOption {
  path: string
  steamappsDir: string
  isPrimary: boolean
}

interface SteamInstallLocationState {
  isOpen: boolean
  appName?: string
  gameInfo: GameInfo | null
  libraries: SteamLibraryOption[]
  open: (
    appName: string,
    gameInfo: GameInfo,
    libraries: SteamLibraryOption[]
  ) => void
  close: () => void
}

// Phase 21 (21-09), D-09: single global store driving the multi-library
// install-location override picker. Opened EXCLUSIVELY from
// InstallGameModal.ts's Steam install chokepoint, and only when
// window.api.listSteamLibraryTargets() returns more than one registered
// library (single-library installs see zero friction — no store mutation,
// straight to window.api.install()). Mirrors the SteamBottleSetup.ts store
// pattern (global store + component mounted once in App.tsx).
export const useSteamInstallLocation = create<SteamInstallLocationState>()(
  (set) => ({
    isOpen: false,
    appName: undefined,
    gameInfo: null,
    libraries: [],
    open: (appName, gameInfo, libraries) =>
      set({ isOpen: true, appName, gameInfo, libraries }),
    close: () => set({ isOpen: false })
  })
)
