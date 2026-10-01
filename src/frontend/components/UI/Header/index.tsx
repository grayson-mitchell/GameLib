import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTv } from '@fortawesome/free-solid-svg-icons'
import LibrarySearchBar from '../LibrarySearchBar'
import FilterViewList from '../NavShell/components/FilterViewList'
import FilterCollectionList from '../NavShell/components/FilterCollectionList'
import FilterStoreFacet from '../NavShell/components/FilterStoreFacet'
import FilterRunnabilityFacet from '../NavShell/components/FilterRunnabilityFacet'
import FilterMoreGroup from '../NavShell/components/FilterMoreGroup'
import './index.css'

export default function Header() {
  const { t } = useTranslation()
  const consoleModeLabel = t('sidebar.console', 'Console Mode')

  return (
    <div className="Header">
      <div className="Header__utilities">
        <Link
          to="/console"
          className="Header__consoleButton"
          aria-label={consoleModeLabel}
          title={consoleModeLabel}
        >
          <FontAwesomeIcon icon={faTv} />
        </Link>
      </div>
      <div className="Header__search">
        <LibrarySearchBar />
      </div>
      <div
        className="Header__categoriesGroup"
        data-tour="library-views-collections"
      >
        <FilterViewList />
        <FilterCollectionList />
      </div>
      <div className="Header__filtersGroup" data-tour="library-facets">
        <FilterStoreFacet />
        <FilterRunnabilityFacet />
        <FilterMoreGroup />
      </div>
    </div>
  )
}
