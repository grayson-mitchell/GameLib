import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'
import useUiState from 'frontend/state/uiState'
import SettingsContext from '../SettingsContext'

interface ViewProps {
  isMac: boolean
  value: boolean
  onToggle: (next: boolean) => void
  t: (key: string, fallback: string) => string
}

// quick 261106-s3n: not experimental. Icon-only (i) help on the label line.
export function EnableSteamNativeDeleteView({
  isMac,
  value,
  onToggle,
  t
}: ViewProps) {
  return (
    <div className="toggleRow">
      <ToggleSwitch
        title={t(
          'setting.steam-native-delete',
          'Delete Steam games directly in GameLib'
        )}
        htmlId="enable-steam-native-delete"
        handleChange={() => onToggle(!value)}
        value={value}
      />
      <InfoIcon
        text={
          isMac
            ? t(
                'help.steam_native_delete',
                "Uninstalls Steam games in GameLib, without Steam's window. If Steam is running and signed in, Steam removes the game itself; otherwise GameLib deletes the game's files from your Steam library. Steam Cloud saves are not touched. When off, Steam's own uninstall window opens."
              )
            : t(
                'help.steam_native_delete_other',
                "Uninstalls Steam games in GameLib by deleting the game's files from your Steam library, without Steam's window. Steam Cloud saves are not touched. When off, Steam's own uninstall window opens."
              )
        }
      />
    </div>
  )
}

const EnableSteamNativeDelete = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const platform = useUiState((s) => s.platform)
  // D-02: until the user chooses, this follows the downloader toggle.
  const [downloadDirectly] = useSetting('enableSteamNativeInstall', true)
  const [enabled, setEnabled] = useSetting(
    'enableSteamNativeDelete',
    downloadDirectly
  )

  if (!isDefault) {
    return <></>
  }

  return (
    <EnableSteamNativeDeleteView
      isMac={platform === 'darwin'}
      value={enabled}
      onToggle={setEnabled}
      t={(key, fallback) => t(key, fallback)}
    />
  )
}

export default EnableSteamNativeDelete
