import './index.css'

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect
} from 'react'

import { createPortal } from 'react-dom'

import ArrowDropUp from '@mui/icons-material/ArrowDropUp'
import { Header, UpdateComponent } from 'frontend/components/UI'
import { useTranslation } from 'react-i18next'
import Fuse from 'fuse.js'

import ContextProvider from 'frontend/state/ContextProvider'

import GamesList from './components/GamesList'
import { FavouriteGame, GameInfo, HiddenGame, Runner } from 'common/types'
import ErrorComponent from 'frontend/components/UI/ErrorComponent'
import LibraryHeader from './components/LibraryHeader'
import {
  amazonCategories,
  epicCategories,
  gogCategories,
  sideloadedCategories,
  steamCategories,
  zoomCategories,
  normalizeTitle
} from 'frontend/helpers/library'
import RecentlyPlayed from './components/RecentlyPlayed'
import LibraryContext from './LibraryContext'
import {
  Category,
  CrossoverRatingFilters,
  FilterEngineDeps,
  FilterEngineState,
  FilterMode,
  LibraryView,
  PlatformsFilters,
  RunnabilityTier,
  StoreFacetValue,
  StoresFilters
} from 'frontend/types'
import useGlobalState from 'frontend/state/GlobalStateV2'
import { hasHelp } from 'frontend/hooks/hasHelp'
import EmptyLibraryMessage from './components/EmptyLibrary'
import CategoriesManager from './components/CategoriesManager'
import LibraryTour from './components/LibraryTour'
import AlphabetFilter from './components/AlphabetFilter'
import { openInstallGameModal } from 'frontend/state/InstallGameModal'
import { Tier2PortalContext } from 'frontend/components/UI/NavShell/Tier2PortalContext'
import { configStore } from 'frontend/helpers/electronStores'
// Namespace import: filterEngine's helpers are referenced as
// `filterEngine.xxx` throughout this file rather than named imports, so a
// call site is this identifier's only appearance in the file (see the
// acceptance criteria on 34.11-04-PLAN.md Tasks 2/3 -- each migration
// helper and describeActiveFilters must be called exactly once, provably,
// with no separate import-line match to conflate with a real call).
import * as filterEngine from './filterEngine'

const storage = window.localStorage

const VALID_LIBRARY_VIEWS: LibraryView[] = [
  'all',
  'installed',
  'recentlyPlayed',
  'favourites'
]

type SearchableGame = {
  original: GameInfo
  title: string
  normalizedTitle: string
}

export default React.memo(function Library(): JSX.Element {
  const { t } = useTranslation()
  const { target: tier2PortalTarget, setFilled: setTier2PortalFilled } =
    useContext(Tier2PortalContext)

  const {
    libraryStatus,
    refreshing,
    refreshingInTheBackground,
    epic,
    gog,
    amazon,
    zoom,
    steam,
    sideloadedLibrary,
    favouriteGames,
    libraryTopSection,
    platform,
    currentCustomCategories,
    customCategories,
    hiddenGames,
    gameUpdates
  } = useContext(ContextProvider)

  hasHelp(
    'library',
    t('help.title.library', 'Library'),
    <p>{t('help.content.library', 'Shows all owned games.')}</p>
  )

  const [layout, setLayout] = useState(storage.getItem('layout') || 'grid')
  const handleLayout = (layout: string) => {
    storage.setItem('layout', layout)
    setLayout(layout)
  }

  let initialStoresfilters
  const storesFiltersString = storage.getItem('storesFilters')
  if (storesFiltersString) {
    // If we have something stored, use that
    initialStoresfilters = JSON.parse(storesFiltersString) as StoresFilters
  } else {
    // Else, use the old `category` filter
    // TODO: we can remove this eventually after a few releases and just use the code of the if
    const storedCategory = (storage.getItem('category') as Category) || 'all'
    initialStoresfilters = {
      legendary: epicCategories.includes(storedCategory),
      gog: gogCategories.includes(storedCategory),
      nile: amazonCategories.includes(storedCategory),
      sideload: sideloadedCategories.includes(storedCategory),
      zoom: zoom.enabled && zoomCategories.includes(storedCategory),
      steam: steamCategories.includes(storedCategory)
    }
  }

  const [storesFilters, setStoresFilters_] =
    useState<StoresFilters>(initialStoresfilters)

  const setStoresFilters = (newFilters: StoresFilters) => {
    storage.setItem('storesFilters', JSON.stringify(newFilters))
    setStoresFilters_(newFilters)
  }

  let initialPlatformsfilters
  const plaformsFiltersString = storage.getItem('platformsFilters')
  if (plaformsFiltersString) {
    // If we have something stored, use that
    initialPlatformsfilters = JSON.parse(
      plaformsFiltersString
    ) as PlatformsFilters
  } else {
    // Else, use the old `category` filter
    // TODO: we can remove this eventually after a few releases and just use the code of the if
    const storedCategory = storage.getItem('filterPlatform') || 'all'
    initialPlatformsfilters = {
      win: ['all', 'win'].includes(storedCategory),
      linux: ['all', 'linux'].includes(storedCategory),
      mac: ['all', 'mac'].includes(storedCategory),
      browser: ['all', 'browser'].includes(storedCategory)
    }
  }

  const [platformsFilters, setPlatformsFilters_] = useState<PlatformsFilters>(
    initialPlatformsfilters
  )

  const setPlatformsFilters = (newFilters: PlatformsFilters) => {
    storage.setItem('platformsFilters', JSON.stringify(newFilters))
    setPlatformsFilters_(newFilters)
  }

  // D-17: macOS-only CrossOver-rating filter, same persisted-object shape as
  // platformsFilters (default all true — opt-out, not tri-state).
  let initialCrossoverRatingFilters: CrossoverRatingFilters
  const crossoverRatingFiltersString = storage.getItem(
    'crossoverRatingFilters'
  )
  if (crossoverRatingFiltersString) {
    initialCrossoverRatingFilters = JSON.parse(
      crossoverRatingFiltersString
    ) as CrossoverRatingFilters
  } else {
    initialCrossoverRatingFilters = {
      gold: true,
      silver: true,
      bronze: true,
      wontRun: true,
      unrated: true
    }
  }

  const [crossoverRatingFilters, setCrossoverRatingFilters_] =
    useState<CrossoverRatingFilters>(initialCrossoverRatingFilters)

  const setCrossoverRatingFilters = (newFilters: CrossoverRatingFilters) => {
    storage.setItem('crossoverRatingFilters', JSON.stringify(newFilters))
    setCrossoverRatingFilters_(newFilters)
  }

  // --- 34.11 Plan 04: opt-in facet state, additive alongside the legacy
  // storesFilters/platformsFilters/crossoverRatingFilters state above. ---

  // D-05: single-select view. A format guard in the shape of
  // migrateFilterMode below -- an unrecognised or absent value falls back
  // to 'all' rather than throwing.
  const initialLibraryView = (): LibraryView => {
    const stored = storage.getItem('libraryView')
    return (VALID_LIBRARY_VIEWS as string[]).includes(stored || '')
      ? (stored as LibraryView)
      : 'all'
  }
  const [libraryView, setLibraryView_] = useState<LibraryView>(
    initialLibraryView
  )
  const setLibraryViewPersisted = (value: LibraryView) => {
    storage.setItem('libraryView', value)
    setLibraryView_(value)
  }

  // D-01: opt-in store facet, migrated from the legacy opt-out
  // storesFilters shape via filterEngine's D-02 migration helper (discards,
  // never translates).
  const [storeFacet, setStoreFacet_] = useState<StoreFacetValue[]>(() =>
    filterEngine.migrateStoreFacetSelection(
      storage.getItem('storeFacet'),
      storage.getItem('storesFilters')
    )
  )
  const setStoreFacetPersisted = (value: StoreFacetValue[]) => {
    storage.setItem('storeFacet', JSON.stringify(value))
    setStoreFacet_(value)
  }

  // D-01: opt-in runnability facet, migrated from the legacy
  // platformsFilters shape.
  const [runnabilityFacet, setRunnabilityFacet_] = useState<
    RunnabilityTier[]
  >(() =>
    filterEngine.migrateRunnabilityFacetSelection(
      storage.getItem('runnabilityFacet'),
      storage.getItem('platformsFilters')
    )
  )
  const setRunnabilityFacetPersisted = (value: RunnabilityTier[]) => {
    storage.setItem('runnabilityFacet', JSON.stringify(value))
    setRunnabilityFacet_(value)
  }

  // D-21: single-select collection -- a customCategories key, the literal
  // 'preset_uncategorized', or null for no constraint. An empty string or
  // absent key both yield null.
  const [currentCollection, setCurrentCollection_] = useState<string | null>(
    () => storage.getItem('libraryCollection') || null
  )
  const setCurrentCollectionPersisted = (value: string | null) => {
    storage.setItem('libraryCollection', value ?? '')
    setCurrentCollection_(value)
  }

  // RESEARCH assumption A1, resolved in favour of active removal (D-02):
  // the legacy opt-out filter keys are discarded once, guarded by this
  // sentinel so the effect never races LibraryFilters (still mounted and
  // still writing these keys until plan 09 retires it), and never re-runs
  // (D-02 requires a one-time reset, a claim a re-running effect cannot
  // make). This whole effect plus its sentinel is deletable once plan 09
  // lands.
  useEffect(() => {
    if (storage.getItem('facetOptInMigrated') === '1') {
      return
    }
    storage.removeItem('storesFilters')
    storage.removeItem('platformsFilters')
    storage.removeItem('crossoverRatingFilters')
    storage.setItem('facetOptInMigrated', '1')
  }, [])

  // Recent-games source mirrors RecentlyPlayed/index.tsx's own read.
  const recentAppNames = useMemo(
    () => configStore.get('games.recent', []).map((entry) => entry.appName),
    []
  )

  // D-04: the store facet values whose account is connected, reusing the
  // same gating expressions makeLibrary() already uses below -- the Store
  // group renders a row only for a connected account, never a permanent 0.
  const connectedStores: StoreFacetValue[] = useMemo(() => {
    const stores: StoreFacetValue[] = ['sideload']
    if (gog.username) stores.push('gog')
    if (epic.username) stores.push('legendary')
    if (amazon.username) stores.push('nile')
    if (zoom.enabled && zoom.username) stores.push('zoom')
    if (steam?.username) stores.push('steam')
    return stores
  }, [gog.username, epic.username, amazon.username, zoom.enabled, zoom.username, steam?.username])

  // The Runnability rows this host can compute (plan 01). Empty on Windows.
  const runnabilityRows = useMemo(
    () => filterEngine.runnabilityRowsForHost(platform),
    [platform]
  )

  // 19-06 slice: app_name -> rating|null; absent = never looked up (D-16).
  const { crossoverRatings } = useGlobalState.keys('crossoverRatings')

  const [filterText, setFilterText] = useState('')

  // Migration helper: maps legacy 'true'/'false'/null to FilterMode
  const migrateFilterMode = (key: string, defaultValue: FilterMode): FilterMode => {
    const stored = storage.getItem(key)
    if (stored === 'show' || stored === 'only' || stored === 'off') return stored
    return defaultValue  // handles 'true', 'false', null, undefined
  }

  const [showHidden, setShowHidden] = useState<FilterMode>(
    migrateFilterMode('show_hidden', 'off')
  )
  const handleShowHidden = (value: FilterMode) => {
    storage.setItem('show_hidden', value)
    setShowHidden(value)
  }

  const [showFavouritesLibrary, setShowFavourites] = useState(
    JSON.parse(storage.getItem('show_favorites') || 'false')
  )
  const handleShowFavourites = (value: boolean) => {
    storage.setItem('show_favorites', JSON.stringify(value))
    setShowFavourites(value)
  }

  const [showInstalledOnly, setShowInstalledOnly] = useState(
    JSON.parse(storage.getItem('show_installed_only') || 'false')
  )
  const handleShowInstalledOnly = (value: boolean) => {
    storage.setItem('show_installed_only', JSON.stringify(value))
    setShowInstalledOnly(value)
  }

  const [showNonAvailable, setShowNonAvailable] = useState<FilterMode>(
    migrateFilterMode('show_non_available', 'off')
  )
  const handleShowNonAvailable = (value: FilterMode) => {
    storage.setItem('show_non_available', value)
    setShowNonAvailable(value)
  }

  const [showSupportOfflineOnly, setSupportOfflineOnly] = useState(
    JSON.parse(storage.getItem('show_support_offline_only') || 'false')
  )
  const handleShowSupportOfflineOnly = (value: boolean) => {
    storage.setItem('show_support_offline_only', JSON.stringify(value))
    setSupportOfflineOnly(value)
  }

  const [showThirdPartyManagedOnly, setShowThirdPartyManagedOnly] = useState(
    JSON.parse(storage.getItem('show_third_party_managed_only') || 'false')
  )
  const handleShowThirdPartyOnly = (value: boolean) => {
    storage.setItem('show_third_party_managed_only', JSON.stringify(value))
    setShowThirdPartyManagedOnly(value)
  }

  const [showUpdatesOnly, setShowUpdatesOnly] = useState(
    JSON.parse(storage.getItem('show_updates_only') || 'false')
  )
  const handleShowUpdatesOnly = (value: boolean) => {
    storage.setItem('show_updates_only', JSON.stringify(value))
    setShowUpdatesOnly(value)
  }

  const [showCategories, setShowCategories] = useState(false)

  const [showAlphabetFilter, setShowAlphabetFilter] = useState(
    JSON.parse(storage.getItem('showAlphabetFilter') || 'true')
  )
  const handleToggleAlphabetFilter = () => {
    const newValue = !showAlphabetFilter
    storage.setItem('showAlphabetFilter', JSON.stringify(newValue))
    setShowAlphabetFilter(newValue)
  }
  const [alphabetFilterLetter, setAlphabetFilterLetter] = useState<
    string | null
  >(null)

  const [sortDescending, setSortDescending] = useState(
    JSON.parse(storage?.getItem('sortDescending') || 'false')
  )
  function handleSortDescending(value: boolean) {
    storage.setItem('sortDescending', JSON.stringify(value))
    setSortDescending(value)
  }

  const [sortInstalled, setSortInstalled] = useState(
    JSON.parse(storage?.getItem('sortInstalled') || 'true')
  )
  function handleSortInstalled(value: boolean) {
    storage.setItem('sortInstalled', JSON.stringify(value))
    setSortInstalled(value)
  }

  const backToTopElement = useRef(null)

  //Remember scroll position
  useLayoutEffect(() => {
    // F-34.10-06 (34.10-18 Task 2): `.App .content` is now the scroll
    // container (App.css), not `document.body` -- `.App` is fixed at
    // `height: 100vh; overflow: hidden` so body no longer scrolls. Resolved
    // HERE, inside the effect body, not at module scope: `main.content`
    // does not exist until App has mounted. The `?? document.body` fallback
    // is kept for console mode and any future shell that does not render
    // the nav shell (no `main.content` in the DOM at all), and the SAME
    // resolved element is used for both attach and detach below so cleanup
    // can never detach from a different element than it attached to.
    const scrollContainer =
      document.querySelector<HTMLElement>('main.content') ?? document.body

    const scrollPosition = parseInt(storage?.getItem('scrollPosition') || '0')

    const storeScrollPosition = () => {
      storage?.setItem(
        'scrollPosition',
        scrollContainer.scrollTop.toString() || '0'
      )
    }

    scrollContainer.addEventListener('scroll', storeScrollPosition)
    scrollContainer.scrollTo(0, scrollPosition || 0)

    return () => {
      scrollContainer.removeEventListener('scroll', storeScrollPosition)
    }
  }, [])

  // bind back to top button
  useEffect(() => {
    // Same resolution as the effect above -- see its comment for why this
    // must be resolved inside the effect body, not at module scope, and why
    // the `?? document.body` fallback is kept.
    const scrollContainer =
      document.querySelector<HTMLElement>('main.content') ?? document.body

    const btn = document.getElementById('backToTopBtn')
    const topSpan = document.getElementById('top')

    const scrollCallback = () => {
      if (btn && topSpan) {
        btn.style.visibility =
          scrollContainer.scrollTop > 450 ? 'visible' : 'hidden'
      }
    }

    scrollContainer.addEventListener('scroll', scrollCallback)
    return () => scrollContainer.removeEventListener('scroll', scrollCallback)
  }, [])

  const backToTop = () => {
    const anchor = document.getElementById('top')
    if (anchor) {
      // Untouched by 34.10-18: `scrollIntoView` walks up to whatever scroll
      // container actually exists in the DOM (now `.App .content`), so it
      // needs no change for the F-34.10-06 relocation.
      anchor.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function handleModal(
    appName: string,
    runner: Runner,
    gameInfo: GameInfo | null
  ) {
    openInstallGameModal({ appName, runner, gameInfo })
  }

  // cache list of games being installed
  const installing = useMemo(
    () =>
      libraryStatus
        .filter((st) => st.status === 'installing')
        .map((st) => st.appName),
    [libraryStatus]
  )

  const filterByPlatform = (library: GameInfo[]) => {
    if (!library) {
      return []
    }

    // check which platforms are turned on if valid for current platform
    let displayedPlatforms: string[] = []
    if (platformsFilters['win']) {
      displayedPlatforms.push('win')
    }
    if (platformsFilters['mac'] && platform === 'darwin') {
      displayedPlatforms.push('mac')
    }
    if (platformsFilters['linux'] && platform === 'linux') {
      displayedPlatforms.push('linux')
    }
    if (platformsFilters['browser']) {
      displayedPlatforms.push('browser')
    }

    // if all are turned off, display all instead
    if (!displayedPlatforms.length) {
      displayedPlatforms = Object.keys(platformsFilters)
    }

    // add platform variants to check with game info
    if (displayedPlatforms.includes('win')) {
      displayedPlatforms.push('windows')
    }
    if (displayedPlatforms.includes('mac')) {
      displayedPlatforms.push('osx', 'Mac')
    }

    return library.filter((game) => {
      let gamePlatforms: string[] = []

      if (game?.is_installed) {
        gamePlatforms = [game?.install?.platform?.toLowerCase() || 'windows']
      } else {
        if (game.is_linux_native && platform === 'linux') {
          gamePlatforms.push('linux')
        }
        if (game.is_mac_native && platform === 'darwin') {
          gamePlatforms.push('mac')
        }
        gamePlatforms.push('windows')
      }
      return gamePlatforms.some((plat) => displayedPlatforms.includes(plat))
    })
  }

  // top section
  const showRecentGames = libraryTopSection.startsWith('recently_played')

  const favouriteGamesList = useMemo(() => {
    if (showHidden !== 'off') {
      return favouriteGames.list
    }

    const hiddenAppNames = hiddenGames.list.map(
      (hidden: HiddenGame) => hidden.appName
    )

    return favouriteGames.list.filter(
      (game) => !hiddenAppNames.includes(game.appName)
    )
  }, [favouriteGames, showHidden, hiddenGames])

  const showFavourites =
    libraryTopSection === 'favourites' && !!favouriteGamesList.length

  const favourites = useMemo(() => {
    const tempArray: GameInfo[] = []
    if (showFavourites || showFavouritesLibrary) {
      const favouriteAppNames = favouriteGamesList.map(
        (favourite: FavouriteGame) => favourite.appName
      )
      epic.library.forEach((game) => {
        if (favouriteAppNames.includes(game.app_name)) tempArray.push(game)
      })
      gog.library.forEach((game) => {
        if (favouriteAppNames.includes(game.app_name)) tempArray.push(game)
      })
      sideloadedLibrary.forEach((game) => {
        if (favouriteAppNames.includes(game.app_name)) tempArray.push(game)
      })
      amazon.library.forEach((game) => {
        if (favouriteAppNames.includes(game.app_name)) tempArray.push(game)
      })
      zoom.library.forEach((game) => {
        if (favouriteAppNames.includes(game.app_name)) tempArray.push(game)
      })
      steam?.library?.forEach((game) => {
        if (favouriteAppNames.includes(game.app_name)) tempArray.push(game)
      })
    }
    return tempArray.sort((a, b) => {
      const gameA = a.title.toUpperCase().replace('THE ', '')
      const gameB = b.title.toUpperCase().replace('THE ', '')
      return gameA.localeCompare(gameB)
    })
  }, [
    showFavourites,
    showFavouritesLibrary,
    favouriteGamesList,
    epic,
    gog,
    amazon,
    sideloadedLibrary,
    zoom,
    steam
  ])

  const favouritesIds = useMemo(() => {
    return favourites.map((game) => `${game.app_name}_${game.runner}`)
  }, [favourites])

  const makeLibrary = () => {
    let displayedStores: string[] = []
    if (storesFilters['gog'] && gog.username) {
      displayedStores.push('gog')
    }
    if (storesFilters['legendary'] && epic.username) {
      displayedStores.push('legendary')
    }
    if (storesFilters['nile'] && amazon.username) {
      displayedStores.push('nile')
    }
    if (storesFilters['sideload']) {
      displayedStores.push('sideload')
    }
    if (storesFilters['zoom'] && zoom.username) {
      displayedStores.push('zoom')
    }
    if (storesFilters['steam'] && steam?.username) {
      displayedStores.push('steam')
    }

    if (!displayedStores.length) {
      displayedStores = Object.keys(storesFilters)
    }

    const showEpic = epic.username && displayedStores.includes('legendary')
    const showGog = gog.username && displayedStores.includes('gog')
    const showAmazon = amazon.user_id && displayedStores.includes('nile')
    const showSideloaded = displayedStores.includes('sideload')
    const showZoom = zoom.username && displayedStores.includes('zoom')
    const showSteam = steam?.username && displayedStores.includes('steam')

    const epicLibrary = showEpic ? epic.library : []
    const gogLibrary = showGog ? gog.library : []
    const sideloadedApps = showSideloaded ? sideloadedLibrary : []
    const amazonLibrary = showAmazon ? amazon.library : []
    const zoomLibrary = showZoom ? zoom.library : []
    const steamLibrary = showSteam ? steam.library : []

    return [
      ...sideloadedApps,
      ...epicLibrary,
      ...gogLibrary,
      ...amazonLibrary,
      ...zoomLibrary,
      ...steamLibrary
    ]
  }

  const gamesForAlphabetFilter = useMemo(() => {
    let library: Array<GameInfo> = makeLibrary()

    if (showFavouritesLibrary) {
      library = library.filter((game) =>
        favouritesIds.includes(`${game.app_name}_${game.runner}`)
      )
    } else {
      library = library.filter((game) => !game.install.is_dlc)

      if (currentCustomCategories && currentCustomCategories.length > 0) {
        const gamesInSelectedCategories = new Set<string>()

        // loop through selected categories and add all games in all those categories
        currentCustomCategories.forEach((category) => {
          if (category === 'preset_uncategorized') {
            // in the case of the special "uncategorized" category, we read all
            // the categorized games and add the others to the list to show
            const categorizedGames = Array.from(
              new Set(Object.values(customCategories.list).flat())
            )

            library.forEach((game) => {
              if (
                !categorizedGames.includes(`${game.app_name}_${game.runner}`)
              ) {
                gamesInSelectedCategories.add(`${game.app_name}_${game.runner}`)
              }
            })
          } else {
            const gamesInCustomCategory = customCategories.list[category]

            if (gamesInCustomCategory) {
              gamesInCustomCategory.forEach((game) => {
                gamesInSelectedCategories.add(game)
              })
            }
          }
        })

        library = library.filter((game) =>
          gamesInSelectedCategories.has(`${game.app_name}_${game.runner}`)
        )
      }

      if (showSupportOfflineOnly) {
        library = library.filter((game) => game.canRunOffline)
      }

      if (showThirdPartyManagedOnly) {
        library = library.filter((game) => !!game.thirdPartyManagedApp)
      }

      if (showUpdatesOnly) {
        library = library.filter((game) => gameUpdates.includes(game.app_name))
      }

      if (showInstalledOnly) {
        library = library.filter((game) => game.is_installed)
      }
    }

    // filter
    try {
      const filteredLibrary = filterByPlatform(library)
      const searchableLibrary: SearchableGame[] = filteredLibrary.map(
        (game) => {
          const title = game.overrides?.title || game.title
          return {
            original: game,
            title,
            normalizedTitle: normalizeTitle(title)
          }
        }
      )

      const options = {
        minMatchCharLength: 1,
        threshold: 0.4,
        useExtendedSearch: true,
        keys: ['title', 'normalizedTitle']
      }
      const fuse = new Fuse(searchableLibrary, options)

      if (filterText) {
        const fuzzySearch = fuse
          .search(filterText)
          .map((result) => result.item.original)
        library = fuzzySearch
      } else {
        library = filteredLibrary
      }
    } catch (error) {
      console.log(error)
    }

    // hide hidden
    const hiddenGamesAppNames = hiddenGames.list.map(
      (hidden: HiddenGame) => hidden?.appName
    )

    // Helper: non-available means in nonAvailableGames localStorage OR is a delisted Steam game
    const isNonAvailable = (game: GameInfo): boolean => {
      const nonAvailableGames = storage.getItem('nonAvailableGames') || '[]'
      const nonAvailableGamesArray: string[] = JSON.parse(nonAvailableGames)
      return (
        nonAvailableGamesArray.includes(game.app_name) ||
        (game.runner === 'steam' && !!game.is_delisted)
      )
    }

    const isHidden = (game: GameInfo): boolean =>
      hiddenGamesAppNames.includes(game.app_name)

    // Tri-state filter logic (D-08/D-09)
    if (showHidden === 'only' && showNonAvailable === 'only') {
      // D-09: both 'only' → union
      library = library.filter((game) => isNonAvailable(game) || isHidden(game))
    } else if (showHidden === 'only') {
      library = library.filter(isHidden)
    } else if (showNonAvailable === 'only') {
      library = library.filter(isNonAvailable)
    } else {
      if (showNonAvailable === 'off') {
        library = library.filter((game) => !isNonAvailable(game))
      }
      if (showHidden === 'off') {
        library = library.filter((game) => !isHidden(game))
      }
    }

    // D-17: macOS-only CrossOver-rating filter. A game absent from the
    // crossoverRatings slice was never looked up (non-macOS, or D-02 gate
    // closed) — that is "no signal", not "unrated", and must never be
    // filtered out here.
    if (platform === 'darwin') {
      const crossoverRatingTier = (
        rating: number | null
      ): keyof CrossoverRatingFilters => {
        if (rating === null) return 'unrated'
        if (rating >= 5) return 'gold'
        if (rating === 4) return 'silver'
        if (rating === 3) return 'bronze'
        return 'wontRun'
      }

      library = library.filter((game) => {
        const rating = crossoverRatings[game.app_name]
        if (rating === undefined) return true
        return crossoverRatingFilters[crossoverRatingTier(rating)]
      })
    }

    return library
  }, [
    storesFilters,
    platformsFilters,
    crossoverRatingFilters,
    crossoverRatings,
    epic.library,
    gog.library,
    amazon.library,
    zoom.library,
    steam?.library,
    sideloadedLibrary,
    platform,
    filterText,
    showHidden,
    hiddenGames,
    showFavouritesLibrary,
    favouritesIds,
    currentCustomCategories,
    customCategories,
    showInstalledOnly,
    showNonAvailable,
    showSupportOfflineOnly,
    showThirdPartyManagedOnly,
    showUpdatesOnly,
    gameUpdates
  ])

  // select library
  const libraryToShow = useMemo(() => {
    let library = [...gamesForAlphabetFilter]

    // Alphabetical filter
    if (alphabetFilterLetter) {
      library = library.filter((game) => {
        const title = game.overrides?.title || game.title
        if (!title) return false

        const processedTitle = title.replace(/^the\s/i, '')
        const firstCharMatch = processedTitle.match(/[a-zA-Z0-9]/)
        if (!firstCharMatch) return false
        const firstChar = firstCharMatch[0].toUpperCase()

        if (alphabetFilterLetter === '#') {
          return /[0-9]/.test(firstChar)
        } else {
          return firstChar === alphabetFilterLetter
        }
      })
    }

    // sort
    library = library.sort((a, b) => {
      const gameA = a.title.toUpperCase().replace('THE ', '')
      const gameB = b.title.toUpperCase().replace('THE ', '')
      return sortDescending
        ? -gameA.localeCompare(gameB)
        : gameA.localeCompare(gameB)
    })
    const installed = library.filter((game) => game?.is_installed)
    const notInstalled = library.filter(
      (game) => !game?.is_installed && !installing.includes(game?.app_name)
    )
    const installingGames = library.filter(
      (g) => !g.is_installed && installing.includes(g.app_name)
    )

    library = sortInstalled
      ? [...installed, ...installingGames, ...notInstalled]
      : library

    return [...library]
  }, [
    gamesForAlphabetFilter,
    alphabetFilterLetter,
    sortDescending,
    sortInstalled,
    installing
  ])

  // Reports to the shell that the Games tier-2 column has content, so it can
  // collapse an empty column on routes where Library isn't mounted (REQ-34.10-09).
  useEffect(() => {
    setTier2PortalFilled(true)
    return () => {
      setTier2PortalFilled(false)
    }
  }, [setTier2PortalFilled])

  if (!epic && !gog && !amazon && !zoom) {
    return (
      <ErrorComponent
        message={t(
          'generic.error.component',
          'No Games found - Try to logout and login again or one of the options bellow'
        )}
      />
    )
  }

  return (
    <LibraryContext.Provider
      value={{
        storesFilters,
        platformsFilters,
        crossoverRatingFilters,
        layout,
        showHidden,
        showFavourites: showFavouritesLibrary,
        showInstalledOnly,
        showNonAvailable,
        filterText,
        setStoresFilters,
        handleLayout: handleLayout,
        setPlatformsFilters,
        setCrossoverRatingFilters,
        handleSearch: setFilterText,
        setShowHidden: handleShowHidden,
        setShowFavourites: handleShowFavourites,
        setShowInstalledOnly: handleShowInstalledOnly,
        setShowNonAvailable: handleShowNonAvailable,
        setSortDescending: handleSortDescending,
        setSortInstalled: handleSortInstalled,
        showSupportOfflineOnly,
        setShowSupportOfflineOnly: handleShowSupportOfflineOnly,
        showThirdPartyManagedOnly,
        setShowThirdPartyManagedOnly: handleShowThirdPartyOnly,
        showUpdatesOnly,
        setShowUpdatesOnly: handleShowUpdatesOnly,
        sortDescending,
        sortInstalled,
        handleAddGameButtonClick: () => handleModal('', 'sideload', null),
        setShowCategories,
        showAlphabetFilter: showAlphabetFilter,
        onToggleAlphabetFilter: handleToggleAlphabetFilter,
        gamesForAlphabetFilter,
        alphabetFilterLetter,
        setAlphabetFilterLetter
      }}
    >
      {tier2PortalTarget
        ? createPortal(<Header />, tier2PortalTarget)
        : null}
      <LibraryTour />

      <div className="listing">
        <span id="top" />
        {showRecentGames && (
          <RecentlyPlayed
            handleModal={handleModal}
            onlyInstalled={libraryTopSection.endsWith('installed')}
            showHidden={showHidden}
          />
        )}

        {showFavourites && !showFavouritesLibrary && (
          <>
            <div className="library-section-header" data-tour="library-header">
              <h3 className="libraryHeader">{t('favourites', 'Favourites')}</h3>
            </div>
            <GamesList
              library={favourites}
              handleGameCardClick={handleModal}
              isFavourite
              isFirstLane
            />
          </>
        )}

        <LibraryHeader list={libraryToShow} />

        {showAlphabetFilter && <AlphabetFilter />}

        {refreshing && !refreshingInTheBackground && <UpdateComponent />}

        {steam?.username &&
          steam?.library?.length === 0 &&
          refreshingInTheBackground && (
            <UpdateComponent
              message={t('steam.syncing', 'Syncing your Steam library…')}
            />
          )}

        {libraryToShow.length === 0 && <EmptyLibraryMessage />}

        {libraryToShow.length > 0 &&
          (!refreshing || refreshingInTheBackground) && (
            <GamesList
              library={libraryToShow}
              layout={layout}
              handleGameCardClick={handleModal}
            />
          )}
      </div>

      <button id="backToTopBtn" onClick={backToTop} ref={backToTopElement}>
        <ArrowDropUp id="backToTopArrow" className="material-icons" />
      </button>

      {showCategories && <CategoriesManager />}
    </LibraryContext.Provider>
  )
})
