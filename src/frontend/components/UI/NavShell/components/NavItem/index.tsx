import { MouseEventHandler, ReactNode } from 'react'
import classNames from 'classnames'
import { NavLink } from 'react-router-dom'
import {
  FontAwesomeIcon,
  type FontAwesomeIconProps
} from '@fortawesome/react-fontawesome'
import './index.scss'

/**
 * Tier-2 row primitive (34.10-02 Task 1). A 1:1 port of the retired left
 * navigation's row-item primitive's props and NavLink/button switch --
 * only the CSS class names change (see `index.scss`'s header comment for
 * why the old ancestor selector could not simply be reused). The old
 * onboarding-tour anchor prop is dropped entirely: per D-13 the onboarding
 * tour is disabled by this phase, so its string-keyed tour-anchor
 * attribute is not carried over -- re-adding it would ship anchors for a
 * tour that does not run.
 */
interface NavItemProps {
  label: string
  labelElement?: ReactNode
  url?: string
  icon?: FontAwesomeIconProps['icon']
  isActiveFallback?: boolean
  onClick?: MouseEventHandler
  className?: string
  elementType?: 'a' | 'button'
}

export default function NavItem({
  icon,
  label,
  labelElement,
  url = '',
  isActiveFallback = false,
  onClick,
  className,
  elementType
}: NavItemProps) {
  const itemContent = (
    <>
      {icon && (
        <div className="NavItem__icon">
          <FontAwesomeIcon icon={icon} title={label} />
        </div>
      )}
      <span>{labelElement ?? label}</span>
    </>
  )

  switch (elementType) {
    case 'button':
      return (
        <button className="NavItem" onClick={onClick}>
          {itemContent}
        </button>
      )
    default:
      return (
        <NavLink
          className={({ isActive }) =>
            classNames('NavItem', className, {
              active: isActive || isActiveFallback
            })
          }
          to={url}
          onClick={onClick}
        >
          {itemContent}
        </NavLink>
      )
  }
}
