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
 *
 * The button branch gained `className` merging and an `active` class
 * (34.11-02 Task 1) because Views and Collections in the Games tier-2
 * filter panel are `LibraryContext` state rather than routes, so the
 * button branch is their only option, and it previously could not render
 * a selected state at all (REQ-34.11-11, 34.11-UI-SPEC
 * § "Views/Collections row control").
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
  active?: boolean
}

export default function NavItem({
  icon,
  label,
  labelElement,
  url = '',
  isActiveFallback = false,
  onClick,
  className,
  elementType,
  active
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
        <button
          className={classNames('NavItem', className, { active })}
          onClick={onClick}
        >
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
