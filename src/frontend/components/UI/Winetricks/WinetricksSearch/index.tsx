import { useEffect, useRef, useState } from 'react'
import SearchBar from '../../SearchBar'
import { useTranslation } from 'react-i18next'

interface Props {
  allComponents: string[]
  installed: string[]
  onInstallClicked: (component: string) => void
}

export default function WinetricksSearchBar({
  allComponents,
  installed,
  onInstallClicked
}: Props) {
  const { t } = useTranslation()

  // handles the search input and results list
  const [search, setSearch] = useState('')
  const onInputChanged = (text: string) => {
    setSearch(text)
  }
  const [searchResults, setSearchResults] = useState<string[]>([])

  useEffect(() => {
    if (search.length < 2) {
      setSearchResults([])
    } else {
      let filtered = allComponents.filter((component) =>
        component.includes(search)
      )
      filtered = filtered.filter((component) => !installed?.includes(component))
      setSearchResults(filtered)
    }
  }, [search])

  const install = (component: string) => {
    setSearch('')
    onInstallClicked(component)
  }

  // MOUSE-CLICK RACE FIX (Phase 35 Plan 25, closing REQ-35-16 winetricks clause /
  // 35-VERIFICATION.md gap 2). Live-measured via an instrumented `pnpm tauri:dev`
  // build: a real mouse click's `mousedown` correctly targets this button while the
  // search input is still focused, but ~4ms later ALL suggestion `<li>` elements are
  // removed from the DOM as a single batch (a parent-driven remount of this whole
  // component -- see `Winetricks/index.tsx`'s `installing`/`loadingInstalled`
  // conditionals gating the block this component mounts under -- not a partial
  // re-filter, not a CSS `:focus-within` collapse, and not `declined` gating). The
  // corresponding `mouseup` then lands ~64ms later on a completely different element
  // exposed by the remount (the underlying progress dialog), so no `click` event is
  // ever synthesized and `onInstallClicked` never fires. `document.activeElement`
  // stays on the search input throughout, ruling out a focus/blur-driven collapse of
  // this list -- the SearchBar-level `onMouseDown={preventDefault()}` guard in
  // `../index.tsx` remains correct as independent defence-in-depth (see the retracted
  // -claim comment there) but does not address this failure mode, because focus is
  // never actually lost during the vulnerable window.
  //
  // Keyboard activation (Tab + Enter/Space) is unaffected: it dispatches `click`
  // directly against the still-focused element with no positional hit-test, so it
  // cannot be raced out by an intervening DOM remount the way a mouse mousedown ->
  // mouseup pair can.
  //
  // Fix: capture install intent on `mousedown`, before the remount has a chance to
  // occur, instead of waiting for `click` (which depends on `mouseup` re-hit-testing
  // the same element). `onClick` is kept for keyboard activation and suppressed for
  // the mouse path via `suppressNextClick` so a real click that DOES land (no race
  // this time) does not double-invoke.
  const suppressNextClick = useRef(false)

  const suggestions = searchResults.map((component) => {
    return (
      <li key={component}>
        <span>{component}</span>
        <button
          className="button"
          onMouseDown={(e) => {
            e.preventDefault()
            suppressNextClick.current = true
            install(component)
          }}
          onClick={() => {
            if (suppressNextClick.current) {
              suppressNextClick.current = false
              return
            }
            install(component)
          }}
        >
          {t('winetricks.install', 'Install')}
        </button>
      </li>
    )
  })

  return (
    <SearchBar
      suggestionsListItems={suggestions}
      onInputChanged={onInputChanged}
      value={search}
      placeholder={t('winetricks.search', 'Search fonts or components')}
    />
  )
}
