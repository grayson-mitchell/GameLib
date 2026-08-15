/**
 * Structural tests for `FilterMoreGroup`, the single "More filters" group
 * of the Games tier-2 filter panel (34.11-07 Task 3, D-06/D-07/D-28), plus
 * the phase's Genre-drop source gate (D-13/D-14/D-15) -- cited nowhere else
 * in the phase.
 *
 * No jsdom / react-test-renderer in this project -- `FilterMoreGroup` is
 * invoked directly as a plain function and the returned React-element
 * object graph is inspected without a DOM. `Dropdown` is mocked wholesale
 * (same rationale as `FilterStoreFacet.test.tsx`).
 */
import type { ReactElement } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('../components/FilterFacetGroup/index.scss', () => ({}))
jest.mock('../components/FilterMoreGroup/index.scss', () => ({}))

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

type FilterMode = 'off' | 'show' | 'only'

type MockContextValue = {
  showHidden: FilterMode
  setShowHidden: jest.Mock
  showNonAvailable: FilterMode
  setShowNonAvailable: jest.Mock
  showSupportOfflineOnly: boolean
  setShowSupportOfflineOnly: jest.Mock
  showThirdPartyManagedOnly: boolean
  setShowThirdPartyManagedOnly: jest.Mock
  showUpdatesOnly: boolean
  setShowUpdatesOnly: jest.Mock
  activeFilterDescriptors: { id: string; kind: string; value: string }[]
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    showHidden: 'off',
    setShowHidden: jest.fn(),
    showNonAvailable: 'off',
    setShowNonAvailable: jest.fn(),
    showSupportOfflineOnly: false,
    setShowSupportOfflineOnly: jest.fn(),
    showThirdPartyManagedOnly: false,
    setShowThirdPartyManagedOnly: jest.fn(),
    showUpdatesOnly: false,
    setShowUpdatesOnly: jest.fn(),
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
import FilterMoreGroup from '../components/FilterMoreGroup'
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

function buttonsOf(tree: unknown): AnyElement[] {
  return collectElements(tree).filter(
    (el) => el.type === 'button' && el.props.className === 'FilterMoreGroup__only'
  )
}

beforeEach(() => {
  contextValue = makeContextValue()
})

describe('FilterMoreGroup', () => {
  it('renders exactly five filter controls: two tri-states plus three booleans', () => {
    const tree = FilterMoreGroup() as unknown as ReactElement

    expect(rowsOf(tree)).toHaveLength(5)
    expect(buttonsOf(tree)).toHaveLength(2)
  })

  it('no row in this group carries a count (D-28)', () => {
    const tree = FilterMoreGroup() as unknown as ReactElement

    rowsOf(tree).forEach((row) => {
      expect(row.props.count).toBeUndefined()
    })
  })

  // 260815-opt: the collapsed group's header badge. This group is the one
  // where D3 bites hardest -- the alternative was a five-term boolean tally
  // over showHidden/showNonAvailable/showSupportOfflineOnly/
  // showThirdPartyManagedOnly/showUpdatesOnly, a second implementation of
  // "what is active" that could disagree with the chip row. These specs
  // leave all five toggles at their defaults and vary only
  // `activeFilterDescriptors`, so such a tally would read 0 and fail here.
  it('with no active filters, passes selectedCount 0 so no badge renders', () => {
    const tree = FilterMoreGroup() as unknown as ReactElement<AnyProps>

    expect(tree.props.selectedCount).toBe(0)
    expect(tree.props.selectedCountLabel).toBeUndefined()
  })

  it('counts only the More-filters descriptors -- two More plus one store yields 2', () => {
    contextValue = makeContextValue({
      activeFilterDescriptors: [
        { id: 'showHidden:only', kind: 'showHidden', value: 'only' },
        { id: 'showUpdatesOnly', kind: 'showUpdatesOnly', value: 'true' },
        { id: 'store:gog', kind: 'store', value: 'gog' }
      ]
    })

    const tree = FilterMoreGroup() as unknown as ReactElement<AnyProps>

    expect(tree.props.selectedCount).toBe(2)
  })

  it('supplies an already-translated badge label interpolated on {{selected}}, not {{count}}', () => {
    contextValue = makeContextValue({
      activeFilterDescriptors: [
        { id: 'showHidden:only', kind: 'showHidden', value: 'only' },
        { id: 'showUpdatesOnly', kind: 'showUpdatesOnly', value: 'true' }
      ]
    })

    const tree = FilterMoreGroup() as unknown as ReactElement<AnyProps>

    expect(tree.props.selectedCountLabel).toBe('2 selected')
  })

  it('every other prop is unchanged -- the group still renders its own title and className', () => {
    const tree = FilterMoreGroup() as unknown as ReactElement<AnyProps>

    expect(tree.props.title).toBe('More filters')
    expect(tree.props.className).toBe('FilterMoreGroup')
  })

  it.each<[FilterMode, boolean, boolean]>([
    ['off', false, false],
    ['show', true, false],
    ['only', true, true]
  ])(
    'given showHidden=%s, the row checked=%s and the only button aria-pressed=%s',
    (value, expectedChecked, expectedPressed) => {
      contextValue = makeContextValue({ showHidden: value })

      const tree = FilterMoreGroup() as unknown as ReactElement
      const rows = rowsOf(tree)
      const buttons = buttonsOf(tree)

      expect(rows[0]?.props.checked).toBe(expectedChecked)
      expect(buttons[0]?.props['aria-pressed']).toBe(expectedPressed)
    }
  )

  it.each<[FilterMode, FilterMode]>([
    ['off', 'show'],
    ['show', 'off'],
    ['only', 'show']
  ])(
    'clicking the showHidden row when it is %s calls setShowHidden(%s)',
    (value, expectedNext) => {
      contextValue = makeContextValue({ showHidden: value })

      const tree = FilterMoreGroup() as unknown as ReactElement
      const rows = rowsOf(tree)

      ;(rows[0]?.props.onToggle as () => void)()

      expect(contextValue.setShowHidden).toHaveBeenCalledWith(expectedNext)
    }
  )

  it.each<[FilterMode, FilterMode]>([
    ['off', 'only'],
    ['show', 'only'],
    ['only', 'off']
  ])(
    'clicking the showHidden only button when it is %s calls setShowHidden(%s)',
    (value, expectedNext) => {
      contextValue = makeContextValue({ showHidden: value })

      const tree = FilterMoreGroup() as unknown as ReactElement
      const buttons = buttonsOf(tree)

      ;(buttons[0]?.props.onClick as () => void)()

      expect(contextValue.setShowHidden).toHaveBeenCalledWith(expectedNext)
    }
  )
})

// Genre-drop source gate (D-13/D-14/D-15) -- measured per-store genre
// coverage is the reason no Genre facet exists anywhere in the panel: GOG
// (gog/library.ts:1107) and Amazon (nile/library.ts:72,109) populate
// genres at library sync, Steam (steam/games.ts:536) only via the lazy
// per-game appdetails fetch, Epic populates none at all, ZOOM hardcodes
// [], and genres live on GameInfo.extra?.genres rather than on the array
// the grid filters over. The facet is dropped, not half-shipped (D-14),
// and deferred behind an explicit metadata-backfill prerequisite (D-15).
// This describe block is the phase's sole citation site for all three
// decisions -- nothing else in the phase asserts them.
describe('FilterMoreGroup -- Genre-drop source gate (D-13/D-14/D-15)', () => {
  // Plan 06 (FilterViewList, FilterCollectionList) landed before this plan
  // ran, so all seven panel sources are on disk and included below.
  const PANEL_SOURCE_PATHS = [
    join(__dirname, '..', 'components', 'FilterFacetGroup', 'index.tsx'),
    join(__dirname, '..', 'components', 'FilterStoreFacet', 'index.tsx'),
    join(__dirname, '..', 'components', 'FilterRunnabilityFacet', 'index.tsx'),
    join(__dirname, '..', 'components', 'FilterMoreGroup', 'index.tsx'),
    join(__dirname, '..', 'components', 'FilterViewList', 'index.tsx'),
    join(__dirname, '..', 'components', 'FilterCollectionList', 'index.tsx'),
    join(__dirname, '..', '..', '..', '..', 'screens', 'Library', 'facetLabels.ts')
  ]
  const panelSources = PANEL_SOURCE_PATHS.map((p) => readFileSync(p, 'utf8'))

  it('no panel source mentions a genre facet or the per-game metadata field it would need', () => {
    panelSources.forEach((source) => {
      expect(source).not.toMatch(/genre/i)
      expect(source).not.toMatch(/ExtraInfo/)
      expect(source).not.toMatch(/extra\?\.genres/)
    })
  })

  it('gate is non-vacuous -- proven to fail against a known-bad literal', () => {
    const knownBad = `${panelSources[0]}\n// genre`

    expect(knownBad).toMatch(/genre/i)
  })
})
