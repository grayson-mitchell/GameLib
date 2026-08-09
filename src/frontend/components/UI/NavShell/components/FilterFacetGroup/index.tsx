/**
 * Shared collapsed facet group wrapper and checkbox facet row primitive for
 * the Games tier-2 filter panel's Store, Runnability and More-filters
 * groups (34.11-07 Task 1).
 *
 * Pure presentation only -- no context read, no translation hook, no string
 * literals. Every caller supplies already-translated labels so this file
 * cannot drift out of sync with the panel's i18n gate.
 */
import type { ReactNode } from 'react'
import classNames from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import Dropdown from '../../../Dropdown'
import './index.scss'

type FilterFacetRowProps = {
  label: string
  count?: number
  checked: boolean
  onToggle: () => void
}

// A button carrying real checkbox ARIA semantics is keyboard-operable and
// focusable natively, which is what makes it acceptable under the
// UI-SPEC's accessibility rule -- a span with a click handler is not.
export function FilterFacetRow({
  label,
  count,
  checked,
  onToggle
}: FilterFacetRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={classNames('FilterFacetRow', {
        'FilterFacetRow--checked': checked,
        'FilterFacetRow--zero': count === 0 && !checked
      })}
    >
      <span className="FilterFacetRow__box" aria-hidden="true" />
      <span className="FilterFacetRow__label">{label}</span>
      {/* `count === undefined` (not a truthiness test) so a real 0 renders */}
      {count !== undefined && (
        <span className="FilterFacetRow__count">{count}</span>
      )}
    </button>
  )
}

type FilterFacetGroupProps = {
  title: string
  className?: string
  children: ReactNode
}

export default function FilterFacetGroup({
  title,
  className,
  children
}: FilterFacetGroupProps) {
  // Caret rotation is driven purely by CSS off Dropdown's own
  // aria-expanded -- no local state mirrors it here, which is how the two
  // would get out of sync.
  return (
    <Dropdown
      className={classNames('FilterFacetGroup', className)}
      title={
        <>
          <span className="FilterFacetGroup__title">{title}</span>
          <FontAwesomeIcon
            icon={faChevronDown}
            className="FilterFacetGroup__caret"
          />
        </>
      }
    >
      {children}
    </Dropdown>
  )
}
