---
created: 2026-08-15T08:50:00.000Z
revised: 2026-08-21
title: "Port Heroic gamepad key-repeat tuning (part b) — part (a) landed differently, carries an open convention decision"
area: input
needs: port-then-hand-merge
status: OPEN
severity: minor
upstream:
  - 8eb7fe7f9 (Heroic v2.22.1 — Improved gamepad key repeat, #5059) — STILL OPEN
  - 0ee91ab2f (Heroic v2.22.1 — Correct reversed A/B and X/Y on Nintendo controllers, #5747) — SUPERSEDED, see below
files:
  - src/frontend/helpers/gamepad.ts
  - src/frontend/components/UI/SliderField/index.tsx
  - src/frontend/components/UI/SliderField/index.css
  - src/frontend/screens/Settings/components/GamePadDelayRepeat.tsx
  - src/frontend/screens/Settings/components/index.ts
  - src/backend/config.ts
  - src/common/types.ts
  - public/locales/en/translation.json
---

## Status as of 2026-08-21

Originally this todo bundled two upstream commits. **Part (a) is done — by a different
route than upstream — and part (b) has not been started.** Quick task `260821-ooq`
(commits `c60eb9776`, `a1eddb5c3`) landed part (a)'s user-visible symptom fix.

### Part (a) — Nintendo face buttons: RESOLVED, divergent from upstream

The reported defect (on-screen glyph contradicts the button that acts) is gone in
Console Mode. GameLib and Heroic fixed it in **opposite directions**, and both are
internally consistent:

| | index that confirms | glyph shown for confirm | resulting convention |
|---|---|---|---|
| Heroic `0ee91ab2f` | `buttons[1]` (physical right) | `A` | **A confirms** — matches the Switch OS |
| GameLib `c60eb9776` | `buttons[0]` (physical bottom) | `B` | **bottom button confirms** — position-stable across brands |

GameLib swapped the *labels* (`getActionButtonLabel`/`getBackButtonLabel` gained a
`'nintendo'` branch); upstream swapped the *indices* (added
`getActionButtonIndex`/`getBackButtonIndex`, demoted `BTN_ACTION`/`BTN_BACK` to
module-private, and added a `checkNintendo` layout dispatched on `057e.*(2006|2007|2009)`).

Verified consistent 2026-08-21: `ConsoleMode/index.tsx` and `BackHint` read the glyph
from the label helpers, while `InstallOverlay`, `ConfirmDialog` and `LaunchOverlay` bind
`BTN_ACTION`/`BTN_BACK` directly — so glyph and action agree on a Switch pad.
Outside Console Mode no layout-derived glyph is rendered anywhere, and no `X`/`Y` glyph
is rendered at all, so upstream's X/Y half has no contradiction to fix here either.

**Open decision (operator, not an executor):** keep GameLib's *bottom-button-confirms*
convention, or adopt upstream's *A-confirms*? Upstream's matches a Switch owner's muscle
memory from the console itself; GameLib's keeps one physical position confirming on every
controller brand. Switching later is cheap while only Console Mode renders glyphs — it
means adding the two index helpers and routing the three overlays through them. **Do not
let an executor "finish the port" by pulling `0ee91ab2f` in on top of `c60eb9776`** —
applying both swaps cancels them out and reintroduces the original defect.

The quick task also fixed an unrelated `removegamepad` bug found in passing
(`gamepad.ts` compared an array position against a gamepad index), and added two
regression suites. Neither was in this todo's scope.

## Part (b) — Key repeat is sluggish: STILL FULLY OPEN

Verified absent 2026-08-21: no `SliderField` component, no `GamePadDelayRepeat.tsx`, and
`gamepad.ts` still carries the pre-fix repeat handling.

Upstream `8eb7fe7f9` reworks repeat timing in `gamepad.ts` (+113), adds a `SliderField`
UI component, adds a `GamePadDelayRepeat` control under Advanced Settings, and plumbs the
delay/rate through `src/backend/config.ts` and `src/common/types.ts`.

`src/frontend/helpers/gamepad.ts` has since been touched by `a1eddb5c3` (the
`removegamepad` fix in the `initGamepad` body). Re-check merge cleanliness before
cherry-picking — the 2026-08-15 "untouched since fork base" note in the original todo is
now stale for this file.

**Trap:** this half adds new i18n keys, so it **trips GameLib's blocking localisation
gate**. Budget for that.

**Opportunity:** GameLib has carried an *unmeasured gamepad focus-scroll* item across two
consecutive phases. This is still the natural place to finally measure it rather than
carrying it a third time.

Reference commit is readable locally — the Heroic upstream is git remote `origin`:
`git show 8eb7fe7f9`.

Related: [[port-heroic-small-polish-trio]] (same upstream review), and the store-page
gamepad seed in `.planning/seeds/` for the console-mode-drives-store-browser feature.
