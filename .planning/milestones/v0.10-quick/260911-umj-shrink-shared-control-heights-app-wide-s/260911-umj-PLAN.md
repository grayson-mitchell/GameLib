---
quick_id: 260911-umj
title: Shrink shared control heights app-wide — SearchBar and SelectField to a matched 34px
date: 2026-09-11
status: in-progress
resolves_todo: null
---

# Shrink shared control heights app-wide

Descoped out of `260911-ue4`. The operator, looking at the Humble Keys sort picker, said the
bulk is **not** picker-specific: *"all similar controls like search look like could be 5-10
smaller in height."* That is correct — the chrome is inherited from two shared components, so
the fix belongs there, not in a screen stylesheet.

## Measured, on a live `tauri:dev` build at `daa1354c3`

| Control | Rendered | Declared source |
|---|---|---|
| `SearchBar` pill | **44.0 CSS px** | `.SearchBar { padding: var(--space-xs) }` + tallest child |
| `SelectField` select | **47.0 CSS px** (40 declared + focus ring) | `.selectStyle, .selectFieldWrapper .MuiOutlinedInput-root { height: 40px }` (`SelectField/index.css:6-39`) |

**Target: both to 34px.** Chosen so the two finally MATCH where they sit together (Humble Keys,
Discounts filters) rather than shaving a fixed amount off each and leaving 36 vs 32. Both
reductions (−10, −6) land inside the operator's stated 5–10 range.

## Blast radius — this is the reason it is its own task

- `SearchBar`: **6** call sites — `StoreSearch`, `Humble/Keys`, `Discounts/DiscountFilters`,
  `WineManager`, `Winetricks/WinetricksSearch`, and `components/UI/LibrarySearchBar` (the main
  library search, the most visible surface in the app).
- `SelectField`: **21** files — most of `Settings/`, the whole `InstallModal/` stack
  (`WineSelector`, `DownloadDialog/BuildSelector`, `BranchSelector`, `GameLanguageSelector`,
  `SteamDialog`), `Accessibility`, `LanguageSelector`.

A Humble-Keys-only check cannot clear this. Verification must span several screens.

## Two hazards to resolve empirically, not by prediction

**1. MUI's own vertical padding.** `.MuiOutlinedInput-input` ships ~16.5px top/bottom padding.
At a fixed `height: 40px` that is currently absorbed; at 34px it may overflow and clip the text
or push the baseline off-centre. If so, add a scoped `.MuiSelect-select` / `.MuiOutlinedInput-input`
padding override **in `SelectField/index.css` alongside the height** — do not leave the two
facts in different files.

**2. `SearchBar`'s height is not set by its input.** It is `padding: var(--space-xs)` (8px top
+ 8px bottom) plus the TALLEST CHILD, which is the icon button `.searchButton { padding:
var(--space-2xs) }` (`index.scss:63-66`), not `.searchBarInput`. Shaving only `.SearchBar`'s
padding will not reach 34px. Reduce both, and measure — do not assume the arithmetic.

Also note `.SearchBar` has `border-radius: var(--space-md)` (16px). At 34px tall that is close
to a full pill; check it still reads deliberately rather than accidentally.

## Do not

- **Do not** reintroduce any Humble-Keys-scoped height/box-shadow override. `260911-ue4`
  removed one on purpose (`90556860c`); a screen-scoped rule would fight this one.
- **Do not** touch `.humbleKeysSortPicker`'s `grid-template-columns: max-content 12rem`. The
  12rem track was deliberately left unshrunk. **If the height change also reduces the effective
  text width and "Expiring soonest" starts to clip, report it — do not silently widen or narrow
  that track**, it is pinned in `humbleKeysStylesheet.test.ts` and owned by ue4.
- **Do not** fix `--font-secondary-bold` here. It is used at `SearchBar/index.scss:84`,
  `InfoBox/index.css:39` and `FormControl/index.css:12` and **defined nowhere**, so
  `font: var(--font-secondary-bold)` is invalid at computed-value time and silently resets those
  longhands to inherited values. It is a real latent defect and it is **adjacent to your edit in
  the same file** — file it as a todo (frontmatter per CLAUDE.md: `severity`/`platform`/`ready`
  bare lowercase in that order; `ready: code`) rather than folding an unrelated font change into
  a height change.

## Watch out for a stale citation

`Humble/Keys/index.css:30` cites `components/UI/SearchBar/index.scss:3` by LINE NUMBER for
`width: 100%`. If your edit moves that line, the citation rots. Re-point it or make it
line-agnostic.

## Verify

Automated:
```
pnpm jest --selectProjects Frontend --passWithNoTests src/frontend/
pnpm codecheck
pnpm lint
```
`pnpm lint` matters here: CLAUDE.md records it as two ceilings with one free slot, so a new
warning is not free.

**Live, measured — the only thing that can actually adjudicate this.** `pnpm tauri:dev` is
already running (pid 85831, Vite watching, hot-reloads on save). For EACH of these four screens
capture `screencapture -x -R<window rect>` and measure the control's rendered height from the
pixels, exactly as `260911-t0p-UAT.md` did — a pure-Python PNG decoder is at
`/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/6f0d2f83-be12-4d31-8399-e95515ae9a5c/scratchpad/png.py`
(**no PIL and no ImageMagick on this machine**):

| Screen | What to check |
|---|---|
| Humble Keys | select height; `Expiring soonest` not clipped; search pill height |
| Settings | a `SelectField` row — label/control alignment still holds at 34px |
| InstallModal | `DownloadDialog` selectors — the densest stack, most likely to clip |
| Library header | `LibrarySearchBar` — the most visible search surface |

Report the measured height per screen. **Do not report a screen as fine because it "looks
fine"** — this repo has scored visual claims by eye wrongly three times; that is precisely why
the UAT above measured everything.

**Done:** both controls measure ~34px on every screen checked; no text clips; no control's label
or adjacent layout breaks; all three gates green; the `--font-secondary-bold` todo filed.
