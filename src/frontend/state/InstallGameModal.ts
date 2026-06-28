import { GameInfo, Runner } from 'common/types'
import { create } from 'zustand'

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
    window.api.install({
      appName,
      path: '',
      runner: 'steam',
      installDlcs: [],
      sdlList: [],
      installLanguage: 'en-US',
      platformToInstall: 'Windows',
      gameInfo
    })
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
