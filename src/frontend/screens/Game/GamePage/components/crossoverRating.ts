/**
 * DETAIL-02/Phase-16 helper for the CodeWeavers CrossOver compatibility row
 * (Extra-info tab). The numeric rating itself is rendered by a MUI `Rating`
 * (5-star, half-star precision) component directly in `AppleWikiInfo.tsx` —
 * this helper's job narrows to producing the rating-COUNT label text shown
 * beside the stars (e.g. "(2 ratings)" / "(1 rating)"), and to signalling a
 * genuine miss so the caller can render the "No compatibility data
 * available" i18n string instead of a zero-star row.
 *
 * Unlike `ratingTier` (appleRating.ts), there is no "Perfect/Playable/
 * Unrated" vocabulary here — CodeWeavers publishes a genuine star rating.
 */

/**
 * Format a CodeWeavers rating count into a display label, e.g.
 * "(2 ratings)" / "(1 rating)". Returns `null` on a genuine miss (`rating`
 * is `null`) — the caller renders the "No compatibility data available"
 * i18n string and skips the star component entirely instead of showing a
 * zero-star / zero-count row.
 */
export const formatCrossoverRating = (
  rating: number | null,
  ratingCount: number | null
): string | null => {
  if (rating === null) {
    return null
  }

  const ratingWord = ratingCount === 1 ? 'rating' : 'ratings'

  return `(${ratingCount} ${ratingWord})`
}
