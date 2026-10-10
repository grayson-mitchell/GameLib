import classNames from 'classnames'
import { useTranslation } from 'react-i18next'
import type { WinetricksQueueRun } from 'common/types'
import { useMouseDownActivate } from '../useMouseDownActivate'
import './index.scss'

type Props = {
  mode: 'rest' | 'inFlight' | 'done'
  // Verbs ticked in the tab; only the rest mode reads it.
  selectedCount: number
  run: WinetricksQueueRun | null
  // Display title for a verb (the in-flight text names the verb installing).
  titleOf: (verb: string) => string
  // The backend reports an install this tab did not start (D-13).
  applyDisabled: boolean
  onApply: () => void
  onCancelRemaining: () => void
}

// The verb the in-flight text should name. Between one verb's end and the
// next one's start `currentVerb` is empty; naming the verb about to start
// keeps the text from showing a blank title in that gap.
function activeVerbOf(run: WinetricksQueueRun): string {
  if (run.verbs.includes(run.currentVerb)) {
    return run.currentVerb
  }
  return (
    run.verbs.find((verb) => run.outcomes[verb] === 'pending') ??
    run.verbs[run.verbs.length - 1] ??
    ''
  )
}

function countOutcomes(run: WinetricksQueueRun | null): {
  installed: number
  failed: number
} {
  let installed = 0
  let failed = 0
  if (run) {
    for (const outcome of Object.values(run.outcomes)) {
      if (outcome === 'installed') installed++
      if (outcome === 'failed') failed++
    }
  }
  return { installed, failed }
}

// D-11/D-12/D-13: the tab's one action bar in three modes. It takes no error
// styling of its own: recovery from a failure is the per-row Retry, so the bar
// only reports counts. Apply and Cancel go through the same mousedown-capture
// guard as every other control in the tab (Interaction Contract 2).
export default function StickyBar({
  mode,
  selectedCount,
  run,
  titleOf,
  applyDisabled,
  onApply,
  onCancelRemaining
}: Props) {
  const { t: tGamelib } = useTranslation('gamelib')
  const activate = useMouseDownActivate()

  if (mode === 'inFlight' && run) {
    const active = activeVerbOf(run)
    // T-45-24: Cancel is dead in the gap between two verbs (empty
    // `currentVerb`) and once a cancel is already on its way, so a click can
    // never race an empty queue. It stays rendered (disabled, not hidden).
    const cancelDisabled = run.currentVerb === '' || run.cancelRequested
    return (
      <div
        className={classNames(
          'WinetricksStickyBar',
          'WinetricksStickyBar--inFlight'
        )}
      >
        <span className="WinetricksStickyBar__text">
          {tGamelib('winetricksBrowse.installingBar', {
            current: run.verbs.indexOf(active) + 1,
            total: run.verbs.length,
            title: titleOf(active),
            defaultValue: 'Installing {{current}} of {{total}} · {{title}}'
          })}
        </span>
        <div className="WinetricksStickyBar__actions">
          <button
            type="button"
            className="WinetricksStickyBar__cancel"
            disabled={cancelDisabled}
            {...activate(onCancelRemaining)}
          >
            {tGamelib('winetricksBrowse.cancelRemaining', 'Cancel remaining')}
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'done') {
    const { installed, failed } = countOutcomes(run)
    return (
      <div
        className={classNames(
          'WinetricksStickyBar',
          'WinetricksStickyBar--done'
        )}
      >
        <span className="WinetricksStickyBar__text">
          <span className="WinetricksStickyBar__installed">
            {tGamelib('winetricksBrowse.installedCount', {
              count: installed,
              defaultValue: '{{count}} installed',
              defaultValue_one: '{{count}} installed'
            })}
          </span>
          {failed > 0 && (
            <span className="WinetricksStickyBar__failed">
              {tGamelib('winetricksBrowse.failedCount', {
                count: failed,
                defaultValue: '{{count}} failed',
                defaultValue_one: '{{count}} failed'
              })}
            </span>
          )}
        </span>
      </div>
    )
  }

  return (
    <div
      className={classNames('WinetricksStickyBar', 'WinetricksStickyBar--rest')}
    >
      <span className="WinetricksStickyBar__text">
        {tGamelib('winetricksBrowse.selectedCount', {
          count: selectedCount,
          defaultValue: '{{count}} selected',
          defaultValue_one: '{{count}} selected'
        })}
      </span>
      <div className="WinetricksStickyBar__actions">
        <button
          type="button"
          className="WinetricksStickyBar__apply"
          disabled={selectedCount === 0 || applyDisabled}
          aria-label={tGamelib('winetricksBrowse.applyAriaLabel', {
            count: selectedCount,
            defaultValue: 'Apply {{count}} selected components',
            defaultValue_one: 'Apply {{count}} selected component'
          })}
          {...activate(onApply)}
        >
          {tGamelib('winetricksBrowse.apply', 'Apply')}
        </button>
      </div>
    </div>
  )
}
