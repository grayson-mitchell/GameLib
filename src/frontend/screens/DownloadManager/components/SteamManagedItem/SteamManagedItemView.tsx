import { Link } from 'react-router-dom'
import type { GameInfo } from 'common/types'

// quick 261105-vfq: pure view for the Downloads "Managed by Steam" row, split
// out of index.tsx (which imports CSS) so jest can load it. Pause stays
// disabled (Steam's); Cancel stops GameLib's wait via onCancel.
// quick 261125-qp9: GamePage reads location.state.gameInfo while it renders, so
// the title links only when it has a gameInfo to carry; otherwise plain text.
export function SteamManagedItemView({
  appName,
  title,
  percent,
  bytes,
  t,
  onCancel,
  gameInfo
}: {
  appName: string
  title: string
  percent: number
  bytes?: string
  t: (key: string, fallback: string) => string
  onCancel: () => void
  gameInfo?: GameInfo
}) {
  const note = t(
    'gamelib:downloadManager.steamManaged.note',
    'Managed by Steam. Pause it in Steam.'
  )
  const cancelHint = t(
    'gamelib:downloadManager.steamManaged.cancelHint',
    'Stops GameLib waiting for Steam. Anything Steam has already started keeps going in Steam.'
  )

  return (
    <div className="steamManagedItem">
      <div className="steamManagedItem__text">
        {gameInfo ? (
          <Link
            className="steamManagedItem__title"
            to={`/gamepage/steam/${appName}`}
            state={{ gameInfo }}
          >
            {title}
          </Link>
        ) : (
          <span className="steamManagedItem__title">{title}</span>
        )}
        <span className="steamManagedItem__progress">
          {bytes ? `${bytes} · ${percent}%` : `${percent}%`}
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
        <span className="steamManagedItem__note">{note}</span>
        <span className="steamManagedItem__actions">
          <button
            type="button"
            className="button is-text"
            disabled
            title={note}
          >
            {t('gamelib:downloadManager.steamManaged.pause', 'Pause')}
          </button>
          <button
            type="button"
            className="button is-text"
            title={cancelHint}
            onClick={onCancel}
          >
            {t('gamelib:downloadManager.steamManaged.cancel', 'Cancel')}
          </button>
        </span>
      </div>
    </div>
  )
}
