/**
 * Direct-invocation tests for `chipLabels.ts` (34.11-08 Task 1), mirroring
 * `CrossoverBadge.test.tsx`'s no-jsdom idiom -- no `@testing-library/react`
 * or `react-test-renderer` is installed in this project (see
 * `src/frontend/jest.config.js`).
 *
 * Task 2 (`FilterChipRow`) and Task 3 (`FilterZeroResult`) append their own
 * `describe` blocks below, in the same file, per the plan's Wave 0
 * requirement (`34.11-VALIDATION.md`).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  chipLabelSpec,
  joinChipLabels,
  renderableActiveFilters,
  ChipLabelSpec
} from '../chipLabels'
import {
  PRESET_UNCATEGORIZED,
  DEFAULT_FILTER_ENGINE_STATE,
  describeActiveFilters
} from '../../../filterEngine'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { RunnerToStore, RUNNABILITY_LABELS } from '../../../facetLabels'
import type {
  ActiveFilterDescriptor,
  LibraryView,
  RunnabilityTier
} from 'frontend/types'

// The panel component chipLabels must agree with about the Uncategorized
// sentinel (CR-04). Resolved relative to __dirname, matching this file's
// existing source-gate idiom further down.
const COLLECTION_LIST_TSX = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'components',
  'UI',
  'NavShell',
  'components',
  'FilterCollectionList',
  'index.tsx'
)

function literalOf(spec: ChipLabelSpec | null): string | null {
  if (spec === null) return null
  return 'literal' in spec ? spec.literal : null
}

describe('chipLabels', () => {
  it("view:installed resolves to the gamelib spec for viewInstalled / 'Installed'", () => {
    const spec = chipLabelSpec({
      id: 'view:installed',
      kind: 'view',
      value: 'installed'
    })

    expect(spec).toEqual({
      ns: 'gamelib',
      key: 'gamelib:library.filterPanel.viewInstalled',
      defaultText: 'Installed'
    })
  })

  it('view:all never produces a chip label, even if forged (D-26)', () => {
    const spec = chipLabelSpec({ id: 'view:all', kind: 'view', value: 'all' })

    expect(spec).toBeNull()
  })

  it('collection:Backlog is a literal spec carrying the name unchanged', () => {
    const spec = chipLabelSpec({
      id: 'collection:Backlog',
      kind: 'collection',
      value: 'Backlog'
    })

    expect(spec).toEqual({ literal: 'Backlog' })
  })

  // CR-04 (34.11 code review). Only `collection: 'Backlog'` was covered
  // here, so the sentinel path was untested and shipped: every collection
  // value was treated as opaque user data, and selecting Uncategorized
  // produced a chip reading `preset_uncategorized` plus the sentence "No
  // games match preset_uncategorized." -- while the panel row for that same
  // filter read "Uncategorized".
  it('collection:preset_uncategorized is NOT treated as user data -- it resolves through the same key the panel uses', () => {
    const spec = chipLabelSpec({
      id: `collection:${PRESET_UNCATEGORIZED}`,
      kind: 'collection',
      value: PRESET_UNCATEGORIZED
    })

    expect(spec).toEqual({
      ns: 'default',
      key: 'header.uncategorized',
      defaultText: 'Uncategorized'
    })
    // The load-bearing negative: the sentinel must never reach the literal
    // branch, which is what put the raw string on screen.
    expect(literalOf(spec)).toBeNull()
  })

  it('the sentinel the chip row special-cases is the SAME constant filterEngine and the panel compare against', () => {
    // Guards the drift CR-04's fix exists to prevent: if any site ever
    // reverts to its own string literal, this and the case above diverge.
    expect(PRESET_UNCATEGORIZED).toBe('preset_uncategorized')

    // Comments stripped: this file's header comment legitimately NAMES the
    // sentinel in prose, and a gate that trips on prose is a gate that gets
    // deleted. Only real code is asserted against.
    const collectionList = stripSourceComments(
      readFileSync(COLLECTION_LIST_TSX, 'utf8')
    )
    expect(collectionList).toMatch(/PRESET_UNCATEGORIZED/)
    expect(collectionList).not.toMatch(/'preset_uncategorized'/)
  })

  it("the key the sentinel resolves to is the one FilterCollectionList calls t() with literally -- i18next-parser only sees that call site, not chipLabels' data", () => {
    const collectionList = readFileSync(COLLECTION_LIST_TSX, 'utf8')
    expect(collectionList).toMatch(
      /t\(\s*'header\.uncategorized',\s*'Uncategorized'\s*\)/
    )
  })

  it('search:witcher is a literal spec, quoted with straight double quotes', () => {
    const spec = chipLabelSpec({
      id: 'search',
      kind: 'search',
      value: 'witcher'
    })

    expect(literalOf(spec)).toBe('"witcher"')
  })

  it('store:gog resolves to the literal RunnerToStore.gog value, read from the import', () => {
    const spec = chipLabelSpec({ id: 'store:gog', kind: 'store', value: 'gog' })

    expect(literalOf(spec)).toBe(RunnerToStore.gog)
  })

  it("store:sideload resolves to the gamelib spec for storeOther / 'Other'", () => {
    const spec = chipLabelSpec({
      id: 'store:sideload',
      kind: 'store',
      value: 'sideload'
    })

    expect(spec).toEqual({
      ns: 'gamelib',
      key: 'gamelib:library.storeOther',
      defaultText: 'Other'
    })
  })

  it('store with an unmapped value returns null rather than the raw runner id', () => {
    const spec = chipLabelSpec({
      id: 'store:notARealStore',
      kind: 'store',
      value: 'notARealStore'
    })

    expect(spec).toBeNull()
  })

  it.each<RunnabilityTier>(['native', 'bottle', 'wontRun', 'notChecked'])(
    'runnability:%s resolves to exactly RUNNABILITY_LABELS[tier] -- a Runnability selection is a first-class chip',
    (tier) => {
      const spec = chipLabelSpec({
        id: `runnability:${tier}`,
        kind: 'runnability',
        value: tier
      })
      const [key, defaultText] = RUNNABILITY_LABELS[tier]

      expect(spec).toEqual({ ns: 'gamelib', key, defaultText })
    }
  )

  it('runnability with an unmapped tier returns null', () => {
    const spec = chipLabelSpec({
      id: 'runnability:notATier',
      kind: 'runnability',
      value: 'notATier'
    })

    expect(spec).toBeNull()
  })

  it("showHidden:only resolves to chipHiddenOnly / 'Hidden only'", () => {
    const spec = chipLabelSpec({
      id: 'showHidden:only',
      kind: 'showHidden',
      value: 'only'
    })

    expect(spec).toEqual({
      ns: 'gamelib',
      key: 'gamelib:library.filterPanel.chipHiddenOnly',
      defaultText: 'Hidden only'
    })
  })

  it("showHidden:show resolves to chipHiddenIncluded / 'Including hidden'", () => {
    const spec = chipLabelSpec({
      id: 'showHidden:show',
      kind: 'showHidden',
      value: 'show'
    })

    expect(spec).toEqual({
      ns: 'gamelib',
      key: 'gamelib:library.filterPanel.chipHiddenIncluded',
      defaultText: 'Including hidden'
    })
  })

  it("showNonAvailable:only resolves to chipNonAvailableOnly / 'Non-available only'", () => {
    const spec = chipLabelSpec({
      id: 'showNonAvailable:only',
      kind: 'showNonAvailable',
      value: 'only'
    })

    expect(spec).toEqual({
      ns: 'gamelib',
      key: 'gamelib:library.filterPanel.chipNonAvailableOnly',
      defaultText: 'Non-available only'
    })
  })

  it("showNonAvailable:show resolves to chipNonAvailableIncluded / 'Including non-available'", () => {
    const spec = chipLabelSpec({
      id: 'showNonAvailable:show',
      kind: 'showNonAvailable',
      value: 'show'
    })

    expect(spec).toEqual({
      ns: 'gamelib',
      key: 'gamelib:library.filterPanel.chipNonAvailableIncluded',
      defaultText: 'Including non-available'
    })
  })

  it('showUpdatesOnly:true resolves to a DEFAULT-namespace spec for the existing shipped key', () => {
    const spec = chipLabelSpec({
      id: 'showUpdatesOnly',
      kind: 'showUpdatesOnly',
      value: 'true'
    })

    expect(spec).toEqual({
      ns: 'default',
      key: 'header.show_updates_only',
      defaultText: 'Show games with updates only'
    })
  })

  it('showSupportOfflineOnly:true resolves to the existing shipped default-namespace key', () => {
    const spec = chipLabelSpec({
      id: 'showSupportOfflineOnly',
      kind: 'showSupportOfflineOnly',
      value: 'true'
    })

    expect(spec).toEqual({
      ns: 'default',
      key: 'header.show_support_offline_only',
      defaultText: 'Show offline-supported only'
    })
  })

  it('showThirdPartyManagedOnly:true resolves to the existing shipped default-namespace key', () => {
    const spec = chipLabelSpec({
      id: 'showThirdPartyManagedOnly',
      kind: 'showThirdPartyManagedOnly',
      value: 'true'
    })

    expect(spec).toEqual({
      ns: 'default',
      key: 'header.show_third_party_managed_only',
      defaultText: 'Show third-party managed only'
    })
  })

  it.each<[ActiveFilterDescriptor['kind'], string]>([
    ['view', 'installed'],
    ['collection', 'Backlog'],
    ['store', 'gog'],
    ['runnability', 'native'],
    ['search', 'witcher'],
    ['showHidden', 'only'],
    ['showNonAvailable', 'only'],
    ['showSupportOfflineOnly', 'true'],
    ['showThirdPartyManagedOnly', 'true'],
    ['showUpdatesOnly', 'true']
  ])(
    'every member of the kind union (%s) yields a non-null spec',
    (kind, value) => {
      const spec = chipLabelSpec({ id: `${kind}:${value}`, kind, value })

      expect(spec).not.toBeNull()
    }
  )

  it('a genuinely unknown kind (notAFilterKind) returns null, distinct from any real kind', () => {
    const spec = chipLabelSpec({
      id: 'x',
      kind: 'notAFilterKind',
      value: 'x'
    } as unknown as ActiveFilterDescriptor)

    expect(spec).toBeNull()
  })

  it('joinChipLabels joins with " + ", matching D-30\'s own example', () => {
    expect(joinChipLabels(['Installed', 'GOG', '"witcher"'])).toBe(
      'Installed + GOG + "witcher"'
    )
  })

  it('joinChipLabels([]) is an empty string', () => {
    expect(joinChipLabels([])).toBe('')
  })
})

describe('renderableActiveFilters (WR-12)', () => {
  // Test D: a retired/forged `view` value survives `describeActiveFilters`
  // as one descriptor (it is outside `installed|recentlyPlayed|favourites`,
  // so `chipLabelSpec` returns null for it, but `describeActiveFilters`
  // itself has no opinion on renderability) -- and today NOTHING filters
  // that descriptor back out before `activeFilterCount` is derived from it.
  // Failing assertion against current code: `activeFilterCount` would read
  // 1 with zero renderable labels, producing the empty
  // "No games match ." sentence.
  it('drops a descriptor chipLabelSpec cannot name, e.g. a forged/retired libraryView', () => {
    const rawDescriptors = describeActiveFilters(
      { ...DEFAULT_FILTER_ENGINE_STATE, view: 'retiredView' as LibraryView },
      ''
    )

    // Non-vacuity: the raw descriptor list really does contain one entry --
    // otherwise `renderableActiveFilters` returning [] below would prove
    // nothing about the filter actually running.
    expect(rawDescriptors).toHaveLength(1)

    expect(renderableActiveFilters(rawDescriptors)).toHaveLength(0)
  })

  // Test E: a control proving the helper is not a blanket `[]` -- a REAL
  // filter survives unchanged.
  it('is not a blanket empty list -- a real filter (view: installed) survives unchanged', () => {
    const rawDescriptors = describeActiveFilters(
      { ...DEFAULT_FILTER_ENGINE_STATE, view: 'installed' },
      ''
    )

    expect(rawDescriptors).toHaveLength(1)
    expect(renderableActiveFilters(rawDescriptors)).toEqual(rawDescriptors)
  })

  // Test F: `renderableActiveFilters` is referentially the SAME filter every
  // consumer applies -- not a parallel reimplementation that could drift
  // from `chipLabelSpec`.
  it('is exactly `descriptors.filter(d => chipLabelSpec(d) !== null)` for a mixed list', () => {
    const mixed: ActiveFilterDescriptor[] = [
      { id: 'view:installed', kind: 'view', value: 'installed' },
      { id: 'view:retiredView', kind: 'view', value: 'retiredView' }
    ]

    expect(renderableActiveFilters(mixed)).toEqual(
      mixed.filter((d) => chipLabelSpec(d) !== null)
    )
  })
})

// ---------------------------------------------------------------------------
// Task 2: FilterChipRow -- direct-invocation tests, no jsdom, matching the
// FilterMoreGroup.test.tsx idiom (`jest.mock('react', ...)` for useContext,
// `jest.mock('react-i18next', ...)` for useTranslation, component invoked
// as a plain function).
// ---------------------------------------------------------------------------

jest.mock('../index.scss', () => ({}))

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: (props: Record<string, unknown>) => ({
    type: 'mock-fontawesome-icon',
    props
  })
}))

function interpolate(
  template: string,
  options?: Record<string, string>
): string {
  if (!options) return template
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_match, name: string) => options[name] ?? ''
  )
}

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      options?: Record<string, string>
    ): string => interpolate(defaultValue, options)
  })
}))

type MockLibraryContextValue = {
  activeFilterDescriptors: ActiveFilterDescriptor[]
  activeFilterCount: number
  clearAllFilters: jest.Mock
  storeFacet: string[]
  setStoreFacet: jest.Mock
  runnabilityFacet: string[]
  setRunnabilityFacet: jest.Mock
  setLibraryView: jest.Mock
  setCurrentCollection: jest.Mock
  handleSearch: jest.Mock
  setShowHidden: jest.Mock
  setShowNonAvailable: jest.Mock
  setShowSupportOfflineOnly: jest.Mock
  setShowThirdPartyManagedOnly: jest.Mock
  setShowUpdatesOnly: jest.Mock
  __isDefaultLibraryContext?: true
}

function makeChipRowContextValue(
  overrides: Partial<MockLibraryContextValue> = {}
): MockLibraryContextValue {
  return {
    activeFilterDescriptors: [],
    activeFilterCount: 0,
    clearAllFilters: jest.fn(),
    storeFacet: [],
    setStoreFacet: jest.fn(),
    runnabilityFacet: [],
    setRunnabilityFacet: jest.fn(),
    setLibraryView: jest.fn(),
    setCurrentCollection: jest.fn(),
    handleSearch: jest.fn(),
    setShowHidden: jest.fn(),
    setShowNonAvailable: jest.fn(),
    setShowSupportOfflineOnly: jest.fn(),
    setShowThirdPartyManagedOnly: jest.fn(),
    setShowUpdatesOnly: jest.fn(),
    ...overrides
  }
}

let chipRowContextValue: MockLibraryContextValue = makeChipRowContextValue()

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => chipRowContextValue
}))

// Imported after the mocks above -- ts-jest does not hoist jest.mock like
// babel-jest, so textual order matters (see FilterMoreGroup.test.tsx).
import FilterChipRowImport from '../index'

type AnyProps = Record<string, unknown> & { children?: unknown }
type AnyElement = { type: unknown; props: AnyProps }

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

function removeButtonsOf(tree: unknown): AnyElement[] {
  return collectElements(tree).filter(
    (el) =>
      el.type === 'button' && el.props.className === 'FilterChipRow__remove'
  )
}

function clearAllButtonOf(tree: unknown): AnyElement | undefined {
  return collectElements(tree).find((el) => {
    const className = el.props.className
    return (
      el.type === 'button' &&
      typeof className === 'string' &&
      className.includes('FilterChipRow__clearAll')
    )
  })
}

beforeEach(() => {
  chipRowContextValue = makeChipRowContextValue()
})

describe('FilterChipRow', () => {
  it('activeFilterCount === 0 (real context) -> returns null, no empty row', () => {
    chipRowContextValue = makeChipRowContextValue({
      activeFilterCount: 0,
      activeFilterDescriptors: []
    })

    expect(FilterChipRowImport()).toBeNull()
  })

  it('rendered outside the provider (__isDefaultLibraryContext) -> console.error fires once naming FilterChipRow and LibraryContext.Provider, returns null', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    chipRowContextValue = makeChipRowContextValue({
      __isDefaultLibraryContext: true
    })

    const result = FilterChipRowImport()

    expect(result).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
    const message = spy.mock.calls[0]?.[0] as string
    expect(message).toEqual(expect.stringContaining('FilterChipRow'))
    expect(message).toEqual(expect.stringContaining('LibraryContext.Provider'))
    spy.mockRestore()
  })

  it('mounted inside the provider with zero descriptors -> null, console.error NOT called -- distinguishable from the dead-provider case', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    chipRowContextValue = makeChipRowContextValue({
      activeFilterCount: 0,
      activeFilterDescriptors: []
    })

    const result = FilterChipRowImport()

    expect(result).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('descriptors for view:installed, store:gog and search render exactly three removal chips plus one Clear all chip, in descriptor order', () => {
    const descriptors: ActiveFilterDescriptor[] = [
      { id: 'view:installed', kind: 'view', value: 'installed' },
      { id: 'store:gog', kind: 'store', value: 'gog' },
      { id: 'search', kind: 'search', value: 'witcher' }
    ]
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: descriptors,
      activeFilterCount: descriptors.length
    })

    const tree = FilterChipRowImport()
    const removeButtons = removeButtonsOf(tree)
    const clearAll = clearAllButtonOf(tree)

    expect(removeButtons).toHaveLength(3)
    expect(clearAll).toBeDefined()
  })

  it('a runnability:bottle descriptor renders a chip labelled "Runs via bottle" with a working ×', () => {
    const descriptor: ActiveFilterDescriptor = {
      id: 'runnability:bottle',
      kind: 'runnability',
      value: 'bottle'
    }
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: [descriptor],
      activeFilterCount: 1,
      runnabilityFacet: ['bottle']
    })

    const tree = FilterChipRowImport()
    const removeButtons = removeButtonsOf(tree)

    expect(removeButtons).toHaveLength(1)
    expect(removeButtons[0]?.props['aria-label']).toContain('Runs via bottle')
    ;(removeButtons[0]?.props.onClick as () => void)()
    expect(chipRowContextValue.setRunnabilityFacet).toHaveBeenCalledWith([])
  })

  it("every removal chip's × carries a real interpolated aria-label -- three active chips produce three distinct accessible names", () => {
    const descriptors: ActiveFilterDescriptor[] = [
      { id: 'view:installed', kind: 'view', value: 'installed' },
      { id: 'store:gog', kind: 'store', value: 'gog' },
      { id: 'search', kind: 'search', value: 'witcher' }
    ]
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: descriptors,
      activeFilterCount: descriptors.length
    })

    const tree = FilterChipRowImport()
    const labels = removeButtonsOf(tree).map((el) => el.props['aria-label'])

    expect(labels).toEqual([
      'Remove Installed filter',
      'Remove GOG filter',
      'Remove "witcher" filter'
    ])
    expect(new Set(labels).size).toBe(3)
  })

  it('clicking the × on a store:gog chip calls setStoreFacet with the previous array minus gog -- never empty, never a string', () => {
    const descriptor: ActiveFilterDescriptor = {
      id: 'store:gog',
      kind: 'store',
      value: 'gog'
    }
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: [descriptor],
      activeFilterCount: 1,
      storeFacet: ['gog', 'legendary']
    })

    const tree = FilterChipRowImport()
    const [removeButton] = removeButtonsOf(tree)
    ;(removeButton?.props.onClick as () => void)()

    expect(chipRowContextValue.setStoreFacet).toHaveBeenCalledWith([
      'legendary'
    ])
  })

  it('clicking the × on a view:installed chip calls setLibraryView("all")', () => {
    const descriptor: ActiveFilterDescriptor = {
      id: 'view:installed',
      kind: 'view',
      value: 'installed'
    }
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: [descriptor],
      activeFilterCount: 1
    })

    const tree = FilterChipRowImport()
    const [removeButton] = removeButtonsOf(tree)
    ;(removeButton?.props.onClick as () => void)()

    expect(chipRowContextValue.setLibraryView).toHaveBeenCalledWith('all')
  })

  it('clicking the × on a collection:Backlog chip calls setCurrentCollection(null)', () => {
    const descriptor: ActiveFilterDescriptor = {
      id: 'collection:Backlog',
      kind: 'collection',
      value: 'Backlog'
    }
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: [descriptor],
      activeFilterCount: 1
    })

    const tree = FilterChipRowImport()
    const [removeButton] = removeButtonsOf(tree)
    ;(removeButton?.props.onClick as () => void)()

    expect(chipRowContextValue.setCurrentCollection).toHaveBeenCalledWith(null)
  })

  it.each<['only' | 'show', string]>([
    ['only', 'off'],
    ['show', 'off']
  ])(
    "clicking the × on a showHidden:%s chip always calls setShowHidden('%s') -- D-27, never steps the cycle",
    (value) => {
      const descriptor: ActiveFilterDescriptor = {
        id: `showHidden:${value}`,
        kind: 'showHidden',
        value
      }
      chipRowContextValue = makeChipRowContextValue({
        activeFilterDescriptors: [descriptor],
        activeFilterCount: 1
      })

      const tree = FilterChipRowImport()
      const [removeButton] = removeButtonsOf(tree)
      ;(removeButton?.props.onClick as () => void)()

      expect(chipRowContextValue.setShowHidden).toHaveBeenCalledWith('off')
      expect(chipRowContextValue.setShowHidden).not.toHaveBeenCalledWith('only')
      expect(chipRowContextValue.setShowHidden).not.toHaveBeenCalledWith('show')
    }
  )

  it('clicking the × on a showUpdatesOnly chip calls setShowUpdatesOnly(false)', () => {
    const descriptor: ActiveFilterDescriptor = {
      id: 'showUpdatesOnly',
      kind: 'showUpdatesOnly',
      value: 'true'
    }
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: [descriptor],
      activeFilterCount: 1
    })

    const tree = FilterChipRowImport()
    const [removeButton] = removeButtonsOf(tree)
    ;(removeButton?.props.onClick as () => void)()

    expect(chipRowContextValue.setShowUpdatesOnly).toHaveBeenCalledWith(false)
  })

  it('clicking Clear all calls clearAllFilters exactly once and calls no individual setter (D-25)', () => {
    const descriptors: ActiveFilterDescriptor[] = [
      { id: 'view:installed', kind: 'view', value: 'installed' },
      { id: 'store:gog', kind: 'store', value: 'gog' }
    ]
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: descriptors,
      activeFilterCount: descriptors.length
    })

    const tree = FilterChipRowImport()
    const clearAll = clearAllButtonOf(tree)
    ;(clearAll?.props.onClick as () => void)()

    expect(chipRowContextValue.clearAllFilters).toHaveBeenCalledTimes(1)
    expect(chipRowContextValue.setLibraryView).not.toHaveBeenCalled()
    expect(chipRowContextValue.setStoreFacet).not.toHaveBeenCalled()
  })

  it('no chip element carries a count, a number, or a numeric child (D-28)', () => {
    const descriptors: ActiveFilterDescriptor[] = [
      { id: 'view:installed', kind: 'view', value: 'installed' },
      { id: 'store:gog', kind: 'store', value: 'gog' }
    ]
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: descriptors,
      activeFilterCount: descriptors.length
    })

    const tree = FilterChipRowImport()
    collectElements(tree).forEach((el) => {
      expect(el.props.count).toBeUndefined()
      if (typeof el.props.children === 'number') {
        throw new Error('a chip child must never be a bare number')
      }
    })
  })

  it('a descriptor for which chipLabelSpec returns null (unmapped store value) renders no chip and does not throw', () => {
    const descriptor: ActiveFilterDescriptor = {
      id: 'store:notARealStore',
      kind: 'store',
      value: 'notARealStore'
    }
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: [descriptor],
      activeFilterCount: 1
    })

    expect(() => {
      const tree = FilterChipRowImport()
      expect(removeButtonsOf(tree)).toHaveLength(0)
    }).not.toThrow()
  })
})

describe('FilterChipRow -- D-08 source gate (sort/layout/alphabet are not filters)', () => {
  const source = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')

  it('the component source never references sort/layout/alphabet vocabulary', () => {
    expect(source).not.toMatch(
      /sortDescending|sortInstalled|alphabetFilterLetter|showAlphabetFilter/
    )
  })

  it('gate is non-vacuous -- proven to fail against a known-bad literal', () => {
    const knownBad = `${source}\n// sortDescending`

    expect(knownBad).toMatch(/sortDescending/)
  })
})

// ---------------------------------------------------------------------------
// Task 3: FilterZeroResult -- reuses the exact same 'react' / 'react-i18next'
// mocks registered above for FilterChipRow (both components read the same
// LibraryContext shape), so no second `jest.mock('react', ...)` registration
// is needed here -- re-pointing the shared `chipRowContextValue` per case is
// enough, matching the FilterMoreGroup.test.tsx precedent of one context
// mock reused by every test in the file.
// ---------------------------------------------------------------------------

jest.mock('../../FilterZeroResult/index.scss', () => ({}))

// Imported after the mocks above -- ts-jest does not hoist jest.mock.
import FilterZeroResultImport from '../../FilterZeroResult'

describe('FilterZeroResult', () => {
  it("body is exactly D-30's own example sentence for view:installed + store:gog + search:witcher", () => {
    const descriptors: ActiveFilterDescriptor[] = [
      { id: 'view:installed', kind: 'view', value: 'installed' },
      { id: 'store:gog', kind: 'store', value: 'gog' },
      { id: 'search', kind: 'search', value: 'witcher' }
    ]
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: descriptors,
      activeFilterCount: descriptors.length
    })

    const tree = FilterZeroResultImport() as unknown as { props: AnyProps }
    const body = collectElements(tree).find(
      (el) => el.props.className === 'FilterZeroResult__body'
    )

    expect(body?.props.children).toBe(
      'No games match Installed + GOG + "witcher".'
    )
  })

  it('a runnability:bottle descriptor is named "Runs via bottle" in the sentence', () => {
    const descriptors: ActiveFilterDescriptor[] = [
      { id: 'runnability:bottle', kind: 'runnability', value: 'bottle' }
    ]
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: descriptors,
      activeFilterCount: descriptors.length
    })

    const tree = FilterZeroResultImport() as unknown as { props: AnyProps }
    const body = collectElements(tree).find(
      (el) => el.props.className === 'FilterZeroResult__body'
    )

    expect(body?.props.children).toContain('Runs via bottle')
  })

  it('the body is never generic -- it always contains at least one active filter label', () => {
    const descriptors: ActiveFilterDescriptor[] = [
      { id: 'showUpdatesOnly', kind: 'showUpdatesOnly', value: 'true' }
    ]
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: descriptors,
      activeFilterCount: descriptors.length
    })

    const tree = FilterZeroResultImport() as unknown as { props: AnyProps }
    const body = collectElements(tree).find(
      (el) => el.props.className === 'FilterZeroResult__body'
    )

    expect(body?.props.children).toContain('Show games with updates only')
  })

  it('activeFilterCount === 0 (real context) -> returns null', () => {
    chipRowContextValue = makeChipRowContextValue({
      activeFilterCount: 0,
      activeFilterDescriptors: []
    })

    expect(FilterZeroResultImport()).toBeNull()
  })

  it('rendered outside the provider (__isDefaultLibraryContext) -> console.error fires once naming FilterZeroResult, returns null', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    chipRowContextValue = makeChipRowContextValue({
      __isDefaultLibraryContext: true
    })

    const result = FilterZeroResultImport()

    expect(result).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0] as string).toEqual(
      expect.stringContaining('FilterZeroResult')
    )
    spy.mockRestore()
  })

  it('mounted inside the provider with zero descriptors -> null, console.error NOT called', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    chipRowContextValue = makeChipRowContextValue({
      activeFilterCount: 0,
      activeFilterDescriptors: []
    })

    const result = FilterZeroResultImport()

    expect(result).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('the inline action calls clearAllFilters exactly once and calls no individual setter (D-25)', () => {
    const descriptors: ActiveFilterDescriptor[] = [
      { id: 'view:installed', kind: 'view', value: 'installed' }
    ]
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: descriptors,
      activeFilterCount: descriptors.length
    })

    const tree = FilterZeroResultImport() as unknown as { props: AnyProps }
    const action = collectElements(tree).find(
      (el) => el.props.className === 'FilterZeroResult__action'
    )
    ;(action?.props.onClick as () => void)()

    expect(chipRowContextValue.clearAllFilters).toHaveBeenCalledTimes(1)
    expect(chipRowContextValue.setLibraryView).not.toHaveBeenCalled()
  })

  // WR-16: this mocked `t` returns its default unconditionally, so it cannot
  // prove i18next itself treats $t(...) as inert -- that engine-level claim
  // now lives in `chipLabels.realI18next.test.ts`, against a real
  // `i18next.createInstance()`. What this test still proves, and is worth
  // keeping: a hostile collection name reaches `FilterZeroResult`'s body
  // node byte-for-byte unmodified by this component -- a structural
  // pass-through check, not an injection-safety one.
  it('a hostile collection name containing i18next nesting syntax ($t(...)) passes through FilterZeroResult unmodified (structural, not an injection-safety proof -- see chipLabels.realI18next.test.ts for WR-16)', () => {
    const hostileName = 'Backlog $t(header.uncategorized)'
    const descriptors: ActiveFilterDescriptor[] = [
      {
        id: `collection:${hostileName}`,
        kind: 'collection',
        value: hostileName
      }
    ]
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: descriptors,
      activeFilterCount: descriptors.length
    })

    const tree = FilterZeroResultImport() as unknown as { props: AnyProps }
    const body = collectElements(tree).find(
      (el) => el.props.className === 'FilterZeroResult__body'
    )

    expect(body?.props.children).toBe(`No games match ${hostileName}.`)
  })

  // WR-16: same reasoning as the $t(...) test above -- the mocked `t` can't
  // prove real-i18next injection safety for a literal {{token}} either;
  // that claim also lives in `chipLabels.realI18next.test.ts`. This stays as
  // a structural pass-through proof.
  it('a hostile collection name containing a literal {{filters}} token passes through FilterZeroResult unmodified (structural, not an injection-safety proof -- see chipLabels.realI18next.test.ts for WR-16)', () => {
    const hostileName = 'Backlog {{filters}}'
    const descriptors: ActiveFilterDescriptor[] = [
      {
        id: `collection:${hostileName}`,
        kind: 'collection',
        value: hostileName
      }
    ]
    chipRowContextValue = makeChipRowContextValue({
      activeFilterDescriptors: descriptors,
      activeFilterCount: descriptors.length
    })

    const tree = FilterZeroResultImport() as unknown as { props: AnyProps }
    const body = collectElements(tree).find(
      (el) => el.props.className === 'FilterZeroResult__body'
    )

    expect(body?.props.children).toBe(`No games match ${hostileName}.`)
  })
})

describe('FilterZeroResult -- no unsafe render path source gate', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'FilterZeroResult', 'index.tsx'),
    'utf8'
  )

  it('contains neither dangerouslySetInnerHTML nor <Trans', () => {
    expect(source).not.toMatch(/dangerouslySetInnerHTML/)
    expect(source).not.toMatch(/<Trans/)
  })

  it('gate is non-vacuous -- proven to fail against a known-bad literal', () => {
    const knownBad = `${source}\n// dangerouslySetInnerHTML`

    expect(knownBad).toMatch(/dangerouslySetInnerHTML/)
  })
})
