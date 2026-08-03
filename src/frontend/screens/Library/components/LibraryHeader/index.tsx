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

type Props = {
  list: GameInfo[]
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

export default React.memo(function LibraryHeader({ list }: Props) {
  const { t } = useTranslation()
  const { showFavourites } = useContext(LibraryContext)
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

  const numberOfGames = useMemo(() => {
    if (!list) {
      return 0
    }
    // is_dlc is only applicable when the game is from legendary, but checking anyway doesn't cause errors and enable accurate counting in the 'ALL' game tab
    const dlcCount = list.filter(
      (lib) => lib.runner !== 'sideload' && lib.install.is_dlc
    ).length

    const total = list.length - dlcCount
    return total > 0 ? `${total}` : 0
  }, [list])

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

  const staleTime = syncedAt !== null ? formatRelativeTime(Date.now() - syncedAt) : ''

  return (
    <h5 className="libraryHeader" data-tour="library-header">
      <div className="libraryHeaderWrapper">
        <span className="libraryTitle">
          {showFavourites
            ? t('favourites', 'Favourites')
            : t('title.allGames', 'All Games')}
          <span className="numberOfgames">{numberOfGames}</span>
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
