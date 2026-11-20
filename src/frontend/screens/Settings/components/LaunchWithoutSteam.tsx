import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoBox, ToggleSwitch } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from '../SettingsContext'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons'
import type { SteamDirectLaunchView } from 'common/types/steam'

type Control =
  | { kind: 'hidden' }
  | { kind: 'disabled-drm' }
  | { kind: 'toggle'; warn: boolean }

/**
 * quick 261117-q1t: what the "Launch without Steam" row shows for a backend verdict.
 * Only DRM greys the toggle out; a Steam-API or unchecked game gets a warning once the
 * setting is on.
 */
export function describeLaunchWithoutSteamControl(
  view: SteamDirectLaunchView | undefined,
  on: boolean
): Control {
  if (!view) return { kind: 'hidden' }
  if (!view.applies) {
    return view.reason === 'steam-drm'
      ? { kind: 'disabled-drm' }
      : { kind: 'hidden' }
  }
  return { kind: 'toggle', warn: on && view.warning !== 'none' }
}

const LaunchWithoutSteam = () => {
  const { t } = useTranslation('gamelib')
  const { isDefault, appName } = useContext(SettingsContext)
  const [on, setOn] = useSetting('launchWithoutSteam', false)
  const [view, setView] = useState<SteamDirectLaunchView | undefined>()

  useEffect(() => {
    if (isDefault) return
    let cancelled = false
    window.api
      .steamDirectLaunchVerdict(appName)
      .then((v) => {
        if (!cancelled) setView(v)
      })
      .catch(() => {
        if (!cancelled) setView({ applies: false, reason: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [isDefault, appName])

  if (isDefault) return null
  const control = describeLaunchWithoutSteamControl(view, on === true)
  if (control.kind === 'hidden') return null

  const title = t('steam.directLaunch.label', 'Launch without Steam')
  if (control.kind === 'disabled-drm') {
    // Help-icon pattern: the reason sits behind an (i) on the label line, not a row below.
    return (
      <div className="toggleWithInfo">
        <ToggleSwitch
          htmlId="launchWithoutSteam"
          value={false}
          disabled
          handleChange={() => undefined}
          title={title}
        />
        <InfoBox text="infobox.help" iconOnly>
          {t(
            'steam.directLaunch.drmBadge',
            'Not available: this game uses Steam DRM, which needs the Steam app.'
          )}
        </InfoBox>
      </div>
    )
  }
  return (
    <>
      <ToggleSwitch
        htmlId="launchWithoutSteam"
        value={on === true}
        handleChange={() => setOn(!on)}
        title={title}
      />
      <p className="settingsToggleDescription">
        {t(
          'steam.directLaunch.description',
          'Starts the game directly: no Steam Cloud sync, no playtime tracking, no achievements and no Steam overlay.'
        )}
      </p>
      {control.warn && (
        <div className="settingsWarning" role="note">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>
            {t(
              'steam.directLaunch.risk',
              "This game uses the Steam API, or GameLib couldn't check. Without Steam it may quit, lose Steam features, or reopen Steam."
            )}
          </span>
        </div>
      )}
    </>
  )
}

export default LaunchWithoutSteam
