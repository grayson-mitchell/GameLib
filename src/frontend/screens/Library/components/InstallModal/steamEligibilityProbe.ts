import { useEffect, useRef, useState } from 'react'
import type { Runner } from 'common/types'
import type { SteamBottleEligibilityVerdict } from 'common/types/steam'
import type { SteamSectionGatingVerdict } from './steamSectionGating'

/**
 * Phase 34.13, Plan 11 -- D-25's eligibility state machine
 * (`34.13-CONTEXT.md` D-25, lines 277-286; `34.13-UI-SPEC.md`'s D-25 Busy
 * State Contract, which SUPERSEDES the retired "D-12 Busy State Contract").
 *
 * This is the EXACT INVERSION of the retired D-12 contract. Under D-12 the
 * probe ran BEFORE the decision to open the dialog, and the busy state
 * lived on the ORIGIN control (`MainButton.tsx` / `GameCard/index.tsx`).
 * Under D-25 the dialog opens INSTANTLY -- nothing is awaited before the
 * first render -- and the probe runs AFTER, inside a `useEffect`, with the
 * busy state living in the wine-section slot and on the dialog's OWN footer
 * Install button (`InstallModal/index.tsx` / `SteamDialog/index.tsx`,
 * wired by this plan's Task 3).
 *
 * The worst case is a cold metadata cache: `METADATA_FETCH_TIMEOUT_MS`
 * (15000ms, `state.ts:30`) is the bound `checkBottleEligibility()`
 * inherits, unchanged. Under D-25 that time is spent with the dialog OPEN
 * and its own Install button disabled -- never with an origin button
 * spinning.
 *
 * VACUITY BOUNDARY: everything below is a pure function plus a thin hook.
 * Nothing here proves anything renders -- that is `EligibilityLoadingRow`
 * (Task 2, direct-invocation proof) and 34.13-13's blocking manual gate.
 */

/**
 * The discriminated state this module threads through a dialog session.
 * `'pending'` carries only `appName` (no verdict yet); `'resolved'` also
 * carries the resolved `bottleRequired` boolean, one round trip's answer.
 *
 * 34.14 D-02/D-03: the `'resolved'` variant additionally carries
 * `hasWindowsDepot`/`depotSignalCaptured`, and 34.15 D-12 adds a third,
 * `hasMacDepot` -- three `SteamBottleEligibilityVerdict` booleans, riding the
 * SAME round trip -- no second probe, no second IPC call site. Named
 * `depotSignalCaptured` here (not `platformsCaptured`) so this module's
 * vocabulary matches the gating vocabulary `steamPlatformRow.ts`/
 * `steamSectionGating.ts` use; it is mapped 1:1 from
 * `verdict.platformsCaptured` at the one place the verdict enters
 * (`applyEligibilityResponse` below). The `'pending'` variant stays
 * unchanged -- a pending state carries no depot answer by definition; the
 * seed for an already-captured game is supplied by `index.tsx` (D-05), not
 * by this module.
 */
export type EligibilityState =
  | { phase: 'pending'; appName: string }
  | {
      phase: 'resolved'
      appName: string
      bottleRequired: boolean
      hasWindowsDepot: boolean
      hasMacDepot: boolean
      depotSignalCaptured: boolean
    }

/**
 * Whether the D-25 probe should run at all for the given host/runner. This
 * is a call-avoidance optimisation, never a verdict of its own (D-09):
 * eligibility itself always comes from the backend.
 */
export function shouldProbeEligibility({
  platform,
  runner,
  action
}: {
  platform: string | undefined
  runner: Runner
  /** 34.13 review WR-08. `InstallModal`'s consuming branch is
   * `isSteamManagedApp = runner === 'steam' && action === 'install' &&
   * gameInfo`, so an IMPORT dialog opened for a Steam game on macOS used to
   * fire `isSteamBottleEligible` -> `checkBottleEligibility()` ->
   * `ensurePlatformsCaptured()` -> a real outbound `appdetails` fetch and a
   * poll bounded only by `METADATA_FETCH_TIMEOUT_MS` (15s), to produce a
   * verdict nothing on that branch reads. Required (not optional-defaulted)
   * so a new caller cannot silently re-open the gap. */
  action: 'install' | 'import'
}): boolean {
  if (runner !== 'steam' || action !== 'install') {
    return false
  }
  // Written as an explicit win32/linux SKIP, never as
  // `platform !== 'darwin'` -- the same convention 34.13-08 uses for the
  // same reason. An absent or unrecognised `platform` (including
  // ContextProvider's own 'unknown' fallback) must still ask the backend
  // rather than silently answer "not eligible", which is the exact shape of
  // the cold-metadata-cache false negative
  // `.planning/debug/steam-bottle-guided-setup-never-fires.md` records.
  return platform !== 'win32' && platform !== 'linux'
}

/**
 * Synchronous seed for `useSteamBottleEligibility`'s `useState` -- this is
 * the mechanical meaning of "the dialog opens INSTANTLY": the FIRST render
 * is already correct, with nothing awaited before paint.
 */
export function initialEligibilityState({
  platform,
  runner,
  appName,
  action
}: {
  platform: string | undefined
  runner: Runner
  appName: string
  action: 'install' | 'import'
}): EligibilityState {
  if (shouldProbeEligibility({ platform, runner, action })) {
    return { phase: 'pending', appName }
  }
  // 34.14: this branch is only reached off the Steam-install-on-
  // non-Windows/Linux route (`shouldProbeEligibility` false), which is
  // exactly the route where `isSteamManagedApp` is false in `index.tsx` and
  // the Steam gating verdict is never consulted -- so this "settled and
  // uncaptured" shape can never reach D-04's fail-open on a surface that
  // renders it. Resolving immediately still requires an explicit depot
  // answer; `false`/`false` is the only honest one to give when the probe
  // never runs at all. 34.15 D-12: `hasMacDepot` joins the same
  // settled-and-uncaptured shape for the same reason.
  return {
    phase: 'resolved',
    appName,
    bottleRequired: false,
    hasWindowsDepot: false,
    hasMacDepot: false,
    depotSignalCaptured: false
  }
}

/**
 * Resolves a successful `isSteamBottleEligible` response onto the state.
 *
 * The `appName` comparison below is the PRIMARY control against a stale
 * cross-game response (T-34.13-11-02) -- it lives in this pure reducer, not
 * merely in the hook's effect-cleanup flag (which is a secondary,
 * belt-and-braces control; see `useSteamBottleEligibility` below).
 */
export function applyEligibilityResponse(
  state: EligibilityState,
  response: { appName: string; verdict: SteamBottleEligibilityVerdict }
): EligibilityState {
  if (state.appName !== response.appName) {
    return state
  }
  return {
    phase: 'resolved',
    appName: response.appName,
    bottleRequired: response.verdict.eligible,
    // 34.14 D-02 / 34.15 D-12: the widened verdict's three booleans travel
    // to the renderer on this SAME round trip -- no second guard needed, the
    // appName check above already covers the whole (now wider) response
    // object.
    hasWindowsDepot: response.verdict.hasWindowsDepot,
    hasMacDepot: response.verdict.hasMacDepot,
    depotSignalCaptured: response.verdict.platformsCaptured
  }
}

/**
 * Resolves a rejected/timed-out `isSteamBottleEligible` call fail-CLOSED,
 * per the UI-SPEC: "a timeout is not modeled as its own error state (falls
 * back to 'not eligible')" (T-34.13-11-01). There is no retry affordance --
 * the UI-SPEC is explicit that fail-closed-and-silent is the specified
 * behaviour.
 */
export function applyEligibilityFailure(
  state: EligibilityState,
  failure: { appName: string }
): EligibilityState {
  if (state.appName !== failure.appName) {
    return state
  }
  return {
    phase: 'resolved',
    appName: failure.appName,
    bottleRequired: false,
    // 34.14: this is NOT a fail-closed depot decision -- it records "we
    // never found out", not "no Windows depot exists". D-04's fail-open is
    // applied downstream, in `resolveDepotAvailability`
    // (`steamPlatformRow.ts`), which reads `probeSettled: true` together
    // with `depotSignalCaptured: false` here and OFFERS Windows rather than
    // hiding it. Without this note the pairing below reads as a
    // contradiction of D-04 rather than its input. 34.15 D-12: `hasMacDepot`
    // is covered by the SAME reading -- this records "we never found out",
    // NOT "no Mac build exists". Its downstream fail-open equivalent is
    // applied in the widened `resolveDepotAvailability` (Plan 04).
    hasWindowsDepot: false,
    hasMacDepot: false,
    depotSignalCaptured: false
  }
}

export function isEligibilityPending(state: EligibilityState): boolean {
  return state.phase === 'pending'
}

/**
 * Suppresses the verdict fields that are NOT synchronously known while
 * eligibility is pending. `wineSection`/`libraryDropdown`/`freeSpaceLine`
 * are forced `false`; `platformRow`/`contentLightNotice`/
 * `forceWindowsViaBottle` pass through byte-identical.
 *
 * FALSIFIED BRIEF (see `34.13-11-PLAN.md` `<falsified_briefs>` item 1): the
 * UI-SPEC claims the library dropdown and free-space line can render
 * immediately alongside the loading row because they "depend only on
 * nativeInstallOn/libraryCount, both known synchronously." FALSE --
 * 34.13-05's shipped formula is
 * `libraryDropdown = !wineSection && nativeInstallOn && libraryCount > 1`,
 * so both depend on the pending `bottleRequired` through `wineSection`.
 * Rendering them immediately would produce a dropdown that appears and then
 * VANISHES the instant eligibility resolves true -- worse than the
 * flicker-free snap D-25 asks for. Suppressed here instead.
 *
 * `platformRow` is still deliberately NOT suppressed here, but as of 34.14
 * it is NOT synchronous either -- it is synchronous only when the depot
 * signal was already captured at open (34.14 D-05's seed case, the common
 * path, where an already-captured game never flashes a pending state);
 * otherwise `resolveSteamSectionGating` returns the `'pending'` mode from
 * its own `depotSignalResolved` input (34.14 D-01/D-03), and
 * `resolveDepotAvailability` resolves that mode once this probe settles
 * (34.14 D-04). Suppressing `platformRow` here would still make the dialog
 * look empty on open -- the D-20 corner 34.13 declined to create -- and
 * would ALSO collapse the pending/`readonly-macos` distinction that
 * Phase 34.14 exists to create.
 */
export function applyEligibilityPending(
  verdict: SteamSectionGatingVerdict,
  pending: boolean
): SteamSectionGatingVerdict {
  if (!pending) {
    return verdict
  }
  return {
    ...verdict,
    wineSection: false,
    libraryDropdown: false,
    freeSpaceLine: false
  }
}

/**
 * 34.13 review B-WR-02 — suppress the content-light NOTICE until the Steam
 * library list is actually known.
 *
 * The notice's copy branches on `nativeInstallOn`, which is derived from
 * `steamLibraries.length > 0`. On the first render that array is `[]` by
 * initialisation, and on Windows/Linux `eligibility.pending` is already
 * `false` (`shouldProbeEligibility` skips those hosts), so nothing suppressed
 * the notice: the dialog painted "Turn on native Steam installs in Settings
 * …" on the very first frame of EVERY Steam options open on a non-mac host,
 * before the fetch resolved. `InstallModal/index.tsx` accepts "a
 * content-light form for one tick" as a design decision — but WR-04 turned
 * that tick into a WRONG, ACTIONABLE INSTRUCTION, which is a different thing.
 *
 * The same suppression covers a REJECTED fetch: `[]` from a transport failure
 * is not evidence the setting is off, and telling a user to go enable an
 * already-enabled setting because an IPC channel died is worse than saying
 * nothing.
 *
 * Only `contentLightNotice` is touched. The dropdown/free-space/wine gates
 * are already `false` for an unknown-or-empty list by their own formulas, so
 * suppressing them here would be a second, redundant derivation.
 *
 * KNOWN RESIDUAL, recorded rather than silently left: this makes the notice
 * honest about "not yet known", but it still cannot distinguish "the setting
 * is OFF" from "the setting is ON and Steam registers zero libraries" —
 * `listSteamLibraryTargets()` answers `[]` for both. Distinguishing them
 * needs the channel to return `{ enabled, targets }`, i.e. one read and two
 * facts, which is an IPC CONTRACT change across both runtimes (and
 * `SteamInstallLibraryTarget` is derived from that return type) — out of
 * scope for a review-fix pass.
 */
export function applyLibraryFetchPending(
  verdict: SteamSectionGatingVerdict,
  librariesSettled: boolean
): SteamSectionGatingVerdict {
  if (librariesSettled) {
    return verdict
  }
  return { ...verdict, contentLightNotice: false }
}

/**
 * The razor-thin hook composing the pure functions above. Seeds `useState`
 * synchronously (nothing is awaited before the first paint) and re-seeds,
 * during render (not in an effect), whenever `platform`/`runner`/`appName`
 * change identity -- so a re-seed lands on the SAME tick as the identity
 * change, before the next paint either.
 */
export function useSteamBottleEligibility({
  platform,
  runner,
  appName,
  action
}: {
  platform: string | undefined
  runner: Runner
  appName: string
  action: 'install' | 'import'
}): {
  pending: boolean
  bottleRequired: boolean
  hasWindowsDepot: boolean
  hasMacDepot: boolean
  depotSignalCaptured: boolean
} {
  const identityRef = useRef<string>()
  // `action` participates in the identity (WR-08): switching between the
  // install and import dialogs for the same game must re-seed, not reuse a
  // verdict gathered under the other action.
  const currentIdentity = `${platform}::${runner}::${appName}::${action}`
  const [state, setState] = useState<EligibilityState>(() => {
    identityRef.current = currentIdentity
    return initialEligibilityState({ platform, runner, appName, action })
  })

  if (identityRef.current !== currentIdentity) {
    // React-sanctioned "adjust state during render" pattern -- deriving
    // state from a changed identity here (rather than in an effect) keeps
    // the re-seed on the same tick as the change, not a tick after paint.
    identityRef.current = currentIdentity
    setState(initialEligibilityState({ platform, runner, appName, action }))
  }

  useEffect(() => {
    // WR-15: this used to read `isEligibilityPending(state)` while `state`
    // was absent from the dep array below. It happened to be correct only
    // because the render-phase re-seed above guarantees a fresh closure --
    // a load-bearing invariant with no comment and no test, and exactly the
    // shape ESLint flagged. `shouldProbeEligibility` is the SAME predicate
    // `initialEligibilityState` uses to decide `pending` in the first
    // place, so this is equivalent by construction rather than by timing,
    // needs no `state` dependency, and cannot go stale.
    if (!shouldProbeEligibility({ platform, runner, action })) {
      return
    }
    let cancelled = false
    // The ONLY IPC call site in this file -- 34.13-07's channel, unchanged.
    // No second, renderer-side numeric-appId guard is added here (T-34.13-
    // 11-05): that guard is 34.13-07's (`/^\d+$/`, before constructing a
    // SteamGame), and a frontend copy would be unenforceable and would
    // drift, the same `redeemSteamKey` two-copies-of-one-guard pattern this
    // repo already treats as an anti-pattern.
    window.api
      .isSteamBottleEligible(appName)
      .then((verdict) => {
        if (cancelled) return
        setState((prev) => applyEligibilityResponse(prev, { appName, verdict }))
      })
      .catch(() => {
        // Fail-closed on rejection or timeout (UI-SPEC: "a timeout is not
        // modeled as its own error state"). The backend's own
        // METADATA_FETCH_TIMEOUT_MS (15000ms) bounds how long this can take
        // before settling one way or the other -- there is no unbounded
        // await here, and this `.catch` is the only path that can resolve a
        // rejection (T-34.13-11-01: removing it would leave the state
        // pending forever on a transport error).
        if (cancelled) return
        setState((prev) => applyEligibilityFailure(prev, { appName }))
      })
    // Secondary control (belt-and-braces over the reducer's own appName
    // guard above): an unmounted dialog must never call setState.
    return () => {
      cancelled = true
    }
  }, [platform, runner, appName, action])

  return {
    pending: isEligibilityPending(state),
    bottleRequired: state.phase === 'resolved' ? state.bottleRequired : false,
    hasWindowsDepot: state.phase === 'resolved' ? state.hasWindowsDepot : false,
    hasMacDepot: state.phase === 'resolved' ? state.hasMacDepot : false,
    depotSignalCaptured:
      state.phase === 'resolved' ? state.depotSignalCaptured : false
  }
}
