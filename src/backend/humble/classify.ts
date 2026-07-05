import { HumbleKey, HumbleKeyState, HumbleOrderCacheEntry } from 'common/types/humble'
import { OrderDetail } from './adapter'

/**
 * Pure 5-state classification (D-30, HSYNC-01/02/03). No I/O, no logging, no
 * store import — every input is passed in by the caller (library.ts, Plan 02)
 * so this module is unit-testable with zero mocking of axios/electron-store.
 */

/**
 * Classifies a single tpk's already-derived signals into exactly one of the
 * five states.
 *
 * Precedence is literal and intentional (D-30 / Open Question 3): an expiry
 * signal (a past `expiration` OR the real API's `is_expired` boolean — see
 * classifyOrder) beats BOTH `redeemedKeyValuePresent` and the local REVEALED
 * flag — even a retroactively-expired already-redeemed entitlement
 * reclassifies UNREDEEMABLE. Do not "fix" this by reordering the checks;
 * it is a locked user decision, not an oversight.
 */
export function classifyTpk(
  tpk: {
    redeemedKeyValuePresent: boolean
    expiration: string | null
    isExpired?: boolean
  },
  isLocallyRevealed: boolean,
  now: Date = new Date()
): HumbleKeyState {
  if (
    tpk.isExpired ||
    (tpk.expiration && new Date(tpk.expiration).getTime() <= now.getTime())
  ) {
    return 'UNREDEEMABLE'
  }
  if (tpk.redeemedKeyValuePresent) {
    return 'REDEEMED'
  }
  if (isLocallyRevealed) {
    return 'REVEALED'
  }
  return 'UNREVEALED'
}

function isTerminal(state: HumbleKeyState): boolean {
  return state === 'REDEEMED' || state === 'UNREDEEMABLE'
}

/**
 * Classifies an entire fresh order-detail response into a cache-ready entry.
 *
 * `rawOrder` must always be the freshly-fetched response — never a
 * previously-cached record merged forward (Pitfall 5). The only
 * locally-carried-forward state is the `isRevealed` lookup, which reads a
 * separate keyed store (humbleRevealedStore, injected by the caller) rather
 * than being embedded in this order data.
 */
export function classifyOrder(
  rawOrder: OrderDetail,
  isRevealed: (machineName: string) => boolean,
  now: Date = new Date()
): HumbleOrderCacheEntry {
  const gamekey = rawOrder.gamekey ?? ''
  const rawProduct = rawOrder.product as
    | { category?: string | null; choice_url?: string | null; human_name?: string | null }
    | null
    | undefined
  const orderLabel =
    (rawOrder as { human_name?: string }).human_name ??
    rawProduct?.human_name ??
    gamekey

  const rawTpks = rawOrder.tpkd_dict?.all_tpks ?? []
  const keys: HumbleKey[] = []

  for (const rawTpk of rawTpks) {
    // T-11-05: a malformed/partial tpk entry must never throw out of the
    // loop — skip it, other tpks in the same order still classify.
    if (!rawTpk || typeof rawTpk !== 'object') {
      continue
    }
    try {
      const tpk = rawTpk as Record<string, unknown>
      const machineName =
        typeof tpk.machine_name === 'string'
          ? tpk.machine_name
          : `${gamekey}:${keys.length}`
      // Real API field is `redeemed_key_val` (verified against Playnite
      // HumbleKeysLibrary's Tpk model and FailSpy's redeemer — live-UAT
      // round 3); the spec's `redeemed_key_value` is kept as a fallback.
      // Truthiness (not string-typing) on purpose: for some non-Steam key
      // types the redeemed value is an OBJECT, not a string.
      const redeemedKeyValuePresent = Boolean(
        tpk.redeemed_key_val ?? tpk.redeemed_key_value
      )
      const expiration =
        typeof tpk.expiration === 'string' ? tpk.expiration : null
      // Real API expiry signal is `is_expired: bool` (same sources); the
      // spec's `expiration` timestamp is kept as a fallback. Strict === true
      // so a mistyped value never expires a live key by accident.
      const isExpired = tpk.is_expired === true
      const state = classifyTpk(
        { redeemedKeyValuePresent, expiration, isExpired },
        isRevealed(machineName),
        now
      )
      // D-28: platform label is derived from key_type for ANY platform —
      // classification itself is fully platform-agnostic.
      const platform =
        typeof tpk.key_type === 'string' ? tpk.key_type : 'unknown'
      const title =
        typeof tpk.human_name === 'string' ? tpk.human_name : orderLabel

      keys.push({
        gamekey,
        machineName,
        state,
        title,
        platform,
        expiration,
        origin: orderLabel
      })
    } catch {
      // Defensive net for any unexpected shape not caught by the guards
      // above — never let one bad entry fail the whole order.
      continue
    }
  }

  // D-27: an unpicked Humble Choice month is a single UNPICKED pseudo-entry
  // at the order/product level — only when no tpks were allocated at all.
  // Never throws when choice_url/deadline are absent; simply omits the
  // pseudo-entry (Pitfall 2 defensive handling, Assumption A1/A2).
  if (keys.length === 0 && rawProduct) {
    if (rawProduct.category === 'subscriptioncontent' && rawProduct.choice_url) {
      const deadline =
        typeof (rawProduct as Record<string, unknown>).deadline_date ===
        'string'
          ? ((rawProduct as Record<string, unknown>).deadline_date as string)
          : null
      keys.push({
        gamekey,
        machineName: `${gamekey}:unpicked`,
        state: 'UNPICKED',
        title: rawProduct.human_name ?? orderLabel,
        platform: 'humble-choice',
        expiration: deadline,
        origin: orderLabel
      })
    }
  }
  // D-29: no tpks and no subscriptioncontent product (a DRM-free-only
  // entitlement) -> keys stays empty. DRM-free downloads are excluded from
  // the inventory entirely.

  const allTerminal =
    keys.length > 0 && keys.every((key) => isTerminal(key.state))

  return { gamekey, keys, allTerminal }
}

// Cap on field-name lists in the zero-key diagnosis — enough to recognize a
// stripped/drifted response shape without an unbounded log line.
const MAX_DIAGNOSED_FIELDS = 15

/** Redacted zero-key extraction diagnosis (see describeZeroKeyOrder). */
export interface ZeroKeyDiagnosis {
  /**
   * true when the structure is UNEXPECTED for a zero-key order: tpkd_dict or
   * all_tpks absent/null/mistyped, or a NON-EMPTY all_tpks that still
   * produced zero keys. false only for the one legitimate shape — an
   * explicit empty all_tpks array (e.g. a DRM-free order, D-29).
   */
  anomalous: boolean
  /** Structural summary: field NAMES/paths, types and skip reasons only. */
  detail: string
}

function fieldNames(value: object): string {
  const names = Object.keys(value)
  const shown = names.slice(0, MAX_DIAGNOSED_FIELDS).join(',')
  const suffix =
    names.length > MAX_DIAGNOSED_FIELDS
      ? `,+${names.length - MAX_DIAGNOSED_FIELDS} more`
      : ''
  return `[${shown}${suffix}]`
}

/**
 * Pure, fully-redacted structural diagnosis for an order that classified to
 * ZERO HumbleKeys (live-UAT round 3, debug session
 * humble-zero-keys-from-valid-orders: 25/25 orders parsed ok yet keysCached=0
 * with no way to tell WHY from the logs). Reports only structure — field
 * NAMES, value TYPES, array lengths and per-element skip reasons. NEVER a
 * field value, key value or cookie (C5/T-11-04). No I/O and no logging here
 * (module discipline) — library.ts logs the returned detail.
 */
export function describeZeroKeyOrder(rawOrder: OrderDetail): ZeroKeyDiagnosis {
  const rawTpkdDict = (rawOrder as Record<string, unknown>).tpkd_dict

  if (rawTpkdDict === undefined || rawTpkdDict === null) {
    return {
      anomalous: true,
      detail: `tpkd_dict=${rawTpkdDict === null ? 'null' : 'absent'} order_fields=${fieldNames(rawOrder)}`
    }
  }
  if (typeof rawTpkdDict !== 'object') {
    return {
      anomalous: true,
      detail: `tpkd_dict=non-object(${typeof rawTpkdDict}) order_fields=${fieldNames(rawOrder)}`
    }
  }

  const rawAllTpks = (rawTpkdDict as Record<string, unknown>).all_tpks
  if (rawAllTpks === undefined || rawAllTpks === null) {
    return {
      anomalous: true,
      detail: `tpkd_dict.all_tpks=${rawAllTpks === null ? 'null' : 'absent'} tpkd_dict_fields=${fieldNames(rawTpkdDict)}`
    }
  }
  if (!Array.isArray(rawAllTpks)) {
    return {
      anomalous: true,
      detail: `tpkd_dict.all_tpks=non-array(${typeof rawAllTpks}) tpkd_dict_fields=${fieldNames(rawTpkdDict)}`
    }
  }

  if (rawAllTpks.length === 0) {
    // The one legitimate zero-key shape (DRM-free order / unpicked month
    // handled separately by the UNPICKED branch).
    return { anomalous: false, detail: 'tpkd_dict.all_tpks=array(0)' }
  }

  // Non-empty tpk array that still yielded zero keys: name the structural
  // check each element failed. classifyOrder only ever skips falsy or
  // non-object elements, so that is what gets reported per element.
  const skipped = rawAllTpks
    .slice(0, MAX_DIAGNOSED_FIELDS)
    .map((element, index) => {
      if (!element || typeof element !== 'object') {
        return `[${index}]:non-object(${element === null ? 'null' : typeof element})`
      }
      // An object element should have classified — if we are here anyway,
      // the guarded loop's defensive catch fired (e.g. isRevealed threw).
      return `[${index}]:object-skipped-by-defensive-catch fields=${fieldNames(element)}`
    })
  return {
    anomalous: true,
    detail: `tpkd_dict.all_tpks=array(${rawAllTpks.length}) skipped=[${skipped.join(' ')}]`
  }
}
