/**
 * Structural tests for `StoresPanel`, the tier-2 Stores nav list
 * (34.10-05 Task 1, REQ-34.10-11/14) -- carries every store-related
 * destination the retired `SidebarLinks` held (`Sidebar/components/
 * SidebarLinks/index.tsx:139-190,247-255`), with its guards intact and no
 * ZOOM Platform row.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `StoresPanel` is invoked
 * directly as a plain function and its returned React-element object graph
 * is inspected without a DOM, following the "mock react (useContext) +
 * react-i18next (useTranslation) + the NavItem module" pattern established
 * by `NavItem.test.tsx` / `SidebarLinks/__tests__/index.test.tsx`. `NavItem`
 * itself is mocked (not just its colocated stylesheet) since it is a
 * CSS-importing child this panel renders, not the unit under test.
 */
import type { ReactElement, ReactNode } from 'react'

type MockContextValue = {
  humble?: { isLoggedIn: boolean }
  steam: { username?: string | null }
  zoom: { enabled: boolean; username?: string }
  handleRedeemKeyDialog: jest.Mock
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    humble: { isLoggedIn: false },
    steam: { username: undefined },
    zoom: { enabled: false, username: undefined },
    handleRedeemKeyDialog: jest.fn(),
    ...overrides
  }
}

let contextValue: MockContextValue = makeContextValue()

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

jest.mock('../components/NavItem', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-navitem',
    props
  })
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest). `element.type` from
// `React.createElement(NavItem, ...)` is a REFERENCE to whatever `NavItem`
// resolves to at import time -- not the mock factory's return value, which
// is only produced if the reference were actually CALLED. Importing the
// same mocked binding here lets tests assert type identity rather than
// invoking the element's type (see NavItem.test.tsx / 34.10-02 SUMMARY
// Deviation 1 for the bug this avoids).
import NavItem from '../components/NavItem'
import StoresPanel from '../components/StoresPanel'

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

function navItemsOf(tree: ReactNode): AnyElement[] {
  return collectElements(tree).filter((el) => el.type === NavItem)
}

function labelsOf(tree: ReactNode): string[] {
  return navItemsOf(tree)
    .map((el) => el.props?.label)
    .filter((l): l is string => typeof l === 'string')
}

describe('StoresPanel', () => {
  it('renders the eight settled rows in order when Humble and Steam are both logged in', () => {
    contextValue = makeContextValue({
      humble: { isLoggedIn: true },
      steam: { username: 'TestUser' }
    })

    const tree = StoresPanel() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels).toEqual([
      'GOG Store',
      'Steam Store',
      'Epic Store',
      'Amazon Luna',
      'Deals',
      'Store Search',
      'Humble Keys',
      'Redeem a Steam key'
    ])
  })

  it('omits Humble Keys when humble is undefined', () => {
    contextValue = makeContextValue({ humble: undefined })

    const tree = StoresPanel() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels).not.toContain('Humble Keys')
  })

  it('omits Humble Keys when humble.isLoggedIn is false', () => {
    contextValue = makeContextValue({ humble: { isLoggedIn: false } })

    const tree = StoresPanel() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels).not.toContain('Humble Keys')
  })

  it('omits Redeem a Steam key when steam.username is unset', () => {
    contextValue = makeContextValue({ steam: { username: undefined } })

    const tree = StoresPanel() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels).not.toContain('Redeem a Steam key')
  })

  it('renders Redeem a Steam key as a button whose onClick calls handleRedeemKeyDialog(true) when a Steam session exists', () => {
    const handleRedeemKeyDialog = jest.fn()
    contextValue = makeContextValue({
      steam: { username: 'TestUser' },
      handleRedeemKeyDialog
    })

    const tree = StoresPanel() as unknown as ReactElement
    const redeemItem = navItemsOf(tree).find(
      (el) => el.props?.label === 'Redeem a Steam key'
    )

    expect(redeemItem).toBeDefined()
    expect(redeemItem?.props.elementType).toBe('button')
    ;(redeemItem?.props.onClick as () => void)()
    expect(handleRedeemKeyDialog).toHaveBeenCalledWith(true)
  })

  it('never renders a Zoom Store row, even with zoom.enabled true and a zoom username', () => {
    contextValue = makeContextValue({
      zoom: { enabled: true, username: 'ZoomUser' }
    })

    const tree = StoresPanel() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels).not.toContain('Zoom Store')
    expect(labels.some((l) => /zoom/i.test(l))).toBe(false)
  })
})
