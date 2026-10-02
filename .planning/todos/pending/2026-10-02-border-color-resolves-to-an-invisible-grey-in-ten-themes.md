---
created: 2026-10-02T00:00:00.000Z
title: "--border-color resolves to #272f31 and measures 1.08-1.48:1 in 10 of 13 theme selectors, so all 7 of its consumers paint a border nobody can see"
area: ui
severity: medium
platform: any
ready: code
found_by: "Quick task tail, 2026-10-02 — found while fixing the search bar's resting outline, which had the identical defect and was fixed in 5a847e830"
files:
  - src/frontend/themes.scss
  - src/frontend/screens/WineManager/index.css
  - src/frontend/screens/WineManager/components/WineItem/index.css
  - src/frontend/components/UI/PopoverComponent/index.scss
  - src/frontend/components/UI/SteamGridDBPicker/index.scss
---

## Measured

`--border-color` is declared once, on base `body` (`themes.scss`), as
`var(--divider, var(--neutral-03))`. `--divider` is declared in only **2** theme blocks
(`midnightMirage`, `cyberSpaceOasisAlt`), and `--neutral-03` in only **1** (`nord-light`) plus
`styles/_colors.scss:17` = `#272f31`. So in every other theme the chain lands on that one dark
grey.

Contrast of the resolved border against the surfaces its consumers actually sit on
(`--body-background` and `--modal-background`), resolved by walking the real cascade per theme:

| theme | resolved | vs body | vs modal |
| --- | --- | --- | --- |
| classic / cyberSpaceOasis / cyberSpaceOasisAlt | `gray` | 4.49 | 4.49 |
| gruvbox_dark | `#272f31` | **1.08** | **1.08** |
| old-school | `#272f31` | **1.21** | **1.21** |
| zombie / zombie-classic | `#272f31` | **1.21** | **1.21** |
| nord-dark | `#272f31` | **1.25** | **1.25** |
| marine / marine-classic | `#272f31` | **1.30** | **1.30** |
| midnightMirage | `#272f31` | **1.45** | **1.45** |
| sweet / sweet-dark | `#272f31` | **1.48** | **1.48** |

**Worst 1.08:1 against a 3:1 WCAG non-text floor.** Only the three themes that pick up
`--divider: gray` are visible at all.

## The 7 consumers, all painting it

- `screens/WineManager/index.css:30` (`border`), `:112`, `:207` (`border-bottom`)
- `screens/WineManager/components/WineItem/index.css:113` (`border-bottom`)
- `components/UI/PopoverComponent/index.scss:6` (`border`), `:8` (`box-shadow` ring)
- `components/UI/SteamGridDBPicker/index.scss:12` (`border-bottom`)

## Why this was not caught, and the trap in the token's own comment

The declaration **never breaks** — it resolves successfully, every time, to a value you cannot
see. That is the wrong-CHOICE class rather than the absence class, so neither `cssTokenSweep`
(names and scopes) nor any existing gate can see it; only measuring the rendered pair can.

`--border-color`'s own comment in `themes.scss` says `--neutral-03` "makes it universal". That is
true and misleading in the same breath: universal **resolution** is not **visibility**, and the
comment reads as a closed case. Worth rewording as part of the fix, because it is what stopped
this being rechecked.

`--search-bar-border` had the identical defect, introduced the same day by copying this exact
precedent, and was fixed in `5a847e830` by pointing it at the theme's own `--accent` (every theme
defines one and designs it to carry against that theme's chrome: worst case 3.48:1 full strength,
3.10:1 at the 90% the stylesheet fades it to).

## Fix shape, and why it is NOT just "do what the search bar did"

`--accent` is right for an *interactive control's* outline. These 7 are structural separators and
a popover edge, where a full accent border would be far too loud. So this needs a real decision,
not a copy:

1. Give base `--divider` an actual value so the first arm of the chain stops falling through —
   that is the single-point fix and the most likely right answer.
2. Pick that value against the DARK themes, which are the failing ones, and verify it on a light
   theme too (`nord-light`'s own `--neutral-03: #429ec5` is a blue, so it is unaffected and must
   not regress).
3. Re-measure all 13 selectors; `.planning` has no harness for this, so the cascade walk has to be
   redone by hand or scripted fresh.
4. Reword the `--border-color` comment so "universal" no longer reads as "fine".

A visual check across `midnightMirage` / `gruvbox_dark` / `dracula` is required at the end —
nothing in this repo renders a pixel (`testEnvironment: 'node'`, no jsdom, no CSS engine).
