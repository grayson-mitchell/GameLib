import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import type { FocusRowKind } from 'common/types'
import type { LibraryView } from 'frontend/types'
import ContextProvider from 'frontend/state/ContextProvider'
import FilterFacetGroup from '../FilterFacetGroup'
import NavItem from '../NavItem'
import './index.scss'

/**
 * FOCUS ROW panel section (48-02 Task 2) -- Views sub-group only.
 * Collections/stores/runnability picks are plan 48-03; the overflow controls
 * are plan 48-04.
 *
 * Reads `focusRow` / `handleFocusRow` from `ContextProvider` (Task 1's new
 * pair), NOT `LibraryContext` -- the focus row is a persisted, cross-view
 * pick, independent of the live `libraryView` / `currentCollection` filter
 * state `LibraryContext` carries (SPEC R4).
 *
 * `title` only on `FilterFacetGroup` -- no `selectedCount` /
 * `selectedCountLabel` -- following `FilterCollectionList/index.tsx`'s
 * precedent: a "1 selected" badge on a single-select section is noise
 * (UI-SPEC Panel Section Shape).
 *
 * Reusing `FilterFacetGroup` is not a D-09 violation: D-09 forbids adding a
 * *`Dropdown`-style select control*, and `FilterFacetGroup` is the
 * already-shipped disclosure every sibling group uses. The cascade D-09
 * actually guards (`FilterFacetGroup/index.scss:203-220`) is why this
 * component's own stylesheet carries the same `(0,4,0)` reset
 * `FilterCollectionList` does.
 *
 * Every row's label is a literal `tGamelib('gamelib:...', '...')` call site,
 * reusing the four existing keys verbatim from `FilterViewList/index.tsx` --
 * not a lookup against a key stored in data. `FilterViewList`'s own header
 * comment records a `{value, key, defaultText}` lookup array extracting
 * zero of four keys in a `pnpm i18n` run where literal call sites landed.
 *
 * `selectFocusRow` generalises `FilterCollectionList/index.tsx`'s
 * clear-by-reclick handler to the `{ kind, value }` shape `handleFocusRow`
 * takes, even though this task only ever calls it with `kind: 'view'` --
 * future sibling sub-groups (collection/store/runnability) reuse the same
 * handler shape.
 */
export default function FilterFocusRow() {
  const { focusRow, handleFocusRow } = useContext(ContextProvider)
  const { t: tGamelib } = useTranslation('gamelib')

  const selectFocusRow = (kind: FocusRowKind, value: string) => {
    handleFocusRow(
      focusRow?.kind === kind && focusRow?.value === value
        ? null
        : { kind, value }
    )
  }

  const viewRows: Array<{ value: LibraryView; label: string }> = [
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
    <FilterFacetGroup
      title={tGamelib('gamelib:library.filterPanel.focusRow', 'Focus row')}
      className="FilterFocusRow"
    >
      <span className="FilterFocusRow__divider">
        {tGamelib('gamelib:library.filterPanel.focusRowViewsGroup', 'Views')}
      </span>
      {viewRows.map((row) => (
        <NavItem
          key={row.value}
          elementType="button"
          className="FilterFocusRow__row"
          label={row.label}
          active={focusRow?.kind === 'view' && focusRow.value === row.value}
          onClick={() => selectFocusRow('view', row.value)}
        />
      ))}
    </FilterFacetGroup>
  )
}
