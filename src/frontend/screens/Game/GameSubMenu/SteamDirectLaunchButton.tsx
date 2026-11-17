import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlayArrowOutlined as PlayArrowOutlinedIcon } from '@mui/icons-material'
import useUiState from 'frontend/state/uiState'

interface Props {
  appName: string
  disabled: boolean
}

/**
 * quick 261117-p38: "Launch without Steam". Rendered only when the sidecar's
 * verdict says the game uses no Steam API and has no Steam DRM wrapper. The
 * sidecar re-derives the verdict at launch, so this is only a gate on the offer.
 */
export default function SteamDirectLaunchButton({ appName, disabled }: Props) {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const showDialogModal = useUiState((s) => s.showDialogModal)
  const [eligible, setEligible] = useState(false)

  useEffect(() => {
    let cancelled = false
    setEligible(false)
    window.api
      .steamDirectLaunchVerdict(appName)
      .then((view) => {
        if (!cancelled) setEligible(view.eligible)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [appName])

  if (!eligible) return null

  function handleClick() {
    showDialogModal({
      showDialog: true,
      title: tGamelib(
        'gamelib:steam.directLaunch.confirmTitle',
        'Launch without Steam?'
      ),
      message: tGamelib(
        'gamelib:steam.directLaunch.confirmMessage',
        'This starts the game directly, without the Steam client. For this session there is no Steam Cloud sync, no playtime tracking, no achievements and no Steam overlay.'
      ),
      buttons: [
        {
          text: tGamelib('gamelib:steam.directLaunch.confirmLaunch', 'Launch'),
          onClick: () => {
            void window.api.steamLaunchWithoutSteam(appName)
          }
        },
        { text: t('button.cancel', 'Cancel') }
      ]
    })
  }

  return (
    <button
      onClick={handleClick}
      className="link button is-text is-link buttonWithIcon"
      disabled={disabled}
    >
      <PlayArrowOutlinedIcon />
      {tGamelib('gamelib:steam.directLaunch.label', 'Launch without Steam')}
    </button>
  )
}
