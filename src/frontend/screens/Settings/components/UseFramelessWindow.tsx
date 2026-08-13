import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'

// Gap G2 / UAT test 2: the toggle applies live -- confirmed twice in live
// testing, no restart required. The on-toggle re-apply this phase shipped is
// a deliberate superset of Electron parity, whose own toggle DOES require a
// restart. The description string moved to the `gamelib` namespace because
// `meta/i18nCatalogChurnGuard.ts` forbids ANY change to `translation.json`
// (not merely hand-edited ones) -- the corrected copy describes fork
// behaviour upstream does not have.
const UseFramelessWindow = () => {
  const { t: tGamelib } = useTranslation('gamelib')
  const [framelessWindow, setFramelessWindow] = useSetting(
    'framelessWindow',
    false
  )

  if (window.isSteamDeckGameMode) {
    return <></>
  }

  return (
    <ToggleSwitch
      htmlId="framelessWindow"
      value={framelessWindow}
      handleChange={() => setFramelessWindow(!framelessWindow)}
      title={tGamelib(
        'gamelib:settings.framelessWindowDescription',
        'Use frameless window'
      )}
    />
  )
}

export default UseFramelessWindow
