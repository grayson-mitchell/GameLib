import { useTranslation } from 'react-i18next'
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { HumbleKey } from 'common/types/humble'
import { getExpirationDisplay } from 'common/humble/expirationDisplay'
import { UrgencyTier } from 'common/humble/urgencyBadge'
import { STATE_LABEL_KEYS } from '../../stateLabels'
import UrgencyBadge from '../UrgencyBadge'

type Props = {
  humbleKey: HumbleKey
  /** D-63: renders in all 3 tabs, computed by the caller via getUrgencyTier. */
  urgencyTier?: UrgencyTier
  /** D-60: Giftable Spares only — omitted (undefined) everywhere else. */
  giftAction?: { giftedAt: number | null; onGift: () => void }
}

// D-22: strictly read-only, with TWO sanctioned exceptions. No click handler,
// no button/link element, no cursor:pointer, no reveal/copy/expand affordance
// — Phase 14 owns claim actions, not this row. The D-42 "Not the same game"
// override below is one carve-out (fuzzy-matched rows only); the optional
// `giftAction` prop (Giftable Spares tab only, Plan 04) is the other. Every
// other interaction remains forbidden. Do not "improve" this row further into
// a generally-interactive element.
export default function HumbleKeyRow({
  humbleKey,
  urgencyTier,
  giftAction
}: Props) {
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
      <UrgencyBadge
        tier={urgencyTier ?? null}
        expiration={humbleKey.expiration}
      />
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
      {/* D-60 sanctioned exception: the second (and only other) interactive
          affordance on this otherwise read-only row (D-22), rendered ONLY
          when the caller supplies a `giftAction` prop — the Giftable Spares
          tab is the sole caller that does. D-59 double-gift guard: once a
          gift has been confirmed for this key, show the annotation instead
          of re-rendering the button. */}
      {giftAction &&
        (giftAction.giftedAt !== null ? (
          <span className="humbleKeyGiftedAnnotation">
            {t('humbleKeys.giftedAnnotation', 'Opened Humble gift page {{date}}', {
              date: new Date(giftAction.giftedAt).toLocaleDateString()
            })}
          </span>
        ) : (
          <button
            type="button"
            className="humbleKeyGiftButton"
            onClick={giftAction.onGift}
          >
            {t('humbleKeys.giftOnHumble', 'Gift on Humble')}
            <FontAwesomeIcon icon={faExternalLinkAlt} />
          </button>
        ))}
    </li>
  )
}
