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
 *
 * 34.15 D-12 widened that claim to cover mac too: `resolveDepotAvailability`
 * below is the single pure function answering BOTH platform questions from
 * one resolution moment, returning `{ depotSignalResolved,
 * windowsDepotOffered, macDepotOffered }`. It is the same function, not a
 * sibling -- two readers of the same fact is exactly the drift this header
 * already warns against, one level out.
 *
 * 34.15 gap-closure round, code review WR-01, post-execution:
 * `selectSteamPlatformOptions`'s `'selectable'` branch was found to still
 * offer macOS unconditionally, reading none of `resolveDepotAvailability`'s
 * output at all. `hasMacDepot`, added below, closes that gap additively --
 * see that function's own doc comment.
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
 * 34.15 D-12: the mac-side mirror of `hasSteamWindowsDepot`, written in the
 * identical shape and for the identical reason. Read this doc comment
 * before touching `resolveDepotAvailability`'s mac branch below -- it
 * records an asymmetry a reader will otherwise trip on.
 *
 * `library.ts:785` builds `GameInfo.is_mac_native` as `cachedMeta?.is_mac_native
 * ?? false` -- a DELIBERATE collapse at that boundary, unlike
 * `is_windows_native`, which is left three-valued there on purpose. So this
 * reader's `false` means "either no mac build OR never captured" and CANNOT,
 * on its own, distinguish those two cases. The captured question is answered
 * separately -- by `hasSteamDepotSignalCaptured` (via
 * `GameInfo.steamPlatformsCaptured`, which IS preserved three-valued) --
 * exactly the same two-read split the Windows side already uses via
 * `hasSteamWindowsDepot` + `hasSteamDepotSignalCaptured`. Anyone gating on
 * `is_mac_native === undefined` is writing dead code: by the time a
 * `GameInfo` reaches the frontend, that field has already been forced to
 * `false` if it was ever `undefined`.
 */
export function hasSteamMacDepot(
  gameInfo: { is_mac_native?: boolean } | null | undefined
): boolean {
  return gameInfo?.is_mac_native === true
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
 * 34.15 gap-closure (code review WR-01): the `'selectable'` branch's
 * `macEntry` used to be unconditional -- unlike `windowsEntry`, which was
 * already correctly gated on `hasWindowsDepot`. That directly contradicted
 * 34.15 D-14's own rule for `macDepotOffered` ("must never be loosened -- an
 * uncaptured or unresolved signal yields `false`, full stop"): a game whose
 * eligibility probe TIMED OUT reaches `'selectable'` with
 * `platformsCaptured: false` (so `effectiveBottleRequired` fails closed to
 * `false`) while `windowsDepotOffered` fails OPEN to `true` (34.14 D-04) --
 * and the unconditional `macEntry` offered "macOS" for a game whose mac
 * depot was never confirmed. `hasMacDepot` mirrors `hasWindowsDepot`'s
 * existing gate exactly, applied to the ONE branch WR-01 named
 * (`'readonly-macos'`/`'pending'` are unaffected -- both already resolve to
 * a single, confirmed-by-construction macOS entry via
 * `resolveSteamSectionGating`'s own branch ordering, not via this
 * parameter).
 *
 * Generic over `T` so it never needs to import `AvailablePlatforms` from
 * `index.tsx`.
 */
export function selectSteamPlatformOptions<
  T extends { value: InstallPlatform }
>(
  mode: SteamPlatformRowMode,
  platforms: T[],
  hasWindowsDepot: boolean,
  hasMacDepot: boolean
): T[] {
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
      // 34.15 WR-01: gated on hasMacDepot, mirroring the pre-existing
      // hasWindowsDepot gate immediately below -- see the doc comment above
      // this function for why the unconditional prior form was wrong.
      const macEntry = hasMacDepot
        ? platforms.find((p) => p.value === 'Mac')
        : undefined
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
 * 34.14 D-04/D-05, widened by 34.15 D-12: the single pure function that
 * decides BOTH Windows- and mac-depot availability, folding the decisions
 * the module's own header already claims as its exclusive territory ("the
 * single place in the codebase where [depot] availability is decided") into
 * one place -- one function, one resolution moment, for both platforms. D-12
 * widens this function's OUTPUT; it does not add a sibling.
 *
 * - D-05 (seed/resolve): the SAME fact -- is there a depot, is that answer
 *   captured -- read at two different times, for each platform. The
 *   `gameInfo` seed supplies the FIRST frame (so an already-captured game
 *   never flashes a pending state); the live eligibility probe supplies the
 *   answer once it lands. This is one function reading one fact twice per
 *   platform, not two competing sources.
 * - D-04 (fail-open on unknown, WINDOWS ONLY -- see the asymmetry comment
 *   below): what to do once the probe has TERMINALLY settled
 *   (`probeSettled`) but the depot signal still was never captured (offline,
 *   errored, or the 15s `METADATA_FETCH_TIMEOUT_MS` poll expired).
 */
export interface ResolveDepotAvailabilityInput {
  seedHasWindowsDepot: boolean
  seedHasMacDepot: boolean
  seedDepotSignalCaptured: boolean
  probeHasWindowsDepot: boolean
  probeHasMacDepot: boolean
  probeDepotSignalCaptured: boolean
  probeSettled: boolean
}

export interface ResolveDepotAvailabilityOutput {
  depotSignalResolved: boolean
  windowsDepotOffered: boolean
  macDepotOffered: boolean
}

export function resolveDepotAvailability(
  input: ResolveDepotAvailabilityInput
): ResolveDepotAvailabilityOutput {
  // D-05 seed/resolve selection: the seed decides the FIRST frame so an
  // already-captured game never flashes a pending state; the probe
  // supplies the live answer once it lands. Same fact at two times, not
  // two competing sources. Windows and mac each get their own selection
  // line, using the IDENTICAL idiom, because they are the same read
  // repeated for two fields -- not two different decisions.
  const hasWindowsDepot = input.probeSettled
    ? input.probeHasWindowsDepot
    : input.seedHasWindowsDepot
  const hasMacDepot = input.probeSettled
    ? input.probeHasMacDepot
    : input.seedHasMacDepot
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

  // 34.15 D-12: `macDepotOffered` is DELIBERATELY NOT symmetric with
  // `windowsDepotOffered` above -- this is the one place in this function
  // where "widen it the same way" would be wrong, and it must stay that way
  // even though the two lines sit right next to each other and look like
  // they should match.
  //
  // `windowsDepotOffered` fails OPEN when the probe settles uncaptured
  // (`|| (probeSettled && !depotSignalCaptured)`) because 34.14 D-04 decided
  // that offering Windows-via-bottle when the signal never resolved is
  // still a WORKING option most of the time (mac-only Steam games are
  // effectively a null set per the operator-locked domain constraint), so
  // withholding it costs more than offering it.
  //
  // `macDepotOffered` does NOT get that clause, and must never gain it.
  // Offering a macOS install for a game with no confirmed mac build does
  // not degrade gracefully the way Windows-via-bottle does -- it produces a
  // BROKEN install, not a working-but-suboptimal one. So the mac side stays
  // conservative: `macDepotOffered` is `true` ONLY when the signal was
  // genuinely captured AND said yes. An uncaptured or unresolved signal
  // yields `false` here, full stop -- never loosened toward `!== false`,
  // and never given the fail-open disjunct above.
  const macDepotOffered = hasMacDepot && depotSignalCaptured

  return { depotSignalResolved, windowsDepotOffered, macDepotOffered }
}
