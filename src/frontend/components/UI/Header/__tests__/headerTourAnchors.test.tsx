/**
 * Structural tests for `Header`, the Games tier-2 filter panel's top-level
 * layout (34.12-02 Task 1, D-09; extended by quick 260815-opt, quick
 * 261002-hx0, and quick 261003-i4t) -- proves the two `data-tour` wrapper
 * divs (`library-views-collections`, `library-facets`) carry the right
 * children by IDENTITY, that `.Header` now returns FIVE direct children in
 * the locked panel order (`Header__utilities`, `Header__search`,
 * `Header__categoriesGroup`, `Header__filtersGroup`, `Header__footer`) --
 * 261003-i4t collapsed the former two-row `Header__utilities` /
 * `Header__sortRow` pair into one flat `Header__utilities` row of six
 * controls (D-01), dissolving the `FormControl` segmented group and the
 * `Header__sortRow` wrapper it lived in -- and that
 * all of `.Header`'s CSS-gated wrappers restate the `.Header` gap they
 * intercepted -- without this CSS gate the vertical spacing between Views
 * and Collections, and between the three facet groups, silently collapses
 * to zero, because `gap` is a property of the flex CONTAINER and the new
 * wrappers just removed elements from `.Header`'s direct-child list.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `Header` is invoked directly
 * as a plain function and its returned React-element object graph is
 * inspected without a DOM, following the "mock react-i18next / child
 * component modules + call the component directly" pattern established by
 * `NavShell/__tests__/SettingsPanel.test.tsx`.
 *
 * 261002-hx0 gave `Header` real hook usage of its own (`useContext` against
 * BOTH `LibraryContext` and `ContextProvider`, plus `useState`/`useEffect`/
 * `useMemo`) that its two dissolved predecessors previously carried, and
 * 261003 tier2-right-edge-shifts-with-scrollbar added `useRef`/
 * `useLayoutEffect` (the scrollbar-gutter correction) -- both stubbed below
 * the same way. Calling
 * a function component directly, outside of any renderer, means there is no
 * hook dispatcher -- a real `useContext`/`useState`/etc. call would throw
 * "Invalid hook call". `react` is therefore partially mocked below, the same
 * idiom `SettingsPanel.test.tsx` established for a single context; this file
 * extends it to distinguish TWO contexts by identity (the real,
 * unmocked `LibraryContext`/`ContextProvider` default exports, fetched via
 * `jest.requireActual` so the comparison is against the exact object
 * `Header` itself receives), because a single canned `contextValue` would
 * make one of the two `useContext` call sites silently read the other
 * context's shape instead of its own.
 *
 * The CSS gate itself follows the brace-counted `cssBlock` helper from
 * `Login/__tests__/index.test.tsx`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ReactElement, ReactNode } from 'react'
import type { GameInfo } from 'common/types'

type LibraryContextStub = {
  activeFilterCount: number
  layout: string
  handleLayout: jest.Mock
  sortDescending: boolean
  setSortDescending: jest.Mock
  sortInstalled: boolean
  setSortInstalled: jest.Mock
  showAlphabetFilter: boolean
  onToggleAlphabetFilter: jest.Mock
}

type ContextProviderStub = {
  refreshLibrary: jest.Mock
  refreshing: boolean
  refreshingInTheBackground: boolean
  refreshingByRunner: Record<string, boolean>
  steamMetadataSyncing: boolean
  connectivity: { status: string }
}

function makeLibraryContextValue(
  overrides: Partial<LibraryContextStub> = {}
): LibraryContextStub {
  return {
    activeFilterCount: 0,
    layout: 'grid',
    handleLayout: jest.fn(),
    sortDescending: true,
    setSortDescending: jest.fn(),
    sortInstalled: true,
    setSortInstalled: jest.fn(),
    showAlphabetFilter: false,
    onToggleAlphabetFilter: jest.fn(),
    ...overrides
  }
}

function makeContextProviderValue(
  overrides: Partial<ContextProviderStub> = {}
): ContextProviderStub {
  return {
    refreshLibrary: jest.fn(),
    refreshing: false,
    refreshingInTheBackground: false,
    refreshingByRunner: {},
    steamMetadataSyncing: false,
    connectivity: { status: 'online' },
    ...overrides
  }
}

// Declared BEFORE the `jest.mock('react', ...)` call below and read by that
// factory -- this project's ts-jest setup does not hoist `jest.mock` above
// variable declarations the way babel-jest does (see the docstring above and
// `SettingsPanel.test.tsx`), so this ordering is load-bearing, not
// stylistic.
let libraryContextValue: LibraryContextStub = makeLibraryContextValue()
let contextProviderValue: ContextProviderStub = makeContextProviderValue()

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  const actualLibraryContext = jest.requireActual<
    typeof import('frontend/screens/Library/LibraryContext')
  >('frontend/screens/Library/LibraryContext').default
  const actualContextProvider = jest.requireActual<
    typeof import('frontend/state/ContextProvider')
  >('frontend/state/ContextProvider').default

  return {
    ...actualReact,
    useContext: (ctx: unknown) => {
      if (ctx === actualLibraryContext) return libraryContextValue
      if (ctx === actualContextProvider) return contextProviderValue
      // Falls through to the real implementation for any context this file
      // does not stub -- safer than silently returning one of the two
      // canned values for an unrelated context object.
      return actualReact.useContext(
        ctx as Parameters<typeof actualReact.useContext>[0]
      )
    },
    useState: (initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      jest.fn()
    ],
    useEffect: jest.fn(),
    useMemo: (fn: () => unknown) => fn(),
    // 261003 tier2-right-edge-shifts-with-scrollbar added a real `useRef` +
    // `useLayoutEffect` pair to `Header` (the scrollbar-gutter correction).
    // Same reason as every other stub in this factory: calling `Header`
    // directly, outside of any renderer, means there is no hook dispatcher,
    // and the real implementations would throw "Invalid hook call". Neither
    // stub needs to DO anything here -- there is no real DOM/jsdom in this
    // project's jest environment for the effect body to measure against,
    // and the correction logic itself is verified live instead (see the
    // resolved debug session).
    useRef: (initial: unknown) => ({ current: initial }),
    useLayoutEffect: jest.fn()
  }
})

jest.mock('../index.css', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

jest.mock('react-router-dom', () => ({
  Link: (props: Record<string, unknown>) => ({
    type: 'mock-link',
    props
  })
}))

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: (props: Record<string, unknown>) => ({
    type: 'mock-fontawesome-icon',
    props
  })
}))

jest.mock('../../LibrarySearchBar', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-librarysearchbar',
    props
  })
}))

jest.mock('../../FormControl', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-formcontrol',
    props
  })
}))

jest.mock('../../NavShell/components/FilterViewList', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-filterviewlist',
    props
  })
}))

jest.mock('../../NavShell/components/FilterCollectionList', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-filtercollectionlist',
    props
  })
}))

jest.mock('../../NavShell/components/FilterStoreFacet', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-filterstorefacet',
    props
  })
}))

jest.mock('../../NavShell/components/FilterRunnabilityFacet', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-filterrunnabilityfacet',
    props
  })
}))

jest.mock('../../NavShell/components/FilterMoreGroup', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-filtermoregroup',
    props
  })
}))

jest.mock('frontend/screens/Library/components/AddGameButton', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-addgamebutton',
    props
  })
}))

jest.mock('frontend/components/Tour/TourButton', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-tourbutton',
    props
  })
}))

jest.mock('frontend/screens/Library/components/LibraryTour', () => ({
  LIBRARY_TOUR_ID: 'library-tour'
}))

jest.mock('frontend/screens/Library/gameCount', () => ({
  countGamesExcludingDlc: (list: unknown[]) => list.length
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest). Importing the same
// mocked bindings here lets tests assert type IDENTITY rather than string
// names -- a string-name comparison would pass even if the wrong component
// ended up under the wrong anchor (see `SettingsPanel.test.tsx` /
// 34.10-02 SUMMARY Deviation 1, and RESEARCH.md's note on
// `FilterStoreFacet` rendering `null` for zero connected stores, which is
// exactly why this plan wraps groups rather than picking one representative
// element).
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import FilterViewList from '../../NavShell/components/FilterViewList'
import FilterCollectionList from '../../NavShell/components/FilterCollectionList'
import FilterStoreFacet from '../../NavShell/components/FilterStoreFacet'
import FilterRunnabilityFacet from '../../NavShell/components/FilterRunnabilityFacet'
import FilterMoreGroup from '../../NavShell/components/FilterMoreGroup'
import FormControl from '../../FormControl'
import AddGameButton from 'frontend/screens/Library/components/AddGameButton'
import TourButton from 'frontend/components/Tour/TourButton'
import Header from '../index'

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

function topLevelChildren(tree: ReactNode): AnyElement[] {
  const root = tree as AnyElement
  const children = root.props?.children
  return (Array.isArray(children) ? children : [children]).filter(
    (c): c is AnyElement =>
      c !== null && c !== undefined && typeof c === 'object' && 'type' in c
  )
}

function findByDataTour(tree: ReactNode, value: string): AnyElement[] {
  return collectElements(tree).filter((el) => el.props?.['data-tour'] === value)
}

const HEADER_CSS_PATH = join(__dirname, '..', 'index.css')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

// Brace-counted block extractor, copied from
// `Login/__tests__/index.test.tsx` -- scopes an assertion to a single
// selector's declaration body so a whole-file grep cannot pass on
// `.Header`'s own `gap: var(--space-md)` declaration and prove nothing
// about the new wrappers.
function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start === -1) {
    throw new Error(`selector ${selector} not found`)
  }
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) {
        return source.slice(source.indexOf('{', start) + 1, i)
      }
    }
  }
  throw new Error(`unterminated block for ${selector}`)
}

const sampleList = [{}, {}] as unknown as GameInfo[]

function renderHeader(): ReactElement {
  return Header({ list: sampleList, totalGames: 42 }) as unknown as ReactElement
}

describe('Header tour anchors (34.12-02, D-09; extended 261002-hx0)', () => {
  beforeEach(() => {
    libraryContextValue = makeLibraryContextValue()
    contextProviderValue = makeContextProviderValue()
  })

  it('exactly one element carries data-tour="library-views-collections", wrapping FilterViewList and FilterCollectionList by identity', () => {
    const tree = renderHeader()
    const matches = findByDataTour(tree, 'library-views-collections')
    expect(matches).toHaveLength(1)

    const childTypes = collectElements(matches[0].props.children).map(
      (el) => el.type
    )
    expect(childTypes).toContain(FilterViewList)
    expect(childTypes).toContain(FilterCollectionList)
  })

  it('exactly one element carries data-tour="library-facets", wrapping FilterStoreFacet, FilterRunnabilityFacet and FilterMoreGroup by identity', () => {
    const tree = renderHeader()
    const matches = findByDataTour(tree, 'library-facets')
    expect(matches).toHaveLength(1)

    const childTypes = collectElements(matches[0].props.children).map(
      (el) => el.type
    )
    expect(childTypes).toContain(FilterStoreFacet)
    expect(childTypes).toContain(FilterRunnabilityFacet)
    expect(childTypes).toContain(FilterMoreGroup)
  })

  it('.Header has exactly five direct children in the locked panel order', () => {
    const tree = renderHeader()
    const children = topLevelChildren(tree)
    expect(children).toHaveLength(5)
    expect(children[0].props?.className).toBe('Header__utilities')
    expect(children[1].props?.className).toBe('Header__search')
    expect(children[2].props?.className).toBe('Header__categoriesGroup')
    expect(children[3].props?.className).toBe('Header__filtersGroup')
    expect(children[4].props?.className).toBe('Header__footer')
  })

  it('Header__utilities holds exactly six controls in the locked D-01 order, and no FormControl element survives anywhere in the tree', () => {
    const tree = renderHeader()
    const children = topLevelChildren(tree)
    const utilities = children[0]

    const controls = collectElements(utilities.props.children).filter(
      (el) => el.type === Link || el.type === 'button' || el.type === TourButton
    )
    expect(controls).toHaveLength(6)
    // D-01's order: console mode, layout toggle, sort A-Z, sort by status,
    // alphabet filter, tour.
    expect(controls[0].type).toBe(Link)
    expect(controls[1].type).toBe('button')
    expect(controls[2].type).toBe('button')
    expect(controls[3].type).toBe('button')
    expect(controls[4].type).toBe('button')
    expect(controls[5].type).toBe(TourButton)

    const formControlEls = collectElements(tree).filter(
      (el) => el.type === FormControl
    )
    expect(formControlEls).toHaveLength(0)
  })

  it('Header__footer renders AddGameButton, by identity', () => {
    const tree = renderHeader()
    const children = topLevelChildren(tree)
    const footer = children[4]

    const addGameButtonEls = collectElements(footer.props.children).filter(
      (el) => el.type === AddGameButton
    )
    expect(addGameButtonEls).toHaveLength(1)
  })

  it('Header__utilities holds exactly one Console Mode Link, by identity, with an accessible name and no visible text', () => {
    const tree = renderHeader()
    const children = topLevelChildren(tree)
    const utilities = children[0]

    const linkEls = collectElements(utilities.props.children).filter(
      (el) => el.type === Link
    )
    expect(linkEls).toHaveLength(1)

    const link = linkEls[0]
    expect(link.props.to).toBe('/console')
    expect(link.props['aria-label']).toBe('Console Mode')
    expect(link.props.title).toBe('Console Mode')

    const iconEls = collectElements(link.props.children).filter(
      (el) => el.type === FontAwesomeIcon
    )
    expect(iconEls).toHaveLength(1)
  })

  it('the Console Mode Link carries no data-tour, so the two findByDataTour uniqueness assertions above stay meaningful', () => {
    const tree = renderHeader()
    const children = topLevelChildren(tree)
    const utilities = children[0]

    const linkEls = collectElements(utilities.props.children).filter(
      (el) => el.type === Link
    )
    expect(linkEls[0].props['data-tour']).toBeUndefined()
  })

  it('both tour-anchor wrappers restate the .Header gap they intercepted, scoped per wrapper block', () => {
    const source = read(HEADER_CSS_PATH)

    const categoriesBlock = cssBlock(source, '.Header__categoriesGroup')
    expect(categoriesBlock).toMatch(/display:\s*flex/)
    expect(categoriesBlock).toMatch(/flex-direction:\s*column/)
    expect(categoriesBlock).toMatch(/gap:\s*var\(--space-md\)/)

    const filtersBlock = cssBlock(source, '.Header__filtersGroup')
    expect(filtersBlock).toMatch(/display:\s*flex/)
    expect(filtersBlock).toMatch(/flex-direction:\s*column/)
    expect(filtersBlock).toMatch(/gap:\s*var\(--space-md\)/)
  })

  it('Header__utilities declares a gap, so the merged six-control row does not collapse', () => {
    const source = read(HEADER_CSS_PATH)
    const block = cssBlock(source, '.Header__utilities')
    expect(block).toMatch(/display:\s*flex/)
    expect(block).toMatch(/gap:\s*var\(--space-xs\)/)
  })

  it('Header__footer restates a gap and bottom-pins itself with margin-top: auto', () => {
    const source = read(HEADER_CSS_PATH)
    const block = cssBlock(source, '.Header__footer')
    expect(block).toMatch(/display:\s*flex/)
    expect(block).toMatch(/gap:\s*var\(--space-xs\)/)
    expect(block).toMatch(/margin-top:\s*auto/)
  })

  it('Header__footerRow restates a gap for the count pill and AddGameButton', () => {
    const source = read(HEADER_CSS_PATH)
    const block = cssBlock(source, '.Header__footerRow')
    expect(block).toMatch(/display:\s*flex/)
    expect(block).toMatch(/gap:\s*var\(--space-xs\)/)
  })

  it('Header__footerRow renders the plus button, count pill, then refresh button in D-04/D-06 order', () => {
    const tree = renderHeader()
    const children = topLevelChildren(tree)
    const footer = children[4]
    const footerRow = topLevelChildren(footer)[0]
    expect(footerRow.props?.className).toBe('Header__footerRow')

    const rowChildren = topLevelChildren(footerRow)
    expect(rowChildren[0].type).toBe(AddGameButton)
    expect(rowChildren[0].props?.iconOnly).toBe(true)
    expect(rowChildren[1].props?.className).toMatch(/numberOfgames/)
    expect(rowChildren[2].type).toBe('button')
  })
})
