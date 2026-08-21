import React, { useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSyncAlt } from '@fortawesome/free-solid-svg-icons'
import ActionIcons from 'frontend/components/UI/ActionIcons'
import { GameInfo } from 'common/types'
import LibraryContext from '../../LibraryContext'
import ContextProvider from 'frontend/state/ContextProvider'
import './index.css'
import AddGameButton from '../AddGameButton'
import { countGamesExcludingDlc } from './gameCount'

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

export default React.memo(function LibraryHeader({ list, totalGames }: Props) {
  const { t } = useTranslation()
  // Dual hook, the same pattern `FilterChipRow` already uses: the shared
  // 'translation' namespace for this header's pre-existing copy, 'gamelib'
  // for the fork's own strings.
  const { t: tGamelib } = useTranslation('gamelib')
  const { showFavourites, activeFilterCount } = useContext(LibraryContext)
  const {
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
    <h5 className="libraryHeader" data-tour="library-header">
      <div className="libraryHeaderWrapper">
        <span className="libraryTitle">
          {showFavourites
            ? t('favourites', 'Favourites')
            : t('title.allGames', 'All Games')}
          {/*
            With nothing active this is BYTE-IDENTICAL to what shipped
            before: same element, same class, same content. The bare count is
            correct there -- an unfiltered library's shown count IS its
            total, and "318 of 318" would be noise.

            With something active the bare count is actively misleading: it
            is the size of the ALREADY-FILTERED list sitting beside a title
            that still reads "All Games", so `6` is indistinguishable from a
            six-game library. The denominator is the discriminator. The title
            itself is deliberately NOT rewritten (D7) -- `FilterChipRow` sits
            directly beneath enumerating every active filter by name, and a
            reworded title would collide with the showFavourites branch for
            no information the chips do not already give.

            Interpolated on `shown` / `total`. The name `count` is reserved by
            i18next and would trigger plural key resolution (`_one`/`_other`),
            neither of which exists in the catalog. Literal key AND literal
            default, because i18next-parser resolves nothing else.
          */}
          {activeFilterCount > 0 ? (
            <span className="numberOfgames numberOfgames--filtered">
              {tGamelib(
                'gamelib:library.header.filteredOfTotal',
                '{{shown}} of {{total}}',
                { shown: numberOfGames, total: totalGames }
              )}
            </span>
          ) : (
            <span className="numberOfgames">{numberOfGames}</span>
          )}
          {isSteamSyncing && (
            <FontAwesomeIcon
              icon={faSyncAlt}
              className="steamSyncSpinner"
              title={t('steam.syncing', 'Syncing Steam library…')}
              style={{ fontSize: '14px' }}
            />
          )}
          <AddGameButton data-tour="library-add-game" />
        </span>
        {showStaleIndicator && (
          <span className="steamStaleIndicator">
            {t('steam.lastSynced', 'Steam library last synced {{time}} ago', {
              time: staleTime
            })}
          </span>
        )}
        <div className="actionIconsWrapper">
          <ActionIcons />
        </div>
      </div>
    </h5>
  )
})
