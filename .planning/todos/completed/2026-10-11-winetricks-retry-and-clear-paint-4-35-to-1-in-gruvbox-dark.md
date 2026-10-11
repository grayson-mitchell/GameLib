---
created: 2026-10-10T23:24:47.000Z
title: Retry and Clear paint `--background` on `--accent` at 4.35:1 in gruvbox_dark, under 4.5
area: ui
severity: minor
platform: any
ready: code
found_by: "quick 261011-gpn's token-level census, 2026-10-11"
files:
  - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
  - src/frontend/styles/_buttons.scss
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx
---

## Measured (token-resolved, not pixel-sampled)

`#1d2021` (`--background`) on `#b57614` (`--accent`) in `body.gruvbox_dark` measures **4.35:1**,
under the WCAG 4.5:1 floor, resolved through `themeTokens.test.ts`'s own `themeTokens` +
`globalTokens` + `resolveValue` + `contrastRatio` chain (the same resolver quick task 261011-gpn
used to fix the Winetricks sticky bar's Apply button, which had the same pair and the same
collision). No live capture backs this number; a pixel-sampled gruvbox_dark look is still owed.

Both controls currently declare the pair with no override:

- Retry, `.WinetricksRow__retry` (`Row/index.scss:232`): `background: var(--accent, #0080ff);`
  at line 240, `color: var(--background, #070a0b);` at line 245.
- Clear, `.WinetricksEverythingElse__clear` (`EverythingElseGroup/index.scss:82`):
  `background: var(--accent, #0080ff);` at line 86, `color: var(--background, #070a0b);` at
  line 88.

`src/frontend/styles/_buttons.scss` `.button.is-text` (lines 151-153) uses the identical pair
with NO fallbacks (`background: var(--accent); color: var(--background);`), so it carries the
same 4.35:1 collision wherever it is rendered in gruvbox_dark. `grep -rn 'is-text' src/frontend`
returns 28 matches across `_buttons.scss`, `Settings/index.css`, `DownloadManager/index.tsx`,
`Game/GameSubMenu/index.tsx`, `Game/GamePage/components/MainButton.tsx`, and three test files
that assert the class name string.

## Fix options (not chosen)

(a) Copy Apply's `body.gruvbox_dark &:not(:disabled)` override into
`.WinetricksRow__retry` and `.WinetricksEverythingElse__clear`, and extend the
`themeTokens.test.ts` Apply census (or a sibling one) to cover both. Narrow blast radius, but
does not touch `.button.is-text`'s other consumers.

(b) A theme-level token change to gruvbox_dark (e.g. a darker `--accent` or a different
`--background` fallback for this pair). Would also cover `.button.is-text` everywhere and let
Apply's own override be deleted — quick 261011-gpn's Test B ("the gruvbox_dark override is
load-bearing") would go red to say so — but `--accent` drives many other gruvbox surfaces, so
this is a design decision, not a desk-only fix.

Either way, a live capture of Retry, Clear, and `.button.is-text` in gruvbox_dark is still owed.

## Also measured by quick 261011-kqx (token-resolved)

Fixing the Queued (checked + disabled) checkbox for 261011-kqx (drawn as a full-opacity outlined
accent tick, `border-color: var(--accent)`, instead of a dimmed fill -- no opacity value
composited over a row surface clears 3:1 in every theme) ran the accent-vs-row-surface pair
through the same resolver in gruvbox_dark specifically because it is this todo's own binding
theme for the accent/background collision:

- `var(--accent, #0080ff)` (`#b57614` in gruvbox_dark) against the rest row surface
  (`var(--modal-background)`, `#282828`): **3.91:1**. That is exactly the gruvbox_dark Queued
  checkbox's worst case across all 10 themes in 261011-kqx's all-10 census -- still above the
  3:1 non-text floor the Queued checkbox is held to, but closer to it than any other theme.
- The same accent against the *hovered* row surface (10% `.WinetricksRow` colour composited over
  `--modal-background`, `#3b3b3b`): **2.97:1**, under 3:1. The Queued checkbox is not currently
  held to a hovered-row bar (D-14/non-colour rule aside, a locked checkbox carries no text), so
  this is record-only for now -- but it is the same accent-is-a-mid-tone-in-gruvbox_dark fact
  this todo already tracks, one surface further from the one Apply, Retry and Clear collide on.

This reinforces fix option (b) above: a theme-level change to gruvbox_dark's `--accent` (or its
`--background`/`--modal-background` pair) would move all four of these collisions --
Apply/Retry/Clear's 4.35:1 text pair and the Queued checkbox's 3.91:1/2.97:1 non-text pair -- at
once, where four separate per-component overrides each move one. Still a design decision, not
desk-only; not acted on by 261011-kqx.

## Fix (2026-10-11, quick 261011-pjv, commit `33cca8462`)

(a) Took option (a), extended one control further than scoped above: Apply's own
`body.gruvbox_dark &:not(:disabled)` override (261011-gpn) was copied into Retry and Clear as
planned, and -- since `.button.is-text` in `_buttons.scss` carries the identical bare pair and
the identical 4.35:1 collision -- into `.button.is-text` as well, so all four accent-filled
controls that share this pair now share the same fix. `.button.is-text`'s copy additionally
excludes `:not(.is-link)` (below); Retry and Clear have no such consumer and do not need it.
Option (b), the theme-level change, remains not chosen -- `--accent` still drives too many other
gruvbox_dark surfaces for a desk-only call.

(b) The change: one nested gruvbox_dark `--neutral-01` override in each of three rules. This
todo's own "Measured" section above cites stale line numbers from before this fix landed --
Retry's `background`/`color` pair is now at `Row/index.scss:282`/`287` (the rule opens at L274,
not L232/240/245), Clear's pair is now at `EverythingElseGroup/index.scss:100`/`102` (rule opens
at L96, not L82/86/88), and `.button.is-text`'s pair is unchanged at `_buttons.scss:152`/`153`
(rule opens at L151).

- `Row/index.scss:304`: `body.gruvbox_dark &:not(:disabled) { color: var(--neutral-01, #070a0b); }`
  nested inside `.WinetricksRow__retry`. `:not(:disabled)` is load-bearing: without it the
  override's specificity would outrank `&:disabled` below it and paint near-black text on the
  dimmed disabled button, which should keep its own disabled colour untouched.
- `EverythingElseGroup/index.scss:113`: the same override nested inside
  `.WinetricksEverythingElse__clear`. Clear has no disabled arm today; `:not(:disabled)` keeps
  any future one out of this override's reach rather than guarding an arm that doesn't yet exist.
- `_buttons.scss:180`: `body.gruvbox_dark &:not(.is-link):not(:disabled) { color:
  var(--neutral-01, #070a0b); }` nested inside `.button.is-text`. `:not(:disabled)` is
  load-bearing for the same reason as Retry's, against the global `.button:disabled` rule at
  L210. `:not(.is-link)` is load-bearing separately: a `grep -rn 'className="[^"]*is-text'
  src/frontend` census at fix time (re-run after this task's own edits, which had inflated a raw
  `grep -rn 'is-text'` count from 28 to 49 purely via added test/comment prose with no render-site
  change) found 23 `.button.is-text` render sites, 22 of which also carry `.is-link` -- 21 in
  `Game/GameSubMenu/index.tsx`, 1 in `Game/GamePage/components/MainButton.tsx` -- and exactly one
  pure `.is-text` site, the DownloadManager "Clear List" button (`DownloadManager/index.tsx:165`).
  An `.is-link` consumer takes its text colour from `.button.is-link` or, in the game menu, from
  `.gameConfigContainer .game-actions .gameTools .link`, not from this pair; without the
  exclusion, this override would outrank that lower-specificity rule and paint
  `--neutral-01` at 1.51:1 on gruvbox_dark's menu surface (`#32302f`) instead of leaving it alone.
  On hover `.button.is-text`'s fill becomes `--primary-hover`, where this override's text measures
  7.38:1 (base, unguarded by hover: 6.09:1) -- the override does not regress hover.

(c) Token-level before/after, gruvbox_dark only (all other 9 themes unchanged, still `>= 4.5:1`
with the base pair, per the new all-10 census below):

| Control | Pair | Before | After |
| --- | --- | --- | --- |
| Retry | `--background` (`#1d2021`) on `--accent` (`#b57614`) | 4.35:1 | -- |
| Retry | `--neutral-01` (`#070a0b`) on `--accent` (`#b57614`) | -- | 5.26:1 |
| Clear | `--background` on `--accent` | 4.35:1 | -- |
| Clear | `--neutral-01` on `--accent` | -- | 5.26:1 |
| `.button.is-text` | `--background` on `--accent` | 4.35:1 | -- |
| `.button.is-text` | `--neutral-01` on `--accent` | -- | 5.26:1 |

(d) Gate: `themeTokens.test.ts` gained an all-10-theme, three-control census (Retry, Clear,
`.button.is-text`) proven non-vacuous before the fix -- observed RED with 6 failures (3
non-vacuity sabotage failures + the 3 predicted gruvbox_dark failures, each at the measured
4.34587088954811 ratio) -- then GREEN (261 tests, 4 suites) once the three SCSS overrides landed
and `rowStates.test.tsx`'s selector-prefix scope test was amended for the new
`body.gruvbox_dark .WinetricksSettings .WinetricksRow__retry:not(:disabled)` selector (commit
`33cca8462`). A second commit (`a0e698197`) added five more proofs on top -- Test A (each
override is load-bearing: removing it in-memory drops the ratio back to 4.35:1), Test B (the
override cannot reach a disabled button: the guard-detection regex is shared between the test's
own checker and a generalized `applyTextColourDecl`, via a `GUARDED_OVERRIDE_TAIL` fragment, so
the two can't drift apart), Test C (the override cannot reach an `.is-link` consumer), Test D (a
triple in-memory sabotage proving all three guard-detection helpers can still fail), and Test E
(`.button.is-text:hover` is unaffected by the new override) -- 270 tests, 4 suites, GREEN.

(e) `src/frontend/themes.scss` is byte-unchanged by this fix (`git diff --quiet 6bb8e809e --
src/frontend/themes.scss` passes) -- confirming option (b), the theme-level token change, was not
taken; this is three component-local overrides only.

(f) NOT LIVE-VERIFIED: all ratios above are token-resolved through `themeTokens.test.ts`'s
resolver chain, the same one 261011-gpn used for Apply, not pixel-sampled. A live capture of
Retry, Clear, `.button.is-text` (via the DownloadManager "Clear List" button) in gruvbox_dark is
still owed -- same as this todo originally recorded, now carried forward as an open observation
on quick 261011-pjv rather than closed here.

(g) The 22 `.is-link` render sites this fix deliberately does NOT repaint, and
`.button.is-text:hover`'s own unexamined contrast across themes, are filed as a residual todo:
`.planning/todos/pending/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md`.
