import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContentCopyOutlined } from '@mui/icons-material'
import classNames from 'classnames'
import SettingsContext from '../../SettingsContext'
import ContextProvider from 'frontend/state/ContextProvider'
import {
  AllowInstallationBrokenAnticheat,
  ShowValveProton,
  ClearCache,
  DisableLogs,
  ExperimentalFeatures,
  HideWindowOnProtocolLaunch,
  ResetHeroic,
  GamePadDelayRepeat,
  SteamGridDbApiKey
} from '../../components'

export default function AdvancedSetting() {
  const { config } = useContext(SettingsContext)

  const [isCopiedToClipboard, setCopiedToClipboard] = useState(false)

  const { platform } = useContext(ContextProvider)
  const { t } = useTranslation()
  const isLinux = platform === 'linux'

  useEffect(() => {
    // set copied to clipboard status to true if it's not already set to true
    // used for changing text and color
    if (!isCopiedToClipboard) return

    const timer = setTimeout(() => {
      setCopiedToClipboard(false)
    }, 3000)

    return () => clearTimeout(timer)
  }, [isCopiedToClipboard])

  return (
    <div>
      <h3 className="settingSubheader">
        {t('gamelib:settings.advancedSettings', 'Advanced Settings')}
      </h3>

      <div className="advancedSetting">
        <SteamGridDbApiKey />
        <hr />
      </div>

      <DisableLogs />

      <AllowInstallationBrokenAnticheat />

      <GamePadDelayRepeat />

      <HideWindowOnProtocolLaunch />

      {isLinux && <ShowValveProton />}

      <hr />

      <div className="advancedSetting">
        <ExperimentalFeatures />
        <hr />
      </div>

      <div className="advancedSetting">
        <ClearCache />
        <hr />
      </div>

      <div className="advancedSetting">
        <ResetHeroic />
        <hr />
      </div>

      <div className="footerFlex">
        <button
          className={classNames('button', 'is-footer', {
            isSuccess: isCopiedToClipboard
          })}
          onClick={() => {
            window.api.clipboardWriteText(
              JSON.stringify({ ...config }, null, 2)
            )
            setCopiedToClipboard(true)
          }}
        >
          <div className="button-icontext-flex">
            <div className="button-icon-flex">
              <ContentCopyOutlined />
            </div>
            <span className="button-icon-text">
              {isCopiedToClipboard
                ? t('settings.copiedToClipboard', 'Copied to Clipboard!')
                : t(
                    'settings.copyToClipboard',
                    'Copy All Settings to Clipboard'
                  )}
            </span>
          </div>
        </button>
      </div>
    </div>
  )
}
