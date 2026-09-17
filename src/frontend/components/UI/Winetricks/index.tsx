import { useContext, useEffect, useState } from 'react'
import './index.scss'
import { ProgressDialog } from '../ProgressDialog'
import WinetricksBrowse from './WinetricksBrowse'
import { useTranslation } from 'react-i18next'
import SettingsContext from 'frontend/screens/Settings/SettingsContext'
import { Runner, WinetricksComponent } from 'common/types'
import type { IpcRendererEvent } from 'backend/platform'
import {
  attributeProgressEvent,
  clearVerbError,
  type VerbErrorMap
} from 'common/winetricks/deriveRowState'
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
  const { t: tGamelib } = useTranslation('gamelib')

  // D-17 / RESEARCH Open Question 3: a single boolean here used to conflate
  // two unrelated facts -- "we have never yet loaded the installed list"
  // and "a background refresh is in flight right now" -- and that
  // conflation is exactly what let the post-install refetch re-arm the
  // outer mount gate 35-25 (`366e719bb`) never closed. Split into the three
  // named facts below; none of them may ever gate whether `WinetricksBrowse`
  // is mounted (see the `installWrapper` comment below).
  const [hasInstalledData, setHasInstalledData] = useState(false)
  const [isRevalidatingInstalled, setIsRevalidatingInstalled] =
    useState(true)
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
    setIsRevalidatingInstalled(true)
    const result = await callOrDeclare({
      channel: WINETRICKS_CHANNEL_BY_METHOD.winetricksListInstalled,
      feature: WINETRICKS_FEATURE,
      deferral: DEFERRAL_D03,
      call: () => window.api.winetricksListInstalled(runner, appName)
    })
    if (!result.ok) {
      setDeclined(true)
      setIsRevalidatingInstalled(false)
      return
    }
    setInstalled(result.value)
    // NEVER reset this back to false -- a later "tidy" that resets it at
    // this function's opening line would silently restore the exact
    // first-load/background-revalidation conflation D-17 removes (the two
    // are meant to stay decoupled forever).
    setHasInstalledData(true)
    setIsRevalidatingInstalled(false)
  }
  useEffect(() => {
    listInstalled()
  }, [])

  const [allComponents, setAllComponents] = useState<WinetricksComponent[]>(
    []
  )
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
  // Sticky for the lifetime of this dialog session (REQ-44-21 / RESEARCH
  // Open Question 3): once any install has been attempted, the log box
  // stays visible even after `installing` flips false and the refetch
  // resolves, so the completion/failure lines and the per-row Retry
  // affordance they explain do not vanish out from under the user.
  const [hasAttemptedInstall, setHasAttemptedInstall] = useState(false)
  // Per-verb error attribution (REQ-44-20), populated at the progress-event
  // boundary below -- the only place `messages` and `installingComponent`
  // arrive together.
  const [erroredVerbs, setErroredVerbs] = useState<VerbErrorMap>({})
  // winetricksInstall is send-kind (`makeListenerCaller`, src/preload/api/wine.ts:17) -- it
  // returns no promise, so callOrDeclare cannot wrap it, and per this project's own
  // sidecar-send-channels-fail-silently lesson a mis-routed send produces no reject, no
  // timeout and no log line. The only honest treatment is to gate it behind the invoke-kind
  // probes' own decline, both by code (the early return below) and by gesture (the whole
  // component list renders unavailable instead of the install affordance when declined).
  const WINETRICKS_DECLINED_GUARD = declined
  function install(component: string) {
    if (WINETRICKS_DECLINED_GUARD) return
    setHasAttemptedInstall(true)
    // UI-SPEC Errored row state: clears back to Available the moment a new
    // install attempt starts on that verb.
    setErroredVerbs((current) => clearVerbError(current, component))
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
      // REQ-44-20: attribute this event to its verb here -- this handler is
      // the only place `messages` and `installingComponent` arrive
      // together, so attribution cannot happen retroactively over the flat
      // `logs` array. `attributeProgressEvent` returns the SAME reference
      // when nothing changed, so React bails out and the 567-row tree does
      // not re-render on every progress line (T-44-15).
      setErroredVerbs((current) => attributeProgressEvent(current, payload))
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
            {tGamelib(
              'winetricks.unavailable',
              'Winetricks component management is unavailable on this build'
            )}
          </span>
          <span>
            {tGamelib(
              'winetricks.unavailableDetail',
              'Winetricks support is deferred to a future release (D-03, Phase 34.6) and cannot be listed or installed from this build.'
            )}
          </span>
        </div>
      )}
      {/* C-1 / D-17: this mount's ONLY condition is `!declined`. Neither
          `installing` nor any installed-list revalidation flag may ever
          gate it again -- that stacked-gate shape is exactly what 35-25
          (`366e719bb`) closed only half of, because it tested the
          `installing` trigger and not the post-install refetch trigger.
          `WinetricksBrowse/__tests__/remountSafety.test.tsx` enforces both
          triggers independently, by reverting each fix in isolation and
          confirming its own case turns red. */}
      {!declined && (
        <div className="installWrapper">
          <WinetricksBrowse
            allComponents={allComponents}
            installed={installed}
            installing={installing}
            installingComponent={installingComponent}
            erroredVerbs={erroredVerbs}
            loadingAvailable={loadingAvailable}
            isRevalidatingInstalled={isRevalidatingInstalled}
            onInstall={install}
            onOpenGui={launchWinetricks}
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
    </>
  )

  return (
    <ProgressDialog
      title="Winetricks"
      progress={logs}
      showCloseButton={true}
      onClose={onClose}
      className="winetricksDialog"
      // RESEARCH Open Question 3's decoupling, term by term:
      // - `hasInstalledData` (replaces the old first-load/revalidation
      //   flag) -- the log box shows during first load, same as before,
      //   but a background revalidation no longer toggles it. That
      //   decoupling is the whole point of D-17.
      // - `hasAttemptedInstall` -- once any install has been attempted this
      //   session, the box stays visible; without it the box would vanish
      //   the instant `installing` flips false and the refetch resolves,
      //   taking the completion/failure lines (and the reason for the new
      //   per-row Retry affordance) with it.
      hideProgress={
        !guiOpen &&
        !installing &&
        !hasAttemptedInstall &&
        hasInstalledData &&
        !loadingAvailable
      }
    >
      {dialogContent}
    </ProgressDialog>
  )
}
