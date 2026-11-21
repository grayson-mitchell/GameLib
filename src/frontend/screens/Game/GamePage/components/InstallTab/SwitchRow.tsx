import type { KeyboardEvent } from 'react'
import classNames from 'classnames'

interface RowFailureProps {
  message: string
  retryLabel: string
  onRetry: () => void
}

interface SwitchRowProps {
  id: string
  label: string
  description?: string
  checked: boolean
  busy?: boolean
  busyLabel?: string
  disabled?: boolean
  disabledReason?: string
  failure?: RowFailureProps
  onToggle: () => void
}

/**
 * Phase 100 (D-01, D-12, D-18). Inline failure for a row: a fixed, translated
 * message plus a Retry link, never a modal (T-100-01: the raw error reaches
 * the log only, never this text).
 */
export function RowFailure({ message, retryLabel, onRetry }: RowFailureProps) {
  return (
    <p className="rowFailure" role="alert">
      {message}{' '}
      <button type="button" className="rowFailure__retry" onClick={onRetry}>
        {retryLabel}
      </button>
    </p>
  )
}

/**
 * Phase 100 (D-01). One Install-tab switch row: a noun label that never flips,
 * a right-aligned switch track and a one-line description. State is shown by
 * `aria-checked` and the track position alone.
 *
 * Pending lives inside the row: the track pulses and an aside reads
 * "Adding..." or "Removing..."; nothing is swapped for a spinner. While busy
 * or disabled the row ignores clicks and keys.
 *
 * Hook-free on purpose, so it can be called as a plain function in a test.
 */
export function SwitchRow({
  id,
  label,
  description,
  checked,
  busy,
  busyLabel,
  disabled,
  disabledReason,
  failure,
  onToggle
}: SwitchRowProps) {
  const inert = Boolean(busy || disabled)

  const toggle = () => {
    if (inert) return
    onToggle()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    toggle()
  }

  return (
    <div className="switchRowWrap">
      <div
        className={classNames('switchRow', { 'is-busy': busy })}
        role="switch"
        aria-checked={checked}
        aria-busy={busy ? true : undefined}
        aria-disabled={inert ? true : undefined}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={0}
        title={disabled ? disabledReason : undefined}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span className="switchRow__label" id={`${id}-label`}>
          {label}
        </span>
        {busy && busyLabel ? (
          <span className="switchRow__aside">{busyLabel}</span>
        ) : null}
        <span className="switchRow__track" aria-hidden="true" />
        {description ? (
          <span className="switchRow__desc" id={`${id}-desc`}>
            {description}
          </span>
        ) : null}
      </div>
      {failure ? <RowFailure {...failure} /> : null}
    </div>
  )
}
