import type { KeyboardEvent, MouseEvent } from 'react'
import classNames from 'classnames'
import { activationOf, type RowActivation } from '../../actions/rowActivation'

interface RowFailureProps {
  message: string
  retryLabel: string
  onRetry: () => void
  /** True while the repeated action's own gate is disabled (D-11). */
  retryDisabled?: boolean
  /** The gate's reason tooltip, shown only while Retry is inert. */
  retryDisabledReason?: string
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
  /** Gets where the press came from (RF3); a handler that does not care ignores it. */
  onToggle: (activation: RowActivation) => void
}

/**
 * Phase 100 (D-01, D-12, D-18). Inline failure for a row: a fixed, translated
 * message plus a Retry link, never a modal (T-100-01: the raw error reaches
 * the log only, never this text). Retry follows the same gate as the action
 * it repeats (D-11): inert via `aria-disabled` plus an early return, never the
 * `disabled` attribute, so the reason tooltip shows and the control stays in
 * the gamepad focus ring.
 */
export function RowFailure({
  message,
  retryLabel,
  onRetry,
  retryDisabled,
  retryDisabledReason
}: RowFailureProps) {
  const handleRetry = () => {
    if (retryDisabled) return
    onRetry()
  }

  return (
    <p className="rowFailure" role="alert">
      {message}{' '}
      <button
        type="button"
        className="rowFailure__retry"
        aria-disabled={retryDisabled ? true : undefined}
        title={retryDisabled ? retryDisabledReason : undefined}
        onClick={handleRetry}
      >
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
 * RF3: a held key (`event.repeat`) acts once, on the press, never on the repeats
 * the OS streams while it stays down.
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

  const toggle = (activation: RowActivation) => {
    if (inert) return
    onToggle(activation)
  }

  // `event` is optional: the row's unit tests call the handlers with none.
  const onClick = (event?: MouseEvent<HTMLDivElement>) => {
    toggle(activationOf('click', event))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    // Still claimed on a repeat, so a held Space never scrolls the page.
    event.preventDefault()
    if (event.repeat) return
    toggle(activationOf('keydown', event))
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
        onClick={onClick}
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
