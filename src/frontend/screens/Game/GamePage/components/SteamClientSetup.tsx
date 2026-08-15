import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GameInfo } from 'common/types'
import { useSteamClientSetup } from 'frontend/state/SteamClientSetup'
import {
  installSteamGame,
  logSteamInstallDispatchFailure
} from 'frontend/state/InstallGameModal'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import './SteamClientSetup.scss'

type Phase = 'consent' | 'waiting' | 'error'

const RECHECK_POLL_INTERVAL_MS = 3000

// Phase 21 (21-10), D-10/D-11: native Steam-CLIENT guided-install +
// prompt-to-launch surface, opened exclusively by the global
// SteamClientSetup store (itself only ever opened by the backend
// `steamClientSetupRequired` push — D-11-safe, see SteamClientSetup.ts).
// Distinct from SteamBottleSetup.tsx (the macOS CrossOver BOTTLE flow):
// this component targets the NATIVE Steam client on Win/macOS/Linux.
//
//  - reason 'install' (D-10): a blocking consent Dialog (explicit
//    confirmation required before GameLib downloads anything), then
//    switches to a non-blocking banner while the user clicks through the
//    real Valve installer — mirrors SteamBottleSetup.tsx's own
//    consent-then-background-task shape so it never fights the installer
//    window for focus.
//  - reason 'launch-once' (D-11): no consent needed (Steam is already
//    installed) — goes straight to the banner, prompting the user to
//    launch Steam themselves. GameLib never authors libraryfolders.vdf
//    (T-21-21) — this component only ever reads readiness state via
//    steamClientSetupRecheck, never writes anything Steam-related.
//
// Both branches poll steamClientSetupRecheck while the banner is open and
// automatically retry the install once the backend reports 'ready'.
const SteamClientSetup = () => {
  const { t } = useTranslation('gamepage')
  const { isOpen, appName, reason, close } = useSteamClientSetup()

  const [phase, setPhase] = useState<Phase>('consent')
  const [error, setError] = useState<string>()

  const pollRef = useRef<ReturnType<typeof setInterval>>()
  // Ref (not state) — the retry-install payload doesn't need to trigger a
  // re-render, and keeping it out of the poll effect's dependency array
  // avoids restarting the interval every time it resolves.
  const gameInfoRef = useRef<GameInfo | null>(null)

  // Reset local wizard state whenever a NEW setup session opens, and fetch
  // the GameInfo needed to retry the install once Steam becomes ready.
  useEffect(() => {
    if (!isOpen || !appName) return
    setError(undefined)
    gameInfoRef.current = null
    setPhase(reason === 'launch-once' ? 'waiting' : 'consent')
    void window.api.getGameInfo(appName, 'steam').then((info) => {
      gameInfoRef.current = info
    })
  }, [isOpen, appName, reason])

  // Poll for readiness while the banner ('waiting') is open — covers BOTH
  // the post-consent D-10 install-in-progress case and the D-11
  // launch-once case. On 'ready', retry the install and close.
  //
  // 34.13 review C-17 (the C-05 shape, in this sibling component, WITH a side
  // effect C-05 did not have): keyed on `isOpen` as well as `phase`. This
  // component is mounted PERMANENTLY in App.tsx — `isOpen: false` only makes
  // it `return null`, it never unmounts — and `close()` is
  // `set({ isOpen: false })`, touching neither `phase` nor `appName`, while
  // zustand's `close` identity is stable. So `[phase, appName, close]` never
  // changed when the user dismissed the banner: the effect did not re-run,
  // its cleanup never fired, and `steamClientSetupRecheck` kept being invoked
  // every 3s for the remaining life of the app. Here the `'ready'` branch
  // calls `installSteamGame(...)`, so the consequence was not a wasted timer:
  // dismiss the banner, open Steam hours later for an unrelated reason, and
  // GameLib silently queued a multi-GB download for a game the user
  // explicitly walked away from.
  useEffect(() => {
    if (!isOpen || phase !== 'waiting' || !appName) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = undefined
      }
      return
    }

    const poll = () => {
      void window.api.steamClientSetupRecheck(appName).then((result) => {
        if (result.status === 'ready') {
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = undefined
          }
          if (gameInfoRef.current) {
            // 34.13 review B-WR-01: explicit fire-and-forget with a real
            // rejection handler (the function returns its dispatch promise
            // now — a bare call would float).
            installSteamGame(appName, gameInfoRef.current).catch(
              logSteamInstallDispatchFailure(appName)
            )
          }
          close()
        }
      })
    }
    poll()
    pollRef.current = setInterval(poll, RECHECK_POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = undefined
      }
    }
  }, [isOpen, phase, appName, close])

  if (!isOpen || !appName) {
    return null
  }

  const handleCancel = () => close()

  const handleConfirm = async () => {
    setError(undefined)
    const result = await window.api.steamClientSetupStart()
    if (result.status === 'error') {
      setError(result.error)
      setPhase('error')
      return
    }
    setPhase('waiting')
  }

  if (phase === 'consent') {
    return (
      <Dialog
        onClose={handleCancel}
        showCloseButton
        className="steamClientSetupDialog"
      >
        <DialogHeader onClose={handleCancel}>
          {t('clientSetup.consent.title', 'Set up the Steam client')}
        </DialogHeader>
        <DialogContent>
          <p>
            {t(
              'clientSetup.consent.body',
              'GameLib could not find the Steam client on this computer. Downloading this game requires the official Steam client to adopt and manage the install afterward. GameLib will download the official Steam installer and run it — you complete the install yourself in the window that opens.'
            )}
          </p>
        </DialogContent>
        <DialogFooter>
          <button
            onClick={() => void handleConfirm()}
            className="button is-primary"
          >
            {t('clientSetup.consent.confirm', 'Install Steam')}
          </button>
          <button
            onClick={handleCancel}
            className="button is-secondary outline"
          >
            {t('clientSetup.consent.cancel', 'Not now')}
          </button>
        </DialogFooter>
      </Dialog>
    )
  }

  // Non-blocking banner (D-10 post-consent / D-11 launch-once) — deliberately
  // not a MUI Dialog so it never blocks/competes with the real Steam
  // installer window or the user launching Steam themselves.
  return (
    <div className="steamClientSetupToast" role="status">
      {phase === 'error' ? (
        <>
          <span className="steamClientSetupMessage">
            {t('clientSetup.errorMessage', {
              defaultValue: 'Steam setup could not start: {{error}}',
              error: error ?? ''
            })}
          </span>
          <button
            className="steamClientSetupAction"
            onClick={() => setPhase('consent')}
          >
            {t('clientSetup.retry', 'Try again')}
          </button>
        </>
      ) : reason === 'launch-once' ? (
        <span className="steamClientSetupMessage">
          {t(
            'clientSetup.launchOnce.message',
            'Steam is installed but has not been launched yet. Open Steam once — GameLib will continue the install automatically once it detects Steam is ready.'
          )}
        </span>
      ) : (
        <span className="steamClientSetupMessage">
          {t(
            'clientSetup.installing.message',
            'Installing the Steam client — finish the installer window that opened, then GameLib will continue automatically.'
          )}
        </span>
      )}
      <button className="steamClientSetupDismiss" onClick={handleCancel}>
        {t('clientSetup.done', 'Done')}
      </button>
    </div>
  )
}

export default SteamClientSetup
