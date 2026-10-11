---
created: 2026-10-09T21:30:00.000Z
title: 'Not-connected sign-in row renders black text on a dark banner in nord_light (F-49-R1-6)'
area: ui
severity: minor
platform: any
ready: code
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts

completed: 2026-10-11
status: "RESOLVED 2026-10-11 in quick task 261011-j8z: the sign-in row now paints the navbar surface's own text chain instead of the body text token on the banner (nord-light 2.11:1 to 7.38:1, all 10 themes at or above 4.5:1, lowest marine 4.87:1); the store logo, footer button label and dismiss glyph inherit it and the in-row footer button is transparent in both stylesheet-load states; gated per theme in themeTokens.test.ts; the live recheck is owed at the next macOS launch; commits af3757c7d (RED gate), cfd1aea8e (fix) and 0f62cd292 (proofs)"
---

# nord_light: black text on a dark banner

Run 1, item 10b operator judgment (`49-LIVE-GATE.md` § Run 1, F-49-R1-6). On `nord_light` the
"<Store> is not connected" row's text is black on a dark banner and illegible. `midnightMirage`,
`gruvbox_dark` and `dracula` were judged pass. Check which token the row's background and text
use; see memory notes on `--border-color` and surface tokens being invisible in several themes.

## Fix (2026-10-11, quick 261011-j8z, commit `cfd1aea8e`)

**Traced cause.** The row (`&__row` in the notice stylesheet) painted `--navbar-background` with
`color: var(--text-default)`, the BODY surface's text token. nord-light is the one theme whose
navbar is dark against a light page, so its dark body text (`#20242c`) sat on a dark band
(`#4c566a`) at 2.11:1. The other nine themes passed only because their navbar and body surfaces
are both dark. The store logo, the dismiss glyph and the footer button label carried the same
token (the button's colour also depended on which stylesheet had loaded first).

**Fix.** The row text moves to the navbar surface's own text chain,
`var(--navbar-inactive, var(--navbar-accent))`, the one NavItem's tier-2 rows paint on the same
surface. The logo, the footer button and the dismiss glyph inherit it, and the in-row footer
button is transparent, so one pairing governs the row. Token-resolved ratios against
`--navbar-background`, from the resolver in `themeTokens.test.ts`:

| theme           | BEFORE                      | AFTER                      |
| --------------- | --------------------------- | -------------------------- |
| midnightMirage  | 14.56 (`#caf3fd`/`#161c1e`) | 13.11 (`#d1e4e9`)          |
| cyberSpaceOasis | 13.26 (`#eae8e5`/`#151f3d`) | 7.77 (`#e0ab40`)           |
| gruvbox_dark    | 10.74 (`#eae8e5`/`#32302f`) | 11.92 (`#f9f5d7`)          |
| high-contrast   | 15.32 (`#eae8e5`/`#121212`) | 18.73 (`#ffffff`)          |
| dracula         | 9.15 (`white`/`#44475a`)    | 7.48 (`#eae8e5`)           |
| nord-light      | 2.11 (`#20242c`/`#4c566a`)  | 7.38 (`#ffffff`)           |
| nord-dark       | 10.56 (`#caf3fd`/`#2e3440`) | 7.09 (`#afc4eb`)           |
| marine          | 9.51 (`#eae8e5`/`#0b3e4b`)  | 4.87 (`#d39f37`)           |
| zombie          | 10.48 (`#eae8e5`/`#323232`) | 5.82 (`#59c627`)           |
| sweet           | 15.73 (`#e9eaeb`/`#220422`) | 11.27 (`#d4c2d6`)          |

**Rejected: a per-theme override.** A pairing that holds by construction exists and passes 10/10,
so a nord-light-only override (which would leave a body token on the navbar surface in the other
nine) was not used. `--navbar-accent` alone is 2.74 in nord-light, `--text-title` 2.11, `--accent`
1.39. Changing nord-light's `--text-default` would break its dark body text on the light page,
and repainting the banner is Phase 49 D-09's design.

**Trade-offs accepted.** The row text colour changes in all nine themes that already passed
(the three the operator passed barely move). cyberSpaceOasis, marine and zombie take their navbar
accent hue (amber, gold, green), as their tier-2 nav rows already do. On a fresh launch the
in-row footer button stops being a `--primary`-filled button and becomes the transparent footer
button, as it already renders once Settings loads (and as zombie already rendered it).

**Gate and proofs.** `themeTokens.test.ts` gained a per-theme 4.5:1 census of the row pair plus an
inherit checker. It was observed RED on the pre-fix stylesheet (`af3757c7d`: 3 failed, nord-light
2.11) and GREEN after the fix. `0f62cd292` proves the resolver reproduces the operator's four live
verdicts (nord_light fail; midnightMirage, gruvbox_dark, dracula pass) and that the inherit
checker fails on in-memory sabotage.

**NOT live-verified.** Contrast arithmetic only. A look at nord_light, plus one accent-hue theme
such as marine, is owed at the next macOS launch.

**Residuals.** The dismiss hover, the expired-row triangle and the in-row button hover in
nord-light are filed as
`2026-10-11-library-sign-in-row-glyphs-and-button-hover-miss-in-nord-light.md` in `pending/`.
