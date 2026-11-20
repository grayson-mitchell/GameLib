import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import SettingsContext from '../SettingsContext'
import useSetting from 'frontend/hooks/useSetting'
import { PathSelectionBox } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'

const BeforeLaunchScriptPath = () => {
  const { t } = useTranslation()
  const { gameInfo } = useContext(SettingsContext)

  const [scriptPath, setScriptPath] = useSetting('beforeLaunchScriptPath', '')

  return (
    <PathSelectionBox
      type="file"
      onPathChange={setScriptPath}
      path={scriptPath}
      pathDialogTitle={t('box.select.script', 'Select script ...')}
      pathDialogDefaultPath={gameInfo?.install.install_path}
      placeholder={scriptPath || t('box.select.script', 'Select script ...')}
      label={t('gamelib:settings.fields.beforeLaunch.label', 'Before launch')}
      labelHelp={
        <InfoIcon
          text={t(
            'gamelib:settings.fields.beforeLaunch.help',
            'A script GameLib runs before the game starts. The game waits for it to finish.'
          )}
        />
      }
      htmlId="before-launch-script-path"
    />
  )
}

export default BeforeLaunchScriptPath
