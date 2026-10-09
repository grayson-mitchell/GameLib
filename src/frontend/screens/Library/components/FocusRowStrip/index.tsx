import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronLeft,
  faChevronRight
} from '@fortawesome/free-solid-svg-icons'
import { FocusRowSelection, GameInfo, Runner } from 'common/types'
import { FilterEngineDeps, FilterMode } from 'frontend/types'
import ContextProvider from 'frontend/state/ContextProvider'
import { runnabilityLabel } from 'frontend/components/UI/NavShell/components/FilterRunnabilityFacet'
import GamesList from '../GamesList'
import { PRESET_UNCATEGORIZED } from '../../filterEngine'
import { RunnerToStore } from '../../facetLabels'
import { selectFocusRowGames } from './focusRowSelectors'
import {
  TrackMeasurement,
  canScrollBack,
  canScrollForward,
  createNextFrameRunner,
  createStripCardWidthSync,
  measureCardPitch,
  pageScrollDelta,
  readScrollerAllowance,
  scrollFocusedCardIntoViewHorizontally,
  type StripLayoutContext
} from './focusRowOverflow'
import './index.css'

interface Props {
  focusRow: FocusRowSelection
  libraryUnion: GameInfo[]
  deps: FilterEngineDeps
  showHidden: FilterMode
  /** Whether the grid below is mounted (G-48-11c): the strip holds the grid's scrollbar allowance while it is not. */
  gridShown: boolean
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
  gridShown,
  handleModal
}: Props) {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const trackRef = useRef<HTMLDivElement | null>(null)
  const { activeController } = useContext(ContextProvider)
  const [measure, setMeasure] = useState<TrackMeasurement>({
    clientWidth: 0,
    scrollWidth: 0,
    scrollLeft: 0
  })

  // One width sync per mount (G-48-8c): it keeps the write history that stops
  // a resize feedback loop, so it must not be re-created per render.
  const [syncCardWidth] = useState(() => createStripCardWidthSync())

  // G-48-11c: `gridShown` reaches the sync through a ref, so the observer's
  // next-frame runner (built once per effect run) reads the live value. Declared
  // before the sync effect: layout effects run in order, so the ref is current
  // by the time it is read.
  const gridShownRef = useRef(gridShown)
  useLayoutEffect(() => {
    gridShownRef.current = gridShown
  })
  const [layoutContext] = useState(
    (): StripLayoutContext => ({
      gridShown: () => gridShownRef.current,
      scrollbarAllowance: readScrollerAllowance
    })
  )

  const games = useMemo(
    () => selectFocusRowGames(libraryUnion, focusRow, showHidden, deps),
    [libraryUnion, focusRow, showHidden, deps]
  )
  const hasGames = games.length > 0

  const readMeasurement = useCallback(() => {
    const track = trackRef.current
    if (!track) {
      return
    }
    const next = {
      clientWidth: track.clientWidth,
      scrollWidth: track.scrollWidth,
      scrollLeft: track.scrollLeft
    }
    setMeasure((prev) =>
      prev.clientWidth === next.clientWidth &&
      prev.scrollWidth === next.scrollWidth &&
      prev.scrollLeft === next.scrollLeft
        ? prev
        : next
    )
  }, [])

  // Match the strip's card width to the grid's column width (G-48-8c, the
  // 2026-10-07 ruling amending D-01) before the first paint, so there is no
  // 156px-then-wide flash. The ResizeObserver below keeps it current.
  useLayoutEffect(() => {
    syncCardWidth(trackRef.current, undefined, layoutContext)
  }, [hasGames, games, syncCardWidth, layoutContext, gridShown])

  // Keep `measure` current: on resize of the track or of its content, and
  // on every scroll. The track only exists while the pick resolves to games,
  // so the effect re-arms when that flips.
  //
  // The observer callback only reads and requests a next-frame sync
  // (G-48-11a, WR-01): writing `--focus-row-card-width` inside the callback
  // resizes the observed track within the delivery that reported it, which the
  // browser reports as a `ResizeObserver loop` error. The write happens in the
  // frame instead; first paint is still matched by the layout effect above.
  useEffect(() => {
    const track = trackRef.current
    if (!track) {
      return
    }
    readMeasurement()
    track.addEventListener('scroll', readMeasurement, { passive: true })
    const frame = createNextFrameRunner(() => {
      syncCardWidth(track, undefined, layoutContext)
      readMeasurement()
    })
    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        readMeasurement()
        frame.request()
      })
      observer.observe(track)
      if (track.firstElementChild) {
        observer.observe(track.firstElementChild)
      }
    }
    return () => {
      track.removeEventListener('scroll', readMeasurement)
      observer?.disconnect()
      frame.cancel()
    }
  }, [hasGames, games, readMeasurement, syncCardWidth, layoutContext])

  // Gamepad focus is a scripted `.focus()` onto a card; bring it fully into
  // view along the track's own `scrollLeft`. Gated on `activeController` the
  // same way `GamesList`'s vertical handler is, so it does not fight pointer
  // or keyboard focus.
  useEffect(() => {
    const track = trackRef.current
    if (!track || !activeController) {
      return
    }
    track.addEventListener('focus', scrollFocusedCardIntoViewHorizontally, {
      capture: true
    })
    return () => {
      track.removeEventListener(
        'focus',
        scrollFocusedCardIntoViewHorizontally,
        {
          capture: true
        }
      )
    }
  }, [hasGames, activeController])

  const page = (direction: 1 | -1) => {
    const track = trackRef.current
    if (!track) {
      return
    }
    const m = {
      clientWidth: track.clientWidth,
      scrollWidth: track.scrollWidth,
      scrollLeft: track.scrollLeft
    }
    track.scrollBy({
      left: direction * pageScrollDelta(m, measureCardPitch(track)),
      behavior: 'smooth'
    })
  }

  if (!hasGames) {
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

  // Neither control mounts when the content fits -- not even disabled. Once
  // scrolling is possible in either direction both mount, and the one at the
  // end of its travel is natively `disabled`.
  const forwardEnabled = canScrollForward(measure)
  const backEnabled = canScrollBack(measure)
  const showControls = forwardEnabled || backEnabled

  return (
    <div className="focusRowStrip">
      <div className="library-section-header">
        <h3 className="libraryHeader" title={label}>
          {label}
        </h3>
      </div>
      <div className="focusRowStrip__viewport">
        {showControls && (
          <button
            type="button"
            className="focusRowStrip__control focusRowStrip__control--back"
            aria-label={tGamelib(
              'gamelib:library.filterPanel.focusRowPrevious',
              'Show previous games'
            )}
            disabled={!backEnabled}
            onClick={() => page(-1)}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
        )}
        <div className="focusRowTrack" ref={trackRef}>
          <GamesList
            library={games}
            handleGameCardClick={handleModal}
            isRecent={isRecentView}
            isFavourite={isFavouriteView}
          />
        </div>
        {showControls && (
          <button
            type="button"
            className="focusRowStrip__control focusRowStrip__control--forward"
            aria-label={tGamelib(
              'gamelib:library.filterPanel.focusRowNext',
              'Show more games'
            )}
            disabled={!forwardEnabled}
            onClick={() => page(1)}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        )}
      </div>
    </div>
  )
}

export default React.memo(FocusRowStrip)
