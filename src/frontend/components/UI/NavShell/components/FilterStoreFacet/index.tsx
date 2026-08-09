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

export default function FilterStoreFacet() {
  const { t: tGamelib } = useTranslation('gamelib')
  const { connectedStores, storeFacet, setStoreFacet, countForStore } =
    useContext(LibraryContext)

  // A group with no rows is an empty section, and the panel does not ship
  // empty sections.
  if (connectedStores.length === 0) {
    return null
  }

  return (
    <FilterFacetGroup
      title={tGamelib('gamelib:library.filterPanel.storeGroup', 'Store')}
      className="FilterStoreFacet"
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
