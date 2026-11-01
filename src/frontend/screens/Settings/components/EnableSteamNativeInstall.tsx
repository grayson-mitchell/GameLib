import { useContext } from 'react'
import ContextProvider from 'frontend/state/ContextProvider'
import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from '../SettingsContext'
import InfoIcon from 'frontend/components/UI/InfoIcon'

const EnableSteamNativeInstall = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const { platform } = useContext(ContextProvider)
  const [enableSteamNativeInstall, setEnableSteamNativeInstall] = useSetting(
    'enableSteamNativeInstall',
    true
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
        text={
          // D-UAT-19: the Mac-version split only exists on macOS (titles with
          // no Mac build always download in GameLib, into the bottle).
          platform === 'darwin'
            ? t(
                'help.steam_native_install',
                'Downloads Steam games in GameLib with real progress and cancel. When off, Steam installs games that have a Mac version. Games without one always download in GameLib.'
              )
            : t(
                'help.steam_native_install_other',
                'Downloads Steam games in GameLib with real progress and cancel. When off, GameLib hands installs to the Steam client.'
              )
        }
      />
    </div>
  )
}

export default EnableSteamNativeInstall
