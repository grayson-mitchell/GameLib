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
