import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getGameInfo } from 'frontend/helpers'
import { useSteamBridgeSetup } from 'frontend/state/SteamBridgeSetup'
import { installSteamGame } from 'frontend/state/InstallGameModal'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import './SteamBridgeSetup.scss'

// Phase 24 (24-09), R7/D-05: the bridge failure surface. Opened exclusively
// by the global SteamBridgeSetup store (itself only ever opened by the
// backend `steamBridgeSetupRequired` push — see SteamBridgeSetup.ts), this
// is an EXPLICIT error dialog: no silent auto-fallback (a heavy Windows
// Steam client appearing unexplained is confusing, D-05) and no dead-end
// either — "Fall back to bottled Steam" or "Cancel" are the only two ways
// out.
//
// Pitfall 4: the fallback action reuses the EXISTING non-bridge
// install()/launch() entrypoints (window.api.install / window.api.launch —
// the same IPC channels GamePage's own handleInstall/handlePlay funnel
// through) rather than a bespoke fallback path. Because the backend already
// called markBridgeFailedThisSession(appId) before firing this signal
// (24-08, finding #3), isBridgeEligible() is now false for this appId, so
// the SAME entrypoint naturally reaches the proven Phase 17/22 bottled path
// instead of looping back into the failing bridge. D-11: if that bottle was
// never provisioned, the existing bottled-Steam guard chain fires its OWN
// `steamBottleSetupRequired` (SteamBottleSetup.ts/tsx, already mounted in
// App.tsx) and offers on-demand provisioning — no separate provisionBottle
// call is needed here.
const SteamBridgeSetup = () => {
  const { t } = useTranslation('gamepage')
  const { isOpen, appName, reason, fallbackAvailable, close } =
    useSteamBridgeSetup()

  const [fallingBack, setFallingBack] = useState(false)
  const [fallbackError, setFallbackError] = useState<string>()

  // Reset local state whenever a NEW failure surface opens (a different
  // appName may trigger this after a previous one closed).
  useEffect(() => {
    if (!isOpen) return
    setFallingBack(false)
    setFallbackError(undefined)
  }, [isOpen, appName])

  if (!isOpen) {
    return null
  }

  const handleCancel = () => {
    close()
  }

  const handleFallback = async () => {
    if (!appName) return

    setFallingBack(true)
    setFallbackError(undefined)

    try {
      const gameInfo = await getGameInfo(appName, 'steam')
      if (!gameInfo) {
        setFallbackError(
          t(
            'bridge.setup.fallbackNotFound',
            'Could not find this game to fall back to bottled Steam.'
          )
        )
        return
      }

      if (!gameInfo.is_installed) {
        // 34.13-08 (D-17 marshalling, site 9 — the fourth hardcoded Steam
        // install-args literal found while planning this rewrite): routes
        // through the same single marshalling point every other Steam
        // install caller now uses, so a future D-17 override can never be
        // bypassed here. Deliberately `installSteamGame`, NOT
        // `startSteamQuickInstall` — this is a post-failure retry inside a
        // setup surface, and degrading it into an options dialog on a D-24
        // check would be new behavior this phase has no decision for. The
        // outcome is byte-identical to the literal this replaces:
        // `installSteamGame`'s hardcoded fields are the same eight.
        await installSteamGame(appName, gameInfo)
      } else {
        // Same IPC channel the existing launch flow ultimately calls
        // (frontend/helpers/library.ts's checkLaunchOptionsAndLaunch) — the
        // existing non-bridge launch() branch.
        await window.api.launch({ appName, runner: 'steam', args: [] })
      }

      close()
    } catch (error) {
      setFallbackError(
        t('bridge.setup.fallbackError', {
          defaultValue:
            'Falling back to bottled Steam failed: {{error}}',
          error: error instanceof Error ? error.message : String(error)
        })
      )
    } finally {
      setFallingBack(false)
    }
  }

  return (
    <Dialog
      onClose={handleCancel}
      showCloseButton
      className="steamBridgeSetupDialog"
    >
      <DialogHeader onClose={handleCancel}>
        {t('bridge.setup.title', 'Steam bridge unavailable')}
      </DialogHeader>
      <DialogContent>
        <p>
          {t(
            'bridge.setup.message',
            'GameLib could not use the native Steam bridge for this game. You can fall back to the proven bottled-Steam path (a full Windows Steam client running in a dedicated CrossOver/Wine bottle) instead.'
          )}
        </p>
        {reason ? (
          <p className="steamBridgeSetupReason">
            {t('bridge.setup.reason', {
              defaultValue: 'Reason: {{reason}}',
              reason
            })}
          </p>
        ) : null}
        {fallbackError ? (
          <p className="steamBridgeSetupError">{fallbackError}</p>
        ) : null}
      </DialogContent>
      <DialogFooter>
        {fallbackAvailable ? (
          <button
            onClick={handleFallback}
            disabled={fallingBack}
            className="button is-primary"
          >
            {fallingBack
              ? t('bridge.setup.fallingBack', 'Falling back...')
              : t('bridge.setup.fallback', 'Fall back to bottled Steam')}
          </button>
        ) : null}
        <button
          onClick={handleCancel}
          disabled={fallingBack}
          className="button is-secondary outline"
        >
          {t('bridge.setup.cancel', 'Cancel')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}

export default SteamBridgeSetup
