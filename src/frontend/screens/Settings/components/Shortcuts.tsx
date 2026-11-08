import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import ContextProvider from 'frontend/state/ContextProvider'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from '../SettingsContext'

const Shortcuts = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const { platform } = useContext(ContextProvider)
  const isWin = platform === 'win32'
  const isLinux = platform === 'linux'

  const [addDesktopShortcuts, setAddDesktopShortcuts] = useSetting(
    'addDesktopShortcuts',
    false
  )
  const [addStartMenuShortcuts, setAddStartMenuShortcuts] = useSetting(
    'addStartMenuShortcuts',
    false
  )

  if (!isDefault) {
    return <></>
  }

  let menuShortcutsLabel = t(
    'setting.addgamestostartmenu',
    'Add games to start menu automatically'
  )
  if (!isLinux && !isWin) {
    menuShortcutsLabel = t(
      'setting.addgamestoapplications',
      'Add games to Applications automatically'
    )
  }

  return (
    <>
      <ToggleSwitch
        htmlId="shortcutsToDesktop"
        value={addDesktopShortcuts}
        handleChange={() => setAddDesktopShortcuts(!addDesktopShortcuts)}
        title={t(
          'setting.adddesktopshortcuts',
          'Add desktop shortcuts automatically'
        )}
      />

      <ToggleSwitch
        htmlId="shortcutsToMenu"
        value={addStartMenuShortcuts}
        handleChange={() => setAddStartMenuShortcuts(!addStartMenuShortcuts)}
        title={menuShortcutsLabel}
      />
    </>
  )
}

// Lives in Settings → Stores → Steam (it writes Steam's shortcuts.vdf), not with the
// desktop/Applications toggles above in General.
export const AddGamesToSteam = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const [addSteamShortcuts, setAddSteamShortcuts] = useSetting(
    'addSteamShortcuts',
    false
  )

  if (!isDefault) {
    return <></>
  }

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="shortcutsToSteam"
        value={addSteamShortcuts}
        handleChange={() => setAddSteamShortcuts(!addSteamShortcuts)}
        title={t('setting.addgamestosteam', 'Add games to Steam automatically')}
      />
      <InfoIcon
        text={t(
          'gamelib:settings.addGamesToSteamHelp',
          'When you install an Epic, GOG, Amazon or sideloaded game, also add it to your Steam library as a non-Steam game, with artwork. Playing it from Steam opens GameLib to launch it. Restart Steam to see newly added games.'
        )}
      />
    </div>
  )
}

export default Shortcuts
