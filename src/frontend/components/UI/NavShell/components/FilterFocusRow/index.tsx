import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import type { FocusRowKind } from 'common/types'
import type {
  LibraryView,
  RunnabilityTier,
  StoreFacetValue
} from 'frontend/types'
import ContextProvider from 'frontend/state/ContextProvider'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
import { PRESET_UNCATEGORIZED } from 'frontend/screens/Library/filterEngine'
import { RunnerToStore } from 'frontend/screens/Library/facetLabels'
import FilterFacetGroup from '../FilterFacetGroup'
import { runnabilityLabel } from '../FilterRunnabilityFacet'
import NavItem from '../NavItem'
import './index.scss'

/**
 * FOCUS ROW panel section (48-02 Task 2, widened by 48-03 Task 1) -- four
 * fixed-order sub-groups: Views, Collections, Store, Runnability (the same
 * top-to-bottom order the panel itself uses above this section). The overflow
 * controls are plan 48-04.
 *
 * Views is ungated and always contributes its four rows, so the section can
 * never render empty. Collections, Store and Runnability are each omitted
 * wholesale -- divider label included -- when their source list is empty, the
 * convention `FilterStoreFacet`'s `return null` applies one level up. No
 * empty-state message is ported from `FilterCollectionList`: that message
 * belongs to the collection MANAGEMENT surface, not to a picker.
 *
 * Reads `focusRow` / `handleFocusRow` and the collection list from
 * `ContextProvider`, NOT `LibraryContext` -- the focus row is a persisted,
 * cross-view pick, independent of the live `libraryView` /
 * `currentCollection` filter state `LibraryContext` carries (SPEC R4). The
 * store and runnability lists ARE read from `LibraryContext`, as
 * `FilterStoreFacet` / `FilterRunnabilityFacet` already do from this same
 * portalled position. `runnabilityRows` is empty on a Windows host by
 * design, so that sub-group uses the same omit-when-empty rule as Store.
 *
 * Collections are READ ONLY here: the category-listing accessor is the only
 * access to `customCategories`. `games.customCategories` has one writer
 * (`CategoriesManager`) and a second one would corrupt its state silently.
 * Collection names are user data, rendered as a text child and a `title`
 * attribute only, never translated and never used as a `t()` key.
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
  const { focusRow, handleFocusRow, customCategories } =
    useContext(ContextProvider)
  const { connectedStores, runnabilityRows } = useContext(LibraryContext)
  const { t: tGamelib } = useTranslation('gamelib')
  const { t } = useTranslation()

  const categories = customCategories.listCategories()

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

  // `value === 'sideload'` is special-cased BEFORE the brand map is consulted:
  // `RunnerToStore` deliberately has no `sideload` entry (facetLabels.ts), and
  // copying `FilterStoreFacet`'s split keeps both surfaces on one label source.
  const storeLabel = (value: StoreFacetValue) =>
    value === 'sideload'
      ? tGamelib('gamelib:library.storeOther', 'Other')
      : RunnerToStore[value]

  const row = (kind: FocusRowKind, value: string, label: string) => (
    <NavItem
      key={`${kind}:${value}`}
      elementType="button"
      className="FilterFocusRow__row"
      label={label}
      // `NavItem` takes no `title` prop and wraps its label in a bare
      // `<span>`, so the full, untruncated label rides on an inner span: a
      // one-line ellipsis that hides a user-authored collection name with no
      // way to read it is worse than a wrap.
      labelElement={<span title={label}>{label}</span>}
      active={focusRow?.kind === kind && focusRow.value === value}
      onClick={() => selectFocusRow(kind, value)}
    />
  )

  return (
    <FilterFacetGroup
      title={tGamelib('gamelib:library.filterPanel.focusRow', 'Focus row')}
      className="FilterFocusRow"
    >
      <span className="FilterFocusRow__divider">
        {tGamelib('gamelib:library.filterPanel.focusRowViewsGroup', 'Views')}
      </span>
      {viewRows.map((view) => row('view', view.value, view.label))}
      {categories.length > 0 && (
        <>
          <span className="FilterFocusRow__divider">
            {tGamelib('gamelib:library.filterPanel.collections', 'Collections')}
          </span>
          {categories.map((category) => row('collection', category, category))}
          {row(
            'collection',
            PRESET_UNCATEGORIZED,
            // Literal call site: keeps `header.uncategorized` reachable by the
            // static extractor, which `chipLabels.ts` depends on.
            t('header.uncategorized', 'Uncategorized')
          )}
        </>
      )}
      {connectedStores.length > 0 && (
        <>
          <span className="FilterFocusRow__divider">
            {tGamelib('gamelib:library.filterPanel.storeGroup', 'Store')}
          </span>
          {connectedStores.map((store: StoreFacetValue) =>
            row('store', store, storeLabel(store))
          )}
        </>
      )}
      {runnabilityRows.length > 0 && (
        <>
          <span className="FilterFocusRow__divider">
            {tGamelib(
              'gamelib:library.filterPanel.runnabilityGroup',
              'Runnability'
            )}
          </span>
          {runnabilityRows.map((tier: RunnabilityTier) =>
            row('runnability', tier, runnabilityLabel(tier, tGamelib))
          )}
        </>
      )}
    </FilterFacetGroup>
  )
}
