import { useTranslation } from 'react-i18next'
import { ColourField } from './ColourField'
import { resolveTokenLabel } from './tokenLabels'

interface TokenRowProps {
  token: string
  value: string
  onCommit: (token: string, value: string) => void
}

/**
 * One core token: its label, the token name and a ColourField (swatch, alpha picker and a
 * validated text input). Only canonical values reach `onCommit`.
 */
export function TokenRow({ token, value, onCommit }: TokenRowProps) {
  const { t } = useTranslation()
  const inputId = `token${token}`
  const label = resolveTokenLabel(token, t)

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
      />
    </div>
  )
}
