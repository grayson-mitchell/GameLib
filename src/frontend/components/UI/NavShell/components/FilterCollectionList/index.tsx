import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import ContextProvider from 'frontend/state/ContextProvider'
import LibraryContext from 'frontend/screens/Library/LibraryContext'
import NavItem from '../NavItem'
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
 * D-18: this section's own header is a NEW panel-only key ("Collections").
 * The `CategoriesManager` dialog these action rows open keeps its existing
 * `categories-manager.*` strings ("Manage Categories") untouched -- the
 * wording mismatch between panel and dialog is the decided outcome, not a
 * bug. D-19: membership is manual only -- nothing here evaluates a
 * condition or expression to populate a row; every row comes from what the
 * user already assigned in `CategoriesManager`. D-20: `+ New collection`
 * and `Manage collections` only launch the dialog via its show-setter --
 * neither adds, renames nor deletes a category itself.
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
    <section className="FilterCollectionList">
      <span className="FilterCollectionList__header">
        {tGamelib('gamelib:library.filterPanel.collections', 'Collections')}
      </span>
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
        key="preset_uncategorized"
        elementType="button"
        className="FilterCollectionList__row"
        label={t('header.uncategorized', 'Uncategorized')}
        active={currentCollection === 'preset_uncategorized'}
        onClick={() => selectCollection('preset_uncategorized')}
      />
      <NavItem
        elementType="button"
        className="FilterCollectionList__row"
        label={tGamelib(
          'gamelib:library.filterPanel.newCollection',
          '+ New collection'
        )}
        onClick={() => setShowCategories(true)}
      />
      <NavItem
        elementType="button"
        className="FilterCollectionList__row"
        label={tGamelib(
          'gamelib:library.filterPanel.manageCollections',
          'Manage collections'
        )}
        onClick={() => setShowCategories(true)}
      />
    </section>
  )
}
