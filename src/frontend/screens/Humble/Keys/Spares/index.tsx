import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import { HumbleKey } from 'common/types/humble'
import { selectGiftableSpares } from 'common/humble/viewFilters'
import { getUrgencyTier } from 'common/humble/urgencyBadge'
import HumbleKeyRow from '../components/HumbleKeyRow'

// D-57/A1: the deep-link target is a literal, static URL — never built from a
// gamekey/machineName (V5 threat, T-13-07). Do NOT interpolate any per-key
// value into this string.
const GIFT_URL = 'https://www.humblebundle.com/home/keys'

// HVIEW-02: Giftable spares lists selectGiftableSpares(ownedElsewhere +
// UNREVEALED) as a single flat list (same D-56 shape as Waiting — no
// HumbleKeyGroup sections) and adds the one new interactive affordance this
// phase introduces: a confirmation-gated (D-58) "Gift on Humble" deep-link,
// guarded against double-gifting via the gifted-at annotation (D-59).
export default function HumbleKeysSpares() {
  const { t } = useTranslation()
  const { humble, showDialogModal } = useContext(ContextProvider)
  const [giftedMap, setGiftedMap] = useState<Record<string, number>>({})

  const keys = selectGiftableSpares(humble?.keys ?? [])

  useEffect(() => {
    let cancelled = false
    void window.api.humbleGetGiftedAt().then((map) => {
      if (!cancelled) {
        setGiftedMap(map)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // D-58: every gift action is gated behind this confirmation dialog, every
  // time — no "don't ask again" checkbox, no auto-gift, no bulk action.
  function openGiftDialog(key: HumbleKey) {
    showDialogModal({
      showDialog: true,
      title: t('humbleKeys.giftConfirmTitle', 'Gift this key?'),
      message: t(
        'humbleKeys.giftConfirmBody',
        "Anyone with this link can claim the key — once redeemed, it's gone for good. You'll finish gifting it on Humble's own site."
      ),
      buttons: [
        {
          text: t('button.cancel', 'Cancel'),
          onClick: () => showDialogModal({ showDialog: false })
        },
        {
          text: t('humbleKeys.giftConfirmAction', 'Open Humble'),
          onClick: () => {
            void window.api.humbleRecordGiftLinkOpened(key.machineName)
            window.api.openExternalUrl(GIFT_URL)
            setGiftedMap((prev) => ({
              ...prev,
              [key.machineName]: Date.now()
            }))
            showDialogModal({ showDialog: false })
          }
        }
      ]
    })
  }

  return (
    <div className="humbleKeysTabPanel">
      {keys.length > 0 ? (
        <ul className="humbleKeysFlatList">
          {keys.map((key) => (
            <HumbleKeyRow
              key={`${key.gamekey}:${key.machineName}`}
              humbleKey={key}
              urgencyTier={getUrgencyTier(key.state, key.expiration)}
              giftAction={{
                giftedAt: giftedMap[key.machineName] ?? null,
                onGift: () => openGiftDialog(key)
              }}
              // WR-04 (14-REVIEW): no undoOverride here — a key on this tab
              // is by definition NOT overridden (an override clears
              // ownedElsewhere, moving the key out of Giftable Spares
              // entirely). The reversal affordance renders in Keys-waiting,
              // where the overridden key actually appears, keyed off the
              // override record (humbleGetOwnershipOverrides).
            />
          ))}
        </ul>
      ) : (
        <div className="humbleKeysEmptyState">
          <h5>{t('humbleKeys.sparesEmptyTitle', 'No giftable spares')}</h5>
          <p>
            {t(
              'humbleKeys.sparesEmptyBody',
              "Keys show up here once they're confirmed owned elsewhere and haven't been revealed yet."
            )}
          </p>
        </div>
      )}
    </div>
  )
}
