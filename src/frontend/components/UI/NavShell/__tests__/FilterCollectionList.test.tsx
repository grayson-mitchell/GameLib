/**
 * Structural tests for `FilterCollectionList`, the Collections section of
 * the Games tier-2 filter panel (34.11-06 Task 2, D-17/D-18/D-19/D-20/D-21,
 * REQ-34.11-08).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `FilterCollectionList` is
 * invoked directly as a plain function and its returned React-element
 * object graph is inspected without a DOM, following the "mock react
 * (useContext) + react-i18next (useTranslation) + the NavItem module"
 * pattern established by `StoresPanel.test.tsx` / `FilterViewList.test.tsx`.
 * `NavItem` itself is mocked (not just its colocated stylesheet) since it
 * is a CSS-importing child this panel renders, not the unit under test.
 *
 * `useContext` is mocked to ignore which context object it is called
 * with and return one merged fake value -- both `ContextProvider`
 * (`customCategories`) and `LibraryContext` (`currentCollection`,
 * `setCurrentCollection`, `setShowCategories`) resolve to the same object,
 * which is safe because each call site destructures only the keys it needs.
 */
import type { ReactElement, ReactNode } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('../components/FilterCollectionList/index.scss', () => ({}))

// 260815-nmq: the section is now wrapped in `FilterFacetGroup`, which pulls
// in its own stylesheet, `Dropdown` and FontAwesome. Jest has no
// `moduleNameMapper` for `.scss` and its `transform` key only matches
// `.tsx?`, so an unmocked stylesheet import here is a hard SyntaxError at
// require time, not a silent no-op. `Dropdown` is mocked wholesale (its
// `useState` / gamepad side effect is out of scope for a direct-invocation
// test) exactly as FilterStoreFacet.test.tsx and FilterFacetGroup.test.tsx
// already do for this same import chain. `FilterFacetGroup` ITSELF stays
// real -- it is the thing this file now asserts on.
jest.mock('../components/FilterFacetGroup/index.scss', () => ({}))

jest.mock('../../Dropdown', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-dropdown',
    props
  })
}))

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: (props: Record<string, unknown>) => ({
    type: 'mock-fontawesome-icon',
    props
  })
}))

type MockContextValue = {
  customCategories: { listCategories: jest.Mock }
  currentCollection: string | null
  setCurrentCollection: jest.Mock
  setShowCategories: jest.Mock
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    customCategories: { listCategories: jest.fn(() => []) },
    currentCollection: null,
    setCurrentCollection: jest.fn(),
    setShowCategories: jest.fn(),
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
// invoking the element's type.
import NavItem from '../components/NavItem'
import FilterFacetGroup from '../components/FilterFacetGroup'
import FilterCollectionList from '../components/FilterCollectionList'

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

function allElementsOf(tree: ReactNode): AnyElement[] {
  return collectElements(tree)
}

function navItemsOf(tree: ReactNode): AnyElement[] {
  return collectElements(tree).filter((el) => el.type === NavItem)
}

beforeEach(() => {
  contextValue = makeContextValue()
})

describe('FilterCollectionList', () => {
  // 260815-nmq collapsibility gate. This is the assertion that fails if the
  // section is ever reverted to a flat, always-open `<section>` with its own
  // `<span>` header -- every other test in this file inspects rows and would
  // stay green through that regression, because the rows themselves do not
  // change. Asserting the ROOT is `FilterFacetGroup` (the shared wrapper the
  // Store / Runnability / More-filters groups use) is what ties this section
  // to their expand/collapse behaviour rather than to a lookalike of it.
  it('renders as a collapsible FilterFacetGroup titled Collections, not a flat section', () => {
    contextValue = makeContextValue({
      customCategories: { listCategories: jest.fn(() => ['RPG']) }
    })

    const tree = FilterCollectionList() as unknown as AnyElement

    expect(tree.type).toBe(FilterFacetGroup)
    expect(tree.props.title).toBe('Collections')
    expect(tree.props.className).toBe('FilterCollectionList')
  })

  it('renders listCategories() rows verbatim, in order, with no name rewritten (D-17)', () => {
    contextValue = makeContextValue({
      customCategories: { listCategories: jest.fn(() => ['RPG', 'Backlog']) }
    })

    const tree = FilterCollectionList() as unknown as ReactElement
    const labels = navItemsOf(tree).map((el) => el.props.label)

    expect(labels).toEqual([
      'RPG',
      'Backlog',
      'Uncategorized',
      '+ New collection',
      'Manage collections'
    ])
  })

  it('the Uncategorized row always renders after the category rows and carries the preset_uncategorized value', () => {
    contextValue = makeContextValue({
      customCategories: { listCategories: jest.fn(() => ['RPG', 'Backlog']) }
    })

    const tree = FilterCollectionList() as unknown as ReactElement
    const items = navItemsOf(tree)
    const uncategorizedIndex = items.findIndex(
      (el) => el.props.label === 'Uncategorized'
    )

    expect(uncategorizedIndex).toBe(2)
    ;(items[uncategorizedIndex]?.props.onClick as () => void)()
    expect(contextValue.setCurrentCollection).toHaveBeenCalledWith(
      'preset_uncategorized'
    )
  })

  it('given currentCollection === "RPG", only the RPG row is active', () => {
    contextValue = makeContextValue({
      customCategories: { listCategories: jest.fn(() => ['RPG', 'Backlog']) },
      currentCollection: 'RPG'
    })

    const tree = FilterCollectionList() as unknown as ReactElement
    const active = navItemsOf(tree).filter((el) => el.props.active === true)

    expect(active).toHaveLength(1)
    expect(active[0]?.props.label).toBe('RPG')
  })

  it('given currentCollection === null, no collection row is active', () => {
    contextValue = makeContextValue({
      customCategories: { listCategories: jest.fn(() => ['RPG', 'Backlog']) },
      currentCollection: null
    })

    const tree = FilterCollectionList() as unknown as ReactElement
    const active = navItemsOf(tree).filter((el) => el.props.active === true)

    expect(active).toHaveLength(0)
  })

  it('clicking a collection row calls setCurrentCollection with that single name, never an array (D-21)', () => {
    contextValue = makeContextValue({
      customCategories: { listCategories: jest.fn(() => ['RPG', 'Backlog']) }
    })

    const tree = FilterCollectionList() as unknown as ReactElement
    const rpgRow = navItemsOf(tree).find((el) => el.props.label === 'RPG')

    expect(rpgRow).toBeDefined()
    ;(rpgRow?.props.onClick as () => void)()

    expect(contextValue.setCurrentCollection).toHaveBeenCalledTimes(1)
    expect(contextValue.setCurrentCollection).toHaveBeenCalledWith('RPG')
    expect(
      Array.isArray(contextValue.setCurrentCollection.mock.calls[0][0])
    ).toBe(false)
  })

  it('clicking the already-active collection row calls setCurrentCollection(null)', () => {
    contextValue = makeContextValue({
      customCategories: { listCategories: jest.fn(() => ['RPG', 'Backlog']) },
      currentCollection: 'RPG'
    })

    const tree = FilterCollectionList() as unknown as ReactElement
    const rpgRow = navItemsOf(tree).find((el) => el.props.label === 'RPG')

    expect(rpgRow).toBeDefined()
    ;(rpgRow?.props.onClick as () => void)()

    expect(contextValue.setCurrentCollection).toHaveBeenCalledWith(null)
  })

  // Retitled 260815-nmq: the old name claimed this covered "its header", but
  // the assertions below only ever reached the empty message and the row
  // labels -- the header is covered by the FilterFacetGroup gate above.
  it('given listCategories() returns [], the section still renders the no_categories message and both action rows', () => {
    contextValue = makeContextValue({
      customCategories: { listCategories: jest.fn(() => []) }
    })

    const tree = FilterCollectionList() as unknown as ReactElement
    const items = allElementsOf(tree)
    const emptyMessage = items.find(
      (el) =>
        typeof el.type === 'string' &&
        el.props.className === 'FilterCollectionList__empty'
    )

    expect(emptyMessage).toBeDefined()
    expect(emptyMessage?.props.children).toBe(
      'No custom categories. Add categories using each game menu.'
    )

    const labels = navItemsOf(tree).map((el) => el.props.label)
    expect(labels).toEqual([
      'Uncategorized',
      '+ New collection',
      'Manage collections'
    ])
  })

  it('clicking + New collection calls setShowCategories(true, "create") and does not touch setCurrentCollection', () => {
    const tree = FilterCollectionList() as unknown as ReactElement
    const newCollectionRow = navItemsOf(tree).find(
      (el) => el.props.label === '+ New collection'
    )

    expect(newCollectionRow).toBeDefined()
    ;(newCollectionRow?.props.onClick as () => void)()

    expect(contextValue.setShowCategories).toHaveBeenCalledWith(true, 'create')
    expect(contextValue.setCurrentCollection).not.toHaveBeenCalled()
  })

  it('clicking Manage collections calls setShowCategories(true, "manage") and does not touch setCurrentCollection', () => {
    const tree = FilterCollectionList() as unknown as ReactElement
    const manageRow = navItemsOf(tree).find(
      (el) => el.props.label === 'Manage collections'
    )

    expect(manageRow).toBeDefined()
    ;(manageRow?.props.onClick as () => void)()

    expect(contextValue.setShowCategories).toHaveBeenCalledWith(true, 'manage')
    expect(contextValue.setCurrentCollection).not.toHaveBeenCalled()
  })

  // WR-08: the two rows used to be the same action (both `setShowCategories
  // (true)`). This is the assertion that fails if that regresses -- it
  // compares the two recorded call arrays directly rather than checking
  // each in isolation, so a future edit that makes them agree again (even
  // on some THIRD value) is caught.
  it('WR-08: the two action rows do not record identical calls', () => {
    const tree = FilterCollectionList() as unknown as ReactElement
    const newCollectionRow = navItemsOf(tree).find(
      (el) => el.props.label === '+ New collection'
    )
    const manageRow = navItemsOf(tree).find(
      (el) => el.props.label === 'Manage collections'
    )

    expect(newCollectionRow).toBeDefined()
    expect(manageRow).toBeDefined()
    ;(newCollectionRow?.props.onClick as () => void)()
    ;(manageRow?.props.onClick as () => void)()

    expect(contextValue.setShowCategories.mock.calls[0]).not.toEqual(
      contextValue.setShowCategories.mock.calls[1]
    )
  })
})

describe('FilterCollectionList -- source gates (D-19, D-20)', () => {
  const SOURCE_PATH = join(
    __dirname,
    '..',
    'components',
    'FilterCollectionList',
    'index.tsx'
  )
  const source = readFileSync(SOURCE_PATH, 'utf8')

  it('D-20: never references addCustomCategory / removeCustomCategory / renameCustomCategory', () => {
    expect(source).not.toMatch(
      /addCustomCategory|removeCustomCategory|renameCustomCategory/
    )
  })

  it('D-20 gate is non-vacuous -- proven to fail against a known-bad literal', () => {
    const knownBad = `${source}\nremoveCustomCategory()`
    expect(knownBad).toMatch(
      /addCustomCategory|removeCustomCategory|renameCustomCategory/
    )
  })

  it('D-19: never references a rule/predicate/smartCollection identifier', () => {
    expect(source).not.toMatch(/rule|predicate|smartCollection/i)
  })

  it('D-19 gate is non-vacuous -- proven to fail against a known-bad literal', () => {
    const knownBad = `${source}\nconst smartCollectionRule = null`
    expect(knownBad).toMatch(/rule|predicate|smartCollection/i)
  })
})
