import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'
import ContextProvider from 'frontend/state/ContextProvider'

interface ViewProps {
  isMac: boolean
  value: boolean
  onToggle: (next: boolean) => void
  t: (key: string, fallback: string) => string
}

// Phase 57 D-09/D-10/D-19: turning the toggle on is the only consent (no
// dialog); macOS only; icon-only (i) help on the label line.
export function ShareDetectedFixesView({
  isMac,
  value,
  onToggle,
  t
}: ViewProps) {
  if (!isMac) return <></>

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="shareDetectedFixes"
        value={value}
        handleChange={() => onToggle(!value)}
        title={t('setting.shareDetectedFixes', 'Share detected game fixes')}
      />
      <InfoIcon
        text={t(
          'help.shareDetectedFixes',
          "Off by default. When on, and GameLib detects on this Mac that a Steam game needs a known fix (a 32-bit Mac build, Steam CEG DRM, or a curated 32-bit entry that turns out to be wrong), it sends the game's Steam app id, the detected fix (for example macArch: 32), whether to add or remove it, and your GameLib version to GameLib's relay. The relay looks the game's title up from Steam and opens a pull request on the public known-fixes repository for review. It never sends a user id, the game title, file paths or logs. The relay sees your IP address; it keeps only a hashed form for about two hours to limit abuse and never publishes it."
        )}
      />
    </div>
  )
}

const ShareDetectedFixes = () => {
  const { t } = useTranslation()
  const { platform } = useContext(ContextProvider)
  const [shareDetectedFixes, setShareDetectedFixes] = useSetting(
    'shareDetectedFixes',
    false
  )

  return (
    <ShareDetectedFixesView
      isMac={platform === 'darwin'}
      value={shareDetectedFixes === true}
      onToggle={setShareDetectedFixes}
      t={(key, fallback) => t(key, fallback)}
    />
  )
}

export default ShareDetectedFixes
