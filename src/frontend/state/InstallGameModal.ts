import { GameInfo, Runner } from 'common/types'
import { create } from 'zustand'
import { useSteamInstallLocation } from './SteamInstallLocation'

interface InstallGameModalState {
  isOpen: boolean
  appName?: string
  runner?: Runner
  gameInfo: GameInfo | null
  action?: 'install' | 'import'
}

export const useInstallGameModal = create<InstallGameModalState>()(() => ({
  isOpen: false,
  gameInfo: null,
  action: 'install'
}))

interface OpenInstallGameModalParams {
  appName: string
  runner: Runner
  gameInfo: GameInfo | null
  action?: 'install' | 'import'
}
// Steam's own install() call, shared by the zero-friction single-library path
// below and by the D-09 override picker's own confirm handler
// (SteamInstallLocationPicker.tsx) once the user has chosen a library.
export const installSteamGame = (
  appName: string,
  gameInfo: GameInfo,
  path = ''
) => {
  void window.api.install({
    appName,
    path,
    runner: 'steam',
    installDlcs: [],
    sdlList: [],
    installLanguage: 'en-US',
    platformToInstall: 'Windows',
    gameInfo
  })
}

// D-09: fetches the registered Steam libraries (empty when the D-13 native-
// install opt-in is OFF — see main.ts's listSteamLibraryTargets handler) and
// either installs immediately (0 or 1 library — zero friction) or opens the
// override picker (>1 library, defaulting to the primary). Extracted as a
// standalone async function (not inlined in openInstallGameModal, which must
// stay synchronous for its other runner branches) so it's directly testable.
export const startSteamInstall = async (appName: string, gameInfo: GameInfo) => {
  const libraries = await window.api.listSteamLibraryTargets()
  if (libraries.length > 1) {
    useSteamInstallLocation.getState().open(appName, gameInfo, libraries)
    return
  }
  installSteamGame(appName, gameInfo)
}

export const openInstallGameModal = ({
  appName,
  runner,
  gameInfo,
  action = 'install'
}: OpenInstallGameModalParams) => {
  // Steam installs are delegated to the Steam client via steam://install — they
  // never use GamerLib's install modal (which would call getInstallInfo and loop
  // forever on "Getting download size…" since Steam exposes no size data). This
  // is the single chokepoint for every install entry point (library grid/list,
  // game submenu, game page). Badge state is reconciled on window focus (D-01/D-02).
  if (runner === 'steam' && action === 'install' && gameInfo) {
    void startSteamInstall(appName, gameInfo)
    return
  }

  useInstallGameModal.setState({
    isOpen: true,
    appName,
    runner,
    gameInfo,
    action
  })
}

export const closeInstallGameModal = () => {
  useInstallGameModal.setState({
    isOpen: false
  })
}
