import type { ReactNode } from 'react'
import classNames from 'classnames'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faLock } from '@fortawesome/free-solid-svg-icons'
import { ThemeThumbnail } from './ThemeThumbnail'
import './index.scss'

interface ThemeCardProps {
  themeKey: string
  name: string
  tokens: Readonly<Record<string, string>>
  base: string
  active: boolean
  readOnly: boolean
  onApply: () => void
  /** Rendered outside the apply button so no interactive element nests inside it. */
  actions?: ReactNode
}

/**
 * One gallery card. The apply button wraps the thumbnail and the name row (the whole click target
 * for "click applies"); the action row sits beside it, never inside it. Markup avoids bare
 * span/label because `.Accessibility` forces those to --text-xl.
 */
export function ThemeCard({
  themeKey,
  name,
  tokens,
  base,
  active,
  readOnly,
  onApply,
  actions
}: ThemeCardProps) {
  const { t } = useTranslation()
  const readOnlyText = t(
    'gamelib:customThemes.builtInReadOnly',
    'Built-in theme, read-only'
  )

  return (
    <div
      className={classNames('themeCard', { 'themeCard--active': active })}
      data-theme-key={themeKey}
    >
      <button
        type="button"
        className="themeCard__apply"
        aria-current={active ? 'true' : undefined}
        onClick={onApply}
      >
        <ThemeThumbnail tokens={tokens} base={base} />
        <div className="themeCard__nameRow">
          <p className="themeCard__name" title={name}>
            {name}
          </p>
          {readOnly && (
            <FontAwesomeIcon
              className="themeCard__lock"
              icon={faLock}
              title={readOnlyText}
              aria-hidden="true"
            />
          )}
        </div>
        {readOnly && <small className="themeCard__sr">{readOnlyText}</small>}
        {active && (
          <small className="themeCard__activeMark">
            <FontAwesomeIcon icon={faCheck} aria-hidden="true" />{' '}
            {t('gamelib:customThemes.active', 'Active')}
          </small>
        )}
      </button>
      {actions && <div className="themeCard__actions">{actions}</div>}
    </div>
  )
}
