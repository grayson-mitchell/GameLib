import { ReactNode, useState } from 'react'
import './index.scss'

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
