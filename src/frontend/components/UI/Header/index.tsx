import LibrarySearchBar from '../LibrarySearchBar'
import FilterViewList from '../NavShell/components/FilterViewList'
import FilterCollectionList from '../NavShell/components/FilterCollectionList'
import FilterStoreFacet from '../NavShell/components/FilterStoreFacet'
import FilterRunnabilityFacet from '../NavShell/components/FilterRunnabilityFacet'
import FilterMoreGroup from '../NavShell/components/FilterMoreGroup'
import './index.css'

export default function Header() {
  return (
    <div className="Header">
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
