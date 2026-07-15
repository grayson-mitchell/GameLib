import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from '../SettingsContext'
import InfoIcon from 'frontend/components/UI/InfoIcon'

const EnableSteamNativeInstall = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const [enableSteamNativeInstall, setEnableSteamNativeInstall] = useSetting(
    'enableSteamNativeInstall',
    false
  )

  if (!isDefault) {
    return <></>
  }

  return (
    <div className="toggleRow">
      <ToggleSwitch
        title={t(
          'setting.steam-native-install',
          'Download Steam games directly in GameLib'
        )}
        htmlId="enable-steam-native-install"
        handleChange={() =>
          setEnableSteamNativeInstall(!enableSteamNativeInstall)
        }
        value={enableSteamNativeInstall}
      />
      <InfoIcon
        text={t(
          'help.steam_native_install',
          'Downloads Steam games in GameLib with real progress and cancel. When off, Steam handles installs. Newer path — Steam still verifies and owns updates.'
        )}
      />
    </div>
  )
}

export default EnableSteamNativeInstall
