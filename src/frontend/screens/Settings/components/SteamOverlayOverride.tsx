import { useContext, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MenuItem, SelectChangeEvent } from '@mui/material'
import SelectField from 'frontend/components/UI/SelectField'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from 'frontend/screens/Settings/SettingsContext'
import { useSteamEngineState } from 'frontend/state/SteamEngineState'

type OverlayValue = 'automatic' | 'on' | 'off'

/**
 * Phase 60 D-02: the per-game Steam overlay switch. Anything stored other than
 * 'on' / 'off' is shown as Automatic (the backend maps it the same way,
 * T-60-06-01) and is not rewritten until the user picks a value.
 */
export function parseOverlayValue(stored: unknown): OverlayValue {
  return stored === 'on' || stored === 'off' ? stored : 'automatic'
}

const SteamOverlayOverride = () => {
  const { t } = useTranslation('gamelib')
  const { appName, runner: contextRunner } = useContext(SettingsContext)
  // The global-settings context carries no runner; this section is the Steam one.
  const runner = contextRunner ?? 'steam'
  const [override, setOverride] = useSetting(
    'steamOverlayOverride',
    'automatic'
  )
  const state = useSteamEngineState((s) => s.byAppId[appName])
  const hasState = state !== undefined
  // Eligibility is computed by the backend (bridge install on macOS, DRM-mode
  // titles included); the renderer never derives it.
  const eligible = state?.overlayEligible === true

  useEffect(() => {
    if (hasState) return
    let cancelled = false
    void window.api
      .getEngineState({ runner, appName })
      .then((result) => {
        if (!cancelled && result) useSteamEngineState.getState().set(result)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [appName, runner, hasState])

  if (!eligible) return null

  return (
    <details className="steamOverlayOverride">
      <summary>
        {t('steam.overlay.override.summary', 'Steam overlay (advanced)')}
      </summary>
      <SelectField
        htmlId="steamOverlayOverride"
        value={parseOverlayValue(override)}
        label={t('steam.overlay.override.label', 'Steam overlay')}
        labelHelp={
          <InfoIcon
            text={t(
              'steam.overlay.override.help',
              "Shift+Tab opens Mac Steam's overlay in this game. Turn it off if the game crashes or draws wrongly with it."
            )}
          />
        }
        onChange={(e: SelectChangeEvent) =>
          setOverride(parseOverlayValue(e.target.value))
        }
      >
        <MenuItem value="automatic">
          {t(
            'steam.overlay.override.automatic',
            'Automatic (on, unless a known fix turns it off)'
          )}
        </MenuItem>
        <MenuItem value="on">{t('steam.overlay.override.on', 'On')}</MenuItem>
        <MenuItem value="off">
          {t('steam.overlay.override.off', 'Off')}
        </MenuItem>
      </SelectField>
    </details>
  )
}

export default SteamOverlayOverride
