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
  activeFilterDescriptors: { id: string; kind: string; value: string }[]
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    runnabilityRows: [],
    runnabilityFacet: [],
    setRunnabilityFacet: jest.fn(),
    countForRunnability: jest.fn(() => 0),
    activeFilterDescriptors: [],
    ...overrides
  }
}

let contextValue: MockContextValue = makeContextValue()

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue
}))

// The `t` mock INTERPOLATES its options into the literal default so the
// badge-label spec below can tell `{{selected}}` from i18next's reserved
// `{{count}}` (which silently triggers plural key resolution and would
// render a missing key in the real app). Every pre-existing spec calls `t`
// with no options, where interpolation is a no-op.
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
import FilterRunnabilityFacet, {
  runnabilityLabel,
  echoDefaultValue
} from '../components/FilterRunnabilityFacet'
import { FilterFacetRow } from '../components/FilterFacetGroup'
import { RUNNABILITY_LABELS } from 'frontend/screens/Library/facetLabels'
import type { RunnabilityTier } from 'frontend/types'

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

  // 260815-opt: the collapsed group's header badge. `runnabilityFacet` is
  // left at its default in these specs and only `activeFilterDescriptors`
  // varies, so a caller that regressed to counting its own facet array
  // would read 0 and fail here (D3).
  it('with no active filters, passes selectedCount 0 so no badge renders', () => {
    contextValue = makeContextValue({ runnabilityRows: ['native'] })

    const tree = FilterRunnabilityFacet() as unknown as ReactElement<AnyProps>

    expect(tree.props.selectedCount).toBe(0)
    expect(tree.props.selectedCountLabel).toBeUndefined()
  })

  it('counts only the runnability descriptors -- two stores and one runnability yields 1', () => {
    contextValue = makeContextValue({
      runnabilityRows: ['native', 'bottle'],
      activeFilterDescriptors: [
        { id: 'store:gog', kind: 'store', value: 'gog' },
        { id: 'store:steam', kind: 'store', value: 'steam' },
        { id: 'runnability:native', kind: 'runnability', value: 'native' }
      ]
    })

    const tree = FilterRunnabilityFacet() as unknown as ReactElement<AnyProps>

    expect(tree.props.selectedCount).toBe(1)
  })

  it('supplies an already-translated badge label interpolated on {{selected}}, not {{count}}', () => {
    contextValue = makeContextValue({
      runnabilityRows: ['native', 'bottle'],
      activeFilterDescriptors: [
        { id: 'runnability:native', kind: 'runnability', value: 'native' }
      ]
    })

    const tree = FilterRunnabilityFacet() as unknown as ReactElement<AnyProps>

    expect(tree.props.selectedCountLabel).toBe('1 selected')
  })

  it('every other prop is unchanged -- the group still renders its own title and className', () => {
    contextValue = makeContextValue({ runnabilityRows: ['native'] })

    const tree = FilterRunnabilityFacet() as unknown as ReactElement<AnyProps>

    expect(tree.props.title).toBe('Runnability')
    expect(tree.props.className).toBe('FilterRunnabilityFacet')
  })

  it('each row count comes from countForRunnability, called once per rendered row', () => {
    contextValue = makeContextValue({
      runnabilityRows: ['native', 'bottle'],
      countForRunnability: jest.fn((tier: string) =>
        tier === 'native' ? 12 : 3
      )
    })

    const tree = FilterRunnabilityFacet() as unknown as ReactElement
    const rows = rowsOf(tree)

    expect(
      rows.find((r) => r.props.label === 'Runs natively')?.props.count
    ).toBe(12)
    expect(
      rows.find((r) => r.props.label === 'Runs via bottle')?.props.count
    ).toBe(3)
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

describe('literal default text matches facetLabels.ts (WR-06)', () => {
  const tiers = Object.keys(RUNNABILITY_LABELS) as RunnabilityTier[]

  // Test B (non-vacuity): if a future edit deleted members off
  // RUNNABILITY_LABELS, Test A's `it.each` table would silently shrink and
  // could pass vacuously with zero real assertions run. Pinning the table
  // length to the four known tiers keeps that possibility a named failure.
  it('the drift table covers exactly the four known tiers -- not a table that has silently emptied', () => {
    expect(tiers).toHaveLength(4)
  })

  // Test A: the module-scope `throw` this used to be is now this `it.each`.
  // A drift between the switch's literal copy and facetLabels.ts's tuples
  // fails exactly one named row here instead of crashing the whole app at
  // import time.
  it.each(tiers)(
    "runnabilityLabel's literal default for tier %s matches RUNNABILITY_LABELS",
    (tier) => {
      expect(runnabilityLabel(tier, echoDefaultValue)).toBe(
        RUNNABILITY_LABELS[tier][1]
      )
    }
  )
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

  // Test C (WR-06): the module-scope `throw` that used to run this same
  // check at import time is gone -- the drift alarm now lives entirely in
  // the `it.each` above. Matched on `\bthrow\b`, not `^throw`: the original
  // throw was indented inside an `if` block, and an earlier pass on this
  // finding wrongly reported it closed because a column-0-anchored grep
  // missed exactly that indentation.
  it('contains no throw statement of any kind', () => {
    expect(source).not.toMatch(/\bthrow\b/)
  })

  it('the no-throw gate is non-vacuous -- proven to fail against a known-bad literal', () => {
    const knownBad = `${source}\nthrow`

    expect(knownBad).toMatch(/\bthrow\b/)
  })
})
