/**
 * Structural tests for `FilterRunnabilityFacet`, the Runnability facet
 * group of the Games tier-2 filter panel (34.11-07 Task 2, D-09/D-10/D-11/
 * D-12/D-16, REQ-34.11-01, REQ-34.11-10).
 *
 * No jsdom / react-test-renderer in this project -- `FilterRunnabilityFacet`
 * is invoked directly as a plain function and the returned React-element
 * object graph is inspected without a DOM. `Dropdown` is mocked wholesale
 * (same rationale as `FilterStoreFacet.test.tsx`).
 */
import type { ReactElement } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'

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
  runnabilityRows: string[]
  runnabilityFacet: string[]
  setRunnabilityFacet: jest.Mock
  countForRunnability: jest.Mock
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    runnabilityRows: [],
    runnabilityFacet: [],
    setRunnabilityFacet: jest.fn(),
    countForRunnability: jest.fn(() => 0),
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
import FilterRunnabilityFacet from '../components/FilterRunnabilityFacet'
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

describe('FilterRunnabilityFacet', () => {
  it('given runnabilityRows === [] (Windows host), returns exactly null -- no header, no empty section, no all-pass row (D-12)', () => {
    contextValue = makeContextValue({ runnabilityRows: [] })

    const result = FilterRunnabilityFacet()

    expect(result).toBeNull()
  })

  it('given runnabilityRows === ["native"] (Linux), renders exactly one row', () => {
    contextValue = makeContextValue({ runnabilityRows: ['native'] })

    const tree = FilterRunnabilityFacet() as unknown as ReactElement
    const rows = rowsOf(tree)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.props.label).toBe('Runs natively')
  })

  it('given all four macOS rows, renders exactly four rows in that order with the minted labels', () => {
    contextValue = makeContextValue({
      runnabilityRows: ['native', 'bottle', 'wontRun', 'notChecked']
    })

    const tree = FilterRunnabilityFacet() as unknown as ReactElement
    const rows = rowsOf(tree)

    expect(rows.map((r) => r.props.label)).toEqual([
      'Runs natively',
      'Runs via bottle',
      "Won't run",
      'Not yet checked'
    ])
  })

  it('each row count comes from countForRunnability, called once per rendered row', () => {
    contextValue = makeContextValue({
      runnabilityRows: ['native', 'bottle'],
      countForRunnability: jest.fn((tier: string) => (tier === 'native' ? 12 : 3))
    })

    const tree = FilterRunnabilityFacet() as unknown as ReactElement
    const rows = rowsOf(tree)

    expect(rows.find((r) => r.props.label === 'Runs natively')?.props.count).toBe(12)
    expect(rows.find((r) => r.props.label === 'Runs via bottle')?.props.count).toBe(3)
    expect(contextValue.countForRunnability).toHaveBeenCalledTimes(2)
  })

  it('multi-select: toggling an unselected row adds to the array, toggling a selected row removes from it', () => {
    contextValue = makeContextValue({
      runnabilityRows: ['native', 'bottle'],
      runnabilityFacet: ['native']
    })

    const tree = FilterRunnabilityFacet() as unknown as ReactElement
    const rows = rowsOf(tree)
    const bottleRow = rows.find((r) => r.props.label === 'Runs via bottle')
    const nativeRow = rows.find((r) => r.props.label === 'Runs natively')

    ;(bottleRow?.props.onToggle as () => void)()
    expect(contextValue.setRunnabilityFacet).toHaveBeenCalledWith([
      'native',
      'bottle'
    ])

    ;(nativeRow?.props.onToggle as () => void)()
    expect(contextValue.setRunnabilityFacet).toHaveBeenCalledWith([])
  })
})

describe('FilterRunnabilityFacet -- medal/derivation source gate (D-09/D-10/D-11)', () => {
  const SOURCE_PATH = join(
    __dirname,
    '..',
    'components',
    'FilterRunnabilityFacet',
    'index.tsx'
  )
  const source = readFileSync(SOURCE_PATH, 'utf8')

  it('never references a medal tier or a per-game runnability derivation field', () => {
    expect(source).not.toMatch(
      /gold|silver|bronze|crossoverRating|is_mac_native|mac_arch|is_linux_native/
    )
  })

  it('gate is non-vacuous -- proven to fail against a known-bad literal', () => {
    const knownBad = `${source}\n// silver`

    expect(knownBad).toMatch(
      /gold|silver|bronze|crossoverRating|is_mac_native|mac_arch|is_linux_native/
    )
  })
})
