import { faApple, faLinux, faWindows } from '@fortawesome/free-brands-svg-icons'
import { IconDefinition, faGlobe } from '@fortawesome/free-solid-svg-icons'

import { useContext, useEffect, useMemo, useRef, useState } from 'react'

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
  hasSteamMacDepot,
  hasSteamDepotSignalCaptured,
  resolveDepotAvailability,
  resolveSteamHeaderPlatforms,
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
import { DEFAULT_STEAM_BOTTLE_NAME } from 'frontend/screens/Game/GamePage/components/steamBottleDefaults'

/**
 * 34.13 review B-WR-02 (iteration 3): the Steam library fetch's three states.
 * `'pending'` and `'failed'` are BOTH "we have no list", but only `'pending'`
 * may suppress the dialog's explanatory copy — collapsing them (round 1 set
 * the initial value on rejection) suppressed it forever and left
 * `<DialogContent>` structurally empty on Linux.
 */
export type SteamLibraryFetch =
  | { phase: 'pending' }
  | { phase: 'ok'; targets: SteamDialogLibraryOption[] }
  | { phase: 'failed' }

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
  // 34.13 review B-WR-02, THEN re-raised as B-WR-02 in iteration 3.
  //
  // Round 1 made this a two-state `SteamDialogLibraryOption[] | null`, where
  // `null` meant "not settled". That closed the first-frame lie (initialising
  // to `[]` made "not yet known" indistinguishable from "native install is
  // OFF" and painted "Turn on native Steam installs in Settings…" on the
  // first frame of every Steam options open on a non-mac host) — but it
  // collapsed two very different unsettled states into one PERMANENT one: the
  // rejection handler set `null`, i.e. the INITIAL value, so
  // `steamLibrariesSettled` stayed false forever and the only explanatory
  // content in the dialog was suppressed forever. On Linux
  // (`platformRow: 'absent'`, no wine section, no dropdown, no loading row)
  // that leaves `<DialogContent>` rendering NOTHING AT ALL, permanently, with
  // no explanation and no retry — strictly worse than the pre-fix
  // "possibly-wrong sentence". `listSteamLibraryTargets` rejecting is not
  // hypothetical: this repo has ledgered sidecar channel failures repeatedly,
  // and the handler exists precisely because that happens.
  //
  // THREE states, because a rejection is a SETTLED — if unhelpful — answer
  // and must not masquerade as pending. `'failed'` currently renders the same
  // content-light copy a settled-empty fetch does (no new user-facing string,
  // so no UI-SPEC amendment); it is a distinct state so a future third
  // sentence has somewhere to attach without re-deriving the distinction.
  const [libraryFetch, setLibraryFetch] = useState<SteamLibraryFetch>({
    phase: 'pending'
  })
  const steamLibrariesSettled = libraryFetch.phase !== 'pending'
  // The array every downstream consumer wants. Kept as ONE derivation so no
  // call site re-invents `?? []`, and memoised so a re-render does not hand a
  // fresh `[]` identity to the gating memo.
  const steamLibraryList = useMemo(
    () => (libraryFetch.phase === 'ok' ? libraryFetch.targets : []),
    [libraryFetch]
  )

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

  // 34.15 D-12: the mac-side seed read, mirroring the Windows one directly
  // above -- both feed the ONE `resolveDepotAvailability` call below. This
  // does not replace `isMacNative` above, which still feeds the `platforms`
  // array's `available` computation -- a separate question from what the
  // Steam header/selector may OFFER.
  const hasMacDepot = hasSteamMacDepot(gameInfo)

  // 34.14 D-05: the seed half of the depot-availability resolution below --
  // whether the Windows-depot answer was already captured at library-sync
  // time. Read through this helper, never by the raw `steamPlatformsCaptured`
  // field name: `installModalSource.test.ts` bans that token in this file,
  // and a second raw reader here would be exactly the drift
  // `steamPlatformRow.ts`'s own header warns against.
  const seedDepotSignalCaptured = hasSteamDepotSignalCaptured(gameInfo)

  // 34.14 D-04/D-05: the ONE call to `resolveDepotAvailability` in this
  // file. All of D-04's fail-open-on-unknown and D-05's seed/probe
  // selection live inside that pure function -- this file contains no
  // behavioural conditional for either decision, deliberately, because this
  // file cannot be unit-tested (no jsdom, `import './index.scss'` on line 1
  // above). `probeSettled` is `!eligibility.pending`, the SAME expression
  // that disables the dialog's Install button (D-01), so the pending row
  // and the Install disable can never desync onto two different flags.
  // 34.15 D-12: widened IN PLACE to feed the mac seed/probe pair alongside
  // the Windows pair -- this stays the ONE call site in this file
  // (`steamEligibilityWiring.test.ts` E1 asserts exactly one occurrence). A
  // second call here would be a second, independently-drifting resolution
  // moment for the same fact.
  const { depotSignalResolved, windowsDepotOffered, macDepotOffered } =
    resolveDepotAvailability({
      seedHasWindowsDepot: hasWindowsDepot,
      seedHasMacDepot: hasMacDepot,
      seedDepotSignalCaptured,
      probeHasWindowsDepot: eligibility.hasWindowsDepot,
      probeHasMacDepot: eligibility.hasMacDepot,
      probeDepotSignalCaptured: eligibility.depotSignalCaptured,
      probeSettled: !eligibility.pending
    })

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

  // 34.15 gap-closure round, code review CR-01: the SteamDialog header's
  // glyph row content, projected from `platforms` through
  // `windowsDepotOffered`/`macDepotOffered` -- the SAME resolved fact the
  // platform selector below already reads -- rather than from the stale
  // `available` seed `availablePlatforms` carries. `availablePlatforms`
  // itself stays UNCHANGED and is still what feeds DownloadDialog /
  // ImportDialog / ThirdPartyDialog / SideloadDialog; this is a SEPARATE,
  // Steam-only projection, never a replacement for it. See
  // `resolveSteamHeaderPlatforms`'s doc comment in `steamPlatformRow.ts` for
  // the full defect writeup.
  const steamHeaderPlatforms: AvailablePlatforms = resolveSteamHeaderPlatforms(
    platforms,
    windowsDepotOffered,
    macDepotOffered
  )

  // 34.15 D-14: Windows is the unknown-case answer -- Windows-via-bottle
  // always works and most Steam titles are Windows-only. The
  // operator-locked constraint that mac-ONLY Steam games are a null set
  // does NOT imply most games HAVE a Mac build -- do not misread it as an
  // argument for defaulting to Mac.
  //
  // This is a `useState` INITIALIZER (below), so on its own it would run
  // ONCE at open, from the frozen seed, and stay 'Windows' even after the
  // probe resolves "this game IS mac-native" -- the observed Terraria
  // (105600) symptom: a game that genuinely ships both builds defaulted
  // away from its own native Mac build. The `useEffect` immediately below
  // re-derives once `depotSignalResolved` flips true, reading the SAME
  // resolved `macDepotOffered` this function takes as a parameter, so the
  // initializer and the re-derivation can never disagree.
  //
  // Re-deriving after open is SAFE only because Install stays DISABLED for
  // the entire pending window (34.14 D-01, `eligibilityPending`) -- the
  // value can never change out from under a user mid-commit.
  //
  // Per 34.15 D-05, unresolved-at-open remains a REACHABLE state even after
  // the bulk PICS capture ships (fail-soft sync, absent `oslist`,
  // cached-library early returns, cold start) -- this branch is not a rare
  // corner case and must not be treated as one.
  const getDefaultplatform = (macOffered: boolean): InstallPlatform =>
    isMac && macOffered ? 'Mac' : 'Windows'

  const [platformToInstall, setPlatformToInstall] = useState<InstallPlatform>(
    getDefaultplatform(macDepotOffered)
  )

  // 34.15 D-14: set `true` in the single place the user changes the value
  // (`platformSelection()`'s `onChange` handler below) -- guards the
  // re-derivation effect so an explicit user choice is never silently
  // overwritten once the depot signal resolves.
  const userChosePlatformRef = useRef(false)

  useEffect(() => {
    if (!depotSignalResolved || userChosePlatformRef.current) {
      return
    }
    setPlatformToInstall(getDefaultplatform(macDepotOffered))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depotSignalResolved, macDepotOffered, isMac])

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
    // A NEW session (different appName) must re-enter `pending`, otherwise the
    // previous game's settled answer is read while this game's fetch is still
    // in flight.
    setLibraryFetch({ phase: 'pending' })
    window.api
      .listSteamLibraryTargets()
      .then((libraries) => {
        if (cancelled) return
        setLibraryFetch({ phase: 'ok', targets: libraries })
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
        // 34.13 review B-WR-02 (iteration 3): `'failed'`, never back to
        // `'pending'`. Round 1 set the INITIAL value here, which made the
        // suppression permanent and emptied the dialog outright on Linux. A
        // rejection is a settled answer; it just is not a helpful one.
        setLibraryFetch({ phase: 'failed' })
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
        // 34.14 D-01/D-03: whether the depot question is even answerable
        // yet. Placed BEFORE `hasWindowsDepot` in this object -- mirroring
        // `SteamSectionGatingInput`'s own field order -- so the resolver's
        // D-03 read-order seam is visible at every call site, not just
        // inside the resolver itself.
        depotSignalResolved,
        // 34.14 D-04: the OFFER decision, not the raw seed -- folds in
        // D-04's fail-open-on-unknown. Passing the raw `hasWindowsDepot`
        // here instead would make the fail-open path render as no offer at
        // all, the exact regression `steamEligibilityWiring.test.ts`'s
        // Group E (34.14) E3 gate exists to catch.
        hasWindowsDepot: windowsDepotOffered,
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
    // 34.14: `hasWindowsDepot` replaced by `windowsDepotOffered` (the
    // memo body now reads the OFFER decision, not the raw seed) and
    // `depotSignalResolved` added. A stale dep here means the row never
    // leaves `'pending'` when the probe lands -- the exact bug this phase
    // fixes, reintroduced through a dependency array.
    [
      platform,
      platformToInstall,
      windowsDepotOffered,
      depotSignalResolved,
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
  // instead by `applyEligibilityPending`. `platformRow` still passes
  // through `applyEligibilityPending` untouched, but as of 34.14 it is NOT
  // synchronous -- it is synchronous only when the depot signal was
  // already captured at open (34.14 D-05's seed case); otherwise it starts
  // as `'pending'` and is resolved by `resolveDepotAvailability` feeding
  // `depotSignalResolved`/`windowsDepotOffered` into the `steamGatingRaw`
  // memo above (34.14 D-01/D-04/D-05). This is the SECOND of the two stale
  // comments 34.14 corrects (the first, `steamEligibilityProbe.ts:161-163`
  // at the time it was fixed, was 34.14-03's).
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
  // 34.14: the third argument is `windowsDepotOffered`, not the raw seed
  // `hasWindowsDepot` -- passing the raw seed here would let the D-04
  // fail-open path set `platformRowMode` to `'selectable'` while this
  // projection still dropped the Windows entry, an offer that renders as
  // no offer at all. Do not "simplify" this back to `hasWindowsDepot`.
  // 34.15 gap-closure round, code review WR-01: `macDepotOffered` is now
  // passed alongside `windowsDepotOffered` so the `'selectable'` branch can
  // gate its mac entry on the resolved signal too, instead of offering
  // macOS unconditionally. See `selectSteamPlatformOptions`'s doc comment.
  const platformRowOptions = isSteamManagedApp
    ? selectSteamPlatformOptions(
        platformRowMode,
        platforms,
        windowsDepotOffered,
        macDepotOffered
      )
    : availablePlatforms

  // G (34.13-12, design_decisions item 4): gated on `steamGating.wineSection`
  // on the Steam path, NEVER on the plain non-Steam wine derivation below.
  // On a Linux host `platformToInstall` defaults to `'Windows'` and
  // `isWin` is false, so that derivation is TRUE -- the naive wiring would
  // mount a wine section for matrix rows 11/12, violating D-11 and D-18.
  const showWineSelector = isSteamManagedApp ? steamGating.wineSection : hasWine

  useEffect(() => {
    if (showWineSelector) {
      // G-D05-BOTTLENAME (quick 260819-s8p): the read-only bottle-name field
      // must never render blank on the Steam branch. `isSteamManagedApp` is
      // the required guard here -- `showWineSelector` alone is also true on
      // the plain non-Steam `hasWine` arm, which must stay byte-for-byte
      // unchanged. ALWAYS the dedicated Steam bottle, never the user's
      // shared GOG/Epic bottle (globalConfig.wineCrossoverBottle) -- the two
      // must stay distinct (17-02). Seeding the shared name here was the
      // 17-06 UAT bug that would have provisioned Steam into the shared
      // bottle. The functional-updater form never clobbers an already-set
      // value and needs no `crossoverBottle` dependency (mirrors the
      // `setWineVersion` updater form's WR-15 reasoning below).
      if (isSteamManagedApp) {
        setCrossoverBottle((current) => current || DEFAULT_STEAM_BOTTLE_NAME)
      }
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
  }, [showWineSelector, isSteamManagedApp])

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
        onChange={(e) => {
          // 34.15 D-14: the user has now made an explicit choice -- the
          // re-derivation effect above must never overwrite it once the
          // depot signal resolves.
          userChosePlatformRef.current = true
          setPlatformToInstall(e.target.value as InstallPlatform)
        }}
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
            headerPlatforms={steamHeaderPlatforms}
            backdropClick={closeModal}
            platformToInstall={platformToInstall}
            gameInfo={gameInfo}
            crossoverBottle={crossoverBottle}
            gating={steamGating}
            steamLibraries={steamLibraryList}
            nativeInstallOn={steamNativeInstallOn}
            eligibilityPending={eligibility.pending}
            depotSignalResolved={depotSignalResolved}
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
