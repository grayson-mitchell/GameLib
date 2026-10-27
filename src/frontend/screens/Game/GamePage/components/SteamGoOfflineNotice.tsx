import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getGameInfo } from 'frontend/helpers'
import ContextProvider from 'frontend/state/ContextProvider'
import { useSteamGoOfflineNotice } from 'frontend/state/SteamGoOfflineNotice'
import { installSteamGame } from 'frontend/state/InstallGameModal'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'

// Phase 54 Plan 07: the guided Go Offline step. Opened only by the global
// SteamGoOfflineNotice store, itself opened only by the backend's
// `steamGoOfflineRequired` push (the go-offline wrap did not see Mac Steam log
// off). Continue never logs on: it asks the backend whether Mac Steam now reads
// Logged Off and only then re-runs the blocked action, which goes back through
// the backend's gated session entry point. Cancel dispatches nothing.
const SteamGoOfflineNotice = () => {
  const { t } = useTranslation('gamelib')
  const { refreshLibrary } = useContext(ContextProvider)
  const { isOpen, action, appName, status, close, setStatus } =
    useSteamGoOfflineNotice()

  const [error, setError] = useState<string>()

  // A new notice starts without a stale error.
  useEffect(() => {
    if (isOpen) setError(undefined)
  }, [isOpen, action, appName])

  if (!isOpen || !action) {
    return null
  }

  const onContinue = async () => {
    setStatus('busy')
    setError(undefined)

    try {
      const result = await window.api.steamGoOfflineRetry()

      if (result.status === 'still-online') {
        setStatus('still-online')
        return
      }
      if (result.status === 'not-macos') {
        close()
        return
      }

      // result.status === 'ready': Mac Steam reads Logged Off.
      if (action === 'refresh') {
        await refreshLibrary({
          library: 'steam',
          origin: 'steam-go-offline-retry',
          runInBackground: true
        })
        close()
      } else if (action === 'install') {
        const info = appName ? await getGameInfo(appName, 'steam') : undefined
        if (!appName || !info) {
          setStatus('idle')
          setError(
            t('steam.bridge.routeNotice.notFound', {
              defaultValue: 'Could not find this game to install it.'
            })
          )
          return
        }
        await installSteamGame(appName, info)
        close()
      } else {
        setStatus('ready')
      }
    } catch (err) {
      setStatus('idle')
      setError(
        t('steam.goOffline.error', {
          defaultValue: 'Could not continue: {{error}}',
          error: err instanceof Error ? err.message : String(err)
        })
      )
    }
  }

  const busy = status === 'busy'
  const readyRedeem = status === 'ready' && action === 'redeem'

  return (
    <Dialog
      onClose={close}
      showCloseButton
      className="steamGoOfflineNoticeDialog"
    >
      <DialogHeader onClose={close}>
        {t('steam.goOffline.title', 'Set Steam offline to continue')}
      </DialogHeader>
      <DialogContent>
        <p>
          {t(
            'steam.goOffline.body',
            'GameLib needs to sign in to your Steam account for this. To keep your Steam Friends list signed in, it signs in while the Steam app is offline, but Steam did not go offline when GameLib asked. This can happen while a Steam game is running.'
          )}
        </p>
        <p>
          {t(
            'steam.goOffline.steps',
            'In the Steam app, choose Steam > Go Offline, then press Continue. GameLib sets Steam back online once it has signed in.'
          )}
        </p>
        {status === 'still-online' ? (
          <p>
            {t(
              'steam.goOffline.stillOnline',
              'Steam still shows as online. Choose Steam > Go Offline in the Steam app, then press Continue again.'
            )}
          </p>
        ) : null}
        {readyRedeem ? (
          <p>
            {t(
              'steam.goOffline.readyRedeem',
              'Steam is offline now. Redeem the key again to continue.'
            )}
          </p>
        ) : null}
        {error ? <p className="steamBridgeSetupError">{error}</p> : null}
      </DialogContent>
      <DialogFooter>
        {/* `void` so no promise floats off the handler; its body is entirely
            inside try/catch. */}
        <button
          onClick={() => void onContinue()}
          disabled={busy || readyRedeem}
          className="button is-primary"
        >
          {t('steam.goOffline.continue', 'Continue')}
        </button>
        <button onClick={close} className="button is-secondary outline">
          {t('steam.bridge.routeNotice.cancel', 'Cancel')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}

export default SteamGoOfflineNotice
