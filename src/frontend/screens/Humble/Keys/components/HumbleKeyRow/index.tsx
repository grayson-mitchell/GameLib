import { useTranslation } from 'react-i18next'
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { HumbleKey } from 'common/types/humble'
import { getExpirationDisplay } from 'common/humble/expirationDisplay'
import { UrgencyTier } from 'common/humble/urgencyBadge'
import { STATE_LABEL_KEYS } from '../../stateLabels'
import UrgencyBadge from '../UrgencyBadge'

type ClaimAction = {
  revealedAt: number | null
  redeemedAt: number | null
  keyindexResolved: boolean
  onClaim: () => void
  onFinish: () => void
  onUndoRedeem: () => void
}

type Props = {
  humbleKey: HumbleKey
  /** D-63: renders in all 3 tabs, computed by the caller via getUrgencyTier. */
  urgencyTier?: UrgencyTier
  /** D-60: Giftable Spares only — omitted (undefined) everywhere else. */
  giftAction?: { giftedAt: number | null; onGift: () => void }
  /** D-67: Keys-waiting ONLY — omitted (undefined) everywhere else. Drives
   * the Claim/Finish activation button, the revealed/redeemed annotations,
   * and the Pitfall-C disabled "Sync to enable claiming" state. */
  claimAction?: ClaimAction
  /** WR-04 (D-71, 14-REVIEW): set by the caller when an ownership-override
   * record EXISTS for this key (source: humbleGetOwnershipOverrides) —
   * renders the reversal counterpart of the "Not the same game" override.
   * Keyed off the override record, never the current fuzzy/owned flags: an
   * overridden key recomputes to `ownedElsewhere: false, matchConfidence:
   * 'none'`, so flag-based gating could never show this control on the one
   * row that actually needs it (it now lives in Keys-waiting). This row
   * calls window.api.humbleClearOwnershipOverride directly (mirroring the
   * override button's own direct-call pattern) rather than taking a
   * caller-supplied callback. */
  undoOverride?: boolean
}

// D-22: strictly read-only, with THREE sanctioned exceptions. No click
// handler, no button/link element, no cursor:pointer, no reveal/copy/expand
// affordance beyond these — Phase 14 owns the claim UX via the wizard it
// mounts elsewhere, not general interactivity added here. Exception 1: the
// D-42 "Not the same game" override (fuzzy-matched rows only), paired with
// its WR-04 (D-71, 14-REVIEW) undo-override counterpart (`undoOverride`
// prop — rendered wherever the OVERRIDDEN key now appears, i.e.
// Keys-waiting, keyed off the override record existing). Exception 2: the
// optional `giftAction` prop (Giftable Spares tab only, Phase 13).
// Exception 3: the optional `claimAction` prop (Keys-waiting tab only,
// D-67, Phase 14) — opens the claim wizard via the caller-supplied
// onClaim/onFinish/onUndoRedeem handlers. Every other interaction remains
// forbidden. Do not "improve" this row further into a generally-interactive
// element.
export default function HumbleKeyRow({
  humbleKey,
  urgencyTier,
  giftAction,
  claimAction,
  undoOverride
}: Props) {
  const { t } = useTranslation()
  // 260823-op3: fork-added strings live in the fork-owned `gamelib`
  // namespace (D-06 split-brain) — `translation.json` is upstream-owned and
  // the i18n churn guard fails CI on any write to it.
  const { t: tGamelib } = useTranslation('gamelib')

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

  const isSteam = humbleKey.platform === 'steam'

  return (
    <li className="humbleKeyRow">
      {/* 260823-op3 column 1 — D-67 sanctioned exception: rendered ONLY when
          the caller supplies a `claimAction` prop — the Keys-waiting tab is
          the sole caller that does (C2 guard is the authoritative backstop;
          this is first-line UI restriction only, T-14-03). D-77 Undo
          affordance appears only while redeemedAt reflects a local-only mark
          (the caller's annotations source already guarantees this — see
          HumbleLibrary.getClaimAnnotations). Pitfall C: an UNREVEALED key
          whose keyindex has not been resolved by a sync renders a
          non-interactive "Sync to enable claiming" caption instead of a
          button, so no wizard ever opens against a key it cannot reveal. */}
      {claimAction && (
        <span className="humbleKeyRowAction">
          {claimAction.redeemedAt !== null ? (
            <span className="humbleKeyClaimGroup">
              <span className="humbleKeyClaimAnnotation">
                {t('humbleKeys.redeemedAnnotation', 'Redeemed {{date}}', {
                  date: new Date(claimAction.redeemedAt).toLocaleDateString()
                })}
              </span>
              <button
                type="button"
                className="humbleKeyUndoButton"
                onClick={claimAction.onUndoRedeem}
              >
                {t('humbleKeys.undo', 'Undo')}
              </button>
            </span>
          ) : claimAction.revealedAt !== null ||
            humbleKey.state === 'REVEALED' ? (
            // CR-01 (14-REVIEW re-review): the Finish/Claim decision is gated
            // on server truth (`state === 'REVEALED'`), not solely on the
            // local reveal annotation — a key revealed on Humble's WEBSITE
            // carries redeemed_key_val (classifies REVEALED) but has no
            // humbleRevealedStore record, so `revealedAt` is null. Rendering
            // "Claim" for it is a dead end: the backend refuses to reveal any
            // non-UNREVEALED key (D-66 never-re-reveal). The "Revealed {date}"
            // annotation still renders only when the local timestamp exists.
            <span className="humbleKeyClaimGroup">
              {claimAction.revealedAt !== null && (
                <span className="humbleKeyClaimAnnotation">
                  {t('humbleKeys.revealedAnnotation', 'Revealed {{date}}', {
                    date: new Date(claimAction.revealedAt).toLocaleDateString()
                  })}
                </span>
              )}
              <button
                type="button"
                className="humbleKeyGiftButton"
                onClick={claimAction.onFinish}
              >
                {/* 260823-op3: a REVEALED Steam key still activates in one
                    click (the wizard reads the stored value instead of
                    re-revealing), so it gets the same verb as a fresh one. */}
                {isSteam
                  ? tGamelib('gamelib:humbleKeys.activate', 'Activate')
                  : t('humbleKeys.finishActivation', 'Finish activation')}
              </button>
            </span>
          ) : claimAction.keyindexResolved ? (
            <button
              type="button"
              className="humbleKeyGiftButton"
              onClick={claimAction.onClaim}
            >
              {/* 260823-op3: "Claim" described a multi-step hand-off that no
                  longer exists for Steam — one click reveals, redeems and
                  marks the row. NEW key, not a changed default: `humbleKeys
                  .claim` already resolves to "Claim" in en, so relabelling
                  through the default argument would be a silent no-op. */}
              {isSteam
                ? tGamelib('gamelib:humbleKeys.activate', 'Activate')
                : t('humbleKeys.claim', 'Claim')}
            </button>
          ) : (
            <span className="humbleKeyClaimDisabledCaption">
              {t('humbleKeys.syncToEnableClaiming', 'Sync to enable claiming')}
            </span>
          )}
        </span>
      )}
      {/* 260823-op3 column 2 — D-60 sanctioned exception: rendered ONLY when
          the caller supplies a `giftAction` prop — the Giftable Spares tab is
          the sole caller that does. D-59 double-gift guard: once a gift has
          been confirmed for this key, show the annotation instead of
          re-rendering the button. */}
      {giftAction && (
        <span className="humbleKeyRowAction">
          {giftAction.giftedAt !== null ? (
            <span className="humbleKeyGiftedAnnotation">
              {t(
                'humbleKeys.giftedAnnotation',
                'Opened Humble gift page {{date}}',
                {
                  date: new Date(giftAction.giftedAt).toLocaleDateString()
                }
              )}
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
          )}
        </span>
      )}
      {/* 260823-op3 column 3 — status, with the urgency badge kept adjacent
          to it: the two read as one state pair, not as separate columns. */}
      <span
        className={`humbleKeyStateBadge humbleKeyStateBadge--${humbleKey.state}`}
      >
        {t(labelKey, labelDefault)}
      </span>
      <UrgencyBadge
        tier={urgencyTier ?? null}
        expiration={humbleKey.expiration}
      />
      {/* 260823-op3 column 4 — title + captions, the flex-grow cell that
          pushes expiration to the right edge. */}
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
        {/* WR-04 (D-71, 14-REVIEW) sanctioned exception: reversal
            counterpart of the "Not the same game" override above. Rendered
            when the caller says an override RECORD exists — never gated on
            ownedElsewhere/fuzzy, which the override itself cleared (the
            overridden key now reads unowned/none and lives in Keys-waiting).
            A mistaken override must stay reversible from wherever the key
            actually appears. */}
        {undoOverride && (
          <span className="humbleKeyOwnedBadge">
            <button
              type="button"
              className="humbleKeyOwnedOverride"
              onClick={() =>
                window.api.humbleClearOwnershipOverride(humbleKey.machineName)
              }
            >
              {t(
                'humbleKeys.undoOwnershipOverride',
                'Undo — I do own this game'
              )}
            </button>
          </span>
        )}
      </div>
      {/* 260823-op3 column 5 — expiration, last. */}
      {expirationLabel !== null && (
        <span className="humbleKeyRowExpiration">{expirationLabel}</span>
      )}
    </li>
  )
}
