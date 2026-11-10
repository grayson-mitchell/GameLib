import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import useUiState from 'frontend/state/uiState'
import SettingsContext from '../SettingsContext'
import InfoIcon from 'frontend/components/UI/InfoIcon'

const EnableFsync = () => {
  const { t } = useTranslation()
  const platform = useUiState((s) => s.platform)
  const { isLinuxNative } = useContext(SettingsContext)
  const isLinux = platform === 'linux'
  const [enableFsync, setEnableFsync] = useSetting('enableFsync', false)

  if (!isLinux || isLinuxNative) {
    return <></>
  }

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="fsyncToggle"
        value={enableFsync || false}
        handleChange={() => setEnableFsync(!enableFsync)}
        title={t('setting.fsync', 'Enable Fsync')}
      />

      <InfoIcon
        text={t(
          'help.fsync',
          'Fsync aims to reduce wineserver overhead in CPU-intensive games. Enabling may improve performance on supported Linux kernels.'
        )}
      />
    </div>
  )
}

export default EnableFsync
