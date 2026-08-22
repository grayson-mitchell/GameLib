import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ContentCopyOutlined,
  DeleteOutline,
  CachedOutlined,
  UploadOutlined,
  DownloadOutlined,
  CancelOutlined,
  SelectAllOutlined,
  DeselectOutlined
} from '@mui/icons-material'
import classNames from 'classnames'
import SettingsContext from '../../SettingsContext'
import ContextProvider from 'frontend/state/ContextProvider'
import { GameStatus } from 'common/types'
import {
  AllowInstallationBrokenAnticheat,
  ShowValveProton,
  AltGOGdlBin,
  AltLegendaryBin,
  AltNileBin,
  ClearCache,
  CustomCSS,
  DisableLogs,
  DownloadNoHTTPS,
  ExperimentalFeatures,
  HideWindowOnProtocolLaunch,
  ResetHeroic,
  GamePadDelayRepeat,
  SteamGridDbApiKey
} from '../../components'
import DisableGOGPresence from '../../components/DisableGOGPresence'
import { callOrDeclare } from 'frontend/helpers/declaredUnavailable'

// D-03 (34.5-48, Task 2): every EOS overlay channel is deferred to Phase 34.6 and
// unregistered on the Tauri sidecar today. `feature`/`deferral` are fixed for every call
// site below so the log line callOrDeclare() writes on decline always names the same
// deferral -- see 34.5-CYCLE6-ROUTING.md cluster 4 for the full diagnosis this closes.
const EOS_FEATURE = 'EOS Overlay'
const EOS_DEFERRAL = 'D-03'

export default function AdvancedSetting() {
  const { config } = useContext(SettingsContext)

  const [isCopiedToClipboard, setCopiedToClipboard] = useState(false)

  const [eosOverlayInstalled, setEosOverlayInstalled] = useState(false)
  const [eosOverlayVersion, setEosOverlayVersion] = useState('')
  const [eosOverlayLatestVersion, setEosOverlayLatestVersion] = useState('')
  const [eosOverlayCheckingForUpdates, setEosOverlayCheckingForUpdates] =
    useState(false)
  const [eosOverlayInstallingOrUpdating, setEosOverlayInstallingOrUpdating] =
    useState(false)
  const [eosOverlayEnabledGlobally, setEosOverlayEnabledGlobally] =
    useState(false)
  // True once either unconditional probe below declines under Tauri (D-03). The panel
  // then declines visibly instead of presenting the optimistic false/'' defaults above as
  // fact -- see getMainEosText() and the footerFlex render below. Defaults false and stays
  // false under Electron, where both probes resolve: byte-identical behavior to today.
  const [eosOverlayUnavailable, setEosOverlayUnavailable] = useState(false)
  const eosOverlayAppName = '98bc04bc842e4906993fd6d6644ffb8d'

  const { libraryStatus, platform } = useContext(ContextProvider)
  const { t } = useTranslation()
  const isWindows = platform === 'win32'
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

  // One of the two unconditional, always-reachable EOS probes -- on decline this is a
  // reliable signal the whole panel must present as unavailable (isEosOverlayEnabled,
  // below, is isWindows-gated and genuinely never fires on macOS, so it is NOT used for
  // detection).
  useEffect(() => {
    const getEosStatus = async () => {
      const result = await callOrDeclare({
        channel: 'getEosOverlayStatus',
        feature: EOS_FEATURE,
        deferral: EOS_DEFERRAL,
        call: () => window.api.getEosOverlayStatus()
      })
      if (!result.ok) {
        setEosOverlayUnavailable(true)
        return
      }
      setEosOverlayInstalled(result.value.isInstalled)
      setEosOverlayVersion(result.value.version ?? '')
    }
    getEosStatus()
  }, [])

  // The second unconditional, always-reachable EOS probe -- see the comment above.
  useEffect(() => {
    const getLatestEosOverlayVersion = async () => {
      const result = await callOrDeclare({
        channel: 'getLatestEosOverlayVersion',
        feature: EOS_FEATURE,
        deferral: EOS_DEFERRAL,
        call: () => window.api.getLatestEosOverlayVersion()
      })
      if (!result.ok) {
        setEosOverlayUnavailable(true)
        return
      }
      setEosOverlayLatestVersion(result.value)
    }
    getLatestEosOverlayVersion()
  }, [])

  useEffect(() => {
    const { status } =
      libraryStatus.filter(
        (game: GameStatus) => game.appName === eosOverlayAppName
      )[0] || {}
    setEosOverlayInstallingOrUpdating(
      status === 'installing' || status === 'updating'
    )
  }, [])

  useEffect(() => {
    const enabledGlobally = async () => {
      if (isWindows) {
        const result = await callOrDeclare({
          channel: 'isEosOverlayEnabled',
          feature: EOS_FEATURE,
          deferral: EOS_DEFERRAL,
          call: () => window.api.isEosOverlayEnabled()
        })
        if (!result.ok) {
          setEosOverlayUnavailable(true)
          return
        }
        setEosOverlayEnabledGlobally(result.value)
      }
    }
    enabledGlobally()
  }, [])

  function getMainEosText() {
    if (eosOverlayUnavailable)
      return t(
        'setting.eosOverlay.unavailable',
        'The EOS Overlay is unavailable in this build'
      )
    if (eosOverlayInstalled && eosOverlayInstallingOrUpdating)
      return t(
        'setting.eosOverlay.updating',
        'The EOS Overlay is being updated...'
      )
    if (eosOverlayInstalled && !eosOverlayInstallingOrUpdating)
      return t('setting.eosOverlay.installed', 'The EOS Overlay is installed')
    if (!eosOverlayInstalled && eosOverlayInstallingOrUpdating)
      return t(
        'setting.eosOverlay.installing',
        'The EOS Overlay is being installed...'
      )
    if (!eosOverlayInstalled && !eosOverlayInstallingOrUpdating)
      return t(
        'setting.eosOverlay.notInstalled',
        'The EOS Overlay is not installed'
      )
    return ''
  }

  async function installEosOverlay() {
    setEosOverlayInstallingOrUpdating(true)
    const result = await callOrDeclare({
      channel: 'installEosOverlay',
      feature: EOS_FEATURE,
      deferral: EOS_DEFERRAL,
      call: () => window.api.installEosOverlay()
    })
    // Runs on BOTH branches (ok and not-ok) -- callOrDeclare never throws, so this reset
    // is no longer reachable only on success the way a bare, unwrapped await used to
    // leave it stuck true forever on a rejection.
    setEosOverlayInstallingOrUpdating(false)
    if (!result.ok) {
      setEosOverlayUnavailable(true)
      return
    }
    setEosOverlayInstalled(!result.value)
    // `eos-overlay install` enables the overlay by default on Windows
    setEosOverlayEnabledGlobally(isWindows)
    // Update latest version info
    await checkForEosOverlayUpdates()
  }

  async function removeEosOverlay() {
    const result = await callOrDeclare({
      channel: 'removeEosOverlay',
      feature: EOS_FEATURE,
      deferral: EOS_DEFERRAL,
      call: () => window.api.removeEosOverlay()
    })
    if (!result.ok) {
      setEosOverlayUnavailable(true)
      return
    }
    setEosOverlayInstalled(!result.value)
  }

  async function updateEosOverlay() {
    setEosOverlayInstallingOrUpdating(true)
    const installResult = await callOrDeclare({
      channel: 'installEosOverlay',
      feature: EOS_FEATURE,
      deferral: EOS_DEFERRAL,
      call: () => window.api.installEosOverlay()
    })
    // Runs on BOTH branches -- see the identical comment in installEosOverlay() above.
    setEosOverlayInstallingOrUpdating(false)
    if (!installResult.ok) {
      setEosOverlayUnavailable(true)
      return
    }
    const statusResult = await callOrDeclare({
      channel: 'getEosOverlayStatus',
      feature: EOS_FEATURE,
      deferral: EOS_DEFERRAL,
      call: () => window.api.getEosOverlayStatus()
    })
    if (!statusResult.ok) {
      setEosOverlayUnavailable(true)
      return
    }
    setEosOverlayVersion(statusResult.value.version ?? '')
  }

  async function cancelEosOverlayInstallOrUpdate() {
    // T-34.5-48-05: while declined, no install/update was ever registered on the backend
    // -- the abort call below must be unreachable, or it sends a real abort request for a
    // controller that never existed (the observed "Aborting not possible. Could not find
    // a matching abort controller for 98bc04bc842e4906993fd6d6644ffb8d").
    if (eosOverlayUnavailable) return
    window.api.abort(eosOverlayAppName)
    setEosOverlayInstallingOrUpdating(false)
  }

  async function toggleEosOverlay() {
    if (eosOverlayEnabledGlobally) {
      const result = await callOrDeclare({
        channel: 'disableEosOverlay',
        feature: EOS_FEATURE,
        deferral: EOS_DEFERRAL,
        call: () => window.api.disableEosOverlay('')
      })
      if (!result.ok) {
        setEosOverlayUnavailable(true)
        return
      }
      setEosOverlayEnabledGlobally(false)
    } else {
      const result = await callOrDeclare({
        channel: 'enableEosOverlay',
        feature: EOS_FEATURE,
        deferral: EOS_DEFERRAL,
        call: () => window.api.enableEosOverlay('')
      })
      if (!result.ok) {
        setEosOverlayUnavailable(true)
        return
      }
      setEosOverlayEnabledGlobally(result.value.wasEnabled)
    }
  }

  async function checkForEosOverlayUpdates() {
    setEosOverlayCheckingForUpdates(true)
    const infoResult = await callOrDeclare({
      channel: 'updateEosOverlayInfo',
      feature: EOS_FEATURE,
      deferral: EOS_DEFERRAL,
      call: () => window.api.updateEosOverlayInfo()
    })
    if (!infoResult.ok) {
      setEosOverlayCheckingForUpdates(false)
      setEosOverlayUnavailable(true)
      return
    }
    const versionResult = await callOrDeclare({
      channel: 'getLatestEosOverlayVersion',
      feature: EOS_FEATURE,
      deferral: EOS_DEFERRAL,
      call: () => window.api.getLatestEosOverlayVersion()
    })
    setEosOverlayCheckingForUpdates(false)
    if (!versionResult.ok) {
      setEosOverlayUnavailable(true)
      return
    }
    setEosOverlayLatestVersion(versionResult.value)
  }

  return (
    <div>
      <h3 className="settingSubheader">{t('settings.navbar.advanced')}</h3>

      <div className="advancedSetting">
        <SteamGridDbApiKey />
        <hr />
      </div>

      <AltLegendaryBin />

      <AltGOGdlBin />

      <AltNileBin />

      <DownloadNoHTTPS />

      <DisableLogs />

      <DisableGOGPresence />

      <AllowInstallationBrokenAnticheat />

      <GamePadDelayRepeat />

      <HideWindowOnProtocolLaunch />

      {isLinux && <ShowValveProton />}

      <hr />

      <div className="advancedSetting">
        <h3>EOS Overlay</h3>
        <div>{getMainEosText()}</div>
        <br />
        {eosOverlayInstalled && !eosOverlayInstallingOrUpdating && (
          <>
            <div>
              {t(
                'setting.eosOverlay.currentVersion',
                'Current Version: {{version}}',
                { version: eosOverlayVersion }
              )}
            </div>
            <div>
              {t(
                'setting.eosOverlay.latestVersion',
                'Latest Version: {{version}}',
                { version: eosOverlayLatestVersion }
              )}
            </div>
            <br />
          </>
        )}
        <div className="footerFlex">
          {!eosOverlayUnavailable && (
            <>
              {eosOverlayInstalled && (
                <>
                  {/* Check for updates */}
                  {(eosOverlayVersion === eosOverlayLatestVersion ||
                    eosOverlayCheckingForUpdates) && (
                    <button
                      className="button is-primary"
                      onClick={checkForEosOverlayUpdates}
                    >
                      <CachedOutlined />
                      <span>
                        {eosOverlayCheckingForUpdates
                          ? t(
                              'setting.eosOverlay.checkingForUpdates',
                              'Checking for updates...'
                            )
                          : t(
                              'setting.eosOverlay.checkForUpdates',
                              'Check for updates'
                            )}
                      </span>
                    </button>
                  )}
                  {/* Update */}
                  {eosOverlayVersion !== eosOverlayLatestVersion &&
                    !eosOverlayCheckingForUpdates && (
                      <button
                        className="button is-primary"
                        onClick={updateEosOverlay}
                      >
                        <UploadOutlined />
                        <span>
                          {eosOverlayInstallingOrUpdating
                            ? t('setting.eosOverlay.updating', 'Updating...')
                            : t('setting.eosOverlay.updateNow', 'Update')}
                        </span>
                      </button>
                    )}
                  {/* Enable/Disable */}
                  {isWindows && (
                    <button
                      className={
                        eosOverlayEnabledGlobally
                          ? 'button is-danger'
                          : 'button is-primary'
                      }
                      onClick={toggleEosOverlay}
                    >
                      {eosOverlayEnabledGlobally ? (
                        <DeselectOutlined />
                      ) : (
                        <SelectAllOutlined />
                      )}
                      <span>
                        {eosOverlayEnabledGlobally
                          ? t('setting.eosOverlay.disable', 'Disable')
                          : t('setting.eosOverlay.enable', 'Enable')}
                      </span>
                    </button>
                  )}
                  {/* Remove */}
                  {!eosOverlayInstallingOrUpdating && (
                    <button
                      className="button is-danger"
                      onClick={removeEosOverlay}
                    >
                      <DeleteOutline />
                      <span>{t('setting.eosOverlay.remove', 'Uninstall')}</span>
                    </button>
                  )}
                </>
              )}
              {/* Install */}
              {!eosOverlayInstalled && !eosOverlayInstallingOrUpdating && (
                <button
                  className="button is-primary"
                  onClick={installEosOverlay}
                >
                  <DownloadOutlined />
                  <span>{t('setting.eosOverlay.install', 'Install')}</span>
                </button>
              )}
              {/* Cancel install/update */}
              {eosOverlayInstallingOrUpdating && (
                <button
                  className="button is-danger"
                  onClick={cancelEosOverlayInstallOrUpdate}
                >
                  <CancelOutlined />
                  <span>{t('setting.eosOverlay.cancelInstall', 'Cancel')}</span>
                </button>
              )}
            </>
          )}
          {eosOverlayUnavailable && (
            <div>
              {t(
                'setting.eosOverlay.unavailableDetail',
                'EOS Overlay support is deferred to a future release (D-03, Phase 34.6) and cannot be installed, updated, or removed from this build.'
              )}
            </div>
          )}
        </div>
        <hr />
      </div>

      <div className="advancedSetting">
        <ExperimentalFeatures />
        <hr />
      </div>

      <div className="advancedSetting">
        <CustomCSS />
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
