import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { validateColourInput } from 'frontend/customThemes/validate'
import { resolveTokenLabel } from './tokenLabels'

interface TokenRowProps {
  token: string
  value: string
  onCommit: (token: string, value: string) => void
}

/**
 * One core token: its label, the token name and a text value. Typing never touches the draft;
 * Enter or blur commits the canonical form, and only when the text is a valid colour.
 * The listener is a native `input` event so the on-screen keyboard works (as TextInputField does).
 */
export function TokenRow({ token, value, onCommit }: TokenRowProps) {
  const { t } = useTranslation()
  const inputId = `token${token}`
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value)

  useEffect(() => {
    setText(value)
  }, [value])

  useEffect(() => {
    const element = input.current
    if (!element) return
    const handler = () => setText(element.value)
    element.addEventListener('input', handler)
    return () => element.removeEventListener('input', handler)
  }, [])

  const commit = () => {
    const result = validateColourInput(text)
    if (result.ok) {
      setText(result.value)
      onCommit(token, result.value)
    } else {
      setText(value)
    }
  }

  return (
    <div className="themeEditor__row">
      <div className="themeEditor__rowText">
        <label className="themeEditor__rowLabel" htmlFor={inputId}>
          {resolveTokenLabel(token, t)}
        </label>
        <code className="themeEditor__rowToken">{token}</code>
      </div>
      <input
        ref={input}
        id={inputId}
        type="text"
        className="themeEditor__rowInput"
        value={text}
        onChange={() => {}}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
    </div>
  )
}
