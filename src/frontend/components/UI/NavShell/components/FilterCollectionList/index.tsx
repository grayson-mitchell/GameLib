import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import ContextProvider from 'frontend/state/ContextProvider'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
// CR-04: the sentinel is a shared constant, not a literal repeated per
// call site -- chipLabels.ts previously did not recognise it and printed it
// raw in the chip row while this component rendered "Uncategorized".
import { PRESET_UNCATEGORIZED } from 'frontend/screens/Library/filterEngine'
import NavItem from '../NavItem'
import FilterFacetGroup from '../FilterFacetGroup'
import './index.scss'

/**
 * Collections section (34.11-06 Task 2, D-17/D-18/D-19/D-20/D-21,
 * REQ-34.11-08) -- sits directly below `FilterViewList` in the Games
 * tier-2 filter panel.
 *
 * Rows are the VERBATIM output of `customCategories`' category-listing
 * accessor plus the literal 'preset_uncategorized' pseudo-category (D-17) -- no
 * migration, no derived collection, no second store. Single-select, mirrors
 * `FilterViewList`'s row shape exactly (extended `NavItem`s, D-21), but
 * unlike Views a collection CAN be cleared: re-clicking the active row
 * calls `setCurrentCollection(null)` rather than re-selecting itself.
 *
 * 260815-nmq: the section is now a collapsible `FilterFacetGroup`, the same
 * wrapper Store / Runnability / More-filters already use, rather than an
 * always-open `<section>` with its own `<span>` header. The header text is
 * the SAME `gamelib:library.filterPanel.collections` key it always was --
 * only its rendering moved into the group's disclosure button, so no
 * catalogue entry changes and D-18 below still holds verbatim. Rows keep
 * `NavItem` (D-21) rather than converting to `FilterFacetRow`: collections
 * are single-select with a clearable active row, not checkboxes, and
 * `FilterFacetRow` carries `role="checkbox"` semantics that would be a lie
 * here.
 *
 * D-18: this section's own header is a NEW panel-only key ("Collections").
 * The `CategoriesManager` dialog these action rows open keeps its existing
 * `categories-manager.*` strings ("Manage Categories") untouched -- the
 * wording mismatch between panel and dialog is the decided outcome, not a
 * bug. D-19: membership is manual only -- nothing here evaluates a
 * condition or expression to populate a row; every row comes from what the
 * user already assigned in `CategoriesManager`. D-20: `+ New collection`
 * and `Manage collections` only launch the dialog via its show-setter --
 * neither adds, renames nor deletes a category itself. WR-08: the two rows
 * now open the dialog with different intents ('create' / 'manage') so they
 * are no longer the same action twice, while D-20 still holds verbatim --
 * neither row mutates a category itself.
 */
export default function FilterCollectionList() {
  const { customCategories } = useContext(ContextProvider)
  const { currentCollection, setCurrentCollection, setShowCategories } =
    useContext(LibraryContext)
  const { t: tGamelib } = useTranslation('gamelib')
  const { t } = useTranslation()

  const categories = customCategories.listCategories()

  const selectCollection = (value: string) => {
    setCurrentCollection(currentCollection === value ? null : value)
  }

  return (
    <FilterFacetGroup
      title={tGamelib('gamelib:library.filterPanel.collections', 'Collections')}
      className="FilterCollectionList"
    >
      {categories.length === 0 && (
        <span className="FilterCollectionList__empty">
          {t(
            'header.no_categories',
            'No custom categories. Add categories using each game menu.'
          )}
        </span>
      )}
      {categories.map((category) => (
        <NavItem
          key={category}
          elementType="button"
          className="FilterCollectionList__row"
          label={category}
          active={currentCollection === category}
          onClick={() => selectCollection(category)}
        />
      ))}
      <NavItem
        key={PRESET_UNCATEGORIZED}
        elementType="button"
        className="FilterCollectionList__row"
        // The literal t() call site here is what makes `header.uncategorized`
        // reachable by i18next-parser's static extractor. chipLabels.ts
        // returns the same key as DATA and resolves it dynamically, which is
        // only safe because this literal call site exists.
        label={t('header.uncategorized', 'Uncategorized')}
        active={currentCollection === PRESET_UNCATEGORIZED}
        onClick={() => selectCollection(PRESET_UNCATEGORIZED)}
      />
      <NavItem
        elementType="button"
        className="FilterCollectionList__row"
        label={tGamelib(
          'gamelib:library.filterPanel.newCollection',
          '+ New collection'
        )}
        onClick={() => setShowCategories(true, 'create')}
      />
      <NavItem
        elementType="button"
        className="FilterCollectionList__row"
        label={tGamelib(
          'gamelib:library.filterPanel.manageCollections',
          'Manage collections'
        )}
        onClick={() => setShowCategories(true, 'manage')}
      />
    </FilterFacetGroup>
  )
}
