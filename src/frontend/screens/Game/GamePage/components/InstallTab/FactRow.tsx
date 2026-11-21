import type { ComponentProps, MouseEvent, ReactNode } from 'react'
import classNames from 'classnames'
import { RowFailure } from './SwitchRow'

interface FactRowProps {
  label: string
  /** The value, passed as children so a test can walk `props.children`. */
  children?: ReactNode
  /** Full value for the tooltip when CSS ellipsises the visible text. */
  valueTitle?: string
  actions?: ReactNode
  failure?: ComponentProps<typeof RowFailure>
  className?: string
}

interface FactActionProps {
  label: string
  /** D-10: the label while this action runs, e.g. "Moving…". */
  busyLabel?: string
  busy?: boolean
  disabled?: boolean
  /** D-11: the tooltip naming why the action is unavailable. */
  disabledReason?: string
  variant?: 'button' | 'link'
  /** The event is forwarded so a caller can anchor a menu to the button. */
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}

/**
 * Phase 100 (D-01). One Install-tab fact: a label, its value and the actions
 * that change that value, with an inline failure under the row (D-12, D-18).
 *
 * Hook-free on purpose, so it can be called as a plain function in a test.
 */
export function FactRow({
  label,
  children,
  valueTitle,
  actions,
  failure,
  className
}: FactRowProps) {
  return (
    <div className={classNames('fact', className)}>
      <b className="fact__label">{label}</b>
      <span className="fact__value" title={valueTitle}>
        {children}
      </span>
      {actions ? <div className="fact__actions">{actions}</div> : null}
      {failure ? <RowFailure {...failure} /> : null}
    </div>
  )
}

/**
 * Phase 100 (D-10, D-11). An action attached to a fact. While busy the button
 * reads its busy label and pulses; while disabled it keeps `title` (the
 * reason) and stays in the focus ring, so `aria-disabled` plus an early
 * return replace the `disabled` attribute (research Pitfall 9).
 */
export function FactAction({
  label,
  busyLabel,
  busy,
  disabled,
  disabledReason,
  variant = 'button',
  onClick
}: FactActionProps) {
  const inert = Boolean(busy || disabled)

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (inert) return
    onClick(event)
  }

  return (
    <button
      type="button"
      className={classNames(variant === 'link' ? 'factLink' : 'factButton', {
        'is-busy': busy
      })}
      aria-disabled={inert ? true : undefined}
      aria-busy={busy ? true : undefined}
      title={disabled ? disabledReason : undefined}
      onClick={handleClick}
    >
      {busy && busyLabel ? busyLabel : label}
    </button>
  )
}
