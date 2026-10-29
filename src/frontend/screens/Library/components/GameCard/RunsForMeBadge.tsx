import { useTranslation } from 'react-i18next'

/**
 * Quick 261029-mkz: green check shown instead of the CrossOver medal dot when
 * the user (or an auto-set after a 60 s+ session) marked the game "Runs for
 * me". Mirrors CrossoverBadge: an empty span, the glyph painted by CSS, the
 * sentence only in `title`/`aria-label`.
 */
const RunsForMeBadge = () => {
  const { t } = useTranslation()
  const label = t('gamelib:library.runsForMeBadge', 'Runs for me on this Mac')

  return (
    <span
      className="gameCardRunsForMeBadge"
      title={label}
      aria-label={label}
      aria-hidden={false}
      style={{ pointerEvents: 'none' }}
    />
  )
}

export default RunsForMeBadge
