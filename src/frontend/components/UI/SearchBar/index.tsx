import { Fragment, useCallback, useEffect, useRef } from 'react'
import './index.scss'
import { faSearch, faSpinner, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

interface Props {
  suggestionsListItems?: JSX.Element[]
  onInputChanged: (text: string) => void
  value: string
  placeholder: string
  /** Swaps the searchButton-slot icon for a spinner in the same DOM
   * position (Phase 20 STORESEARCH-02/D-11 debounce affordance) — optional,
   * defaults to false so existing callers (Discounts, WineManager) are
   * unaffected. */
  loading?: boolean
}

export default function SearchBar({
  suggestionsListItems,
  onInputChanged,
  value,
  placeholder,
  loading = false
}: Props) {
  const input = useRef<HTMLInputElement>(null)

  // we have to use an event listener instead of the react
  // onChange callback so it works with the virtual keyboard
  useEffect(() => {
    if (input.current) {
      const element = input.current
      element.value = value
      const handler = () => {
        onInputChanged(element.value)
      }
      element.addEventListener('input', handler)
      return () => {
        element.removeEventListener('input', handler)
      }
    }
    return
  }, [input, value, onInputChanged])

  // Sync external value changes (e.g., a reset button) into the uncontrolled
  // input. The effect above only runs on mount, so without this a caller
  // clearing the value wouldn't clear the visible text.
  useEffect(() => {
    if (input.current && input.current.value !== value) {
      input.current.value = value
    }
  }, [value])

  const onClear = useCallback(() => {
    onInputChanged('')
    if (input.current) {
      input.current.value = ''
      input.current.focus()
    }
  }, [onInputChanged])

  return (
    <div className="SearchBar" data-testid="searchBar">
      {/* Padding lives in index.scss's `.searchButton`, not here. An inline
          `style={{ padding: 'var(--space-2xs) var(--space-sm)' }}` used to sit
          on this element; inline styles beat any selector, so it silently
          shadowed that rule (leaving it dead code) and doubled the icon's
          horizontal padding to 12px a side -- the "massive margin before the
          magnifying glass and after" reported against the Games filter panel.
          Both `loading` states resolve to the same `.searchButton` class, so
          the spinner and the glass still occupy identical boxes and neither
          jumps when they swap. */}
      <FontAwesomeIcon
        className={loading ? 'searchButton fa-spin-pulse' : 'searchButton'}
        tabIndex={-1}
        icon={loading ? faSpinner : faSearch}
      />
      <input
        ref={input}
        data-testid="searchInput"
        placeholder={placeholder}
        // this id is used for the virtualkeyboard, don't change it,
        // if this must be changed, reflect the change in src/helpers/virtualKeyboard.ts#searchInput
        // and in src/helpers/gamepad.ts#isSearchInput
        id="search"
        className="searchBarInput"
      />
      {value.length > 0 && (
        <>
          <ul className="autoComplete">
            {suggestionsListItems &&
              suggestionsListItems.length > 0 &&
              suggestionsListItems.map((li, idx) => (
                <Fragment key={idx}>{li}</Fragment>
              ))}
          </ul>

          <button className="clearSearchButton" onClick={onClear} tabIndex={-1}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </>
      )}
    </div>
  )
}
