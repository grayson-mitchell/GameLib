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
 * Precedence is literal and intentional (D-30 / Open Question 3): a past
 * expiration beats BOTH `redeemedKeyValuePresent` and the local REVEALED
 * flag — even a retroactively-expired already-redeemed entitlement
 * reclassifies UNREDEEMABLE. Do not "fix" this by reordering the checks;
 * it is a locked user decision, not an oversight.
 */
export function classifyTpk(
  tpk: { redeemedKeyValuePresent: boolean; expiration: string | null },
  isLocallyRevealed: boolean,
  now: Date = new Date()
): HumbleKeyState {
  if (tpk.expiration && new Date(tpk.expiration).getTime() <= now.getTime()) {
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
      const redeemedKeyValuePresent = Boolean(tpk.redeemed_key_value)
      const expiration =
        typeof tpk.expiration === 'string' ? tpk.expiration : null
      const state = classifyTpk(
        { redeemedKeyValuePresent, expiration },
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
