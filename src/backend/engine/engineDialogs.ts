/**
 * Phase 61: the dialog and toast surfaces of the engine step, generic over store. A port of
 * Steam's `showEngineDialog` (steam/gameLaunch.ts) that takes no Steam game object, plus the
 * fallback toast. Texts for the fallback reasons are the `gamelib:steam.engine.toast.*` strings
 * unchanged (D-12).
 *
 * Like Steam, the in-app dialog is shown on every refused attempt: the user pressed Play and
 * nothing else will tell them why it did nothing.
 */
import { t } from 'i18next'
import { app } from 'backend/platform'
import { logInfo, LogPrefix } from 'backend/logger'
import { notify, showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { newDialogAckId, trackDialogDisplay } from 'backend/dialog/displayAck'
import type { FallbackReason } from './engineTypes'

export function showEngineDialog(args: {
  key: string
  title: string
  body: string
  /** Short tag for the log, e.g. `override-unavailable`. */
  ackId: string
}): void {
  const { key, title, body, ackId: tag } = args
  notify({ title, body })
  app.raiseMainWindow()
  const ackId = newDialogAckId()
  trackDialogDisplay(ackId, (result) => {
    logInfo(
      result.confirmed
        ? `[engine-notice] key=${key} tag=${tag} display=confirmed elapsedMs=${result.elapsedMs}`
        : `[engine-notice] key=${key} tag=${tag} display=unconfirmed timeout=${result.timeoutMs}`,
      LogPrefix.Backend
    )
  })
  const sent = showDialogBoxModalAuto({
    title,
    message: body,
    type: 'MESSAGE',
    ackId
  })
  logInfo(
    `[engine-notice] key=${key} tag=${tag} dispatched=in-app-dialog+notify dialog-frame-sent=${sent} display=pending`,
    LogPrefix.Backend
  )
}

/** The "using built-in engine" toast for an Automatic fallback (59 D-06). */
export function notifyEngineFallback(
  title: string,
  reason: FallbackReason
): void {
  const body =
    reason === 'cx-expired'
      ? t(
          'gamelib:steam.engine.toast.cxExpired',
          'CrossOver trial expired — using built-in engine'
        )
      : reason === 'cx-broken'
        ? t(
            'gamelib:steam.engine.toast.cxBroken',
            "CrossOver isn't working — using built-in engine"
          )
        : t(
            'gamelib:steam.engine.toast.cxMissing',
            'CrossOver not found — using built-in engine'
          )
  notify({ title, body })
}
