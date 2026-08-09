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
  ChipLabelSpec
} from '../chipLabels'
import { RunnerToStore, RUNNABILITY_LABELS } from '../../../facetLabels'
import type { ActiveFilterDescriptor, RunnabilityTier } from 'frontend/types'

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

  it('search:witcher is a literal spec, quoted with straight double quotes', () => {
    const spec = chipLabelSpec({ id: 'search', kind: 'search', value: 'witcher' })

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
    (el) => el.type === 'button' && el.props.className === 'FilterChipRow__remove'
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

    expect(chipRowContextValue.setStoreFacet).toHaveBeenCalledWith(['legendary'])
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
  const source = readFileSync(
    join(__dirname, '..', 'index.tsx'),
    'utf8'
  )

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
