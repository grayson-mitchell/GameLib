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
export function selectSteamPlatformOptions<T extends { value: InstallPlatform }>(
  mode: SteamPlatformRowMode,
  platforms: T[],
  hasWindowsDepot: boolean
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
      const macEntry = platforms.find((p) => p.value === 'Mac')
      const windowsEntry = hasWindowsDepot
        ? platforms.find((p) => p.value === 'Windows')
        : undefined
      return [macEntry, windowsEntry].filter((p): p is T => Boolean(p))
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
    default:
      return undefined
  }
}
