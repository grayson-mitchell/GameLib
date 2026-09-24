import { useTranslation } from 'react-i18next'

import {
  getUrgencyCountdownParts,
  UrgencyTier
} from 'common/humble/urgencyBadge'

type Props = {
  tier: UrgencyTier
  expiration: string | null
}

// D-61/D-62/D-63: presentational-only. Renders nothing when the key isn't
// badge-eligible (tier === null) or carries no expiration to count down —
// mirrors HumbleKeyRow's expirationLabel "render nothing, not placeholder
// text" convention. Reuses the `.humbleKeyStateBadge` family chrome via the
// `.humbleUrgencyBadge` class so it reads as a sibling badge, not a
// competing visual language.
export default function UrgencyBadge({ tier, expiration }: Props) {
  const { t } = useTranslation('gamelib')

  if (tier === null || expiration === null) {
    return null
  }

  const parts = getUrgencyCountdownParts(expiration)
  if (parts.kind === 'none') {
    return null
  }

  const label =
    parts.kind === 'hours'
      ? t('gamelib:humbleKeys.urgencyHoursLeft', {
          count: parts.value,
          defaultValue: '{{count}} hours left',
          defaultValue_one: '{{count}} hour left'
        })
      : t('gamelib:humbleKeys.urgencyDaysLeft', {
          count: parts.value,
          defaultValue: '{{count}} days left',
          defaultValue_one: '{{count}} day left'
        })

  return (
    <span className={`humbleUrgencyBadge humbleUrgencyBadge--${tier}`}>
      {label}
    </span>
  )
}
