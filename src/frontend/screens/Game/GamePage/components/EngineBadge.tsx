import { useTranslation } from 'react-i18next'
import type { SteamEngineState } from 'common/types/steam'

interface Props {
  state: SteamEngineState | undefined
}

/**
 * Phase 59 (D-06, D-14): persistent engine badge on a Steam title's game
 * page. 'builtin' = CrossOver unavailable, running on the built-in engine;
 * 'unsupported' = a non-automatic per-game override. Pure presentational:
 * the state comes from the backend.
 */
const EngineBadge = ({ state }: Props) => {
  const { t } = useTranslation('gamelib')

  if (
    !state ||
    (state.engine !== 'builtin' && state.engine !== 'unsupported')
  ) {
    return null
  }

  if (state.engine === 'builtin') {
    const reason =
      state.reason === 'cx-expired'
        ? t('steam.engine.reason.cxExpired', 'CrossOver trial expired')
        : state.reason === 'cx-broken'
          ? t('steam.engine.reason.cxBroken', "CrossOver isn't working")
          : t('steam.engine.reason.cxMissing', 'CrossOver not found')
    const label = t(
      'steam.engine.badge.builtin',
      'Built-in engine (best-effort)'
    )
    const title = t(
      'steam.engine.badge.builtinTitle',
      'CrossOver is unavailable for this game ({{reason}}), so GameLib runs it on its built-in Wine engine.',
      { reason }
    )
    // 59-UAT G6, item 7: the reason was only in the hover tooltip; show it.
    return (
      <div
        className="engineBadge engineBadge--builtin"
        title={title}
        aria-label={`${label}. ${title}`}
      >
        {label}
        <span aria-hidden="true"> · </span>
        <span className="engineBadge__reason">{reason}</span>
      </div>
    )
  }

  const label = t('steam.engine.badge.unsupported', 'Unsupported engine')
  const title = t(
    'steam.engine.badge.unsupportedTitle',
    "This game uses an engine chosen in its Wine settings ({{engine}}). Known fixes and compatibility ratings don't apply.",
    { engine: state.engineLabel ?? '' }
  )
  return (
    <div
      className="engineBadge engineBadge--unsupported"
      title={title}
      aria-label={`${label}. ${title}`}
    >
      {label}
    </div>
  )
}

export default EngineBadge
