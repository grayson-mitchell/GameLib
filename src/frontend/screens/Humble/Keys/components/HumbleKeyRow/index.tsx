import { useTranslation } from 'react-i18next'
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import SteamLogo from 'frontend/assets/steam-logo.svg?react'
import GOGLogo from 'frontend/assets/gog-logo.svg?react'
import EpicLogo from 'frontend/assets/epic-logo.svg?react'

import { HumbleKey } from 'common/types/humble'
import { getExpirationDisplay } from 'common/humble/expirationDisplay'
import { UrgencyTier } from 'common/humble/urgencyBadge'
import {
  getKeyTypePresentation,
  HumbleKeyTypePresentation,
  HumbleStoreLogoId
} from 'common/humble/keyTypePresentation'
import { STATE_LABEL_KEYS } from '../../stateLabels'
import UrgencyBadge from '../UrgencyBadge'

/**
 * D-42-03: resolves a presentation from `keyTypePresentation.ts` to the
 * caption's display name + optional logo id. Exhaustive over
 * `HumbleKeyTypePresentation['kind']` — mirrors DialogHandler/index.tsx's
 * `resolveButtonAction` exhaustiveness pattern (`const _exhaustive: never`)
 * so a fourth presentation kind added later fails `pnpm codecheck` instead
 * of silently rendering no name. `otherLabel` is passed in (rather than
 * calling `tGamelib` here) because this module has no i18n — the neutral
 * "Other" string for the 'unknown' case is resolved at the call site.
 */
function resolvePlatformDisplay(
  presentation: HumbleKeyTypePresentation,
  otherLabel: string
): { name: string; logo: HumbleStoreLogoId | null } {
  switch (presentation.kind) {
    case 'branded':
      return { name: presentation.name, logo: presentation.logo }
    case 'named':
      return { name: presentation.name, logo: null }
    case 'unknown':
      return { name: otherLabel, logo: null }
    default: {
      const _exhaustive: never = presentation
      return _exhaustive
    }
  }
}

/**
 * D-42-03: maps a `HumbleStoreLogoId` to the matching imported SVG
 * component. Explicit three-case lookup, never a default/fallback — never
 * routes through `StoreLogos` and never falls back to the GameLib icon
 * (that `default` branch is exactly the trap D-42-03 names). `null` means
 * "no logo asset exists for this platform" (origin/uplay/battlenet/
 * nintendo_direct) and renders nothing, never a substitute icon.
 */
function resolveStoreLogo(
  logoId: HumbleStoreLogoId | null
): typeof SteamLogo | null {
  if (logoId === null) {
    return null
  }
  switch (logoId) {
    case 'steam':
      return SteamLogo
    case 'gog':
      return GOGLogo
    case 'epic':
      return EpicLogo
    default: {
      const _exhaustive: never = logoId
      return _exhaustive
    }
  }
}

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
  /** D-42-01 (Phase 42): All-keys' Redeemed group ONLY — omitted
   * (undefined) everywhere else. Renders the reversal affordance for a key
   * the app settled from an exact-match Steam ownership signal
   * (`ClaimAnnotation.redeemedSource === 'ownership-exact'`). Scoped
   * deliberately: a key REDEEMED by the user's own "Mark as redeemed"
   * action already carries D-77's Undo in Keys-waiting via `claimAction`,
   * and such a key is never `ownedElsewhere`, so it always has a
   * Keys-waiting home (`viewFilters.ts:62`). This prop exists only because
   * an auto-settled key is `ownedElsewhere` and therefore CANNOT reach
   * Keys-waiting — it would otherwise have no Undo anywhere. */
  settleAction?: { settledAt: number; onUndoSettle: () => void }
}

// D-43-17 (Phase 43 plan 05): the row's interactivity contract, rewritten
// as a KEY-column contract rather than retired or extended. The old D-22
// premise — that the row was read-only apart from a small, fixed count of
// sanctioned exceptions — is retired — by the time this plan ran that
// count had grown and the premise described nothing real about the row.
// The invariant worth keeping is
// "interactivity lives in ONE place and nowhere else" — aimed at where the
// risk now actually is, since `KEY` (`.humbleKeyColumnCell`) is interactive
// in four of the UI-SPEC's five KEY-Column Scenario Matrix scenarios.
//
// New contract: `TYPE` (`.humbleKeyTypeCell`) and `GAME`
// (`.humbleKeyGameCell`) are strictly presentational — no click handler, no
// button/link element, no cursor:pointer, no reveal/copy/expand affordance.
// Every action lives in `KEY` and is one of: the D-42 "Not the same game"
// override (fuzzy-matched rows only) paired with its WR-04 (D-71,
// 14-REVIEW) undo-override counterpart (`undoOverride` prop, keyed off the
// override record existing); the optional `giftAction` prop (D-60,
// Giftable Spares scenario); the optional `claimAction` prop (D-67,
// Keys-waiting scenario) opening the claim wizard via the caller-supplied
// onClaim/onFinish/onUndoRedeem handlers; and the optional `settleAction`
// prop (D-42-01, an ownership-inferred settle) which cannot reuse
// `claimAction` because an `ownedElsewhere` key never reaches Keys-waiting
// (viewFilters.ts:62). Do not add an affordance outside `KEY` to satisfy
// some future request — move the KEY cell's contents instead, or extend
// the KEY-Column Scenario Matrix.
export default function HumbleKeyRow({
  humbleKey,
  urgencyTier,
  giftAction,
  claimAction,
  undoOverride,
  settleAction
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

  // D-42-03: table-driven store indicator, replacing the raw lowercase
  // key_type token ("steam · Humble RPG Bundle") with a proper display name
  // plus logo (when one exists). Resolved once here, near the other derived
  // locals, and consumed by the TYPE cell below.
  const platformPresentation = getKeyTypePresentation(humbleKey.platform)
  const platformDisplay = resolvePlatformDisplay(
    platformPresentation,
    tGamelib('gamelib:humbleKeys.platformOther', 'Other')
  )
  const PlatformLogo = resolveStoreLogo(platformDisplay.logo)

  return (
    <li className="humbleKeyRow">
      {/* Column 1 -- TYPE (43-UI-SPEC Column Geometry Contract, D-43-15).
          Always renders, including for UNPICKED rows, so the fixed 6.5rem
          TYPE track never changes width row to row and the GAME column's
          left edge never shifts. Holds either the branded-platform logo or
          (no-logo branch) the .humbleKeyRowCaption text label -- never
          both, and never for UNPICKED (D-43-02's `!isUnpicked` gate,
          unchanged, pinned by the UNPICKED test in
          __tests__/index.test.tsx). STRICTLY PRESENTATIONAL per the
          D-43-17 contract above: no click handler, no button/link
          element, no cursor:pointer, no callback-bearing prop. The logo
          is the row's only store signal on a branded row (the caption
          renders only on the no-logo branch), so it carries its own
          accessible name -- `role="img"` + `aria-label={platformDisplay
          .name}` -- rather than being hidden from assistive tech behind
          an adjacent caption. `role` is a literal (safe:
          `meta/hardcodedStringGate.ts`'s EXCLUDED_ATTRIBUTES);
          `aria-label` MUST stay an expression, never a literal
          (USER_FACING_ATTRIBUTES) -- it resolves to one of the
          untranslated proper nouns in `keyTypePresentation.ts`, which are
          marked do-not-translate in `meta/i18nGlossary.json`. */}
      <span className="humbleKeyTypeCell">
        {!isUnpicked && PlatformLogo && (
          <span
            className="humbleKeyRowStoreLogo"
            role="img"
            aria-label={platformDisplay.name}
          >
            <PlatformLogo />
          </span>
        )}
        {!isUnpicked && PlatformLogo === null && (
          // 260908-vo4: the caption renders ONLY for platforms with no logo
          // asset (`kind: 'named'` or `'unknown'`) -- a branded row emits no
          // caption element at all, the logo above is its sole store
          // signal. Content is the bare display name only: the
          // `· {{origin}}` bundle-label segment is dropped per the
          // operator's directive (20 of 33 live keys carry the gift string
          // "A very special gift just for you", which names no game and
          // must not survive as row text -- the game title in
          // .humbleKeyRowTitle (GAME cell) remains the row's single
          // label).
          //
          // `humbleKeys.rowCaption` (public/locales/en/translation.json --
          // upstream-owned) is now UNUSED but deliberately left in place,
          // not deleted: `meta/i18nCatalogChurnGuard.ts` throws
          // `UpstreamChurnError` on any changed path under `public/locales/`
          // that is not a gamelib.json/gamelib.mt.json leaf, so removing
          // this key from 49 locale files would redden CI for no behaviour
          // change. Do not "tidy" it away.
          <span className="humbleKeyRowCaption">{platformDisplay.name}</span>
        )}
      </span>
      {/* Column 2 -- GAME (D-43-15/D-43-16, 43-UI-SPEC Column Geometry
          Contract). The row's primary visual anchor: title plus
          UrgencyBadge, nothing else. The ownership badge and both override
          buttons now live in KEY (below), not here -- D-43-17 forbids any
          button/link in this cell. */}
      <div className="humbleKeyGameCell">
        <span className="humbleKeyRowTitle">{displayTitle}</span>
        <UrgencyBadge
          tier={urgencyTier ?? null}
          expiration={humbleKey.expiration}
        />
      </div>
      {/* Column 3 -- KEY (D-43-15/D-43-17, 43-UI-SPEC "KEY column internal
          layout"). Every interactive affordance on the row lives here. The
          status line (state badge + expiration) renders first, above
          whichever action content follows, uniformly across all five
          KEY-Column Scenario Matrix scenarios (D-43-15). */}
      <div className="humbleKeyColumnCell">
        <span className="humbleKeyStatusLine">
          <span
            className={`humbleKeyStateBadge humbleKeyStateBadge--${humbleKey.state}`}
          >
            {t(labelKey, labelDefault)}
          </span>
          {expirationLabel !== null && (
            <span className="humbleKeyRowExpiration">{expirationLabel}</span>
          )}
        </span>
        {humbleKey.ownedElsewhere && (
          <span className="humbleKeyOwnedBadge">
            {humbleKey.matchConfidence === 'exact'
              ? t('humbleKeys.ownedOnSteam', 'Owned on Steam')
              : t('humbleKeys.likelyOwnedOnSteam', 'Likely owned on Steam')}
            {/* D-42 KEY-column affordance: the "Not the same game"
                override, rendered only for fuzzy matches -- exact AppID
                matches are trusted, no override needed. */}
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
        {/* WR-04 (D-71, 14-REVIEW) KEY-column affordance: reversal
            counterpart of the "Not the same game" override above. Rendered
            when the caller says an override RECORD exists -- never gated
            on ownedElsewhere/fuzzy, which the override itself cleared (the
            overridden key now reads unowned/none). Under the unified list
            nothing moves between views anymore (D-43-14), which is what
            makes this pair simpler than it used to be, not harder: a
            mistaken override stays reversible on the same row it was made
            on, rather than needing to be chased into a different tab. */}
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
        {/* D-67 KEY-column affordance: rendered ONLY when the caller
            supplies a `claimAction` prop (C2 guard is the authoritative
            backstop; this is first-line UI restriction only, T-14-03).
            D-77 Undo affordance appears only while redeemedAt reflects a
            local-only mark (the caller's annotations source already
            guarantees this -- see HumbleLibrary.getClaimAnnotations).
            Pitfall C: an UNREVEALED key whose keyindex has not been
            resolved by a sync renders a non-interactive "Sync to enable
            claiming" caption instead of a button, so no wizard ever opens
            against a key it cannot reveal. */}
        {claimAction && (
          <span className="humbleKeyActionRow">
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
        {/* D-42-01 KEY-column affordance: rendered ONLY when the caller
            supplies a `settleAction` prop, for a key settled from an
            ownership-inferred REDEEM (never a user-marked one). Defensive
            `!claimAction` guard: settleAction and claimAction are mutually
            exclusive in practice (no caller supplies both -- an
            `ownedElsewhere` key never carries a `claimAction` prop, see
            Keys-waiting's `selectKeysWaiting`), but if both were ever
            present, claimAction's richer Keys-waiting affordance wins and
            this cell renders nothing rather than a duplicate Undo. */}
        {!claimAction && settleAction && (
          <span className="humbleKeyActionRow">
            <span className="humbleKeyClaimGroup">
              <span className="humbleKeyClaimAnnotation">
                {t('humbleKeys.redeemedAnnotation', 'Redeemed {{date}}', {
                  date: new Date(settleAction.settledAt).toLocaleDateString()
                })}
              </span>
              <span className="humbleKeyClaimAnnotation">
                {tGamelib(
                  'gamelib:humbleKeys.settledFromOwnership',
                  'Already in your Steam library'
                )}
              </span>
              <button
                type="button"
                className="humbleKeyUndoButton"
                onClick={settleAction.onUndoSettle}
              >
                {t('humbleKeys.undo', 'Undo')}
              </button>
            </span>
          </span>
        )}
        {/* D-60 KEY-column affordance: rendered ONLY when the caller
            supplies a `giftAction` prop. D-59 double-gift guard: once a
            gift has been confirmed for this key, show the annotation
            instead of re-rendering the button. */}
        {giftAction && (
          <span className="humbleKeyActionRow">
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
      </div>
    </li>
  )
}
