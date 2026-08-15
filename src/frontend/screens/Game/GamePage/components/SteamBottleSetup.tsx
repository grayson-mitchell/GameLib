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
import {
  DEFAULT_STEAM_BOTTLE_NAME,
  resolveSteamBottleSeedEngine
} from './steamBottleDefaults'
import './SteamBottleSetup.scss'

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
  const [enginesFetched, setEnginesFetched] = useState(false)
  const [crossoverBottle, setCrossoverBottle] = useState('')
  // D-15 (34.13-09) read half: the wine engine persisted in
  // steamBottleConfigStore, surfaced via 34.13-07's isSteamBottleEligible
  // verdict. `undefined` legitimately means "nothing was ever persisted" —
  // kept as its OWN boolean settle flag below rather than inferred from this
  // being non-undefined, so "still loading" and "loaded, nothing persisted"
  // stay distinguishable.
  const [persistedWineVersion, setPersistedWineVersion] =
    useState<WineInstallation>()
  const [persistedLookupSettled, setPersistedLookupSettled] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const globalConfig = useAwaited(() => window.api.requestAppSettings())

  // Reset all local wizard state whenever a NEW guided-setup session opens
  // (a different appName may trigger this after a previous session closed).
  useEffect(() => {
    if (!isOpen) return
    setPhase('consent')
    setProvisionError(undefined)
    setProvisioned(false)
    // D-15 (34.13-09): also clear the seeded engine and its persisted-lookup
    // state. The seeding effect below latches on the first non-undefined
    // engine it sets (guarded by `wineVersion` itself) and never seeds
    // again — without this reset, a SECOND guided-setup session in the same
    // app run would keep the FIRST session's engine forever and never
    // consult the new session's persisted value (<verified_findings> item 3).
    setWineVersion(undefined)
    setPersistedWineVersion(undefined)
    setPersistedLookupSettled(false)
  }, [isOpen, appName])

  // D-03: fetch the available compatibility engines. `enginesFetched` gates the
  // seeding effect below so we only choose a default engine once the list is
  // known — otherwise a CrossOver engine that loads after globalConfig would be
  // missed (the seed runs once and is guarded by `wineVersion`).
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    void window.api.getAlternativeWine().then((list: WineInstallation[]) => {
      if (cancelled) return
      setWineVersionList(list)
      setEnginesFetched(true)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  // D-15 (34.13-09) read half: fetch the persisted wine engine over 34.13-07's
  // real IPC channel, keyed on the session (isOpen + appName) rather than
  // useAwaited — useAwaited's [] dep list fires once at mount, before any
  // session exists, so it would fetch for the wrong game exactly once,
  // forever (<verified_findings> item 1). Mirrors the engine-fetch effect's
  // own cancelled-guard shape immediately above.
  useEffect(() => {
    if (!isOpen) return
    if (!appName) {
      // No game to look up yet — settle immediately so the seeding effect
      // below is never wedged waiting on a lookup that will never fire.
      setPersistedLookupSettled(true)
      return
    }
    let cancelled = false
    void window.api
      .isSteamBottleEligible(appName)
      .then((verdict) => {
        if (cancelled) return
        // Only wineVersion is consumed here: `eligible` is already the
        // reason the wizard is open (re-gating on it would be a frontend
        // re-derivation of an authority D-09 places in the backend), and
        // `bottleName` is 34.13-10's read-only concern, never this wizard's
        // (<verified_findings> item 5).
        setPersistedWineVersion(verdict.wineVersion)
        setPersistedLookupSettled(true)
      })
      .catch(() => {
        if (cancelled) return
        // Degrade to today's derived default rather than hang — every
        // terminal path (resolve, reject, skip) settles exactly once.
        setPersistedLookupSettled(true)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, appName])

  useEffect(() => {
    if (!globalConfig || wineVersion || !enginesFetched || !persistedLookupSettled) return
    // D-15 (34.13-09): a persisted engine (read above) wins verbatim over the
    // CrossOver-preferring derivation — the seeding effect latches on the
    // FIRST non-undefined engine it sets (guard above, `wineVersion` itself),
    // so seeding before the persisted-lookup settles would make the derived
    // default PERMANENT and silently discard the user's earlier answer. The
    // CrossOver preference itself is unchanged: the bottle is created via
    // CrossOver's cxbottle (17-01/17-04), so CrossOver is the correct default
    // even when the user's global engine is plain Wine (17-06 UAT finding) —
    // resolveSteamBottleSeedEngine delegates to that exact derivation when
    // nothing is persisted.
    setWineVersion(
      resolveSteamBottleSeedEngine(
        persistedWineVersion,
        globalConfig.wineVersion,
        wineVersionList
      )
    )
    setWinePrefix(globalConfig.defaultWinePrefixDir)
    // ALWAYS the dedicated Steam bottle, never the user's shared GOG/Epic
    // bottle (globalConfig.wineCrossoverBottle) — the two must stay distinct
    // (17-02). Seeding the shared name here was the 17-06 UAT bug that would
    // have provisioned Steam into the shared bottle.
    setCrossoverBottle(DEFAULT_STEAM_BOTTLE_NAME)
  }, [
    globalConfig,
    wineVersion,
    enginesFetched,
    wineVersionList,
    persistedWineVersion,
    persistedLookupSettled
  ])

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
            runner="steam"
            winePrefix={winePrefix}
            setWinePrefix={setWinePrefix}
            wineVersion={wineVersion}
            setWineVersion={setWineVersion}
            wineVersionList={wineVersionList}
            crossoverBottle={crossoverBottle}
            setCrossoverBottle={setCrossoverBottle}
            sharedPrefixNote={t(
              'bottle.setup.sharedPrefixNote',
              'Reuses your global shared prefix/bottle instead of a dedicated one. Not recommended for Steam — the Windows Steam client should stay in its own dedicated GameLibSteam bottle.'
            )}
            // CR-01 (17-17): remove the shared-prefix escape hatch entirely on
            // the Steam setup path — the shared GameLib GOG/Epic bottle must
            // never be selectable for the dedicated Steam bottle. The Task 1
            // backend guard remains the authoritative stop; this removes the
            // reachable UI source that fed globalConfig.wineCrossoverBottle in.
            hideSharedPrefixToggle
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
              'bottle.setup.uncheckRunSteam',
              'On the final Steam installer screen, UNTICK "Run Steam" before clicking Finish — GameLib will start Steam itself once the bottle is ready.'
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
