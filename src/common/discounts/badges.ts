import { HumbleKey } from '../types/humble'
import { fuzzyMatch } from '../matching/titleMatch'

/**
 * Pure exact-match ownership badge resolution for the native Discounts
 * screen (D-78..D-85, Phase 15). Kept in common/ (no React, no i18n, no I/O)
 * so it is unit-testable from the backend jest project — the frontend
 * `Discounts/index.tsx` container computes the `titleToAppId`/`ownedAppIds`
 * maps once and passes them here per product; `DiscountCard` only renders
 * the returned literal.
 *
 * Exact-normalized-title match ONLY (T-15-01-01) — a near-but-not-identical
 * title never falls back to a badge; missing beats wrong (D-79/D-82). A
 * crafted/colliding GOG catalog title cannot silently borrow an unrelated
 * AppID beyond an exact string match.
 */
export type DiscountBadge = 'owned' | 'key-available' | null

/**
 * Same normalization as the existing `ownedTitles` memo in
 * Discounts/index.tsx — `.trim().toLowerCase()`, nothing fancier.
 */
function normalize(title: string): string {
  return title.trim().toLowerCase()
}

/**
 * D-83: exact title→AppID→steam.library match wins outright ('owned'), even
 * when a waiting key also exists for the same AppID (D-85, Owned wins —
 * single badge per card). D-84: otherwise, a 'key-available' badge only when
 * some `keysWaiting` entry carries a USABLE (non-falsy) `steamAppId` that
 * exactly equals the resolved AppID — mirrors dedup.ts's exact-branch falsy
 * guard (WR-01) so an empty-string/'0'/undefined `steamAppId` never matches.
 * D-79/D-82: no exact title match at all → null, never a near-match fallback.
 */
export function resolveDiscountBadge(
  product: { title: string },
  titleToAppId: Map<string, string>,
  ownedAppIds: Set<string>,
  keysWaiting: HumbleKey[]
): DiscountBadge {
  const appId = titleToAppId.get(normalize(product.title))
  if (appId === undefined) {
    return null
  }
  if (ownedAppIds.has(appId)) {
    return 'owned'
  }
  const hasWaitingKey = keysWaiting.some(
    (k) =>
      k.steamAppId !== undefined &&
      k.steamAppId !== '' &&
      k.steamAppId !== '0' &&
      k.steamAppId === appId
  )
  return hasWaitingKey ? 'key-available' : null
}

/**
 * CR-01 fix: builds the two maps `resolveDiscountBadge` needs, from a SINGLE
 * shared helper consumed by both the Discounts container and its tests —
 * closing the "hand-decoupled fixtures" gap that let the 'key-available'
 * branch ship structurally unreachable (the container previously derived
 * both `titleToSteamAppId` and `ownedSteamAppIds` from steam.library alone,
 * so any AppID that resolved was always already "owned").
 *
 * `titleToAppId`: steam.library entries first (first-wins on a duplicate
 * normalized title, unchanged from prior container logic), THEN each waiting
 * Humble key with a USABLE (non-falsy) `steamAppId` fills in a normalized
 * title that isn't already present — steam.library always wins on collision,
 * so an owned title never gets displaced by a keyed one (D-83/D-85). The
 * falsy guard mirrors resolveDiscountBadge's own ('' / '0' / undefined).
 *
 * `ownedAppIds`: steam.library ONLY, never merged with Humble keys — this is
 * what keeps an unowned-but-keyed AppID present in `titleToAppId` while
 * ABSENT from `ownedAppIds`, making the 'key-available' branch reachable.
 */
export function buildDiscountBadgeMaps(
  steamLibrary: { title?: string; app_name: string }[],
  humbleKeys: HumbleKey[]
): { titleToAppId: Map<string, string>; ownedAppIds: Set<string> } {
  const titleToAppId = new Map<string, string>()
  for (const game of steamLibrary) {
    const key = game.title ? normalize(game.title) : ''
    if (key && !titleToAppId.has(key)) {
      titleToAppId.set(key, game.app_name)
    }
  }
  for (const humbleKey of humbleKeys) {
    if (
      humbleKey.steamAppId === undefined ||
      humbleKey.steamAppId === '' ||
      humbleKey.steamAppId === '0'
    ) {
      continue
    }
    const key = normalize(humbleKey.title)
    if (key && !titleToAppId.has(key)) {
      titleToAppId.set(key, humbleKey.steamAppId)
    }
  }

  const ownedAppIds = new Set(steamLibrary.map((g) => g.app_name))

  return { titleToAppId, ownedAppIds }
}

/**
 * Store-attributed, multi-badge ownership resolution for the aggregated
 * store-search surface (Phase 20, STORESEARCH-05/06). Deliberately departs
 * from `resolveDiscountBadge`'s single-badge/exact-only contract above —
 * that resolver stays byte-for-byte unchanged; this is a NEW sibling export,
 * not a modification.
 *
 * D-01: Steam ownership is an EXACT `steamAppID` ID-join ONLY — fuzzyMatch
 * is never called against the Steam library. A CheapShark result whose
 * title fuzzy-matches a steam.library game but whose `steamAppId` does not
 * equal that game's `app_name` yields NO steam badge; a result with no
 * `steamAppId` at all can never yield a steam badge. This mirrors T-20-03's
 * mitigation: a wrong Steam badge is a spoofing risk a title collision must
 * never produce.
 *
 * D-02: GOG/Epic('legendary')/Amazon('nile') ownership is resolved by fuzzy
 * title match reusing the SAME shared `fuzzyMatch` (85% `titleSimilarity` +
 * `isDlcFalsePositiveRisk` guard) as `backend/humble/dedup.ts` — imported
 * from `common/matching/titleMatch.ts` (Plan 01's single-sourced matcher),
 * never re-implemented here.
 *
 * D-04: the return value is WHICH store(s) matched (`StoreOwnershipMatch[]`),
 * not a boolean — the UI names them ("Owned on GOG"), which a plain boolean
 * cannot express.
 *
 * D-06: `owned` entries are pushed in the fixed deterministic order Steam,
 * GOG, Epic(legendary), Amazon(nile) so the UI's cap/overflow ("+N more")
 * is stable across renders.
 *
 * D-07: `keyAvailable` is computed independently of `owned` and is never
 * suppressed by an ownership match — a result can be BOTH owned on GOG AND
 * have a waiting Humble key (unlike `resolveDiscountBadge`'s "Owned wins,
 * single badge" contract, which does not apply here).
 */
export interface StoreOwnershipMatch {
  store: 'steam' | 'gog' | 'legendary' | 'nile'
  confidence: 'exact' | 'fuzzy'
}

export function resolveStoreSearchBadges(
  result: { title: string; steamAppId?: string },
  libraries: {
    steam: { app_name: string }[]
    gog: { title: string }[]
    epic: { title: string }[]
    amazon: { title: string }[]
  },
  keysWaiting: HumbleKey[]
): { owned: StoreOwnershipMatch[]; keyAvailable: boolean } {
  const owned: StoreOwnershipMatch[] = []

  const hasUsableSteamAppId =
    result.steamAppId !== undefined &&
    result.steamAppId !== '' &&
    result.steamAppId !== '0'

  // D-01: EXACT steamAppID join ONLY — never fuzzyMatch against Steam.
  if (
    hasUsableSteamAppId &&
    libraries.steam.some((g) => g.app_name === result.steamAppId)
  ) {
    owned.push({ store: 'steam', confidence: 'exact' })
  }

  // D-02/D-06: fuzzy title match, fixed order GOG, Epic(legendary), Amazon(nile).
  const fuzzyLibs: Array<['gog' | 'legendary' | 'nile', { title: string }[]]> =
    [
      ['gog', libraries.gog],
      ['legendary', libraries.epic],
      ['nile', libraries.amazon]
    ]
  for (const [store, lib] of fuzzyLibs) {
    if (lib.some((g) => fuzzyMatch(result.title, g.title))) {
      owned.push({ store, confidence: 'fuzzy' })
    }
  }

  // D-07: independent signal, never suppressed by an ownership match.
  const keyAvailable = keysWaiting.some((k) => {
    const hasUsableKeyAppId =
      k.steamAppId !== undefined && k.steamAppId !== '' && k.steamAppId !== '0'
    if (
      hasUsableSteamAppId &&
      hasUsableKeyAppId &&
      k.steamAppId === result.steamAppId
    ) {
      return true
    }
    return fuzzyMatch(result.title, k.title)
  })

  return { owned, keyAvailable }
}
