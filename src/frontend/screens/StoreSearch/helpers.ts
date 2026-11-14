import type { StoreOwnershipMatch } from 'common/discounts/badges'
import { toI18nextCode } from 'common/languages'

/**
 * Pure presentational helpers for the aggregated store-search screen
 * (Phase 20 Plan 05). No React, no i18n runtime — the row/breakdown
 * components call `t()` themselves with the key/defaultValue/values this
 * file returns, so these helpers stay unit-testable in isolation.
 */

/**
 * Currency Contract (47-UI-SPEC): every rendered price is ONE string in ONE
 * text node -- the locale-correct symbol/placement from Intl plus the ISO
 * code, appended only when Intl did not already print it. The caller renders
 * it in a single element; never split the code into its own span. An unusable
 * currency code never throws; it renders `${amount} ${currencyCode}`.
 */
export function formatPrice(
  amount: string,
  currencyCode: string,
  language: string
): string {
  try {
    const formatted = new Intl.NumberFormat(toI18nextCode(language), {
      style: 'currency',
      currency: currencyCode
    }).format(Number(amount))
    return formatted.includes(currencyCode)
      ? formatted
      : `${formatted} ${currencyCode}`
  } catch {
    return `${amount} ${currencyCode}`
  }
}

/** PRICE-03: absolute (not relative) date+time of the cached result. */
export function formatCachedAt(cachedAt: number, language: string): string {
  try {
    return new Intl.DateTimeFormat(toI18nextCode(language), {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(cachedAt)
  } catch {
    return new Date(cachedAt).toLocaleString()
  }
}

/** Localized region name for a 2-letter code; falls back to the raw code. */
export function formatCountryName(
  countryCode: string,
  language: string
): string {
  try {
    return (
      new Intl.DisplayNames([toI18nextCode(language)], {
        type: 'region'
      }).of(countryCode) ?? countryCode
    )
  } catch {
    try {
      return (
        new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) ??
        countryCode
      )
    } catch {
      return countryCode
    }
  }
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
 * actual translation call and this helper stays framework-free. `values` is
 * intentionally a homogeneous `Record` (rather than a discriminated union
 * keyed off `key`) so a single `t(label.key, label.defaultValue,
 * label.values)` call at the render site type-checks against react-i18next's
 * `TFunction` overloads without a per-key switch.
 *
 * Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
 * flagged the previously-exported form as a used-in-module finding -- there
 * is no external consumer, so the export served no purpose).
 */
interface OwnedBadgeLabel {
  key:
    | 'storeSearch.badge.ownedOn'
    | 'storeSearch.badge.ownedOnMulti'
    | 'storeSearch.badge.ownedOnOverflow'
  defaultValue: string
  values: Record<string, string | number>
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
// i18n-gate-exempt: 34.8-10 -- this function's returned `key`/`defaultValue`/`values` object
// IS consumed through `t(ownedLabel.key, ownedLabel.defaultValue, ownedLabel.values)` at
// StoreSearchRow/index.tsx:48 (verified by direct read), a real i18n call site one
// function-return/call-site hop deeper than the gate's same-file reference-tracing
// (`isAssignedThenPassedToT`) reaches -- it only follows a binding within the SAME source
// file, never across a function boundary into a different file. Confirmed already-compliant
// in 34.8-AUDIT.md's own `## Triage` (StoreSearch/helpers.ts rows) and re-confirmed unchanged
// in `## Closure`'s reconciliation. Declaration-scoped per the 34.8-08c mechanism -- exempts
// only this one function, not the whole file (LibraryFilters-style tuple tables and any other
// real violation later added to this file stay fully scanned).
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
      values: { store: names[0] ?? '' }
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
