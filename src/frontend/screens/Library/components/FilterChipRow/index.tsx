/**
 * The chip row above `GamesList` (34.11-08 Task 2) -- one removable pill
 * per `ActiveFilterDescriptor` plus a dashed `Clear all` chip. Lives in the
 * grid/content area, NOT the 204px tier-2 panel (D-08).
 *
 * Reads `activeFilterDescriptors` straight off `LibraryContext` -- plan 04
 * computes the active-filter list exactly once, per render, and publishes
 * the result. This component must never re-derive "which filters are
 * active"; that rule lives in `filterEngine.ts` alone (D-26).
 */
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import LibraryContext from '../../LibraryContext'
import type {
  ActiveFilterDescriptor,
  RunnabilityTier,
  StoreFacetValue
} from 'frontend/types'
import { chipLabelSpec, resolveLabel } from './chipLabels'
import './index.scss'

export default function FilterChipRow() {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const {
    activeFilterDescriptors,
    activeFilterCount,
    clearAllFilters,
    storeFacet,
    setStoreFacet,
    runnabilityFacet,
    setRunnabilityFacet,
    setLibraryView,
    setCurrentCollection,
    handleSearch,
    setShowHidden,
    setShowNonAvailable,
    setNoStorePage,
    setShowSupportOfflineOnly,
    setShowThirdPartyManagedOnly,
    setShowUpdatesOnly,
    __isDefaultLibraryContext: isDefaultLibraryContext
  } = useContext(LibraryContext)

  // Guard the default context FIRST -- `initialContext` supplies silent
  // no-op setters and an empty descriptor list, so a FilterChipRow rendered
  // outside LibraryContext.Provider is otherwise byte-for-byte identical to
  // one correctly mounted over an unfiltered library. That ambiguity is the
  // 34.10 defect (a relocated <Header> whose filters looked alive and
  // weren't) -- the console line below is the discriminator.
  if (isDefaultLibraryContext) {
    console.error(
      'FilterChipRow rendered outside LibraryContext.Provider -- its chips would be inert. Mount it only inside the provider.'
    )
    return null
  }

  // Only after the sentinel guard: no chips active, no empty row.
  if (activeFilterCount === 0) {
    return null
  }

  const removeFilter = (descriptor: ActiveFilterDescriptor) => {
    switch (descriptor.kind) {
      case 'view':
        setLibraryView('all')
        break
      case 'collection':
        setCurrentCollection(null)
        break
      case 'store':
        setStoreFacet(
          storeFacet.filter(
            (value) => value !== (descriptor.value as StoreFacetValue)
          )
        )
        break
      case 'runnability':
        setRunnabilityFacet(
          runnabilityFacet.filter(
            (value) => value !== (descriptor.value as RunnabilityTier)
          )
        )
        break
      case 'search':
        handleSearch('')
        break
      case 'showHidden':
        // D-27: a tri-state chip's x always returns the filter to 'off',
        // never steps the cycle -- stepping it here would defeat the whole
        // point of a chip that says "remove this constraint".
        setShowHidden('off')
        break
      case 'showNonAvailable':
        setShowNonAvailable('off')
        break
      case 'noStorePage':
        setNoStorePage('off')
        break
      case 'showSupportOfflineOnly':
        setShowSupportOfflineOnly(false)
        break
      case 'showThirdPartyManagedOnly':
        setShowThirdPartyManagedOnly(false)
        break
      case 'showUpdatesOnly':
        setShowUpdatesOnly(false)
        break
    }
  }

  return (
    <div className="FilterChipRow">
      {activeFilterDescriptors.map((descriptor) => {
        const spec = chipLabelSpec(descriptor)
        if (spec === null) {
          return null
        }
        const label = resolveLabel(spec, t, tGamelib)
        return (
          <span className="FilterChipRow__chip" key={descriptor.id}>
            {label}
            <button
              type="button"
              className="FilterChipRow__remove"
              aria-label={tGamelib(
                'gamelib:library.filterPanel.removeFilter',
                'Remove {{filterLabel}} filter',
                { filterLabel: label }
              )}
              onClick={() => removeFilter(descriptor)}
            >
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </span>
        )
      })}
      <button
        type="button"
        className="FilterChipRow__chip FilterChipRow__clearAll"
        onClick={clearAllFilters}
      >
        {tGamelib('gamelib:library.filterPanel.clearAll', 'Clear all')}
      </button>
    </div>
  )
}
