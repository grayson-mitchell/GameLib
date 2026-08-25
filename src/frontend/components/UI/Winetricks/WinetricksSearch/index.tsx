import { useEffect, useState } from 'react'
import SearchBar from '../../SearchBar'
import { useTranslation } from 'react-i18next'

interface Props {
  allComponents: string[]
  installed: string[]
  onInstallClicked: (component: string) => void
}

// TEMPORARY DIAGNOSTIC (Phase 34.6 Plan 16) — REMOVE with the rest of the probe.
// A row that reports its own MOUNT/UNMOUNT, so an unmount landing between the recorded
// mousedown and the missing mouseup is visible directly rather than inferred.
function ProbeRow({
  component,
  label,
  onInstallClicked
}: {
  component: string
  label: string
  onInstallClicked: (component: string) => void
}) {
  useEffect(() => {
    window.api.logError(`[winetricks-probe] row MOUNT component=${component}`)
    return () => {
      window.api.logError(
        `[winetricks-probe] row UNMOUNT component=${component}`
      )
    }
  }, [component])

  const probe = (phase: string) => {
    window.api.logError(`[winetricks-probe] ${phase} component=${component}`)
  }

  return (
    <li>
      <span>{component}</span>
      <button
        className="button"
        onPointerDown={() => probe('pointerdown')}
        onMouseDown={() => probe('mousedown')}
        onMouseUp={() => probe('mouseup')}
        onClick={() => {
          probe('click')
          onInstallClicked(component)
        }}
      >
        {label}
      </button>
    </li>
  )
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
  // TEMPORARY DIAGNOSTIC, round 2 (Phase 34.6 Plan 16).
  //
  // Round 1 measured: pointerdown and mousedown FIRE, then nothing -- no mouseup, no
  // click. So the element goes away during the press. Round 2 splits the last fork,
  // because the two possibilities need completely different fixes:
  //
  //   row UNMOUNT logged between mousedown and mouseup
  //     -> REACT removed it. A state change did this, and the render-state probe in
  //        the parent names which one.
  //   NO row UNMOUNT logged
  //     -> the node is still mounted and CSS is hiding or moving it, which puts us back
  //        in the `:focus-within` family -- and means the mousedown `preventDefault`
  //        guard is not actually suppressing the focus change under WKWebView.
  const suggestions = searchResults.map((component) => (
    <ProbeRow
      key={component}
      component={component}
      label={t('winetricks.install', 'Install')}
      onInstallClicked={install}
    />
  ))

  return (
    <SearchBar
      suggestionsListItems={suggestions}
      onInputChanged={onInputChanged}
      value={search}
      placeholder={t('winetricks.search', 'Search fonts or components')}
    />
  )
}
