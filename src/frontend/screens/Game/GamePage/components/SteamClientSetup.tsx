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

type Phase = 'consent' | 'waiting' | 'error'

const RECHECK_POLL_INTERVAL_MS = 3000

// Phase 21 (21-10), D-10/D-11: native Steam-CLIENT guided-install +
// prompt-to-launch surface, opened exclusively by the global
// SteamClientSetup store (itself only ever opened by the backend
// `steamClientSetupRequired` push — D-11-safe, see SteamClientSetup.ts).
// Distinct from SteamBottleSetup.tsx (the macOS CrossOver BOTTLE flow):
// this component targets the NATIVE Steam client on Win/macOS/Linux.
//
// D-UAT-18 (operator decision 2026-11-02): the consent, waiting and error
// states ALL render in the same shared Dialog (one root, one className), so
// the window the user just consented in is the window that then says GameLib
// is waiting. The earlier non-modal rationale no longer holds: Valve's
// installer and the Steam client are separate OS windows that a GameLib modal
// does not block, and the old bottom-right toast's only button was read as an
// acknowledgement while it silently abandoned the install (close() stops the
// poll, C-17).
//
//  - reason 'install' (D-10): a consent step (explicit confirmation required
//    before GameLib downloads anything), then the waiting state while the
//    user clicks through the real Valve installer.
//  - reason 'launch-once' (D-11): no consent needed (Steam is already
//    installed) — goes straight to the waiting state, prompting the user to
//    launch Steam themselves. GameLib never authors libraryfolders.vdf
//    (T-21-21) — this component only ever reads readiness state via
//    steamClientSetupRecheck, never writes anything Steam-related.
//
// The waiting state has ONE button, "Cancel install", and the header X,
// Escape and a backdrop click all do the same thing: close(). There is no
// hide or minimise path. While it is open it polls steamClientSetupRecheck and
// automatically retries the install once the backend reports 'ready'.
const SteamClientSetup = () => {
  const { t } = useTranslation('gamepage')
  const { isOpen, appName, reason, close } = useSteamClientSetup()

  const [phase, setPhase] = useState<Phase>('consent')
  const [error, setError] = useState<string>()
  // The last NON-ready verdict steamClientSetupRecheck returned (LD-3). Two
  // channels tell this component what it is waiting for: the store's `reason`
  // (set by the backend `steamClientSetupRequired` push, which fires on every
  // non-ready recheck — clientSetup.ts — and can flip `reason`, re-running the
  // reset effect) and this, the recheck's own return value. The direct channel
  // keeps the copy right whether or not that push re-render lands: on the 4a
  // re-run the copy stayed on the installer wording while the log showed
  // needs-launch polls every 3s.
  const [liveStatus, setLiveStatus] = useState<
    'needs-install' | 'needs-launch'
  >()

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
    setLiveStatus(undefined)
    gameInfoRef.current = null
    setPhase(reason === 'launch-once' ? 'waiting' : 'consent')
    void window.api
      .getGameInfo(appName, 'steam')
      .then((info) => {
        gameInfoRef.current = info
      })
      .catch(() => {
        // 34.13 review C-19, sibling instance: same bare-`void` shape as the
        // poll. A rejected lookup leaves gameInfoRef null, which the 'ready'
        // branch already treats as "nothing to retry" — so degrade silently
        // rather than leaving the rejection unhandled.
        gameInfoRef.current = null
      })
  }, [isOpen, appName, reason])

  // Poll for readiness while the waiting dialog ('waiting') is open — covers BOTH
  // the post-consent D-10 install-in-progress case and the D-11
  // launch-once case. On 'ready', retry the install and close.
  //
  // 34.13 review C-17 (the C-05 shape, in this sibling component, WITH a side
  // effect C-05 did not have): keyed on `isOpen` as well as `phase`. This
  // component is mounted PERMANENTLY in App.tsx — `isOpen: false` only makes
  // it `return null`, it never unmounts — and `close()` is
  // `set({ isOpen: false })`, touching neither `phase` nor `appName`, while
  // zustand's `close` identity is stable. So `[phase, appName, close]` never
  // changed when the user dismissed the dialog: the effect did not re-run,
  // its cleanup never fired, and `steamClientSetupRecheck` kept being invoked
  // every 3s for the remaining life of the app. Here the `'ready'` branch
  // calls `installSteamGame(...)`, so the consequence was not a wasted timer:
  // cancel the dialog, open Steam hours later for an unrelated reason, and
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

    // An in-flight recheck can resolve AFTER this effect was torn down (cancel,
    // or a new session reopening). Its verdict belongs to the old session: it
    // must neither leak a stale live status into the new one nor — worse —
    // dispatch the install the user just cancelled (C-17).
    let cancelled = false

    const poll = () => {
      void window.api
        .steamClientSetupRecheck(appName)
        .then((result) => {
          if (cancelled) return
          if (result.status !== 'ready') {
            setLiveStatus(result.status)
            return
          }
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
        })
        .catch(() => {
          // 34.13 review C-19(b), the WR-03 remedy carried across from
          // SteamBottleSetup.tsx: a bare `void` silences no-floating-promises
          // while attaching NO rejection handler. Under the Tauri sidecar an
          // unported/erroring channel rejects, which produced an unhandled
          // rejection every RECHECK_POLL_INTERVAL_MS. NOTE the deliberate
          // asymmetry with handleConfirm below: a rejected readiness READ is
          // merely an UNKNOWN verdict, so keep polling (the interval stays
          // armed) and let the next tick answer — a rejected START is a FAILED
          // start and is terminal.
        })
    }
    poll()
    pollRef.current = setInterval(poll, RECHECK_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
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
    try {
      const result = await window.api.steamClientSetupStart()
      if (result.status === 'error') {
        setError(result.error)
        setPhase('error')
        return
      }
      setPhase('waiting')
    } catch (e) {
      // 34.13 review C-19(a), the C-02 remedy carried across from
      // SteamBottleSetup.tsx: `steamClientSetupStart` is a makeHandlerInvoker
      // channel — `ipcRenderer.invoke` under Electron, the sidecar transport
      // under Tauri — and BOTH reject on a backend throw, a dead sidecar or a
      // transport timeout. Unhandled, that produced an unhandled rejection AND
      // a silent dead click: `phase` stayed 'consent', no error surfaced, and
      // the "Install Steam" button just did nothing. A rejected START is a
      // FAILED start, so it is terminal (contrast the poll's `.catch` above).
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  // LD-3: the live recheck verdict wins; until the first one lands, fall back
  // to what the session opened with.
  const waitingStatus =
    liveStatus ?? (reason === 'launch-once' ? 'needs-launch' : 'needs-install')

  return (
    <Dialog
      onClose={handleCancel}
      showCloseButton
      className="steamClientSetupDialog"
    >
      {phase === 'consent' ? (
        <>
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
        </>
      ) : phase === 'error' ? (
        <>
          <DialogHeader onClose={handleCancel}>
            {t('clientSetup.consent.title', 'Set up the Steam client')}
          </DialogHeader>
          <DialogContent>
            <p>
              {t('clientSetup.errorMessage', {
                defaultValue: 'Steam setup could not start: {{error}}',
                error: error ?? ''
              })}
            </p>
          </DialogContent>
          <DialogFooter>
            <button
              onClick={() => setPhase('consent')}
              className="button is-primary"
            >
              {t('clientSetup.retry', 'Try again')}
            </button>
            <button
              onClick={handleCancel}
              className="button is-secondary outline"
            >
              {t('clientSetup.cancelInstall', 'Cancel install')}
            </button>
          </DialogFooter>
        </>
      ) : (
        <>
          <DialogHeader onClose={handleCancel}>
            {t('clientSetup.waiting.title', 'Waiting for Steam')}
          </DialogHeader>
          <DialogContent>
            <p>
              {waitingStatus === 'needs-launch'
                ? t(
                    'clientSetup.launchOnce.message',
                    "Steam is installed but hasn't been opened yet. Open Steam once — GameLib will continue the download automatically."
                  )
                : t(
                    'clientSetup.installing.message',
                    'Finish the Steam installer that opened. GameLib will continue the download automatically.'
                  )}
            </p>
          </DialogContent>
          <DialogFooter>
            <button
              onClick={handleCancel}
              className="button is-secondary outline"
            >
              {t('clientSetup.cancelInstall', 'Cancel install')}
            </button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  )
}

export default SteamClientSetup
