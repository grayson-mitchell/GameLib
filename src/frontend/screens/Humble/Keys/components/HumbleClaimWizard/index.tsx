import './index.css'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { faCopy, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { HumbleKey } from 'common/types/humble'

// D-68/T-14-09: a single, static, generic redemption-help destination for
// EVERY non-Steam platform. No authoritative Humble key_type -> URL table
// exists (RESEARCH Open Q3) — fabricating a per-platform deep-link risks
// sending the user's real secret to a wrong/broken page. Never interpolate
// any per-key value into this string.
const NON_STEAM_REDEEM_HELP_URL = 'https://support.humblebundle.com/hc/en-us'

type Step =
  | 'warning'
  | 'c2Block'
  | 'keyShown'
  | 'ambiguous'
  | 'failed'
  | 'cooldown'

type Props = {
  humbleKey: HumbleKey
  /** 'claim' = fresh reveal (D-65 warning-first); 'finish' = REVEALED-but-
   * unredeemed resume, D-66 — starts directly at the post-reveal step and
   * NEVER calls humbleRevealKey. */
  entryMode: 'claim' | 'finish'
  onDone: () => void
}

// D-65: the ONE controlled surface the entire claim UX flows through —
// warning -> reveal -> key shown + activation link-out -> mark redeemed,
// plus the C2 redirect and every failure/ambiguous/cooldown branch. Owns its
// own step/loading/error state internally (per 14-UI-SPEC "single stateful
// showDialogModal message component") so no state leaks into the caller.
// Passed as `DialogModalOptions.message` with an empty `buttons` array — this
// component renders ALL of its own actions; the outer Dialog chrome supplies
// only the title/close-button/backdrop.
export default function HumbleClaimWizard({
  humbleKey,
  entryMode,
  onDone
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // D-66: 'finish' resumes directly at 'keyShown' — no warning replay.
  const [step, setStep] = useState<Step>(
    entryMode === 'finish' ? 'keyShown' : 'warning'
  )
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [cooldownRetryAt, setCooldownRetryAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  // Mount-only (D-66: 'finish' entry must NEVER call humbleRevealKey, so this
  // effect only ever reads the already-revealed value, never triggers reveal).
  useEffect(() => {
    if (entryMode !== 'finish') {
      return
    }
    let cancelled = false
    void window.api
      .humbleGetRevealedKeyValue({
        gamekey: humbleKey.gamekey,
        machineName: humbleKey.machineName
      })
      .then((value) => {
        if (cancelled) {
          return
        }
        if (value === null) {
          // Pitfall B: the REVEALED flag is set but no confirmed key value is
          // stored locally yet. Never render a blank key and never fire a
          // second reveal call — show the ambiguous "sync to check" state.
          setStep('ambiguous')
        } else {
          setRevealedKey(value)
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // T-14-08: the ONLY call site of window.api.humbleRevealKey in this
  // component — invoked exclusively from the danger-styled confirm button
  // below (Step 1) or the 'failed' step's "Try again" retry. No effect ever
  // invokes it on mount.
  async function handleReveal() {
    if (busy) {
      return
    }
    setBusy(true)
    try {
      const outcome = await window.api.humbleRevealKey({
        gamekey: humbleKey.gamekey,
        machineName: humbleKey.machineName
      })
      switch (outcome.status) {
        case 'revealed':
          // D-73/HCLAIM-03: auto-copy on reveal, plus the re-copy button
          // rendered on the 'keyShown' step below.
          window.api.clipboardWriteText(outcome.key)
          setRevealedKey(outcome.key)
          setStep('keyShown')
          break
        case 'owned_blocked':
          // D-69/C2: backend re-validated ownership and hard-blocked reveal.
          setStep('c2Block')
          break
        case 'ambiguous':
          setStep('ambiguous')
          break
        case 'cooldown':
          setCooldownRetryAt(outcome.retryAtMs)
          setStep('cooldown')
          break
        case 'failed':
        case 'ineligible':
        default:
          setStep('failed')
          break
      }
    } finally {
      setBusy(false)
    }
  }

  // D-69/C2: the sole navigation target for an owned-game block.
  function handleC2Confirm() {
    navigate('/humble-keys/spares')
    onDone()
  }

  async function handleMarkRedeemed() {
    if (busy) {
      return
    }
    setBusy(true)
    try {
      await window.api.humbleMarkRedeemed({
        gamekey: humbleKey.gamekey,
        machineName: humbleKey.machineName
      })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  // 'ambiguous' offers a manual sync-now action — NEVER a second reveal call.
  function handleSyncNow() {
    void window.api.humbleSync()
    onDone()
  }

  const isSteam = humbleKey.platform === 'steam'

  if (step === 'warning') {
    return (
      <div className="humbleClaimWizard">
        <h3 className="humbleClaimWizardTitle">
          {t('humbleKeys.revealConfirmTitle', 'Reveal this key?')}
        </h3>
        <p className="humbleClaimWizardBody">
          {t(
            'humbleKeys.revealConfirmBody',
            "Revealing shows the actual key and removes it from Giftable spares for good. If you don't own this game yet, make sure that's really true before continuing — there's no undo."
          )}
        </p>
        <div className="humbleClaimWizardActions">
          <button
            type="button"
            className="button is-secondary outline humbleClaimWizardDismissButton"
            onClick={onDone}
          >
            {t('humbleKeys.revealDismiss', "Don't reveal yet")}
          </button>
          <button
            type="button"
            className="button is-danger humbleClaimWizardRevealButton"
            disabled={busy}
            onClick={() => void handleReveal()}
          >
            {t('humbleKeys.revealConfirmAction', 'Reveal key')}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'c2Block') {
    return (
      <div className="humbleClaimWizard">
        <div className="humbleClaimWizardC2Panel">
          <h3 className="humbleClaimWizardTitle">
            {t('humbleKeys.c2Title', 'You already own this on Steam')}
          </h3>
          <p className="humbleClaimWizardBody">
            {t(
              'humbleKeys.c2Body',
              "This key is safe in Giftable spares — revealing it here would throw away the ability to gift it. Take it to Giftable spares instead."
            )}
          </p>
        </div>
        <div className="humbleClaimWizardActions">
          <button
            type="button"
            className="button is-secondary outline humbleClaimWizardC2Button"
            onClick={handleC2Confirm}
          >
            {t('humbleKeys.c2Action', 'Go to Giftable spares')}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'ambiguous') {
    return (
      <div className="humbleClaimWizard">
        <p className="humbleClaimWizardAmbiguousNote">
          {t(
            'humbleKeys.revealAmbiguousBody',
            "We couldn't confirm this finished — sync to check"
          )}
        </p>
        <div className="humbleClaimWizardActions">
          <button
            type="button"
            className="button is-secondary outline humbleClaimWizardSyncButton"
            onClick={handleSyncNow}
          >
            {t('humbleKeys.syncNow', 'Sync now')}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'failed') {
    return (
      <div className="humbleClaimWizard">
        <p className="humbleClaimWizardFailedNote">
          {t(
            'humbleKeys.revealFailedBody',
            "Couldn't reveal this key — nothing was used up. You can try again."
          )}
        </p>
        <div className="humbleClaimWizardActions">
          <button
            type="button"
            className="button is-secondary outline humbleClaimWizardRetryButton"
            disabled={busy}
            onClick={() => void handleReveal()}
          >
            {t('humbleKeys.tryAgain', 'Try again')}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'cooldown') {
    const minutes =
      cooldownRetryAt !== null
        ? Math.max(1, Math.ceil((cooldownRetryAt - Date.now()) / 60000))
        : 0
    return (
      <div className="humbleClaimWizard">
        <p className="humbleClaimWizardCooldownNote">
          {t(
            'humbleKeys.revealCooldownBody',
            'Temporarily unavailable — retry in {{N}}m',
            { N: minutes }
          )}
        </p>
      </div>
    )
  }

  // step === 'keyShown'
  return (
    <div className="humbleClaimWizard">
      <h3 className="humbleClaimWizardTitle">
        {t('humbleKeys.keyShownTitle', 'Your key')}
      </h3>
      {revealedKey === null ? (
        <p className="humbleClaimWizardLoading">
          {t('humbleKeys.keyLoading', 'Loading…')}
        </p>
      ) : (
        <>
          {/* Step 2 visual hierarchy (UI-SPEC): the key string is the
              PRIMARY visual anchor — rendered above the action row. */}
          <div className="humbleClaimWizardKeyRow">
            <span className="humbleClaimWizardKeyValue">{revealedKey}</span>
            <button
              type="button"
              className="humbleClaimWizardCopyButton"
              onClick={() => window.api.clipboardWriteText(revealedKey)}
            >
              <FontAwesomeIcon icon={faCopy} />
              {t('humbleKeys.copyKey', 'Copy key')}
            </button>
          </div>
          <div className="humbleClaimWizardActions">
            {isSteam ? (
              <button
                type="button"
                className="humbleClaimWizardActivationLink"
                onClick={() =>
                  window.api.openExternalUrl(
                    `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(
                      revealedKey
                    )}`
                  )
                }
              >
                {t('humbleKeys.openSteam', 'Open Steam')}
                <FontAwesomeIcon icon={faExternalLinkAlt} />
              </button>
            ) : (
              <button
                type="button"
                className="humbleClaimWizardActivationLink"
                onClick={() =>
                  window.api.openExternalUrl(NON_STEAM_REDEEM_HELP_URL)
                }
              >
                {t('humbleKeys.redeemOnPlatform', 'Redeem on {{platform}}', {
                  platform: humbleKey.platform
                })}
                <FontAwesomeIcon icon={faExternalLinkAlt} />
              </button>
            )}
            <button
              type="button"
              className="button is-secondary outline humbleClaimWizardMarkRedeemedButton"
              disabled={busy}
              onClick={() => void handleMarkRedeemed()}
            >
              {t('humbleKeys.markRedeemed', 'Mark as redeemed')}
            </button>
          </div>
          {/* D-72: passive-only, never blocking — the finish step always
              works for REVEALED keys regardless of ownership. */}
          {entryMode === 'finish' && humbleKey.ownedElsewhere && (
            <p className="humbleClaimWizardOwnedNote">
              {t(
                'humbleKeys.finishOwnedNote',
                'You already own this on Steam — activation will likely fail there.'
              )}
            </p>
          )}
        </>
      )}
    </div>
  )
}
