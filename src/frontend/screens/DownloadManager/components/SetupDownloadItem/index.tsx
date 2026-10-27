import './index.css'

import { useTranslation } from 'react-i18next'
import type { SteamSetupDownloadProgress } from 'common/types/steam'
import { size } from 'frontend/helpers'

// quick 261027-tot: one row of the Downloads "Setup" section -- a first-run
// Steam payload download (no game, no queue element), shown as label +
// bytes/percent + bar.
export default function SetupDownloadItem({
  row
}: {
  row: SteamSetupDownloadProgress
}) {
  const { t: tGamelib } = useTranslation('gamelib')

  // Literal keys on purpose: the i18next parser cannot extract computed ones.
  const label =
    row.kind === 'steam-client'
      ? tGamelib(
          'gamelib:downloadManager.setup.steamClient',
          'Steam client installer'
        )
      : tGamelib(
          'gamelib:downloadManager.setup.steamBottle',
          'Steam for CrossOver'
        )

  return (
    <div className="setupDownloadItem">
      <div className="setupDownloadItem__text">
        <span className="setupDownloadItem__label">{label}</span>
        <span className="setupDownloadItem__progress">
          {`${size(row.bytes)} · ${row.percent}%`}
        </span>
      </div>
      <div
        className="setupDownloadItem__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={row.percent}
        aria-label={label}
      >
        <div
          className="setupDownloadItem__barFill"
          style={{ width: `${row.percent}%` }}
        />
      </div>
    </div>
  )
}
