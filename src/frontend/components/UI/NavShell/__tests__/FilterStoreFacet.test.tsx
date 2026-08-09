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
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    connectedStores: [],
    storeFacet: [],
    setStoreFacet: jest.fn(),
    countForStore: jest.fn(() => 0),
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
