import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'

const VerboseLogs = () => {
  const { t } = useTranslation()

  const [verboseLogs, setVerboseLogs] = useSetting('verboseLogs', true)

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="verboseLogs"
        value={verboseLogs}
        handleChange={() => setVerboseLogs(!verboseLogs)}
        title={t('gamelib:settings.fields.verboseLogs.label', 'Verbose logs')}
      />
      <InfoIcon
        text={t(
          'gamelib:settings.fields.verboseLogs.help',
          "Writes extra Wine and GameLib detail to the game's log."
        )}
      />
    </div>
  )
}

export default VerboseLogs
