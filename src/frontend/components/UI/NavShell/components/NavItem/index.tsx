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
 * why the old ancestor selector could not simply be reused).
 *
 * The `'data-tour'` anchor prop, dropped by the 34.10 port because D-13
 * disabled the onboarding tour, is re-added by phase 34.12 -- the tour is
 * rebuilt against this shell and four of D-05's twelve anchors land on
 * `NavItem` rows: Wine Manager, Accessibility, Documentation and Ko-fi
 * (all NavLink-branch rows), plus D-01's launcher row (button branch).
 * The literal hyphenated key matches the repo's existing convention
 * (`AddGameButton/index.tsx`, `ActionIcons/index.tsx`) rather than a
 * camelCase `dataTour` prop.
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
  'data-tour'?: string
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
  active,
  'data-tour': dataTour
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
          data-tour={dataTour}
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
          data-tour={dataTour}
        >
          {itemContent}
        </NavLink>
      )
  }
}
