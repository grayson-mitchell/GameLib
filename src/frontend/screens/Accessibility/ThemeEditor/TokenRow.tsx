import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import type { FloorFailure } from 'frontend/customThemes/contrastFloors'
import { formatRatio } from 'frontend/customThemes/colour'
import { ColourField } from './ColourField'
import { resolveFloorPairLabels, resolveTokenLabel } from './tokenLabels'

interface TokenRowProps {
  token: string
  value: string
  onCommit: (token: string, value: string) => void
  /** The contrast floors this token takes part in that the draft currently fails (D-15). */
  failures?: readonly FloorFailure[]
}

/**
 * One core token: its label, the token name and a ColourField (swatch, alpha picker and a
 * validated text input). Only canonical values reach `onCommit`. A failing contrast pair puts a
 * warning under both of its rows; it informs and never blocks anything (D-15).
 */
export function TokenRow({
  token,
  value,
  onCommit,
  failures = []
}: TokenRowProps) {
  const { t } = useTranslation()
  const inputId = `token${token}`
  const label = resolveTokenLabel(token, t)
  const warnings = failures.map((failure) => {
    const { a, b } = resolveFloorPairLabels(failure, t)
    return {
      id: `${inputId}-warn-${failure.id}`,
      text: t(
        'gamelib:customThemes.contrastWarning',
        '{{a}} vs {{b}} {{ratio}}:1, needs {{min}}:1',
        { a, b, ratio: formatRatio(failure.ratio), min: failure.min }
      )
    }
  })

  return (
    <div className="themeEditor__row">
      <div className="themeEditor__rowText">
        <label className="themeEditor__rowLabel" htmlFor={inputId}>
          {label}
        </label>
        <code className="themeEditor__rowToken">{token}</code>
      </div>
      <ColourField
        id={inputId}
        label={label}
        value={value}
        onCommit={(next) => onCommit(token, next)}
        describedBy={warnings.map((w) => w.id).join(' ') || undefined}
      />
      {warnings.map((warning) => (
        <p key={warning.id} id={warning.id} className="themeEditor__warning">
          <FontAwesomeIcon
            icon={faTriangleExclamation}
            className="themeEditor__warningIcon"
            aria-hidden="true"
          />
          {warning.text}
        </p>
      ))}
    </div>
  )
}
