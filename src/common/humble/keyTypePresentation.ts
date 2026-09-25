import { GENERIC_KEY_PLATFORM } from './genericKeyPlatform'

/**
 * Pure `key_type` -> (how it renders, where it redeems) table (D-42-03).
 * Kept in common/ (no React, no i18n, no I/O) so it is unit-testable from
 * the backend jest project. Feeds two frontend consumers: `HumbleKeyRow`'s
 * store-indicator caption and `HumbleClaimWizard`'s redeem action. It
 * subsumes three call sites that today spell platform interpretation ad hoc
 * and inconsistently: `HumbleKeyRow/index.tsx:230` (raw lowercase token in
 * the caption), `HumbleClaimWizard`'s "Redeem on {{platform}}" label, and
 * the wizard's Steam-vs-help URL fork at `HumbleClaimWizard/index.tsx:648`/
 * `:662`.
 */

// D-42-03: the true fallback for every platform with no evidenced deep
// link. NO per-key value is ever interpolated into this string — this is
// the D-68/T-14-09 constraint, preserved.
export const HUMBLE_REDEEM_HELP_URL =
  'https://support.humblebundle.com/hc/en-us'

/**
 * The store logos that actually EXIST in `src/frontend/assets/`
 * (`steam-logo.svg`, `gog-logo.svg`, `epic-logo.svg`). There is no
 * `uplay-logo.svg`, `battlenet-logo.svg`, `origin-logo.svg` or
 * `nintendo-logo.svg` in the repo — the "no logo, text only" branch is the
 * only correct rendering for those platforms, not a shortcut.
 *
 * This union is deliberately NOT `Runner` from `common/types`: `Runner` is
 * GameLib's installable-platform union, its `StoreLogos` switch has a
 * `default` branch that returns the GameLib icon, and D-42-03 names that
 * exact fall-through as "the trap". Do not import `Runner` and do not
 * extend it.
 */
export type HumbleStoreLogoId = 'steam' | 'gog' | 'epic'

/**
 * How a `key_type` presents in the UI. Three-way partition:
 *  - 'branded': has both a proper display name AND a logo that exists in
 *    frontend/assets (steam, gog, epic/epic_keyless).
 *  - 'named': has a proper display name but NO logo asset exists for it
 *    (origin/origin_keyless, uplay, battlenet, nintendo_direct) — text
 *    only, never a substitute icon.
 *  - 'unknown': neither a name nor a logo is fabricated. Reached for the
 *    explicit `'generic'` sentinel AND for any unrecognised key_type — both
 *    resolve to this SAME case. The neutral display label ("Other") is the
 *    caller's i18n concern; this module has no i18n, per the tier
 *    convention (see groupKeys.ts/viewFilters.ts).
 */
export type HumbleKeyTypePresentation =
  | { kind: 'branded'; name: string; logo: HumbleStoreLogoId }
  | { kind: 'named'; name: string }
  | { kind: 'unknown' }

/**
 * Where a `key_type` + revealed code redeems:
 *  - 'deep-link': a real, prefilled URL for a platform with an evidenced
 *    redemption endpoint (steam, gog only).
 *  - 'help': the static Humble help URL, with the code deliberately
 *    dropped. Every other key_type — including 'generic' and anything
 *    unrecognised — lands here.
 *
 * Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
 * flagged the previously-exported form as a used-in-module finding -- there
 * is no external consumer, so the export served no purpose).
 */
type HumbleRedeemTarget =
  | { kind: 'deep-link'; url: string }
  | { kind: 'help'; url: string }

// D-42-03 tier 1: branded — proper name + a logo asset that exists.
// D-42-03 tier 2: named — proper name, no logo asset exists for this
// platform; text only, never a substitute icon.
// D-42-03 tier 3: explicitly unknown — the literal GENERIC_KEY_PLATFORM
// value from ./genericKeyPlatform is an EXPLICIT entry here, not left to fall
// through by absence.
//
// Display names are the ONLY strings in this module and are untranslated
// proper nouns — do-not-translate per meta/i18nGlossary.json — which is why
// they live here rather than in a locale catalog. This file is not in
// meta/i18nGateScope.json (that list covers frontend components only).
// Only the neutral "Other" label for `{ kind: 'unknown' }` is translatable,
// and that lives at the frontend render site (plan 42-04), not here.
// Each of these names is a one-key edit with no behaviour attached —
// changing a name never changes a URL or a logo.
const KEY_TYPE_PRESENTATIONS: Record<string, HumbleKeyTypePresentation> = {
  steam: { kind: 'branded', name: 'Steam', logo: 'steam' },
  gog: { kind: 'branded', name: 'GOG', logo: 'gog' },
  // QT-260908-UIC-01 (2026-09-08): GOG's direct-redeem entitlement shape —
  // no key code exists, Humble redeems straight to the linked GOG account.
  // Branded/logo like keyed `gog`, but deliberately absent from
  // REDEEM_URL_BUILDERS below (see the T-UIC-01 note there). Precedent:
  // `epic_keyless` follows the identical branded-but-no-deep-link shape.
  gog_keyless: { kind: 'branded', name: 'GOG', logo: 'gog' },
  epic: { kind: 'branded', name: 'Epic Games', logo: 'epic' },
  epic_keyless: { kind: 'branded', name: 'Epic Games', logo: 'epic' },
  origin: { kind: 'named', name: 'Origin' },
  origin_keyless: { kind: 'named', name: 'Origin' },
  uplay: { kind: 'named', name: 'Ubisoft Connect' },
  battlenet: { kind: 'named', name: 'Battle.net' },
  nintendo_direct: { kind: 'named', name: 'Nintendo' },
  [GENERIC_KEY_PLATFORM]: { kind: 'unknown' }
}

/**
 * Resolves a raw Humble `key_type` to its presentation. A miss returns the
 * explicit unknown case (D-42-03: never a fabricated name, never the
 * GameLib icon) — the SAME case `'generic'` maps to above.
 */
export function getKeyTypePresentation(
  keyType: string
): HumbleKeyTypePresentation {
  const found = KEY_TYPE_PRESENTATIONS[keyType]
  if (found) {
    return found
  }
  return { kind: 'unknown' }
}

// Only these two key_types have an evidenced redemption endpoint (D-42-03
// scope item 3). Deep links are selected from this closed set of two
// hard-coded templates keyed on the literals below — a hostile key_type
// (including a full URL string) can never reach a fabricated URL because it
// can only ever match one of these two exact keys or fall through to help.
//
// T-UIC-01: `gog_keyless` is DELIBERATELY ABSENT here even though it is
// branded above — a keyless entitlement has no key code, so any URL built
// for it would be broken or would carry a secret it should not. It falls
// through to the help URL via the same closed-set miss as every other
// unlisted key_type.
const REDEEM_URL_BUILDERS: Record<string, (code: string) => string> = {
  steam: (code) =>
    `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(
      code
    )}`,
  gog: (code) => `https://www.gog.com/redeem/${encodeURIComponent(code)}`
}

/**
 * Resolves a raw Humble `key_type` + revealed code to either a real
 * prefilled redeem URL (steam, gog — the only evidenced endpoints) or the
 * static help URL. Logo presence (HumbleKeyTypePresentation) and deep-link
 * presence are INDEPENDENT axes — 'epic' has a logo and NO deep link; do
 * not couple them into one field.
 *
 * T-42-01: on the help branch, `code` is DELIBERATELY UNUSED — dropping it
 * is load-bearing. The fallback URL must never carry the secret key value.
 *
 * This module never logs, never touches `console`, and never imports the
 * logger (D-76/C4 never-log-a-key discipline) — `code` is a secret and this
 * is the only pure module that handles it.
 */
export function getRedeemTarget(
  keyType: string,
  code: string
): HumbleRedeemTarget {
  const builder = REDEEM_URL_BUILDERS[keyType]
  if (builder) {
    return { kind: 'deep-link', url: builder(code) }
  }
  return { kind: 'help', url: HUMBLE_REDEEM_HELP_URL }
}

// 260925-j58: keyless-ness is a THIRD independent axis, not derivable from
// the two tables above. `gog_keyless` is branded (KEY_TYPE_PRESENTATIONS),
// HAS a GameLib login store (GAMELIB_LOGIN_STORES), has NO deep link
// (REDEEM_URL_BUILDERS), and is keyless — all four at once. `epic` is
// branded and has a login store and is NOT keyless. Reading any one of
// these axes off another ships a wrong answer.
//
// The three literals are attested by KNOWN_GAME_KEY_TYPES
// (src/backend/humble/classify.ts:183) — they are exactly its three
// `_keyless` members. This is a CLOSED SET, in the same spirit as
// REDEEM_URL_BUILDERS and GAMELIB_LOGIN_STORES above, and deliberately NOT
// a `_keyless` suffix test (nor any regex): a suffix match would admit an
// unrecognised, possibly hostile key_type into a UI branch that SUPPRESSES
// an affordance. A miss here can only fall through to the keyed path,
// which is the safe direction. Pinned by the `foo_keyless -> false`
// assertion in the backend suite.
const KEYLESS_KEY_TYPES: Record<string, true> = {
  gog_keyless: true,
  epic_keyless: true,
  origin_keyless: true
}

/**
 * True when a raw Humble `key_type` names a DIRECT-REDEEM entitlement —
 * one Humble grants straight to the linked store account, with no key code
 * ever existing (classify.ts:174-181).
 *
 * This generalises two decisions already taken independently: T-UIC-01,
 * which omits `gog_keyless` from `REDEEM_URL_BUILDERS` because "a keyless
 * entitlement has no key code", and `isGiftable`'s exclusion of it
 * (viewFilters.ts:142) because offering a gift "would promise a hand-off
 * the user cannot complete". The rule both express is the same one: a
 * code-assuming affordance is never offered to a keyless entitlement.
 * Callers use this to withhold such an affordance — never to withhold
 * INFORMATION, since a suppressed button must still leave the cell saying
 * something true.
 */
export function isKeylessKeyType(keyType: string): boolean {
  return KEYLESS_KEY_TYPES[keyType] === true
}

/**
 * The three stores GameLib itself can be connected to (D-43-12/D-43-13,
 * Phase 43 plan 06). This is deliberately NOT the same axis as
 * `HumbleStoreLogoId` or `REDEEM_URL_BUILDERS` — it answers a different
 * question ("does GameLib have a login concept for this key_type at all?"),
 * not "does a logo asset exist" or "does a deep link exist".
 */
export type HumbleGameLibLoginStore = 'steam' | 'gog' | 'epic'

// D-43-12/D-43-13: closed key_type -> GameLib-login-store table, in the
// same closed-set spirit as REDEEM_URL_BUILDERS above — a hostile or
// unrecognised key_type can only ever match one of these exact literals or
// fall through to `null`, never a fabricated store id.
const GAMELIB_LOGIN_STORES: Record<string, HumbleGameLibLoginStore> = {
  steam: 'steam',
  gog: 'gog',
  // T-UIC-01 precedent (see REDEEM_URL_BUILDERS' note above): gog_keyless
  // is branded like `gog` and shares its login store, even though it has
  // no deep link. Login-store presence and deep-link presence are
  // independent axes.
  gog_keyless: 'gog',
  epic: 'epic',
  epic_keyless: 'epic'
}

/**
 * Resolves a raw Humble `key_type` to the `ContextProvider` store slice
 * whose `username` field answers "is GameLib connected to this platform?"
 * (D-43-12). `null` means GameLib has no connectable account for this
 * platform at all — `origin`, `origin_keyless`, `uplay`, `battlenet`,
 * `nintendo_direct`, `generic`, and any unrecognised `key_type` all land
 * here (D-43-13).
 *
 * **Read this return value honestly (D-43-12), because a future reader who
 * treats it as a session predicate will ship a lie in the UI:** a non-null
 * value names WHICH `ContextProvider` slice (`steam.username` /
 * `gog.username` / `epic.username`, `frontend/types.ts:90-121`) to check —
 * it does not itself observe anything. A truthy `username` on that slice
 * means GameLib's own connection to that store is live (e.g. a `steam-user`
 * CM session with a refresh token). It is NOT a guarantee that the user has
 * a live session on the store's OWN WEBSITE — the redeem URL opens in a
 * completely separate browser context that GameLib cannot see into. The
 * only honest claim a caller may build on this value is "GameLib is
 * connected to this store", never "you are logged into {{store}}.com".
 */
export function getGameLibLoginStore(
  keyType: string
): HumbleGameLibLoginStore | null {
  return GAMELIB_LOGIN_STORES[keyType] ?? null
}
