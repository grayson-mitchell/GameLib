/**
 * Runnability facet group of the Games tier-2 filter panel (34.11-07 Task
 * 2). Host-gated on `runnabilityRows` -- returns null entirely on a
 * Windows host rather than an empty section or a degenerate all-pass row.
 *
 * No tier derivation, medal identifier or per-game field is duplicated
 * here: native-beats-rating, the 32-bit-mac bottle rule, the
 * undefined-vs-null honesty distinction, and the medal-tier collapse into
 * this facet's single "bottle" row all live in the shared filter-engine
 * implementation that `countForRunnability` already goes through. A second
 * implementation here would drift from the counts and from the per-game
 * compatibility badge.
 */
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
import { RUNNABILITY_LABELS } from 'frontend/screens/Library/facetLabels'
import type { RunnabilityTier } from 'frontend/types'
import FilterFacetGroup, { FilterFacetRow } from '../FilterFacetGroup'

// i18next-parser's JavascriptLexer only resolves string-literal key
// arguments to tGamelib() calls -- confirmed empirically in 34.11-06, where
// a call built from a runtime lookup extracted 0 of 4 keys in the same
// `pnpm i18n` run that correctly picked up three literal calls elsewhere.
// A spread over a runtime-looked-up tuple has the same shape, so each key
// below is a literal call site instead of a shared loop over the table.
// The default text is still read FROM the shared table (never duplicated
// as a second literal), so facetLabels.ts stays the single declaration
// site for the actual English copy.
function runnabilityLabel(
  tier: RunnabilityTier,
  tGamelib: (key: string, defaultValue: string) => string
): string {
  switch (tier) {
    case 'native':
      return tGamelib(
        'gamelib:library.filterPanel.runsNatively',
        RUNNABILITY_LABELS.native[1]
      )
    case 'bottle':
      return tGamelib(
        'gamelib:library.filterPanel.runsViaBottle',
        RUNNABILITY_LABELS.bottle[1]
      )
    case 'wontRun':
      return tGamelib(
        'gamelib:library.filterPanel.wontRun',
        RUNNABILITY_LABELS.wontRun[1]
      )
    case 'notChecked':
      return tGamelib(
        'gamelib:library.filterPanel.notYetChecked',
        RUNNABILITY_LABELS.notChecked[1]
      )
  }
}

export default function FilterRunnabilityFacet() {
  const { t: tGamelib } = useTranslation('gamelib')
  const { runnabilityRows, runnabilityFacet, setRunnabilityFacet, countForRunnability } =
    useContext(LibraryContext)

  // D-12 extension (resolved 2026-08-09): the shared per-game info model
  // exposes native-build signals for macOS and Linux but nothing
  // equivalent for a Windows host, so every row here is uncomputable there
  // and `runnabilityRows` is the empty array on that platform. The entire
  // group is therefore absent -- no header, no empty section, and
  // explicitly not a degenerate all-pass "Runs natively" row, which was
  // considered and rejected because it would assert a claim the data model
  // cannot support.
  if (runnabilityRows.length === 0) {
    return null
  }

  return (
    <FilterFacetGroup
      title={tGamelib(
        'gamelib:library.filterPanel.runnabilityGroup',
        'Runnability'
      )}
      className="FilterRunnabilityFacet"
    >
      {runnabilityRows.map((tier: RunnabilityTier) => (
        <FilterFacetRow
          key={tier}
          label={runnabilityLabel(tier, tGamelib)}
          count={countForRunnability(tier)}
          checked={runnabilityFacet.includes(tier)}
          onToggle={() =>
            runnabilityFacet.includes(tier)
              ? setRunnabilityFacet(runnabilityFacet.filter((v) => v !== tier))
              : setRunnabilityFacet([...runnabilityFacet, tier])
          }
        />
      ))}
    </FilterFacetGroup>
  )
}
