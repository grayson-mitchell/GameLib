import './index.scss'

import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import SettingsContext from '../../SettingsContext'
import {
  Runner,
  WinetricksComponent,
  WinetricksQueueState,
  WinetricksVerbOutcome
} from 'common/types'
import { resolveCuratedComponents } from 'common/winetricks/verbs'
import type { IpcRendererEvent } from 'backend/platform'
import {
  callOrDeclare,
  WINETRICKS_FEATURE,
  WINETRICKS_CHANNEL_BY_METHOD,
  DEFERRAL_D03
} from 'frontend/helpers/declaredUnavailable'

// Phase 45 Plan 01 (D-01/D-02/D-11-D-13): tracer-scope Winetricks tab. Renders the
// curated-8 verbs flat (no task-group/Suggested-group split yet; plans 45-07/45-08
// expand this), backed by the backend-resident sequential queue
// (`backend/tools/winetricksQueue.ts`). Every `window.api.winetricks*` call lives in
// this one file -- the call-site guard counts them here from plan 45-02 on.

function emptyQueueState(
  runner: string,
  appName: string
): WinetricksQueueState {
  return {
    runner: runner as WinetricksQueueState['runner'],
    appName,
    run: null,
    busy: false,
    environment: { unsupportedWineVersion: null, missingDependencies: [] }
  }
}

export default function WinetricksSettings() {
  const { appName, runner } = useContext(SettingsContext)
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')

  // D-03: true once any of the three invoke-kind probes below decline under Tauri.
  const [declined, setDeclined] = useState(false)
  const [loadingAvailable, setLoadingAvailable] = useState(true)
  const [allComponents, setAllComponents] = useState<WinetricksComponent[]>([])
  const [installed, setInstalled] = useState<string[]>([])
  const [queueState, setQueueState] = useState<WinetricksQueueState>(() =>
    emptyQueueState(runner ?? '', appName)
  )
  const [selection, setSelection] = useState<string[]>([])

  // Mirrors `Tools/index.tsx`'s own early return: the parent
  // (`GamesSettings`) only mounts this component when `shouldShowWinetricksTab`
  // is true, which already requires a runner -- this narrows the type for
  // every `window.api.winetricks*` call below rather than re-deciding
  // visibility here.
  if (!runner) {
    return <></>
  }
  // Closures below (the mount effect's inner functions, `applyVerbs`,
  // `cancelRemaining`) are declared with `function`, not inline -- TS does
  // not carry the `if (!runner)` narrowing above into a nested function
  // declaration's body, so every `window.api.winetricks*` call needs a
  // binding TS already knows is `Runner`, not `Runner | undefined`.
  const safeRunner: Runner = runner

  // C-1 / D-17 (Phase 44 remount lesson): this mount's ONLY condition is
  // `!declined`. Neither `loadingAvailable` nor `queueState.busy` may ever
  // gate it -- a stacked gate here is exactly the bug class that lesson
  // closed for the old `Winetricks` dialog.
  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      setLoadingAvailable(true)
      const availableResult = await callOrDeclare({
        channel: WINETRICKS_CHANNEL_BY_METHOD.winetricksListAvailable,
        feature: WINETRICKS_FEATURE,
        deferral: DEFERRAL_D03,
        call: () => window.api.winetricksListAvailable(safeRunner, appName)
      })
      if (cancelled) return
      if (!availableResult.ok) {
        setDeclined(true)
        setLoadingAvailable(false)
        return
      }
      setAllComponents(availableResult.value)

      const installedResult = await callOrDeclare({
        channel: WINETRICKS_CHANNEL_BY_METHOD.winetricksListInstalled,
        feature: WINETRICKS_FEATURE,
        deferral: DEFERRAL_D03,
        call: () => window.api.winetricksListInstalled(safeRunner, appName)
      })
      if (cancelled) return
      if (!installedResult.ok) {
        setDeclined(true)
        setLoadingAvailable(false)
        return
      }
      setInstalled(installedResult.value)

      const stateResult = await callOrDeclare({
        channel: WINETRICKS_CHANNEL_BY_METHOD.winetricksQueueState,
        feature: WINETRICKS_FEATURE,
        deferral: DEFERRAL_D03,
        call: () => window.api.winetricksQueueState(safeRunner, appName)
      })
      if (cancelled) return
      if (!stateResult.ok) {
        setDeclined(true)
        setLoadingAvailable(false)
        return
      }
      setQueueState(stateResult.value)
      setLoadingAvailable(false)
    }

    void loadAll()

    async function reloadInstalled() {
      const result = await callOrDeclare({
        channel: WINETRICKS_CHANNEL_BY_METHOD.winetricksListInstalled,
        feature: WINETRICKS_FEATURE,
        deferral: DEFERRAL_D03,
        call: () => window.api.winetricksListInstalled(safeRunner, appName)
      })
      if (!cancelled && result.ok) {
        setInstalled(result.value)
      }
    }

    function onQueueChanged(
      _event: IpcRendererEvent,
      state: WinetricksQueueState
    ) {
      if (state.runner !== runner || state.appName !== appName) return
      const wasRunning = queueState.run?.status === 'running'
      setQueueState(state)
      if (wasRunning && state.run?.status === 'done') {
        void reloadInstalled()
      }
    }

    const removeListener =
      window.api.handleWinetricksQueueChanged(onQueueChanged)

    return () => {
      cancelled = true
      removeListener()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appName, runner])

  // winetricksInstall (send-kind) has no method/channel split and can fail
  // silently if mis-routed; the invoke-kind probes above are the only
  // honest decline signal, so every `window.api.winetricks*` call below is
  // gated the same way.
  const WINETRICKS_DECLINED_GUARD = declined

  async function applyVerbs(verbs: string[]) {
    if (WINETRICKS_DECLINED_GUARD) return
    const result = await callOrDeclare({
      channel: WINETRICKS_CHANNEL_BY_METHOD.winetricksApply,
      feature: WINETRICKS_FEATURE,
      deferral: DEFERRAL_D03,
      call: () => window.api.winetricksApply(safeRunner, appName, verbs)
    })
    if (!result.ok) return
    if (result.value.accepted) {
      setQueueState(result.value.state)
      setSelection([])
    }
    // On refusal (busy/invalid), keep the current selection untouched.
  }

  async function cancelRemaining() {
    if (WINETRICKS_DECLINED_GUARD) return
    const result = await callOrDeclare({
      channel: WINETRICKS_CHANNEL_BY_METHOD.winetricksCancelRemaining,
      feature: WINETRICKS_FEATURE,
      deferral: DEFERRAL_D03,
      call: () => window.api.winetricksCancelRemaining(safeRunner, appName)
    })
    if (result.ok) {
      setQueueState(result.value)
    }
  }

  function toggleVerb(verb: string) {
    if (queueState.busy) return
    setSelection((current) =>
      current.includes(verb)
        ? current.filter((v) => v !== verb)
        : [...current, verb]
    )
  }

  function outcomeFor(verb: string): WinetricksVerbOutcome | undefined {
    return queueState.run?.outcomes[verb]
  }

  const curated = resolveCuratedComponents(allComponents)
  const run = queueState.run
  const isRunning = run?.status === 'running'
  const isDone = run?.status === 'done'

  let installedCount = 0
  let failedCount = 0
  if (run) {
    for (const outcome of Object.values(run.outcomes)) {
      if (outcome === 'installed') installedCount++
      if (outcome === 'failed') failedCount++
    }
  }

  const currentVerbTitle =
    (run?.currentVerb &&
      curated.find((c) => c.verb === run.currentVerb)?.title) ||
    run?.currentVerb ||
    ''
  const currentIndex = run ? run.verbs.indexOf(run.currentVerb ?? '') + 1 : 0

  return (
    <div className="WinetricksSettings">
      {declined && (
        <div className="WinetricksSettings__declined">
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

      {!declined && loadingAvailable && (
        <span>
          {t(
            'winetricks.loading-available',
            'Loading available components ...'
          )}
        </span>
      )}

      {!declined && !loadingAvailable && (
        <>
          <h3 className="WinetricksSettings__heading">
            {tGamelib(
              'winetricksBrowse.suggestedHeading',
              'Suggested for this game'
            )}
          </h3>
          <ul className="WinetricksSettings__rows">
            {curated.map((component) => {
              const outcome = outcomeFor(component.verb)
              const isInstalled =
                installed.includes(component.verb) || outcome === 'installed'
              const isFailed = outcome === 'failed'
              const isInstalling = run?.currentVerb === component.verb
              const titleId = `winetricks-row-title-${component.verb}`
              return (
                <li key={component.verb} className="WinetricksSettings__row">
                  <span id={titleId} className="WinetricksSettings__rowTitle">
                    {component.title}
                  </span>
                  {isInstalling && (
                    <span className="WinetricksSettings__rowStatus">
                      {tGamelib(
                        'winetricksBrowse.phaseInstalling',
                        'Installing…'
                      )}
                    </span>
                  )}
                  {!isInstalling && isFailed && (
                    <span className="WinetricksSettings__rowStatus WinetricksSettings__rowStatus--failed">
                      {tGamelib(
                        'winetricksBrowse.installFailedTag',
                        'Install failed'
                      )}
                    </span>
                  )}
                  {!isInstalling && !isFailed && isInstalled && (
                    <span className="WinetricksSettings__rowStatus WinetricksSettings__rowStatus--installed">
                      {tGamelib('winetricksBrowse.installedTag', 'Installed')}
                    </span>
                  )}
                  {!isInstalling && !isFailed && !isInstalled && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selection.includes(component.verb)}
                      aria-labelledby={titleId}
                      disabled={queueState.busy}
                      onClick={() => toggleVerb(component.verb)}
                      className="WinetricksSettings__rowCheckbox"
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {!declined && !loadingAvailable && (
        <div className="WinetricksSettings__bar">
          {!isRunning && !isDone && (
            <>
              <span>
                {tGamelib('winetricksBrowse.selectedCount', {
                  count: selection.length,
                  defaultValue: '{{count}} selected',
                  defaultValue_one: '{{count}} selected'
                })}
              </span>
              <button
                type="button"
                disabled={selection.length === 0 || queueState.busy}
                aria-label={tGamelib('winetricksBrowse.applyAriaLabel', {
                  count: selection.length,
                  defaultValue: 'Apply {{count}} selected components',
                  defaultValue_one: 'Apply {{count}} selected component'
                })}
                onClick={() => applyVerbs(selection)}
              >
                {tGamelib('winetricksBrowse.apply', 'Apply')}
              </button>
            </>
          )}

          {isRunning && (
            <>
              <span>
                {tGamelib('winetricksBrowse.installingBar', {
                  current: currentIndex,
                  total: run?.verbs.length ?? 0,
                  title: currentVerbTitle,
                  defaultValue:
                    'Installing {{current}} of {{total}} · {{title}}'
                })}
              </span>
              <button type="button" onClick={() => cancelRemaining()}>
                {tGamelib(
                  'winetricksBrowse.cancelRemaining',
                  'Cancel remaining'
                )}
              </button>
            </>
          )}

          {isDone && (
            <span>
              {tGamelib('winetricksBrowse.installedCount', {
                count: installedCount,
                defaultValue: '{{count}} installed',
                defaultValue_one: '{{count}} installed'
              })}
              {failedCount > 0 && (
                <span className="WinetricksSettings__barFailed">
                  {tGamelib('winetricksBrowse.failedCount', {
                    count: failedCount,
                    defaultValue: '{{count}} failed',
                    defaultValue_one: '{{count}} failed'
                  })}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
