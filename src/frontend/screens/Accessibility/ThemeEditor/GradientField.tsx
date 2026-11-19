import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isValidGradient } from 'frontend/customThemes/validate'
import type { SupportsFn } from 'frontend/customThemes/validate'

interface GradientFieldProps {
  /** DOM id of the textarea; the row's `<label htmlFor>` points at it. */
  id: string
  /** The row's human label (kept for symmetry with ColourField; the row renders it). */
  label: string
  /** The last good value. */
  value: string
  /**
   * Called only with a gradient `isValidGradient` accepted, trimmed: exactly one gradient
   * function and nothing that can fetch or hide a fetch (T-64-12, T-64-21).
   */
  onCommit: (value: string) => void
  /** Injected in tests; defaults to `CSS.supports`, failing closed when it is absent. */
  supports?: SupportsFn
  /** A live-derived token may be left empty: it then follows its source (OD-1). */
  allowEmpty?: boolean
  /** Extra element id(s) describing the textarea. */
  describedBy?: string
}

/**
 * Raw-text gradient editing (D-14): a two-row monospace textarea, validated on every change by
 * `isValidGradient` (exactly one gradient function, and nothing that can fetch or hide a fetch,
 * all refused BEFORE the engine is asked), committed on blur when valid and reverted when not. There is no picker. The
 * 24px strip below paints only the last value that validated, so an untrusted string can never
 * reach an inline `background-image` (T-64-21).
 */
export function GradientField({
  id,
  value,
  onCommit,
  supports,
  allowEmpty = false,
  describedBy
}: GradientFieldProps) {
  const { t } = useTranslation()
  const errorId = useId()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(value)
  const [lastValid, setLastValid] = useState(() =>
    isValidGradient(value, supports) ? value.trim() : ''
  )

  useEffect(() => {
    setText(value)
  }, [value])

  // A native listener, not React's onChange, so the on-screen keyboard works (as ColourField).
  useEffect(() => {
    const element = textarea.current
    if (!element) return
    const handler = () => setText(element.value)
    element.addEventListener('input', handler)
    return () => element.removeEventListener('input', handler)
  }, [])

  const accepts = (candidate: string) =>
    (allowEmpty && candidate.trim() === '') ||
    isValidGradient(candidate, supports)

  useEffect(() => {
    if (isValidGradient(text, supports)) setLastValid(text.trim())
    else if (allowEmpty && text.trim() === '') setLastValid('')
  }, [text, supports, allowEmpty])

  // Only an edit can be wrong: an untouched stored value never shows an error.
  const invalid = text !== value && !accepts(text)

  const commitText = () => {
    if (accepts(text)) {
      const next = text.trim()
      if (next !== value.trim()) {
        setText(next)
        onCommit(next)
      }
    } else {
      setText(value)
    }
  }

  const describedIds =
    [invalid ? errorId : '', describedBy ?? ''].filter(Boolean).join(' ') ||
    undefined

  return (
    <div className="gradientField">
      <textarea
        ref={textarea}
        id={id}
        rows={2}
        className="gradientField__input"
        value={text}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={invalid}
        aria-describedby={describedIds}
        onChange={() => {}}
        onBlur={commitText}
      />
      {invalid && (
        <p id={errorId} className="gradientField__error">
          {t(
            'gamelib:customThemes.gradientError',
            'Enter a plain CSS gradient, for example linear-gradient(90deg, #000, #333). var() and url() aren’t allowed.'
          )}
        </p>
      )}
      <div
        className="gradientField__strip"
        aria-hidden="true"
        data-gradient={lastValid}
        style={{ backgroundImage: lastValid || undefined }}
      />
    </div>
  )
}
