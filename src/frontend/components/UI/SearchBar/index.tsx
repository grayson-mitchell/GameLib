import { useCallback, useLayoutEffect, useRef } from 'react'
import './index.scss'
import { faSearch, faSpinner, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

interface Props {
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
  onInputChanged,
  value,
  placeholder,
  loading = false
}: Props) {
  const input = useRef<HTMLInputElement>(null)

  // we have to use an event listener instead of the react
  // onChange callback so it works with the virtual keyboard
  //
  // Deliberately useLayoutEffect, not useEffect (library-search-typing-lag
  // debug session, 2026-09-21). This effect re-runs on every parent
  // re-render (LibrarySearchBar defines `onInputChanged` inline, so its
  // identity changes every time, and `value` also changes on every
  // keystroke) and unconditionally writes `element.value = value` using
  // the closed-over `value` from render time. With a plain `useEffect`,
  // that write is deferred to a passive-effect flush that runs on a later
  // task -- a real gap in which the browser can dispatch a *further*
  // native 'input' event (still routed to this effect's own,
  // not-yet-replaced listener) that advances the DOM ahead of `value`.
  // When the deferred effect then finally flushes, it stomps that
  // already-typed character back to the stale `value`, which is exactly
  // the "typing needs repeated attempts before it filters usably" symptom.
  // useLayoutEffect runs synchronously as part of the same commit, so
  // there is no task boundary for a native event to land in. Reproduced
  // and the fix verified in
  // src/frontend/components/UI/SearchBar/__tests__/searchBarTypingRace.test.ts.
  useLayoutEffect(() => {
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
  // input. Also useLayoutEffect, for the same reason as above: this effect
  // re-runs on every `value` change (i.e. every keystroke, not just an
  // external reset) and its guarded write is just as vulnerable to the
  // same stale-value rollback if deferred to a passive-effect task.
  useLayoutEffect(() => {
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
        <button className="clearSearchButton" onClick={onClear} tabIndex={-1}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      )}
    </div>
  )
}
