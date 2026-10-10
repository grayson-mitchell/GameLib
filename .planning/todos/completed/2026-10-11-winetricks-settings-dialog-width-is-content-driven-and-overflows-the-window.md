---
created: 2026-10-10T22:45:00.000Z
title: Winetricks tab makes the Settings dialog wider than the window (content-driven width; long rows and log lines overflow both edges)
area: ui
severity: major
platform: any
ready: code
found_by: "Phase 45 live gate 45-12 (launch 1 G1 attempt 1; launches 3-4 at first open), 2026-10-10"
files:
  - src/frontend/screens/Settings/index.css
  - src/frontend/screens/Settings/sections/GamesSettings/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
  - src/frontend/components/UI/Dialog/index.css
  - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts
  - src/frontend/screens/Library/components/InstallModal/index.scss
---

## Observation (operator, launch 1, 2026-10-11 09:07 local)

Opening Show details during the G1 run made the Settings dialog "wider than the screen"; the
operator had to click outside and back in. The window did NOT resize: the renderer logged
`viewport 1470x923` on every focus before and after. The dialog did. Capture
`/tmp/gamelib-gate-45-20261010T194049Z/G1-launch1-shot3.png` shows row text clipped at the left edge, the bar reading
`...of 3 · MS XACT Engine` with `Cancel rem` clipped at the right, and Show details lines
running off the right edge unwrapped.

It is not only the log panel: at the first tab open of launches 3 and 4 (Everything else expanded,
Show details closed) the dialog again overflowed both edges (`burst3-020.png`, `burst5-020.png`,
`burst6-134.png`). The German captions (`Zwischengespeichert (Offline-Installation)`) widened it
too (`burst6-119.png`). With the search filtered to short rows the dialog sits at its normal width.

## Pre-registered bars it fails

45-UAT.md items 24 (E8-overflow), 26 (E9-overflow), 27 (E9-long-text) at the natural width; it
also made items 11 and 12 (Show details carry-forwards) unobservable and contaminated G1 attempt 1.

## What was read (not a fix)

`LogPanel/index.scss` has `white-space: pre-wrap; overflow-wrap: anywhere` and `min-width: 0` on
the panel, but the Settings container is `.Settings { display: flex; ... }` with a
`.settingsWrapper { max-width: 513px; width: 100% }` and `section { min-width: 500px }`; the
dialog grows to the content's max-content width somewhere above the panel. Find the ancestor whose
width is unconstrained and pin it to the viewport (`max-width: 100vw` / `min-width: 0` on the flex
chain). Verify with a window capture at a long log line and with Everything else expanded.

Evidence dir: `/tmp/gamelib-gate-45-20261010T194049Z` (captures named above, `terminal.log` lines tagged "G1 capture review",
"Overflow observation").

## Fix (2026-10-11, quick 261011-hh5, commit `682a20ac7`)

**(a) Mechanism.** `SettingsModal/index.tsx:55` borrows `className={'InstallModal__dialog'}` for
its MUI paper. `Library/components/InstallModal/index.scss:1-5` gives that class
`width: 700px; max-height: 90vh; min-width: fit-content; max-width: 80vw`. `min-width` wins over
every `max-width` (CSS 2.1 10.4), and the paper's automatic flex-item minimum is overridden by it,
so the paper grows to the `fit-content` of its contents -- the Winetricks tab's hundreds of
`white-space: nowrap` row titles, the log panel's unwrapped max-content, and the rigid German
`Zwischengespeichert (Offline-Installation)` badge. `MuiDialog-container` centres the paper, so it
overflows both window edges by equal amounts, matching the capture (left-clipped row text,
right-clipped `Cancel rem`). This also explains why filtering to short rows restored the normal
width: once the content's `fit-content` drops to 700px or less, the paper's own `width: 700px`
wins again.

**(b) This todo's own hypothesis, corrected.** `max-width: 100vw` cannot work -- `min-width`
already beats both max-widths on the paper, so a third max-width would lose the same way. The
`min-width: 0` already present on the flex chain below the paper (the panel, the groups, the
tab root) does not help either: `min-width: 0` on a flex child lowers only that child's own
automatic minimum, it does not stop the child's content from feeding an ancestor's
`fit-content`. The ancestor that needed releasing was the paper itself, not anything inside the
tab.

**(c) The rule and its scoping.** Added a top-level
`.InstallModal__dialog:has(.WinetricksSettings) { min-width: 0; }` in the tab's own
`index.scss`. It matches only while the tab is mounted (TabPanel renders only the selected tab's
children) and its 0,2,0 specificity beats the floor's 0,1,0 in any load order. Rejected
alternatives: editing `InstallModal/index.scss` directly (the Library Install modal and every
other Settings tab rely on that floor); `Dialog.tsx`'s `StyledPaper` (TSX, out of the CSS-only
brief, and the primitive behind about 25 dialogs); `contain: inline-size` on `.WinetricksSettings`
(holds only while every ancestor is fill-width -- under any shrink-to-fit ancestor the tab would
collapse to zero width, a hazard releasing the paper does not have).

**(d) Files left unedited, one line each:**
- `Settings/index.css`: styles the full-page Settings route, where `isDefault` is always true and
  the Winetricks tab never renders.
- `GamesSettings/index.scss`: its `section { min-width: 500px }` floor is a separate, narrower
  defect (filed below), not this one.
- `LogPanel/index.scss`: `white-space: pre-wrap; overflow-wrap: anywhere` was already correct --
  it only failed because the paper had already grown past the window.
- `Dialog/index.css`: holds only `.log-upload-result` and `.Dialog__footer`, not on this path.
- `WinetricksSettings/index.scss` is the one file that was edited.

**(e) The pin.** `__tests__/tokenCensus.test.ts`, describe `Settings dialog width floor
(261011-hh5)`: six tests -- the real rule accepted; a `max-width: 100vw` substitute rejected; a
comment-only occurrence rejected; the rule nested inside `.WinetricksSettings` (a never-matching
descendant selector) rejected; the pre-fix root-only `min-width: 0` shape rejected; and the real
`index.scss` read from disk, which must pass. Observed RED `Tests: 1 failed, 21 passed, 22 total`
(only test 6 failing) against the pre-fix stylesheet, GREEN `Tests: 22 passed, 22 total` after. No
file was mutated to prove the checker discriminates -- the five inline samples are the mutation
proof.

**(f) NOT live-verified.** Everything above is a desk proof: the jest pin, a byte-unchanged gate
over every ruled-out file, scoped prettier, eslint and codecheck. The operator owes a window
capture at the next 45-12 live-gate re-run (see `<verification>` in the `261011-hh5-PLAN.md`):
Everything-else expanded at first open, a long Show-details log line, the German locale, and an
~800px-wide window. That re-run re-scores 45-UAT items 24, 26 and 27, and makes items 11 and 12
observable again. This task leaves `45-UAT.md` untouched.

**(g) Residual.** The 500px section floor and the rigid German cached badge, both only visible at
narrower windows than this fix was proven against, are filed as
`.planning/todos/pending/2026-10-11-winetricks-tab-keeps-two-rigid-width-floors-at-narrow-windows.md`.
