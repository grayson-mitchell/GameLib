---
created: 2026-09-24T00:00:00.000Z
title: "`checkN64Clone1`'s d-pad code contradicts its own comment -- `padDown`/`padRight` are bound to the wrong hat values"
area: gamepad
severity: minor
platform: any
ready: code
status: RESOLVED
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

## ✅ FIXED IN CODE 2026-09-25 (quick `260925-m5i`)

## What shipped

| Piece | Where |
|-------|-------|
| `padDown` changed from `dPadVal === -1` (the table's DOWN-RIGHT row) to `dPadVal === 1` (the table's DOWN row) | `src/frontend/helpers/gamepad_layouts/nintendo.ts` |
| `padRight` changed from `dPadVal === 4` (the table's DOWN-LEFT row) to `dPadVal === -4` (the table's RIGHT row) | `src/frontend/helpers/gamepad_layouts/nintendo.ts` |
| `padUp` (`-10`) and `padLeft` (`7`) left untouched -- they already matched their rows | `src/frontend/helpers/gamepad_layouts/nintendo.ts` |
| In-situ comment added above the four `checkAction` calls, deriving each value from the table and recording why this function deliberately does NOT route through `nintendoHatDirection` | `src/frontend/helpers/gamepad_layouts/nintendo.ts` |
| `nintendoHatDirection`'s now-stale comment repaired -- it previously asserted `checkN64Clone1`'s comment and code "already disagree with each other", which this fix makes false. Its `switch`, cases, and default arm are byte-identical; only prose changed | `src/frontend/helpers/gamepad_layouts/nintendo.ts` |
| Seven new test cases in one new `describe` block, run against unmodified source first to measure the RED set before fixing | `src/frontend/helpers/__tests__/nintendoLayout.test.ts` |

**The minimal-swap decision, and the rule that made it.** Both a minimal two-value swap and
routing through the file's existing `nintendoHatDirection` helper were evaluated; they are
behaviourally equivalent (same transform, same four cardinals, same everything-else-is-null
default). The minimal swap was chosen because this file already states, twice, that a table
measured for one device is not a shared contract for another: `nintendoHatDirection`'s own
comment named `checkN64Clone1` explicitly as a table not to copy from, and a second comment
(`RAW_HID_STICK_AXES`, `:154-158`) states the identical rule about not borrowing `checkGamecube`'s
axis row -- a rule that was not abstract, since that borrowed row was live-FALSIFIED for the
PowerA pad on 2026-09-25. `nintendoHatDirection`'s comment is a measurement record for one
specific, already-measured device (PowerA 20d6/a720) whose neutral value diverged from the generic
convention it otherwise matched; making that record the shared contract for a second, unmeasured
device class would be the precise failure those two comments exist to prevent.

**The seven test cases: four RED, three green-by-design.** Written against the unmodified source
first, per plan. The ACTUAL observed failure set matched the plan's prediction exactly, with no
divergence to reconcile:

- RED -- DOWN (`0.14286`, rounds to `1`) expected to dispatch `padDown`; dispatched nothing.
- RED -- RIGHT (`-0.42857`, rounds to `-4`) expected to dispatch `padRight`; dispatched nothing.
- RED -- DOWN-RIGHT (`-0.14286`, rounds to `-1`) expected to dispatch no d-pad action; wrongly
  dispatched `padDown`.
- RED -- DOWN-LEFT (`0.42857`, rounds to `4`) expected to dispatch no d-pad action; wrongly
  dispatched `padRight`.
- GREEN pre-fix by design (contract preservation, not RED evidence) -- UP (`-1`) dispatching
  `padUp`, LEFT (`0.71429`) dispatching `padLeft`, and a `buttons[8]` -> `back` routing positive
  control proving the cases reach `checkN64Clone1` rather than passing vacuously through
  `gamepad.ts`'s swallowing `catch` (this function reads `buttons[8].pressed` unguarded, so a
  mis-sized pad would throw and make every `not.toContain` assertion pass for the wrong reason).

All seven cases pass post-fix; the file's 30+ pre-existing `checkNintendo`/routing cases stayed
green throughout, pre-fix and post-fix, unmodified.

## What is still NOT measured -- read this before assuming otherwise

**Real Vendor 0079 Product 0006 hardware remains UNMEASURED.** No N64-clone controller existed on
this machine before this fix and none exists now. What shipped is code-to-comment agreement --
`checkN64Clone1`'s four comparisons now derive cleanly from its own documented table -- plus the
live confirmation of the identical Chromium/W3C generic-hat convention on a DIFFERENT pad (PowerA
Advantage Wired Controller for Nintendo Switch 2, quick-260923-qe5, 2026-09-23), where every
cardinal matched. That is the strongest evidence available and is not the same as a measurement of
this device. The on-hardware consequence this todo originally described -- a dead DOWN and a
crossed RIGHT for an actual N64-clone-pad owner -- is inferred from the table, not observed here.

**The resting hat value was never measured, and no rest-value test was written for it.** Unlike
the PowerA pad (whose measured neutral, `3.28571`, diverges from the generic convention's predicted
`1.28571`), this device's neutral has no measurement at all. Seeding a synthetic test pad's hat
axis with `0` (the harness's unconfigured default) and asserting "no d-pad action at rest" would
assert against a harness default dressed up as a device fact -- green both before and after this
fix, proving nothing. This is a deliberate omission, not an oversight; it mirrors the identical,
already-written precedent for the PowerA pad's own suite (case (G), `nintendoLayout.test.ts`
:592-600, also deliberately not written).

No new spillover todo is opened for the unmeasured hardware: the "Testability" section above
already scoped live confirmation as a separate, harder-to-schedule step, and this section carries
that forward without inventing a second tracking artifact.
