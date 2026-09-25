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
