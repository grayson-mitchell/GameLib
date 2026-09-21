---
created: 2026-09-20
title: ".Dialog__content and .Dialog__headerTitle are dead in the Dialog primitive, but their names still style five rules across four other stylesheets"
area: ui-dialogs
severity: minor
platform: any
ready: code
source: "quick-260921-mzl, census correction surfaced while deleting item 3 of .planning/todos/completed/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md"
files:
  - src/frontend/components/UI/Dialog/index.css
  - src/frontend/screens/Settings/components/SettingsModal/index.scss
  - src/frontend/screens/Game/ModifyInstallModal/index.scss
  - src/frontend/components/UI/ProgressDialog/index.css
  - src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css
  - src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx
---

## Closed by quick task `260921-nub`

**What was deleted:** the two primitive declarations (`.Dialog__headerTitle`, `.Dialog__content`)
in `Dialog/index.css`; all five downstream rules across four files listed below (`SettingsModal/index.scss`
was deleted outright, taking its import with it); the two orphaned `--dialog-margin-vertical`/
`--dialog-gap` tokens whose only references were the deleted rules; and the `Dialog__input`
className on `RedeemSteamKeyDialog`'s input.

**DELETION was chosen over re-anchoring, deliberately, not by default.** This todo's own body
framed the choice as open ("deleting or re-anchoring"). `Dialog.tsx:106-120` records this repo's
binding precedent, set by `260820-kq0` and restated by `260921-mzl`: an inert `maxWidth`/
`paddingTop` pair was "Deliberately DROPPED rather than realized", because reviving an unreviewed
rule here would change sizing for all 25 `Dialog` consumers as an undiscussed side effect. The same
reasoning decided this case, hardest at Settings: re-anchoring the compound
`.Dialog__content.settingsDialogContent` selector to a bare `.settingsDialogContent` would have
ACTIVATED `width: 65vw; display: flex; flex: 1 1 60vh; max-width: 800px; min-height: 64vh` on the
Settings dialog **for the first time ever** — a live visual change with no requirement behind it,
in a `testEnvironment: 'node'` project with no jsdom and no CSS engine that could observe whether
it looks right. Re-anchoring remains available to a future, deliberately-visual, live-gated task —
it was not available to this one.

**Two deliberate KEEPs, so nobody "finishes the cleanup" later:**

- `className="settingsDialogContent"` on `SettingsModal`'s `DialogContent` was kept — its only
  remaining purpose is that `Dialog.tsx:56`'s live `StyledPaper`
  `:has(.settingsDialogContent):not(:has(.logs-wrapper))` height rule is keyed on it, and removing
  it would silently change the Settings dialog's height.
- `--dialog-margin-horizontal` in `Dialog/index.css` was kept — `cssTokenSweep.test.ts` would go
  red without it (two external consumers still reference it by name). Whether it actually resolves
  at those two sites is a separate, open scope question: see
  `2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md`.

**Three adjacent findings surfaced while measuring, recorded rather than fixed, by filename:**

- `2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md`
- `2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md`
- `2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md`

---

# .Dialog__content and .Dialog__headerTitle are dead, and their deadness fans out

Quick task `260921-mzl` deleted item 3's named dead blocks from
`src/frontend/components/UI/Dialog/index.css` (`.Dialog__element`, `.Dialog__header`,
`.Dialog__Close`, `.Dialog__CloseButton`, `.Dialog__CloseIcon`). While measuring that census it
became clear the parent todo's item-3 list was incomplete: `.Dialog__headerTitle` and
`.Dialog__content` — both KEPT by `260921-mzl` as apparently-live rules — are equally dead by the
same test (zero `className` hits anywhere under `src/**/*.ts`/`*.tsx`). `DialogHeader.tsx` renders
a bare MUI `DialogTitle` with an `sx` prop and applies no className; `DialogContent.tsx` renders
`<div className={className}>` and no consumer ever passes `"Dialog__content"`.

This gets its own todo rather than a silent ride-along with `260921-mzl` because `.Dialog__content`
is the worse of the two: its deadness fans out into **four other stylesheets** that still style it,
a materially wider blast radius than item 3's self-contained blocks. Deleting `.Dialog__content`
means also deleting or re-anchoring five rules in four files whose visual effect nobody has
measured yet — a different-sized job from deleting the primitive's own self-contained blocks, and
not one to fold into a task whose scope was explicitly item 3 only.

## The five downstream sites (measured at HEAD)

- `src/frontend/screens/Settings/components/SettingsModal/index.scss:1` —
  `.Dialog__content.settingsDialogContent`. Worth calling out specifically: this is a COMPOUND
  selector needing both classes, and `.settingsDialogContent` IS live —
  `Dialog/components/Dialog.tsx:56` has a `StyledPaper`
  `:has(.settingsDialogContent):not(:has(.logs-wrapper))` height rule keyed on it. So the Settings
  dialog's own content rule is dead while the height rule that depends on the other half of the
  same compound pair still fires — that asymmetry is the interesting finding, and a naive "delete
  `.Dialog__content` everywhere" pass must not touch the `.settingsDialogContent` half.
- `src/frontend/screens/Game/ModifyInstallModal/index.scss:7`
- `src/frontend/components/UI/ProgressDialog/index.css:6`
- `src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css:6`
- `src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css:10`
  (`.Dialog__headerTitle`)

## Why this is a measurement, not a fix

Deleting `.Dialog__content` means also deleting or re-anchoring five rules in four files whose
visual effect nobody has measured — each of those four stylesheets may be relying on the compound
specificity or the cascade position of the dead class in a way a plain grep census cannot see.
That is a different-sized job from deleting the self-contained blocks item 3 already handled, and
belongs in its own pass with its own visual verification, not folded into this one.

## Sibling finding: `.Dialog__input` is dead in the OPPOSITE direction

`.Dialog__input` is applied at `src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx:122`
(`className="Dialog__input"`) with **no matching CSS rule anywhere** in the repo — the inverse
defect from `.Dialog__content`/`.Dialog__headerTitle` (class applied, no rule) rather than (rule
declared, class never applied). Recorded here so a future pass triaging `Dialog__*` dead-code has
both directions in one place instead of rediscovering the opposite-direction case separately.
