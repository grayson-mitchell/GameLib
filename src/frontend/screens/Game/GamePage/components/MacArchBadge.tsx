import { useTranslation } from 'react-i18next'
import { GameInfo } from 'common/types'

interface Props {
  gameInfo: GameInfo
  isMac: boolean
}

/**
 * MAC32-04: OS/arch badge rendered beside the game logo, marking a Steam
 * game's macOS build as 32-bit-only ('unknown'/'64'/undefined render
 * nothing — see the false-flag-safe mac_arch contract on GameInfo).
 *
 * 32-bit macOS builds cannot run natively past Catalina (10.15, 2019) and
 * are routed to a CrossOver/Wine bottle instead (see isBottleEligible()).
 * That makes the badge actionable ONLY on a macOS host; on Windows/Linux
 * hosts the fact is informational trivia. `isMac` is received as a prop
 * (mirrors GamePage/index.tsx's local `isMac` at L165) — this stays a pure
 * presentational component and never re-derives platform itself.
 */
const MacArchBadge = ({ gameInfo, isMac }: Props) => {
  const { t } = useTranslation('gamepage')

  if (gameInfo.mac_arch !== '32') {
    return null
  }

  const variantClass = isMac
    ? 'macArchBadge--warning'
    : 'macArchBadge--informational'

  const label = t('badge.macArch32', '32-bit macOS build')

  return (
    <div
      className={`macArchBadge ${variantClass}`}
      title={label}
      aria-label={label}
    >
      32
    </div>
  )
}

export default MacArchBadge
