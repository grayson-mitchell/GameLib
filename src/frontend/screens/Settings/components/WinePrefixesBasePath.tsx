import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import useUiState from 'frontend/state/uiState'
import useSetting from 'frontend/hooks/useSetting'
import { PathSelectionBox } from 'frontend/components/UI'
import SettingsContext from 'frontend/screens/Settings/SettingsContext'

const WinePrefixesBasePath = () => {
  const { t } = useTranslation()
  const platform = useUiState((s) => s.platform)
  const { isDefault } = useContext(SettingsContext)
  const isWindows = platform === 'win32'

  const [defaultWinePrefixDir, setDefaultWinePrefixDir] = useSetting(
    'defaultWinePrefixDir',
    ''
  )

  if (!isDefault || isWindows) {
    return <></>
  }

  return (
    <PathSelectionBox
      htmlId="selectDefaultWinePrefix"
      label={t('setting.defaultWinePrefix', 'Set Folder for new Wine Prefixes')}
      path={defaultWinePrefixDir}
      onPathChange={setDefaultWinePrefixDir}
      type="directory"
      pathDialogTitle={t(
        'toolbox.settings.wineprefix',
        'Select a Folder for new Wine Prefixes'
      )}
      noDeleteButton
      pathDialogDefaultPath={defaultWinePrefixDir}
    />
  )
}

export default WinePrefixesBasePath
