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
  const { t } = useTranslation()

  if (tier === null || expiration === null) {
    return null
  }

  const parts = getUrgencyCountdownParts(expiration)
  if (parts.kind === 'none') {
    return null
  }

  const label =
    parts.kind === 'hours'
      ? t('humbleKeys.urgencyHoursLeft', '{{H}}h left', { H: parts.value })
      : parts.value === 1
        ? t('humbleKeys.urgencyOneDayLeft', '1 day left')
        : t('humbleKeys.urgencyDaysLeft', '{{N}} days left', {
            N: parts.value
          })

  return (
    <span className={`humbleUrgencyBadge humbleUrgencyBadge--${tier}`}>
      {label}
    </span>
  )
}
