---
created: 2026-10-10T22:48:00.000Z
title: Winetricks tab contrast misses in nord-light and midnightMirage (failed-state reds, checkbox borders, queued box, placeholder)
area: ui
severity: medium
platform: any
ready: code
found_by: "Phase 45 live gate 45-12 G7 (launches 2-4), 2026-10-10"
files:
  - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
  - src/frontend/themes.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
---

Every value below was sampled from a window capture (`screencapture -l <id>`, colour histogram,
WCAG relative luminance) during the 45-12 live gate; the Apply-enabled miss has its own todo.

| theme | element | fg | bg | ratio | bar |
|---|---|---|---|---|---|
| nord-light | Install failed tag text | BF616A | EDEFF4 | 3.56:1 | 4.5 |
| nord-light | bar `1 failed` (red) | BF616A | D8DEE9 | 3.03:1 | 4.5 |
| nord-light | unchecked checkbox border | A8AEAF | EDEFF4 | 1.95:1 | 3 |
| nord-light | queued (locked) checkbox | 858F96 | EDEFF4 | 2.87:1 | 3 |
| nord-light | search placeholder | A9A9A9 | EDEFF4 | 2.04:1 | 4.5 |
| nord-light | Cancel / Apply button borders | A8AEAF | D8DEE9 | 1.66:1 | 3 |
| nord-light | Cancel remaining DISABLED text | 787C84 | D8DEE9 | 3.10:1 | record-only |
| midnightMirage | Install failed tag text | A62B2C | 080A0B | 2.84:1 | 4.5 |
| midnightMirage | danger icon | A62B2C | 080A0B | 2.84:1 | 3 |
| midnightMirage | bar `1 failed` (red) | A62B2C | 272F31 | 1.95:1 | 4.5 |
| midnightMirage | disabled Apply border | 3D4345 | 272F31 | 1.36:1 | 3 |

Passing for reference: headers 11.5/11.6, hover text 7.58 (light), focus ring 8.90/11.62,
checked box 8.90/13.86, Installed/Done 7.36/11.75, Installing word 9.74/15.26, banner 8.30/10.51,
Retry 8.90/16.87, row title 13.5/16.8. Hover fill is unchanged in both themes (1.00:1; record-only
per the contract). The `--danger` family is the recurring offender (memory:
`status-tokens-are-raw-success-danger-are-theme-adaptive`, "--danger is 3.55:1, still under AA").

Evidence: `/tmp/gamelib-gate-45-20261010T194049Z/terminal.log`, captures `G7-light-F-after.png`,
`burst2-light-016.png`, `burst2-light-071.png`, `burst3-085.png`, `burst3-125.png`, `burst6-007.png`.

## Fix (2026-10-11, quick 261011-kqx, commits 20ab561a2 28c607015)

**Colour strategy.** Two theme-adaptive aliases replace the two offending tokens, neither of
which needed a `themes.scss` change -- both are derived or substituted purely in the Winetricks
stylesheets.

- `--winetricks-danger-text`, declared once as a custom property on the `.WinetricksSettings`
  root (`index.scss`): `color-mix(in srgb, var(--danger, #cc3333) 40%, var(--text-default,
  #caf3fd))`. `--text-default` is the mix partner because it is each theme's own high-contrast
  pole (dark in nord-light, light in the 9 dark themes), so one rule darkens or lightens as each
  theme needs with no per-theme hex. 40% is the gruvbox_dark binding value (its dark danger hex on
  a hovered row gives 4.69:1 at 40%, under 4.5 at 45% or 50%). Consumed by the Row failed tag, the
  Row danger icon, the StickyBar failed count, and the LogPanel error line. Not a `themes.scss`
  edit: `--danger` has 28 other uses across 17 files, most of them fills/outlines rather than text,
  none measured by this census.
- `--text-secondary` replaces `--neutral-05`/the bare UA placeholder everywhere a non-text border
  or the search placeholder needed a theme-tracking value instead of a fixed neutral step: the
  unchecked checkbox border, the Cancel and disabled-Apply borders, the search input border, and
  an explicit `::placeholder` rule (there was none before; the UA default `darkgray` #a9a9a9 was
  the live miss).

**Queued (checked + disabled) checkbox mechanism -- a UI-SPEC deviation.** No opacity value
composited over a row surface can clear 3:1 in every theme: gruvbox_dark's own accent is only
3.91:1 against its row surface at FULL opacity, so at the generic `&:disabled` 0.5 it measured
1.97:1 there and nord-light measured 2.51:1 (matching this todo's live 2.87/pre-fix-token 2.52
pair). The fix drops opacity dimming for this one state: `&:disabled[aria-checked='true']` draws
an outlined accent tick at full opacity (`opacity: 1`, transparent fill, `border-color:
var(--accent)` on the tick's `::after`), giving an attribute selector one more specificity
component than the plain `&:disabled` rule so it always wins regardless of source order. Worst
case across all 10 themes: gruvbox_dark 3.91:1 (exactly at its measured full-opacity ceiling).

**The 11 todo rows, resolved (nord-light / midnightMirage), plus 2 census-found rows measured the
same way.** Full per-theme table and arithmetic in
`.planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs`.

| # | theme | element | live | token post-fix | bar |
|---|---|---|---|---|---|
| 1 | nord-light | Install failed tag text | 3.56 | 6.79 (incl. hovered row) | 4.5 |
| 2 | nord-light | bar `1 failed` | 3.03 | 6.97 | 4.5 |
| 3 | nord-light | unchecked checkbox border | 1.95 | 9.71 | 3 |
| 4 | nord-light | queued (locked) checkbox | 2.87 | 8.88 | 3 |
| 5 | nord-light | search placeholder | 2.04 | 9.71 | 4.5 |
| 6 | nord-light | Cancel / Apply borders | 1.66 | 8.29 | 3 |
| 7 | nord-light | Cancel remaining DISABLED text | 3.10 | 3.09 (untouched, record-only) | record-only |
| 8 | midnightMirage | Install failed tag text | 2.84 | 6.95 (incl. hovered row) | 4.5 |
| 9 | midnightMirage | danger icon | 2.84 | 8.47 | 3 |
| 10 | midnightMirage | bar `1 failed` | 1.95 | 5.82 | 4.5 |
| 11 | midnightMirage | disabled Apply border | 1.36 | 10.49 (token NOT a live reproduction -- see residual todo) | 3 |
| census | both | log error line (LogPanel `.log-error`) | -- | nord-light 6.97 / midnightMirage 5.82 | 4.5 |
| census | both | search input border vs its wrapper | -- | nord-light 8.29 / midnightMirage 10.49 | 3 |

Worst case across all 10 themes, measured by the same script with `--all`: tag text on a hovered
row, gruvbox_dark 4.72:1; non-text indicators, dracula 4.27:1; Queued checkbox, gruvbox_dark
3.91:1; search placeholder, dracula 6.65:1. All clear their bar.

**jest gate.** `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` gained two
per-theme WCAG census describes (danger-text family; non-text indicators + placeholder), reusing
a `color-mix(in srgb, ...)` resolver added to the file's existing `var()`-resolution chain
(`themeTokens` + `globalTokens` + `resolveValue` + `contrastRatio`). The census is proven
non-vacuous two ways: it fails on the literal pre-fix pairs in the themes the live gate sampled
them in (RED before the SCSS fix landed), and it fails under in-memory sabotage of the fixed
values. `pnpm jest src/frontend/screens/Settings/sections/WinetricksSettings
src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts --selectProjects Frontend`:
14 suites / 363 tests, all passing.

**Standalone cross-check.** `.planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs`
is a from-scratch Node ESM reimplementation of the same resolver (comment stripping, `var()`/
`color-mix()` resolution, WCAG luminance/ratio math) that does NOT import from the jest file, so
the two independent implementations can be cross-checked against each other and against this
table. Run from the repo root:

```
node .planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs          # nord-light + midnightMirage
node .planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs --all    # all 10 themes
```

Both exit 0, print the color-mix/hover-composite arithmetic, and reproduce every todo row's live
failure against its pre-fix literal (except row 11, printed `NOT REPRODUCED`, see below).

**`src/frontend/themes.scss` is byte-unchanged** (`git diff --quiet a4fd8505d -- src/frontend/themes.scss`
confirms, where `a4fd8505d` is the commit this quick task started from) -- every fix is a derived
custom property or a token substitution inside the five Winetricks stylesheets.

**Row 11 (midnightMirage disabled Apply border) is not closed by this fix.** The pre-fix token
pair already passed at 6.07:1 against the live-measured 1.36:1; nothing found at desk-review time
(no global `button:disabled`/`[disabled]`/`filter`/opacity rule reaching
`.WinetricksStickyBar__apply`) explains the gap. Filed as a new residual todo
(`2026-10-11-winetricks-disabled-apply-border-reads-1-36-live-in-midnightmirage-but-6-07-by-token.md`,
`ready: live-gate`).

**The gruvbox_dark hovered-accent observation** (Queued checkbox's 3.91:1 full-opacity ceiling,
and the related Retry/Clear 4.35:1 collision) is appended to the existing gruvbox todo
(`2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md`).

**NOT LIVE-VERIFIED.** Every touched rule carries a `NOT LIVE-VERIFIED` comment in its
stylesheet; none of this fix's contrast arithmetic has been re-sampled live since the 45-12 gate
that found the original misses. A re-run owes captures for: the Row failed tag (rest and hovered,
both contract themes), the StickyBar failed count, the LogPanel error line, the unchecked
checkbox border, the Queued checkbox, the search placeholder, the Cancel and disabled-Apply
borders, and the search input border -- in nord-light and midnightMirage at minimum, and ideally
across the other 8 themes given the all-10 census above.
