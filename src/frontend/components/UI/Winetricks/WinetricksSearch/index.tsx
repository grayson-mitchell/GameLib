import { useEffect, useState } from 'react'
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

  // TEMPORARY DIAGNOSTIC (Phase 34.6 Plan 16) — REMOVE once the cause is found.
  //
  // This button is dead to the MOUSE and works by KEYBOARD. Two hypotheses have already
  // been formed by reading this code and both were wrong (IPC transport, then a
  // `:focus-within` blur-unmount), so this measures the pointer sequence instead of
  // theorising about it. `logError` is send-kind and sends are proven working, so each
  // line lands in `gamelib.log` -- and, when `GAMELIB_TRACE_SEND=1`, also shows up as a
  // `send-trace: sidecar_send entered for 'logError'` line in the shell scrollback.
  //
  // Reading the result:
  //   mousedown + mouseup + click -> the click DOES fire; the defect is downstream, in
  //                                  `install()` or its guard
  //   mousedown + mouseup, NO click -> the element moved or unmounted between the two,
  //                                  so the pair no longer shares a target
  //   mousedown only -> the element goes away during the press
  //   nothing at all -> the button never receives the pointer sequence despite
  //                     hit-testing to it in DevTools
  const probe = (phase: string, component: string) => {
    window.api.logError(`[winetricks-probe] ${phase} component=${component}`)
  }

  const suggestions = searchResults.map((component) => {
    return (
      <li key={component}>
        <span>{component}</span>
        <button
          className="button"
          onMouseDown={() => probe('mousedown', component)}
          onMouseUp={() => probe('mouseup', component)}
          onPointerDown={() => probe('pointerdown', component)}
          onClick={() => {
            probe('click', component)
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
