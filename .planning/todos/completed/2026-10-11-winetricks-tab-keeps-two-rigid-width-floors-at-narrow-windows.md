---
created: 2026-10-10T23:56:34.000Z
title: Winetricks tab keeps two rigid width floors at narrow windows (500px section floor, rigid German cached badge)
area: ui
severity: minor
platform: any
ready: code
found_by: "quick 261011-hh5 diagnosis (desk read), 2026-10-11"
files:
  - src/frontend/screens/Settings/sections/GamesSettings/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
---

## Observation (desk-derived, unmeasured)

Quick task 261011-hh5 released the Settings dialog paper's `min-width: fit-content` floor so the
Winetricks tab's content can no longer widen the dialog past the window. Two narrower, rigid
floors live below the paper and were out of scope for that fix. Neither has been measured at a
live window; both are inferred from a scoped grep and the cascade rules below.

**(1) The 500px section floor.**
`.settingsDialogContent section:not(:nth-of-type(0)) { padding-top: var(--space-xl); min-width: 500px; }`
(`GamesSettings/index.scss:34-36`, specificity 0,2,1) out-specifies the `min-width: 0` declared for
the tab's three `<section>` groups (specificity 0,2,0): `.WinetricksSuggested` and
`.WinetricksTaskGroup` (`WinetricksSettings/index.scss:36-40`) and `.WinetricksEverythingElse`
(`EverythingElseGroup/index.scss:12-15`). Once the paper's content box drops below 500px, the
groups overflow and the dialog content scrolls sideways instead of wrapping. That happens roughly
below a 610-690px window, depending on whether the paper's `80vw` or `100%` max-width wins the
cascade at that point. Whether the leaked `padding-top: var(--space-xl)` on this rule is wanted
spacing for the groups or an unrelated carry-over is a design question to record here, not answer.

**(2) The rigid cached badge.** `.WinetricksRow__cached` is `flex: 0 0 auto; white-space: nowrap`
(`Row/index.scss:179-185`). The German label `Zwischengespeichert (Offline-Installation)` is sized
to fit beside a truncated row title at the 700px paper width proven by 261011-hh5, but at narrower
papers it cannot shrink and can paint over the row's 12rem status slot.

## Fix options (not chosen)

- A specificity bump on the three groups' `min-width: 0` (for example re-scoping or `!important`
  is out; a more specific selector matching the existing `0,2,1` is the likely shape) so they beat
  the 500px section floor again.
- Let `.WinetricksRow__cached` shrink last with ellipsis instead of staying rigid. It currently has
  no `title` tooltip, so adding one to recover the full text on hover would be a TSX change, not
  CSS-only.

## Owed

A live capture at a narrow window (roughly 600-700px) in the `de` locale, confirming whether the
500px floor and the cached badge actually arm in practice and at what width.

## Resolution (2026-10-11, quick 261011-jj1, commits a653147, 9534d25)

**(a) The floor.** The mechanism is confirmed: `GamesSettings/index.scss`'s section rule compiles
to two selectors at specificity 0,2,1, which out-specifies the three groups' own `min-width: 0` at
0,2,0. The three groups are confirmed `<section>` elements (`SuggestedGroup/index.tsx:27`,
`TaskGroup/index.tsx:33`, `EverythingElseGroup/index.tsx:56`); the tab root is a `<div>` with no
`<section>` ancestor, so these three are the floor's only targets inside the tab, and releasing
them is sufficient. The fix is one top-level rule,
`:is(.settingsDialogContent, .settingsWrapper) .WinetricksSettings :is(.WinetricksSuggested,
.WinetricksTaskGroup, .WinetricksEverythingElse)`, scoring 0,3,0 -- strictly above the floor in any
stylesheet load order. Two 0,2,1 shapes were prototyped and rejected: both tie the floor, and a tie
wins only by stylesheet order, which this plan does not control. `GamesSettings/index.scss` is
byte-unchanged (gated by `git diff --quiet` against `b7f8a3924` in both tasks' verify blocks).

**(b) The badge.** `.WinetricksRow__cached` now uses `flex: 0 1 auto` with `min-width: 0`,
`overflow: hidden`, `text-overflow: ellipsis` and `white-space: nowrap`, split from the rigid
`.WinetricksRow__category` rule it used to share. It deliberately takes the title's own shrink
weight rather than a lower factor: a lower factor drives the title to zero width first, because
the title's own floor is `min-width: 0`, leaving a row that shows a truncated badge but names no
verb. The desk estimate behind that choice (roughly 600px window, `de` locale) is unmeasured. The
category tag stays rigid per E7-long-text and gets no tooltip. The badge span now carries
`title={cachedLabel}`, recovering the full localised label on hover. Correction to this todo's own
"Fix options" framing: `flex: 0 3 auto` belongs to `.WinetricksRow__meta`, not the two-line title,
which stays `flex: 0 1 auto` in both templates.

**(c) Pins.** `tokenCensus.test.ts` gained `describe('selector specificity (261011-jj1)', ...)`
(2 tests: exact scoring of the four cited selectors, and that unsupported selector text throws
rather than mis-scores) and `` describe(`GamesSettings section floor vs the tab's groups
(261011-jj1)`, ...) `` (9 tests: the floor rule is unchanged, four inline-sample accept/reject
cases, an `it.each` over the three groups, and that the override declares `min-width` only). Task 1
RED: `Tests: 4 failed, 29 passed, 33 total` (the three `it.each` cases plus the min-width-only
test); GREEN: `Tests: 33 passed, 33 total`. Task 2 added
`describe('cached badge yields instead of overflowing (261011-jj1)', ...)` (7 tests: three inline
accept/reject samples, the real stylesheet, title/badge flex parity, the category tag staying
rigid, and the status slot staying unchanged) plus one `rowStates.test.tsx` assertion that the
cached span's `title` equals its text in every non-installed state. Task 2 RED:
`Tests: 3 failed, 71 passed, 74 total` (the real-file `cachedBadgeYields` test, the parity test,
and the new rowStates title test); GREEN over the whole tab directory:
`Tests: 226 passed, 226 total`.

**(d) Recorded, not answered.** Whether the GamesSettings rule's `padding-top: var(--space-xl)`
reaching the three groups is wanted spacing or an unrelated carry-over is still an open design
question. The override deliberately leaves it applied -- it declares `min-width: 0` only -- and a
pin (`the floor rule is unchanged`) asserts the floor rule still declares that `padding-top`
unchanged.

**(e) NOT live-verified.** Still owed: a capture at a roughly 600-700px window in the `de` locale,
confirming that the three groups wrap instead of the dialog content scrolling sideways, and that
the cached badge ellipsizes clear of the status slot rather than painting over it. Also newly owed
by this fix's own parity choice: at the wider roughly 700-800px paper 261011-hh5 was proven
against, whether the German badge's now-earlier ellipsis onset (it shares the title's shrink
weight rather than staying rigid) is visually acceptable is unmeasured and is the visible cost of
choosing parity over a lower shrink factor.

**(f) Scope.** `45-UAT.md` was not touched by this task.
