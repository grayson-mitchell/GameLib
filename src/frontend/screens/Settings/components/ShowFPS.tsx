import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useUiState from 'frontend/state/uiState'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from '../SettingsContext'

const ShowFPS = () => {
  const { t } = useTranslation()
  const [showFps, setShowFps] = useSetting('showFps', false)
  const platform = useUiState((s) => s.platform)
  const { isLinuxNative } = useContext(SettingsContext)
  const isWin = platform === 'win32'
  const isLinux = platform === 'linux'
  const shouldRenderFpsOption = !isWin || (isLinux && !isLinuxNative)

  if (!shouldRenderFpsOption) {
    return <></>
  }

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="showFPS"
        value={showFps}
        handleChange={() => setShowFps(!showFps)}
        title={
          isLinux
            ? t('gamelib:settings.fields.showFps.label', 'Show FPS')
            : t('gamelib:settings.fields.statsOverlay.label', 'Stats overlay')
        }
      />
      <InfoIcon
        text={
          isLinux
            ? t(
                'gamelib:settings.fields.showFps.help',
                'Draws a frame counter for DirectX 9, 10 and 11 games.'
              )
            : t(
                'gamelib:settings.fields.statsOverlay.help',
                "Shows Apple's Metal performance HUD over the game."
              )
        }
      />
    </div>
  )
}

export default ShowFPS
