import { ReactNode, useState } from 'react'
import './index.scss'
import { useSuppressStoreEmbedWhile } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'

type Props = {
  title?: ReactNode | string
  children: ReactNode
  className?: string
  buttonClass?: string
}

export default function Dropdown({
  title,
  children,
  className,
  buttonClass
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Phase 40 Plan 06 (D-18/D-20): this generic component is permanently
  // mounted (it doesn't mount/unmount per open, unlike `Dialog`), so
  // suppression is acquired while `isExpanded` is true rather than for the
  // component's whole mounted lifetime. This is the single wiring point for
  // every dropdown built on this primitive -- currently the NavShell tier-2
  // filter dropdowns (`FilterFacetGroup`) and `GamePage`'s `MainButton` --
  // with no per-call-site work required for either existing consumer or any
  // future one.
  useSuppressStoreEmbedWhile(isExpanded)

  const toggle = () => {
    // `next` is computed from the render value on purpose -- do NOT turn
    // this back into the functional updater `setIsExpanded((prev) => !prev)`.
    // Where a click focuses the trigger button (WebView2 does, WKWebView does
    // not), the synthetic Tab below lands on the panel's first child and
    // synchronously fires the panel's `onFocus` -> `setIsExpanded(true)`
    // inside this same click batch. A functional updater then runs against
    // that queued `true` and flips it back: false -> true -> !true = false,
    // and the dropdown never opens (steam-caret-dropdown-dead, measured
    // live over CDP). A plain value agrees with the onFocus `true` instead.
    const next = !isExpanded
    // focus first component only when expanding -- keeps the panel
    // controller-reachable (38-C08)
    if (next) {
      window.api.gamepadAction({ action: 'tab' })
    }
    setIsExpanded(next)
  }

  return (
    <div
      className={`dropdownContainer ${className || ''}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsExpanded(false)
        }
      }}
    >
      <button
        className={`dropdownButton ${buttonClass ? buttonClass : ''}`}
        aria-expanded={isExpanded}
        onClick={toggle}
      >
        {title}
      </button>
      <div
        onFocus={() => setIsExpanded(true)}
        className={`dropdown ${isExpanded ? 'expanded' : 'collapsed'}`}
      >
        {children}
      </div>
    </div>
  )
}
