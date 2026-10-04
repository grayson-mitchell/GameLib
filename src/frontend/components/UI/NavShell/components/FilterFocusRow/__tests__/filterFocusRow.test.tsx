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
import { Fragment, type ReactElement, type ReactNode } from 'react'
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

const click = (el: AnyElement) => (el.props.onClick as () => void)()

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
    // A fragment is structure, not a placeholder: it renders no DOM node.
    expect(
      nodes.every((el) => isDivider(el) || isRow(el) || el.type === Fragment)
    ).toBe(true)
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
      click(rowByLabel(render(), label))
      expect(contextProviderValue.handleFocusRow).toHaveBeenCalledWith({
        kind,
        value
      })
    })

    it('clears the pick to null when the active row is clicked again', () => {
      setContexts({ ...populated, focusRow: { kind, value } })
      click(rowByLabel(render(), label))
      expect(contextProviderValue.handleFocusRow).toHaveBeenCalledWith(null)
    })

    it('replaces the pick when a different row is clicked', () => {
      setContexts({
        ...populated,
        focusRow: { kind: 'view', value: 'all' }
      })
      click(rowByLabel(render(), label))
      expect(contextProviderValue.handleFocusRow).toHaveBeenCalledWith({
        kind,
        value
      })
    })
  })

  it('selects Uncategorized as a collection pick with the PRESET sentinel value', () => {
    setContexts({ categories: ['RPGs'] })
    click(rowByLabel(render(), 'Uncategorized'))
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

describe('FilterFocusRow long-label containment (48-03 Task 2, UI-SPEC E2/E3)', () => {
  beforeEach(() => {
    setContexts({
      categories: ['A collection name long enough to wrap several lines'],
      stores: ['gog'],
      runnability: ['native']
    })
  })

  it('puts the full untruncated label on a title attribute of every row', () => {
    const tree = render()
    const rows = collectElements(tree).filter(isRow)
    expect(rows.length).toBeGreaterThan(4)
    rows.forEach((row) => {
      const inner = row.props.labelElement as AnyElement
      expect(inner.props.title).toBe(row.props.label)
    })
  })

  it('puts a title equal to the rendered label on every divider', () => {
    const dividers = collectElements(render()).filter(isDivider)
    expect(dividers).toHaveLength(4)
    dividers.forEach((el) => {
      expect(el.props.title).toBe(el.props.children)
    })
  })

  describe('stylesheet source gate', () => {
    const scss = stripSourceComments(
      readFileSync(join(__dirname, '..', 'index.scss'), 'utf8')
    )
    const navItemTsx = stripSourceComments(
      readFileSync(join(__dirname, '..', '..', 'NavItem', 'index.tsx'), 'utf8')
    )

    // Brace-counted block extractor (copied from `tier2Portal.test.ts`'s
    // `cssBlock` idiom), restricted to a selector's declaration body.
    function cssBlock(source: string, selector: string): string {
      const start = source.indexOf(`${selector} {`)
      if (start === -1) throw new Error(`selector ${selector} not found`)
      let depth = 0
      for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++
        if (source[i] === '}') {
          depth--
          if (depth === 0)
            return source.slice(source.indexOf('{', start) + 1, i)
        }
      }
      throw new Error(`unterminated block for ${selector}`)
    }

    it('clamps the CHILD span of the row -- the element NavItem puts the label text in', () => {
      // NavItem wraps its label in a bare `<span>` that is a direct child of
      // the `<button>`; the clamp must name that span, not an ancestor.
      expect(navItemTsx).toMatch(/<span>\{labelElement \?\? label\}<\/span>/)
      const block = cssBlock(scss, '.FilterFocusRow__row > span')
      expect(block).toMatch(/overflow:\s*hidden/)
      expect(block).toMatch(/text-overflow:\s*ellipsis/)
      expect(block).toMatch(/white-space:\s*nowrap/)
      expect(block).toMatch(/min-width:\s*0/)
    })

    it('gives the row and the divider the flex-item min-width escape', () => {
      expect(cssBlock(scss, '.FilterFocusRow__row')).toMatch(/min-width:\s*0/)
      const divider = cssBlock(scss, '.FilterFocusRow__divider')
      expect(divider).toMatch(/min-width:\s*0/)
      expect(divider).toMatch(/text-overflow:\s*ellipsis/)
    })

    it('is scoped under .NavShell__tier2Portal', () => {
      expect(scss).toMatch(/^\.NavShell__tier2Portal \{/m)
      const top = scss.match(/^\S[^{]*\{/gm) ?? []
      expect(top).toEqual(['.NavShell__tier2Portal {'])
    })

    it('references neither --navbar-active nor --border-color', () => {
      expect(scss).not.toMatch(/--navbar-active(?!-background)/)
      expect(scss).not.toMatch(/--border-color/)
    })
  })
})
