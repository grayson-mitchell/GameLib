import './index.scss'

import { useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import SettingsContext from '../../SettingsContext'
import { Runner, WinetricksComponent, WinetricksQueueState } from 'common/types'
import {
  clearVerbError,
  deriveRowState,
  foldRunOutcomes,
  type VerbErrorMap
} from 'common/winetricks/deriveRowState'
import {
  resolveSuggestedComponents,
  resolveTaskGroup,
  TASK_GROUP_IDS
} from 'common/winetricks/verbs'
import type { IpcRendererEvent } from 'backend/platform'
import {
  callOrDeclare,
  WINETRICKS_FEATURE,
  WINETRICKS_CHANNEL_BY_METHOD,
  DEFERRAL_D03
} from 'frontend/helpers/declaredUnavailable'
import SuggestedGroup from './SuggestedGroup'
import TaskGroup from './TaskGroup'
import EverythingElseGroup from './EverythingElseGroup'
import WinetricksRow from './Row'
import type { RenderWinetricksRow } from './Row'

// Phase 45 (D-01/D-02/D-05-D-08/D-10/D-11): the Winetricks Settings tab. Three
// tiers top to bottom -- Suggested for this game (always open), five task
// groups (collapsed), and Everything else (collapsed, with its own search) -- all
// rendered inside the Settings screen's one scroll container, backed by the
// backend-resident sequential queue (`backend/tools/winetricksQueue.ts`).
// Every `window.api.winetricks*` call lives in this one file -- the call-site
// guard counts them here from plan 45-02 on.
//
// This component owns ALL state (selection, queue, installed list, failed
// verbs). The groups only choose which verbs to show and in which template, via
// `renderRow`, so a verb that renders in several tiers shares one selection and
// one set of row states (D-07).

// D-06 / A-45-06: the two per-game suggestion sources are awaited before the tab
// leaves its loading state so Suggested never grows after first paint. A lookup
// that fails or is slow is "no signal", never an unbounded wait.
const SIGNAL_TIMEOUT_MS = 4000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(handle)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(handle)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
}

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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export default function WinetricksSettings() {
  const { appName, runner, gameInfo } = useContext(SettingsContext)
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
  // D-06: verbs named by this game's known fixes, and the Direct3D versions
  // PCGamingWiki reports. Both default to "no signal".
  const [knownFixVerbs, setKnownFixVerbs] = useState<string[]>([])
  const [direct3DVersions, setDirect3DVersions] = useState<string[]>([])
  // D-12: verbs whose most recent attempt failed, folded from queue outcomes.
  const [erroredVerbs, setErroredVerbs] = useState<VerbErrorMap>({})
  // The run id whose completion has already triggered an installed-list
  // re-read. A ref, not state: the queue listener below is created once per
  // (appName, runner) and would otherwise close over a stale copy.
  const reloadedRunId = useRef<number | null>(null)

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

    async function fetchKnownFixVerbs(): Promise<string[]> {
      try {
        const info = await withTimeout(
          window.api.getKnownFixes(appName, safeRunner),
          SIGNAL_TIMEOUT_MS
        )
        return stringArray(info?.winetricks)
      } catch {
        return []
      }
    }

    async function fetchDirect3DVersions(): Promise<string[]> {
      if (!gameInfo?.title) return []
      try {
        const info = await withTimeout(
          window.api.getWikiGameInfo(gameInfo.title, appName, safeRunner),
          SIGNAL_TIMEOUT_MS
        )
        return stringArray(info?.pcgamingwiki?.direct3DVersions)
      } catch {
        return []
      }
    }

    async function loadAll() {
      setLoadingAvailable(true)
      // Started first so the lookups overlap the catalog read; neither can
      // reject (each resolves to "no signal"), so awaiting them late is safe.
      const signals = Promise.all([
        fetchKnownFixVerbs(),
        fetchDirect3DVersions()
      ])

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
      // D-18: a remounted tab rebuilds failed rows from the state the backend
      // still holds. The installed list above is already fresh, so a finished
      // run found here needs no further re-read.
      setErroredVerbs((current) =>
        foldRunOutcomes(current, stateResult.value.run)
      )
      if (stateResult.value.run?.status === 'done') {
        reloadedRunId.current = stateResult.value.run.runId
      }

      const [fixVerbs, d3dVersions] = await signals
      if (cancelled) return
      setKnownFixVerbs(fixVerbs)
      setDirect3DVersions(d3dVersions)
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
      setQueueState(state)
      setErroredVerbs((current) => foldRunOutcomes(current, state.run))
      if (
        state.run?.status === 'done' &&
        reloadedRunId.current !== state.run.runId
      ) {
        reloadedRunId.current = state.run.runId
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
      // A fresh attempt started for these verbs, so a previous failure no
      // longer applies (D-15). Cleared only once the backend accepted the run:
      // a refused Retry leaves the row failed.
      setErroredVerbs((current) => verbs.reduce(clearVerbError, current))
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

  const run = queueState.run
  const isRunning = run?.status === 'running'
  const isDone = run?.status === 'done'
  // Nothing can be ticked or retried while a run is in flight or the backend
  // reports a foreign install (D-13).
  const locked = queueState.busy || isRunning

  // A verb this run has already installed is Installed immediately, without
  // waiting for the installed-list re-read at the end of the run.
  const installedForRows = run
    ? [
        ...installed,
        ...Object.keys(run.outcomes).filter(
          (verb) =>
            run.outcomes[verb] === 'installed' && !installed.includes(verb)
        )
      ]
    : installed

  // Live download percentage for the installing row: the latest meaningful
  // line in the run log, when it is a classified curl progress row. A progress
  // line followed by anything but wine noise means the download has ended.
  let currentPercent: number | undefined
  if (run) {
    for (let i = run.log.length - 1; i >= 0; i--) {
      const line = run.log[i]
      if (line.kind === 'noise') continue
      if (line.kind === 'progress' && line.percent !== undefined) {
        currentPercent = line.percent
      }
      break
    }
  }

  function toggleVerb(verb: string) {
    if (locked) return
    if (installedForRows.includes(verb)) return
    setSelection((current) =>
      current.includes(verb)
        ? current.filter((v) => v !== verb)
        : [...current, verb]
    )
  }

  function retryVerb(verb: string) {
    void applyVerbs([verb])
  }

  const renderRow: RenderWinetricksRow = (
    component,
    template,
    showCategory
  ) => {
    const rowState = deriveRowState({
      verb: component.verb,
      installed: installedForRows,
      selected: selection.includes(component.verb),
      run,
      erroredVerbs
    })
    return (
      <WinetricksRow
        key={component.verb}
        component={component}
        rowState={rowState}
        template={template}
        locked={locked}
        percent={rowState === 'installing' ? currentPercent : undefined}
        showDone={isRunning && run?.outcomes[component.verb] === 'installed'}
        showCategory={showCategory}
        onToggle={toggleVerb}
        onRetry={retryVerb}
      />
    )
  }

  const suggested = resolveSuggestedComponents({
    catalog: allComponents,
    knownFixVerbs,
    direct3DVersions
  })

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
      allComponents.find((c) => c.verb === run.currentVerb)?.title) ||
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
          <SuggestedGroup
            gameSpecific={suggested.gameSpecific}
            curated={suggested.curated}
            renderRow={renderRow}
          />
          {TASK_GROUP_IDS.map((id) => (
            <TaskGroup
              key={id}
              id={id}
              components={resolveTaskGroup(allComponents, id)}
              renderRow={renderRow}
            />
          ))}
          <EverythingElseGroup
            components={allComponents}
            renderRow={renderRow}
          />
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
