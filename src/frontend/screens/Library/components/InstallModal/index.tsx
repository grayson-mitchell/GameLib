import { faApple, faLinux, faWindows } from '@fortawesome/free-brands-svg-icons'
import { IconDefinition, faGlobe } from '@fortawesome/free-solid-svg-icons'

import { useContext, useEffect, useMemo, useState } from 'react'

import ContextProvider from 'frontend/state/ContextProvider'
import {
  GameInfo,
  InstallPlatform,
  Runner,
  WineInstallation
} from 'common/types'
import { Dialog } from 'frontend/components/UI/Dialog'

import './index.scss'

import DownloadDialog from './DownloadDialog'
import ImportDialog from './ImportDialog'
import SideloadDialog from './SideloadDialog'
import SteamDialog from './SteamDialog'
import WineSelector from './WineSelector'
import { SelectField } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import { useTranslation } from 'react-i18next'
import ThirdPartyDialog from './ThirdPartyDialog'
import { Box, MenuItem, SvgIcon } from '@mui/material'
import {
  closeInstallGameModal,
  useInstallGameModal
} from 'frontend/state/InstallGameModal'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  resolveSteamSectionGating,
  type SteamSectionGatingVerdict,
  type SteamPlatformRowMode
} from './steamSectionGating'
import {
  hasSteamWindowsDepot,
  selectSteamPlatformOptions,
  readonlyPlatformValue
} from './steamPlatformRow'
import type { SteamDialogLibraryOption } from './SteamDialog/installTarget'
import {
  useSteamBottleEligibility,
  applyEligibilityPending,
  applyLibraryFetchPending
} from './steamEligibilityProbe'
import EligibilityLoadingRow from './SteamDialog/EligibilityLoadingRow'

type Props = {
  appName: string
  runner: Runner
  gameInfo?: GameInfo | null
}

export type AvailablePlatforms = {
  name: string
  available: boolean
  value: InstallPlatform
  icon: IconDefinition
}[]

// Phase 34.13, Plan 12 (D-01/D-03/D-05/D-16/D-17/D-18/D-19/D-22/D-25) --
// this file mounts the fifth `SteamDialog` sibling. Section visibility on
// the Steam path comes ENTIRELY from `steamSectionGating.ts`'s resolver
// verdict (see `steamGating` below, the single call site in this file) and
// must NEVER be re-derived locally -- no second platform-count guard, no
// second library-count guard, no locally re-checked selected-platform
// section condition.
// `legacyPlatformRowMode` (below) is the deliberate, byte-identical
// survival of the pre-existing guard for the four NON-Steam dialogs and is
// structurally unreachable from the Steam path (D-03). `34.13-13`'s manual
// UAT gate is the only evidence any of this actually renders -- this repo
// has no jsdom, so a green source gate and a broken dialog are
// indistinguishable to Jest (`34.13-VALIDATION.md`).
//
// Phase 34.13, Plan 11 (D-25) -- the eligibility probe lives INSIDE this
// component, below `InstallGameWrapper`'s `isOpen` mount gate (see that
// function at the bottom of this file). This is the EXACT INVERSION of the
// retired D-12 contract: the dialog opens INSTANTLY (nothing is awaited
// before the first render) and the probe's IPC round trip happens in a
// `useEffect` AFTER. The quick path never sets `isOpen`, so it structurally
// can never reach the hook call below (T-34.13-11-06).

function InstallModal({ appName, runner, gameInfo = null }: Props) {
  const { platform } = useContext(ContextProvider)
  const { t } = useTranslation('gamepage')
  const { t: tGamelib } = useTranslation('gamelib')
  const { action = 'install' } = useInstallGameModal()

  // Plan 11, D-25: called UNCONDITIONALLY for every runner -- React forbids
  // conditional hook calls. The IPC round trip is gated INSIDE the hook by
  // `shouldProbeEligibility`, which returns `false` for any non-Steam
  // runner, so this is a no-op call for GOG/Epic/Amazon/sideload, never a
  // probe. Do NOT "fix" this into a conditional call.
  // WR-08: `action` is threaded in so the probe fires only for the branch
  // that consumes it (`isSteamManagedApp` below requires
  // `action === 'install'`). Without it, opening the IMPORT dialog for a
  // Steam game on macOS ran a real `appdetails` fetch for a verdict nothing
  // on that branch reads.
  const eligibility = useSteamBottleEligibility({
    platform,
    runner,
    appName,
    action
  })

  const [winePrefix, setWinePrefix] = useState('...')
  const [wineVersion, setWineVersion] = useState<WineInstallation>()
  const [wineVersionList, setWineVersionList] = useState<WineInstallation[]>([])
  const [crossoverBottle, setCrossoverBottle] = useState('')
  const [sideloadTitle, setSideloadTitle] = useState(
    t('sideload.field.title', 'Title')
  )
  // 34.13 review B-WR-02: TRI-STATE. `null` means "the fetch has not settled"
  // and is distinct from a settled `[]` ("GameLib controls no local Steam
  // target"). It used to initialise to `[]`, which made "not yet known"
  // indistinguishable from "native install is OFF" and painted the
  // "Turn on native Steam installs in Settings…" instruction on the first
  // frame of every Steam options open on a non-mac host.
  const [steamLibraries, setSteamLibraries] = useState<
    SteamDialogLibraryOption[] | null
  >(null)
  const steamLibrariesSettled = steamLibraries !== null
  // The array every downstream consumer wants. Kept as ONE derivation so no
  // call site re-invents `?? []`, and memoised so the `null` case does not
  // hand a fresh `[]` identity to the gating memo on every render.
  const steamLibraryList = useMemo(() => steamLibraries ?? [], [steamLibraries])

  const isLinuxNative = Boolean(gameInfo?.is_linux_native)
  const isMacNative = Boolean(gameInfo?.is_mac_native)

  const isMac = platform === 'darwin'
  const isWin = platform === 'win32'
  const isLinux = platform === 'linux'
  const isSideload = runner === 'sideload'
  // D-01 (34.13-12): mirrors 34.13-08's own dispatch guard
  // (`runner === 'steam' && action === 'install' && gameInfo`) in
  // `InstallGameModal.ts`'s `installSteamGame` short-circuit, so a Steam
  // IMPORT still falls through to `ImportDialog` unchanged. `gameInfo` is
  // required because both the verdict and `SteamDialog` need it.
  const isSteamManagedApp =
    runner === 'steam' && action === 'install' && Boolean(gameInfo)

  // D-17 (34.13-12): the depot signal this file owns outright --
  // `gameInfo` is already in scope here, so a second copy anywhere else
  // would be the drift 34.13-05's verification section warns against.
  const hasWindowsDepot = hasSteamWindowsDepot(gameInfo)

  const platforms: AvailablePlatforms = [
    {
      name: 'Linux',
      available: isLinux && (isSideload || isLinuxNative),
      value: 'linux',
      icon: faLinux
    },
    {
      name: 'macOS',
      available: isMac && (isSideload || isMacNative),
      value: 'Mac',
      icon: faApple
    },
    {
      name: 'Windows',
      available: true,
      value: 'Windows',
      icon: faWindows
    },
    {
      name: 'Browser',
      available: isSideload,
      value: 'Browser',
      icon: faGlobe
    }
  ]

  const availablePlatforms: AvailablePlatforms = platforms.filter(
    (p) => p.available
  )

  const getDefaultplatform = (): InstallPlatform => {
    if (isMac && gameInfo?.is_mac_native) {
      return 'Mac'
    }

    return 'Windows'
  }

  const [platformToInstall, setPlatformToInstall] =
    useState<InstallPlatform>(getDefaultplatform())

  const hasWine = platformToInstall === 'Windows' && !isWin

  // D2 (34.13-12): the single Steam-library-targets IPC read in this file,
  // used TWICE -- as the gating resolver's `libraryCount`/`nativeInstallOn`
  // inputs below, and as `SteamDialog`'s `steamLibraries` prop. This cannot
  // live in `SteamDialog` (whose dropdown visibility IS
  // `gating.libraryDropdown`, computed from the very count this fetch would
  // produce -- a gate that could never populate itself) and cannot live in
  // `InstallGameModal.ts` (D-25: the options path performs zero IPC so the
  // dialog renders synchronously with no round trip). It lives here because
  // this is the one component that both computes the verdict and renders
  // the dialog.
  //
  // Fail-safe (design_decisions item 7): on the first render the fetch has
  // not resolved, so `steamGating` below is computed from `steamLibraries`
  // defaulting to `[]` -- D-20's accepted content-light form for one tick
  // -- rather than making the Steam branch conditional on the fetch and
  // falling through the ternary to `DownloadDialog`, which would hit D-07's
  // download-size stub hang.
  useEffect(() => {
    if (!isSteamManagedApp) {
      return
    }
    let cancelled = false
    window.api
      .listSteamLibraryTargets()
      .then((libraries) => {
        if (cancelled) return
        setSteamLibraries(libraries)
      })
      .catch(() => {
        if (cancelled) return
        // A resolved `[]` is the ordinary "native install OFF" signal
        // (both IPC handlers are server-gated on
        // `isSteamNativeInstallEnabled()`) and must NOT be logged as an
        // error -- only a genuine REJECTION is logged, so the anomaly is
        // diagnosable rather than silent.
        window.api.logError(
          `34.13-12 InstallModal: Steam library target fetch failed for appName "${appName}"`
        )
        // 34.13 review B-WR-02: stays `null` (UNKNOWN), never a settled `[]`.
        // A transport failure is not evidence that native Steam installs are
        // switched off, and the content-light copy would tell the user to go
        // enable an already-enabled setting on the strength of it.
        setSteamLibraries(null)
      })
    return () => {
      cancelled = true
    }
  }, [isSteamManagedApp, appName])

  // E (34.13-12): the SOLE call to `resolveSteamSectionGating` in this
  // file. One input object, one call -- there is no present/absent payload
  // branch (D-22/D-25 removed the payload the retired plan draft consumed)
  // and no hand-constructed verdict object anywhere below.
  //
  // Plan 11, D-25: `bottleRequired` is fed from the hook's resolved value
  // (`eligibility.bottleRequired`), which is fail-closed `false` while
  // pending -- that fail-closed default is `steamEligibilityProbe.ts`'s job
  // (`initialEligibilityState`), not re-derived here.
  // Hoisted (34.13 review WR-04) so the resolver input and `SteamDialog`'s
  // content-light copy selection read ONE expression, not two copies of it.
  // Both IPC handlers are server-gated on `isSteamNativeInstallEnabled()`
  // and return `[]` when native install is OFF, so a non-empty list IS the
  // ON signal -- RESEARCH.md Pitfall 4 forbids a second settings read.
  // (34.13 review B-WR-02: reads the derived list, so an UNSETTLED fetch is
  // `false` here exactly as an empty settled one is -- the difference is
  // carried by `steamLibrariesSettled` and consumed only by
  // `applyLibraryFetchPending` below, which is the one place the distinction
  // changes what the user is told.)
  const steamNativeInstallOn = steamLibraryList.length > 0

  const steamGatingRaw: SteamSectionGatingVerdict = useMemo(
    () =>
      resolveSteamSectionGating({
        hostPlatform: platform,
        selectedPlatform: platformToInstall,
        hasWindowsDepot,
        bottleRequired: eligibility.bottleRequired,
        // Both IPC handlers are already gated on
        // `isSteamNativeInstallEnabled()` and return `[]` when native
        // install is OFF, so the empty array IS the OFF signal --
        // RESEARCH.md Pitfall 4 forbids a second settings read to detect
        // it, and 34.13-05's matrix renders OFF and ON-with-<=1-library
        // identically, so this derivation is not merely convenient, it is
        // indistinguishable by construction.
        nativeInstallOn: steamNativeInstallOn,
        libraryCount: steamLibraryList.length
      }),
    // WR-15: `isSteamManagedApp` was listed but never referenced by the memo
    // body -- an unnecessary dependency ESLint flagged. Removed.
    // `steamNativeInstallOn` IS referenced (it replaced the inline
    // `steamLibraries.length > 0` in WR-04) and is therefore listed; it is
    // derived from `steamLibraries`, which stays listed for
    // `libraryCount`.
    [
      platform,
      platformToInstall,
      hasWindowsDepot,
      steamLibraryList,
      steamNativeInstallOn,
      eligibility.bottleRequired
    ]
  )

  // Plan 11, D-25: wrap the raw verdict through ONE pure function -- never
  // three inline `&& !pending` terms. FALSIFIED BRIEF (34.13-11-PLAN.md
  // <falsified_briefs> item 1): the UI-SPEC claims the library dropdown and
  // free-space line can render immediately alongside the loading row
  // because they "depend only on nativeInstallOn/libraryCount". FALSE --
  // 34.13-05's shipped formula is
  // `libraryDropdown = !wineSection && nativeInstallOn && libraryCount > 1`,
  // so both depend on the pending `bottleRequired` through `wineSection`.
  // Rendering them immediately would produce a dropdown that appears and
  // then VANISHES the instant eligibility resolves true. Suppressed here
  // instead by `applyEligibilityPending`; `platformRow` is genuinely
  // synchronous and passes through untouched.
  // 34.13 review B-WR-02: composed with a SECOND pure suppression, not an
  // inline `&& steamLibrariesSettled` at the render site -- the same rule
  // Plan 11 already applied to `applyEligibilityPending` ("wrap the raw
  // verdict through ONE pure function, never three inline terms").
  const steamGating: SteamSectionGatingVerdict = applyLibraryFetchPending(
    applyEligibilityPending(steamGatingRaw, eligibility.pending),
    steamLibrariesSettled
  )

  // F (34.13-12, D-03): `legacyPlatformRowMode` is the ONLY surviving
  // occurrence of the pre-existing platform-count guard (below) in this
  // file -- it preserves byte-identical behaviour for the four NON-Steam
  // dialogs and is structurally unreachable from the Steam path, because
  // `platformRowMode` below selects `steamGating.platformRow` whenever
  // `isSteamManagedApp` is true.
  const legacyPlatformRowMode: SteamPlatformRowMode =
    availablePlatforms.length > 1 ? 'selectable' : 'absent'
  const platformRowMode: SteamPlatformRowMode = isSteamManagedApp
    ? steamGating.platformRow
    : legacyPlatformRowMode
  // Reads the UNFILTERED `platforms` array on the Steam path, per
  // `steamPlatformRow.ts`'s own doc comment: `platforms`' `Windows` entry
  // is `available: true` unconditionally above, which is exactly what
  // D-17 must not trust, and a `'readonly-macos'` verdict resolved against
  // `availablePlatforms` could yield an empty option list for a
  // non-mac-native game.
  const platformRowOptions = isSteamManagedApp
    ? selectSteamPlatformOptions(platformRowMode, platforms, hasWindowsDepot)
    : availablePlatforms

  // G (34.13-12, design_decisions item 4): gated on `steamGating.wineSection`
  // on the Steam path, NEVER on the plain non-Steam wine derivation below.
  // On a Linux host `platformToInstall` defaults to `'Windows'` and
  // `isWin` is false, so that derivation is TRUE -- the naive wiring would
  // mount a wine section for matrix rows 11/12, violating D-11 and D-18.
  const showWineSelector = isSteamManagedApp ? steamGating.wineSection : hasWine

  useEffect(() => {
    if (showWineSelector) {
      const getWine = async () => {
        const newWineList: WineInstallation[] =
          await window.api.getAlternativeWine()
        setWineVersionList(newWineList)
        // WR-15: read the CURRENT selection through the functional setState
        // form rather than closing over `wineVersion`. Adding `wineVersion`
        // to this effect's dep array (ESLint's literal suggestion) would
        // re-fire the `getAlternativeWine` IPC round trip on every engine
        // selection, and the `setWineVersion(undefined)` below would feed
        // straight back into that same dep -- a self-retriggering effect.
        // The updater form has neither problem and needs no dep at all.
        setWineVersion((current) =>
          current?.bin && !newWineList.some((w) => w.bin === current.bin)
            ? undefined
            : current
        )
      }
      // WR-03: a rejected getAlternativeWine leaves the engine list empty,
      // which the selector already renders as a disabled dropdown -- but a
      // floating promise here was an unhandled rejection under the Tauri
      // sidecar.
      getWine().catch(() => {
        window.api.logError(
          '34.13-12 InstallModal: getAlternativeWine failed; engine list left empty'
        )
      })
    }
  }, [showWineSelector])

  function platformSelection() {
    if (platformRowMode === 'absent') {
      return null
    }
    const disabledPlatformSelection = Boolean(runner === 'sideload' && appName)
    return (
      <SelectField
        label={`${t('game.platform', 'Select Platform Version to Install')}:`}
        htmlId="platformPick"
        value={readonlyPlatformValue(platformRowMode) ?? platformToInstall}
        disabled={platformRowMode !== 'selectable' || disabledPlatformSelection}
        onChange={(e) =>
          setPlatformToInstall(e.target.value as InstallPlatform)
        }
        afterSelect={
          isSteamManagedApp && platformRowMode === 'selectable' ? (
            <InfoIcon
              text={tGamelib(
                'gamelib:steam.install.forceWindowsHelp',
                'This game has a native macOS version, but you can install the Windows version instead through a Wine bottle — useful if the native build is missing features or performs worse.'
              )}
            />
          ) : undefined
        }
      >
        {platformRowOptions.map((p, i) => (
          <MenuItem value={p.value} key={i}>
            <Box sx={{ display: 'flex', placeItems: 'center' }}>
              <SvgIcon sx={{ marginInlineEnd: 1 }}>
                <FontAwesomeIcon icon={p.icon} />
              </SvgIcon>
              {p.name}
            </Box>
          </MenuItem>
        ))}
      </SelectField>
    )
  }

  const showDownloadDialog = !isSideload && gameInfo
  const isThirdPartyManagedApp = gameInfo && !!gameInfo.thirdPartyManagedApp
  const isImportMode = action === 'import'

  const closeModal = () => closeInstallGameModal()

  return (
    <div className="InstallModal">
      <Dialog
        onClose={closeModal}
        showCloseButton
        className="InstallModal__dialog"
      >
        {isSteamManagedApp && gameInfo ? (
          <SteamDialog
            appName={appName}
            runner={runner}
            winePrefix={winePrefix}
            wineVersion={wineVersion}
            availablePlatforms={availablePlatforms}
            backdropClick={closeModal}
            platformToInstall={platformToInstall}
            gameInfo={gameInfo}
            crossoverBottle={crossoverBottle}
            gating={steamGating}
            steamLibraries={steamLibraryList}
            nativeInstallOn={steamNativeInstallOn}
            eligibilityPending={eligibility.pending}
          >
            {platformSelection()}
            {/* Plan 11, D-25: the wine region's FIRST arm is the pending
                loading row -- it occupies the exact DOM slot <WineSelector>
                would otherwise take. Mutually exclusive with <WineSelector>
                TWICE OVER: by this ternary AND by `applyEligibilityPending`
                forcing `steamGating.wineSection: false` while pending
                (belt-and-braces, deliberately). */}
            {eligibility.pending ? (
              <EligibilityLoadingRow />
            ) : showWineSelector ? (
              <WineSelector
                appName={appName}
                winePrefix={winePrefix}
                wineVersion={wineVersion}
                wineVersionList={wineVersionList}
                title={gameInfo?.title}
                setWinePrefix={setWinePrefix}
                setWineVersion={setWineVersion}
                crossoverBottle={crossoverBottle}
                setCrossoverBottle={setCrossoverBottle}
                initiallyOpen
                // D-16: deliberately not passing the CrossOver-only engine
                // filter override -- `resolveCrossoverOnly`'s `??` default
                // (`engineFilter.ts`) already returns true for
                // `runner === 'steam'`, and omitting that prop is what
                // exercises the same path `SteamBottleSetup.tsx` inherits
                // without being edited.
                runner="steam"
                bottleNameReadOnly
                // D-16 / Phase 17 CR-01 (34.13 review CR-01): the shared
                // GOG/Epic prefix+engine must NEVER be selectable for the
                // dedicated Steam bottle. Without this prop the "Use shared
                // Wine prefix" toggle renders here and writes
                // `globalConfig.wineVersion` -- the user's GLOBAL engine,
                // commonly GPTK/`toolkit` on macOS -- straight past
                // `filterWineEngines`' CrossOver-only filter and on into
                // `persistBottleWineVersion`, which the backend deliberately
                // does not reject. `resolveSteamBottleSeedEngine` then returns
                // that persisted engine verbatim, seeding the guided bottle
                // wizard with an engine `engineFilter.ts` describes as one
                // that "would silently produce a broken bottle."
                // `SteamBottleSetup.tsx` passes this same prop for exactly
                // this reason.
                hideSharedPrefixToggle
              />
            ) : null}
          </SteamDialog>
        ) : isThirdPartyManagedApp ? (
          <ThirdPartyDialog
            appName={appName}
            runner={runner}
            winePrefix={winePrefix}
            wineVersion={wineVersion}
            availablePlatforms={availablePlatforms}
            backdropClick={closeModal}
            platformToInstall={platformToInstall}
            gameInfo={gameInfo}
            crossoverBottle={crossoverBottle}
          >
            {platformSelection()}
            {showWineSelector ? (
              <WineSelector
                appName={appName}
                winePrefix={winePrefix}
                wineVersion={wineVersion}
                wineVersionList={wineVersionList}
                title={gameInfo?.title}
                setWinePrefix={setWinePrefix}
                setWineVersion={setWineVersion}
                crossoverBottle={crossoverBottle}
                setCrossoverBottle={setCrossoverBottle}
                initiallyOpen
              />
            ) : null}
          </ThirdPartyDialog>
        ) : isImportMode && showDownloadDialog ? (
          <ImportDialog
            appName={appName}
            runner={runner}
            winePrefix={winePrefix}
            wineVersion={wineVersion}
            availablePlatforms={availablePlatforms}
            backdropClick={closeModal}
            platformToInstall={platformToInstall}
            gameInfo={gameInfo}
            crossoverBottle={crossoverBottle}
          >
            {platformSelection()}
            {showWineSelector ? (
              <WineSelector
                appName={appName}
                winePrefix={winePrefix}
                wineVersion={wineVersion}
                wineVersionList={wineVersionList}
                title={gameInfo?.title}
                setWinePrefix={setWinePrefix}
                setWineVersion={setWineVersion}
                crossoverBottle={crossoverBottle}
                setCrossoverBottle={setCrossoverBottle}
              />
            ) : null}
          </ImportDialog>
        ) : showDownloadDialog ? (
          <DownloadDialog
            appName={appName}
            runner={runner}
            winePrefix={winePrefix}
            wineVersion={wineVersion}
            availablePlatforms={availablePlatforms}
            backdropClick={closeModal}
            platformToInstall={platformToInstall}
            gameInfo={gameInfo}
            crossoverBottle={crossoverBottle}
          >
            {platformSelection()}
            {showWineSelector ? (
              <WineSelector
                appName={appName}
                winePrefix={winePrefix}
                wineVersion={wineVersion}
                wineVersionList={wineVersionList}
                title={gameInfo?.title}
                setWinePrefix={setWinePrefix}
                setWineVersion={setWineVersion}
                crossoverBottle={crossoverBottle}
                setCrossoverBottle={setCrossoverBottle}
              />
            ) : null}
          </DownloadDialog>
        ) : (
          <SideloadDialog
            title={sideloadTitle}
            setTitle={setSideloadTitle}
            winePrefix={winePrefix}
            wineVersion={wineVersion}
            availablePlatforms={availablePlatforms}
            backdropClick={closeModal}
            platformToInstall={platformToInstall}
            appName={appName}
          >
            {platformSelection()}
            {showWineSelector ? (
              <WineSelector
                appName={appName}
                winePrefix={winePrefix}
                wineVersion={wineVersion}
                wineVersionList={wineVersionList}
                setWinePrefix={setWinePrefix}
                setWineVersion={setWineVersion}
                crossoverBottle={crossoverBottle}
                setCrossoverBottle={setCrossoverBottle}
                title={sideloadTitle}
              />
            ) : null}
          </SideloadDialog>
        )}
      </Dialog>
    </div>
  )
}

export function InstallGameWrapper() {
  const installGameModalState = useInstallGameModal()

  if (!installGameModalState.isOpen) {
    return <></>
  }

  return (
    <InstallModal
      appName={installGameModalState.appName!}
      runner={installGameModalState.runner!}
      gameInfo={installGameModalState.gameInfo}
    />
  )
}
