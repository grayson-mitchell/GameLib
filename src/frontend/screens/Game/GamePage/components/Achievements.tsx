import type { GameAchievement } from 'common/types/gog'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  achievements: GameAchievement[]
}

const Achievements = ({ achievements }: Props) => {
  const { t: tGamelib } = useTranslation('gamelib')
  const hiddenLabel = tGamelib(
    'gamelib:gamepage.hiddenAchievement',
    'Hidden Achievement'
  )
  const sortedAchievements = useMemo(() => {
    const unlocked = achievements
      .filter((x) => x.date_unlocked !== null)
      .sort(
        (a, b) =>
          new Date(b.date_unlocked || '').getTime() -
          new Date(a.date_unlocked || '').getTime()
      )
    const locked = achievements
      .filter((x) => x.date_unlocked === null)
      .sort((a, b) => b.rarity - a.rarity)

    return [...unlocked, ...locked]
  }, [achievements])

  return (
    <div className="achievement-container">
      {sortedAchievements.map((x: GameAchievement) => {
        const isHiddenAchievement = !x.date_unlocked && !x.visible
        return (
          <div
            className={`achievement-item ${x.date_unlocked ? 'unlocked' : 'locked'} ${isHiddenAchievement ? 'hidden-achievement' : ''}`}
            key={x.achievement_id}
          >
            <div className={`achievement-icon rarity-${x.rarity_level_slug}`}>
              <img
                src={
                  x.date_unlocked ? x.image_url_unlocked : x.image_url_locked
                }
                alt={isHiddenAchievement ? hiddenLabel : x.name}
              />
            </div>
            <div className="achievement-text">
              <span className="achievement-title">
                {isHiddenAchievement ? hiddenLabel : x.name}
              </span>
              <span className="achievement-desc">
                {isHiddenAchievement ? '' : x.description}
              </span>
              <span className="achievement-rarity">
                {x.rarity_level_description} · {x.rarity}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default Achievements
