/**
 * The single `GENERIC_KEY_PLATFORM` sentinel, split into its own leaf module
 * (D-43-20) so `groupKeys.ts` can be deleted later in this phase without
 * breaking its two surviving consumers: `viewFilters.ts` and
 * `keyTypePresentation.ts`. Kept in common/ (no React, no i18n, no I/O), same
 * tier convention as its sibling leaf modules `urgencyBadge.ts` and
 * `expirationDisplay.ts`. Precedent: `stateLabels.ts` was extracted the same
 * way after a circular dependency forced a shared constant out of its
 * original host module (WR-09).
 */

/**
 * The `key_type`/platform value Humble uses for non-game entries — PDF/ebook
 * bundle items, publisher-site redemption codes. Two surviving roles:
 *  - `keyTypePresentation.ts` resolves it to the neutral
 *    `{ kind: 'unknown' }` TYPE-column branch (D-42-03 tier 3), the same
 *    branch any unrecognised `key_type` falls through to.
 *  - `viewFilters.ts`'s `selectKeysWaiting` excludes it from the
 *    Keys-waiting set (D-53) regardless of state — generic-platform entries
 *    are not game keys.
 * The Other-group display partition this value used to route entries into
 * (round 7, `groupKeys.ts`) is retired by D-43-01; this constant's job is
 * now limited to the two roles above.
 */
export const GENERIC_KEY_PLATFORM = 'generic'
