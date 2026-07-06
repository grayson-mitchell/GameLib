import { HumbleKey, HumbleKeyState } from '../types/humble'

/**
 * Pure display-level grouping for the Humble Keys screen (D-21 + live-UAT
 * round 7). Kept in common/ (no React, no i18n, no I/O) so it is
 * unit-testable from the backend jest project — the frontend screen only
 * maps the returned groups to components.
 *
 * Round 7 (user product decision at the UAT checkpoint): entries whose
 * platform (derived from Humble's `key_type`, D-28) is `generic` — PDF/ebook
 * bundle items, publisher-site redemption codes — stay in the inventory but
 * move OUT of the 5 state groups into a single "Other" group rendered last
 * and collapsed by default. This is a DISPLAY partition only: generic keys
 * still classify into the 5-state model (D-30 precedence, storage and sync
 * untouched), and their rows keep the state badge + expiration display.
 */

/** The `key_type`/platform value that routes an entry to the Other group. */
export const GENERIC_KEY_PLATFORM = 'generic'

/**
 * A rendered group is either one of the 5 states (D-30) or the round-7
 * display-only 'other' bucket for generic-platform entries.
 */
export type HumbleKeyGroupId = HumbleKeyState | 'other'

// D-21: fixed group order, urgency-first (action-needed states before
// terminal ones), with the round-7 'other' bucket ALWAYS last — after
// Expired. Never reordered by data — only non-empty groups render.
export const GROUP_ORDER: HumbleKeyGroupId[] = [
  'UNPICKED',
  'UNREVEALED',
  'REVEALED',
  'REDEEMED',
  'UNREDEEMABLE',
  'other'
]

// Shared comparator (D-21): expiring-soonest first; keys with no expiration
// sort last. Applied uniformly to state groups AND the 'other' group.
function byExpiringSoonest(a: HumbleKey, b: HumbleKey): number {
  if (a.expiration === null && b.expiration === null) return 0
  if (a.expiration === null) return 1
  if (b.expiration === null) return -1
  return new Date(a.expiration).getTime() - new Date(b.expiration).getTime()
}

/**
 * Partition + sort in one pass (D-21 / round 7): platform `generic` -> the
 * single 'other' group REGARDLESS of state; everything else groups by its
 * 5-state classification. Within every group: expiring-soonest first,
 * no-expiration last. Sorting/grouping happens once here — child components
 * render in the order they receive.
 */
export function groupAndSortKeys(
  keys: HumbleKey[]
): Partial<Record<HumbleKeyGroupId, HumbleKey[]>> {
  const groups: Partial<Record<HumbleKeyGroupId, HumbleKey[]>> = {}

  for (const key of keys) {
    const groupId: HumbleKeyGroupId =
      key.platform === GENERIC_KEY_PLATFORM ? 'other' : key.state
    if (!groups[groupId]) {
      groups[groupId] = []
    }
    groups[groupId].push(key)
  }

  for (const groupId of GROUP_ORDER) {
    groups[groupId]?.sort(byExpiringSoonest)
  }

  return groups
}
