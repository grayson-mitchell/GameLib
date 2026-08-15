import type { InstallPlatform } from 'common/types'
import type { SteamPlatformRowMode } from './steamSectionGating'

/**
 * Phase 34.13, Plan 12 -- the executable form of `34.13-UI-SPEC.md`
 * Interaction Contract item 6 ("Windows availability gating": the Windows
 * `MenuItem` is "simply absent from the list (not present-but-disabled)")
 * and CONTEXT.md D-17.
 *
 * WHY this is a standalone, zero-runtime-import module rather than logic
 * inlined in `InstallModal/index.tsx`: that file's very first line is
 * `import './index.scss'`, and this repo's Frontend jest project has no
 * jsdom and no CSS transform (`src/frontend/jest.config.js`'s own docstring
 * states this and that adding either is excluded from auto-fix,
 * `34.13-VALIDATION.md`'s hard constraint). Any test importing anything --
 * even a named, pure export -- from `index.tsx` dies at that import before
 * the first assertion runs. This module is therefore the only part of the
 * D-17 depot gate Jest can prove directly, the same extraction pattern
 * `steamSectionGating.ts` (34.13-05), `SideloadDialog/filters.ts` and
 * `WineSelector/engineFilter.ts` (34.13-03) already use.
 *
 * `gameInfo` is already in scope in `index.tsx`, so no other plan carries a
 * `hasWindowsDepot` copy -- this module is the single place in the codebase
 * where Windows-depot availability is decided. A second copy anywhere else
 * would be precisely the drift 34.13-05's verification section warns
 * against.
 */

/**
 * D-17's depot gate. Per `34.13-01-SUMMARY.md`, `is_windows_native` is
 * hydrated from `SteamMetadataCacheEntry.is_windows_native` and an ABSENT
 * value means "never captured" for this game (a pre-upgrade or cold-cache
 * entry) -- NOT "Windows available". Treating "unknown" as "available"
 * would offer a Windows install for a game with no confirmed Windows build,
 * which CONTEXT.md's Deferred Ideas explicitly rules out ("Forcing a
 * Windows install of a game with NO Windows depot").
 *
 * `=== true` and a `!!` truthiness coercion happen to agree on every
 * inhabitant of `boolean | undefined` (both collapse `false` and
 * `undefined` to `false`), so a truthiness-based saboteur would prove
 * nothing here. The real defect this strictness guards against is spelled
 * `gameInfo?.is_windows_native !== false` -- that inverted comparison
 * treats an absent/`undefined` signal (never captured) as available, which
 * is exactly the shape `34.13-01` names as wrong. This module's test file's
 * `treatsAbsentAsAvailable` saboteur is that exact expression.
 *
 * Accepts a structural parameter type rather than importing `GameInfo`, so
 * this module stays free of `common/types`' runtime graph (it has none --
 * see the zero-runtime-import claim above).
 */
export function hasSteamWindowsDepot(
  gameInfo: { is_windows_native?: boolean } | null | undefined
): boolean {
  return gameInfo?.is_windows_native === true
}

/**
 * D-17's option-list gate: per mode, which entries of the caller's
 * `platforms` array may appear in the Steam platform row's `<SelectField>`.
 *
 * The caller MUST pass the UNFILTERED `platforms` array (`index.tsx:65-90`),
 * not `availablePlatforms`. Two reasons, both load-bearing:
 * 1. `platforms`' `Windows` entry is `available: true` unconditionally
 *    (`index.tsx:80`) -- that flag is exactly what D-17 must not trust, so
 *    reusing it here would make this module's own gate decorative.
 * 2. `availablePlatforms` can lack the `Mac` entry for a non-mac-native
 *    game, so a `'readonly-macos'` verdict resolved against it could yield
 *    an empty option list with a pinned `value` MUI cannot match. Reading
 *    the unfiltered list makes every mode's option set total -- the verdict
 *    has already decided which values are legitimate for the row; this
 *    function's only additional gate is `hasWindowsDepot`.
 *
 * `'Mac'` is the `InstallPlatform` literal whose display name is `'macOS'`
 * -- do not invent a `'macOS'` value; the caller's `platforms` fixture uses
 * `value: 'Mac'` with `name: 'macOS'`.
 *
 * The D-17 rule is OMISSION: this function must never return a Windows
 * entry annotated as disabled, and no caller may render one as disabled --
 * when `hasWindowsDepot` is false, the `'selectable'` branch's returned
 * array simply contains no `'Windows'`-valued entry at all.
 *
 * Generic over `T` so it never needs to import `AvailablePlatforms` from
 * `index.tsx`.
 */
export function selectSteamPlatformOptions<
  T extends { value: InstallPlatform }
>(mode: SteamPlatformRowMode, platforms: T[], hasWindowsDepot: boolean): T[] {
  switch (mode) {
    case 'absent':
      return []
    case 'readonly-windows': {
      const windowsEntry = platforms.find((p) => p.value === 'Windows')
      return windowsEntry ? [windowsEntry] : []
    }
    case 'readonly-macos': {
      const macEntry = platforms.find((p) => p.value === 'Mac')
      return macEntry ? [macEntry] : []
    }
    case 'selectable': {
      const macEntry = platforms.find((p) => p.value === 'Mac')
      const windowsEntry = hasWindowsDepot
        ? platforms.find((p) => p.value === 'Windows')
        : undefined
      return [macEntry, windowsEntry].filter((p): p is T => Boolean(p))
    }
    case 'pending': {
      // 34.14: DELIBERATE (Claude's Discretion, --skip-ui) -- the pending
      // row reuses the existing read-only-macOS projection rather than
      // mounting a second `<EligibilityLoadingRow />`. The pending-
      // platform-row window is a strict SUBSET of the `eligibility.pending`
      // window (both are answered by the same single round-trip), so a
      // second mount would render two identical "Checking install
      // options…" rows simultaneously -- and would break
      // `steamEligibilityWiring.test.ts`'s B1 gate ("`<EligibilityLoadingRow`
      // appears exactly once"). The wait is already explained on screen by
      // the existing mount; the Install button is already disabled by
      // D-01/34.13 D-25.
      const macEntry = platforms.find((p) => p.value === 'Mac')
      return macEntry ? [macEntry] : []
    }
  }
}

/**
 * The value the `SelectField` is pinned to on a read-only row, so the
 * displayed value can never drift from `platformToInstall` (which
 * 34.13-05's `effectivePlatform` normalisation already makes irrelevant to
 * the verdict on every non-`selectable` row). `undefined` for `'absent'`
 * and `'selectable'` -- those rows either don't render at all or take their
 * value from live state, never from this function.
 */
export function readonlyPlatformValue(
  mode: SteamPlatformRowMode
): InstallPlatform | undefined {
  switch (mode) {
    case 'readonly-windows':
      return 'Windows'
    case 'readonly-macos':
      return 'Mac'
    case 'pending':
      // 34.14: explicit and deliberate, not a silent fallthrough into
      // `default` -- this codebase's convention is to name every case
      // rather than let the union member ride on the catch-all below. A
      // pending row pins its value to 'Mac' for the same reason
      // 'readonly-macos' does (step 5's effectivePlatform normalisation in
      // `steamSectionGating.ts` treats both identically).
      return 'Mac'
    default:
      return undefined
  }
}

/**
 * 34.14 D-05: whether the Windows-depot question was already answered at
 * library-sync time, per `GameInfo.steamPlatformsCaptured` (populated for
 * every game at sync time -- `library.ts:791`, `cachedMeta?.platformsCaptured
 * ?? false`, so a never-synced entry seeds conservatively to "not captured",
 * never to a false "captured" claim).
 *
 * Written exactly parallel to `hasSteamWindowsDepot`, for exactly the same
 * reason: `index.tsx` must NOT name the raw `steamPlatformsCaptured` field
 * itself (`installModalSource.test.ts:218-221` asserts zero occurrences of
 * that token in `index.tsx`, and `steamEligibilityProbe.test.ts`'s source
 * gate bans it there too). This helper is what keeps both of those shipped
 * gates green and unmodified -- `index.tsx` calls this function instead of
 * reading the field directly.
 *
 * `AppleWikiInfo.tsx:67`'s `gameInfo.steamPlatformsCaptured === true` check
 * is the in-repo precedent for the `=== true` comparison (never a `!!`
 * truthiness coercion, for the same "never captured must not coerce to a
 * fact" reasoning `hasSteamWindowsDepot`'s own doc-comment states above).
 */
export function hasSteamDepotSignalCaptured(
  gameInfo: { steamPlatformsCaptured?: boolean } | null | undefined
): boolean {
  return gameInfo?.steamPlatformsCaptured === true
}

/**
 * 34.14 D-04/D-05: the single pure function that decides Windows-depot
 * availability, folding two decisions the module's own header already
 * claims as its exclusive territory ("the single place in the codebase
 * where Windows-depot availability is decided") into one place:
 *
 * - D-05 (seed/resolve): the SAME fact -- is there a Windows depot, is that
 *   answer captured -- read at two different times. The `gameInfo` seed
 *   supplies the FIRST frame (so an already-captured game never flashes a
 *   pending state); the live eligibility probe supplies the answer once it
 *   lands. This is one function reading one fact twice, not two competing
 *   sources.
 * - D-04 (fail-open on unknown): what to do once the probe has TERMINALLY
 *   settled (`probeSettled`) but the depot signal still was never captured
 *   (offline, errored, or the 15s `METADATA_FETCH_TIMEOUT_MS` poll expired).
 */
export interface ResolveDepotAvailabilityInput {
  seedHasWindowsDepot: boolean
  seedDepotSignalCaptured: boolean
  probeHasWindowsDepot: boolean
  probeDepotSignalCaptured: boolean
  probeSettled: boolean
}

export interface ResolveDepotAvailabilityOutput {
  depotSignalResolved: boolean
  windowsDepotOffered: boolean
}

export function resolveDepotAvailability(
  input: ResolveDepotAvailabilityInput
): ResolveDepotAvailabilityOutput {
  // D-05 seed/resolve selection: the seed decides the FIRST frame so an
  // already-captured game never flashes a pending state; the probe
  // supplies the live answer once it lands. Same fact at two times, not
  // two competing sources.
  const hasWindowsDepot = input.probeSettled
    ? input.probeHasWindowsDepot
    : input.seedHasWindowsDepot
  const depotSignalCaptured = input.probeSettled
    ? input.probeDepotSignalCaptured
    : input.seedDepotSignalCaptured

  const depotSignalResolved = depotSignalCaptured || input.probeSettled

  // D-04, documented in full (this asymmetry must NOT be "corrected"
  // toward `applyEligibilityFailure`'s fail-CLOSED sibling in
  // `steamEligibilityProbe.ts` -- a later reviewer finding only ONE of the
  // two branches below, without this comment, is exactly the failure mode
  // this documentation obligation exists to prevent):
  //
  // - `platformsCaptured === true && hasWindowsDepot !== true` -> OMIT
  //   Windows. 34.13's fence is unchanged: a CONFIRMED absence of a Windows
  //   depot never offers the Windows option.
  // - `platformsCaptured === false` after the probe has TERMINALLY settled
  //   (offline, errored, or the 15s `METADATA_FETCH_TIMEOUT_MS` poll
  //   expired) -> OFFER Windows. This DELIBERATELY diverges from
  //   `applyEligibilityFailure`'s fail-CLOSED resolution for bottle
  //   eligibility in `steamEligibilityProbe.ts`.
  //
  // WHY the asymmetry is correct: bottle-eligibility failing closed costs
  // you nothing -- you still get a native install. Depot availability
  // failing closed costs you an option that almost certainly exists: per
  // the operator-locked domain constraint, mac-only Steam games are
  // effectively a null set, so fail-closed here would withhold Windows
  // from a game that (per that constraint) almost certainly has it.
  const windowsDepotOffered =
    hasWindowsDepot || (input.probeSettled && !depotSignalCaptured)

  return { depotSignalResolved, windowsDepotOffered }
}
