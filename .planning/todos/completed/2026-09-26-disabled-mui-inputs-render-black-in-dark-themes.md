---
created: 2026-09-26
title: 'Disabled MUI inputs render black text and icons in dark themes — createTheme declares no palette, so MUI silently defaults to light mode'
found_during: Phase 38 sitting 5 (quick 260926-a1l), item 38-S14 sub-case (a)
severity: medium
platform: any
ready: code
area: theming
files:
  - src/frontend/App.tsx
  - src/frontend/screens/Library/components/InstallModal/index.tsx
---

## What was observed

During `38-S14(a)` on Windows 11 with a dark theme active, the Steam install dialog's read-only
**"Windows"** platform row rendered with a **black icon and black text** against the dark dialog
surface. Operator's words: "note small ui issue in dark theme the windows icon and text are black".

Scored as a defect **separate from** `38-S14(a)`, which passed: that item's `expected:` is about
which regions render, not their colour — the same treatment `38-C06`'s caveat received in sitting 3.

## Mechanism — inferred from source, NOT from a measured computed colour

`src/frontend/App.tsx:85` builds the MUI theme with **no `palette` key**:

```js
const theme = createTheme({ direction, typography, components: { MuiPaper, MuiTooltip } })
```

With no `palette.mode`, MUI defaults to **light**. The only `styleOverrides` present are `MuiPaper`
and `MuiTooltip` — neither covers input states. A disabled MUI input therefore takes light-mode
`text.disabled` (≈ `rgba(0,0,0,0.38)`), and the `SvgIcon` wrapping the FontAwesome glyph inherits
`currentColor`, so **both** the label and the icon go black.

The row in question is a `SelectField` with `disabled={platformRowMode !== 'selectable' || ...}`
(`InstallModal/index.tsx:600`), and `platformRow` is `'readonly-windows'` on every Windows host
(`steamSectionGating.ts:182-207`).

**State this as an inference.** The `createTheme`-has-no-palette fact is read directly from source;
the consequence for `Mui-disabled` colour is standard MUI behaviour; the link to what the operator
saw is not a measured computed style. Confirm with DevTools before fixing.

## Why it took a Windows sitting to surface, and why the fix is probably not local

`readonly-windows` is the only `platformRow` mode that renders this row **disabled** on a host
where it is also the sole option. On macOS the row is normally `'selectable'`, i.e. enabled, so
this particular instance is structurally unreachable there.

But the cause is app-wide, not dialog-local: **every disabled MUI input in every dark theme should
be affected.** Audit for other disabled MUI controls before scoping a fix to this dialog — fixing
only the platform row would leave the class of bug in place, which is the pattern this repo
repeatedly stamps out. The likely correct fix is giving `createTheme` a palette that tracks the
active GameLib theme, not a per-component override.

Note the constraint that makes this less trivial than it looks: GameLib themes are CSS custom
properties resolved at paint time, and MUI's palette wants concrete values at theme-construction
time. `MuiPaper`'s existing override sidesteps this by passing `var(--text-default)` strings
straight through; whether the same trick works for the `Mui-disabled` selector chain needs
checking rather than assuming.

`severity: medium` — legibility defect on a control users are meant to read, bounded to disabled
inputs, no data at risk.

## Verification (once fixed)

In a dark theme, open the Steam install dialog on a Windows host: the read-only "Windows" row's
icon and label must be legible against the dialog surface. Then check at least one other disabled
MUI input elsewhere in the app in the same theme, to prove the class was fixed and not the instance.

## Resolution (2026-09-26, quick 260926-bil)

**Fix:** `src/frontend/App.tsx`'s inline `createTheme({...})` call (no `palette` key, so MUI
5.17.1 fell back to light-mode `text.disabled = rgba(0,0,0,0.38)` / `action.disabled =
rgba(0,0,0,0.26)`) is replaced by `buildMuiTheme(isRTL)`, a new factory in
`src/frontend/muiTheme.ts` that sets exactly two palette keys to CSS-variable strings:

- `palette.text.disabled = 'var(--text-secondary)'`
- `palette.action.disabled = 'var(--icon-disabled, var(--text-secondary))'`

`palette.mode` is deliberately left unset (`nord-light` is a light theme; the rest are dark; a
fixed mode would be wrong for at least one). No other palette key is touched, because MUI 5.17.1
runs `augmentColor` colour maths on keys like `primary`/`secondary` and that maths would throw on
a `var(...)` string — confirmed directly by re-running the ratchet's scanner against
`primary\.main` before reverting it (17 real `alpha()` call sites lit up across
`Autocomplete.js`, `ListItem.js`, `ListItemButton.js`, `MenuItem.js`, `TableRow.js`), proving the
guard can fail and is not vacuous.

The fix is app-wide (the single `buildMuiTheme` factory `App.tsx` uses for its one `ThemeProvider`),
not local to `InstallModal` or `SelectField`.

### Audit: every `disabled`-capable MUI control call site in `src/frontend`

Found via `grep -rlE "from '@mui/material" src/frontend --include=*.tsx | xargs grep -n disabled`,
then each hit read to confirm whether `disabled` lands on an MUI component, a custom wrapper
around a native element, or a bare native element.

| Call site | MUI component | Disabled colour source | Covered? |
|---|---|---|---|
| `SelectField` (wraps MUI `Select`) — callers: `InstallModal/index.tsx:600` platform row, `DownloadDialog/BranchSelector.tsx`, `DownloadDialog/BuildSelector.tsx`, `DownloadDialog/GameLanguageSelector.tsx`, `WineSelector/index.tsx:246` wine version, `Settings/components/CustomWineProton.tsx`, `SyncSaves/gog.tsx`, `SyncSaves/legendary.tsx` | MUI `Select` (via `InputBase`) | `palette.text.disabled` (`InputBase.js:81` root `color`, `:176` `WebkitTextFillColor` on the selected-value text) — the `FontAwesomeIcon`/`SvgIcon` rendered inside a `MenuItem`'s selected-value content (confirmed at `InstallModal/index.tsx:620-627`, the exact Windows-row icon from the original report) inherits `currentColor` from that same disabled root | **Yes** — fixed |
| `IconButton` (`AppleWikiInfo.tsx:126` refresh) | MUI `IconButton` | `palette.action.disabled` (`IconButton.js:95`) | **Yes** — fixed |
| `Button` (`WikiInfoEmptyState.tsx:74` Retry; `CategorySettings/index.tsx:136` Add new category) | MUI `Button` | `palette.action.disabled` (`Button.js:118/122`) | **Yes** — fixed |
| `SliderField` (wraps MUI `Slider`); `DiscountFilters/index.tsx:577` release-year `Slider` | MUI `Slider` | **Neither key** — `Slider.js:54` uses the static `palette.grey[400]` (`#bdbdbd`), a mode-independent MUI grey-scale value, not `text.disabled`/`action.disabled` | **N/A — not the reported defect.** `#bdbdbd` is a mid-grey, legible against both light and dark GameLib surfaces; it does not reproduce the black-on-dark illegibility this todo reports. Left unfixed as out of this defect's class; flagged here for visibility, not filed as a new todo, since it is a theme-consistency nit rather than a legibility failure |
| `MenuItem` (`CloudSavesSync.tsx:207,213` sync-command / open-folder items) | MUI `MenuItem` | **Neither key** — `MenuItem.js:94` applies `opacity: palette.action.disabledOpacity` to the item's already-themed text colour, not a colour substitution | **N/A — not the reported defect.** Opacity-dimming of correctly-themed text is not the black-literal substitution bug; no fix needed |
| `Tab`/`Tabs` (`SteamLogin/index.tsx`) | MUI `Tab`/`Tabs` | n/a — no `disabled` prop used on these in this file | Not applicable |
| `MenuItem value="disabled"` (`LibraryTopSection.tsx:45`) | MUI `MenuItem` | n/a — this is an option whose **value** is the string `"disabled"`; the `disabled` prop itself is never set | False positive from the grep sweep (matched the word "disabled" in a value/translation key, not the prop) |
| `t('game.branch.disabled', ...)` (`BranchSelector.tsx:99`) | n/a | n/a — a translation string, not a prop | False positive from the grep sweep |
| Buttons/links in `GameSubMenu/index.tsx`, `CategoriesManager/index.tsx`, `SteamDialog/index.tsx:559`, `SIDLogin/index.tsx:195`, `SteamLogin/index.tsx` (guard/credential buttons + username/password inputs), `Humble/Keys/index.tsx:615`, `DiscountFilters/index.tsx:278` reset, `SyncSaves/gog.tsx` / `legendary.tsx` sync buttons | Native `<button>` / `<input>`, or a custom wrapper (`ToggleSwitch`) that never reaches an MUI component | n/a | Out of scope — not MUI; GameLib's own `.button`/native styling applies, unaffected by the MUI palette |
| `PathSelectionBox` → `TextInputWithIconField` → `TextInputField` (`WineSelector/index.tsx:219,229` WinePrefix path, CrossOver bottle name) | None — `TextInputField` has no `@mui/material` import; it wraps a native `<input>` | n/a | Out of scope — not MUI |

**Conclusion:** every MUI control whose disabled state is painted through `palette.text.disabled`
or `palette.action.disabled` is now covered by `buildMuiTheme`'s two CSS-variable overrides,
app-wide, via the single `createTheme` call site. `Slider`'s `grey[400]` and `MenuItem`'s
`disabledOpacity` are different, non-black colour mechanisms that do not reproduce this bug's
symptom and were left as-is.

**Honest status — live verification still outstanding.** This quick task's fix is verified by
source reading (the exact MUI 5.17.1 component files, all re-checked against the installed
package rather than trusted from the original report) and by `src/frontend/__tests__/muiTheme.test.ts`
(jest, `testEnvironment: 'node'`, no DOM/CSS engine — it cannot render a pixel). The todo's own
"Verification (once fixed)" section above — opening the Steam install dialog in a dark theme on a
Windows host and confirming the "Windows" row's icon/label are legible, plus checking one other
disabled MUI control in the same theme — was **not performed**. Neither was the black-colour
mechanism ever confirmed with DevTools (the original report explicitly flagged this as an
inference, not a measured computed style, and that remains true after this fix). This is an
operator live-check gap, not a gap in the source-level fix.

**Update 2026-09-26 — live verification PERFORMED, PASS.** Operator, Windows 11, `pnpm tauri:dev`
debug build of HEAD `21ee6feaa` (the log's `GAMELIB_SHELL_EXE` was
`src-tauri\target\debug\gamelib-shell.exe`, not an installed shell; the `tauriDevPreflight`
check reported no foreign shell before launch), in a dark theme (the theme's name was not
recorded):

- Steam install dialog: the read-only "Windows" row's icon and label are legible — **PASS**.
- A second disabled MUI control in the same theme (suggested: a disabled `SelectField` in the GOG
  install dialog, "Language" or "Select game version") — **PASS** as reported by the operator.
  Which of the suggested controls was used was not recorded.

Still not measured: the black-colour mechanism was not confirmed with DevTools computed styles,
before or after. The fix is confirmed to produce legible disabled controls; the pre-fix cause stays
an inference from source.
