---
quick_id: 260911-umj
title: Shrink shared control heights app-wide — SearchBar and SelectField to a matched 34px
date: 2026-09-11
status: done
resolves_todo: null
commits:
  - e368075c3
---

# Shrink shared control heights app-wide — Summary

CSS-only fix. `SelectField` and `SearchBar` are shared components used across ~27 files; both
were shrunk to a matched **34px** rendered height so they align visually wherever they co-occur
(Humble Keys, Discounts filters), per the operator's "5-10px too short app-wide" feedback that
descoped this from `260911-ue4`.

## Changes

**`src/frontend/components/UI/SelectField/index.css`**
- `.selectStyle, .selectFieldWrapper .MuiOutlinedInput-root { height: 40px }` → `height: 34px`
- No other change needed. MUI's own `.MuiOutlinedInput-input` padding did **not** need a scoped
  override — checked empirically (the plan flagged this as a real risk), text stayed centered
  with generous top/bottom clearance at the new height on every screen checked.

**`src/frontend/components/UI/SearchBar/index.scss`**
- `.SearchBar { padding: var(--space-xs) }` (8px) → `padding: 5px var(--space-2xs)` (5px
  vertical, 6px horizontal)
- `.searchButton { padding: var(--space-2xs) }` (6px) → `padding: var(--space-3xs)` (4px)
- The 5px vertical value is a bare pixel, not a spacing token. The nearest token step
  (`var(--space-2xs)`, 6px) was tried first and measured 36px live, not 34px — no available
  token combination hits 34px exactly given the icon's fixed 16px height
  (`2×padding + 2×button_padding + 16 = height`). Rationale is documented inline in the CSS.
  Horizontal padding was left on a token since it does not affect the height being matched.

**`.planning/todos/pending/2026-09-11-font-secondary-bold-is-used-but-defined-nowhere.md`** (new)
- Filed rather than fixed, per the plan's explicit scope boundary. `font: var(--font-secondary-bold)`
  is used in `SearchBar/index.scss`, `InfoBox/index.css`, and `FormControl/index.css`, but the
  custom property is declared nowhere — an invalid shorthand value that silently resets all the
  longhands it covers (`font-family`, `font-size`, `font-weight`, etc.) to inherited values.
  Frontmatter carries `severity: minor`, `platform: any`, `ready: code` per CLAUDE.md's gate.

## Hazards from the plan — how each resolved

| Hazard | Outcome |
|---|---|
| MUI's own `.MuiOutlinedInput-input` padding might clip text at 34px | Did not clip. No override added. Confirmed empirically on 3 screens. |
| `SearchBar` height is driven by padding + tallest child, not the input | Confirmed; reduced both `.SearchBar` and `.searchButton` padding, iterated once (36px → 34px) to hit the target exactly. |
| `.humbleKeysSortPicker`'s 12rem track / "Expiring soonest" clipping | Not touched, per instruction. No clipping observed — glyph ink band had ample margin at the new height. |
| Stale citation at `Humble/Keys/index.css:30` (cites `SearchBar/index.scss:3`) | Still accurate — the SearchBar edit did not move line 3 (`width: 100%;`). No fix needed. |
| `--font-secondary-bold` (defined nowhere) | Filed as a todo, not fixed, per explicit scope boundary. |

## Live, pixel-measured verification

Measured with a pure-Python PNG decoder against `screencapture -x -R116,65,1280,800` captures on
the already-running `tauri:dev` instance (pid 85831), reusing the pixel-luma-scan methodology
from `260911-t0p-UAT.md`. Retina 2x: raw pixel deltas ÷ 2 = CSS px.

| Screen | Control | Measured height | Notes |
|---|---|---|---|
| Humble Keys | Sort picker (`SelectField`) | ~34px | No clipping; "Expiring soonest" fully visible within the unshrunk 12rem track. |
| Humble Keys | Search pill (`SearchBar`) | 34.0 CSS px exactly | Icon and placeholder text well within interior. |
| Settings | "Choose App Language" (`SelectField`) | ~34px | Label/control row alignment holds. |
| InstallModal / DownloadDialog | Platform Version selector, Wine version selector (`SelectField`) | ~34px (33.5–34) | Densest stack in the app; no clipping in either selector. |
| Library header | `LibrarySearchBar` (`SearchBar`) | 34.0 CSS px exactly | Most visible search surface in the app; measured, not eyeballed. |

Both controls now measure the same 34px height everywhere checked, matching the plan's intent
that they align where they co-occur.

## Gate results

- `pnpm jest --selectProjects Frontend --passWithNoTests src/frontend/`: **159/159 suites, 2504/2504 tests passed** (4.415s). Includes `humbleKeysStylesheet.test.ts` (pins the untouched 12rem track) and the InstallModal test suites for the screen measured above.
- `pnpm codecheck` (`tsc --noEmit`): clean, no output.
- `pnpm lint`: **0 errors, 638 warnings**, exit 0. The two modified source files are `.css`/`.scss` and are not in ESLint's lint glob, so this change could not add or remove a TypeScript-ESLint warning; the count reflects the pre-existing baseline, not a regression from this task.
- `pnpm planning-gates`: **10/10 passed**, including `.planning/todos/todo-frontmatter-gate.py` (validates the new todo's frontmatter).

## Deviations from Plan

None — plan executed exactly as written, including both explicit "do not" items (no Humble-Keys-scoped override reintroduced; `.humbleKeysSortPicker`'s 12rem track untouched) and the explicit "file, don't fix" instruction for `--font-secondary-bold`.

## Left undone (by design)

- `--font-secondary-bold` remains defined nowhere — tracked in the new todo, not in scope for this task.

## Self-Check: PASSED

- `src/frontend/components/UI/SelectField/index.css` — FOUND, contains `height: 34px`
- `src/frontend/components/UI/SearchBar/index.scss` — FOUND, contains `padding: 5px var(--space-2xs);`
- `.planning/todos/pending/2026-09-11-font-secondary-bold-is-used-but-defined-nowhere.md` — FOUND
- Commit `e368075c3` — FOUND in `git log --oneline`
