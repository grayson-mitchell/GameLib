/**
 * Login-gating test for SidebarLinks' "Redeem a Steam key" entry point
 * (REQ-26-01, D-01/D-02/D-03). Wave 0 gap noted in 26-VALIDATION.md — no
 * SidebarLinks test existed before this plan.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js docstring) — SidebarLinks is invoked directly
 * as a plain function against mocked 'react' (useContext), 'react-router-dom'
 * (useLocation) and 'react-i18next' (useTranslation), following the pattern
 * established by HumbleOriginInfo.test.tsx / StoreSearchScreen.test.tsx.
 * SidebarItem and QuitButton are stubbed out (both pull in a colocated
 * index.css side-effect import with no CSS transform configured for this
 * jest project).
 */
import type { ReactElement, ReactNode } from 'react'

type MockContextValue = {
  amazon: { user_id?: string; library: unknown[] }
  epic: { username?: string; library: unknown[] }
  gog: { username?: string; library: unknown[] }
  steam: { username?: string }
  zoom: { username?: string; enabled: boolean }
  humble?: { isLoggedIn: boolean }
  platform: string
  refreshLibrary: jest.Mock
  handleExternalLinkDialog: jest.Mock
  handleRedeemKeyDialog: jest.Mock
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    amazon: { user_id: undefined, library: [] },
    epic: { username: undefined, library: [] },
    gog: { username: undefined, library: [] },
    steam: { username: undefined },
    zoom: { username: undefined, enabled: false },
    humble: { isLoggedIn: false },
    platform: 'linux',
    refreshLibrary: jest.fn(),
    handleExternalLinkDialog: jest.fn(),
    handleRedeemKeyDialog: jest.fn(),
    ...overrides
  }
}

let contextValue: MockContextValue = makeContextValue()

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue
}))

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/' })
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

jest.mock('frontend/components/UI/ExternalLinkDialog', () => ({
  SHOW_EXTERNAL_LINK_DIALOG_STORAGE_KEY: 'show_external_link_dialog'
}))

jest.mock('../../QuitButton', () => ({
  __esModule: true,
  default: () => ({ type: 'mock-quit-button', props: {} })
}))

jest.mock('../../SidebarItem', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-sidebar-item',
    props
  })
}))
;(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: jest.fn().mockReturnValue(null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
}

// Imported after the mocks above (textual order — this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import SidebarLinks from '../index'

type PropsWithChildren = {
  children?: ReactNode
  label?: string
}

function collectElements(
  node: ReactNode,
  out: ReactElement<PropsWithChildren>[] = []
): ReactElement<PropsWithChildren>[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const element = node as ReactElement<PropsWithChildren>
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function findRedeemItem(
  tree: ReactNode
): ReactElement<Record<string, unknown>> | undefined {
  return collectElements(tree).find(
    (el) => el.props?.label === 'Redeem a Steam key'
  ) as ReactElement<Record<string, unknown>> | undefined
}

describe('SidebarLinks', () => {
  it('does not show "Redeem a Steam key" when there is no Steam session', () => {
    contextValue = makeContextValue({ steam: { username: undefined } })

    const tree = SidebarLinks() as unknown as ReactElement

    expect(findRedeemItem(tree)).toBeUndefined()
  })

  it('shows "Redeem a Steam key" and opens the modal on click when logged into Steam', () => {
    const handleRedeemKeyDialog = jest.fn()
    contextValue = makeContextValue({
      steam: { username: 'TestUser' },
      handleRedeemKeyDialog
    })

    const tree = SidebarLinks() as unknown as ReactElement

    const redeemItem = findRedeemItem(tree)
    expect(redeemItem).toBeDefined()
    expect(redeemItem?.props.elementType).toBe('button')
    ;(redeemItem?.props.onClick as () => void)()
    expect(handleRedeemKeyDialog).toHaveBeenCalledWith(true)
  })
})

describe('SidebarLinks account item', () => {
  function labelsOf(tree: ReactNode): string[] {
    return collectElements(tree)
      .map((el) => el.props?.label)
      .filter((l): l is string => typeof l === 'string')
  }

  it('renders "Manage Accounts" and never "Login" when logged out', () => {
    contextValue = makeContextValue()

    const tree = SidebarLinks() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels).toContain('Manage Accounts')
    expect(labels).not.toContain('Login')
  })

  it('does not promote any item above the GameLib library link when logged out', () => {
    contextValue = makeContextValue()

    const tree = SidebarLinks() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels[0]).toBe('GameLib')
  })

  it('places Manage Accounts immediately before Accessibility when logged out', () => {
    contextValue = makeContextValue()

    const tree = SidebarLinks() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels.indexOf('Manage Accounts')).toBe(
      labels.indexOf('Accessibility') - 1
    )
  })

  it('renders the same label, position, and no promotion when logged in', () => {
    contextValue = makeContextValue({
      gog: { username: 'TestUser', library: [] }
    })

    const tree = SidebarLinks() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels).toContain('Manage Accounts')
    expect(labels).not.toContain('Login')
    expect(labels[0]).toBe('GameLib')
    expect(labels.indexOf('Manage Accounts')).toBe(
      labels.indexOf('Accessibility') - 1
    )
  })

  it('points Manage Accounts at /login in both logged-out and logged-in states', () => {
    function findManageAccountsItem(
      tree: ReactNode
    ): ReactElement<Record<string, unknown>> | undefined {
      return collectElements(tree).find(
        (el) => el.props?.label === 'Manage Accounts'
      ) as ReactElement<Record<string, unknown>> | undefined
    }

    contextValue = makeContextValue()
    const loggedOutTree = SidebarLinks() as unknown as ReactElement
    const loggedOutItem = findManageAccountsItem(loggedOutTree)
    expect(loggedOutItem?.props.url).toBe('/login')

    contextValue = makeContextValue({
      gog: { username: 'TestUser', library: [] }
    })
    const loggedInTree = SidebarLinks() as unknown as ReactElement
    const loggedInItem = findManageAccountsItem(loggedInTree)
    expect(loggedInItem?.props.url).toBe('/login')
  })
})

describe('SidebarLinks community links', () => {
  function labelsOf(tree: ReactNode): string[] {
    return collectElements(tree)
      .map((el) => el.props?.label)
      .filter((l): l is string => typeof l === 'string')
  }

  it('does not render Discord or GitHub Sponsors, but still renders Ko-fi', () => {
    contextValue = makeContextValue()

    const tree = SidebarLinks() as unknown as ReactElement
    const labels = labelsOf(tree)

    expect(labels).not.toContain('Discord')
    expect(labels).not.toContain('GitHub Sponsors')
    expect(labels).toContain('Ko-fi')
  })
})
