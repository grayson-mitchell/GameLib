/**
 * Structural tests for `NavTabs`, the tier-1 route-driven tab strip
 * (34.10-04, REQ-34.10-02/06/11/14).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `NavTabs` is invoked directly
 * as a plain function and its returned React-element object graph is
 * inspected without a DOM, following the "mock react-router-dom + call the
 * component directly" pattern established by
 * `SidebarLinks/__tests__/index.test.tsx` and `NavItem.test.tsx`. The
 * colocated `index.scss` side-effect import is mocked the same way
 * `NavItem.test.tsx` mocks its colocated stylesheet.
 *
 * Task 2 extends this file with a source-gate `describe` block over the
 * colocated stylesheet -- there is no CSS transform in this jest project, so
 * the visual result itself is a manual gate item (plan 34.10-11); this file
 * can only prove the source text says what it must.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ReactElement, ReactNode } from 'react'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// Hoisted so each real source-gate prohibition below and its SANITY
// counter-check consume the exact same detector -- a counter-check with its
// own re-typed copy of the pattern would drift silently and prove nothing
// about the real gate.
const GAMELIB_PREFIX_PATTERN = /gamelib:/
const BARE_LABEL_PATTERN = /label=["']/
const TIER2_ROW_TOKEN_PATTERN = /--navbar-active-background/
const SEMIBOLD_TOKEN_PATTERN = /--semibold/
const HEX_COLOUR_PATTERN = /#[0-9a-fA-F]{3,8}/

type MockContextValue = {
  epic: { username?: string; library: unknown[] }
  gog: { username?: string; library: unknown[] }
  amazon: { user_id?: string; library: unknown[] }
  steam: { username?: string; library: unknown[] }
  zoom: { username?: string; enabled: boolean; library: unknown[] }
  refreshLibrary: jest.Mock
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    epic: { username: undefined, library: [] },
    gog: { username: undefined, library: [] },
    amazon: { user_id: undefined, library: [] },
    steam: { username: undefined, library: [] },
    zoom: { username: undefined, enabled: false, library: [] },
    refreshLibrary: jest.fn(),
    ...overrides
  }
}

let contextValue: MockContextValue = makeContextValue()
let pathname = '/'

jest.mock('../components/NavTabs/index.scss', () => ({}))

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue
}))

jest.mock('react-router-dom', () => ({
  NavLink: (props: Record<string, unknown>) => ({
    type: 'mock-navlink',
    props
  }),
  useLocation: () => ({ pathname })
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

;(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: jest.fn().mockReturnValue(null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
}
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: jest.fn().mockReturnValue(null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
}

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import { NavLink } from 'react-router-dom'
import { Tab, Tabs } from '@mui/material'
import NavTabs from '../components/NavTabs'

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

function callNavTabs(): AnyElement {
  return NavTabs() as unknown as AnyElement
}

function tabsOf(root: AnyElement): AnyElement[] {
  const kids = root.props.children
  return collectElements(kids).filter((el) => el.type === Tab)
}

beforeEach(() => {
  contextValue = makeContextValue()
  pathname = '/'
})

describe('NavTabs', () => {
  it('renders exactly four tabs whose values are accounts, games, stores, settings in order', () => {
    const root = callNavTabs()
    expect(root.type).toBe(Tabs)

    const tabs = tabsOf(root)
    expect(tabs).toHaveLength(4)
    expect(tabs.map((tab) => tab.props.value)).toEqual([
      'accounts',
      'games',
      'stores',
      'settings'
    ])
  })

  it('resolves labels to Manage Accounts, Games, Stores, Settings in that order', () => {
    const tabs = tabsOf(callNavTabs())
    expect(tabs.map((tab) => tab.props.label)).toEqual([
      'Manage Accounts',
      'Games',
      'Stores',
      'Settings'
    ])
  })

  it('targets /login, /, /store/{default store}, /settings/general respectively', () => {
    contextValue = makeContextValue({ gog: { username: 'TestUser', library: [] } })
    const tabs = tabsOf(callNavTabs())
    expect(tabs.map((tab) => tab.props.to)).toEqual([
      '/login',
      '/',
      '/store/gog',
      '/settings/general'
    ])
  })

  it('assigns ids tab-0 through tab-3 matching NAV_TAB_INDEX', () => {
    const tabs = tabsOf(callNavTabs())
    expect(tabs.map((tab) => tab.props.id)).toEqual([
      'tab-0',
      'tab-1',
      'tab-2',
      'tab-3'
    ])
  })

  it('every tab uses NavLink as its component', () => {
    const tabs = tabsOf(callNavTabs())
    tabs.forEach((tab) => {
      expect(tab.props.component).toBe(NavLink)
    })
  })

  it("sets the Tabs value to 'settings' for pathname '/settings/advanced'", () => {
    pathname = '/settings/advanced'
    const root = callNavTabs()
    expect(root.props.value).toBe('settings')
  })

  it("sets the Tabs value to false (no selection) for pathname '/download-manager', and no tab reports selected", () => {
    pathname = '/download-manager'
    const root = callNavTabs()
    expect(root.props.value).toBe(false)

    // MUI derives `selected` for each Tab by comparing the Tabs' `value`
    // against the Tab's own `value` prop -- none of the four tab values
    // ('accounts' | 'games' | 'stores' | 'settings') can ever equal `false`,
    // so no tab is marked selected when the strip's value is `false`.
    const tabs = tabsOf(root)
    tabs.forEach((tab) => {
      expect(tab.props.value).not.toBe(root.props.value)
    })
  })

  it('invokes refreshLibrary with { runInBackground: true, origin: "nav-tabs-games-tab" } via the Games tab onClick when a logged-in store has an empty library', async () => {
    const refreshLibrary = jest.fn()
    contextValue = makeContextValue({
      gog: { username: 'TestUser', library: [] },
      refreshLibrary
    })

    const tabs = tabsOf(callNavTabs())
    const gamesTab = tabs[1]
    await (gamesTab.props.onClick as () => Promise<void>)()

    expect(refreshLibrary).toHaveBeenCalledWith({
      runInBackground: true,
      origin: 'nav-tabs-games-tab'
    })
  })

  it('does not invoke refreshLibrary via the Games tab onClick when libraries are populated', async () => {
    const refreshLibrary = jest.fn()
    contextValue = makeContextValue({
      gog: { username: 'TestUser', library: [{ app_name: 'a' }] },
      refreshLibrary
    })

    const tabs = tabsOf(callNavTabs())
    const gamesTab = tabs[1]
    await (gamesTab.props.onClick as () => Promise<void>)()

    expect(refreshLibrary).not.toHaveBeenCalled()
  })

  it('does not invoke refreshLibrary via the Games tab onClick when no store is logged in', async () => {
    const refreshLibrary = jest.fn()
    contextValue = makeContextValue({ refreshLibrary })

    const tabs = tabsOf(callNavTabs())
    const gamesTab = tabs[1]
    await (gamesTab.props.onClick as () => Promise<void>)()

    expect(refreshLibrary).not.toHaveBeenCalled()
  })

  it('mints exactly one nav.tabs.games key in the source and no gamelib: prefix', () => {
    const source = readFileSync(
      join(__dirname, '..', 'components', 'NavTabs', 'index.tsx'),
      'utf8'
    )
    expect((source.match(/nav\.tabs\.games/g) ?? []).length).toBe(1)
    expect(source).not.toMatch(GAMELIB_PREFIX_PATTERN)
  })

  it('SANITY: the gamelib: prefix prohibition above fires against a known-bad input -- proves it is not vacuously true', () => {
    const knownBad = "t('gamelib:nav.tabs.games', 'Games')"
    expect(knownBad).toMatch(GAMELIB_PREFIX_PATTERN)
  })

  it('every label= value is a t( call -- no bare string literal label prop', () => {
    const source = readFileSync(
      join(__dirname, '..', 'components', 'NavTabs', 'index.tsx'),
      'utf8'
    )
    expect(source).not.toMatch(BARE_LABEL_PATTERN)
  })

  it('SANITY: the bare label= prohibition above fires against a known-bad input -- proves it is not vacuously true', () => {
    const knownBad = '<Tab label="Games" value="games" />'
    expect(knownBad).toMatch(BARE_LABEL_PATTERN)
  })
})

describe('NavTabs stylesheet -- card/folder tab visuals (34.10-04 Task 2, D-04)', () => {
  const STYLESHEET_PATH = join(
    __dirname,
    '..',
    'components',
    'NavTabs',
    'index.scss'
  )

  function readStripped(): string {
    return stripSourceComments(readFileSync(STYLESHEET_PATH, 'utf8'))
  }

  it("suppresses MUI's own sliding indicator with a display: none rule", () => {
    const source = readStripped()
    expect(source).toMatch(/\.MuiTabs-indicator\s*{[^}]*display:\s*none/)
  })

  it('defines the active tab background and border-bottom against --body-background (the seam-erasing token), never the tier-2 row token', () => {
    const source = readStripped()
    expect(
      (source.match(/--body-background/g) ?? []).length
    ).toBeGreaterThanOrEqual(2)
    // The rejected token: it names the active tier-2 ROW's background, not
    // the content surface, and coincides with --body-background in some
    // themes today -- which is exactly what would make picking it invisible
    // in midnightMirage and wrong everywhere else.
    expect(source).not.toMatch(TIER2_ROW_TOKEN_PATTERN)
  })

  it('SANITY: the tier-2 row token prohibition above fires against a known-bad input -- proves it is not vacuously true', () => {
    const knownBad =
      '.Mui-selected { background: var(--navbar-active-background); }'
    expect(knownBad).toMatch(TIER2_ROW_TOKEN_PATTERN)
  })

  it('uses only the two nav-wide weights -- no --semibold', () => {
    const source = readStripped()
    expect(source).not.toMatch(SEMIBOLD_TOKEN_PATTERN)
  })

  it('SANITY: the --semibold prohibition above fires against a known-bad input -- proves it is not vacuously true', () => {
    const knownBad = '.MuiTab-root { font-weight: var(--semibold); }'
    expect(knownBad).toMatch(SEMIBOLD_TOKEN_PATTERN)
  })

  it('contains no hex colour literal for any tab state', () => {
    const source = readStripped()
    expect(source).not.toMatch(HEX_COLOUR_PATTERN)
  })

  it('SANITY: the hex-colour prohibition above fires against a known-bad input -- proves it is not vacuously true', () => {
    const knownBad = '.Mui-selected { color: #ff0000; }'
    expect(knownBad).toMatch(HEX_COLOUR_PATTERN)
  })

  it('keeps MUI-uppercased labels off -- text-transform: none is present', () => {
    const source = readStripped()
    expect(source).toMatch(/text-transform:\s*none/)
  })
})
