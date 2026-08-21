/**
 * "More filters" group of the Games tier-2 filter panel (34.11-07 Task 3).
 *
 * A single collapsed group holding both tri-state filters (Hidden,
 * non-Available) and the three remaining boolean filters (D-06, D-07). No
 * row here carries a numeric badge -- that only exists for the Store and
 * Runnability facets (D-28).
 */
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
import type { FilterMode } from 'frontend/types'
import FilterFacetGroup, { FilterFacetRow } from '../FilterFacetGroup'
import {
  MORE_FILTER_KINDS,
  countDescriptorsOfKind
} from '../FilterFacetGroup/selectionCount'
import './index.scss'

export default function FilterMoreGroup() {
  const { t: tGamelib } = useTranslation('gamelib')
  const { t } = useTranslation()
  const {
    showHidden,
    setShowHidden,
    showNonAvailable,
    setShowNonAvailable,
    showSupportOfflineOnly,
    setShowSupportOfflineOnly,
    showThirdPartyManagedOnly,
    setShowThirdPartyManagedOnly,
    showUpdatesOnly,
    setShowUpdatesOnly,
    activeFilterDescriptors
  } = useContext(LibraryContext)

  // D3: the header badge's number comes from the DESCRIPTOR list, never
  // from a local boolean tally over the five state values destructured
  // above. That tally is the tempting implementation here -- it reads the
  // data this component already holds -- and it is precisely the second
  // implementation of "what counts as active" that can drift from the chip
  // row, which renders the same descriptor list. See selectionCount.ts.
  const selectedCount = countDescriptorsOfKind(
    activeFilterDescriptors,
    MORE_FILTER_KINDS
  )

  // Cycle ported verbatim from LibraryFilters/index.tsx:50-68:
  // Off -> Show (row click), Show -> Off, Only -> Show.
  const toggleShowHidden = () => {
    if (showHidden === 'off') setShowHidden('show')
    else if (showHidden === 'show') setShowHidden('off')
    else setShowHidden('show')
  }
  const setHiddenOnly = () => {
    if (showHidden === 'only') setShowHidden('off')
    else setShowHidden('only')
  }

  const toggleShowNonAvailable = () => {
    if (showNonAvailable === 'off') setShowNonAvailable('show')
    else if (showNonAvailable === 'show') setShowNonAvailable('off')
    else setShowNonAvailable('show')
  }
  const setNonAvailableOnly = () => {
    if (showNonAvailable === 'only') setShowNonAvailable('off')
    else setShowNonAvailable('only')
  }

  const triState = (
    value: FilterMode,
    label: string,
    onToggle: () => void,
    onOnly: () => void
  ) => (
    <div className="FilterMoreGroup__triState">
      <FilterFacetRow
        label={label}
        checked={value !== 'off'}
        onToggle={onToggle}
      />
      <button
        type="button"
        className="FilterMoreGroup__only"
        aria-pressed={value === 'only'}
        onClick={onOnly}
      >
        {t('header.only', 'only')}
      </button>
    </div>
  )

  return (
    <FilterFacetGroup
      title={tGamelib(
        'gamelib:library.filterPanel.moreFilters',
        'More filters'
      )}
      className="FilterMoreGroup"
      selectedCount={selectedCount}
      // Literal key AND literal default, repeated verbatim at all three
      // group call sites rather than factored into a helper: i18next-parser
      // only resolves STRING-LITERAL arguments, so a helper taking the key
      // as a variable extracts nothing and a non-literal default extracts an
      // EMPTY string that i18next then renders in preference to the
      // call-site fallback. Interpolated on `selected`; the name `count` is
      // reserved and triggers plural key resolution (`_one`/`_other`).
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
      {triState(
        showHidden,
        t('header.show_hidden', 'Show Hidden'),
        toggleShowHidden,
        setHiddenOnly
      )}
      {triState(
        showNonAvailable,
        t('header.show_available_games', 'Show non-Available games'),
        toggleShowNonAvailable,
        setNonAvailableOnly
      )}
      <FilterFacetRow
        label={t(
          'header.show_support_offline_only',
          'Show offline-supported only'
        )}
        checked={showSupportOfflineOnly}
        onToggle={() => setShowSupportOfflineOnly(!showSupportOfflineOnly)}
      />
      <FilterFacetRow
        label={t(
          'header.show_third_party_managed_only',
          'Show third-party managed only'
        )}
        checked={showThirdPartyManagedOnly}
        onToggle={() =>
          setShowThirdPartyManagedOnly(!showThirdPartyManagedOnly)
        }
      />
      <FilterFacetRow
        label={t('header.show_updates_only', 'Show games with updates only')}
        checked={showUpdatesOnly}
        onToggle={() => setShowUpdatesOnly(!showUpdatesOnly)}
      />
    </FilterFacetGroup>
  )
}
