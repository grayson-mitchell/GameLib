import { useContext, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faTv,
  faSyncAlt,
  faBorderAll,
  faList,
  faArrowDownAZ,
  faArrowDownZA,
  faHardDrive,
  faCircleXmark,
  faFilter,
  faFilterCircleXmark
} from '@fortawesome/free-solid-svg-icons'
import classNames from 'classnames'
import { GameInfo } from 'common/types'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
import ContextProvider from 'frontend/state/ContextProvider'
import { countGamesExcludingDlc } from 'frontend/screens/Library/gameCount'
import { LIBRARY_TOUR_ID } from 'frontend/screens/Library/components/LibraryTour'
import TourButton from 'frontend/components/Tour/TourButton'
import AddGameButton from 'frontend/screens/Library/components/AddGameButton'
import LibrarySearchBar from '../LibrarySearchBar'
import FilterViewList from '../NavShell/components/FilterViewList'
import FilterCollectionList from '../NavShell/components/FilterCollectionList'
import FilterStoreFacet from '../NavShell/components/FilterStoreFacet'
import FilterRunnabilityFacet from '../NavShell/components/FilterRunnabilityFacet'
import FilterMoreGroup from '../NavShell/components/FilterMoreGroup'
import './index.css'

type Props = {
  list: GameInfo[]
  /**
   * How many games would show with every filter cleared (260815-opt, D5).
   *
   * REQUIRED, not optional. An optional prop would let a future call site
   * omit it and render "42 of undefined" with nothing failing -- and there
   * is exactly one call site (`screens/Library/index.tsx`), so requiring it
   * costs nothing.
   *
   * Accepted nuance (D8): the alphabet filter is applied AFTER the engine
   * and contributes no `ActiveFilterDescriptor`. With only a letter picked,
   * `activeFilterCount` is 0 and today's rendering is preserved exactly.
   * With a letter AND a facet, the numerator is letter-narrowed while this
   * denominator is not. That is the correct reading of "showing N of your M
   * games" and is deliberate -- do not "fix" it.
   */
  totalGames: number
}

function formatRelativeTime(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  }
  const hours = Math.floor(ms / 3600000)
  if (hours < 24) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }
  const days = Math.floor(ms / 86400000)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

export default function Header({ list, totalGames }: Props) {
  const { t } = useTranslation()
  // Dual hook, the same pattern `FilterChipRow` already uses: the shared
  // 'translation' namespace for this panel's pre-existing copy, 'gamelib'
  // for the fork's own strings.
  const { t: tGamelib } = useTranslation('gamelib')
  const consoleModeLabel = t('sidebar.console', 'Console Mode')

  const {
    activeFilterCount,
    layout,
    handleLayout,
    sortDescending,
    setSortDescending,
    sortInstalled,
    setSortInstalled,
    showAlphabetFilter,
    onToggleAlphabetFilter
  } = useContext(LibraryContext)
  const {
    refreshLibrary,
    refreshing,
    refreshingInTheBackground,
    refreshingByRunner,
    steamMetadataSyncing,
    connectivity
  } = useContext(ContextProvider)

  const [syncedAt, setSyncedAt] = useState<number | null>(null)

  useEffect(() => {
    window.api.getSteamSyncedAt().then((ts) => setSyncedAt(ts))
  }, [])

  useEffect(() => {
    window.api.getSteamSyncedAt().then((ts) => setSyncedAt(ts))
  }, [connectivity.status])

  // The DLC-exclusion rule moved verbatim into `gameCount.ts` so the
  // denominator below applies the identical predicate -- two copies could
  // disagree and print `42 of 41` (D6).
  const numberOfGames = useMemo(() => countGamesExcludingDlc(list), [list])

  // Show the spinner both during the library-list refresh AND while per-game
  // metadata/art is still streaming in the background (the long tail on a cold
  // cache) — otherwise the art appears to load with no sign anything's happening.
  //
  // debug/login-logout-wipes-library: a single-runner refresh (login/logout
  // of ONE platform) no longer flips the two GLOBAL flags above at all — it
  // writes `refreshingByRunner` instead (see GlobalState.tsx's
  // `refreshLibrary`/`refresh`). Without this OR clause, that scoped case
  // would silently lose this spinner entirely (a real, if pre-existing and
  // mislabeled, feedback regression) — checking whether ANY runner is mid
  // scoped-refresh preserves the exact same "something is syncing" signal.
  const isSteamSyncing =
    (refreshing && refreshingInTheBackground) ||
    steamMetadataSyncing ||
    Object.values(refreshingByRunner).some(Boolean)

  const showStaleIndicator =
    connectivity.status !== 'online' && syncedAt !== null

  const staleTime =
    syncedAt !== null ? formatRelativeTime(Date.now() - syncedAt) : ''

  return (
    <div className="Header">
      <div className="Header__utilities">
        <Link
          to="/console"
          className="Header__consoleButton"
          aria-label={consoleModeLabel}
          title={consoleModeLabel}
        >
          <FontAwesomeIcon icon={faTv} />
        </Link>
        {layout === 'grid' ? (
          <button
            className="Header__utilityButton"
            title={t('library.toggleLayout.list', 'Toggle to a list layout')}
            onClick={() => handleLayout('list')}
          >
            <FontAwesomeIcon icon={faList} data-tour="library-view-toggle" />
          </button>
        ) : (
          <button
            className="Header__utilityButton"
            title={t('library.toggleLayout.grid', 'Toggle to a grid layout')}
            onClick={() => handleLayout('grid')}
          >
            <FontAwesomeIcon
              icon={faBorderAll}
              data-tour="library-view-toggle"
            />
          </button>
        )}
        <button
          className="Header__utilityButton"
          title={
            sortDescending
              ? t('library.sortDescending', 'Sort Descending')
              : t('library.sortAscending', 'Sort Ascending')
          }
          onClick={() => setSortDescending(!sortDescending)}
        >
          <FontAwesomeIcon
            icon={sortDescending ? faArrowDownZA : faArrowDownAZ}
            data-tour="library-sort-az"
          />
        </button>
        <button
          className="Header__utilityButton"
          // The state cue is now the small-x badge rendered on the glyph
          // below (D-02/D-07) plus aria-pressed, not a latched tile fill --
          // the fill's only consumer was this button, and D-10 reverts the
          // shared FormControl rule now that it has none. The title stays
          // STATELESS: an accessible name should name the control, not
          // narrate its state, and a stateful pair would cost 96 new
          // catalogue strings (D-09).
          aria-pressed={sortInstalled}
          title={t('library.sortByStatus', 'Sort by Status')}
          onClick={() => setSortInstalled(!sortInstalled)}
        >
          <span
            className="Header__statusGlyph"
            data-tour="library-sort-installed"
          >
            <FontAwesomeIcon icon={faHardDrive} />
            {sortInstalled && (
              <FontAwesomeIcon
                icon={faCircleXmark}
                className="Header__statusGlyphBadge"
              />
            )}
          </span>
        </button>
        <button
          className="Header__utilityButton"
          title={
            showAlphabetFilter
              ? t('library.hideAlphabetFilter', 'Hide Alphabet Filter')
              : t('library.showAlphabetFilter', 'Show Alphabet Filter')
          }
          onClick={onToggleAlphabetFilter}
        >
          <FontAwesomeIcon
            icon={showAlphabetFilter ? faFilterCircleXmark : faFilter}
          />
        </button>
        <TourButton tourId={LIBRARY_TOUR_ID} className="library-tour-button" />
      </div>
      <div className="Header__search">
        <LibrarySearchBar />
      </div>
      <div
        className="Header__categoriesGroup"
        data-tour="library-views-collections"
      >
        <FilterViewList />
        <FilterCollectionList />
      </div>
      <div className="Header__filtersGroup" data-tour="library-facets">
        <FilterStoreFacet />
        <FilterRunnabilityFacet />
        <FilterMoreGroup />
      </div>
      <div className="Header__footer">
        <div className="Header__footerRow">
          {/*
            Both branches now carry a key (261003-i4t, D-05): the unfiltered
            reading used to be a bare `{numberOfGames}` with no t() call at
            all, and now appends "games" the same way the filtered branch
            does, so a growing digit count never shuffles the word sideways
            inconsistently between the two states (see `tabular-nums` below).

            With nothing active an unfiltered library's shown count IS its
            total, so "394 games" is correct, not "394 of 394 games" noise.

            With something active the bare count is actively misleading: it
            is the size of the ALREADY-FILTERED list sitting beside a title
            that still reads "All Games", so `6` is indistinguishable from a
            six-game library. The denominator is the discriminator.

            Interpolated on `shown` / `total`. The name `count` is reserved by
            i18next and would trigger plural key resolution (`_one`/`_other`),
            neither of which exists in the catalog. Literal key AND literal
            default on both, because i18next-parser resolves nothing else.
          */}
          <AddGameButton iconOnly />
          {activeFilterCount > 0 ? (
            <span className="numberOfgames numberOfgames--filtered">
              {tGamelib(
                'gamelib:library.header.filteredOfTotal',
                '{{shown}} of {{total}} games',
                { shown: numberOfGames, total: totalGames }
              )}
            </span>
          ) : (
            <span className="numberOfgames">
              {tGamelib(
                'gamelib:library.header.totalGames',
                '{{total}} games',
                {
                  total: numberOfGames
                }
              )}
            </span>
          )}
          <button
            className={classNames('Header__utilityButton', {
              active: refreshing
            })}
            title={t('generic.library.refresh', 'Refresh Library')}
            onClick={async () =>
              refreshLibrary({
                checkForUpdates: true,
                origin: 'action-icons-refresh-button'
              })
            }
          >
            <FontAwesomeIcon
              className={classNames({ ['fa-spin']: refreshing })}
              data-tour="library-refresh"
              icon={faSyncAlt}
            />
          </button>
          {/*
            `!refreshing` is load-bearing, not a tidy-up. This spinner and
            the refresh button above render the SAME faSyncAlt glyph, and
            `isSteamSyncing`'s first arm is `refreshing && refreshingInThe-
            Background`, so a refresh click lit both and the operator saw
            two identical icons spinning side by side.

            All three signals survive the gate -- exactly one spinner in
            every state, and none lost:
              - global refresh          -> the BUTTON spins (this hidden)
              - background metadata sync, no foreground refresh -> this one
              - scoped per-runner refresh                       -> this one

            That last case is why `isSteamSyncing` itself must NOT be
            simplified and none of its three OR arms removed: a
            single-runner login/logout refresh never flips the two global
            flags, it writes `refreshingByRunner` (see the comment on the
            definition above, and debug/login-logout-wipes-library). Gating
            the RENDER is safe; narrowing the CONDITION would silently drop
            that feedback again.
          */}
          {isSteamSyncing && !refreshing && (
            <FontAwesomeIcon
              icon={faSyncAlt}
              className="steamSyncSpinner"
              title={t('steam.syncing', 'Syncing Steam library…')}
              style={{ fontSize: '14px' }}
            />
          )}
        </div>
        {showStaleIndicator && (
          <span className="steamStaleIndicator">
            {t('steam.lastSynced', 'Steam library last synced {{time}} ago', {
              time: staleTime
            })}
          </span>
        )}
      </div>
    </div>
  )
}
