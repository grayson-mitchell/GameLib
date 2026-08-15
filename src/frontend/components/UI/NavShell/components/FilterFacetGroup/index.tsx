/**
 * Shared collapsed facet group wrapper and checkbox facet row primitive for
 * the Games tier-2 filter panel's Store, Runnability and More-filters
 * groups (34.11-07 Task 1).
 *
 * Pure presentation only -- no context read, no translation hook, no string
 * literals. Every caller supplies already-translated labels so this file
 * cannot drift out of sync with the panel's i18n gate.
 *
 * That contract is UNCHANGED by the selection badge (260815-opt Task 1): the
 * badge's NUMBER is data, not copy, and its accessible name arrives already
 * translated as `selectedCountLabel`. Where the number comes from is the
 * caller's problem too -- see `selectionCount.ts` for why every caller must
 * derive it from `describeActiveFilters`'s descriptor list rather than from
 * its own facet array.
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
  // How many of this group's filters are currently active. Both optional so
  // every pre-existing caller keeps compiling unchanged.
  selectedCount?: number
  // The badge's accessible name, ALREADY TRANSLATED. It is a prop rather
  // than a `t()` call here because this file's whole contract is that it
  // holds no translation hook and no user-facing string (see the header
  // comment): a `t()` call here would put panel copy in the one file the
  // panel's i18n gate does not scan for it.
  selectedCountLabel?: string
  children: ReactNode
}

export default function FilterFacetGroup({
  title,
  className,
  selectedCount,
  selectedCountLabel,
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
          {/*
            `> 0`, not a truthiness test and not `!== undefined`: a group
            holding no selections must render NOTHING, not a `0`. A collapsed
            group is supposed to be silent until it has something to report,
            and a permanent `0` beside every header is noise that makes the
            real counts harder to spot.

            `role="img"` is load-bearing, not decoration. A bare numeral has
            no accessible name of its own, and a `<span>` carrying only
            `aria-label` with no role is not reliably exposed by assistive
            tech -- `role="img"` is the single-element pattern that makes the
            label stick. `title` carries the same text for the sighted
            pointer case.
          */}
          {selectedCount !== undefined && selectedCount > 0 && (
            <span
              className="FilterFacetGroup__badge"
              role="img"
              aria-label={selectedCountLabel}
              title={selectedCountLabel}
            >
              {selectedCount}
            </span>
          )}
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
