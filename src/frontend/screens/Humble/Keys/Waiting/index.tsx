import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import { ClaimAnnotation, HumbleKey } from 'common/types/humble'
import { selectKeysWaiting } from 'common/humble/viewFilters'
import { getUrgencyTier } from 'common/humble/urgencyBadge'
import HumbleKeyRow from '../components/HumbleKeyRow'
import HumbleClaimWizard from '../components/HumbleClaimWizard'

// HVIEW-01: Keys waiting is a single flat list (D-56, no section headers,
// unlike the All-keys tab's HumbleKeyGroup) sorted soonest-expiring first via
// the pure selectKeysWaiting helper. Reads `humble.keys` from
// ContextProvider directly — same shape as the pre-refactor Keys/index.tsx
// render body this tab is descended from.
export default function HumbleKeysWaiting() {
  const { t } = useTranslation()
  const { humble, showDialogModal } = useContext(ContextProvider)
  const [annotations, setAnnotations] = useState<
    Record<string, ClaimAnnotation>
  >({})

  const keys = selectKeysWaiting(humble?.keys ?? [])

  // D-67/Plan 03: per-key reveal/redeem annotations + the Pitfall-C
  // keyindexResolved disabled-state signal, mirroring Spares' giftedMap
  // mount-time fetch pattern.
  useEffect(() => {
    let cancelled = false
    void window.api.humbleGetClaimAnnotations().then((map) => {
      if (!cancelled) {
        setAnnotations(map)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  function closeWizard() {
    showDialogModal({ showDialog: false })
  }

  // D-65: one stateful wizard mount per open, entryMode drives where it
  // starts (D-66: 'finish' resumes at the post-reveal step, never re-reveals).
  function openWizard(key: HumbleKey, entryMode: 'claim' | 'finish') {
    showDialogModal({
      showDialog: true,
      title: t('humbleKeys.claimWizardTitle', 'Claim this key'),
      message:
        entryMode === 'finish' ? (
          <HumbleClaimWizard
            humbleKey={key}
            entryMode="finish"
            onDone={closeWizard}
          />
        ) : (
          <HumbleClaimWizard
            humbleKey={key}
            entryMode="claim"
            onDone={closeWizard}
          />
        ),
      buttons: []
    })
  }

  return (
    <div className="humbleKeysTabPanel">
      <p className="humbleKeysBlurb">
        {t(
          'humbleKeys.waitingBlurb',
          "Keys you don't own yet — claim them before they expire."
        )}
      </p>
      {keys.length > 0 ? (
        <ul className="humbleKeysFlatList">
          {keys.map((key) => {
            const composite = `${key.gamekey}:${key.machineName}`
            const annotation = annotations[composite]
            return (
              <HumbleKeyRow
                key={composite}
                humbleKey={key}
                urgencyTier={getUrgencyTier(key.state, key.expiration)}
                claimAction={{
                  revealedAt: annotation?.revealedAt ?? null,
                  redeemedAt: annotation?.redeemedAt ?? null,
                  // Pitfall C: default to false (not resolved) when the
                  // annotations fetch hasn't landed yet, so no wizard opens
                  // against a key whose keyindex status is still unknown.
                  keyindexResolved: annotation?.keyindexResolved ?? false,
                  onClaim: () => openWizard(key, 'claim'),
                  onFinish: () => openWizard(key, 'finish'),
                  onUndoRedeem: () =>
                    void window.api.humbleUndoRedeemed({
                      gamekey: key.gamekey,
                      machineName: key.machineName
                    })
                }}
              />
            )
          })}
        </ul>
      ) : (
        <div className="humbleKeysEmptyState">
          <h5>{t('humbleKeys.waitingEmptyTitle', "You're all caught up")}</h5>
          <p>
            {t(
              'humbleKeys.waitingEmptyBody',
              'No keys are waiting to be claimed. Check the All keys tab to see your full inventory.'
            )}
          </p>
        </div>
      )}
    </div>
  )
}
