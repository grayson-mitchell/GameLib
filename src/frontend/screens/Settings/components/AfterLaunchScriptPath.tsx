import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import SettingsContext from '../SettingsContext'
import useSetting from 'frontend/hooks/useSetting'
import { PathSelectionBox } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'

const AfterLaunchScriptPath = () => {
  const { t } = useTranslation()
  const { gameInfo } = useContext(SettingsContext)

  const [scriptPath, setScriptPath] = useSetting('afterLaunchScriptPath', '')

  return (
    <PathSelectionBox
      type="file"
      onPathChange={setScriptPath}
      path={scriptPath}
      pathDialogTitle={t('box.select.script', 'Select script ...')}
      pathDialogDefaultPath={gameInfo?.install.install_path}
      placeholder={scriptPath || t('box.select.script', 'Select script ...')}
      label={t('gamelib:settings.fields.afterExit.label', 'After exit')}
      labelHelp={
        <InfoIcon
          text={t(
            'gamelib:settings.fields.afterExit.help',
            'A script GameLib runs after the game closes.'
          )}
        />
      }
      htmlId="after-launch-script-path"
    />
  )
}

export default AfterLaunchScriptPath
