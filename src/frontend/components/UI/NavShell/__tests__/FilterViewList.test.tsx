/**
 * Structural tests for `FilterViewList`, the Views section of the Games
 * tier-2 filter panel (34.11-06 Task 1, D-05, REQ-34.11-05).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `FilterViewList` is invoked
 * directly as a plain function and its returned React-element object graph
 * is inspected without a DOM, following the "mock react (useContext) +
 * react-i18next (useTranslation) + the NavItem module" pattern established
 * by `StoresPanel.test.tsx` / `NavItem.test.tsx`. `NavItem` itself is
 * mocked (not just its colocated stylesheet) since it is a CSS-importing
 * child this panel renders, not the unit under test.
 */
import type { ReactElement, ReactNode } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

import type { LibraryView } from 'frontend/types'

jest.mock('../components/FilterViewList/index.scss', () => ({}))

type MockContextValue = {
  libraryView: LibraryView
  setLibraryView: jest.Mock
}

let contextValue: MockContextValue = {
  libraryView: 'all',
  setLibraryView: jest.fn()
}

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
// invoking the element's type.
import NavItem from '../components/NavItem'
import FilterViewList from '../components/FilterViewList'

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

beforeEach(() => {
  contextValue = {
    libraryView: 'all',
    setLibraryView: jest.fn()
  }
})

describe('FilterViewList', () => {
  it('renders exactly four rows, in order All games, Installed, Recently played, Favourites', () => {
    const tree = FilterViewList() as unknown as ReactElement
    const items = navItemsOf(tree)

    expect(items).toHaveLength(4)
    expect(items.map((el) => el.props.label)).toEqual([
      'All games',
      'Installed',
      'Recently played',
      'Favourites'
    ])
  })

  it('every row uses elementType="button"', () => {
    const tree = FilterViewList() as unknown as ReactElement
    const items = navItemsOf(tree)

    expect(items.every((el) => el.props.elementType === 'button')).toBe(true)
  })

  it("given libraryView === 'all', only the All games row is active", () => {
    contextValue = { libraryView: 'all', setLibraryView: jest.fn() }
    const tree = FilterViewList() as unknown as ReactElement
    const items = navItemsOf(tree)

    const active = items.filter((el) => el.props.active === true)
    expect(active).toHaveLength(1)
    expect(active[0]?.props.label).toBe('All games')
  })

  it("given libraryView === 'favourites', only the Favourites row is active", () => {
    contextValue = { libraryView: 'favourites', setLibraryView: jest.fn() }
    const tree = FilterViewList() as unknown as ReactElement
    const items = navItemsOf(tree)

    const active = items.filter((el) => el.props.active === true)
    expect(active).toHaveLength(1)
    expect(active[0]?.props.label).toBe('Favourites')
  })

  it('clicking the Installed row calls setLibraryView exactly once with the scalar "installed" (D-05, never an array)', () => {
    const setLibraryView = jest.fn()
    contextValue = { libraryView: 'all', setLibraryView }
    const tree = FilterViewList() as unknown as ReactElement
    const installedRow = navItemsOf(tree).find(
      (el) => el.props.label === 'Installed'
    )

    expect(installedRow).toBeDefined()
    ;(installedRow?.props.onClick as () => void)()

    expect(setLibraryView).toHaveBeenCalledTimes(1)
    expect(setLibraryView).toHaveBeenCalledWith('installed')
    expect(Array.isArray(setLibraryView.mock.calls[0][0])).toBe(false)
  })

  it('clicking the already-active row is idempotent -- it calls setLibraryView with the SAME value, not a clear back to "all"', () => {
    const setLibraryView = jest.fn()
    contextValue = { libraryView: 'favourites', setLibraryView }
    const tree = FilterViewList() as unknown as ReactElement
    const favouritesRow = navItemsOf(tree).find(
      (el) => el.props.label === 'Favourites'
    )

    expect(favouritesRow).toBeDefined()
    ;(favouritesRow?.props.onClick as () => void)()

    expect(setLibraryView).toHaveBeenCalledWith('favourites')
    expect(setLibraryView).not.toHaveBeenCalledWith('all')
  })

  it('every row label is routed through tGamelib(key, default) -- no bare string literal reaches the label prop', () => {
    // The mocked t() simply echoes the defaultValue, so this assertion
    // instead reads the source for the label-construction call sites --
    // proving the mocked-echo labels above came from a tGamelib() call,
    // not a bare literal that happens to read the same. Each of the four
    // rows uses a literal `tGamelib('gamelib:...', '...')` call (rather
    // than a shared call site fed by a data lookup) so `pnpm i18n`'s
    // string-literal-only extraction can actually see all four keys --
    // see the component's own docstring for the empirical count that
    // proved the lookup-array version invisible to the extractor.
    const source = stripSourceComments(
      readFileSync(
        join(__dirname, '..', 'components', 'FilterViewList', 'index.tsx'),
        'utf8'
      )
    )
    expect(source.match(/tGamelib\(\s*'gamelib:/g)).toHaveLength(4)
    expect(source).not.toMatch(/label="[^{]/)
  })
})

describe('FilterViewList -- D-34 (search is inherited from Header, not rebuilt here)', () => {
  // D-34 is decided nowhere else in the phase. Search is ALREADY at the top
  // of the Games tier-2 panel because `Header` is portalled into the tier-2
  // slot at `Library/index.tsx:819` -- this plan neither moves it nor
  // reimplements it here, and plan 09's rewrite of `Header` must not drop
  // it while replacing everything around it (CategoryFilter, LibraryFilters).
  const headerSource = readFileSync(
    join(__dirname, '..', '..', 'Header', 'index.tsx'),
    'utf8'
  )

  it("Header still imports LibrarySearchBar from '../LibrarySearchBar'", () => {
    expect(headerSource).toMatch(
      /import LibrarySearchBar from '\.\.\/LibrarySearchBar'/
    )
  })

  it('Header still renders <LibrarySearchBar />', () => {
    expect(headerSource).toMatch(/<LibrarySearchBar \/>/)
  })

  it('the gate above is non-vacuous -- proven to fail against a known-bad literal', () => {
    const corrupted = headerSource.replace(
      '<LibrarySearchBar />',
      '<NotTheSearchBar />'
    )
    expect(corrupted).not.toMatch(/<LibrarySearchBar \/>/)
    // headerSource itself was never mutated -- the real gate above still
    // runs against the genuine file on every test run.
    expect(headerSource).toMatch(/<LibrarySearchBar \/>/)
  })
})
