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
    // focus first component only when expanding
    if (!isExpanded) {
      window.api.gamepadAction({ action: 'tab' })
    }
    setIsExpanded((prev) => !prev)
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
