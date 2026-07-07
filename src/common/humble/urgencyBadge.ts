import { HumbleKeyState } from '../types/humble'

/**
 * Pure urgency-tier + countdown-copy decision for the Humble Keys urgency
 * badge (D-61/D-62/D-63, Phase 13). Kept in common/ (no React, no i18n, no
 * I/O) so it is unit-testable from the backend jest project while the
 * frontend `UrgencyBadge` component maps `UrgencyTier` to a color class and
 * `UrgencyCountdownParts` to a translated string:
 *
 *  - 'danger'  -> `--status-danger` fill, "{{N}} days left" / "1 day left" /
 *                 "{{H}}h left"
 *  - 'warning' -> `--status-warning` fill, same copy forms
 *  - null      -> no badge rendered at all
 */
export type UrgencyTier = 'danger' | 'warning' | null

/**
 * D-62: discriminated countdown-copy result. 'hours'/'days' carry the
 * already-rounded value the frontend interpolates directly into its locked
 * copy; 'none' means the badge renders nothing (null or past expiration) —
 * mirrors `expirationDisplay.ts`'s `{ kind: 'blank' }` no-render convention.
 */
export type UrgencyCountdownParts =
  | { kind: 'hours'; value: number }
  | { kind: 'days'; value: number }
  | { kind: 'none' }

// D-63: only these 3 states are badge-eligible at all; REDEEMED and
// UNREDEEMABLE never badge regardless of expiration (the "Expired" state
// badge already communicates UNREDEEMABLE).
const BADGE_ELIGIBLE_STATES = new Set<HumbleKeyState>([
  'UNPICKED',
  'UNREVEALED',
  'REVEALED'
])

const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000

/**
 * D-61: no badge beyond 30 days; 'danger' at <=7 days, 'warning' at <=30
 * days. Only decides the color tier — see `getUrgencyCountdownParts` for the
 * separate hour/day countdown copy (D-62).
 */
export function getUrgencyTier(
  state: HumbleKeyState,
  expiration: string | null,
  now: Date = new Date()
): UrgencyTier {
  if (!BADGE_ELIGIBLE_STATES.has(state) || expiration === null) {
    return null
  }
  const daysLeft = (new Date(expiration).getTime() - now.getTime()) / MS_PER_DAY
  if (daysLeft < 0) return null // already past — classify.ts would have made this UNREDEEMABLE
  if (daysLeft <= 7) return 'danger'
  if (daysLeft <= 30) return 'warning'
  return null
}

/**
 * D-62: compact countdown copy — hours phrasing under 24h, days phrasing at
 * or above 24h. Deliberately independent of `getUrgencyTier` (state
 * eligibility/tier gating is the caller's concern; this only does date math)
 * so it can be reused if a future tab needs countdown copy without a badge.
 */
export function getUrgencyCountdownParts(
  expiration: string | null,
  now: Date = new Date()
): UrgencyCountdownParts {
  if (expiration === null) {
    return { kind: 'none' }
  }
  const msLeft = new Date(expiration).getTime() - now.getTime()
  if (msLeft < 0) {
    return { kind: 'none' }
  }
  const hoursLeft = msLeft / MS_PER_HOUR
  if (hoursLeft < 24) {
    return { kind: 'hours', value: Math.max(1, Math.ceil(hoursLeft)) }
  }
  const daysLeft = msLeft / MS_PER_DAY
  return { kind: 'days', value: Math.ceil(daysLeft) }
}
