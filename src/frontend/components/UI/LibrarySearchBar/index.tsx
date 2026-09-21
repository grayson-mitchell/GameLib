import { useContext } from 'react'
import SearchBar from '../SearchBar'
import { useTranslation } from 'react-i18next'
import LibraryContext from 'frontend/screens/Library/LibraryContext'

export default function LibrarySearchBar() {
  const { handleSearch, filterText } = useContext(LibraryContext)
  const { t } = useTranslation()

  const onInputChanged = (text: string) => {
    handleSearch(text)
  }

  return (
    <div data-tour="library-search">
      <SearchBar
        onInputChanged={onInputChanged}
        value={filterText}
        placeholder={t('search', 'Search for Games')}
      />
    </div>
  )
}
