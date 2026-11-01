import './index.css'

import { MouseEvent } from 'react'

interface Props {
  onClick: (e: MouseEvent) => void
  children: JSX.Element
  className?: string
  disabled?: boolean
  title?: string
  'aria-label'?: string
}

export default function SvgButton({
  onClick,
  children,
  className = '',
  disabled = false,
  title = undefined,
  'aria-label': ariaLabel = undefined
}: Props) {
  return (
    <button
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`svg-button ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
