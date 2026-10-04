import React, { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FocusRowSelection, GameInfo, Runner } from 'common/types'
import { FilterEngineDeps, FilterMode } from 'frontend/types'
import { runnabilityLabel } from 'frontend/components/UI/NavShell/components/FilterRunnabilityFacet'
import GamesList from '../GamesList'
import { PRESET_UNCATEGORIZED } from '../../filterEngine'
import { RunnerToStore } from '../../facetLabels'
import { selectFocusRowGames } from './focusRowSelectors'

interface Props {
  focusRow: FocusRowSelection
  libraryUnion: GameInfo[]
  deps: FilterEngineDeps
  showHidden: FilterMode
  handleModal: (appName: string, runner: Runner, gameInfo: GameInfo) => void
}

/**
 * The single focus row above the grid (Phase 48 Plan 02, Task 3). Replaces
 * both the old `RecentlyPlayed` lane and the old Favourites lane -- there is
 * exactly one of these mounted, driven by the persisted `focusRow` pick
 * (Task 1), and it owns none of the context `RecentlyPlayed` used to read
 * directly: everything it needs is already in scope at the call site in
 * `Library/index.tsx`, including `deps.recentAppNames`, which is kept live
 * by that file's own subscription (`:228-242`).
 *
 * Zero-match render contract: a pick that resolves to no games -- a deleted
 * collection, a signed-out store, an empty recent list, or no focus row set
 * at all -- renders nothing at all. No header, no message, no placeholder.
 * Reused directly from `RecentlyPlayed/index.tsx`'s own `if (!x.length)
 * return null` idiom.
 */
function FocusRowStrip({
  focusRow,
  libraryUnion,
  deps,
  showHidden,
  handleModal
}: Props) {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const trackRef = useRef<HTMLDivElement | null>(null)

  const games = useMemo(
    () => selectFocusRowGames(libraryUnion, focusRow, showHidden, deps),
    [libraryUnion, focusRow, showHidden, deps]
  )

  if (!games.length) {
    return null
  }

  // The echoed header label. Always the pick's own already-translated
  // string, verbatim -- no new key, no second casing convention (CONTEXT
  // D-12, UI-SPEC E5). Collection names are user data and render as text
  // only, never through dangerouslySetInnerHTML and never into an
  // href/src.
  let label = ''
  if (focusRow?.kind === 'view') {
    switch (focusRow.value) {
      case 'all':
        label = tGamelib('gamelib:library.filterPanel.viewAll', 'All games')
        break
      case 'installed':
        label = tGamelib(
          'gamelib:library.filterPanel.viewInstalled',
          'Installed'
        )
        break
      case 'recentlyPlayed':
        label = tGamelib(
          'gamelib:library.filterPanel.viewRecentlyPlayed',
          'Recently played'
        )
        break
      case 'favourites':
        label = tGamelib(
          'gamelib:library.filterPanel.viewFavourites',
          'Favourites'
        )
        break
      default:
        label = ''
    }
  } else if (focusRow?.kind === 'collection') {
    label =
      focusRow.value === PRESET_UNCATEGORIZED
        ? t('header.uncategorized', 'Uncategorized')
        : focusRow.value
  } else if (focusRow?.kind === 'store') {
    label =
      focusRow.value === 'sideload'
        ? tGamelib('gamelib:library.storeOther', 'Other')
        : RunnerToStore[focusRow.value]
  } else if (focusRow?.kind === 'runnability') {
    label = runnabilityLabel(
      focusRow.value as Parameters<typeof runnabilityLabel>[0],
      tGamelib
    )
  }

  const isRecentView =
    focusRow?.kind === 'view' && focusRow.value === 'recentlyPlayed'
  const isFavouriteView =
    focusRow?.kind === 'view' && focusRow.value === 'favourites'

  return (
    <div className="focusRowStrip">
      <div className="library-section-header">
        <h3 className="libraryHeader" title={label}>
          {label}
        </h3>
      </div>
      <div className="focusRowStrip__viewport">
        {/* Declared now and left otherwise unused in this plan -- plan 48-04
            attaches the overflow controls and the horizontal gamepad
            handler to it. */}
        <div className="focusRowTrack" ref={trackRef}>
          <GamesList
            library={games}
            handleGameCardClick={handleModal}
            isRecent={isRecentView}
            isFavourite={isFavouriteView}
          />
        </div>
      </div>
    </div>
  )
}

export default React.memo(FocusRowStrip)
