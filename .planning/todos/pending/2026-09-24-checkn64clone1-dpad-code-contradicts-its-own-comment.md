---
created: 2026-09-24T00:00:00.000Z
title: "`checkN64Clone1`'s d-pad code contradicts its own comment -- `padDown`/`padRight` are bound to the wrong hat values"
area: gamepad
severity: minor
platform: any
ready: code
found_by: "Spillover from quick-260923-qe5 Task 1, which measured a real Nintendo-style pad's hat axis live and confirmed the Chromium/W3C generic-hat convention `checkN64Clone1`'s own comment already states"
files:
  - src/frontend/helpers/gamepad_layouts/nintendo.ts:260-279
---

# `checkN64Clone1`'s hat-direction comment and code disagree, and the code is wrong

**Not newly discovered -- now MEASURED, not merely suspected.** quick-260923-qe5's Task 1 read the
hat axis live off a real Nintendo-style pad (PowerA Advantage Wired Controller for Nintendo Switch
2) and confirmed the Chromium/W3C generic-hat convention that `checkN64Clone1`'s own comment already
documents: cardinals round to up `-10`, right `-4`, down `1`, left `7` (diagonals and neutral fall
elsewhere). That plan's `nintendoHatDirection` helper (added in the same change, for a *different*
device's `checkNintendo` path) uses this exact convention and was RED/GREEN-proven against it. This
todo is the record that `checkN64Clone1`, several dozen lines away, already wrote out the identical
comment table -- and then wrote code that does not match it.

## The disagreement, in `nintendo.ts:260-279`

The comment (`nintendo.ts:260-267`):

```
// up: -1
// up-right: -0.71429
// right: -0.42857
// down-right: -0.14286
// down: 0.14286
// down-left: 0.42857
// left: 0.71429
// up-left: 1
```

Multiplied by 10 and rounded (the transform the code itself performs at `nintendo.ts:274`), that
table is: up `-10`, up-right `-7`, right `-4`, down-right `-1`, down `1`, down-left `4`, left `7`,
up-left `10`.

The code (`nintendo.ts:276-279`):

```js
checkAction('padUp', dPadVal === -10, controllerIndex)
checkAction('padDown', dPadVal === -1, controllerIndex)
checkAction('padLeft', dPadVal === 7, controllerIndex)
checkAction('padRight', dPadVal === 4, controllerIndex)
```

`padUp` (`-10`) and `padLeft` (`7`) match their row exactly. `padDown` and `padRight` do not:
- `padDown` tests `dPadVal === -1`, which the comment's own table labels **down-right**, not down.
  Down is `1`.
- `padRight` tests `dPadVal === 4`, which the comment's own table labels **down-left**, not right.
  Right is `-4`.

So on real hardware matching this convention, pressing the d-pad DOWN would fire nothing (no
cardinal reads `-1` on a real hat -- that value is a diagonal), and pressing down-right would
incorrectly fire `padDown`. Symmetrically for right/down-left.

## Why this is filed rather than fixed here

quick-260923-qe5's scope fence explicitly excluded `checkN64Clone1` -- "different device, no
hardware to test it, explicitly out of scope per the brief" -- and no N64-clone controller (Vendor
0079, Product 0006) was available to confirm the LIVE symptom on this machine. The comment/code
disagreement is confirmed by reading; the on-hardware consequence (a dead or crossed d-pad
direction for an actual N64-clone-pad owner) is not. `severity: minor`: a different, comparatively
rare device class, and no live consequence has been proven here.

## Fix direction (not prescriptive)

Swap the two comparisons: `padDown` should test `dPadVal === 1`, `padRight` should test
`dPadVal === -4`. `nintendo.ts`'s own `nintendoHatDirection` helper (added by quick-260923-qe5,
same file) already implements the correct mapping for the same convention and could plausibly be
reused here instead of hand-duplicating the comparison, though that is a larger refactor than the
minimal fix and should be decided at plan time, not assumed.

## Testability

`ready: code` -- this is a synthetic-hat-axis test against `checkN64Clone1` with values from the
pad's own documented convention, buildable with the existing `nintendoLayout.test.ts` harness at
the desk. Live confirmation on real N64-clone hardware is a separate, harder-to-schedule step this
todo does not require before the code-level fix can land.
