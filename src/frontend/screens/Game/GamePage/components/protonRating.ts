/**
 * 260710-rjm helper for the ProtonDB-driven Proton compatibility row
 * (Install-info tab, Steam-on-Linux games only). ProtonDB's tier vocabulary
 * (platinum/gold/silver/bronze/borked, plus pending/native) is free-form
 * upstream, so it is mapped here to a 1-5 MUI `Rating` star value — mirrors
 * the `ratingTier` (appleRating.ts) style but produces a numeric star count
 * instead of a colored label pill, since the caller renders a `Rating`
 * component directly.
 *
 * `null` means "no usable compatibility data" — covers unknown/unmapped
 * tiers as well as the two ProtonDB tiers that are not a compatibility
 * signal at all: 'pending' (not yet reviewed) and 'native' (no Proton layer
 * involved). The caller renders the i18n "No compatibility data available"
 * fallback instead of a star row in that case.
 */
export const protonTierToStars = (
  level: string | null | undefined
): number | null => {
  const normalized = level?.trim().toLowerCase()

  switch (normalized) {
    case 'platinum':
      return 5
    case 'gold':
      return 4
    case 'silver':
      return 3
    case 'bronze':
      return 2
    case 'borked':
      return 1
    default:
      return null
  }
}
