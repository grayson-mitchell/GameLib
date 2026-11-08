import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoBox, PathSelectionBox } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from '../SettingsContext'

const DefaultSteamPath = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const [defaultSteamPath, setDefaultSteamPath] = useSetting(
    'defaultSteamPath',
    ''
  )

  if (!isDefault) {
    return <></>
  }

  const helpContent = t(
    'help.steam_path.info',
    'The folder where Steam is installed. GameLib reads your Steam libraries, download progress and connection status from here, and uses it to add non-Steam games to Steam. On Linux, it is also where GameLib finds Proton versions.'
  )

  const steamPathInfo = (
    <InfoBox text="infobox.help" iconOnly>
      {helpContent}
    </InfoBox>
  )

  return (
    <PathSelectionBox
      type="directory"
      onPathChange={setDefaultSteamPath}
      path={defaultSteamPath}
      pathDialogTitle={t('box.default-steam-path', 'Steam path.')}
      pathDialogDefaultPath={defaultSteamPath}
      label={t('setting.default-steam-path', 'Default Steam path')}
      htmlId="default_steam_path"
      noDeleteButton
      labelHelp={steamPathInfo}
    />
  )
}

export default DefaultSteamPath
