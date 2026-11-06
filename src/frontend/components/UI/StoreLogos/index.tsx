import type { ComponentType } from 'react'
import { Runner } from 'common/types'
import EpicLogo from 'frontend/assets/epic-logo.svg?react'
import GOGLogo from 'frontend/assets/gog-logo.svg?react'
import GameLibIcon from 'frontend/assets/gamelib-icon.png'
import AmazonLogo from 'frontend/assets/amazon-logo.svg?react'
import SteamLogo from 'frontend/assets/steam-logo.svg?react'

type Props = { runner: Runner; className?: string }

const STORE_LOGOS: Partial<
  Record<Runner, ComponentType<{ className?: string }>>
> = {
  legendary: EpicLogo,
  gog: GOGLogo,
  nile: AmazonLogo,
  steam: SteamLogo
}

export default function StoreLogos({
  runner,
  className = 'store-icon'
}: Props) {
  const Logo = STORE_LOGOS[runner]
  if (Logo) return <Logo className={className} />
  return <img src={GameLibIcon} className={className} alt="GameLib" />
}
