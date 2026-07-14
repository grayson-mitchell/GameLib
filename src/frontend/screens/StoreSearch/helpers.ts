import type { StoreOwnershipMatch } from 'common/discounts/badges'

/**
 * Pure presentational helpers for the aggregated store-search screen
 * (Phase 20 Plan 05). No React, no i18n runtime — the row/breakdown
 * components call `t()` themselves with the key/defaultValue/values this
 * file returns, so these helpers stay unit-testable in isolation.
 */

/**
 * D-13/STORESEARCH-04 (CORRECTNESS): every rendered price is a SINGLE text
 * node of the exact shape `${amount} ${currencyCode}` (e.g. "$14.99 USD").
 * The caller renders this as ONE string in ONE element — never split into a
 * muted/smaller/separate "USD" span (see 20-UI-SPEC.md Currency Contract).
 * Does not reformat/round `amount` — CheapShark's decimal strings pass
 * through verbatim, so a whole-number price like "9" renders as "$9 USD",
 * never fabricating a trailing ".00".
 */
export function formatUsdPrice(amount: string, currencyCode: string): string {
  return `$${amount} ${currencyCode}`
}

/** Internal store id -> the fixed D-05/D-06 display name + resolution order. */
const STORE_DISPLAY_NAME: Record<StoreOwnershipMatch['store'], string> = {
  steam: 'Steam',
  gog: 'GOG',
  legendary: 'Epic',
  nile: 'Amazon'
}

const STORE_ORDER: StoreOwnershipMatch['store'][] = [
  'steam',
  'gog',
  'legendary',
  'nile'
]

/**
 * The i18n key + defaultValue + interpolation values the row passes straight
 * to `t()` — kept as data (not a pre-rendered string) so the row owns the
 * actual translation call and this helper stays framework-free.
 */
export type OwnedBadgeLabel =
  | {
      key: 'storeSearch.badge.ownedOn'
      defaultValue: string
      values: { store: string }
    }
  | {
      key: 'storeSearch.badge.ownedOnMulti'
      defaultValue: string
      values: { stores: string }
    }
  | {
      key: 'storeSearch.badge.ownedOnOverflow'
      defaultValue: string
      values: { stores: string; count: number }
    }

/**
 * D-04: owned badge copy always names the store(s), never a bare "Owned".
 * D-06: stores are always presented in the fixed Steam, GOG, Epic, Amazon
 * order (re-sorted here defensively even though `resolveStoreSearchBadges`
 * already pushes them in that order — this helper must not trust caller
 * ordering to keep the cap/overflow deterministic).
 * D-06: caps at the first 2 stores with a "+N more" overflow suffix beyond
 * that — reuses the exact 20-CONTEXT.md D-06 example verbatim (never a
 * different cap number).
 * Returns null when there is no ownership match at all (no badge element —
 * missing beats wrong, matching `common/discounts/badges.ts`'s convention).
 */
export function buildOwnedBadgeLabel(
  owned: StoreOwnershipMatch[]
): OwnedBadgeLabel | null {
  if (owned.length === 0) {
    return null
  }

  const ordered = [...owned].sort(
    (a, b) => STORE_ORDER.indexOf(a.store) - STORE_ORDER.indexOf(b.store)
  )
  const names = ordered.map((match) => STORE_DISPLAY_NAME[match.store])

  if (names.length === 1) {
    return {
      key: 'storeSearch.badge.ownedOn',
      defaultValue: 'Owned on {{store}}',
      values: { store: names[0] }
    }
  }

  if (names.length === 2) {
    return {
      key: 'storeSearch.badge.ownedOnMulti',
      defaultValue: 'Owned on {{stores}}',
      values: { stores: names.join(', ') }
    }
  }

  const capped = names.slice(0, 2)
  const remaining = names.length - 2
  return {
    key: 'storeSearch.badge.ownedOnOverflow',
    defaultValue: 'Owned on {{stores}} +{{count}} more',
    values: { stores: capped.join(', '), count: remaining }
  }
}
