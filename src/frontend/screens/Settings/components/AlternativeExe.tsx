import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import SettingsContext from '../SettingsContext'
import useSetting from 'frontend/hooks/useSetting'
import { PathSelectionBox } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import { isStore } from 'common/storeCapabilities'

const AlternativeExe = () => {
  const { t } = useTranslation()
  const { isDefault, runner, gameInfo } = useContext(SettingsContext)

  const [targetExe, setTargetExe] = useSetting('targetExe', '')

  if (isDefault || isStore(runner, 'sideload')) {
    return <></>
  }

  return (
    <PathSelectionBox
      type="file"
      onPathChange={setTargetExe}
      path={targetExe}
      pathDialogTitle={t('box.select.exe', 'Select EXE')}
      pathDialogDefaultPath={gameInfo?.install.install_path}
      placeholder={targetExe || t('box.select.exe', 'Select EXE')}
      label={t(
        'gamelib:settings.fields.alternativeExe.label',
        'Alternative executable'
      )}
      labelHelp={
        <InfoIcon
          text={t(
            'gamelib:settings.fields.alternativeExe.help',
            "Run a different .exe from the game folder instead of the game's usual one."
          )}
        />
      }
      htmlId="setinstallpath"
    />
  )
}

export default AlternativeExe
