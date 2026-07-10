/**
 * DETAIL-02/Phase-16 helper for the CodeWeavers CrossOver compatibility row
 * (Extra-info tab). Unlike `ratingTier` (appleRating.ts), this renders the
 * REAL numeric rating + rating count (D-05) instead of bucketing into a
 * tier — CodeWeavers publishes a genuine star rating, so there is no
 * "Perfect/Playable/Unrated" vocabulary to map onto.
 */

/**
 * Format a CodeWeavers rating + rating count into a display string, e.g.
 * "4.5 / 5 (2 ratings)". Returns `null` on a genuine miss (`rating` is
 * `null`) — the caller renders the "No compatibility data available" i18n
 * string instead of fabricating a tier or a zero value.
 */
export const formatCrossoverRating = (
  rating: number | null,
  ratingCount: number | null
): string | null => {
  if (rating === null) {
    return null
  }

  const ratingWord = ratingCount === 1 ? 'rating' : 'ratings'

  return `${rating} / 5 (${ratingCount} ${ratingWord})`
}
