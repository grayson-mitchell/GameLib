/**
 * Store facet group of the Games tier-2 filter panel (34.11-07 Task 2).
 *
 * Renders one row per connected store account (D-04) -- this component
 * holds no account-connectivity logic of its own, so it cannot render a row
 * for a store the user has not connected. That gate already ran in plan
 * 04's `connectedStores` memo; re-deriving it here would create a second
 * source of truth that can disagree with the counts.
 */
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
import { RunnerToStore } from 'frontend/screens/Library/facetLabels'
import type { StoreFacetValue } from 'frontend/types'
import FilterFacetGroup, { FilterFacetRow } from '../FilterFacetGroup'
import { countDescriptorsOfKind } from '../FilterFacetGroup/selectionCount'

export default function FilterStoreFacet() {
  const { t: tGamelib } = useTranslation('gamelib')
  const {
    connectedStores,
    storeFacet,
    setStoreFacet,
    countForStore,
    activeFilterDescriptors
  } = useContext(LibraryContext)

  // D3: the header badge's number comes from the DESCRIPTOR list, never
  // from `storeFacet.length`. The two agree today, but the descriptor list
  // is the declared single source of truth for what is active (34.11 D-26)
  // and is what the chip row renders, so counting it is what makes a
  // header-vs-chips disagreement unrepresentable rather than merely absent.
  const selectedCount = countDescriptorsOfKind(activeFilterDescriptors, [
    'store'
  ])

  // A group with no rows is an empty section, and the panel does not ship
  // empty sections.
  if (connectedStores.length === 0) {
    return null
  }

  return (
    <FilterFacetGroup
      title={tGamelib('gamelib:library.filterPanel.storeGroup', 'Store')}
      className="FilterStoreFacet"
      selectedCount={selectedCount}
      // Literal key AND literal default, spelled out at each of the three
      // call sites rather than factored into a shared helper: i18next-parser's
      // JavascriptLexer only resolves STRING-LITERAL arguments, so a helper
      // taking the key as a variable is invisible to extraction, and a
      // literal key with a non-literal default extracts an EMPTY default --
      // which i18next then renders in preference to the call-site fallback,
      // i.e. blank UI text. Interpolated on `selected`; the name `count` is
      // reserved by i18next and triggers plural key resolution
      // (`_one`/`_other`), neither of which exists in the catalog.
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
      {connectedStores.map((value: StoreFacetValue) => (
        <FilterFacetRow
          key={value}
          label={
            value === 'sideload'
              ? tGamelib('gamelib:library.storeOther', 'Other')
              : RunnerToStore[value]
          }
          count={countForStore(value)}
          checked={storeFacet.includes(value)}
          onToggle={() =>
            storeFacet.includes(value)
              ? setStoreFacet(storeFacet.filter((v) => v !== value))
              : setStoreFacet([...storeFacet, value])
          }
        />
      ))}
    </FilterFacetGroup>
  )
}
