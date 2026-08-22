import React from 'react'

import { GameInfo } from 'common/types'
import { LibraryContextType } from 'frontend/types'

const initialContext: LibraryContextType = {
  storesFilters: {
    legendary: true,
    gog: true,
    nile: true,
    sideload: true,
    zoom: true,
    steam: true
  },
  platformsFilters: { win: true, linux: true, mac: true, browser: true },
  crossoverRatingFilters: {
    gold: true,
    silver: true,
    bronze: true,
    wontRun: true,
    unrated: true
  },
  filterText: '',
  setStoresFilters: () => null,
  handleLayout: () => null,
  setPlatformsFilters: () => null,
  setCrossoverRatingFilters: () => null,
  handleSearch: () => null,
  layout: 'grid',
  showHidden: 'off',
  setShowHidden: () => null,
  showFavourites: false,
  setShowFavourites: () => null,
  showNonAvailable: 'off',
  setShowNonAvailable: () => null,
  noStorePage: 'off',
  setNoStorePage: () => null,
  showInstalledOnly: false,
  setShowInstalledOnly: () => null,
  sortDescending: true,
  setSortDescending: () => null,
  sortInstalled: true,
  setSortInstalled: () => null,
  showSupportOfflineOnly: false,
  setShowSupportOfflineOnly: () => null,
  showThirdPartyManagedOnly: false,
  setShowThirdPartyManagedOnly: () => null,
  showUpdatesOnly: false,
  setShowUpdatesOnly: () => null,
  handleAddGameButtonClick: () => null,
  setShowCategories: () => null,
  showAlphabetFilter: false,
  onToggleAlphabetFilter: () => null,
  alphabetFilterLetter: null,
  setAlphabetFilterLetter: () => null,
  gamesForAlphabetFilter: [] as GameInfo[],

  // 34.11 Plan 04: opt-in facet surface defaults. See the field comments on
  // `LibraryContextType` (frontend/types.ts) for what each one is for.
  libraryView: 'all',
  setLibraryView: () => null,
  storeFacet: [],
  setStoreFacet: () => null,
  runnabilityFacet: [],
  setRunnabilityFacet: () => null,
  currentCollection: null,
  setCurrentCollection: () => null,
  clearAllFilters: () => null,
  activeFilterDescriptors: [],
  activeFilterCount: 0,
  runnabilityRows: [],
  connectedStores: [],
  countForStore: () => 0,
  countForRunnability: () => 0,
  // The sentinel: only `initialContext` sets this. The real provider value
  // in `Library/index.tsx` must never set it -- its absence there is the
  // whole signal that a consumer is mounted inside the provider.
  __isDefaultLibraryContext: true
}

export default React.createContext(initialContext)
