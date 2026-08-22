import { useTranslation } from 'react-i18next'
import classNames from 'classnames'

import './index.scss'

import { hasStatus } from 'frontend/hooks/hasStatus'

import BackHint from '../BackHint'

import type { GameInfo, Runner } from 'common/types'
import { useContext, useEffect } from 'react'
import {
  useCancelOnHold,
  useGamepadButtonHold,
  useGamepadInfo
} from '../../hooks'
import { getBackButtonIndex } from '../../controller'
import { launch, sendKill } from 'frontend/helpers'
import ContextProvider from 'frontend/state/ContextProvider'

const CANCEL_HOLD_MS = 3000
// Steam launch is fire-and-forget. `shell.openExternal('steam://…')` makes the OS
// fire a *spurious* `blur` on our window as it spins up the protocol handler —
// but focus returns to GameLib immediately and it stays foreground for several
// seconds until the game itself takes over. We ignore any blur during this
// startup window and only treat a blur AFTER it as "the game took the
// foreground". This keeps "Launched in Steam" visible for the whole launch.
const STEAM_STARTUP_IGNORE_BLUR_MS = 1500
// Ceiling: always dismiss by this point even if the game-focus blur never fires
// (game failed to launch, unusual window manager, launched in <ignore window).
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
  // rungameid resolves immediately; the overlay holds until the game actually
  // takes the foreground (a blur AFTER the startup window), then auto-dismisses.
  // Blurs during the startup window are the spurious protocol-handler blur and
  // are ignored. A bounded safety-net timeout ensures the overlay always
  // dismisses even if the game-focus blur never fires.
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
      // Dismiss when the game takes the foreground. The steam:// handoff fires a
      // spurious blur almost immediately (focus returns to GameLib right after),
      // so blurs during the startup window are ignored — only a blur once the
      // window has passed counts as "the game took over". A one-shot guard
      // prevents double-dismiss.
      let dismissed = false
      let startupElapsed = false
      const doDismiss = () => {
        if (dismissed) return
        dismissed = true
        onDismiss()
      }
      const onBlur = () => {
        if (startupElapsed) doDismiss()
      }
      window.addEventListener('blur', onBlur)
      const startup = setTimeout(() => {
        startupElapsed = true
      }, STEAM_STARTUP_IGNORE_BLUR_MS)
      // Safety net: always dismiss so the overlay cannot hang if the game-focus
      // blur never fires. This is the ceiling, not the expected dismiss path.
      const safety = setTimeout(doDismiss, STEAM_SAFETY_MS)
      cleanup = () => {
        window.removeEventListener('blur', onBlur)
        clearTimeout(startup)
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

  const { layout } = useGamepadInfo()
  useGamepadButtonHold(
    getBackButtonIndex(layout),
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
