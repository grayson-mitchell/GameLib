import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WineInstallation } from 'common/types'
import { useSteamBottleSetup } from 'frontend/state/SteamBottleSetup'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import WineSelector from 'frontend/screens/Library/components/InstallModal/WineSelector'
import { useAwaited } from 'frontend/hooks/useAwaited'

type Phase = 'consent' | 'provisioning' | 'error'

const STATUS_POLL_INTERVAL_MS = 3000

// Phase 17 (17-06), D-07/D-09: guided consent + engine-choice + login-prompt
// surface, opened exclusively by the global SteamBottleSetup store (which is
// itself only ever opened by the backend `steamBottleSetupRequired` signal —
// D-11-safe, see SteamBottleSetup.ts). Per RESEARCH.md Open Question 4 / D-09
// this is a consent-dialog + background-task pattern: the initial consent +
// engine-choice step is a blocking MUI Dialog (explicit confirmation is the
// whole point), but once the user confirms, the surface switches to a
// non-blocking banner (mirroring HumbleExpiryToast — there is no
// toast/snackbar library in this codebase) so it never fights Steam's own
// installer/progress window for focus. Visual treatment here is intentionally
// minimal and is flagged as /gsd-ui-phase-refinable.
const SteamBottleSetup = () => {
  const { t } = useTranslation('gamepage')
  const { isOpen, appName, close } = useSteamBottleSetup()

  const [phase, setPhase] = useState<Phase>('consent')
  const [provisionError, setProvisionError] = useState<string>()
  const [provisioned, setProvisioned] = useState(false)

  const [winePrefix, setWinePrefix] = useState('')
  const [wineVersion, setWineVersion] = useState<WineInstallation>()
  const [wineVersionList, setWineVersionList] = useState<WineInstallation[]>([])
  const [crossoverBottle, setCrossoverBottle] = useState('')

  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const globalConfig = useAwaited(() => window.api.requestAppSettings())

  // Reset all local wizard state whenever a NEW guided-setup session opens
  // (a different appName may trigger this after a previous session closed).
  useEffect(() => {
    if (!isOpen) return
    setPhase('consent')
    setProvisionError(undefined)
    setProvisioned(false)
  }, [isOpen, appName])

  // D-03: fetch the available compatibility engines and default to the
  // user's globally-configured engine (the "detected engine") — same source
  // WineSelector's callers use elsewhere (InstallModal).
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    void window.api.getAlternativeWine().then((list: WineInstallation[]) => {
      if (cancelled) return
      setWineVersionList(list)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    if (!globalConfig || wineVersion) return
    setWineVersion(globalConfig.wineVersion)
    setWinePrefix(globalConfig.defaultWinePrefixDir)
    if (globalConfig.wineCrossoverBottle) {
      setCrossoverBottle(globalConfig.wineCrossoverBottle)
    }
  }, [globalConfig, wineVersion])

  // Background-task progress: poll steamBottleStatus while provisioning is
  // underway (D-02 — SteamSetup.exe runs non-silently / wait:false, so we
  // have no direct completion event to await). Stops polling once
  // provisioned flips true; the user still closes the surface manually so
  // they have time to read the login-prompt/same-account guidance below.
  useEffect(() => {
    if (phase !== 'provisioning') {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    const poll = () => {
      void window.api.steamBottleStatus().then((status) => {
        if (status.provisioned) {
          setProvisioned(true)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      })
    }
    poll()
    pollRef.current = setInterval(poll, STATUS_POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [phase])

  if (!isOpen) {
    return null
  }

  const handleCancel = () => {
    close()
  }

  const handleConfirm = async () => {
    setPhase('provisioning')
    setProvisionError(undefined)
    const result = await window.api.steamBottleProvision({
      bottleName: crossoverBottle || undefined,
      wineVersion
    })
    if (result.status === 'error') {
      setProvisionError(result.error)
      setPhase('error')
    }
  }

  const handleDone = () => {
    close()
  }

  if (phase === 'consent') {
    return (
      <Dialog
        onClose={handleCancel}
        showCloseButton
        className="steamBottleSetupDialog"
      >
        <DialogHeader onClose={handleCancel}>
          {t('bottle.setup.title', 'Set up Steam for macOS')}
        </DialogHeader>
        <DialogContent>
          <p>
            {t(
              'bottle.setup.consent',
              'This game needs the Windows version of Steam, which does not run natively on macOS. GameLib will download and install a full Windows Steam client (several GB) inside a dedicated CrossOver/Wine bottle, one time only. Future installs and launches of Windows-only Steam games will reuse this bottle automatically.'
            )}
          </p>
          <p className="steamBottleSetupEngineLabel">
            <b>{t('bottle.setup.engine', 'Compatibility engine')}:</b>
          </p>
          <WineSelector
            appName={appName ?? 'steam-bottle'}
            winePrefix={winePrefix}
            setWinePrefix={setWinePrefix}
            wineVersion={wineVersion}
            setWineVersion={setWineVersion}
            wineVersionList={wineVersionList}
            crossoverBottle={crossoverBottle}
            setCrossoverBottle={setCrossoverBottle}
            initiallyOpen
          />
        </DialogContent>
        <DialogFooter>
          <button onClick={handleConfirm} className="button is-primary">
            {t('bottle.setup.confirm', 'Set up Steam')}
          </button>
          <button onClick={handleCancel} className="button is-secondary outline">
            {t('bottle.setup.cancel', 'Not now')}
          </button>
        </DialogFooter>
      </Dialog>
    )
  }

  // Background-task banner (D-09) — deliberately not a MUI Dialog so it
  // never blocks/competes with the real Steam installer/login window.
  return (
    <div className="steamBottleSetupToast" role="status">
      {phase === 'error' ? (
        <>
          <span className="steamBottleSetupMessage">
            {t('bottle.setup.errorMessage', {
              defaultValue: 'Steam setup could not start: {{error}}',
              error: provisionError ?? ''
            })}
          </span>
          <button
            className="steamBottleSetupAction"
            onClick={() => setPhase('consent')}
          >
            {t('bottle.setup.retry', 'Try again')}
          </button>
        </>
      ) : (
        <>
          <span className="steamBottleSetupMessage">
            {provisioned
              ? t(
                  'bottle.setup.readyForLogin',
                  'Steam is installed in the bottle.'
                )
              : t(
                  'bottle.setup.provisioning',
                  'Setting up Steam — this can take a while on first run.'
                )}
          </span>
          <span className="steamBottleSetupMessage">
            {t(
              'bottle.setup.login',
              'Finish by logging in to Steam in the window that opens.'
            )}
          </span>
          <span className="steamBottleSetupMessage">
            {t(
              'bottle.setup.sameAccount',
              'Tip: use the same Steam account you use elsewhere in GameLib.'
            )}
          </span>
          <span className="steamBottleSetupMessage">
            {t(
              'bottle.setup.hangHint',
              "If Steam appears stuck on \"Updating Steam\", it may be waiting on its own self-update — give it a few minutes before assuming it's frozen."
            )}
          </span>
        </>
      )}
      <button className="steamBottleSetupDismiss" onClick={handleDone}>
        {t('bottle.setup.done', 'Done')}
      </button>
    </div>
  )
}

export default SteamBottleSetup
