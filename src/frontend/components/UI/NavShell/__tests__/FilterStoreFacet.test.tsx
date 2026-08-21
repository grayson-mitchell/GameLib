/**
 * Structural tests for `FilterStoreFacet`, the Store facet group of the
 * Games tier-2 filter panel (34.11-07 Task 2, D-01/D-03/D-04, REQ-34.11-01,
 * REQ-34.11-10).
 *
 * No jsdom / react-test-renderer in this project -- `FilterStoreFacet` is
 * invoked directly as a plain function and the returned React-element
 * object graph is inspected without a DOM. `Dropdown` (a child this file
 * does not own) is mocked wholesale so this suite exercises the real
 * `FilterFacetGroup`/`FilterFacetRow` primitives without pulling in
 * Dropdown's own gamepad side effect or its colocated stylesheet.
 * `useContext` is mocked to ignore which context object it is called with,
 * following `FilterCollectionList.test.tsx`'s pattern.
 */
import type { ReactElement } from 'react'

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
  connectedStores: string[]
  storeFacet: string[]
  setStoreFacet: jest.Mock
  countForStore: jest.Mock
  activeFilterDescriptors: { id: string; kind: string; value: string }[]
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    connectedStores: [],
    storeFacet: [],
    setStoreFacet: jest.fn(),
    countForStore: jest.fn(() => 0),
    activeFilterDescriptors: [],
    ...overrides
  }
}

let contextValue: MockContextValue = makeContextValue()

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue
}))

// The `t` mock now INTERPOLATES its options into the literal default. That
// is what makes the badge-label assertion below able to tell
// `{{selected}}` from `{{count}}`: with a plain echo mock, a call site that
// used i18next's reserved `count` name (which silently triggers plural key
// resolution -- `_one`/`_other` -- and would render a missing key in the
// real app) would produce a string indistinguishable from a correct one.
// Every pre-existing spec in this file calls `t` with no options, where
// interpolation is a no-op.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      options?: Record<string, unknown>
    ): string =>
      options
        ? defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
            String(options[name])
          )
        : defaultValue
  })
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import FilterStoreFacet from '../components/FilterStoreFacet'
import { FilterFacetRow } from '../components/FilterFacetGroup'

type AnyProps = Record<string, unknown> & { children?: unknown }
type AnyElement = ReactElement<AnyProps> & { props: AnyProps }

function collectElements(node: unknown, out: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, out))
    return out
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const element = node as AnyElement
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function rowsOf(tree: unknown): AnyElement[] {
  return collectElements(tree).filter((el) => el.type === FilterFacetRow)
}

beforeEach(() => {
  contextValue = makeContextValue()
})

describe('FilterStoreFacet', () => {
  it('renders exactly one row per connectedStores entry, in that order, with brand labels', () => {
    contextValue = makeContextValue({ connectedStores: ['gog', 'steam'] })

    const tree = FilterStoreFacet() as unknown as ReactElement
    const rows = rowsOf(tree)

    expect(rows.map((r) => r.props.label)).toEqual(['GOG', 'Steam'])
  })

  it('renders no row for a store missing from connectedStores', () => {
    contextValue = makeContextValue({ connectedStores: ['steam'] })

    const tree = FilterStoreFacet() as unknown as ReactElement
    const labels = rowsOf(tree).map((r) => r.props.label)

    expect(labels).not.toContain('GOG')
    expect(labels).not.toContain('Epic Games')
    expect(labels).not.toContain('Amazon Games')
  })

  it('given connectedStores is empty, renders nothing at all', () => {
    contextValue = makeContextValue({ connectedStores: [] })

    const result = FilterStoreFacet()

    expect(result).toBeNull()
  })

  it('the sideload row label comes from gamelib:library.storeOther, not the brand map', () => {
    contextValue = makeContextValue({ connectedStores: ['sideload'] })

    const tree = FilterStoreFacet() as unknown as ReactElement
    const rows = rowsOf(tree)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.props.label).toBe('Other')
  })

  it('multi-select: toggling an unselected row adds to the array, toggling a selected row removes from it', () => {
    contextValue = makeContextValue({
      connectedStores: ['gog', 'steam'],
      storeFacet: ['gog']
    })

    const tree = FilterStoreFacet() as unknown as ReactElement
    const rows = rowsOf(tree)
    const steamRow = rows.find((r) => r.props.label === 'Steam')
    const gogRow = rows.find((r) => r.props.label === 'GOG')

    ;(steamRow?.props.onToggle as () => void)()
    expect(contextValue.setStoreFacet).toHaveBeenCalledWith(['gog', 'steam'])
    ;(gogRow?.props.onToggle as () => void)()
    expect(contextValue.setStoreFacet).toHaveBeenCalledWith([])
  })

  // 260815-opt: the collapsed group's header badge. The number comes from
  // the DESCRIPTOR list, never from `storeFacet.length` -- D3. These specs
  // therefore leave `storeFacet` at its default and vary only
  // `activeFilterDescriptors`, so a caller that regressed to counting its
  // own facet array would read 0 and fail here.
  it('with no active filters, passes selectedCount 0 so no badge renders', () => {
    contextValue = makeContextValue({ connectedStores: ['gog', 'steam'] })

    const tree = FilterStoreFacet() as unknown as ReactElement<AnyProps>

    expect(tree.props.selectedCount).toBe(0)
    expect(tree.props.selectedCountLabel).toBeUndefined()
  })

  it('counts only the store descriptors -- two stores and one runnability yields 2', () => {
    contextValue = makeContextValue({
      connectedStores: ['gog', 'steam'],
      activeFilterDescriptors: [
        { id: 'store:gog', kind: 'store', value: 'gog' },
        { id: 'store:steam', kind: 'store', value: 'steam' },
        { id: 'runnability:native', kind: 'runnability', value: 'native' }
      ]
    })

    const tree = FilterStoreFacet() as unknown as ReactElement<AnyProps>

    expect(tree.props.selectedCount).toBe(2)
  })

  it('supplies an already-translated badge label interpolated on {{selected}}, not {{count}}', () => {
    contextValue = makeContextValue({
      connectedStores: ['gog', 'steam'],
      activeFilterDescriptors: [
        { id: 'store:gog', kind: 'store', value: 'gog' },
        { id: 'store:steam', kind: 'store', value: 'steam' }
      ]
    })

    const tree = FilterStoreFacet() as unknown as ReactElement<AnyProps>

    expect(tree.props.selectedCountLabel).toBe('2 selected')
  })

  it('every other prop is unchanged -- the group still renders its own title and className', () => {
    contextValue = makeContextValue({ connectedStores: ['gog'] })

    const tree = FilterStoreFacet() as unknown as ReactElement<AnyProps>

    expect(tree.props.title).toBe('Store')
    expect(tree.props.className).toBe('FilterStoreFacet')
  })

  it('each row count comes from countForStore, called once per rendered row', () => {
    contextValue = makeContextValue({
      connectedStores: ['gog', 'steam'],
      countForStore: jest.fn((value: string) => (value === 'gog' ? 4 : 9))
    })

    const tree = FilterStoreFacet() as unknown as ReactElement
    const rows = rowsOf(tree)

    expect(rows.find((r) => r.props.label === 'GOG')?.props.count).toBe(4)
    expect(rows.find((r) => r.props.label === 'Steam')?.props.count).toBe(9)
    expect(contextValue.countForStore).toHaveBeenCalledTimes(2)
  })
})
