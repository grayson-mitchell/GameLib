import './index.css'

import { useTranslation } from 'react-i18next'
import type { GameStatus } from 'common/types'
import { useSteamAccount } from 'frontend/state/accountHooks'
import { hasProgress } from 'frontend/hooks/hasProgress'
import { steamManagedPercent } from './steamManagedModel'
import { SteamManagedItemView } from './SteamManagedItemView'

// debug/steam-dl-missing-in-downloads: one row for an install the Steam client
// is downloading (steam://install hand-off). Progress is the ACF poller's.
// Pause is shown but disabled (GameLib has no handle on Steam's download).
// Cancel (quick 261105-vfq) stops GameLib's poll via kill -> SteamGame.stop()
// -> cancelDelegatedInstall; it never touches Steam.
export default function SteamManagedItem({ row }: { row: GameStatus }) {
  const steam = useSteamAccount()
  const { t: tGamelib } = useTranslation('gamelib')
  const [progress] = hasProgress(row.appName, 'steam')

  const title =
    steam.library.find((game) => game.app_name === row.appName)?.title ??
    row.appName

  return (
    <SteamManagedItemView
      appName={row.appName}
      title={title}
      percent={steamManagedPercent(progress.percent)}
      bytes={progress.bytes}
      t={(key, fallback) => tGamelib(key, fallback)}
      onCancel={() => void window.api.kill(row.appName, 'steam')}
    />
  )
}
