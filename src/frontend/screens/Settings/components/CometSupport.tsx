import { useTranslation } from 'react-i18next'
import useSetting from 'frontend/hooks/useSetting'
import { ToggleSwitch } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSettingsState from 'frontend/state/settingsState'

// GOG-only. Still stored as experimentalFeatures.cometSupport (the backend reads that key in
// launcher.ts and gog/games.ts); it moved out of the old Experimental Features section.
const CometSupport = () => {
  const { t } = useTranslation()
  const [experimentalFeatures, setExperimentalFeatures] = useSetting(
    'experimentalFeatures',
    {
      cometSupport: true
    }
  )
  const handleExperimentalFeatures = useSettingsState(
    (s) => s.handleExperimentalFeatures
  )

  const toggle = () => {
    const newFeatures = {
      ...experimentalFeatures,
      cometSupport: !experimentalFeatures.cometSupport
    }
    setExperimentalFeatures(newFeatures) // update settings
    handleExperimentalFeatures(newFeatures) // update global state
  }

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="cometSupport"
        value={experimentalFeatures.cometSupport}
        handleChange={toggle}
        title={t(
          'gamelib:settings.cometSupport',
          'Enable GOG Galaxy features (Comet)'
        )}
      />
      <InfoIcon
        text={t(
          'gamelib:settings.cometSupportHelp',
          'Many GOG games expect the GOG Galaxy client for achievements, stats, leaderboards and some multiplayer. When on, GameLib runs Comet, a small stand-in for Galaxy, while you play a GOG game. Turn off only if a game misbehaves with it.'
        )}
      />
    </div>
  )
}

export default CometSupport
