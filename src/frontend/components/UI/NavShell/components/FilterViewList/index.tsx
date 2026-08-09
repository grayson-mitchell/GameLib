import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
import type { LibraryView } from 'frontend/types'
import NavItem from '../NavItem'
import './index.scss'

/**
 * Views section (34.11-06 Task 1, D-05, REQ-34.11-05) -- the top-level of
 * the Games tier-2 filter panel, directly under the already-portalled
 * search box (D-34; search itself is not touched here).
 *
 * Four single-select rows bound to `LibraryContext`'s `libraryView` /
 * `setLibraryView` (34.11-04). Rows are extended `NavItem`s -- the button
 * branch with plan 02's `active` prop -- not a forked row component, so
 * this section and `FilterCollectionList` can never drift from the same
 * tier-2 row spec (`NavItem/index.scss`).
 *
 * Selecting the already-active row is intentionally idempotent: it calls
 * `setLibraryView` again with the same value rather than clearing back to
 * 'all'. Views therefore always have exactly one active row -- there is no
 * "off" state, unlike Collections (`FilterCollectionList`), where the
 * active row can be cleared by re-clicking it.
 */
const VIEW_ROWS: Array<{
  value: LibraryView
  key: string
  defaultText: string
}> = [
  {
    value: 'all',
    key: 'gamelib:library.filterPanel.viewAll',
    defaultText: 'All games'
  },
  {
    value: 'installed',
    key: 'gamelib:library.filterPanel.viewInstalled',
    defaultText: 'Installed'
  },
  {
    value: 'recentlyPlayed',
    key: 'gamelib:library.filterPanel.viewRecentlyPlayed',
    defaultText: 'Recently played'
  },
  {
    value: 'favourites',
    key: 'gamelib:library.filterPanel.viewFavourites',
    defaultText: 'Favourites'
  }
]

export default function FilterViewList() {
  const { libraryView, setLibraryView } = useContext(LibraryContext)
  const { t: tGamelib } = useTranslation('gamelib')

  return (
    <nav className="FilterViewList">
      {VIEW_ROWS.map((row) => (
        <NavItem
          key={row.value}
          elementType="button"
          className="FilterViewList__row"
          label={tGamelib(row.key, row.defaultText)}
          active={libraryView === row.value}
          onClick={() => setLibraryView(row.value)}
        />
      ))}
    </nav>
  )
}
