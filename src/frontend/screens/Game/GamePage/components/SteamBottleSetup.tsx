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
  resolveSteamBottleSeedEngine,
  resolveSubmittedBottleEngine
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
    // 34.13 review C-06: the engine list and its own settle flag must reset
    // too, and for the same reason. `enginesFetched` is the seeding effect's
    // guard against "seed before the engine list is known" -- but it is
    // already `true` on session 2 (session 1 set it and nothing cleared it),
    // so the guard is INERT there: the seed can fire the instant
    // `persistedLookupSettled` flips, computing its default against session
    // 1's STALE `wineVersionList`, before the re-issued getAlternativeWine()
    // resolves. If the user installed CrossOver between the two sessions,
    // the derived default is computed from a list that does not contain it
    // -- exactly the failure the guard was written for.
    setEnginesFetched(false)
    setWineVersionList([])
  }, [isOpen, appName])

  // D-03: fetch the available compatibility engines. `enginesFetched` gates the
  // seeding effect below so we only choose a default engine once the list is
  // known — otherwise a CrossOver engine that loads after globalConfig would be
  // missed (the seed runs once and is guarded by `wineVersion`).
  //
  // 34.13 review C-18: this effect MUST track the same session key as the
  // reset effect above (`[isOpen, appName]`), not a strict subset of it. The
  // reset clears `enginesFetched`/`wineVersionList`, and this is their ONLY
  // writer. Keyed on `[isOpen]` alone, an `appName` change with `isOpen`
  // already true — `open(appName)` is `set({ isOpen: true, appName })`, and
  // the backend emits `steamBottleSetupRequired` from three sites on both
  // install() and launch() while this deliberately-non-modal banner is up —
  // zeroed both and nothing ever refilled them. The seeding effect's
  // `!enginesFetched` guard then returned forever: `wineVersion` stayed
  // undefined (D-15's persisted engine never seeded), `WineSelector` got an
  // empty list so the engine field was disabled and the "no CrossOver engine
  // detected" notice showed to users who have one, and `handleConfirm`
  // submitted `wineVersion: undefined`.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    void window.api
      .getAlternativeWine()
      .then((list: WineInstallation[]) => {
        if (cancelled) return
        setWineVersionList(list)
        setEnginesFetched(true)
      })
      .catch(() => {
        // 34.13 review C-19, sibling instance: the same bare-`void` shape the
        // poll carried. A rejected engine list must still SETTLE, otherwise
        // the seeding effect's `!enginesFetched` guard wedges the wizard
        // forever (the C-18 failure mode, reached by a different route).
        if (cancelled) return
        setWineVersionList([])
        setEnginesFetched(true)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, appName])

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
    if (
      !globalConfig ||
      wineVersion ||
      !enginesFetched ||
      !persistedLookupSettled
    )
      return
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
  //
  // 34.13 review C-05: keyed on `isOpen` as well as `phase`. This component
  // is mounted PERMANENTLY in App.tsx -- `isOpen: false` only makes it
  // `return null`, it never unmounts -- and `phase` is reset only by the
  // session effect above, which begins `if (!isOpen) return` and therefore
  // resets on OPEN, never on close. So clicking "Done" left `phase ===
  // 'provisioning'`, the effect did not re-run, its cleanup never fired, and
  // `steamBottleStatus()` kept being invoked every 3s for the remaining life
  // of the app. The interval only self-clears when `status.provisioned`
  // turns true, which never happens if the user cancelled the Steam
  // installer or the channel is erroring (the WR-03 `.catch` deliberately
  // keeps polling in that case).
  useEffect(() => {
    if (!isOpen || phase !== 'provisioning') {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = undefined
      }
      return
    }

    const poll = () => {
      void window.api
        .steamBottleStatus()
        .then((status) => {
          if (status.provisioned) {
            setProvisioned(true)
            if (pollRef.current) clearInterval(pollRef.current)
          }
        })
        .catch(() => {
          // 34.13 review WR-03: `void` alone silences the lint rule but
          // attaches NO rejection handler -- under the Tauri sidecar an
          // unported/erroring channel rejects, which produced an unhandled
          // rejection every STATUS_POLL_INTERVAL_MS for the whole
          // provisioning phase. A rejected status READ is not proof the
          // provisioning failed, so keep polling (the interval is still
          // armed) and let the next tick answer -- but never leave the
          // rejection unhandled.
        })
    }
    poll()
    pollRef.current = setInterval(poll, STATUS_POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = undefined
      }
    }
  }, [isOpen, phase])

  if (!isOpen) {
    return null
  }

  const handleCancel = () => {
    close()
  }

  const handleConfirm = async () => {
    setPhase('provisioning')
    setProvisionError(undefined)
    try {
      // 34.13 review C-03: never forward an engine the dialog's OWN D-16
      // filter refuses to offer. A GPTK/plain-Wine engine can be armed here
      // without any user choice (the Phase-17 global fallback, or a
      // persisted correction), and since D-16 emptied `engineOptions` it is
      // invisible and unselectable while still being submitted to a
      // `cxbottle`-only provisioner. `undefined` makes `provisionBottle`
      // derive its own engine, which is what the "GameLib will set one up
      // when the install starts" notice already promises the user.
      const result = await window.api.steamBottleProvision({
        bottleName: crossoverBottle || undefined,
        wineVersion: resolveSubmittedBottleEngine(wineVersion)
      })
      if (result.status === 'error') {
        setProvisionError(result.error)
        setPhase('error')
      }
    } catch (error) {
      // 34.13 review C-02. WR-03 attached a `.catch` to the 3s status POLL
      // and stopped there, but the wedge WR-03 was filed for originates
      // here: `steamBottleProvision` is `ipcRenderer.invoke` under Electron
      // and the sidecar transport under Tauri, and BOTH reject on a backend
      // throw, a dead sidecar or a transport timeout. Unhandled, that left
      // `phase === 'provisioning'` forever -- the banner reading "Setting up
      // Steam - this can take a while on first run." with no error, no "Try
      // again" (that button only exists in the `error` phase) and the poll
      // still armed. Exactly the reported symptom.
      //
      // NOTE the asymmetry with the poll's `.catch` below, and it is
      // deliberate: a rejected status READ is merely an UNKNOWN verdict, so
      // that one keeps polling. A rejected PROVISION is a FAILED provision.
      setProvisionError(error instanceof Error ? error.message : String(error))
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
          {/* C-02: `void` on the JSX attribute so no promise floats off an
              event handler -- the try/catch inside handleConfirm makes it
              non-rejecting, and this states that intent at the call site. */}
          <button
            onClick={() => void handleConfirm()}
            className="button is-primary"
          >
            {t('bottle.setup.confirm', 'Set up Steam')}
          </button>
          <button
            onClick={handleCancel}
            className="button is-secondary outline"
          >
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
              'If Steam appears stuck on "Updating Steam", it may be waiting on its own self-update — give it a few minutes before assuming it\'s frozen.'
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
