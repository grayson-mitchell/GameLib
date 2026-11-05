import './index.css'

import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { GameStatus } from 'common/types'
import ContextProvider from 'frontend/state/ContextProvider'
import { hasProgress } from 'frontend/hooks/hasProgress'
import { steamManagedPercent } from './steamManagedModel'

// debug/steam-dl-missing-in-downloads: one row for an install the Steam client
// is downloading (steam://install hand-off). Progress is the ACF poller's;
// Pause and Cancel are shown but disabled, because GameLib has no handle on
// Steam's download -- the user pauses or cancels it in Steam.
export default function SteamManagedItem({ row }: { row: GameStatus }) {
  const { steam } = useContext(ContextProvider)
  const { t: tGamelib } = useTranslation('gamelib')
  const [progress] = hasProgress(row.appName, 'steam')

  const title =
    steam.library.find((game) => game.app_name === row.appName)?.title ??
    row.appName
  const percent = steamManagedPercent(progress.percent)
  const managedHint = tGamelib(
    'gamelib:downloadManager.steamManaged.unavailable',
    'Managed by Steam. Pause or cancel it in Steam.'
  )

  return (
    <div className="steamManagedItem">
      <div className="steamManagedItem__text">
        <Link
          className="steamManagedItem__title"
          to={`/gamepage/steam/${row.appName}`}
        >
          {title}
        </Link>
        <span className="steamManagedItem__progress">
          {progress.bytes ? `${progress.bytes} · ${percent}%` : `${percent}%`}
        </span>
      </div>
      <div
        className="steamManagedItem__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={title}
      >
        <div
          className="steamManagedItem__barFill"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="steamManagedItem__footer">
        <span className="steamManagedItem__note">{managedHint}</span>
        <span className="steamManagedItem__actions">
          <button
            type="button"
            className="button is-text"
            disabled
            title={managedHint}
          >
            {tGamelib('gamelib:downloadManager.steamManaged.pause', 'Pause')}
          </button>
          <button
            type="button"
            className="button is-text"
            disabled
            title={managedHint}
          >
            {tGamelib('gamelib:downloadManager.steamManaged.cancel', 'Cancel')}
          </button>
        </span>
      </div>
    </div>
  )
}
