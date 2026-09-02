/**
 * Destination-coverage suite -- the replacement for the deleted
 * `Sidebar/components/SidebarLinks/__tests__/index.test.tsx` (34.10-09 Task 1,
 * REQ-34.10-11/13/15). That suite directly imported the module 34.10-09 Task 3
 * deletes, so it would become a compile error rather than a failing
 * assertion; its real behavioural claims are re-homed here or declared
 * obsolete, not silently dropped.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `NavTabs`, `StoresPanel`,
 * `SettingsPanel` and `NavShell` are invoked directly as plain functions and
 * their returned React-element object graphs are inspected without a DOM,
 * following this phase's established idiom. `react` (`useContext`,
 * `useEffect`), `react-router-dom`, `react-i18next`, `@mui/material`,
 * `@fortawesome/react-fontawesome`, `NavItem`, `QuitButton`, `DownloadsRing`,
 * `GamesPanel`, `HeroicVersion` and every colocated stylesheet/image import
 * are mocked so this file exercises only assembly and destination content --
 * each child's own deeper behaviour already has its own suite
 * (NavTabsComponent.test.tsx, StoresPanel.test.tsx, SettingsPanel.test.tsx,
 * NavShell.test.tsx).
 *
 * Two claims from the deleted suite have no successor and are deliberately
 * NOT re-homed:
 *   - `labels[0] === 'GameLib'` described the first entry of the retired
 *     flat single-column list -- there is no longer a single flat list, so
 *     "first label" has no meaning in the two-tier tree this phase settles.
 *   - "Manage Accounts immediately before Accessibility" described adjacency
 *     inside that same flat list -- Accounts (formerly labelled "Manage
 *     Accounts") is now a tier-1 tab and Accessibility is a tier-2 Settings
 *     row; the two no longer share a list to be adjacent within.
 * The Redeem-a-Steam-key gating claim (button element, onClick calls
 * `handleRedeemKeyDialog(true)`, hidden without a Steam session) is already
 * asserted directly by `StoresPanel.test.tsx` and is not duplicated here.
 */
import type { ReactElement, ReactNode } from 'react'

type MockContextValue = {
  epic: { username?: string; library: unknown[] }
  gog: { username?: string; library: unknown[] }
  amazon: { user_id?: string; library: unknown[] }
  steam: { username?: string | null }
  zoom: { username?: string; enabled: boolean; library: unknown[] }
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
    epic: { username: undefined, library: [] },
    gog: { username: undefined, library: [] },
    amazon: { user_id: undefined, library: [] },
    steam: { username: undefined },
    zoom: { username: undefined, enabled: false, library: [] },
    humble: { isLoggedIn: false },
    platform: 'linux',
    refreshLibrary: jest.fn(),
    handleExternalLinkDialog: jest.fn(),
    handleRedeemKeyDialog: jest.fn(),
    ...overrides
  }
}

/** Every guard open (Humble logged in, a Steam session, non-Windows) -- the
 * context this suite's exact-set assertion is built against. A subset
 * assertion would let a silently dropped row pass; this suite's whole point
 * is that the sidebar-to-shell redistribution was lossless, so every row
 * that CAN appear must be forced to appear. */
function permissiveContextValue(): MockContextValue {
  return makeContextValue({
    humble: { isLoggedIn: true },
    steam: { username: 'TestUser' },
    platform: 'linux'
  })
}

let contextValue: MockContextValue = makeContextValue()
let pathname = '/'

jest.mock('../components/NavTabs/index.scss', () => ({}))
jest.mock('../index.scss', () => ({}))
jest.mock('frontend/assets/gamelib-icon.png', () => 'mock-icon.png')

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue,
  useEffect: (effect: () => void | (() => void)) => {
    effect()
  }
}))

const navigateMock = jest.fn()
jest.mock('react-router-dom', () => ({
  NavLink: (props: Record<string, unknown>) => ({
    type: 'mock-navlink',
    props
  }),
  useLocation: () => ({ pathname }),
  useNavigate: () => navigateMock
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

jest.mock('@mui/material', () => ({
  Tabs: (props: Record<string, unknown>) => ({ type: 'mock-tabs', props }),
  Tab: (props: Record<string, unknown>) => ({ type: 'mock-tab', props })
}))

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: (props: Record<string, unknown>) => ({
    type: 'mock-fontawesome-icon',
    props
  })
}))

jest.mock('frontend/components/UI/ExternalLinkDialog', () => ({
  SHOW_EXTERNAL_LINK_DIALOG_STORAGE_KEY: 'show_external_link_dialog'
}))

jest.mock('../components/NavItem', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-navitem',
    props
  })
}))

jest.mock('../components/QuitButton', () => ({
  __esModule: true,
  default: () => ({ type: 'mock-quitbutton', props: {} })
}))

jest.mock('../components/DownloadsRing', () => ({
  __esModule: true,
  default: () => ({ type: 'mock-downloadsring', props: {} })
}))

jest.mock('../components/GamesPanel', () => ({
  __esModule: true,
  default: () => ({ type: 'mock-gamespanel', props: {} })
}))

jest.mock('../components/HeroicVersion', () => ({
  __esModule: true,
  default: () => ({ type: 'mock-heroicversion', props: {} })
}))
jest.mock('../components/NavShellTour', () => ({
  __esModule: true,
  NAV_TOUR_ID: 'nav-tour',
  default: () => ({ type: 'mock-navshelltour', props: {} })
}))

jest.mock('frontend/state/TourContext', () => ({
  useTour: () => ({
    startTour: jest.fn(),
    resetTour: jest.fn(),
    hasTourCompleted: jest.fn().mockReturnValue(false)
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

const handleGoToScreenMock = jest.fn()
;(
  globalThis as unknown as {
    window: { api: { handleGoToScreen: typeof handleGoToScreenMock } }
  }
).window = {
  api: { handleGoToScreen: handleGoToScreenMock }
}

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest). `element.type` from
// `React.createElement(X, ...)` is a REFERENCE to whatever `X` resolves to
// at import time -- importing the same mocked/real bindings here lets tests
// assert type identity rather than invoking the element's type (mirrors
// StoresPanel.test.tsx / NavShell.test.tsx).
import { Tab } from '@mui/material'
import NavItem from '../components/NavItem'
import HeroicVersion from '../components/HeroicVersion'
import NavTabs from '../components/NavTabs'
import StoresPanel from '../components/StoresPanel'
import SettingsPanel from '../components/SettingsPanel'
import NavShell from '../index'

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

function tabElements(): AnyElement[] {
  const root = NavTabs() as unknown as AnyElement
  return collectElements(root.props.children).filter((el) => el.type === Tab)
}

function tabLabels(): string[] {
  return tabElements()
    .map((el) => el.props?.label)
    .filter((l): l is string => typeof l === 'string')
}

function navItemLabels(tree: ReactNode): string[] {
  return collectElements(tree)
    .filter((el) => el.type === NavItem)
    .map((el) => el.props?.label)
    .filter((l): l is string => typeof l === 'string')
}

beforeEach(() => {
  contextValue = makeContextValue()
  pathname = '/'
  navigateMock.mockClear()
  handleGoToScreenMock.mockClear()
  handleGoToScreenMock.mockReturnValue(jest.fn())
})

describe('Destination coverage -- the settled tree', () => {
  it('the union of tab, Stores and Settings destinations equals the settled set exactly -- no sidebar destination missing, none invented', () => {
    contextValue = permissiveContextValue()

    const union = [
      ...tabLabels(),
      ...navItemLabels(StoresPanel() as unknown as ReactElement),
      ...navItemLabels(SettingsPanel() as unknown as ReactElement)
    ]

    expect(union).toEqual([
      'Accounts',
      'Library',
      'Stores',
      'Settings',
      'GOG Store',
      'Steam Store',
      'Epic Store',
      'Amazon Luna',
      'Deals',
      'Store Search',
      'Humble Keys',
      'Redeem a Steam key',
      'General',
      'Game Defaults',
      'Advanced',
      'Wine Manager',
      'Accessibility',
      'Console Mode',
      'Log',
      'System Information',
      'Documentation',
      'About',
      'Ko-fi',
      'App Tour'
    ])
  })

  it('no element anywhere in the union renders the label "Zoom Store", even with an enabled, logged-in Zoom session', () => {
    contextValue = makeContextValue({
      zoom: { username: 'ZoomUser', enabled: true, library: [] }
    })

    const union = [
      ...tabLabels(),
      ...navItemLabels(StoresPanel() as unknown as ReactElement),
      ...navItemLabels(SettingsPanel() as unknown as ReactElement)
    ]

    expect(union).not.toContain('Zoom Store')
  })
})

describe('Accounts entry point (re-homed from the deleted suite)', () => {
  it('targets /login in both logged-out and logged-in context states, and no collected label anywhere equals "Login"', () => {
    contextValue = makeContextValue()
    const loggedOutAccountsTab = tabElements().find(
      (el) => el.props?.value === 'accounts'
    )
    expect(loggedOutAccountsTab?.props.to).toBe('/login')
    expect(tabLabels()).not.toContain('Login')

    contextValue = makeContextValue({
      gog: { username: 'TestUser', library: [] }
    })
    const loggedInAccountsTab = tabElements().find(
      (el) => el.props?.value === 'accounts'
    )
    expect(loggedInAccountsTab?.props.to).toBe('/login')
    expect(tabLabels()).not.toContain('Login')
  })
})

describe('Community links (re-homed from the deleted suite)', () => {
  it('labels contain neither "Discord" nor "GitHub Sponsors", and do contain "Ko-fi"', () => {
    contextValue = permissiveContextValue()
    const settingsLabels = navItemLabels(
      SettingsPanel() as unknown as ReactElement
    )

    expect(settingsLabels).not.toContain('Discord')
    expect(settingsLabels).not.toContain('GitHub Sponsors')
    expect(settingsLabels).toContain('Ko-fi')
  })
})

describe('Version mount (re-homed from the deleted suite)', () => {
  it.each(['accounts', 'games', 'stores', 'settings', null] as const)(
    "HeroicVersion is present in the tier-2 column of NavShell()'s tree for activeTab %s",
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
      contextValue = permissiveContextValue()

      const tree = NavShell() as unknown as AnyElement
      const kids = tree.props.children as AnyElement[]
      const tier2 = kids[1]

      expect(
        collectElements(tier2.props.children).some(
          (el) => el.type === HeroicVersion
        )
      ).toBe(true)
    }
  )
})
