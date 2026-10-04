/**
 * Structural tests for `FilterFocusRow`, the `FOCUS ROW` section of the Games
 * tier-2 filter panel (48-03 Task 1, SPEC R2).
 *
 * No jsdom / react-test-renderer in this project (`src/frontend/jest.config.js`)
 * -- `FilterFocusRow` is invoked directly as a plain function and the React
 * element graph it returns is walked without a DOM, following the idiom
 * `Header/__tests__/headerTourAnchors.test.tsx` established. `useContext` is
 * stubbed per context by IDENTITY (two contexts are read here: `ContextProvider`
 * for the persisted pick and the collection accessor, `LibraryContext` for
 * the store and runnability lists), `react-i18next` echoes each call's
 * default text, and `FilterFacetGroup` / `NavItem` are replaced with inert
 * stubs so rows can be asserted as element props rather than rendered.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ReactElement, ReactNode } from 'react'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

type FocusRowStub = { kind: string; value: string } | null

type ContextProviderStub = {
  focusRow: FocusRowStub
  handleFocusRow: jest.Mock
  customCategories: { listCategories: jest.Mock }
}

type LibraryContextStub = {
  connectedStores: string[]
  runnabilityRows: string[]
}

// Declared BEFORE the `jest.mock('react', ...)` call and read by its factory
// -- this project's ts-jest setup does not hoist `jest.mock` above variable
// declarations the way babel-jest does.
let contextProviderValue: ContextProviderStub
let libraryContextValue: LibraryContextStub

function setContexts(
  options: {
    categories?: string[]
    stores?: string[]
    runnability?: string[]
    focusRow?: FocusRowStub
  } = {}
) {
  contextProviderValue = {
    focusRow: options.focusRow ?? null,
    handleFocusRow: jest.fn(),
    customCategories: {
      listCategories: jest.fn(() => options.categories ?? [])
    }
  }
  libraryContextValue = {
    connectedStores: options.stores ?? [],
    runnabilityRows: options.runnability ?? []
  }
}

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
      return actualReact.useContext(
        ctx as Parameters<typeof actualReact.useContext>[0]
      )
    }
  }
})

jest.mock('../index.scss', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

jest.mock('../../FilterFacetGroup', () => ({
  __esModule: true,
  default: function FilterFacetGroup() {
    return null
  },
  FilterFacetRow: function FilterFacetRow() {
    return null
  }
}))

jest.mock('../../NavItem', () => ({
  __esModule: true,
  default: function NavItem() {
    return null
  }
}))

// Imported after the mocks above (textual order). Importing the same mocked
// bindings lets tests assert element type IDENTITY rather than a name.
import FilterFacetGroup, { FilterFacetRow } from '../../FilterFacetGroup'
import NavItem from '../../NavItem'
import FilterFocusRow from '../index'

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
  }
  return out
}

const render = () => FilterFocusRow() as unknown as ReactElement<AnyProps>

const isDivider = (el: AnyElement) =>
  el.type === 'span' && el.props.className === 'FilterFocusRow__divider'

const isRow = (el: AnyElement) => el.type === NavItem

const dividerLabels = (tree: ReactNode) =>
  collectElements(tree)
    .filter(isDivider)
    .map((el) => el.props.children as string)

const rowLabels = (tree: ReactNode) =>
  collectElements(tree)
    .filter(isRow)
    .map((el) => el.props.label as string)

const rowByLabel = (tree: ReactNode, label: string) => {
  const row = collectElements(tree)
    .filter(isRow)
    .find((el) => el.props.label === label)
  if (!row) throw new Error(`row ${label} not found`)
  return row
}

const VIEW_LABELS = ['All games', 'Installed', 'Recently played', 'Favourites']

describe('FilterFocusRow sub-groups (48-03 Task 1, SPEC R2)', () => {
  beforeEach(() => {
    setContexts()
  })

  it('renders one collapsed FilterFacetGroup disclosure', () => {
    const tree = render()
    expect(tree.type).toBe(FilterFacetGroup)
  })

  it('lists the divider labels in fixed order: Views, Collections, Store, Runnability', () => {
    setContexts({
      categories: ['RPGs'],
      stores: ['gog'],
      runnability: ['native']
    })
    expect(dividerLabels(render())).toEqual([
      'Views',
      'Collections',
      'Store',
      'Runnability'
    ])
  })

  it('renders the four view rows before the first collection row', () => {
    setContexts({
      categories: ['RPGs'],
      stores: ['gog'],
      runnability: ['native']
    })
    const labels = rowLabels(render())
    expect(labels.slice(0, 4)).toEqual(VIEW_LABELS)
    expect(labels.indexOf('RPGs')).toBe(4)
  })

  it('keeps Views ungated: with every other list empty it still renders four view rows and the Views divider', () => {
    const tree = render()
    expect(rowLabels(tree)).toEqual(VIEW_LABELS)
    expect(dividerLabels(tree)).toContain('Views')
  })

  it('omits Collections wholesale when there are no collections, divider and rows both', () => {
    setContexts({ categories: [], stores: ['gog'], runnability: ['native'] })
    const tree = render()
    expect(dividerLabels(tree)).not.toContain('Collections')
    expect(rowLabels(tree)).not.toContain('Uncategorized')
  })

  it('omits Store and Runnability dividers when their lists are empty', () => {
    const tree = render()
    expect(dividerLabels(tree)).toEqual(['Views'])
  })

  it('renders no empty-state message node for an empty sub-group', () => {
    const tree = render()
    const stray = collectElements(tree).filter(
      (el) => !isDivider(el) && !isRow(el) && el !== tree
    )
    expect(stray).toEqual([])
  })

  it('renders only the surviving sub-groups, with no placeholder, when partially populated', () => {
    setContexts({ categories: ['RPGs'], stores: [], runnability: ['native'] })
    const tree = render()
    expect(dividerLabels(tree)).toEqual(['Views', 'Collections', 'Runnability'])
    const nodes = collectElements(tree.props.children)
    expect(nodes.every((el) => isDivider(el) || isRow(el))).toBe(true)
  })

  it('renders Uncategorized last in the Collections sub-group, after the user collections', () => {
    setContexts({ categories: ['RPGs', 'Co-op'], stores: ['gog'] })
    const labels = rowLabels(render())
    expect(labels.slice(4, 7)).toEqual(['RPGs', 'Co-op', 'Uncategorized'])
  })

  it('renders store brand names, with sideload as Other and never undefined', () => {
    setContexts({ stores: ['gog', 'sideload'] })
    const labels = rowLabels(render())
    expect(labels).toContain('GOG')
    expect(labels).toContain('Other')
    expect(labels).not.toContain('sideload')
    expect(labels).not.toContain(undefined as unknown as string)
  })

  it('renders runnability labels sourced from the imported runnabilityLabel', () => {
    setContexts({ runnability: ['native', 'wontRun'] })
    const labels = rowLabels(render())
    expect(labels).toContain('Runs natively')
    expect(labels).toContain("Won't run")
  })

  it('marks exactly one row active across the whole section, and it is the GOG row not All games', () => {
    setContexts({
      categories: ['RPGs'],
      stores: ['gog', 'steam'],
      runnability: ['native'],
      focusRow: { kind: 'store', value: 'gog' }
    })
    const rows = collectElements(render()).filter(isRow)
    const active = rows.filter((el) => el.props.active === true)
    expect(active).toHaveLength(1)
    expect(active[0].props.label).toBe('GOG')
    expect(rowByLabel(render(), 'All games').props.active).toBe(false)
  })

  it('does not treat a collection that shares a name with a store value as active', () => {
    setContexts({
      categories: ['gog'],
      stores: ['gog'],
      focusRow: { kind: 'store', value: 'gog' }
    })
    const active = collectElements(render())
      .filter(isRow)
      .filter((el) => el.props.active === true)
    expect(active.map((el) => el.props.label)).toEqual(['GOG'])
  })

  describe.each([
    ['view', 'Installed', 'installed'],
    ['collection', 'RPGs', 'RPGs'],
    ['store', 'GOG', 'gog'],
    ['runnability', 'Runs natively', 'native']
  ])('clear-by-reclick for kind %s', (kind, label, value) => {
    const populated = {
      categories: ['RPGs'],
      stores: ['gog'],
      runnability: ['native']
    }

    it('sets the pick when the row is not active', () => {
      setContexts(populated)
      rowByLabel(render(), label).props.onClick?.()
      expect(contextProviderValue.handleFocusRow).toHaveBeenCalledWith({
        kind,
        value
      })
    })

    it('clears the pick to null when the active row is clicked again', () => {
      setContexts({ ...populated, focusRow: { kind, value } })
      rowByLabel(render(), label).props.onClick?.()
      expect(contextProviderValue.handleFocusRow).toHaveBeenCalledWith(null)
    })

    it('replaces the pick when a different row is clicked', () => {
      setContexts({
        ...populated,
        focusRow: { kind: 'view', value: 'all' }
      })
      rowByLabel(render(), label).props.onClick?.()
      expect(contextProviderValue.handleFocusRow).toHaveBeenCalledWith({
        kind,
        value
      })
    })
  })

  it('selects Uncategorized as a collection pick with the PRESET sentinel value', () => {
    setContexts({ categories: ['RPGs'] })
    rowByLabel(render(), 'Uncategorized').props.onClick?.()
    expect(contextProviderValue.handleFocusRow).toHaveBeenCalledWith({
      kind: 'collection',
      value: 'preset_uncategorized'
    })
  })

  it('carries no selection-count badge on the disclosure', () => {
    const props = render().props
    expect(props).not.toHaveProperty('selectedCount')
    expect(props).not.toHaveProperty('selectedCountLabel')
  })

  it('renders no FilterFacetRow anywhere in the tree -- rows are not checkboxes', () => {
    setContexts({
      categories: ['RPGs'],
      stores: ['gog'],
      runnability: ['native']
    })
    const found = collectElements(render()).filter(
      (el) => el.type === FilterFacetRow
    )
    expect(found).toEqual([])
  })
})

describe('FilterFocusRow is read-only over collections (T-48-07)', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
  )

  it('calls only listCategories on customCategories', () => {
    expect(source).toMatch(/listCategories\(\)/)
    expect(source).not.toMatch(
      /addCategory|removeCategory|renameCategory|addToGame|removeFromGame/
    )
    expect(source).not.toMatch(/customCategories\s*\[/)
  })

  it('never writes games.customCategories through configStore', () => {
    expect(source).not.toMatch(/configStore/)
  })

  it('renders a collection name only as a text child, never as HTML', () => {
    expect(source).not.toMatch(/dangerouslySetInnerHTML/)
  })
})
