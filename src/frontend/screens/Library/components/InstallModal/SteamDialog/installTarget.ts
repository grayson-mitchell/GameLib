/**
 * Phase 34.13, Plan 10 -- the T-34.13-10-01 install-destination integrity
 * control for `SteamDialog`, NOT a convenience helper.
 *
 * Why this is a standalone, zero-runtime-import module rather than logic
 * inlined in `SteamDialog/index.tsx`: that `.tsx` transitively imports the
 * shared UI kit (`frontend/components/UI/Dialog`, `SelectField`), and those
 * modules pull in their own colocated stylesheets (`SelectField/index.tsx:5`
 * is `import './index.css'`). This repo's Frontend jest project has no
 * jsdom and no CSS transform (`src/frontend/jest.config.js`'s own
 * docstring), so any test importing anything -- even a named, pure export
 * -- from `SteamDialog/index.tsx` would die at that import before a single
 * assertion runs (`34.13-VALIDATION.md`'s hard constraint). This module is
 * therefore the only part of the D-02/T-34.13-10-01 destination logic Jest
 * can prove directly, following the same extraction pattern already used by
 * `SideloadDialog/filters.ts` and `WineSelector/engineFilter.ts`.
 *
 * The containment gate below (`resolveSteamInstallPath`) is what makes it
 * safe to wire the D-02 library dropdown's raw selection value directly into
 * `installSteamGame`'s filesystem-write-target argument: the value that
 * actually reaches the backend can never be anything other than `''` or an
 * EXACT member of the backend-supplied library list.
 */

/**
 * Structurally identical to the backend's `SteamLibraryTarget`
 * (`src/backend/storeManagers/steam/installLocation.ts:42-46`) and to the
 * shape `window.api.listSteamLibraryTargets()` declares inline
 * (`src/common/types/ipc.ts:280-282`). Declared locally, not imported from
 * `frontend/state/SteamInstallLocation.ts`, because 34.13-08 deletes that
 * file and its `SteamLibraryOption` export whole.
 */
export interface SteamDialogLibraryOption {
  path: string
  steamappsDir: string
  isPrimary: boolean
}

/**
 * D-02's "defaulting to the primary library", preserved verbatim from the
 * retiring `SteamInstallLocationPicker`'s own default-selection effect: the
 * primary entry wins, else the first entry, else the empty string.
 */
export function defaultSteamLibraryPath(
  libraries: SteamDialogLibraryOption[]
): string {
  const primary = libraries.find((lib) => lib.isPrimary)
  return (primary ?? libraries[0])?.path ?? ''
}

/**
 * T-34.13-10-01: the destination containment gate, applied at CONFIRM time
 * (never at render). In order:
 *
 * 1. `libraryVisible === false` -> always `''`, regardless of
 *    `selectedPath`. This is D-02's own qualification: with no dropdown
 *    shown, the destination belongs to the backend -- the bottle's own
 *    `steamapps` dir for a bottled install, or `resolveSteamInstallTarget`'s
 *    primary-library default for a delegated install -- and `''` is exactly
 *    what `installSteamGame`'s existing `path = ''` default already means
 *    today.
 * 2. Otherwise, `selectedPath` is returned ONLY when some entry of
 *    `libraries` has a `path` that is STRICTLY EQUAL to it -- deliberately
 *    no prefix check, no substring check, no path-join, no normalisation:
 *    joining or normalising a path is not the same as containing it (a
 *    ledgered Phase 18 lesson).
 * 3. Otherwise, fail safe to `defaultSteamLibraryPath(libraries)`. An
 *    unrecognised selection can only ever degrade to a known-good library
 *    or `''`, never to the unrecognised value itself.
 */
export function resolveSteamInstallPath(
  selectedPath: string,
  libraries: SteamDialogLibraryOption[],
  libraryVisible: boolean
): string {
  if (!libraryVisible) {
    return ''
  }
  if (libraries.some((lib) => lib.path === selectedPath)) {
    return selectedPath
  }
  return defaultSteamLibraryPath(libraries)
}
