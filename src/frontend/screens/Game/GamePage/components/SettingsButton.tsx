import { useTranslation } from 'react-i18next'
import { GameInfo } from 'common/types'
import { SvgButton } from 'frontend/components/UI'
import SettingsIcoAlt from 'frontend/assets/settings_icon_alt.svg?react'
import useUiState from 'frontend/state/uiState'

interface Props {
  gameInfo: GameInfo
  isUninstalling?: boolean
}

// Visibility mirrors the library card's showSettingsButton:
// installed && !uninstalling && !Browser game (every runner, Steam included).
const SettingsButton = ({ gameInfo, isUninstalling = false }: Props) => {
  const { openGameSettingsModal } = useUiState.keys('openGameSettingsModal')
  const { t } = useTranslation()

  if (
    !gameInfo.is_installed ||
    isUninstalling ||
    gameInfo.install?.platform === 'Browser'
  ) {
    return null
  }

  const label = t('submenu.settings', 'Settings')

  return (
    <SvgButton
      onClick={() => openGameSettingsModal(gameInfo)}
      className={`settings-icon`}
      title={label}
      aria-label={label}
    >
      <SettingsIcoAlt />
    </SvgButton>
  )
}

export default SettingsButton
