import { TFunction } from 'i18next'

/**
 * DETAIL-02 shared helpers for the AppleGamingWiki compatibility surfaces
 * (Extra-info tab rows).
 */

export interface RatingTier {
  /** Human label, first letter capitalized; 'Unrated' when empty/unknown. */
  label: string
  /** CSS custom property (semantic token) to color the pill with. */
  colorVar: string
}

/**
 * Map an AppleGamingWiki rating tier to a semantic color token from
 * `_colors.scss` (green→amber→red, neutral for empty/unknown). Values are
 * free-form upstream, so unknown values fall back to the neutral tier.
 */
export const ratingTier = (rating: string, t: TFunction): RatingTier => {
  const normalized = rating.trim().toLowerCase()

  switch (normalized) {
    case 'perfect':
    case 'playable':
      return { label: capitalize(rating), colorVar: '--status-success' }
    case 'runs':
    case 'borderline':
      return { label: capitalize(rating), colorVar: '--status-warning' }
    case 'unplayable':
      return { label: capitalize(rating), colorVar: '--status-danger' }
    case '':
      return {
        label: t('gamelib:gamepage.appleRatingUnrated', 'Unrated'),
        colorVar: '--status-default'
      }
    default:
      // Known-but-unmapped value — show the label, keep a neutral color.
      return { label: capitalize(rating), colorVar: '--status-default' }
  }
}

const capitalize = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1)
