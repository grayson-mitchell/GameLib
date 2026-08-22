/**
 * The ONLY place a facet group derives "how many of my filters are currently
 * active" (quick task 260815-opt Task 1, D3).
 *
 * Input is `describeActiveFilters`'s OUTPUT -- the descriptor list -- rather
 * than the raw facet arrays each group already holds. That is deliberate and
 * is the whole point of this module:
 *
 *   `storeFacet.length` agrees with the descriptor list today, and a
 *   hand-rolled five-term boolean tally inside `FilterMoreGroup`
 *   (`showHidden !== 'off' || showNonAvailable !== 'off' || ...`) would agree
 *   with it on the day it was written. Both are SECOND implementations of
 *   "what counts as active", and 34.11's D-26 already named
 *   `describeActiveFilters` the single source of truth for exactly that
 *   question -- `FilterChipRow`'s header comment states the rule outright.
 *   A second tally can drift from the chip row (the group header would claim
 *   2 while the chips enumerated 3) with nothing failing anywhere. Counting
 *   the descriptor list makes that class of disagreement unrepresentable.
 *
 * Purity: `type`-only import, no React, no runtime dependency of any kind, so
 * this stays directly unit-testable in a project with no jsdom
 * (`src/frontend/jest.config.js` runs `testEnvironment: 'node'`).
 */
import type { ActiveFilterDescriptor } from 'frontend/types'

type DescriptorKind = ActiveFilterDescriptor['kind']

/**
 * The six descriptor kinds `FilterMoreGroup` owns rows for -- the three
 * tri-states plus the three booleans.
 *
 * This is a MANUAL transcription of `filterEngine.describeActiveFilters`'s
 * six More-filters branches and can therefore drift from them: add a
 * seventh More filter there without adding it here and the More group's
 * badge silently under-counts while the chip row shows the extra chip.
 * `facetSelectionCount.test.ts` pins the membership and the absence of
 * duplicates as the tripwire for that drift.
 */
export const MORE_FILTER_KINDS = [
  'showHidden',
  'showNonAvailable',
  'noStorePage',
  'showSupportOfflineOnly',
  'showThirdPartyManagedOnly',
  'showUpdatesOnly'
] as const satisfies readonly DescriptorKind[]

/**
 * How many entries of `descriptors` carry a kind present in `kinds`.
 *
 * Note this counts DESCRIPTORS, not kinds: two selected stores are two
 * `kind: 'store'` descriptors and count 2, which is what the header badge
 * has to say. A duplicate entry in `kinds` would double-count -- guarded in
 * the test file rather than defended against here, so the guard sits where a
 * future edit to `MORE_FILTER_KINDS` will trip it.
 */
export function countDescriptorsOfKind(
  descriptors: readonly ActiveFilterDescriptor[],
  kinds: readonly DescriptorKind[]
): number {
  return descriptors.filter((descriptor) => kinds.includes(descriptor.kind))
    .length
}
