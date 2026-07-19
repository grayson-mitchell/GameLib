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
// Steam's own install() call, invoked by the SteamDownloadDialog install
// window's confirm handler once the user has chosen a library. Signature/body
// unchanged (quick 260719-t8t) — path '' falls back to the primary library
// backend-side (resolveSteamInstallTarget, D-08).
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

// quick 260719-t8t: fetches the registered Steam libraries (empty when the
// D-13 native-install opt-in is OFF — see main.ts's listSteamLibraryTargets
// handler) and ALWAYS opens the Steam install window (SteamDownloadDialog) —
// for 0, 1 and >1 libraries alike. This intentionally RETIRES the D-09
// zero-friction single-library path: even a single library now opens the
// window (pre-selected in the dialog), and the empty-libraries case opens with
// libraries: [] (the dialog handles the empty state and confirms with path '').
// No code path installs a native Steam game without first opening the window.
// Extracted as a standalone async function (not inlined in
// openInstallGameModal, which must stay synchronous for its other runner
// branches) so it's directly testable.
export const startSteamInstall = async (appName: string, gameInfo: GameInfo) => {
  const libraries = await window.api.listSteamLibraryTargets()
  useSteamInstallLocation.getState().open(appName, gameInfo, libraries)
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
