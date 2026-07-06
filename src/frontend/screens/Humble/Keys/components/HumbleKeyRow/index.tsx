import { useTranslation } from 'react-i18next'

import { HumbleKey } from 'common/types/humble'
import { getExpirationDisplay } from 'common/humble/expirationDisplay'
import { STATE_LABEL_KEYS } from '../../stateLabels'

type Props = {
  humbleKey: HumbleKey
}

// D-22: strictly read-only, with ONE sanctioned exception. No click handler,
// no button/link element, no cursor:pointer, no reveal/copy/expand affordance
// — Phase 14 owns claim actions, not this row. The D-42 "Not the same game"
// override below is the single carve-out (fuzzy-matched rows only); every
// other interaction remains forbidden. Do not "improve" this row further into
// a generally-interactive element.
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
        {humbleKey.ownedElsewhere && (
          <span className="humbleKeyOwnedBadge">
            {humbleKey.matchConfidence === 'exact'
              ? t('humbleKeys.ownedOnSteam', 'Owned on Steam')
              : t('humbleKeys.likelyOwnedOnSteam', 'Likely owned on Steam')}
            {/* D-42 sanctioned exception: the ONLY interactive affordance on
                this otherwise read-only row (D-22), and only for fuzzy
                matches — exact AppID matches are trusted, no override. */}
            {humbleKey.matchConfidence === 'fuzzy' && (
              <button
                type="button"
                className="humbleKeyOwnedOverride"
                onClick={() =>
                  window.api.humbleSetOwnershipOverride(humbleKey.machineName)
                }
              >
                {t('humbleKeys.notTheSameGame', 'Not the same game')}
              </button>
            )}
          </span>
        )}
      </div>
      {expirationLabel !== null && (
        <span className="humbleKeyRowExpiration">{expirationLabel}</span>
      )}
    </li>
  )
}
