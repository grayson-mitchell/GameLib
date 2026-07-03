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
  // steam://rungameid resolves immediately; the overlay holds for 1500ms then
  // auto-dismisses. Non-Steam closes via onDismiss in the finally block.
  // Intentionally not depending on the launch inputs.
  useEffect(() => {
    if (game.runner === 'steam') {
      void launch({
        appName: game.app_name,
        t,
        runner: game.runner as Runner,
        hasUpdate: false,
        showDialogModal
      })
      const timer = setTimeout(onDismiss, 1500)
      return () => clearTimeout(timer)
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
