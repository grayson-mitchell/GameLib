import { useContext, useEffect, useState } from 'react'
import './index.scss'
import { ProgressDialog } from '../ProgressDialog'
import WinetricksSearchBar from './WinetricksSearch'
import { useTranslation } from 'react-i18next'
import SettingsContext from 'frontend/screens/Settings/SettingsContext'
import { Runner } from 'common/types'
import type { IpcRendererEvent } from 'backend/platform'
import {
  callOrDeclare,
  WINETRICKS_FEATURE,
  WINETRICKS_CHANNEL_BY_METHOD,
  DEFERRAL_D03
} from 'frontend/helpers/declaredUnavailable'

interface Props {
  onClose: () => void
  runner: Runner
}

export default function Winetricks({ onClose, runner }: Props) {
  const { appName } = useContext(SettingsContext)
  const { t } = useTranslation()

  const [loadingInstalled, setLoadingInstalled] = useState(true)
  const [loadingAvailable, setLoadingAvailable] = useState(true)
  // True once either invoke-kind probe below declines under Tauri (D-03) -- the panel then
  // renders an explicit unavailable state and gates the send-kind winetricksInstall call
  // (the guard below), rather than substituting an empty component list the way a bare
  // `catch { setX([]) }` used to (a confident, false "none installed/available" panel;
  // F-34.5-G6-21 / U-34.5-25).
  const [declined, setDeclined] = useState(false)

  // keep track of all installed components for a game/app
  const [installed, setInstalled] = useState<string[]>([])
  async function listInstalled() {
    setLoadingInstalled(true)
    const result = await callOrDeclare({
      channel: WINETRICKS_CHANNEL_BY_METHOD.winetricksListInstalled,
      feature: WINETRICKS_FEATURE,
      deferral: DEFERRAL_D03,
      call: () => window.api.winetricksListInstalled(runner, appName)
    })
    if (!result.ok) {
      setDeclined(true)
      setLoadingInstalled(false)
      return
    }
    setInstalled(result.value)
    setLoadingInstalled(false)
  }
  useEffect(() => {
    listInstalled()
  }, [])

  const [allComponents, setAllComponents] = useState<string[]>([])
  useEffect(() => {
    async function listComponents() {
      setLoadingAvailable(true)
      const result = await callOrDeclare({
        channel: WINETRICKS_CHANNEL_BY_METHOD.winetricksListAvailable,
        feature: WINETRICKS_FEATURE,
        deferral: DEFERRAL_D03,
        call: () => window.api.winetricksListAvailable(runner, appName)
      })
      if (!result.ok) {
        setDeclined(true)
        setLoadingAvailable(false)
        return
      }
      setAllComponents(result.value)
      setLoadingAvailable(false)
    }

    listComponents()
  }, [])

  // handles the installation of components
  const [installing, setInstalling] = useState(false)
  const [installingComponent, setInstallingComponent] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  // winetricksInstall is send-kind (`makeListenerCaller`, src/preload/api/wine.ts:17) -- it
  // returns no promise, so callOrDeclare cannot wrap it, and per this project's own
  // sidecar-send-channels-fail-silently lesson a mis-routed send produces no reject, no
  // timeout and no log line. The only honest treatment is to gate it behind the invoke-kind
  // probes' own decline, both by code (the early return below) and by gesture (the whole
  // component list renders unavailable instead of the install affordance when declined).
  const WINETRICKS_DECLINED_GUARD = declined
  function install(component: string) {
    if (WINETRICKS_DECLINED_GUARD) return
    window.api.winetricksInstall(runner, appName, component)
  }

  useEffect(() => {
    async function onInstallingChange(e: IpcRendererEvent, component: string) {
      if (component === '') {
        listInstalled()
      }
      setInstalling(false)
    }

    async function onWinetricksProgress(
      e: IpcRendererEvent,
      payload: { messages: string[]; installingComponent: string }
    ) {
      // this conditionals help to show the correct state if the dialog
      // is closed during an installation and then re-opened
      if (payload.installingComponent.length) {
        setInstalling(payload.messages[0] !== 'Done')
      }
      if (installingComponent !== payload.installingComponent) {
        setInstallingComponent(payload.installingComponent)
      }
      setLogs((currentLogs) => [...currentLogs, ...payload.messages])
    }

    const removeListener1 =
      window.api.handleProgressOfWinetricks(onWinetricksProgress)

    const removeListener2 =
      window.api.handleWinetricksInstalling(onInstallingChange)

    return () => {
      removeListener1()
      removeListener2()
    }
  }, [])

  const [guiOpen, setGuiOpen] = useState<boolean>(false)
  function launchWinetricks() {
    setGuiOpen(true)
    window.api
      .callTool({
        tool: 'winetricks',
        appName,
        runner
      })
      .finally(() => setGuiOpen(false))
  }

  const dialogContent = (
    <>
      {declined && (
        <div className="installWrapper">
          <span>
            {t(
              'winetricks.unavailable',
              'Winetricks component management is unavailable on this build'
            )}
          </span>
        </div>
      )}
      {!declined && !loadingInstalled && (
        <div className="installWrapper">
          {!installing && allComponents.length !== 0 && (
            <div className="actions">
              <WinetricksSearchBar
                allComponents={allComponents}
                installed={installed}
                onInstallClicked={install}
              />
              <button
                className="button outline"
                onClick={async () => launchWinetricks()}
                disabled={installing}
              >
                {t('winetricks.openGUI', 'Open Winetricks GUI')}
              </button>
            </div>
          )}
          {loadingAvailable && (
            <span>
              {t(
                'winetricks.loading-available',
                'Loading available components ...'
              )}
            </span>
          )}
          {!loadingAvailable && allComponents.length === 0 && (
            <span>
              {t('winetricks.no-components', 'No available components')}
            </span>
          )}
          {installing && (
            <p>
              {t(
                'winetricks.installing',
                'Installation in progress: {{component}}',
                { component: installingComponent }
              )}
            </p>
          )}
        </div>
      )}

      <div className="installedWrapper">
        <b>{t('winetricks.installed', 'Installed components:')}</b>
        {declined && (
          <span>
            {t(
              'winetricks.unavailableDetail',
              'Winetricks support is deferred to a future release (D-03, Phase 34.6) and cannot be listed or installed from this build.'
            )}
          </span>
        )}
        {!declined && loadingInstalled && (
          <span>{t('winetricks.loading', 'Loading')}</span>
        )}
        {!declined && !loadingInstalled && installed.length === 0 && (
          <span>
            {t(
              'winetricks.nothingYet',
              'Nothing was installed by Winetricks yet'
            )}
          </span>
        )}
        {!declined && !loadingInstalled && <span>{installed.join(', ')}</span>}
      </div>
    </>
  )

  return (
    <ProgressDialog
      title="Winetricks"
      progress={logs}
      showCloseButton={true}
      onClose={onClose}
      className="winetricksDialog"
      hideProgress={
        !guiOpen && !installing && !loadingInstalled && !loadingAvailable
      }
    >
      {dialogContent}
    </ProgressDialog>
  )
}
