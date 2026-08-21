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
import { countDescriptorsOfKind } from '../FilterFacetGroup/selectionCount'

// i18next-parser's JavascriptLexer only resolves string-literal arguments
// to tGamelib() calls -- confirmed empirically in 34.11-06 (a lookup-array
// call extracted 0 of 4 keys in the same `pnpm i18n` run that correctly
// picked up three literal calls elsewhere) and reconfirmed here: a literal
// KEY paired with a non-literal defaultValue (`RUNNABILITY_LABELS[tier][1]`)
// still extracts the key, but the generated catalog gets an EMPTY default
// text for it -- and once a key exists in the resource bundle, i18next
// renders that catalog value instead of falling back to the call site's
// defaultValue argument, so the row would render blank text, not the
// intended copy. Both arguments are therefore literal below. The
// development-only check beneath the switch throws if this literal copy
// ever drifts from facetLabels.ts's tuples, which stays the canonical
// source for the English text.
function runnabilityLabel(
  tier: RunnabilityTier,
  tGamelib: (key: string, defaultValue: string) => string
): string {
  switch (tier) {
    case 'native':
      return tGamelib(
        'gamelib:library.filterPanel.runsNatively',
        'Runs natively'
      )
    case 'bottle':
      return tGamelib(
        'gamelib:library.filterPanel.runsViaBottle',
        'Runs via bottle'
      )
    case 'wontRun':
      return tGamelib('gamelib:library.filterPanel.wontRun', "Won't run")
    case 'notChecked':
      return tGamelib(
        'gamelib:library.filterPanel.notYetChecked',
        'Not yet checked'
      )
  }
}

// Echoes the defaultValue argument straight back, so the dev-only check
// below can read out what runnabilityLabel's own literal switch passed at
// each call site without a second copy of the English text living
// anywhere in this file (a second copy is exactly what the hardcoded-
// string gate -- meta/hardcodedStringGate.ts -- exists to catch, since
// this file is now inside its scan scope).
const echoDefaultValue = (_key: string, defaultValue: string) => defaultValue

if (process.env.NODE_ENV !== 'production') {
  ;(Object.keys(RUNNABILITY_LABELS) as RunnabilityTier[]).forEach((tier) => {
    const literalDefault = runnabilityLabel(tier, echoDefaultValue)
    if (literalDefault !== RUNNABILITY_LABELS[tier][1]) {
      throw new Error(
        `FilterRunnabilityFacet's literal default text for "${tier}" has drifted from facetLabels.ts's RUNNABILITY_LABELS -- update both together`
      )
    }
  })
}

export default function FilterRunnabilityFacet() {
  const { t: tGamelib } = useTranslation('gamelib')
  const {
    runnabilityRows,
    runnabilityFacet,
    setRunnabilityFacet,
    countForRunnability,
    activeFilterDescriptors
  } = useContext(LibraryContext)

  // D3: the header badge's number comes from the DESCRIPTOR list, never
  // from `runnabilityFacet.length` -- the descriptor list is the declared
  // single source of truth for what is active (34.11 D-26) and is what the
  // chip row renders, so counting it is what makes a header-vs-chips
  // disagreement unrepresentable rather than merely absent.
  const selectedCount = countDescriptorsOfKind(activeFilterDescriptors, [
    'runnability'
  ])

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
      selectedCount={selectedCount}
      // Literal key AND literal default at this call site, deliberately not
      // factored into a shared helper -- see the lexer comment at the top of
      // this file for why a variable key or a non-literal default silently
      // produces blank UI text. Interpolated on `selected`; the name `count`
      // is reserved by i18next and triggers plural key resolution.
      selectedCountLabel={
        selectedCount > 0
          ? tGamelib(
              'gamelib:library.filterPanel.groupSelectedCount',
              '{{selected}} selected',
              { selected: selectedCount }
            )
          : undefined
      }
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
