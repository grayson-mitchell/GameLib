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
 * Every row's label is a literal `tGamelib('gamelib:...', '...')` call
 * site, not a lookup against a key stored in data -- `i18next-parser`'s
 * `JavascriptLexer` (the tool behind `pnpm i18n` / the `gamelib:` catalog)
 * only resolves string-literal first arguments; a call built from a
 * variable is invisible to it. Confirmed empirically for this exact file:
 * a first draft stored `{value, key, defaultText}` in a lookup array and
 * called `tGamelib(row.key, row.defaultText)` inside the row map --
 * `pnpm i18n` then added zero of these four keys to
 * `public/locales/en/gamelib.json`, while `FilterCollectionList`'s three
 * literal call sites landed correctly in the same run.
 *
 * Selecting the already-active row is intentionally idempotent: it calls
 * `setLibraryView` again with the same value rather than clearing back to
 * 'all'. Views therefore always have exactly one active row -- there is no
 * "off" state, unlike Collections (`FilterCollectionList`), where the
 * active row can be cleared by re-clicking it.
 */
export default function FilterViewList() {
  const { libraryView, setLibraryView } = useContext(LibraryContext)
  const { t: tGamelib } = useTranslation('gamelib')

  const rows: Array<{ value: LibraryView; label: string }> = [
    {
      value: 'all',
      label: tGamelib('gamelib:library.filterPanel.viewAll', 'All games')
    },
    {
      value: 'installed',
      label: tGamelib('gamelib:library.filterPanel.viewInstalled', 'Installed')
    },
    {
      value: 'recentlyPlayed',
      label: tGamelib(
        'gamelib:library.filterPanel.viewRecentlyPlayed',
        'Recently played'
      )
    },
    {
      value: 'favourites',
      label: tGamelib(
        'gamelib:library.filterPanel.viewFavourites',
        'Favourites'
      )
    }
  ]

  return (
    <nav className="FilterViewList">
      {rows.map((row) => (
        <NavItem
          key={row.value}
          elementType="button"
          className="FilterViewList__row"
          label={row.label}
          active={libraryView === row.value}
          onClick={() => setLibraryView(row.value)}
        />
      ))}
    </nav>
  )
}
