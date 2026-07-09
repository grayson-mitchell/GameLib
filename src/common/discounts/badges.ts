import { HumbleKey } from '../types/humble'

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
