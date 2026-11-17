import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import type { FloorFailure } from 'frontend/customThemes/contrastFloors'
import { formatRatio } from 'frontend/customThemes/colour'
import {
  BASE_OVERRIDDEN_TOKENS,
  PREVIEW_TOKENS
} from 'frontend/customThemes/thumbnailPalette'
import { CORE_TOKENS, LIVE_DERIVED_TOKENS } from 'frontend/customThemes/tokens'
import FieldLabel from 'frontend/components/UI/FieldLabel'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import { resolveThemeLabel } from 'frontend/components/UI/ThemeSelector/themeLabels'
import { ColourField } from './ColourField'
import { GradientField } from './GradientField'
import { resolveFloorPairLabels, resolveTokenLabel } from './tokenLabels'

/**
 * i18n-gate-exempt: a DOM id for aria-describedby, never rendered to a user
 */
const warningId = (inputId: string, floorId: string) =>
  `${inputId}-warn-${floorId}`

interface TokenRowProps {
  token: string
  value: string
  onCommit: (token: string, value: string) => void
  /** The contrast floors this token takes part in that the draft currently fails (D-15). */
  failures?: readonly FloorFailure[]
  /** The edited theme's base (used for the "Set by base theme" chip). */
  base?: string
  /** A gradient token: edited as validated raw text, never with a picker (D-14). */
  gradient?: boolean
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
  failures = [],
  base,
  gradient = false
}: TokenRowProps) {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const inputId = `token${token}`
  const label = resolveTokenLabel(token, t)
  const warnings = failures.map((failure) => {
    const { a, b } = resolveFloorPairLabels(failure, t)
    const id = warningId(inputId, failure.id)
    return {
      id,
      text: t(
        'gamelib:customThemes.contrastWarning',
        '{{a}} vs {{b}} {{ratio}}:1, needs {{min}}:1',
        { a, b, ratio: formatRatio(failure.ratio), min: failure.min }
      )
    }
  })

  // Chips on the label line (OD-1, OD-2). Each help text sits behind an icon-only (i) beside the
  // label, never under the input.
  const derivedFrom = LIVE_DERIVED_TOKENS[token] as string | undefined
  // A live-derived token is never stored on Duplicate; empty means "follow the source" (OD-1).
  const allowEmpty = derivedFrom !== undefined
  const notInPreview = CORE_TOKENS.includes(token) && !PREVIEW_TOKENS.has(token)
  const setByBase =
    base !== undefined && (BASE_OVERRIDDEN_TOKENS[base] ?? []).includes(token)
  const chips =
    derivedFrom !== undefined || notInPreview || setByBase ? (
      <span className="themeEditor__chips">
        {derivedFrom !== undefined && (
          <>
            <span className="themeEditor__chip">
              {t('gamelib:customThemes.chipDerived', 'Derived')}
            </span>
            <InfoIcon
              text={t(
                'gamelib:customThemes.chipDerivedHelp',
                'Follows {{source}} until you set a value here.',
                { source: resolveTokenLabel(derivedFrom, t) }
              )}
            />
          </>
        )}
        {notInPreview && (
          <span className="themeEditor__chip">
            {t('gamelib:customThemes.chipNotInPreview', 'Not in preview')}
          </span>
        )}
        {setByBase && (
          <>
            <span className="themeEditor__chip">
              {t('gamelib:customThemes.chipSetByBase', 'Set by base theme')}
            </span>
            <InfoIcon
              text={t(
                'gamelib:customThemes.chipSetByBaseHelp',
                '{{base}} sets this directly, so editing it doesn’t change the real app.',
                { base: resolveThemeLabel(base, tGamelib) }
              )}
            />
          </>
        )}
      </span>
    ) : undefined

  const describedBy = warnings.map((w) => w.id).join(' ') || undefined

  return (
    <div
      className={
        gradient
          ? 'themeEditor__row themeEditor__row--gradient'
          : 'themeEditor__row'
      }
    >
      <div className="themeEditor__rowText">
        <FieldLabel
          htmlId={inputId}
          label={label}
          help={chips}
          className="themeEditor__rowLabel"
        />
        <code className="themeEditor__rowToken">{token}</code>
      </div>
      {gradient ? (
        <GradientField
          id={inputId}
          label={label}
          value={value}
          allowEmpty={allowEmpty}
          onCommit={(next) => onCommit(token, next)}
          describedBy={describedBy}
        />
      ) : (
        <ColourField
          id={inputId}
          label={label}
          value={value}
          allowEmpty={allowEmpty}
          onCommit={(next) => onCommit(token, next)}
          describedBy={describedBy}
        />
      )}
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
