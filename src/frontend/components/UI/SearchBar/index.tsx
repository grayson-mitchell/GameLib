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
          {/* FOCUS RACE mitigation (Phase 34.6 Plan 16). Keep this handler: the
              mechanism below is real, independently of what caused any particular bug.

              `index.scss` renders this list ONLY while the search bar has focus:
              `.autoComplete { display: none }` plus `&:focus-within ul.autoComplete
              { display: block }`. Without the guard below, clicking anything inside
              the list destroys the thing being clicked, mid-click:

                1. mousedown inside the list blurs the `<input>` above
                2. the mousedown target does not take focus in its place -- an `<li>`
                   is not focusable in any engine, and macOS/WebKit does not focus a
                   `<button>` on click either
                3. `:focus-within` goes false, so this `<ul>` flips to `display: none`
                4. mouseup therefore lands somewhere else, and a `click` event only
                   fires when mousedown and mouseup share a target -- so the item's
                   own `onClick` NEVER RUNS

              The failure is completely silent and reads as a dead button.

              ⚠ CAUSAL CLAIM RETRACTED (34.6-REVIEW.md WR-03, corrected 2026-08-26).
              This comment previously stated that the above was "the cause of live-gate
              Step 4's FAIL" and that this was "proven by measurement". **It is not
              established, and two separate live runs contradict it.** Plan 34.6-17's
              re-drive shipped this guard, verified it in the running bundle, and the
              winetricksInstall button was STILL dead to the mouse -- so the theory was
              withdrawn as DISPROVEN. The 2026-08-26 Step 4 re-drive then passed via a
              different route entirely: repeated searching, hovering, and a selection the
              panel is slow to commit (see `34.6-LIVE-GATE.md` § SUPERSEDES and
              the winetricks selection-UI todo dated 2026-08-26). Treat the four steps above as a real
              mechanism worth guarding, NOT as a closed root-cause explanation for any
              dead-button report.

              `preventDefault()` on mousedown suppresses only the focus change, so the
              input keeps focus, `:focus-within` holds, the list stays mounted and the
              click completes normally. The cost is that text inside the list is no
              longer selectable by dragging -- correct for a suggestions list.

              This is the shared primitive: `LibrarySearchBar` also passes clickable
              `<li onClick=...>` suggestions, so it carried the identical defect. */}
          <ul className="autoComplete" onMouseDown={(e) => e.preventDefault()}>
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
