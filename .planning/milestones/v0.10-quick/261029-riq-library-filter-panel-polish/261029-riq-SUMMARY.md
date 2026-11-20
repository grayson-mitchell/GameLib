---
status: complete
quick: 261029-riq
plans: [01, 02]
completed: 2026-10-29
---

# Quick 261029-riq: Library filter panel polish

## Commits

| Commit | Scope |
|---|---|
| 5f90c0f86 | Plan 01 Task 1: Filters heading rule lines (item 1), Focus-row heading aligned to first tile (item 2) |
| 712c0a121 | Plan 01 Task 2: themed Sort by picker on Dropdown (`closeOnSelect`) replacing the native select (item 4) |
| 26d3f046e | Plan 02 Step A: console pill chip and divider extracted to `styles/_pillChip.scss` mixins |
| 59ef82e05 | Plan 02 Tasks 1+2+3 folded: engine model, state/persistence/migrations, chip row, tour copy, runnability facet (item 3) |

Plan 02 Tasks 1-3 are one commit on purpose. The plan says tsc fails after Task 1 until Task 2 lands, and Task 2's codecheck in turn needs Task 3's FilterViewList/LibraryTour. No earlier slice compiles, and the plan does not authorise committing a broken slice.

## Plan 01

- Item 1: `.Header__filtersHeading` is a flex row with `::before`/`::after` 1px `--border-color` rules. DOM unchanged.
- Item 2: root cause was `.libraryHeader` padding all sides by `--space-md-fixed` inside `.focusRowStrip`, which pads inline by the same token. `.focusRowStrip .libraryHeader` now has `padding-inline: 0`. Non-vacuity test pins both inputs.
- Item 4: `Dropdown` gained opt-in `closeOnSelect` (panel click on a button, or Escape while expanded, collapses and refocuses the trigger; no new hooks; default off). Header uses `<Dropdown closeOnSelect className="Header__sortDropdown">` with three `NavItem` rows in `LIBRARY_SORT_FIELDS` order. No `<select>` remains. No new locale strings.

## Plan 02

- `installedOnly` (independent toggle) and `nativeOnly` (All/Native pair) engine stages. `hasNativeBuild` shared with `deriveRunnabilityTier`; `isHostNative` adds the macOS `mac_arch === '32'` exclusion.
- Migrations: `migrateLegacyLibraryView` (done in the `useState` initialiser, one-shot, removes `libraryView`) and `splitNativeFromRunnabilityFacet`. The runnability split runs in the `runnabilityFacet` initialiser (`platform` from ContextProvider was already in scope, so no mount effect was needed). The `nativeOnly` state is declared after it so it reads the persisted flag.
- `engineState.nativeOnly = platform !== 'win32' && nativeOnly` (D-riq-1). `view: 'all'` for the main grid.
- Removed: `libraryView`/`setLibraryView`, `VALID_LIBRARY_VIEWS`, the 'view' descriptor kind and its chip/remover. Kept for the Focus row: `LibraryView`, `FilterEngineState.view`, `passesView`.
- `FilterViewList` renders `(Installed) | (All games) (Native)` using the shared console mixins at panel size. Windows shows only Installed.
- `FilterRunnabilityFacet` filters out the 'native' tier (D-riq-2); on Linux the group disappears. The tier stays in the engine and Focus row.
- Tour step copy now `gamelib:tour.library.quickFiltersCollections`.
- Locale: only `public/locales/en/gamelib.json` (two hand-added keys: `library.filterPanel.native`, `tour.library.quickFiltersCollections`). `pnpm i18n` not run; `gamepage.json` untouched.
- Console mixin check: compiled `ConsoleMode/index.scss` before vs after is byte-identical (`diff` empty).

### Decisions (restated for the user to rule on)

- D-riq-1: Native pair hidden on Windows, flag forced off there.
- D-riq-2: "Runs natively" removed from the Runnability group under Filters.
- D-riq-3: chip order as the user wrote it.
- D-riq-4 FLAG: `deriveRunnabilityTier` still returns 'native' for a mac-native game with `mac_arch === '32'` (native check precedes the 32-bit bottle rule), so the Focus row's "Runs natively" can include a confirmed-32-bit build that the Native chip excludes. Not changed.
- 32-bit signal exists for Steam only (post-install Mach-O check; Apple-silicon known-fix hint). GOG/Epic/Amazon/Zoom/sideload have none, so mac-native games there are always included. Amazon never matches.
- All label: reused existing `viewAll` ("All games"), not a new "All" key, since the wrap could not be measured here. If it wraps or the user wants "All", add `library.filterPanel.nativeAll`.

## Deviations

- [Rule 3 - Blocking] `facetSelectionCount.test.ts` used `descriptor('view')`, a removed kind; switched to `installedOnly`.
- [Rule 3 - Blocking] Removed the now-unused `VALID_LIBRARY_VIEWS`/`LibraryView` import in `Library/index.tsx`.
- [Rule 1] `meta/__tests__/hardcodedStringGate.test.ts` W3 pinned `chipLabels.ts` exempted count 36; re-measured as 34 after the 'view' case was replaced (0 violations). Updated with a comment.

## Verification

- `pnpm codecheck`: clean. Dropdown/Header/NavShell/Library/ConsoleMode/styles jest: pass.
- ESLint: only pre-existing warnings, 0 errors.
- Prettier check clean on all touched files.
- Failing, NOT from this work:
  - `meta/__tests__/genI18nGateScope.test.ts` A-17 anti-rot: `meta/i18nForkTouchedFiles.json` lacks `src/frontend/helpers/signInIdentityResync.ts`, a file added by the preceding task quw (7ba00e7ec). Needs `i18nForkTouchedFiles.json` regenerated. Left alone.
  - The known `steamInstallOptionsEntry.test.ts` C3 was not in the run scope.

## Needs a live check

1. Filters heading shows rule, Filters, rule in midnightMirage, gruvbox_dark and dracula.
2. Focus row heading lines up with the first tile at two tile-slider sizes.
3. Sort by opens in-panel with no native popup, closes on choose and on Escape, and is reachable by Tab and controller (including the Dropdown synthetic-Tab path).
4. Chip row reads (Installed) | (All games) (Native), fits the ~230px column without awkward wrap; active chip legible and focus rings not clipped in all three themes.
5. Installed + Native combine.
6. A pre-upgrade profile with `libraryView=installed` opens as All + Installed; a saved `runnabilityFacet` with 'native' opens as Native.
7. Recently played and Favourites are still pickable in the Focus row.
8. A Mach-O-verified 32-bit Steam mac title is hidden by Native.
9. On Windows only the Installed chip shows.
