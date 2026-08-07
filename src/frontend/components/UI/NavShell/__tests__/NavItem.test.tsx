/**
 * Structural tests for `NavItem`, the tier-2 row primitive ported from
 * `Sidebar/components/SidebarItem` (34.10-02 Task 1) and re-parented off
 * the retired `.Sidebar` ancestor onto `.NavShell__tier2`.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `NavItem` is invoked directly
 * as a plain function and its returned React-element object graph is
 * inspected without a DOM, following the "mock react-router-dom + call the
 * component directly" pattern established by
 * `SidebarLinks/__tests__/index.test.tsx`. The colocated `index.scss` side-
 * effect import is mocked the same way `StoreSearchScreen.test.tsx` mocks
 * its colocated `index.css` (no CSS transform configured for this jest
 * project).
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('../components/NavItem/index.scss', () => ({}))

jest.mock('react-router-dom', () => ({
  NavLink: (props: Record<string, unknown>) => ({
    type: 'mock-navlink',
    props
  })
}))

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: (props: Record<string, unknown>) => ({
    type: 'mock-fontawesome-icon',
    props
  })
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import NavItem from '../components/NavItem'

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = ReactElement<AnyProps> & { props: AnyProps }

function collectElements(
  node: ReactNode,
  out: AnyElement[] = []
): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const element = node as AnyElement
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

describe('NavItem', () => {
  it('elementType "button" returns a <button> carrying the onClick handler and no `to` prop', () => {
    const onClick = jest.fn()
    const element = NavItem({
      label: 'Redeem a Steam key',
      elementType: 'button',
      onClick
    }) as AnyElement

    expect(element.type).toBe('button')
    expect(element.props.onClick).toBe(onClick)
    expect(element.props.to).toBeUndefined()
  })

  it('no elementType returns a NavLink whose `to` is the given url', () => {
    const element = NavItem({
      label: 'Games',
      url: '/library'
    }) as AnyElement

    expect(element.type).toBe('mock-navlink')
    expect(element.props.to).toBe('/library')
  })

  it("the NavLink's className callback yields a string containing 'active' when called with isActive: true", () => {
    const element = NavItem({
      label: 'Games',
      url: '/library'
    }) as AnyElement

    const classNameFn = element.props.className as (arg: {
      isActive: boolean
    }) => string
    expect(classNameFn({ isActive: true })).toEqual(
      expect.stringContaining('active')
    )
  })

  it("the NavLink's className callback still yields 'active' when isActive: false and isActiveFallback is true", () => {
    const element = NavItem({
      label: 'Games',
      url: '/library',
      isActiveFallback: true
    }) as AnyElement

    const classNameFn = element.props.className as (arg: {
      isActive: boolean
    }) => string
    expect(classNameFn({ isActive: false })).toEqual(
      expect.stringContaining('active')
    )
  })

  it("the NavLink's className callback omits 'active' when isActive: false and isActiveFallback is unset", () => {
    const element = NavItem({
      label: 'Games',
      url: '/library'
    }) as AnyElement

    const classNameFn = element.props.className as (arg: {
      isActive: boolean
    }) => string
    expect(classNameFn({ isActive: false })).not.toEqual(
      expect.stringContaining('active')
    )
  })

  it('when an icon is supplied, the returned tree contains a FontAwesomeIcon whose title is the label', () => {
    const element = NavItem({
      label: 'Games',
      url: '/library',
      icon: ['fas', 'gamepad']
    }) as AnyElement

    const found = collectElements(element.props.children).find(
      (el) => el.type === 'mock-fontawesome-icon'
    )
    expect(found).toBeDefined()
    expect(found?.props.title).toBe('Games')
  })

  it('when no icon is supplied, the tree contains no FontAwesomeIcon', () => {
    const element = NavItem({
      label: 'Games',
      url: '/library'
    }) as AnyElement

    const found = collectElements(element.props.children).find(
      (el) => el.type === 'mock-fontawesome-icon'
    )
    expect(found).toBeUndefined()
  })
})
