import { useTranslation } from 'react-i18next'
import classNames from 'classnames'

import './index.scss'

import { hasStatus } from 'frontend/hooks/hasStatus'

import BackHint from '../BackHint'

import type { GameInfo, Runner } from 'common/types'
import { useContext, useEffect } from 'react'
import { useCancelOnHold, useGamepadButtonHold } from '../../hooks'
import { BTN_BACK } from '../../controller'
import { launch, sendKill } from 'frontend/helpers'
import ContextProvider from 'frontend/state/ContextProvider'

const CANCEL_HOLD_MS = 3000
// Steam launch is fire-and-forget: `steam://rungameid` hands focus to the Steam
// client within milliseconds, firing `blur` almost immediately. Hold the overlay
// for at least this long so "Launched in Steam" is actually readable before the
// blur-driven dismiss can run.
const STEAM_MIN_VISIBLE_MS = 1500
// Ceiling: always dismiss by this point even if blur never fires (game failed to
// launch, unusual window manager, etc.).
const STEAM_SAFETY_MS = 8000

export default function LaunchOverlay({
  game,
  onDismiss
}: {
  game: GameInfo
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const { status, statusContext } = hasStatus(game)
  let label: string | null = null

  const { showDialogModal } = useContext(ContextProvider)

  // Hold-to-cancel for in-flight launches. Triggered by Escape (keyboard) or
  // the back button (gamepad); fires `sendKill` after CANCEL_HOLD_MS.
  // Disabled for Steam (fire-and-forget — no in-flight operation to cancel).
  const { holdStart, startHold, stopHold } = useCancelOnHold({
    active: !!game && game.runner !== 'steam',
    holdMs: CANCEL_HOLD_MS,
    onCancel: () => {
      if (game) void sendKill(game.app_name, game.runner)

      // prevent UX from hanging in "Launching" mode
      onDismiss()
    }
  })

  // Escape quits when idle; hold it while launching to cancel.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()

      if (!e.repeat) startHold()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stopHold()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [startHold, stopHold])

  // Fire the launch exactly once on mount. Steam is fire-and-forget:
  // rungameid resolves immediately; the overlay holds until GameLib loses
  // focus (the game took the foreground), then auto-dismisses. A minimum
  // visible floor keeps "Launched in Steam" readable despite the near-instant
  // blur from the steam:// handoff, and a bounded safety-net timeout ensures
  // the overlay always dismisses even if blur never fires (game failed to
  // launch, unusual window manager, etc.).
  // Non-Steam closes via onDismiss in the finally block.
  // Intentionally not depending on the launch inputs.
  useEffect(() => {
    let cleanup: (() => void) | undefined
    if (game.runner === 'steam') {
      void launch({
        appName: game.app_name,
        t,
        runner: game.runner as Runner,
        hasUpdate: false,
        showDialogModal
      })
      // Dismiss when GameLib loses focus (the game took the foreground) — but
      // only once the minimum-visible floor has elapsed. The steam:// handoff
      // steals focus almost immediately, so an un-gated blur would dismiss the
      // overlay at ~0s (regression). A one-shot guard prevents double-dismiss.
      let dismissed = false
      let floorElapsed = false
      let blurredEarly = false
      const doDismiss = () => {
        if (dismissed) return
        dismissed = true
        onDismiss()
      }
      const onBlur = () => {
        if (floorElapsed) doDismiss()
        else blurredEarly = true
      }
      window.addEventListener('blur', onBlur)
      // Minimum-visible floor: once elapsed, dismiss immediately if focus was
      // already lost (the common steam:// case), otherwise wait for blur.
      const floor = setTimeout(() => {
        floorElapsed = true
        if (blurredEarly) doDismiss()
      }, STEAM_MIN_VISIBLE_MS)
      // Safety net: always dismiss so the overlay cannot hang if blur never
      // fires. This is the ceiling, not the expected dismiss path.
      const safety = setTimeout(doDismiss, STEAM_SAFETY_MS)
      cleanup = () => {
        window.removeEventListener('blur', onBlur)
        clearTimeout(floor)
        clearTimeout(safety)
      }
    } else {
      void launch({
        appName: game.app_name,
        t,
        runner: game.runner as Runner,
        hasUpdate: false,
        showDialogModal
      }).finally(() => {
        onDismiss()
      })
    }
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useGamepadButtonHold(
    BTN_BACK,
    (held) => (held ? startHold() : stopHold()),
    !!game
  )

  switch (status) {
    case 'syncing-saves':
      label = t('gamepage:status.syncingSaves', 'Syncing Saves')
      break
    case 'redist':
      label = t(
        'gamepage:status.redist',
        'Installing Redistributables ({{redist}})',
        { redist: statusContext || '' }
      )
      break
    case 'winetricks':
      label = t('gamepage:status.winetricks', 'Applying Winetricks fixes')
      break
    case 'launching':
      label = t('gamepage:status.launching', 'Launching')
      break
    case 'playing':
      label = t('gamepage:status.playing', 'Playing')
      break
  }

  return (
    <div className="consoleLaunchOverlay" role="status" aria-live="polite">
      <div
        className={classNames('consoleLaunchSpinner', {
          idle: status === 'playing' || game.runner === 'steam'
        })}
      />
      <div className="consoleLaunchText">
        {game.runner === 'steam'
          ? t('console.steam.launched', 'Launched in Steam')
          : label || t('console.launching', 'Launching')}
      </div>
      <div className="consoleLaunchGameTitle">
        {game.overrides?.title || game.title}
      </div>
      {game.runner !== 'steam' && (
        <BackHint
          prefix={t('console.cancel.hintPrefix', 'Hold')}
          suffix={t('console.cancel.hintSuffix', 'for 3s to cancel')}
          active={holdStart != null}
        />
      )}
    </div>
  )
}
