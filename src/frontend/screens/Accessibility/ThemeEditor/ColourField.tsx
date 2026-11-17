import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover } from '@mui/material'
import { HexAlphaColorPicker } from 'react-colorful'
import { normaliseColour, safeColour } from 'frontend/customThemes/colour'
import { validateColourInput } from 'frontend/customThemes/validate'

/**
 * i18n-gate-exempt: a CSS class name for the picker popover's paper, never rendered to a user
 */
const POPOVER_SLOT_PROPS = { paper: { className: 'colourField__popover' } }

interface ColourFieldProps {
  /** DOM id of the text input; the row's `<label htmlFor>` points at it. */
  id: string
  /** The row's human label, used to name the swatch. */
  label: string
  /** The last good (canonical) value. */
  value: string
  /** Called only with a canonical `#rrggbb` / `#rrggbbaa` (T-64-18). */
  onCommit: (value: string) => void
  /** Extra element id(s) describing the input, such as a contrast warning. */
  describedBy?: string
}

/**
 * A colour row's input (D-13): a swatch that opens an alpha-capable picker, and a text field
 * accepting hex or rgb()/rgba(). The typed string is never stored: only the canonical form that
 * `validateColourInput` / `normaliseColour` returns reaches `onCommit`. The native colour-type
 * input is deliberately not used (it has no alpha channel).
 */
export function ColourField({
  id,
  label,
  value,
  onCommit,
  describedBy
}: ColourFieldProps) {
  const { t } = useTranslation()
  const errorId = useId()
  const input = useRef<HTMLInputElement>(null)
  const swatch = useRef<HTMLButtonElement>(null)
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setText(value)
  }, [value])

  // A native listener, not React's onChange, so the on-screen keyboard works (as TextInputField).
  useEffect(() => {
    const element = input.current
    if (!element) return
    const handler = () => setText(element.value)
    element.addEventListener('input', handler)
    return () => element.removeEventListener('input', handler)
  }, [])

  const invalid = !validateColourInput(text).ok

  // Enter commits only a valid entry and otherwise leaves the error showing; blur reverts an
  // invalid entry to the last good value.
  const commitText = (revertInvalid: boolean) => {
    const result = validateColourInput(text)
    if (result.ok) {
      setText(result.value)
      if (result.value !== value) onCommit(result.value)
    } else if (revertInvalid) {
      setText(value)
    }
  }

  const closePicker = () => {
    setOpen(false)
    swatch.current?.focus()
  }

  const describedIds =
    [invalid ? errorId : '', describedBy ?? ''].filter(Boolean).join(' ') ||
    undefined

  return (
    <div className="colourField">
      <div className="colourField__controls">
        <button
          ref={swatch}
          type="button"
          className="colourField__swatch"
          aria-label={t(
            'gamelib:customThemes.swatchLabel',
            'Pick colour for {{label}}, currently {{value}}',
            { label, value }
          )}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span
            className="colourField__swatchFill"
            style={{ background: safeColour(value, '#00000000') }}
          />
        </button>
        <input
          ref={input}
          id={id}
          type="text"
          className="colourField__input"
          value={text}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={describedIds}
          onChange={() => {}}
          onBlur={() => commitText(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText(false)
          }}
        />
      </div>
      {invalid && (
        <p id={errorId} className="colourField__error">
          {t(
            'gamelib:customThemes.colourError',
            'Enter a hex colour like #1a2b3c or an rgba() value.'
          )}
        </p>
      )}
      <Popover
        open={open}
        anchorEl={swatch.current}
        onClose={closePicker}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={POPOVER_SLOT_PROPS}
      >
        <HexAlphaColorPicker
          color={safeColour(value, '#000000')}
          onChange={(hex) => {
            const canonical = normaliseColour(hex)
            if (canonical !== null) onCommit(canonical)
          }}
        />
      </Popover>
    </div>
  )
}
