import { useTranslation } from 'react-i18next'

interface Props {
  rating: number | null | undefined
}

type Tier = 'gold' | 'silver' | 'bronze' | 'wontRun' | 'unknown'

/**
 * CXIDX-10/CXIDX-11: CrossOver compatibility medal dot rendered on macOS
 * library grid tiles (D-15). Tier is derived HERE from the raw rating
 * number (D-12) — the `crossoverRatings` slice never carries a `medal`
 * field. The visible glyph carries no text (empty span, dot painted via
 * CSS background-color); the full descriptive sentence lives only in
 * `title`/`aria-label`, mirroring the `MacArchBadge` precedent.
 *
 * D-16 honesty invariant:
 *   rating === undefined (app_name absent from the map, never looked up)
 *     -> render NOTHING.
 *   rating === null (looked up, absent from the index)
 *     -> render the neutral grey "unknown" dot.
 *   rating is a number 1..5
 *     -> render the tier-colored dot (5 gold / 4 silver / 3 bronze / <=2 red).
 */
const CrossoverBadge = ({ rating }: Props) => {
  const { t } = useTranslation()

  if (rating === undefined) {
    return null
  }

  let tier: Tier
  if (rating === null) {
    tier = 'unknown'
  } else if (rating >= 5) {
    tier = 'gold'
  } else if (rating === 4) {
    tier = 'silver'
  } else if (rating === 3) {
    tier = 'bronze'
  } else {
    tier = 'wontRun'
  }

  const labelKeyByTier: Record<Tier, [string, string]> = {
    gold: ['library.crossover_gold', 'Runs great on CrossOver (gold rating)'],
    silver: [
      'library.crossover_silver',
      'Runs well on CrossOver (silver rating)'
    ],
    bronze: [
      'library.crossover_bronze',
      'Runs with issues on CrossOver (bronze rating)'
    ],
    wontRun: ['library.crossover_wont_run', 'Known not to work on CrossOver'],
    unknown: ['library.crossover_unknown', 'CrossOver compatibility unknown']
  }

  const [key, defaultText] = labelKeyByTier[tier]
  const label = t(key, defaultText)

  return (
    <span
      className={`gameCardCrossoverBadge gameCardCrossoverBadge--${tier}`}
      title={label}
      aria-label={label}
      aria-hidden={false}
      style={{ pointerEvents: 'none' }}
    />
  )
}

export default CrossoverBadge
