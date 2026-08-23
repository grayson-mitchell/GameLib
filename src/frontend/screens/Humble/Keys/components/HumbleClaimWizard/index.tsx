import './index.css'
import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { faCopy, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { HumbleKey, RevealOutcome } from 'common/types/humble'
import { RedeemKeyOutcome } from 'common/types/steam'
import { redeemOutcomeCopy } from 'frontend/components/UI/RedeemSteamKeyDialog/copy'
import ContextProvider from 'frontend/state/ContextProvider'

// D-68/T-14-09: a single, static, generic redemption-help destination for
// EVERY non-Steam platform. No authoritative Humble key_type -> URL table
// exists (RESEARCH Open Q3) — fabricating a per-platform deep-link risks
// sending the user's real secret to a wrong/broken page. Never interpolate
// any per-key value into this string.
const NON_STEAM_REDEEM_HELP_URL = 'https://support.humblebundle.com/hc/en-us'

type Step =
  // 260823-op3: non-Steam claim entry ONLY. Steam keys skip straight to
  // 'activating' — there is a working redemption API for them, so the
  // reveal-then-hand-off choreography D-65 was protecting no longer applies.
  | 'warning'
  // 260823-op3: the one-click Steam path in flight — reveal (or read the
  // already-revealed value) then redeemSteamKey, with no intermediate clicks.
  | 'activating'
  // 260823-op3: terminal success — Steam accepted the key (or already owned
  // it) and the Humble row has been marked redeemed.
  | 'activated'
  | 'c2Block'
  | 'keyShown'
  | 'ambiguous'
  | 'failed'
  // WR-06 (14-REVIEW): a definitive server denial (already redeemed /
  // expired) — terminal, no retry button, sync-to-check recovery only.
  | 'rejected'
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
  // 260823-op3: the redeem-outcome copy lives in the `gamelib` namespace, so
  // it needs its own Suspense-resolved `t` — same two-hook-with-alias pattern
  // RedeemSteamKeyDialog uses (Phase 34.8-07, REQ-34.8-12/-13).
  const { t: tGamelib } = useTranslation('gamelib')
  const navigate = useNavigate()
  const { refreshLibrary } = useContext(ContextProvider)

  const isSteam = humbleKey.platform === 'steam'

  // 260823-ptz: confirm-first for Steam too. Steam's activate is irreversible
  // in BOTH entry modes — 'claim' burns the reveal, 'finish' burns the Steam
  // redemption — so both start at 'warning'. Non-Steam keeps the Phase 14
  // shape exactly: D-65 warning-first on 'claim', D-66 straight to 'keyShown'
  // on 'finish'.
  const [step, setStep] = useState<Step>(
    isSteam || entryMode === 'claim' ? 'warning' : 'keyShown'
  )
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [cooldownRetryAt, setCooldownRetryAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // 260823-op3: set ONLY when Steam itself answered. On success/already-owned
  // it drives the 'activated' panel; on invalid/rate-limited/error it renders
  // as a banner above the 'keyShown' manual fallback, so a spent reveal can
  // never strand the user without their key.
  const [redeemOutcome, setRedeemOutcome] = useState<RedeemKeyOutcome | null>(
    null
  )
  const [redeemedPackage, setRedeemedPackage] = useState<string | undefined>(
    undefined
  )

  // 260823-ptz: re-entrancy guard for runActivate, NOT a mount latch —
  // 260823-op3's mount effect is gone and T-14-08 is restored (see
  // handleReveal). `busy` alone cannot close the double-click window: it is
  // state, so both clicks in a same-frame double-click read the pre-render
  // `false` and `disabled={busy}` has not applied yet. A ref flips
  // synchronously. Cleared in `finally` so the 'failed' step's retry works.
  const activateInFlight = useRef(false)

  // Mount-only (D-66: 'finish' entry must NEVER call humbleRevealKey, so this
  // effect only ever reads the already-revealed value, never triggers reveal).
  useEffect(() => {
    if (isSteam || entryMode !== 'finish') {
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
      .catch(() => {
        // WR-05 (14-REVIEW): an IPC rejection previously left revealedKey
        // null on 'keyShown' — a permanent "Loading…" with no action buttons
        // plus an unhandled rejection. The ambiguous step is the correct
        // recovery: it offers "Sync now" and (critically for 'finish' mode)
        // NEVER re-fires the reveal call.
        if (!cancelled) {
          setStep('ambiguous')
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 260823-op3: maps every NON-'revealed' RevealOutcome onto its Phase 14
  // step. Shared by the manual (non-Steam) reveal and the Steam one-click
  // activate so the two paths can never drift in how a reveal failure reads.
  function applyRevealFailure(
    outcome: Exclude<RevealOutcome, { status: 'revealed' }>
  ) {
    switch (outcome.status) {
      case 'owned_blocked':
        // D-69/C2: backend re-validated ownership and hard-blocked reveal.
        setStep('c2Block')
        break
      case 'ambiguous':
        setStep('ambiguous')
        break
      case 'rejected_by_server':
        // WR-06: Humble processed and DENIED the reveal — honest terminal
        // copy, never the retryable "nothing was used up" failed step.
        setStep('rejected')
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
  }

  /**
   * 260823-op3: the Steam activate path — reveal (or read back the
   * already-revealed value in 'finish' mode), then redeem on Steam, then mark
   * the Humble row redeemed. 260823-ptz: entered from the confirm click, and
   * from there through to a terminal step with no further clicks.
   *
   * The two halves have deliberately DIFFERENT failure postures, because the
   * reveal is the irreversible half:
   *  - before the reveal lands, an unknown outcome is 'ambiguous' (WR-05) —
   *    never a retry that could fire a second reveal;
   *  - after it lands, every remaining failure must leave the user holding
   *    their key, so it falls through to 'keyShown' (key + Copy + Open Steam +
   *    Mark as redeemed) with the Steam outcome rendered as a banner. A spent
   *    reveal must never land on a step that hides the key.
   */
  async function runActivate() {
    if (activateInFlight.current) {
      return
    }
    activateInFlight.current = true
    setBusy(true)
    setStep('activating')
    try {
      let key = revealedKey
      if (key === null) {
        try {
          if (entryMode === 'finish') {
            // D-66: never re-reveal a key Humble already reports as REVEALED.
            const value = await window.api.humbleGetRevealedKeyValue({
              gamekey: humbleKey.gamekey,
              machineName: humbleKey.machineName
            })
            if (value === null) {
              // Pitfall B: REVEALED flag set, no confirmed local value.
              setStep('ambiguous')
              return
            }
            key = value
          } else {
            const outcome = await window.api.humbleRevealKey({
              gamekey: humbleKey.gamekey,
              machineName: humbleKey.machineName
            })
            if (outcome.status !== 'revealed') {
              applyRevealFailure(outcome)
              return
            }
            key = outcome.key
          }
        } catch {
          // WR-05: a rejection leaves the outcome UNKNOWN — the reveal POST
          // may already have gone out — so never the retryable 'failed' copy
          // and never a second reveal attempt.
          setStep('ambiguous')
          return
        }
        // D-73: auto-copy survives the redesign. The reveal is irreversible;
        // the clipboard is a free safety net for everything downstream.
        window.api.clipboardWriteText(key)
        setRevealedKey(key)
      }

      let outcome: RedeemKeyOutcome
      let packageName: string | undefined
      try {
        const result = await window.api.redeemSteamKey({ store: 'steam', key })
        outcome = result.outcome
        packageName = result.packageList
          ? Object.values(result.packageList)[0]
          : undefined
      } catch {
        outcome = 'error'
      }
      setRedeemOutcome(outcome)
      setRedeemedPackage(packageName)

      if (outcome === 'success' || outcome === 'already-owned') {
        try {
          await window.api.humbleMarkRedeemed({
            gamekey: humbleKey.gamekey,
            machineName: humbleKey.machineName
          })
        } catch {
          // Local, idempotent bookkeeping. Steam has already accepted the key
          // — surfacing a failure here would misreport what actually happened.
          // The next sync reconciles the row.
        }
        if (outcome === 'success') {
          // Mirrors RedeemSteamKeyDialog: reuse the EXISTING refresh path so
          // library, ownership and dependent UI stay consistent — never
          // recomputeOwnership directly.
          void refreshLibrary({
            library: 'steam',
            origin: 'redeem-steam-key'
          })
        }
        setStep('activated')
      } else {
        setStep('keyShown')
      }
    } finally {
      setBusy(false)
      activateInFlight.current = false
    }
  }

  // T-14-08 (RESTORED by 260823-ptz): the manual, NON-Steam reveal — invoked
  // exclusively from the danger-styled confirm button below (Step 1) or the
  // 'failed' step's "Try again" retry. humbleRevealKey's only other call site
  // is runActivate above, which 260823-ptz put back behind its own confirm
  // click. NO effect in this component invokes reveal on mount.
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
      if (outcome.status === 'revealed') {
        // D-73/HCLAIM-03: auto-copy on reveal, plus the re-copy button
        // rendered on the 'keyShown' step below.
        window.api.clipboardWriteText(outcome.key)
        setRevealedKey(outcome.key)
        setStep('keyShown')
      } else {
        applyRevealFailure(outcome)
      }
    } catch {
      // WR-05 (14-REVIEW): an IPC-level rejection (as opposed to a typed
      // RevealOutcome) previously escaped `void handleReveal()` as an
      // unhandled rejection with the wizard silently stuck on the warning
      // step. Deliberately routed to 'ambiguous' rather than the reviewer's
      // suggested 'failed': a rejection means the outcome is UNKNOWN — the
      // backend may have sent the irreversible reveal POST — so the 'failed'
      // copy ("nothing was used up… try again") could be false and its
      // retry button would invite re-firing. 'ambiguous' is the honest
      // terminal: "couldn't confirm — sync to check", never a second reveal.
      setStep('ambiguous')
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
    } catch {
      // WR-05 (14-REVIEW): swallow an IPC rejection instead of letting it
      // escape unhandled. Marking redeemed is a local, idempotent action —
      // staying on 'keyShown' (busy cleared by finally) lets the user simply
      // click "Mark as redeemed" again; the 'failed' step's reveal-failure
      // copy would be the wrong context here.
    } finally {
      setBusy(false)
    }
  }

  // 'ambiguous' offers a manual sync-now action — NEVER a second reveal call.
  function handleSyncNow() {
    void window.api.humbleSync()
    onDone()
  }

  // 260823-op3: the in-flight one-click panel. Deliberately actionless — the
  // reveal half is irreversible, so there is nothing safe to offer here but
  // the wizard's own close button.
  if (step === 'activating') {
    return (
      <div className="humbleClaimWizard">
        <h3 className="humbleClaimWizardTitle">
          {tGamelib(
            'gamelib:humbleKeys.activatingTitle',
            'Activating on Steam…'
          )}
        </h3>
        <p className="humbleClaimWizardBody">
          {tGamelib(
            'gamelib:humbleKeys.activatingBody',
            'Revealing your key and redeeming it on Steam — this only takes a moment.'
          )}
        </p>
      </div>
    )
  }

  // 260823-op3: terminal success. Reuses redeemOutcomeCopy so the Humble path
  // and the manual Redeem-a-key dialog say the SAME thing about the same
  // EPurchaseResult, rather than growing a parallel copy set.
  if (step === 'activated') {
    const copy = redeemOutcomeCopy(
      redeemOutcome ?? 'success',
      tGamelib,
      redeemedPackage
    )
    return (
      <div className="humbleClaimWizard">
        <h3 className="humbleClaimWizardTitle">
          {tGamelib('gamelib:humbleKeys.activatedTitle', 'Activated')}
        </h3>
        <p className="humbleClaimWizardBody">{copy.message}</p>
        <div className="humbleClaimWizardActions">
          <button
            type="button"
            className="button is-secondary outline humbleClaimWizardDoneButton"
            onClick={onDone}
          >
            {tGamelib('gamelib:humbleKeys.activatedDone', 'Done')}
          </button>
        </div>
      </div>
    )
  }

  // 260823-ptz: the confirm gate. Steam gets its own copy and its own confirm
  // button (running the whole activate sequence); non-Steam keeps D-65's
  // reveal-only wording and handler verbatim. The two are deliberately
  // separate buttons rather than one with a swapped label — the class name is
  // what the wizard suite keys the two paths off, and conflating them would
  // let a Steam regression pass a non-Steam assertion.
  if (step === 'warning') {
    if (isSteam) {
      return (
        <div className="humbleClaimWizard">
          <h3 className="humbleClaimWizardTitle">
            {tGamelib(
              'gamelib:humbleKeys.activateConfirmTitle',
              'Activate this key on Steam?'
            )}
          </h3>
          <p className="humbleClaimWizardBody">
            {entryMode === 'claim'
              ? // The reveal has NOT happened yet: this click spends it AND
                // redeems. Both halves are irreversible, so both are named.
                tGamelib(
                  'gamelib:humbleKeys.activateConfirmBody',
                  "This reveals the key — removing it from Giftable spares for good — and redeems it on your Steam account. There's no undo."
                )
              : // D-66 resume: the key is already revealed, so only the Steam
                // redemption is new. Promising a reveal here would be a lie.
                tGamelib(
                  'gamelib:humbleKeys.activateConfirmBodyRevealed',
                  "This redeems your already-revealed key on your Steam account. There's no undo."
                )}
          </p>
          <div className="humbleClaimWizardActions">
            <button
              type="button"
              className="button is-secondary outline humbleClaimWizardDismissButton"
              onClick={onDone}
            >
              {tGamelib('gamelib:humbleKeys.activateDismiss', 'Cancel')}
            </button>
            <button
              type="button"
              className="button is-danger humbleClaimWizardActivateButton"
              disabled={busy}
              onClick={() => void runActivate()}
            >
              {tGamelib('gamelib:humbleKeys.activate', 'Activate')}
            </button>
          </div>
        </div>
      )
    }
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
              'This key is safe in Giftable spares — revealing it here would throw away the ability to gift it. Take it to Giftable spares instead.'
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

  if (step === 'rejected') {
    // WR-06 (14-REVIEW): definitive server denial — the key may already be
    // redeemed or expired server-side, so there is deliberately NO retry
    // button (retrying a consumed key can never succeed); "Sync now"
    // reconciles the local state with server truth instead.
    return (
      <div className="humbleClaimWizard">
        <p className="humbleClaimWizardRejectedNote">
          {t(
            'humbleKeys.revealRejectedBody',
            'Humble declined to reveal this key — it may already be redeemed or expired. Sync to check its current status.'
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
            // 260823-op3: a Steam retry must re-run the WHOLE one-click
            // sequence, not just the reveal — otherwise a retry would strand
            // the user on 'keyShown' doing the manual work by hand.
            onClick={() => void (isSteam ? runActivate() : handleReveal())}
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
      {/* 260823-op3: only ever set when the one-click activate reached Steam
          and Steam said no (invalid / rate-limited / error). The reveal is
          already spent, so this step keeps every manual affordance rather
          than replacing them with an error panel — the banner explains WHY
          the hand-off is back on the table. */}
      {redeemOutcome !== null && (
        <p className="humbleClaimWizardRedeemFailedNote">
          {redeemOutcomeCopy(redeemOutcome, tGamelib, redeemedPackage).message}
        </p>
      )}
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
