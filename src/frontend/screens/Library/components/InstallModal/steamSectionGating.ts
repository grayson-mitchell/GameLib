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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  input: SteamSectionGatingInput
): SteamSectionGatingVerdict {
  // TASK 1 PLACEHOLDER -- deliberately wrong, replaced by Task 2's real
  // implementation. Returns "everything visible everywhere" unconditionally,
  // which violates D-18 on Linux, D-11 off-mac, D-02's dropdown
  // qualification on a bottled install, and D-20's content-light scoping
  // all at once -- exercising the harness across every axis it must guard.
  return {
    platformRow: 'readonly-windows',
    libraryDropdown: true,
    wineSection: true,
    freeSpaceLine: true,
    contentLightNotice: true,
    forceWindowsViaBottle: true
  }
}
