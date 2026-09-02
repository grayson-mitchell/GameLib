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
  countUnfilteredGames,
  findSilentlyExcludedGames
} from './components/LibraryHeader/gameCount'
import { normalizeTitle } from 'frontend/helpers/library'
import RecentlyPlayed from './components/RecentlyPlayed'
import LibraryContext from './LibraryContext'
import {
  FilterEngineDeps,
  FilterEngineState,
  FilterMode,
  LibraryView,
  NoStorePageMode,
  RunnabilityTier,
  StoreFacetValue
} from 'frontend/types'
import useGlobalState from 'frontend/state/GlobalStateV2'
import { hasHelp } from 'frontend/hooks/hasHelp'
import { reconcileNonAvailableGames } from 'frontend/hooks/constants'
import EmptyLibraryMessage from './components/EmptyLibrary'
import CategoriesManager from './components/CategoriesManager'
import LibraryTour from './components/LibraryTour'
import AlphabetFilter from './components/AlphabetFilter'
import FilterChipRow from './components/FilterChipRow'
import { renderableActiveFilters } from './components/FilterChipRow/chipLabels'
import FilterZeroResult from './components/FilterZeroResult'
import { openInstallGameModal } from 'frontend/state/InstallGameModal'
import { Tier2PortalContext } from 'frontend/components/UI/NavShell/Tier2PortalContext'
import { configStore, steamConfigStore } from 'frontend/helpers/electronStores'
import SteamSyncNotice from './components/SteamSyncNotice'
import { resolveSteamSyncIndicator } from './librarySyncIndicator'
// Namespace import: filterEngine's helpers are referenced as
// `filterEngine.xxx` throughout this file rather than named imports, so a
// call site is this identifier's only appearance in the file (see the
// acceptance criteria on 34.11-04-PLAN.md Tasks 2/3 -- each migration
// helper and describeActiveFilters must be called exactly once, provably,
// with no separate import-line match to conflate with a real call).
import * as filterEngine from './filterEngine'
// CR-01: the grid/count call shape lives in this React-free module, not
// inline here, so a unit test can exercise the REAL production wiring
// instead of a hand-written replica of it.
import {
  buildEngineDeps,
  buildGridPipeline,
  collectionIsStale
} from './engineWiring'

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
    customCategories,
    hiddenGames,
    gameUpdates,
    steamSyncStatus
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

  // D-05: single-select view. A format guard in the shape of
  // migrateFilterMode below -- an unrecognised or absent value falls back
  // to 'all' rather than throwing.
  const initialLibraryView = (): LibraryView => {
    const stored = storage.getItem('libraryView')
    return (VALID_LIBRARY_VIEWS as string[]).includes(stored || '')
      ? (stored as LibraryView)
      : 'all'
  }
  const [libraryView, setLibraryView_] =
    useState<LibraryView>(initialLibraryView)
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
  const [runnabilityFacet, setRunnabilityFacet_] = useState<RunnabilityTier[]>(
    () =>
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

  // WR-09 (quick 260827-t9c): a renamed or deleted category leaves
  // `currentCollection` naming a key `customCategories` no longer has --
  // `passesCollection` then rejects every game, the grid goes empty, the
  // zero-result sentence names a collection that no longer exists, and the
  // Collections list has no row left to click to clear it. That is an
  // unrecoverable state reachable by ordinary use of `CategoriesManager`
  // (renaming or deleting the category currently selected). This effect
  // clears the persisted selection instead. `setCurrentCollectionPersisted`
  // is a plain function redefined every render -- deliberately NOT in the
  // dependency array below (that would loop); it is stable enough for this
  // purpose because it closes over nothing that changes independently of
  // `currentCollection` itself.
  useEffect(() => {
    if (collectionIsStale(currentCollection, customCategories.list)) {
      setCurrentCollectionPersisted(null)
    }
  }, [currentCollection, customCategories.list])

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

  // Recent-games source mirrors RecentlyPlayed/index.tsx's own read -- and,
  // WR-05 (quick 260827-t9c), its own refresh too. This used to be a
  // `useMemo(..., [])`, captured once at mount and never updated: launching
  // or stopping a game during the session left `recentAppNames` (and every
  // downstream consumer via `engineDeps`) frozen at whatever `games.recent`
  // held when Library first mounted. Now state, refreshed on the same
  // `handleRecentGamesChanged` push `RecentlyPlayed/index.tsx` already
  // subscribes to.
  //
  // REJECTED the review's fallback of adding `libraryStatus` to a dependency
  // array instead: `libraryStatus` is the install/download status array,
  // which changes on every progress tick, so depending on it would
  // recompute this (and, through `engineDeps`, invalidate every downstream
  // memo) continuously during any download -- a re-render storm bought for
  // a value that only actually changes when a game is launched or stopped.
  // `handleRecentGamesChanged` fires exactly on that real event and is the
  // review's own primary recommendation.
  const [recentAppNames, setRecentAppNames] = useState<string[]>(() =>
    configStore.get('games.recent', []).map((entry) => entry.appName)
  )
  useEffect(() => {
    const loadRecentAppNames = () => {
      setRecentAppNames(
        configStore.get('games.recent', []).map((entry) => entry.appName)
      )
    }
    const removeRecentGamesChangedListener =
      window.api.handleRecentGamesChanged(loadRecentAppNames)
    return () => {
      removeRecentGamesChangedListener()
    }
  }, [])

  // D-04: the store facet values whose account is connected, reusing the
  // same gating expressions makeLibrary() already uses below -- the Store
  // group renders a row only for a connected account, never a permanent 0.
  //
  // That parity is the security control, not a tidiness preference: threat
  // T-34.11-12 (Spoofing) is closed BY the two sites agreeing. Amazon read
  // `amazon.username` here while makeLibrary read `amazon.user_id`, so a
  // username-without-user_id account rendered an Amazon row over a grid with
  // no Amazon games -- the permanent-0 row this comment promises cannot
  // happen (review WR-03; operator chose user_id, 2026-08-25). Every gate
  // below is now pinned against makeLibrary by connectedStoresParity.test.ts;
  // change one site and CI fails until the other follows.
  const connectedStores: StoreFacetValue[] = useMemo(() => {
    const stores: StoreFacetValue[] = ['sideload']
    if (gog.username) stores.push('gog')
    if (epic.username) stores.push('legendary')
    if (amazon.user_id) stores.push('nile')
    if (zoom.enabled && zoom.username) stores.push('zoom')
    if (steam?.username) stores.push('steam')
    return stores
  }, [
    gog.username,
    epic.username,
    amazon.user_id,
    zoom.enabled,
    zoom.username,
    steam?.username
  ])

  // The Runnability rows this host can compute (plan 01). Empty on Windows.
  const runnabilityRows = useMemo(
    () => filterEngine.runnabilityRowsForHost(platform),
    [platform]
  )

  // 19-06 slice: app_name -> rating|null; absent = never looked up (D-16).
  const { crossoverRatings } = useGlobalState.keys('crossoverRatings')

  const [filterText, setFilterText] = useState('')

  // Debug session steam-library-22-games-missing (2026-08-21): bumped by
  // the `reconcileNonAvailableGames` effect below whenever it actually
  // heals a stale `nonAvailableGames` entry, forcing one extra render so
  // `engineDeps`/`libraryToShow` (which re-read localStorage but only on a
  // `libraryUnion` change, not on a timer) pick up the correction without
  // waiting on an unrelated future state change.
  const [reconcileTick, setReconcileTick] = useState(0)

  // Migration helper: maps legacy 'true'/'false'/null to FilterMode. The rule
  // itself lives in filterEngine alongside the other migrations (and is unit
  // tested there); this closure only supplies the storage read.
  const migrateFilterMode = (key: string, defaultValue: FilterMode) =>
    filterEngine.migrateFilterMode(storage.getItem(key), defaultValue)

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

  // D-11: the "No store page" facet's own validator. Not a widened
  // `migrateFilterMode` -- that union admits 'show', which is not a valid
  // NoStorePageMode value, including a legacy 'show' written by some future
  // edit.
  const readNoStorePageMode = (
    key: string,
    defaultValue: NoStorePageMode
  ): NoStorePageMode => {
    const stored = storage.getItem(key)
    if (stored === 'off' || stored === 'only' || stored === 'hide')
      return stored
    return defaultValue
  }

  const [noStorePage, setNoStorePage_] = useState<NoStorePageMode>(
    readNoStorePageMode('no_store_page', 'off')
  )
  const handleNoStorePage = (value: NoStorePageMode) => {
    storage.setItem('no_store_page', value)
    setNoStorePage_(value)
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

  // WR-08: the two panel rows that open this dialog ('+ New collection' /
  // 'Manage collections') used to call the same `setShowCategories(true)`
  // and were therefore indistinguishable once open. `categoriesManagerIntent`
  // is set only when opening (never on close) and threaded through
  // LibraryContext so `CategoriesManager` can autoFocus the create input
  // for one intent and not the other, with no new user-facing string.
  const [showCategories, setShowCategoriesRaw] = useState(false)
  const [categoriesManagerIntent, setCategoriesManagerIntent] = useState<
    'manage' | 'create'
  >('manage')
  const setShowCategories = useCallback(
    (value: boolean, intent?: 'manage' | 'create') => {
      if (value) {
        setCategoriesManagerIntent(intent ?? 'manage')
      }
      setShowCategoriesRaw(value)
    },
    [setCategoriesManagerIntent, setShowCategoriesRaw]
  )

  const [showAlphabetFilter, setShowAlphabetFilter] = useState(
    JSON.parse(storage.getItem('showAlphabetFilter') || 'true')
  )
  const handleToggleAlphabetFilter = () => {
    const newValue = !showAlphabetFilter
    storage.setItem('showAlphabetFilter', JSON.stringify(newValue))
    setShowAlphabetFilter(newValue)
    if (!newValue) {
      // D-08a (2026-08-27, quick 260827-vpl): the strip is the letter's only
      // always-visible indicator (DECISION 1's rationale for withholding a
      // chip). Hiding it while a letter stays selected would leave a live
      // filter with nothing on screen representing it -- clear it here.
      setAlphabetFilterLetter(null)
    }
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

  // top section
  const showRecentGames = libraryTopSection.startsWith('recently_played')

  const favouriteGamesList = useMemo(() => {
    // 08.1 review IN-02: `!== 'off'` folded 'only' in with 'show' and returned
    // the unfiltered list, so this lane contradicted the main grid's "only
    // hidden games" selection sitting directly below it. Same shared rule as
    // the RecentlyPlayed lane.
    const hiddenAppNames = hiddenGames.list.map(
      (hidden: HiddenGame) => hidden.appName
    )

    return favouriteGames.list.filter((game) =>
      filterEngine.passesHiddenLaneFilter(
        hiddenAppNames.includes(game.appName),
        showHidden
      )
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

  // NOTE (CR-02): there is deliberately no `favouritesIds` memo here any
  // more. `engineDeps.favouriteKeys` used to be derived from `favourites`
  // above -- a DISPLAY memo that only populates when `showFavourites ||
  // showFavouritesLibrary`, both of which are off on a default install. That
  // made the Favourites VIEW return zero games for everyone. The engine now
  // reads `favouriteGames.list` directly (see the engineDeps memo below);
  // `favourites` survives solely to feed the top-section Favourites lane in
  // the JSX, which is what it was always for.

  // --- 34.11 Plan 04/05 (+ CR-01 code-review fix): the filter engine's
  // assembled inputs, computed ONCE here and reused by the grid, the
  // exclude-your-own-facet counts, and the active-descriptor list -- so all
  // three provably read the same inputs and can never drift apart.
  //
  // CR-01 fix, and the reason the declaration order below matters: the
  // UNFILTERED union and the fuzzy-matched key set are both hoisted out of
  // the grid memo and declared FIRST, because the COUNTS need both. The
  // pre-fix arrangement computed them inside the grid memo and handed the
  // grid's filtered OUTPUT to countFor, which made every unselected facet
  // option report a permanent 0 -- skipping a facet on a list that facet has
  // already narrowed cannot recover the games it excluded.
  //
  // `engineState.searchMatchedKeys` now carries the real Fuse match set
  // rather than a placeholder `null`, so REQ-34.11-15 ("facet counts are
  // computed over the fuzzy-matched set") holds because filterLibrary
  // applies the search stage on every pass -- not, as before, by side effect
  // of the search constraint having already been baked into the list being
  // counted. `describeActiveFilters` does not read this field at all (it
  // takes the raw search term as its own argument), so widening it is inert
  // there. ---

  // 34.11 Plan 05: unions every CONNECTED account's library only -- no
  // filter logic lives here. The store FACET is applied downstream in
  // filterLibrary (filterEngine.passesStore) so countFor's skip rule can see
  // the games a store WOULD contribute if selected. Do not reintroduce a
  // store filter here -- leaving the store gate in makeLibrary would make
  // every unselected store's count 0, the "counts that lie" failure the
  // sketch's library-filtering findings warn against.
  // WR-01 (quick 260827-t9c): extracted into a `useCallback` with the
  // complete dependency list, the review's FIRST recommended option -- not
  // its second (add all six login-gate values to `libraryUnion`'s memo
  // array below AND keep `makeLibrary` a plain closure). A plain closure
  // captures whichever `epic.username`/`gog.username`/`amazon.user_id`/
  // `zoom.enabled`/`zoom.username`/`steam?.username` were in scope on the
  // render that created it; `libraryUnion`'s memo only re-invoked it when
  // its OWN array changed, which listed the four `*.library` arrays plus
  // `sideloadedLibrary` but none of the six login-gate reads above -- so a
  // login/logout that changed a `show*` gate without also changing that
  // store's `.library` reference left `libraryUnion` (and everything
  // downstream of it: the grid, both facet counts, `engineDeps`) stale
  // until some unrelated render happened to also change a `.library`
  // reference. `useCallback`'s own dependency array is exhaustive-deps
  // checked the same as any other hook, so the six gate reads are now
  // itemised as real dependencies rather than free variables closed over.
  const makeLibrary = useCallback(() => {
    const showEpic = !!epic.username
    const showGog = !!gog.username
    const showAmazon = !!amazon.user_id
    const showZoom = zoom.enabled && !!zoom.username
    const showSteam = !!steam?.username

    const epicLibrary = showEpic ? epic.library : []
    const gogLibrary = showGog ? gog.library : []
    const sideloadedApps = sideloadedLibrary
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
  }, [
    epic.username,
    epic.library,
    gog.username,
    gog.library,
    amazon.user_id,
    amazon.library,
    zoom.enabled,
    zoom.username,
    zoom.library,
    steam?.username,
    steam?.library,
    sideloadedLibrary
  ])

  // The UNFILTERED union. This exact array -- never a filtered derivative of
  // it -- is what buildGridPipeline hands to both filterLibrary and countFor.
  // WR-01 (quick 260827-t9c): depends on `makeLibrary` alone now that
  // `makeLibrary` is itself a `useCallback` carrying the complete
  // dependency list (all six login-gate reads plus all `.library` arrays
  // and `sideloadedLibrary`) -- so this memo is exhaustive by construction
  // rather than by a hand-copied list that silently omitted the gate reads.
  const libraryUnion = useMemo(() => makeLibrary(), [makeLibrary])

  // Search-key precompute, built over the FULL (unconstrained) union so
  // search stays order-independent -- what lets filterLibrary's `skip` rule
  // compute correct sibling counts. Moved verbatim out of the grid memo by
  // the CR-01 fix so the counts read the same match set the grid does; the
  // Fuse configuration is byte-identical to the shipped one (D-33 amendment,
  // REQ-34.11-15) -- removing Fuse is out of scope this phase.
  const searchMatchedKeys = useMemo<Set<string> | null>(() => {
    try {
      const searchableLibrary: SearchableGame[] = libraryUnion.map((game) => {
        const title = game.overrides?.title || game.title
        return {
          original: game,
          title,
          normalizedTitle: normalizeTitle(title)
        }
      })

      const options = {
        minMatchCharLength: 1,
        threshold: 0.4,
        useExtendedSearch: true,
        keys: ['title', 'normalizedTitle']
      }
      const fuse = new Fuse(searchableLibrary, options)

      if (!filterText) {
        return null
      }

      return new Set(
        fuse
          .search(filterText)
          .map((result) => filterEngine.gameKey(result.item.original))
      )
    } catch (error) {
      console.log(error)
      // Defensive fallback preserved from the shipped behaviour: a Fuse
      // construction/search failure degrades to "no search constraint"
      // rather than blanking the grid.
      return null
    }
  }, [libraryUnion, filterText])

  // CR-02/WR-15: every field is built by the React-free `buildEngineDeps`,
  // so the whole construction is unit-testable
  // (`__tests__/engineWiring.test.ts`) rather than being an untested inline
  // object literal -- the seam CR-02 lived on, and which no test in the
  // phase touched. `favouriteGames` is passed RAW, straight from
  // ContextProvider, so the engine's favourite key set can never again be
  // gated on a display setting.
  const engineDeps: FilterEngineDeps = useMemo(
    () =>
      buildEngineDeps({
        hiddenGames: hiddenGames.list,
        favouriteGames: favouriteGames.list,
        libraryUnion,
        nonAvailableGamesRaw: storage.getItem('nonAvailableGames'),
        recentAppNames,
        customCategories: customCategories.list,
        gameUpdates,
        crossoverRatings,
        hostPlatform: platform
      }),
    [
      hiddenGames,
      favouriteGames,
      libraryUnion,
      recentAppNames,
      customCategories,
      gameUpdates,
      crossoverRatings,
      platform,
      // Debug session steam-library-22-games-missing (2026-08-21): not read
      // inside the factory above -- included purely to invalidate this memo
      // after `reconcileNonAvailableGames` heals a stale `nonAvailableGames`
      // localStorage entry, so `nonAvailableGamesRaw` above is re-read fresh
      // instead of staying pinned to the pre-heal snapshot until some
      // unrelated dependency happens to change.
      reconcileTick
    ]
  )

  const engineState: FilterEngineState = useMemo(
    () => ({
      view: libraryView,
      collection: currentCollection,
      stores: storeFacet,
      runnability: runnabilityFacet,
      // CR-01 fix: the REAL fuzzy-matched key set (or null when the search
      // box is empty), no longer a placeholder the grid alone overrode. The
      // grid and both counts now read the identical search constraint.
      searchMatchedKeys,
      showHidden,
      showNonAvailable,
      noStorePage,
      showSupportOfflineOnly,
      showThirdPartyManagedOnly,
      showUpdatesOnly
    }),
    [
      libraryView,
      currentCollection,
      storeFacet,
      runnabilityFacet,
      searchMatchedKeys,
      showHidden,
      showNonAvailable,
      noStorePage,
      showSupportOfflineOnly,
      showThirdPartyManagedOnly,
      showUpdatesOnly
    ]
  )

  // 34.11 Plan 05 + CR-01 fix: the grid's ONLY pipeline, and the counts',
  // built by one call to the React-free `buildGridPipeline` -- which is what
  // makes the production call shape directly unit-testable
  // (`__tests__/engineWiring.test.ts`). The grid list and both count
  // accessors come out of the SAME call over the SAME unfiltered union, so a
  // facet count can never disagree with what the grid shows (RESEARCH
  // Anti-Patterns). filterByPlatform (literal platform facet, D-09) and the
  // macOS crossoverRatingFilters branch (D-10, absorbed into the runnability
  // facet as evidence) are retired: neither runs here anymore.
  // showFavouritesLibrary/showInstalledOnly/the legacy currentCustomCategories
  // collection filter/the offline-support/third-party/updates-only toggles/
  // the hidden+non-available tri-state block all now live in filterEngine's
  // per-stage predicates, driven by the opt-in facet state plan 04 declared.
  const gridPipeline = useMemo(
    () => buildGridPipeline(libraryUnion, engineState, engineDeps),
    [libraryUnion, engineState, engineDeps]
  )

  const gamesForAlphabetFilter = gridPipeline.games

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

  // D-28: exclude-your-own-facet counts. These come off the SAME
  // `gridPipeline` object the grid list above does, which is the whole point
  // of the CR-01 fix: there is no longer a call site here that could pick
  // the wrong list to count over. Both accessors close over the unfiltered
  // union inside `buildGridPipeline`; passing the grid's filtered output was
  // the defect, and this component can no longer express that mistake.
  const { countForStore, countForRunnability } = gridPipeline

  // D-26: the descriptor list and its count come from ONE call -- the count
  // is that list's `.length`, never a second independent computation, so
  // the chip row can never disagree with what the panel claims is active.
  // WR-12 (quick 260827-t9c): the raw `describeActiveFilters` output is run
  // through `renderableActiveFilters` before anything else sees it, so the
  // published list only ever contains descriptors `chipLabelSpec` can name
  // -- a count greater than zero now always implies at least one renderable
  // label, which is what makes D-26's "one call, the count IS that list's
  // length" property true of a list every consumer can actually render.
  const activeFilterDescriptors = useMemo(
    () =>
      renderableActiveFilters(
        filterEngine.describeActiveFilters(engineState, filterText)
      ),
    [engineState, filterText]
  )
  const activeFilterCount = activeFilterDescriptors.length

  // D5: the library header's DENOMINATOR -- "how many games would I see if I
  // cleared every filter". Deliberately a SEPARATE `filterLibrary` call
  // against the default state rather than `libraryUnion.length`: the union
  // carries hidden and non-available entries the default state never shows,
  // so its length names a total the user can never reach by clearing
  // filters. This number is reachable by definition -- it is exactly what
  // `Clear all` produces -- and that self-consistency IS the feature.
  //
  // It also deliberately does NOT go through `buildGridPipeline`: that seam
  // is pinned by `engineWiring.test.ts` to exactly three engine calls, and
  // this pass skips no stage, so routing it through the pipeline would buy
  // nothing and put a second caller on a contract built for one.
  //
  // The engine call itself lives in `countUnfilteredGames`, NOT inline here:
  // `libraryPipeline.test.ts` gates this component against holding any
  // `filterLibrary(`/`countFor(` call shape, because an engine call sitting
  // in this file is one no behavioural test can reach with the real
  // arguments (that was CR-01). The helper is unit-tested directly instead.
  //
  // Accepted nuance (D8): `alphabetFilterLetter` is applied downstream in
  // `libraryToShow` and emits no `ActiveFilterDescriptor`, so it is not in
  // this denominator. With only a letter picked, `activeFilterCount` is 0
  // and the header renders exactly as it always has.
  const unfilteredGameCount = useMemo(
    () => countUnfilteredGames(libraryUnion, engineDeps),
    [libraryUnion, engineDeps]
  )

  // Debug session steam-library-22-games-missing (2026-08-21), fix for both
  // compounding defects:
  //
  //   Defect #1 (backend): a Steam game's `isGameAvailable()` verdict can be
  //   computed before the in-memory library Map is hydrated by
  //   SteamLibraryManager.refresh()'s CM sync, resolving false for an owned,
  //   previously-installed game. Fixed at the source in
  //   `SteamGame.getGameInfo()` (steam/games.ts) via a persisted-cache
  //   fallback -- this effect does not (and cannot, from the frontend) fix
  //   defect #1 itself, but it is what makes the fix's correction actually
  //   reach an already-excluded game.
  //
  //   Defect #2 (frontend, this effect): once a false-negative verdict is
  //   persisted into the `nonAvailableGames` localStorage list, nothing
  //   re-checks it -- the ONLY call site for the self-healing check
  //   (`handleNonAvailableGames`) is inside the excluded game's own
  //   GameCard, which the exclusion itself prevents from ever mounting
  //   again. `reconcileNonAvailableGames` runs that same check from here
  //   instead, keyed on the unfiltered `libraryUnion` -- a component that
  //   renders regardless of any single game's exclusion state -- so a
  //   stale/incorrect entry gets re-verified (and removed, if now correct)
  //   without depending on the excluded card ever rendering.
  //
  // `bumpReconcileTick` forces exactly one extra render when something was
  // actually healed: this render's `engineDeps`/`libraryToShow` were already
  // built from the PRE-heal localStorage snapshot (buildEngineDeps re-reads
  // localStorage on every `libraryUnion` change, not on a timer), so healing
  // localStorage alone would not otherwise be picked up until some UNRELATED
  // future state change happened to re-run this component.
  useEffect(() => {
    let cancelled = false
    reconcileNonAvailableGames(libraryUnion).then((healed) => {
      if (!cancelled && healed.length > 0) {
        setReconcileTick((tick) => tick + 1)
      }
    })
    return () => {
      cancelled = true
    }
  }, [libraryUnion])

  // Blind-spot guard (same debug session): logs an anomaly if a Steam,
  // non-DLC game is STILL silently excluded after the reconciliation pass
  // above. 37-REVIEW I-01: this used to say "non-delisted" -- REQ-37-02
  // deleted that carve-out, and `findSilentlyExcludedGames` now deliberately
  // FOLDS delisted games back into the check, since being delisted is no
  // longer a legitimate reason to be missing from the grid -- see `findSilentlyExcludedGames`'s doc
  // comment for why this specific defect class is otherwise invisible to
  // every existing count/gate. `reconcileTick` is in the dependency array
  // (unused directly) so this re-runs against the corrected `engineDeps`
  // after a heal, not just against the pre-heal snapshot.
  useEffect(() => {
    const stillExcluded = findSilentlyExcludedGames(libraryUnion, engineDeps)
    if (stillExcluded.length > 0) {
      window.api.logError(
        `Library: ${stillExcluded.length} owned Steam game(s) silently ` +
          `excluded from the library grid by a stale nonAvailableGames ` +
          `entry: ${stillExcluded.join(', ')}`
      )
    }
  }, [libraryUnion, engineDeps, reconcileTick])

  // D-25: clears AND PERSISTS every filter to its default -- "whatever the
  // chip row shows is what comes back next launch". A non-persisting
  // implementation would silently restore the old filters on next launch,
  // which would be a defect, not a simplification.
  const clearAllFilters = () => {
    setLibraryViewPersisted('all')
    setStoreFacetPersisted([])
    setRunnabilityFacetPersisted([])
    setCurrentCollectionPersisted(null)
    handleShowHidden('off')
    handleShowNonAvailable('off')
    handleNoStorePage('off')
    handleShowSupportOfflineOnly(false)
    handleShowThirdPartyOnly(false)
    handleShowUpdatesOnly(false)
    // filterText and alphabetFilterLetter are session-only (D-22 /
    // WR-11 fix, 2026-08-27 quick 260827-vpl) and have no localStorage key --
    // the exception to "every one of those goes through its persisted
    // wrapper". The letter is a filter (DECISION 1) and clearing it here
    // closes the reachable dead end where a user presses this exact button
    // and is left worse informed than before: with a letter and a facet
    // both applied and zero matches, clicking this used to clear only the
    // facet, leaving the letter alone to still match nothing, and
    // `EmptyLibraryMessage` ("your library is empty") replaced the very
    // panel that offered the escape hatch.
    setFilterText('')
    setAlphabetFilterLetter(null)
  }

  // 34.15 D-06/D-08/D-09/D-10: the render decision is delegated wholesale to
  // the pure resolver in `librarySyncIndicator.ts` -- this file must never
  // re-inline the boolean it replaces. See that module's header for the
  // verbatim shipped-defect expression this computation supersedes.
  const { mode: steamSyncMode } = resolveSteamSyncIndicator({
    steamLoggedIn: Boolean(steam?.username),
    steamSyncStatus,
    steamLibraryCount: steam?.library?.length ?? 0,
    // Read straight from the store, exactly as the Manage Accounts tile does
    // (`Login/index.tsx`): the backend latches this during the same refresh
    // that just failed, so a value captured earlier in React state would be a
    // frame behind. Already allow-listed at storePolicy.ts (260822-vov), so
    // both this read and the STORE_CHANGED_CHANNEL push carry it.
    steamCredentialsMissing: Boolean(
      steamConfigStore.get_nodefault('credentialsMissing')
    )
  })

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
        layout,
        showHidden,
        showFavourites: showFavouritesLibrary,
        showInstalledOnly,
        showNonAvailable,
        noStorePage,
        filterText,
        handleLayout: handleLayout,
        handleSearch: setFilterText,
        setShowHidden: handleShowHidden,
        setShowFavourites: handleShowFavourites,
        setShowInstalledOnly: handleShowInstalledOnly,
        setShowNonAvailable: handleShowNonAvailable,
        setNoStorePage: handleNoStorePage,
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
        categoriesManagerIntent,
        showAlphabetFilter: showAlphabetFilter,
        onToggleAlphabetFilter: handleToggleAlphabetFilter,
        gamesForAlphabetFilter,
        alphabetFilterLetter,
        setAlphabetFilterLetter,

        // 34.11 Plan 04: opt-in facet surface. NOTE: the default-context
        // sentinel field (see LibraryContext.tsx's initialContext) is
        // deliberately NOT set here -- its absence is what lets a consumer
        // tell this real provider apart from that default.
        libraryView,
        setLibraryView: setLibraryViewPersisted,
        storeFacet,
        setStoreFacet: setStoreFacetPersisted,
        runnabilityFacet,
        setRunnabilityFacet: setRunnabilityFacetPersisted,
        currentCollection,
        setCurrentCollection: setCurrentCollectionPersisted,
        clearAllFilters,
        activeFilterDescriptors,
        activeFilterCount,
        runnabilityRows,
        connectedStores,
        countForStore,
        countForRunnability
      }}
    >
      {tier2PortalTarget ? createPortal(<Header />, tier2PortalTarget) : null}
      <LibraryTour />

      <div className="listing">
        <span id="top" />

        {/*
          Quick task 260815-qf0: the active-filter chips render FIRST inside
          `.listing`, the scrolling container. They used to sit fifth (after
          this lane, the Favourites lane, LibraryHeader and AlphabetFilter),
          which put them below the fold on relaunch with filters persisted --
          the library looked short and nothing on screen said why. The
          governing rule is `Skill("sketch-findings-gamelib")` ->
          `references/library-filtering.md`: do not hide filter state in the
          panel alone.

          KNOWN NUANCE -- do not "correct" this back. The chips now sit above
          the Played Recently lane, which they only PARTLY govern: that lane
          receives `showHidden` and `onlyInstalled`, but not the store or
          runnability facets. The user was told this and chose the hoist
          anyway; visibility above the fold is the point. Making the recent
          lane honour the remaining facets is NOT the fix and is explicitly
          out of scope. The row self-suppresses at `activeFilterCount === 0`,
          so an unfiltered library's tree is unchanged.

          Locked by `__tests__/filterChipRowPlacement.test.ts`.
        */}
        <FilterChipRow />

        {showRecentGames && (
          <RecentlyPlayed
            handleModal={handleModal}
            onlyInstalled={libraryTopSection.endsWith('installed')}
            showHidden={showHidden}
          />
        )}

        {showFavourites && !showFavouritesLibrary && (
          <>
            <div className="library-section-header">
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

        <LibraryHeader list={libraryToShow} totalGames={unfilteredGameCount} />

        {showAlphabetFilter && <AlphabetFilter />}

        {refreshing && !refreshingInTheBackground && <UpdateComponent />}

        {steamSyncMode !== 'hidden' && <SteamSyncNotice mode={steamSyncMode} />}

        {libraryToShow.length === 0 &&
          // WR-10 (2026-08-27, quick 260827-vpl): the alphabet letter is a
          // filter (DECISION 1) that emits no ActiveFilterDescriptor, so a
          // letter-only zero result must be admitted here explicitly or it
          // falls through to the generic EmptyLibraryMessage instead of
          // FilterZeroResult, which is the only surface that names it.
          (activeFilterCount > 0 || alphabetFilterLetter ? (
            <FilterZeroResult />
          ) : (
            <EmptyLibraryMessage />
          ))}

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
