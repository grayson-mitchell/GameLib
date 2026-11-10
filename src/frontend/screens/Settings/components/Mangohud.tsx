import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import useUiState from 'frontend/state/uiState'
import InfoIcon from 'frontend/components/UI/InfoIcon'

const Mangohud = () => {
  const { t } = useTranslation()
  const platform = useUiState((s) => s.platform)
  const isLinux = platform === 'linux'
  const [showMangohud, setShowMangohud] = useSetting('showMangohud', false)

  if (!isLinux) {
    return <></>
  }

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="mongohud"
        value={showMangohud}
        handleChange={() => setShowMangohud(!showMangohud)}
        title={t('setting.mangohud')}
      />

      <InfoIcon
        text={t(
          'help.mangohud',
          'MangoHUD is an overlay that displays and monitors FPS, temperatures, CPU/GPU load and other system resources.'
        )}
      />
    </div>
  )
}

export default Mangohud
