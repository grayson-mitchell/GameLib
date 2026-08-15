import type { InstallPlatform } from 'common/types'

/**
 * The executable form of `34.13-UI-SPEC.md`'s Section-Gating Matrix (the
 * AMENDED, 8-row table) -- for a Steam game's install-options dialog, given
 * the dialog is ALREADY OPEN, which of five independently-gated regions
 * render, and what mode the platform row itself is in.
 *
 * (a) This module implements ALL 8 matrix rows. `34.13-UI-SPEC.md`
 *     "Section-Gating Matrix" is the source of truth; every branch below
 *     cites the row number(s) and decision ID(s) it implements.
 *
 * (b) WHY this is a standalone, zero-runtime-import module rather than an
 *     if/else chain inside `SteamDialog/index.tsx` / `InstallModal/index.tsx`:
 *     this repo's Frontend jest project has no jsdom and no
 *     react-test-renderer (`src/frontend/jest.config.js`'s own docstring
 *     states this and that adding either is excluded from auto-fix).
 *     `InstallModal/index.tsx` imports `./index.scss` as its very first
 *     line, so any test importing anything from it -- even a named, pure
 *     export -- dies at that import before the first assertion runs. This
 *     module is therefore the ONLY part of the Section-Gating Matrix Jest
 *     can prove here, the same extraction pattern already used by
 *     `SideloadDialog/filters.ts` and `WineSelector/engineFilter.ts`
 *     (34.13-03).
 *
 * (c) D-22 retired the auto-open triggers outright ("the auto-open triggers
 *     RETIRE. The user is the trigger.") and D-26 cut the always-show
 *     setting (D-13) entirely -- `AppSettings.alwaysShowSteamInstallForm`
 *     was never declared (confirmed absent by `34.13-01-SUMMARY.md`'s own
 *     source-gated contract test). This module therefore DELIBERATELY has
 *     no `opens` field, no `steamInstallFormOpens()` function and no
 *     `alwaysShowOn` input. The dialog opens because the user clicked
 *     "Install with options..." (34.13-08) -- nothing here computes WHETHER
 *     it opens, only what renders once it already has. Re-introducing a
 *     form-opening predicate here would resurrect exactly the auto-open
 *     triggers D-22 retired; the module's own test suite carries a
 *     comment-stripped source gate making that structurally detectable
 *     (T-34.13-05-06).
 *
 * (d) `contentLightNotice` is a UI-SPEC-mandated deliverable (Q6, catalog
 *     key `gamelib:steam.install.contentLightNotice`), NOT the empty-state
 *     field D-20 rejects. D-20's "build no empty state" ruling still holds
 *     -- a notice shown on a correctly-rendered dialog is not an empty
 *     state, and this verdict carries no empty-state field. (The prior,
 *     retired 16-row/`opens` plan draft PROHIBITED any `contentLight`-
 *     shaped verdict field; the amended, checker-approved UI-SPEC
 *     EXPLICITLY REVERSES that prohibition. Recorded here so a future
 *     reader does not "fix" it back.)
 *
 * (e) 34.13-10, 34.13-11 and 34.13-12 are this module's ONLY intended
 *     consumers -- NONE is wired by this plan. None of them may re-derive
 *     any of this logic in a local if/else chain (e.g. a second
 *     `availablePlatforms.length > 1` check, a second `libraryCount > 1`
 *     check, or a second `platformToInstall === 'Windows'` check).
 *     Duplication is exactly how the matrix drifts from the UI-SPEC.
 */

/**
 * The four states the platform row can render in. `'absent'` means the row
 * does not render at all (D-18, Linux-family hosts, unconditional).
 */
export type SteamPlatformRowMode =
  | 'absent'
  | 'readonly-windows'
  | 'readonly-macos'
  | 'selectable'

/**
 * Every fact the resolver needs. Deliberately a single flat interface with
 * no base/extends split -- the retired plan draft split this into
 * `SteamInstallTriggerInput` + a gating-only extension solely so a trigger
 * predicate could be called without `selectedPlatform`; with the predicate
 * gone (D-22) that split has no remaining purpose and would leave a
 * dangling type named "Trigger" this rewrite exists to remove.
 */
export interface SteamSectionGatingInput {
  /**
   * ContextProvider's `platform` value, i.e. `'darwin' | 'win32' | 'linux'`
   * at runtime (mirrors `FilterEngineDeps.hostPlatform`,
   * `src/frontend/types.ts:479-480`). Typed as a plain `string`, not
   * `NodeJS.Platform`, for the same reason `FilterEngineDeps` is: any other
   * runtime value (including ContextProvider's own `'unknown'` fallback)
   * falls into the fail-closed Linux-family bucket -- see step 1 of
   * `resolveSteamSectionGating`.
   */
  hostPlatform: string
  /**
   * D-09: the backend-authoritative `isSteamBottleEligible()` verdict's
   * `eligible` field, mapped onto this plain boolean by the caller
   * (34.13-10). This module treats it as an opaque INPUT and performs NO
   * eligibility re-derivation of its own -- see the module's D-09 source
   * gate (T-34.13-05-03).
   */
  bottleRequired: boolean
  /** Whether Settings > Steam > "Enable Steam native install" is ON. */
  nativeInstallOn: boolean
  /**
   * `listSteamLibraryTargets()`'s result length. Already gate-adjusted to
   * `0` by both IPC handler wrappers (`main.ts:913-914`,
   * `installFlowRegistration.ts:189-190`) when `nativeInstallOn` is
   * `false`, so `nativeInstallOn && libraryCount > 1` is *today* redundant
   * with `libraryCount > 1` alone -- kept as an independent input anyway
   * per `34.13-RESEARCH.md` Q5's own recommendation, so a future relocation
   * of that backend gate cannot silently sprout a library dropdown.
   */
  libraryCount: number
  /**
   * D-17: the caller's `gameInfo.is_windows_native === true` comparison.
   * `34.13-01-SUMMARY.md` pins `=== true` as the only value permitting a
   * Windows install to be offered; `undefined` (never captured) must never
   * coerce to available. This module never reads `is_windows_native`
   * itself -- it consumes this pre-computed boolean, which is what keeps
   * the D-09 source gate meaningful (nothing here needs the raw field).
   */
  hasWindowsDepot: boolean
  /** The live `platformToInstall` state value (`InstallModal/index.tsx:104`). */
  selectedPlatform: InstallPlatform
}

/**
 * Which of five independently-gated regions render, and what mode the
 * platform row is in. Exactly six fields. None is named `opens` -- see (c)
 * above.
 */
export interface SteamSectionGatingVerdict {
  platformRow: SteamPlatformRowMode
  libraryDropdown: boolean
  wineSection: boolean
  freeSpaceLine: boolean
  contentLightNotice: boolean
  forceWindowsViaBottle: boolean
}

/**
 * The executable form of `34.13-UI-SPEC.md`'s Section-Gating Matrix. See
 * the module header above for what this deliberately does NOT do (decide
 * whether the dialog opens) and `steamSectionGating.test.ts` for the
 * 96-combination, 8-row proof this function must satisfy.
 */
export function resolveSteamSectionGating(
  input: SteamSectionGatingInput
): SteamSectionGatingVerdict {
  // Step 1 (D-18): host bucket. Only 'darwin' and 'win32' get their own
  // branch; EVERYTHING else -- including 'linux' and ContextProvider's own
  // 'unknown' fallback -- falls into the Linux-family bucket. This is a
  // deliberate, fail-closed discretion call the UI-SPEC does not itself
  // enumerate (it only names 'Linux (host)'): a host we cannot positively
  // identify gets NO platform control rather than a possibly-wrong one,
  // which is the conservative reading of D-18's "does not render at all."
  const isMac = input.hostPlatform === 'darwin'
  const isWinHost = input.hostPlatform === 'win32'

  // Step 2: normalise bottleRequired off-mac. `isBottleEligible()` returns
  // `false` for `!isMac` (`games.ts:1329`), so a `true` value off-mac is
  // structurally impossible today -- normalising makes this module
  // fail-closed if that ever changes, rather than sprouting a wine section
  // on Windows (D-11) or Linux (D-18) from a caller-supplied `true`.
  const effectiveBottleRequired = isMac && input.bottleRequired

  // Step 3: whether a real library choice exists. Both conjuncts are kept
  // even though the backend IPC gate (`main.ts:913-914`,
  // `installFlowRegistration.ts:189-190`) already zeroes the list when
  // native install is OFF, making `nativeInstallOn` redundant with
  // `libraryCount > 1` alone today -- 34.13-RESEARCH.md Q5's own
  // recommendation, so a future relocation of that backend gate cannot
  // silently sprout a library dropdown here.
  const hasChoice = input.nativeInstallOn && input.libraryCount > 1

  // Step 4 (D-03/D-17/D-18/D-19): platformRow, in priority order.
  let platformRow: SteamPlatformRowMode
  if (!isMac && !isWinHost) {
    // D-18: the row does not render on Linux (or any unrecognised host) at
    // all -- unconditional, never gated on platform count (D-03).
    platformRow = 'absent'
  } else if (isWinHost) {
    // D-19: on Windows there is only ever one option -- read-only.
    platformRow = 'readonly-windows'
  } else if (effectiveBottleRequired) {
    // D-03 / Row 1: a bottle-required (non-native/32-bit) game has no
    // macOS option at all -- the row exists precisely so the user can see
    // why a bottle is being requested.
    platformRow = 'readonly-windows'
  } else if (input.hasWindowsDepot) {
    // D-17, rows 2/3/4: UNCONDITIONAL on macOS for a mac-native game with a
    // Windows depot -- no further gate (the retired model additionally
    // required the always-show setting to be ON; the UI-SPEC's own "the
    // old Row 4 discretion call is resolved by construction" note confirms
    // that gate is gone).
    platformRow = 'selectable'
  } else {
    // Rows 2/3 for a game with no Windows depot: the Windows `MenuItem` is
    // absent from the list (not present-but-disabled), so the row degrades
    // to read-only macOS.
    platformRow = 'readonly-macos'
  }

  // Step 5: effectivePlatform, a local (not a verdict field). This is what
  // makes the verdict invariant to a `selectedPlatform` the user could not
  // actually have chosen -- e.g. a stale 'Windows' value left over from a
  // different game, or a game whose depot signal changed underneath a
  // still-open dialog. Only a `'selectable'` row may respond to it.
  let effectivePlatform: InstallPlatform
  if (platformRow === 'selectable') {
    effectivePlatform = input.selectedPlatform
  } else if (platformRow === 'readonly-macos') {
    effectivePlatform = 'Mac'
  } else {
    // 'readonly-windows' and 'absent' both mean "not macOS-selectable" --
    // treat as Windows for the purposes of steps 6/7 below (matches D-19's
    // "only one option, ever" and D-18's "no macOS option renders at all").
    effectivePlatform = 'Windows'
  }

  // Step 6 (D-11/D-18): wineSection. The `isMac` guard is load-bearing --
  // the bottle never applies off-mac. 34.13-11 renders the D-25
  // eligibility loading row in THIS field's DOM slot while the verdict is
  // still pending, so this field's meaning is "the wine region belongs
  // here," not merely "a <WineSelector> is mounted right now."
  const wineSection =
    isMac && (effectiveBottleRequired || effectivePlatform === 'Windows')

  // Step 7 (D-17): forceWindowsViaBottle -- true only on row 4. `false` on
  // row 1: a bottle-required game already routes to the bottle through
  // `isBottleEligible()`, and 34.13-01 pins `undefined`/`false` as "legacy
  // routing, byte-identical to today" for this field.
  const forceWindowsViaBottle =
    isMac && !effectiveBottleRequired && effectivePlatform === 'Windows'

  // Step 8 (D-02): libraryDropdown. The `!wineSection` term is D-02's
  // qualification -- `installBottleNative()` overrides the write target to
  // `getBottleSteamappsDir(...)`, so a host-library dropdown on a bottled
  // install would be a lie about where the game goes. This is also what
  // makes row 4's dropdown false even when `hasChoice` holds.
  const libraryDropdown = !wineSection && hasChoice

  // Step 9 (D-08): freeSpaceLine. D-08 scopes free space to the SELECTED
  // Steam library drive, so it renders exactly when a library destination
  // is being shown -- the same rule rows 3/6/8 all confirm.
  const freeSpaceLine = libraryDropdown

  // Step 10 (D-20/Q6): contentLightNotice -- true on exactly rows 5 and 7.
  // This is the home the UI-SPEC gives D-20's expectation-setting copy
  // after D-26 cut the always-show tooltip it used to live in; owned by
  // 34.13-10 to render (catalog key
  // `gamelib:steam.install.contentLightNotice`). This is NOT an empty
  // state -- D-20's "build no empty state" ruling still holds and this
  // verdict carries no empty-state field.
  const contentLightNotice = !isMac && !libraryDropdown

  return {
    platformRow,
    libraryDropdown,
    wineSection,
    freeSpaceLine,
    contentLightNotice,
    forceWindowsViaBottle
  }
}
