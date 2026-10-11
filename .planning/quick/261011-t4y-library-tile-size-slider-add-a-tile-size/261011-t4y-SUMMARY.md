---
phase: quick-261011-t4y
plan: 01
subsystem: ui
tags: [library, tile-size, slider, css-custom-property, webview-zoom, focus-row-strip]
requires:
  - phase: quick-261011-mza
    provides: HEAD 46dfc9612 baseline
provides:
  - Library Tile size slider (140-320px, step 4, default 156) at the floor of the tier-2 panel, persisted
  - Fixed-width tile columns; window width changes only the column count
  - Focus-row strip cards equal to the tile width by construction (JS width sync retired)
  - --webview-zoom published after setZoom; tile CSS width = slider value / zoom
affects: [library, focus-row-strip, accessibility-zoom, tauri-preload]
tech-stack:
  added: []
  patterns:
    - "Tile width is a document-root custom property (--library-tile-width) written by setProperty with a literal name; .listing derives the zoom-compensated --library-tile-css-width"
    - "Pure helper module + node-env behaviour table + comment-stripped source gates (no jsdom)"
key-files:
  created:
    - src/frontend/screens/Library/libraryTileSize.ts
    - src/frontend/screens/Library/__tests__/libraryTileSize.test.ts
    - src/frontend/components/UI/NavShell/components/LibraryTileSizeSlider/index.tsx
    - src/frontend/components/UI/NavShell/components/LibraryTileSizeSlider/index.scss
    - .planning/todos/pending/2026-10-11-accessibility-zoom-is-not-reapplied-at-startup-under-tauri.md
  modified:
    - src/frontend/components/UI/Header/index.tsx
    - src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx
    - src/frontend/screens/Library/index.css
    - src/frontend/screens/Library/index.tsx
    - public/locales/en/gamelib.json
    - src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts
    - src/frontend/screens/Library/components/FocusRowStrip/index.css
    - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
    - src/preload/api/tauriWindowChrome.ts
    - src/preload/__tests__/windowChrome.test.ts
    - .planning/todos/completed/2026-10-01-library-tiles-stretch-with-window-width-consider-a-set-size.md (moved from pending/, Resolution appended)
decisions:
  - "Slider range 140-320 step 4 default 156, each bound to an existing gate (controller art-fit 136.6px; strip clearance, 336px supremum)"
  - "Strip width sync retired rather than adapted: strip aliases --focus-row-card-width to --library-tile-css-width"
  - "Zoom compensation by publishing the applied factor (--webview-zoom) after setZoom resolves, not by using zoomPercent/100"
status: complete
commits: 4
plan_head_before: 46dfc9612
plan_head_after: 37db50672
actuals:
  tokens: 24400
  tasks: 3
  commits: 4
completed: 2026-10-11
---

# Phase quick-261011-t4y Plan 01: Library tile-size slider Summary

**Playnite-style Tile size slider at the Library panel floor (140-320px, persisted) drives fixed-width grid and focus-row-strip tiles, with Accessibility zoom compensated by a published `--webview-zoom` divisor.**

## What was built

- **D-01/D-02:** `LibraryTileSizeSlider` (labelled native range, visible value, `aria-valuetext`) is the last child of `.Header__footer`. Moving it clamps, persists to `localStorage` key `libraryTileWidth`, and writes `--library-tile-width` on `document.documentElement`. `Library/index.tsx` restores it in a mount-only `useLayoutEffect` before first paint.
- **D-03:** `.gameList` is `repeat(auto-fill, var(--library-tile-css-width, 156px))` with `justify-content: start`; no `minmax`/`1fr`. `.focusRowTrack` aliases `--focus-row-card-width` to the same variable, so strip cards equal one grid tile by construction. The JS width sync (`createStripCardWidthSync`, `gridColumnCount/Width`, `readScrollerAllowance`, `StripLayoutContext`, the `gridShown` prop) was deleted; `focusRowOverflow.ts` has no `setProperty(` left.
- **D-04:** `tauriSetZoomFactor` computes the factor once and, after `setZoom` resolves, publishes it as `--webview-zoom` via an unexported `publishWebviewZoom` (finite and positive only). `.listing` declares `--library-tile-css-width: calc(var(--library-tile-width, 156px) / var(--webview-zoom, 1))`. Accessibility screen and GlobalState are untouched (`git diff 46dfc9612 -- src/frontend/screens/Accessibility src/frontend/state/GlobalState.tsx` is empty).
- The 2026-10-01 tiles-stretch todo is in `completed/` with a Resolution section; the new pending todo `2026-10-11-accessibility-zoom-is-not-reapplied-at-startup-under-tauri` records the boot-zoom gap (`severity: medium`, `platform: any`, `ready: live-gate`).

## Commits

| Task | Hash | Message |
| ---- | ---- | ------- |
| 1 (tracer) | `fa3f581ce` | feat(quick-261011-t4y): add the Library tile-size slider and fixed-width tile columns |
| 2 | `ae196e6f9` | refactor(quick-261011-t4y): focus-row strip cards follow the tile width; retire the strip width sync |
| 3 (code) | `74f51d6ec` | feat(quick-261011-t4y): Accessibility zoom no longer changes library tile size |
| 3 (todos) | `37db50672` | docs(quick-261011-t4y): close the library tile-size todo and file the startup-zoom follow-up |

## Verification

**Step-0 baseline** (Task 1 jest command at `46dfc9612`, before any edit): `Test Suites: 26 passed, 26 total`, `Tests: 553 passed, 553 total`. No suite in the targeted set was failing at baseline, so every red would have been this change's regression. None occurred.

| Task | Command | Result |
| ---- | ------- | ------ |
| 1 | jest (Library/__tests__, FocusRowStrip, gameCardControllerGeometry, Header/__tests__, cssTokenSweep, shellTokens; Frontend) | `Test Suites: 27 passed, 27 total` / `Tests: 590 passed, 590 total` |
| 1 | `pnpm i18n-churn-guard`; `git diff --name-only -- public/locales` | `clean -- no upstream public/locales/ catalog changed`; prints only `public/locales/en/gamelib.json` |
| 1 | eslint, `pnpm codecheck`, scoped `prettier --check` (after `--file-info` ignored:false for all 10 paths) | 0 errors (pre-existing warnings in Library/index.tsx); codecheck exit 0; "All matched files use Prettier code style!" |
| 2 | jest `src/frontend/screens/Library` + cssTokenSweep (Frontend) | `Test Suites: 46 passed, 46 total` / `Tests: 1101 passed, 1101 total`; librarySyncNoticeSource G3 still counts 3 |
| 2 | eslint, codecheck, scoped prettier (6 paths) | 0 errors; exit 0; formatted |
| 3 | jest `src/preload/__tests__/windowChrome.test.ts` (Preload) | `Tests: 27 passed, 27 total` (Z1-Z3 included, all pre-existing tests unchanged) |
| 3 | jest libraryTileSize + FocusRowStrip + cssTokenSweep (Frontend) | `Test Suites: 5 passed, 5 total` / `Tests: 171 passed, 171 total` |
| 3 | eslint, codecheck, scoped prettier (4 paths) | 0 errors; exit 0; formatted |
| 3 | todo location/Resolution greps | pass |
| 3 | `pnpm planning-gates` | **11/12 passed; see Deferred Issues** (`todo-frontmatter-gate.py` PASS) |

`public/locales/en/gamelib.json` and everything under `.planning/` are prettier-ignored (`--file-info` reports `ignored: true`), so no formatter check is claimed for them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Template-literal regex escapes in the new strip source gate**
- **Found during:** Task 2 (eslint `no-useless-escape` on `focusRowStripSource.test.ts`)
- **Issue:** The retired-exports check built its `RegExp` from a template literal with single-backslash `\s`/`\b`, which silently become `s` and a backspace, so the gate would have passed vacuously.
- **Fix:** Double-escaped (`\\s`, `\\b`); re-ran jest and eslint (0 errors).
- **Files modified:** `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts`
- **Commit:** `ae196e6f9` (fix landed before the commit)

**2. [Rule 3 - Blocking] Python edits wrote CRLF on Windows**
- **Found during:** Task 1 (`file` / git CRLF warnings)
- **Issue:** Scripted edits converted six LF files to CRLF; the repo pins `eol=lf`.
- **Fix:** Normalised to LF before staging; later scripted edits used `newline=''`. No CRLF reached a commit.

No other deviations. Plan executed as written, including the in-plan transient between Task 1 and Task 2 (strip JS sync still present after Task 1, retired in Task 2).

## Deferred Issues

**`pnpm planning-gates` is 11/12, not 12/12.** The failing gate is the STATE.md frontmatter parse check: `.planning/STATE.md` frontmatter does not parse (`bad indentation of a mapping entry (10:345)`, a long `Completed quick ...` line). This task did not touch STATE.md (it is unmodified at HEAD and untouched in the working tree), so it is pre-existing and out of scope. The gate that covers this task's output, `todo-frontmatter-gate.py`, passes. The orchestrator will be editing STATE.md for this task's row and should fix or confirm that line.

## Residuals and owed live check

Recorded in the closed todo's Resolution (also reproduced here):

- At zoom above 100%, a card's chrome still zooms inside a fixed tile, so the narrowest tiles crop controller-mode art; the geometry gates are proven at zoom 1 only.
- At effective zoom below 1 with large tiles, a hovered edge card's ring can reach past the strip's 15px inline padding.
- After an in-session zoom change, `window.location.reload()` (TauriLoginPanel retry) may leave the webview zoomed while `--webview-zoom` resets, until the next zoom change or restart. The new pending todo would close this.
- **Not live-verified.** Owed: midnightMirage, gruvbox_dark and dracula; drag-resize the window; Accessibility zoom at 60%, 100% and 200%; list layout; controller layout; an RTL locale. Nothing here has been seen rendered; all evidence is node-environment tests and source gates.

## Known Stubs

None.

## Threat Flags

None. The two trust boundaries (localStorage to CSS property; zoom factor to document root) are the plan's T-261011-t4y-01/-02, both mitigated by clamping and finite/positive guards and pinned by tests.

## Self-Check: PASSED

- Created files exist: `libraryTileSize.ts`, `libraryTileSize.test.ts`, `LibraryTileSizeSlider/index.tsx`, `LibraryTileSizeSlider/index.scss`, the new pending todo, and the moved completed todo (all verified present via the passing suites and `test -f`).
- Commits exist in `git log`: `fa3f581ce`, `ae196e6f9`, `74f51d6ec`, `37db50672`.
