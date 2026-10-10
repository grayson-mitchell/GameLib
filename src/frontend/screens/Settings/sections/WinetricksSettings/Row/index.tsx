import { useId } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import classNames from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowsRotate,
  faCircleCheck,
  faCircleExclamation,
  faSpinner
} from '@fortawesome/free-solid-svg-icons'
import type { WinetricksComponent } from 'common/types'
import type { WinetricksRowState } from 'common/winetricks/deriveRowState'
import { displayTitle, familyFor } from 'common/winetricks/verbs'
import { familySentence } from '../labels'
import { useMouseDownActivate } from '../useMouseDownActivate'
import './index.scss'

type WinetricksRowTemplate = 'twoLine' | 'oneLine'

type Props = {
  component: WinetricksComponent
  rowState: WinetricksRowState
  template: WinetricksRowTemplate
  // A run is in flight or the backend is busy: nothing can be ticked or retried.
  locked: boolean
  // Latest classified curl percentage for the installing row, when known.
  percent?: number
  // Shows the transient `phaseDone` word in place of the Installed tag.
  showDone: boolean
  // True only while an Everything-else search is active (D-05, D-07).
  showCategory: boolean
  onToggle: (verb: string) => void
  onRetry: (verb: string) => void
}

// D-10: the leading slot is a real checkbox whose tick means exactly one
// thing, "will be installed on Apply". An installed row renders a check icon
// plus its tag and no checkbox at all, so it cannot be selected.
//
// All upstream text (title, publisher, year, category) reaches the DOM as React
// text nodes only (T-45-20). The visible title is the cleaned title; the full
// upstream title stays on the native `title` tooltip.
export default function WinetricksRow({
  component,
  rowState,
  template,
  locked,
  percent,
  showDone,
  showCategory,
  onToggle,
  onRetry
}: Props) {
  const { t: tGamelib } = useTranslation('gamelib')
  const activate = useMouseDownActivate()
  const rowId = useId()
  const titleId = `${rowId}-title`
  const retryLabelId = `${rowId}-retry`

  const family = familyFor(component)
  // E6-partial: a verb with no family has no sentence to show, so it gets the
  // 44px one-line template rather than a 56px row with a blank second line.
  const effectiveTemplate: WinetricksRowTemplate =
    template === 'twoLine' && family ? 'twoLine' : 'oneLine'
  const sentence = family ? familySentence(tGamelib, family.family) : null

  const { publisher, year } = component
  let meta: string | null = null
  if (publisher && year) {
    meta = tGamelib('winetricksBrowse.publisherYear', {
      publisher,
      year,
      defaultValue: '{{publisher}} · {{year}}'
    })
  } else {
    meta = publisher || year || null
  }

  let lead: ReactNode = null
  let status: ReactNode = null

  switch (rowState) {
    case 'available':
    case 'selected':
    case 'queued': {
      lead = (
        <button
          type="button"
          role="checkbox"
          aria-checked={rowState !== 'available'}
          aria-labelledby={titleId}
          disabled={rowState === 'queued' || locked}
          className="WinetricksRow__checkbox"
          {...activate(() => onToggle(component.verb))}
        >
          <span className="WinetricksRow__box" aria-hidden="true" />
        </button>
      )
      break
    }

    case 'installing': {
      lead = (
        <FontAwesomeIcon
          icon={faSpinner}
          className="WinetricksRow__icon WinetricksRow__icon--installing fa-spin-pulse"
        />
      )
      status = (
        <span className="WinetricksRow__phase">
          {percent !== undefined
            ? tGamelib('winetricksBrowse.phaseDownloading', {
                percent: Math.round(percent),
                defaultValue: 'Downloading {{percent}}%'
              })
            : tGamelib('winetricksBrowse.phaseInstalling', 'Installing…')}
        </span>
      )
      break
    }

    case 'installed': {
      lead = (
        <FontAwesomeIcon
          icon={faCircleCheck}
          className="WinetricksRow__icon WinetricksRow__icon--installed"
        />
      )
      status = (
        <span className="WinetricksRow__tag WinetricksRow__tag--installed">
          {showDone
            ? tGamelib('winetricksBrowse.phaseDone', 'Done')
            : tGamelib('winetricksBrowse.installedTag', 'Installed')}
        </span>
      )
      break
    }

    case 'errored': {
      lead = (
        <FontAwesomeIcon
          icon={faCircleExclamation}
          className="WinetricksRow__icon WinetricksRow__icon--errored"
        />
      )
      status = (
        <>
          <span className="WinetricksRow__tag WinetricksRow__tag--errored">
            {tGamelib('winetricksBrowse.installFailedTag', 'Install failed')}
          </span>
          <button
            type="button"
            className="WinetricksRow__retry"
            aria-labelledby={`${retryLabelId} ${titleId}`}
            disabled={locked}
            {...activate(() => onRetry(component.verb))}
          >
            <FontAwesomeIcon icon={faArrowsRotate} />
            <span id={retryLabelId}>
              {tGamelib('winetricksBrowse.retry', 'Retry')}
            </span>
          </button>
        </>
      )
      break
    }

    default: {
      // Exhaustiveness guard: a future seventh `WinetricksRowState` member is
      // a compile error here, not a silent fall-through.
      const exhaustive: never = rowState
      throw new Error(`Unhandled WinetricksRowState: ${String(exhaustive)}`)
    }
  }

  return (
    <div
      className={classNames(
        'WinetricksRow',
        `WinetricksRow--${effectiveTemplate}`,
        `WinetricksRow--${rowState}`
      )}
      data-verb={component.verb}
    >
      <div className="WinetricksRow__lead">{lead}</div>
      <div className="WinetricksRow__text">
        <div className="WinetricksRow__titleLine">
          <span
            id={titleId}
            className="WinetricksRow__title"
            title={component.title}
          >
            {displayTitle(component.title)}
          </span>
          {meta && <span className="WinetricksRow__meta">{meta}</span>}
          {component.cached && rowState !== 'installed' && (
            <span className="WinetricksRow__cached">
              {tGamelib(
                'winetricksBrowse.cachedTag',
                'Cached (installs offline)'
              )}
            </span>
          )}
          {showCategory && (
            <span className="WinetricksRow__category">
              {component.category}
            </span>
          )}
        </div>
        {effectiveTemplate === 'twoLine' && sentence && (
          <span className="WinetricksRow__caption" title={sentence}>
            {sentence}
          </span>
        )}
      </div>
      <div className="WinetricksRow__status">{status}</div>
    </div>
  )
}
