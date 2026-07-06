import { useTranslation } from 'react-i18next'

import { HumbleKey } from 'common/types/humble'
import { getExpirationDisplay } from 'common/humble/expirationDisplay'
import { STATE_LABEL_KEYS } from '../HumbleKeyGroup'

type Props = {
  humbleKey: HumbleKey
}

// D-22: strictly read-only. No click handler, no button/link element, no
// cursor:pointer, no reveal/copy/expand affordance — Phase 14 owns claim
// actions, not this row. Do not "improve" this into an interactive element.
export default function HumbleKeyRow({ humbleKey }: Props) {
  const { t } = useTranslation()

  const isUnpicked = humbleKey.state === 'UNPICKED'
  const [labelKey, labelDefault] = STATE_LABEL_KEYS[humbleKey.state]

  // D-27 pseudo-entry: never blocks the row on a missing deadline (Pitfall
  // 2). The backend already folds the Choice month's human-readable name
  // into `title`, so we append the "not picked yet" qualifier rather than
  // re-deriving month/year (not carried on HumbleKey).
  const displayTitle = isUnpicked
    ? t('humbleKeys.unpickedTitle', '{{title}} · games not picked', {
        title: humbleKey.title
      })
    : humbleKey.title

  // Per-state expiration text (live-UAT round 5): REDEEMED always renders
  // blank (a redeemed key's expiration is irrelevant); UNREDEEMABLE shows the
  // date when known, blank otherwise (the "Expired" badge already says it) —
  // never the "No expiration" placeholder. The decision itself is the pure,
  // unit-tested getExpirationDisplay; only the i18n mapping lives here.
  const display = getExpirationDisplay(humbleKey.state, humbleKey.expiration)
  const expirationLabel =
    display.kind === 'date'
      ? t('humbleKeys.expiresOn', 'Expires {{date}}', {
          date: new Date(display.iso).toLocaleDateString()
        })
      : display.kind === 'no-deadline'
        ? t('humbleKeys.noDeadline', 'No pick deadline available')
        : display.kind === 'no-expiration'
          ? t('humbleKeys.noExpiration', 'No expiration')
          : null // 'blank' — render nothing, not placeholder text

  return (
    <li className="humbleKeyRow">
      <span
        className={`humbleKeyStateBadge humbleKeyStateBadge--${humbleKey.state}`}
      >
        {t(labelKey, labelDefault)}
      </span>
      <div className="humbleKeyRowInfo">
        <span className="humbleKeyRowTitle">{displayTitle}</span>
        {!isUnpicked && (
          <span className="humbleKeyRowCaption">
            {t('humbleKeys.rowCaption', '{{platform}} · {{origin}}', {
              platform: humbleKey.platform,
              origin: humbleKey.origin
            })}
          </span>
        )}
      </div>
      {expirationLabel !== null && (
        <span className="humbleKeyRowExpiration">{expirationLabel}</span>
      )}
    </li>
  )
}
