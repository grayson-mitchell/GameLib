import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'
import ContextProvider from 'frontend/state/ContextProvider'
import SettingsContext from '../SettingsContext'

interface ViewProps {
  isMac: boolean
  value: boolean
  onToggle: (next: boolean) => void
  t: (key: string, fallback: string) => string
}

// quick 261105-ord: opt-in, macOS only, default OFF. Icon-only (i) help on the
// label line (no "Help" text link).
export function SteamExperimentalInstallAppView({
  isMac,
  value,
  onToggle,
  t
}: ViewProps) {
  if (!isMac) return <></>

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="steamExperimentalInstallApp"
        value={value}
        handleChange={() => onToggle(!value)}
        title={t(
          'setting.steamExperimentalInstallApp',
          'Steam Experimental InstallApp Feature'
        )}
      />
      <InfoIcon
        text={t(
          'help.steamExperimentalInstallApp',
          "Off by default. Asks the running Steam app to install games through an undocumented internal Steam interface, so Steam's window and install dialog stay closed, and games GameLib downloads are added to Steam without restarting it. If Steam isn't running, you're signed out, or a Steam update changed the interface, GameLib falls back to the normal behaviour automatically."
        )}
      />
    </div>
  )
}

const SteamExperimentalInstallApp = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const { platform } = useContext(ContextProvider)
  const [enabled, setEnabled] = useSetting('steamExperimentalInstallApp', false)

  if (!isDefault) {
    return <></>
  }

  return (
    <SteamExperimentalInstallAppView
      isMac={platform === 'darwin'}
      value={enabled === true}
      onToggle={setEnabled}
      t={(key, fallback) => t(key, fallback)}
    />
  )
}

export default SteamExperimentalInstallApp
