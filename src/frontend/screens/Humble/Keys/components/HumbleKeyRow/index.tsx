import { useTranslation } from 'react-i18next'

import { HumbleKey } from 'common/types/humble'
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

  const expirationLabel = humbleKey.expiration
    ? t('humbleKeys.expiresOn', 'Expires {{date}}', {
        date: new Date(humbleKey.expiration).toLocaleDateString()
      })
    : isUnpicked
      ? t('humbleKeys.noDeadline', 'No pick deadline available')
      : t('humbleKeys.noExpiration', 'No expiration')

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
      <span className="humbleKeyRowExpiration">{expirationLabel}</span>
    </li>
  )
}
