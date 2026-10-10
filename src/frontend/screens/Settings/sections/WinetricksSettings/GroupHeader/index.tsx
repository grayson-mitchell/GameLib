import classNames from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { useMouseDownActivate } from '../useMouseDownActivate'
import './index.scss'

type Props = {
  // Already translated by the caller; this component holds no copy of its own.
  label: string
  // Bare member count, no plural word (E4-zero-one-many).
  count?: number
  // Absent means a static, non-collapsible header (the Suggested group). Present
  // means a disclosure: `onToggle` is then required in practice.
  expanded?: boolean
  onToggle?: () => void
  // `id` of the body this header governs, for `aria-controls`.
  controlsId?: string
}

// The `FilterFacetGroup` disclosure CONTRACT (caret rotation, uppercase
// bold-tracked label, tabular-nums count badge) declared under this tab's own
// CSS scope. It is deliberately not the NavShell component instance: that one
// is selector-scoped to `.NavShell__tier2Portal` and consumes the navbar
// custom-property chain this surface is banned from using (D-21), and reusing a component
// across an unrelated ancestor scope is the cross-context CSS leak this
// codebase has already paid for twice.
//
// A collapsible header is a real <button aria-expanded>, never a <div onClick>
// (UI-SPEC Interaction Contract 1), and goes through the mousedown-capture
// guard like every other control in the tab (Contract 2).
export default function GroupHeader({
  label,
  count,
  expanded,
  onToggle,
  controlsId
}: Props) {
  const activate = useMouseDownActivate()

  if (expanded === undefined) {
    return (
      <h3 className="WinetricksGroupHeader WinetricksGroupHeader--static">
        <span className="WinetricksGroupHeader__label">{label}</span>
      </h3>
    )
  }

  return (
    <button
      type="button"
      className="WinetricksGroupHeader WinetricksGroupHeader--button"
      aria-expanded={expanded}
      aria-controls={controlsId}
      {...activate(() => onToggle?.())}
    >
      <span className="WinetricksGroupHeader__label" title={label}>
        {label}
      </span>
      {count !== undefined && (
        <span className="WinetricksGroupHeader__count">{count}</span>
      )}
      <FontAwesomeIcon
        icon={faChevronDown}
        className={classNames('WinetricksGroupHeader__caret', {
          'WinetricksGroupHeader__caret--expanded': expanded
        })}
      />
    </button>
  )
}
