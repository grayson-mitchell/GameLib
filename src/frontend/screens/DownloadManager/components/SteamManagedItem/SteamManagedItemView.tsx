import { Link } from 'react-router-dom'

// quick 261105-vfq: pure view for the Downloads "Managed by Steam" row, split
// out of index.tsx (which imports CSS) so jest can load it. Pause stays
// disabled (Steam's); Cancel stops GameLib's wait via onCancel.
export function SteamManagedItemView({
  appName,
  title,
  percent,
  bytes,
  t,
  onCancel
}: {
  appName: string
  title: string
  percent: number
  bytes?: string
  t: (key: string, fallback: string) => string
  onCancel: () => void
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
        <Link
          className="steamManagedItem__title"
          to={`/gamepage/steam/${appName}`}
        >
          {title}
        </Link>
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
