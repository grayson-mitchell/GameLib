import { ReactNode } from 'react'
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
  getGameLibLoginStore,
  getKeyTypePresentation,
  HumbleKeyTypePresentation,
  HumbleStoreLogoId,
  isKeylessKeyType
} from 'common/humble/keyTypePresentation'
import { isGiftableSpare } from 'common/humble/viewFilters'
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
   * row that actually needs it. This row calls
   * window.api.humbleClearOwnershipOverride directly (mirroring the
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
  /** D-43-12 (Phase 43 plan 06): the caller's answer to "is GameLib
   * connected to this key's login store?" — `true`/`false` when
   * `getGameLibLoginStore(humbleKey.platform)` names a store (steam/gog/
   * epic family) and the caller has read that store's `ContextProvider`
   * `username`, `undefined` when the platform has no login store at all.
   * The row never reads `ContextProvider` itself (it never has — that is
   * the only reason its component tests can invoke it as a plain function
   * with no provider tree), so this is threaded in rather than looked up
   * here. Deliberately re-verified against `getGameLibLoginStore` inside
   * `resolveKeyScenario` below (D-43-13): a caller mistake on this prop can
   * never make scenario 1 reachable for a platform with no login concept. */
  storeLoginConnected?: boolean
  /** Scenario 1 (D-43-12): "connect this store to GameLib first". */
  onLoginAndClaim?: () => void
  /** Scenario 5 / UNPICKED (D-43-02): opens Humble's own pick-a-game page. */
  onPickOnHumble?: () => void
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
// Every action lives in `KEY` and is exactly one of the enumerated
// `HumbleKeyScenarioId` cases below (D-43-17, Phase 43 plan 06). Do not add
// an affordance outside `KEY` to satisfy some future request — move the KEY
// cell's contents instead, or extend the KEY-Column Scenario Matrix.

/**
 * D-43-17/Phase 43 plan 06: the KEY column resolves to exactly one of these
 * eight scenarios through a single exhaustive switch (`renderKeyContent`
 * below) that fails `pnpm codecheck` if a ninth scenario is added without a
 * render branch. `'settled'`, `'override-pending'` and `'override-undo'`
 * correspond to the UI-SPEC's 4a/4b/4c rows; `'expired'` and `'pick'` are
 * the UNREDEEMABLE and UNPICKED non-scenario-4 rows; `'gift-only'` and
 * `'claim-and-gift'` are rows 3 and 2; `'login-and-claim'` is row 1.
 */
export type HumbleKeyScenarioId =
  | 'login-and-claim'
  | 'claim-and-gift'
  | 'gift-only'
  | 'settled'
  | 'override-pending'
  | 'override-undo'
  | 'expired'
  | 'pick'

/**
 * D-43-17/Phase 43 plan 06: the single exhaustive resolver deciding the KEY
 * column's contents. Order matches the UI-SPEC's KEY-Column Scenario Matrix
 * precedence exactly — each `if` below is a row of that table, checked in
 * the order the table intends them to short-circuit one another:
 *
 *  1. UNPICKED always wins (D-43-02) — no key, owned or not, ever shows an
 *     action button while the month hasn't been picked yet.
 *  2. UNREDEEMABLE always wins next (D-43-03) — "you lost it" is a
 *     different fact from "you have it", never folded into scenario 4.
 *  3. An exact-match auto-settle (Phase 42) beats a fuzzy-match override —
 *     an exact AppID match is trusted, no override question applies. Gated
 *     on `!hasClaimAction`, mirroring the pre-existing defensive
 *     `!claimAction && settleAction` guard this scenario replaces: no real
 *     caller supplies both props on the same key (an `ownedElsewhere` key
 *     never reaches Keys-waiting, so it never carries a `claimAction`), but
 *     if one ever did, `claimAction`'s richer Keys-waiting affordance must
 *     win outright rather than this branch racing it for the row.
 *  4. `undoOverride` and the fuzzy-match override question are mutually
 *     exclusive on the SAME row, keyed strictly on the override record's
 *     existence (`undoOverride`), never re-derived from the fuzzy/owned
 *     flags an override itself clears (D-43-14). This is what guarantees
 *     "Not the same game" and "Undo — I do own this game" never render
 *     together.
 *  5. An owned, not-yet-revealed key with only a gift action (no claim
 *     action) is a giftable spare (D-60) — claiming a game you already own
 *     elsewhere makes no sense, gifting it still does.
 *  6. Otherwise, for a live key with a claim action: D-43-13 re-verifies
 *     `getGameLibLoginStore` here (not just trusting the caller's
 *     `storeLoginConnected`) so scenario 1 is STRUCTURALLY unreachable for
 *     a platform with no GameLib login concept (uplay, battlenet, origin,
 *     origin_keyless, nintendo_direct, generic, and anything
 *     unrecognised) — the user keeps an action, GameLib never claims to
 *     know a login state it cannot observe.
 */
export function resolveKeyScenario(params: {
  humbleKey: Pick<
    HumbleKey,
    'state' | 'ownedElsewhere' | 'matchConfidence' | 'platform'
  >
  hasGiftAction: boolean
  hasClaimAction: boolean
  hasSettleAction: boolean
  undoOverride: boolean
  storeLoginConnected?: boolean
}): HumbleKeyScenarioId {
  const {
    humbleKey,
    hasGiftAction,
    hasClaimAction,
    hasSettleAction,
    undoOverride,
    storeLoginConnected
  } = params

  if (humbleKey.state === 'UNPICKED') {
    return 'pick'
  }
  if (humbleKey.state === 'UNREDEEMABLE') {
    return 'expired'
  }
  if (
    humbleKey.ownedElsewhere &&
    humbleKey.matchConfidence === 'exact' &&
    hasSettleAction &&
    !hasClaimAction
  ) {
    return 'settled'
  }
  if (undoOverride) {
    return 'override-undo'
  }
  if (humbleKey.ownedElsewhere && humbleKey.matchConfidence === 'fuzzy') {
    return 'override-pending'
  }
  // 260911-nyq: `isGiftableSpare` is the article, not a re-derivation. This
  // branch previously inlined its `ownedElsewhere && UNREVEALED` body, making
  // the spare rule a second mirror that could drift from the exported one.
  // The SPARE classification is still what selects scenario 3 (full-width
  // single gift button); the gift AFFORDANCE is a wider question, answered by
  // `isGiftable` at the caller.
  if (isGiftableSpare(humbleKey) && hasGiftAction && !hasClaimAction) {
    return 'gift-only'
  }
  if (hasClaimAction) {
    // D-43-11/REQ-43-24 (Phase 43 plan 09): gog_keyless's claim destination
    // never touches GameLib's own GOG connection -- the probe selected
    // candidate B (Phase 40 embedded browser pointed at Humble's own keys
    // page), which relies solely on the Humble session the login webview
    // already established. "Log into GOG and claim" would send the user to
    // connect a store the click never reaches, so this platform is excluded
    // from the login-and-claim branch outright and always gets the ordinary
    // claim-and-gift affordance instead.
    const loginStore = getGameLibLoginStore(humbleKey.platform)
    if (
      loginStore !== null &&
      storeLoginConnected === false &&
      humbleKey.platform !== 'gog_keyless'
    ) {
      return 'login-and-claim'
    }
  }
  return 'claim-and-gift'
}

// D-43-11/REQ-43-24: the SELECTED BRANCH named on `43-PROBE-D-43-11.md` is
// still candidate B -- Humble's own keys page in the Phase 40 embedded
// browser. What CHANGED (quick `260925-gnp`) is who opens it.
//
// This file used to carry `HUMBLE_KEYS_URL` and an `openHumbleKeysEmbed()`
// that called `window.api.storeEmbedOpen()` directly, computing bounds from
// `.App .content` with a `window.innerWidth/innerHeight` fallback. It read
// plausibly and it did not work: the embed opened with NO host route and NO
// slot, so nothing afterwards sized, showed or scroll-synced the native
// subview, and the button was completely unresponsive from the chair
// (`43-UAT.md` item 8, `major`). The lesson worth keeping is that the bug was
// never the RECTANGLE -- a second opener cannot be repaired by giving it a
// better rect, only by ceasing to be a second opener.
//
// The destination now arrives as `claimAction.onClaim` from `Keys/index.tsx`,
// which navigates to `/store-page?store-url=` and lets `useStoreEmbedHost`
// own the embed's whole lifetime. This component is back to having exactly
// ONE way to claim, and stays hook-free for its plain-function test harness.

export default function HumbleKeyRow({
  humbleKey,
  urgencyTier,
  giftAction,
  claimAction,
  undoOverride,
  settleAction,
  storeLoginConnected,
  onLoginAndClaim,
  onPickOnHumble
}: Props) {
  // 260823-op3, amended by quick 260919-9gu: fork-added strings live in the
  // fork-owned `gamelib` namespace (D-06 split-brain) — `translation.json` is
  // upstream-owned and the i18n churn guard fails CI on any write to it. Since
  // the `humbleKeys` block moved into `gamelib`, this component no longer
  // reads the upstream namespace at all, so the plain `t` hook that used to
  // sit alongside this one is gone.
  const { t: tGamelib } = useTranslation('gamelib')

  const isUnpicked = humbleKey.state === 'UNPICKED'
  const [labelKey, labelDefault] = STATE_LABEL_KEYS[humbleKey.state]

  // D-27 pseudo-entry: never blocks the row on a missing deadline (Pitfall
  // 2). The backend already folds the Choice month's human-readable name
  // into `title`, so we append the "not picked yet" qualifier rather than
  // re-deriving month/year (not carried on HumbleKey).
  const displayTitle = isUnpicked
    ? tGamelib(
        'gamelib:humbleKeys.unpickedTitle',
        '{{title}} · games not picked',
        {
          title: humbleKey.title
        }
      )
    : humbleKey.title

  // Per-state expiration text (live-UAT round 5): REDEEMED always renders
  // blank (a redeemed key's expiration is irrelevant); UNREDEEMABLE shows the
  // date when known, blank otherwise (the "Expired" badge already says it) —
  // never the "No expiration" placeholder. The decision itself is the pure,
  // unit-tested getExpirationDisplay; only the i18n mapping lives here.
  const display = getExpirationDisplay(humbleKey.state, humbleKey.expiration)
  const expirationLabel =
    display.kind === 'date'
      ? tGamelib('gamelib:humbleKeys.expiresOn', 'Expires {{date}}', {
          date: new Date(display.iso).toLocaleDateString()
        })
      : display.kind === 'no-deadline'
        ? tGamelib(
            'gamelib:humbleKeys.noDeadline',
            'No pick deadline available'
          )
        : display.kind === 'no-expiration'
          ? tGamelib('gamelib:humbleKeys.noExpiration', 'No expiration')
          : null // 'blank' — render nothing, not placeholder text

  const isSteam = humbleKey.platform === 'steam'
  // D-43-11/REQ-43-24 (Phase 43 plan 09): the probe measured Humble's reveal
  // endpoint definitively rejecting a real gog_keyless entitlement
  // (candidate A) -- a well-formed, successfully-parsed `success: false`
  // denial, not a schema failure. The selected branch (candidate B) opens
  // Humble's own keys page in the Phase 40 embedded store browser instead,
  // so this platform's claim button is relabelled and rewired below rather
  // than reusing `claimAction.onClaim`'s reveal-and-redeem call.
  const isGogKeyless = humbleKey.platform === 'gog_keyless'

  // 260925-j58: closed-set predicate over all three direct-redeem
  // key_types (gog_keyless / epic_keyless / origin_keyless), used by the
  // revealed arm below to withhold the code-assuming Finish-activation
  // button. Deliberately broader than `isGogKeyless` above, which answers
  // a different, narrower question (which CLAIM handler to wire).
  const isKeyless = isKeylessKeyType(humbleKey.platform)

  // D-42-03: table-driven store indicator, replacing the raw lowercase
  // key_type token ("steam · Humble RPG Bundle") with a proper display name
  // plus logo (when one exists). Resolved once here, near the other derived
  // locals, and consumed by the TYPE cell below (and by scenario 1's
  // {{store}} interpolation).
  const platformPresentation = getKeyTypePresentation(humbleKey.platform)
  const platformDisplay = resolvePlatformDisplay(
    platformPresentation,
    tGamelib('gamelib:humbleKeys.platformOther', 'Other')
  )
  const PlatformLogo = resolveStoreLogo(platformDisplay.logo)

  const scenario = resolveKeyScenario({
    humbleKey,
    hasGiftAction: giftAction !== undefined,
    hasClaimAction: claimAction !== undefined,
    hasSettleAction: settleAction !== undefined,
    undoOverride: undoOverride === true,
    storeLoginConnected
  })

  // D-42 KEY-column affordance: the "Not the same game" override, rendered
  // only for fuzzy matches -- exact AppID matches are trusted, no override
  // needed. D-43-14: gated on `scenario === 'override-pending'` rather than
  // the raw ownedElsewhere/fuzzy flags directly, so it can NEVER render
  // alongside its `'override-undo'` counterpart on the same row —
  // `resolveKeyScenario` already made the two mutually exclusive.
  const ownedBadge = humbleKey.ownedElsewhere && (
    <span className="humbleKeyOwnedBadge">
      {humbleKey.matchConfidence === 'exact'
        ? tGamelib('gamelib:humbleKeys.ownedOnSteam', 'Owned on Steam')
        : tGamelib(
            'gamelib:humbleKeys.likelyOwnedOnSteam',
            'Likely owned on Steam'
          )}
      {scenario === 'override-pending' && (
        <button
          type="button"
          className="humbleKeyOwnedOverride"
          onClick={() =>
            window.api.humbleSetOwnershipOverride(humbleKey.machineName)
          }
        >
          {tGamelib('gamelib:humbleKeys.notTheSameGame', 'Not the same game')}
        </button>
      )}
    </span>
  )

  // WR-04 (D-71, 14-REVIEW) KEY-column affordance: reversal counterpart of
  // the "Not the same game" override above. Rendered only when
  // `resolveKeyScenario` picked `'override-undo'` -- never gated on
  // ownedElsewhere/fuzzy directly, which the override itself cleared (the
  // overridden key now reads unowned/none). Under the unified list nothing
  // moves between views anymore (D-43-14), which is what makes this pair
  // simpler than it used to be, not harder: a mistaken override stays
  // reversible on the same row it was made on, rather than needing to be
  // chased into a different tab.
  const undoOverrideBadge = scenario === 'override-undo' && (
    <span className="humbleKeyOwnedBadge">
      <button
        type="button"
        className="humbleKeyOwnedOverride"
        onClick={() =>
          window.api.humbleClearOwnershipOverride(humbleKey.machineName)
        }
      >
        {tGamelib(
          'gamelib:humbleKeys.undoOwnershipOverride',
          'Undo — I do own this game'
        )}
      </button>
    </span>
  )

  // D-67 KEY-column affordance: rendered ONLY when `resolveKeyScenario`
  // picked `'claim-and-gift'` and the caller supplies a `claimAction` prop
  // (C2 guard is the authoritative backstop; this is first-line UI
  // restriction only, T-14-03). D-77 Undo affordance appears only while
  // redeemedAt reflects a local-only mark (the caller's annotations source
  // already guarantees this -- see HumbleLibrary.getClaimAnnotations).
  // Pitfall C: an UNREVEALED key whose keyindex has not been resolved by a
  // sync renders a non-interactive "Sync to enable claiming" caption
  // instead of a button, so no wizard ever opens against a key it cannot
  // reveal.
  const claimContent =
    scenario === 'claim-and-gift' &&
    claimAction &&
    (claimAction.redeemedAt !== null ? (
      <span className="humbleKeyClaimGroup">
        <span className="humbleKeyClaimAnnotation">
          {tGamelib(
            'gamelib:humbleKeys.redeemedAnnotation',
            'Redeemed {{date}}',
            {
              date: new Date(claimAction.redeemedAt).toLocaleDateString()
            }
          )}
        </span>
        <button
          type="button"
          className="humbleKeyUndoButton"
          onClick={claimAction.onUndoRedeem}
        >
          {tGamelib('gamelib:humbleKeys.undo', 'Undo')}
        </button>
      </span>
    ) : claimAction.revealedAt !== null || humbleKey.state === 'REVEALED' ? (
      isKeyless ? (
        // 260925-j58: a code-assuming affordance is never offered to a
        // keyless entitlement. "Finish activation" routes to
        // openWizard(key, 'finish') — the reveal/redeem wizard — and there
        // is no code for it to work on: Humble redeems a direct-redeem
        // entitlement straight to the linked store account
        // (classify.ts:174-181). Same rule as T-UIC-01's omission from
        // REDEEM_URL_BUILDERS and isGiftable's exclusion
        // (viewFilters.ts:142); third site.
        //
        // TWO CONSTRAINTS A LATER READER MUST NOT "SIMPLIFY" AWAY:
        //
        // 1. The annotation is not decoration, and a BARE SUPPRESSION IS
        //    WRONG. For a keyless key `claimAction.revealedAt` is always
        //    null — no local humbleRevealedStore record can exist for an
        //    entitlement that was never revealed — so the sibling arm's
        //    "Revealed {date}" annotation renders nothing. Hiding only the
        //    button would leave an EMPTY KEY cell and delete the row's
        //    only information. That is why this branch carries its own
        //    copy.
        // 2. Namechecking the store is correct HERE, unlike D-43-11's
        //    "Claim on Humble". That sibling string names the destination
        //    the CLICK reaches, and the click opens Humble's embed, not
        //    GOG's site. This string names where the entitlement actually
        //    LANDED. Different question, different correct answer.
        <span className="humbleKeyClaimGroup">
          <span className="humbleKeyClaimAnnotation">
            {tGamelib(
              'gamelib:humbleKeys.keylessClaimed',
              'Claimed on {{store}} — no key needed',
              { store: platformDisplay.name }
            )}
          </span>
        </span>
      ) : (
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
              {tGamelib(
                'gamelib:humbleKeys.revealedAnnotation',
                'Revealed {{date}}',
                {
                  date: new Date(claimAction.revealedAt).toLocaleDateString()
                }
              )}
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
              : tGamelib(
                  'gamelib:humbleKeys.finishActivation',
                  'Finish activation'
                )}
          </button>
        </span>
      )
    ) : claimAction.keyindexResolved ? (
      <button
        type="button"
        className="humbleKeyGiftButton"
        onClick={claimAction.onClaim}
      >
        {/* Steam keeps its one-click "Activate" verb verbatim (existing
            key, reused unchanged). gog_keyless names the destination the
            click actually reaches (D-43-11/D-43-12 honesty standard) --
            "Claim on Humble" -- never namechecking GOG's store here, because
            the embed opens Humble's site, not GOG's. Every other platform
            says "Claim on
            {{store}}" (D-43's copywriting contract) rather than the bare
            "Claim" — `humbleKeys.claim` is deliberately superseded here,
            not repurposed: a t() default-argument rename on the SAME key
            would be a silent no-op for existing translations. */}
        {isSteam
          ? tGamelib('gamelib:humbleKeys.activate', 'Activate')
          : isGogKeyless
            ? tGamelib('gamelib:humbleKeys.claimOnHumble', 'Claim on Humble')
            : tGamelib(
                'gamelib:humbleKeys.claimOnStore',
                'Claim on {{store}}',
                { store: platformDisplay.name }
              )}
      </button>
    ) : (
      <span className="humbleKeyClaimDisabledCaption">
        {tGamelib(
          'gamelib:humbleKeys.syncToEnableClaiming',
          'Sync to enable claiming'
        )}
      </span>
    ))

  // D-60 KEY-column affordance: rendered when `resolveKeyScenario` picked
  // `'gift-only'` or `'claim-and-gift'` and the caller supplies a
  // `giftAction` prop. D-59 double-gift guard: once a gift has been
  // confirmed for this key, show the annotation instead of re-rendering the
  // button.
  const giftContent =
    (scenario === 'gift-only' || scenario === 'claim-and-gift') &&
    giftAction &&
    (giftAction.giftedAt !== null ? (
      <span className="humbleKeyGiftedAnnotation">
        {tGamelib(
          'gamelib:humbleKeys.giftedAnnotation',
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
        {tGamelib('gamelib:humbleKeys.giftOnHumble', 'Gift on Humble')}
        <FontAwesomeIcon icon={faExternalLinkAlt} />
      </button>
    ))

  /**
   * D-43-17/Phase 43 plan 06: the single exhaustive switch deciding what
   * the KEY cell's action area renders, beyond the shared status line
   * (below). One case per `HumbleKeyScenarioId` member — the `never`
   * default fails `pnpm codecheck` if a ninth scenario is ever added
   * without a render branch here (T-43-20).
   */
  function renderKeyAction(): ReactNode {
    switch (scenario) {
      case 'pick':
        return (
          <button
            type="button"
            className="humbleKeyGiftButton"
            onClick={onPickOnHumble}
          >
            {tGamelib('gamelib:humbleKeys.pickOnHumble', 'Pick on Humble')}
          </button>
        )
      case 'expired':
        // D-43-03: no button of any kind. "You have it" and "you lost it"
        // are different facts — deliberately not folded into 'settled'.
        return null
      case 'settled':
        // D-42-01 (Phase 42), unchanged: the ownership badge (exact match,
        // no override question) plus the settle annotation and its Undo.
        return (
          <>
            {ownedBadge}
            {settleAction && (
              <span className="humbleKeyActionRow">
                <span className="humbleKeyClaimGroup">
                  <span className="humbleKeyClaimAnnotation">
                    {tGamelib(
                      'gamelib:humbleKeys.redeemedAnnotation',
                      'Redeemed {{date}}',
                      {
                        date: new Date(
                          settleAction.settledAt
                        ).toLocaleDateString()
                      }
                    )}
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
                    {tGamelib('gamelib:humbleKeys.undo', 'Undo')}
                  </button>
                </span>
              </span>
            )}
          </>
        )
      case 'override-pending':
        return ownedBadge
      case 'override-undo':
        return undoOverrideBadge
      case 'gift-only':
        return (
          giftContent && (
            <span className="humbleKeyActionRow">{giftContent}</span>
          )
        )
      case 'login-and-claim':
        // D-43-12: ONE full-width button. Means "connect this store to
        // GameLib first" -- always true about GameLib's own state, never a
        // guarantee the redeem page on the store's OWN website will work
        // (GameLib cannot observe that session). Do not word this, or test
        // it, as though it were predictive of the store website.
        return (
          <button
            type="button"
            className="humbleKeyGiftButton"
            onClick={onLoginAndClaim}
          >
            {tGamelib(
              'gamelib:humbleKeys.loginAndClaim',
              'Log into {{store}} and claim',
              { store: platformDisplay.name }
            )}
          </button>
        )
      case 'claim-and-gift':
        // UI-SPEC Column Geometry Contract: the claim/activate control and
        // the gift control sit side by side in ONE `.humbleKeyActionRow`
        // (each `flex: 1 1 8.5rem`) when both are present.
        return (
          (claimContent || giftContent) && (
            <span className="humbleKeyActionRow">
              {claimContent}
              {giftContent}
            </span>
          )
        )
      default: {
        const _exhaustive: never = scenario
        return _exhaustive
      }
    }
  }

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
          layout"). Every interactive affordance on the row lives here,
          decided by exactly one of the `HumbleKeyScenarioId` cases above
          (D-43-17, Phase 43 plan 06). The status line (state badge +
          expiration) renders first, above whichever action content
          follows, uniformly across every scenario except 'pick' — D-43-02:
          UNPICKED has no separate state badge, only the single
          "No pick deadline available" (or known deadline date) line. */}
      <div className="humbleKeyColumnCell">
        {scenario === 'pick' ? (
          expirationLabel !== null && (
            <span className="humbleKeyStatusLine">
              <span className="humbleKeyRowExpiration">{expirationLabel}</span>
            </span>
          )
        ) : (
          <span className="humbleKeyStatusLine">
            <span
              className={`humbleKeyStateBadge humbleKeyStateBadge--${humbleKey.state}`}
            >
              {tGamelib(labelKey, labelDefault)}
            </span>
            {expirationLabel !== null && (
              <span className="humbleKeyRowExpiration">{expirationLabel}</span>
            )}
          </span>
        )}
        {renderKeyAction()}
      </div>
    </li>
  )
}
