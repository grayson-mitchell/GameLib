/**
 * Structural tests for `NavShell`, the app-level navigation shell root
 * (34.10-07, REQ-34.10-01/11/12/13) that replaces the retired left
 * navigation (`Sidebar/index.tsx`).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `NavShell` is invoked directly
 * as a plain function and its returned React-element object graph is
 * inspected without a DOM. `react-router-dom` (`useLocation`, `useNavigate`),
 * `window.api`, the PNG wordmark asset import, and every CSS-importing child
 * component are mocked so this file only exercises the shell root's own
 * assembly logic -- each child's own behavior is covered by its own suite
 * (NavTabsComponent.test.tsx, DownloadsRing.test.tsx, StoresPanel.test.tsx,
 * SettingsPanel.test.tsx, GamesPanel.test.tsx).
 *
 * No DOM-rendering or event-simulation helpers are used anywhere in this
 * file.
 */
import { Fragment } from 'react'
import type { ReactElement, ReactNode } from 'react'

type MockPortalContextValue = { filled: boolean }

let contextValue: MockPortalContextValue = { filled: false }
let pathname = '/'
let effectCleanup: void | (() => void)

jest.mock('../index.scss', () => ({}))
jest.mock('frontend/assets/gamelib-icon.png', () => 'mock-icon.png')

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue,
  useEffect: (effect: () => void | (() => void)) => {
    effectCleanup = effect()
  }
}))

const navigateMock = jest.fn()
jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname }),
  useNavigate: () => navigateMock
}))

jest.mock('../components/NavTabs', () => ({
  __esModule: true,
  default: () => ({ type: 'mock-navtabs', props: {} })
}))
jest.mock('../components/DownloadsRing', () => ({
  __esModule: true,
  default: () => ({ type: 'mock-downloadsring', props: {} })
}))
jest.mock('../components/GamesPanel', () => ({
  __esModule: true,
  default: () => ({ type: 'mock-gamespanel', props: {} })
}))
jest.mock('../components/StoresPanel', () => ({
  __esModule: true,
  default: () => ({ type: 'mock-storespanel', props: {} })
}))
jest.mock('../components/SettingsPanel', () => ({
  __esModule: true,
  default: () => ({ type: 'mock-settingspanel', props: {} })
}))
jest.mock('../components/HeroicVersion', () => ({
  __esModule: true,
  default: () => ({ type: 'mock-heroicversion', props: {} })
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest). `element.type` from
// `React.createElement(X, ...)` is a REFERENCE to whatever `X` resolves to
// at import time, not the mock factory's return value -- import the same
// mocked bindings so tests can assert type identity (mirrors
// NavTabsComponent.test.tsx / StoresPanel.test.tsx).
import NavTabs from '../components/NavTabs'
import DownloadsRing from '../components/DownloadsRing'
import GamesPanel from '../components/GamesPanel'
import StoresPanel from '../components/StoresPanel'
import SettingsPanel from '../components/SettingsPanel'
import HeroicVersion from '../components/HeroicVersion'
import NavShell from '../index'

const handleGoToScreenMock = jest.fn()
;(
  globalThis as unknown as {
    window: { api: { handleGoToScreen: typeof handleGoToScreenMock } }
  }
).window = {
  api: { handleGoToScreen: handleGoToScreenMock }
}

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

function callNavShell(): AnyElement {
  return NavShell() as unknown as AnyElement
}

function shellChildren(): { navbar: AnyElement; tier2: AnyElement } {
  const tree = callNavShell()
  expect(tree.type).toBe(Fragment)
  const kids = tree.props.children as AnyElement[]
  expect(kids).toHaveLength(2)
  return { navbar: kids[0], tier2: kids[1] }
}

beforeEach(() => {
  contextValue = { filled: false }
  pathname = '/'
  effectCleanup = undefined
  navigateMock.mockClear()
  handleGoToScreenMock.mockClear()
  handleGoToScreenMock.mockReturnValue(jest.fn())
})

describe('NavShell', () => {
  it('returns a fragment whose two children carry className NavShell__navbar and NavShell__tier2', () => {
    const { navbar, tier2 } = shellChildren()

    expect(navbar.props.className).toBe('NavShell__navbar')
    expect(tier2.props.className).toEqual(
      expect.stringContaining('NavShell__tier2')
    )
  })

  it.each(['accounts', 'games', 'stores', 'settings', null] as const)(
    'mounts HeroicVersion for activeTab %s',
    (tab) => {
      pathname =
        tab === 'accounts'
          ? '/login'
          : tab === 'games'
            ? '/'
            : tab === 'stores'
              ? '/store/epic'
              : tab === 'settings'
                ? '/settings/general'
                : '/download-manager'

      const { tier2 } = shellChildren()
      const heroicVersionEl = collectElements(tier2.props.children).find(
        (el) => el.type === HeroicVersion
      )
      expect(heroicVersionEl).toBeDefined()
    }
  )

  it('the version slot carries hidden=true for every non-settings tab', () => {
    ;['/login', '/', '/store/epic', '/download-manager'].forEach((path) => {
      pathname = path
      const { tier2 } = shellChildren()
      const slot = collectElements(tier2.props.children).find(
        (el) => el.props?.className === 'NavShell__versionSlot'
      )
      expect(slot).toBeDefined()
      expect(slot?.props.hidden).toBe(true)
    })
  })

  it('the version slot carries hidden=false on the settings tab', () => {
    pathname = '/settings/general'
    const { tier2 } = shellChildren()
    const slot = collectElements(tier2.props.children).find(
      (el) => el.props?.className === 'NavShell__versionSlot'
    )
    expect(slot).toBeDefined()
    expect(slot?.props.hidden).toBe(false)
  })

  it('with activeTab stores the tier-2 column contains StoresPanel and neither SettingsPanel nor GamesPanel', () => {
    pathname = '/store/epic'
    const { tier2 } = shellChildren()
    const panels = collectElements(tier2.props.children)

    expect(panels.some((el) => el.type === StoresPanel)).toBe(true)
    expect(panels.some((el) => el.type === SettingsPanel)).toBe(false)
    expect(panels.some((el) => el.type === GamesPanel)).toBe(false)
  })

  it('with activeTab accounts the tier-2 column contains no panel and carries the collapsed modifier', () => {
    pathname = '/login'
    const { tier2 } = shellChildren()
    const panels = collectElements(tier2.props.children).filter((el) =>
      [GamesPanel, StoresPanel, SettingsPanel].includes(
        el.type as typeof GamesPanel
      )
    )

    expect(panels).toHaveLength(0)
    expect(tier2.props.className).toEqual(
      expect.stringContaining('NavShell__tier2--collapsed')
    )
  })

  it('with activeTab games and filled=false the tier-2 column carries the collapsed modifier', () => {
    pathname = '/'
    contextValue = { filled: false }
    const { tier2 } = shellChildren()

    expect(tier2.props.className).toEqual(
      expect.stringContaining('NavShell__tier2--collapsed')
    )
  })

  it('with activeTab games and filled=true the tier-2 column does not carry the collapsed modifier', () => {
    pathname = '/'
    contextValue = { filled: true }
    const { tier2 } = shellChildren()

    expect(tier2.props.className).not.toEqual(
      expect.stringContaining('NavShell__tier2--collapsed')
    )
  })

  it('a null active tab collapses the tier-2 column', () => {
    pathname = '/download-manager'
    const { tier2 } = shellChildren()

    expect(tier2.props.className).toEqual(
      expect.stringContaining('NavShell__tier2--collapsed')
    )
  })

  it('SidebarTour is not referenced anywhere in the returned tree', () => {
    const tree = callNavShell()
    const all = collectElements(tree.props.children)
    expect(
      all.some(
        (el) =>
          typeof el.type === 'function' &&
          (el.type as { name?: string }).name === 'SidebarTour'
      )
    ).toBe(false)
  })

  it('the navbar renders NavTabs and DownloadsRing inside NavShell__navRight', () => {
    const { navbar } = shellChildren()
    const all = collectElements(navbar.props.children)

    expect(all.some((el) => el.type === NavTabs)).toBe(true)

    const navRight = all.find(
      (el) => el.props?.className === 'NavShell__navRight'
    )
    expect(navRight).toBeDefined()
    const navRightChildren = collectElements(navRight?.props.children)
    expect(navRightChildren.some((el) => el.type === DownloadsRing)).toBe(true)
  })

  it('subscribes to window.api.handleGoToScreen on mount and returns its unsubscribe from the effect', () => {
    const unsubscribe = jest.fn()
    handleGoToScreenMock.mockReturnValue(unsubscribe)

    callNavShell()

    expect(handleGoToScreenMock).toHaveBeenCalledTimes(1)
    expect(effectCleanup).toBe(unsubscribe)
  })

  it('navigates with { state: { fromGameCard: false } } when the go-to-screen handler fires', () => {
    callNavShell()

    const handler = handleGoToScreenMock.mock.calls[0][0] as (
      e: unknown,
      screen: string
    ) => void
    handler(undefined, '/settings/general')

    expect(navigateMock).toHaveBeenCalledWith('/settings/general', {
      state: { fromGameCard: false }
    })
  })
})
