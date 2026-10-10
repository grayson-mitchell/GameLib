import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import classNames from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import type { WinetricksLogLine } from 'common/types'
import { useMouseDownActivate } from '../useMouseDownActivate'
import './index.scss'

type Props = {
  // The current (or most recent) run's classified lines, oldest first.
  lines: WinetricksLogLine[]
}

// One class per backend classification (D-15). `environment` is a calm
// warning, not an error, so only `error` is ever red (D-14).
const KIND_CLASS: Record<WinetricksLogLine['kind'], string> = {
  error: 'log-error',
  environment: 'log-warning',
  info: 'log-info',
  noise: 'log-noise',
  progress: 'log-progress'
}

// D-14 / UI-SPEC E9: the details log, collapsed by default behind a real
// <button aria-expanded>. The 160px region is the tab's one deliberately
// bounded secondary scroller (D-02 is about group bodies; see the stylesheet).
//
// Lines are classified in the backend and arrive here as data. Text reaches the
// DOM only as a React text node (T-45-23), and a curl progress row is shown as
// a percentage, never as the raw meter dump (ROADMAP Discard).
export default function LogPanel({ lines }: Props) {
  const { t: tGamelib } = useTranslation('gamelib')
  const activate = useMouseDownActivate()
  const [expanded, setExpanded] = useState(false)
  const regionId = useId()

  return (
    <div className="WinetricksLogPanel">
      <button
        type="button"
        className="WinetricksLogPanel__toggle"
        aria-expanded={expanded}
        aria-controls={regionId}
        {...activate(() => setExpanded((open) => !open))}
      >
        <FontAwesomeIcon
          icon={faChevronDown}
          className={classNames('WinetricksLogPanel__caret', {
            'WinetricksLogPanel__caret--expanded': expanded
          })}
        />
        {expanded
          ? tGamelib('winetricksBrowse.hideDetails', 'Hide details')
          : tGamelib('winetricksBrowse.showDetails', 'Show details')}
      </button>
      {/* The region stays in the DOM so `aria-controls` always resolves. */}
      <div
        id={regionId}
        role="log"
        className="WinetricksLogPanel__region"
        hidden={!expanded}
      >
        {expanded && lines.length === 0 && (
          <p className="WinetricksLogPanel__empty">
            {tGamelib('winetricksBrowse.logEmpty', 'No output yet.')}
          </p>
        )}
        {expanded &&
          lines.map((line, index) => (
            <div
              // Lines are append-only and never reordered, so position is stable.
              key={index}
              className={classNames(
                'WinetricksLogPanel__line',
                KIND_CLASS[line.kind]
              )}
            >
              {line.kind === 'progress'
                ? tGamelib('winetricksBrowse.phaseDownloading', {
                    percent: Math.round(line.percent ?? 0),
                    defaultValue: 'Downloading {{percent}}%'
                  })
                : line.text}
            </div>
          ))}
      </div>
    </div>
  )
}
