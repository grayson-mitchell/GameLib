---
created: 2026-09-24T00:00:00.000Z
title: "Non-standard Nintendo pad: stick-click indices and Home/Capture were never measured, so `guide` stays unbound and `38-C04`'s stick-click half is unconfirmed"
area: gamepad
severity: minor
platform: any
ready: human
found_by: "quick-260923-qe5 Task 1 live capture, PowerA Advantage Wired Controller for Nintendo Switch 2, 2026-09-23 -- A4/A5 left incomplete once the shoulder question was answered"
files:
  - src/frontend/screens/ConsoleMode/index.tsx:405-407
  - src/frontend/helpers/gamepad_layouts/nintendo.ts
---

# Two of quick-260923-qe5's Task 1 observation points were never captured

quick-260923-qe5 fixed `checkNintendo` and Console Mode's index helpers to read a Nintendo pad's
actual `mapping` instead of assuming it, based on a live capture (A1-A7) off the operator's PowerA
Advantage Wired Controller for Nintendo Switch 2. Two of the seven observation points the plan's
Task 1 defined were not captured, because operator time ran out once the higher-priority questions
(face-cap indices, hat axis, shoulders) were answered:

- **A4, second half -- stick clicks.** The shoulder half of A4 WAS measured: L/R/ZL/ZR sit at
  4/5/6/7, identical to the standard mapping, which retired the parent todo's "shifted" claim for
  the shoulders. `buttons[10]`/`buttons[11]` (the left/right stick clicks) were never pressed
  during the capture, so whether they too sit at the standard indices on this pad -- likely, given
  the shoulders matched, but not confirmed -- is unknown. `ConsoleMode/index.tsx:405-407` still
  wires `BTN_L1`/`BTN_R1`/`BTN_R2`-style constants without a mapping branch; if the stick-click
  indices DO differ on the non-standard path, that file has the same class of defect
  `checkNintendo` had before quick-260923-qe5, just unmeasured rather than confirmed.
- **A5 -- Home/Capture.** Pressing Home and Capture during the live capture produced no
  `[GAMEPAD-BTN]` line at all -- not "no index assigned", but no observable event, possibly because
  the OS intercepts those buttons before Chromium sees them. quick-260923-qe5 responded correctly
  to that absence by leaving `guide` deliberately unbound on the non-standard path rather than
  guessing an index. This todo exists so that non-binding is recorded as an open question, not a
  closed one -- a future capture might find Home/Capture DO produce an index under different
  circumstances (a different browser build, a different OS-level binding), and `guide` could then
  be wired.

## Downstream effect

`38-C04` ("back + stick clicks") is recorded in the retired todo's resolution as having its
stick-click half still unconfirmed by measurement on this pad -- distinct from `38-C03`
(shoulders/Tab), which quick-260923-qe5's A4 measurement did confirm as scoreable.

## Why `ready: human`, not `ready: code`

This is a measurement gap, not an implementation gap. There is nothing to write or fix from a desk
-- both the possible fix (if the indices differ, branch on mapping in `ConsoleMode/index.tsx` the
same way `nintendo.ts` now does) and the possible no-op (if they match the standard indices, same
as the shoulders) depend on a value only the operator's specific pad can produce. Filing a `code`
todo here would invite guessing at the two remaining indices, which is exactly the mistake this
todo's parent (quick-260923-qe5) was created to correct.

## Testability once measured

`nintendoLayout.test.ts`'s `buildHarness()`/`pressButton()`/`moveHat()` (extended by
quick-260923-qe5) already supports a non-standard-mapping pad at the desk. If a future capture
finds the stick-click indices shifted, or finds a Home/Capture index, the same harness shape can
pin the new value with a synthetic test -- no new test infrastructure is needed, only the
measurement.

## Note on instrumentation cost

quick-260923-qe5's permanent `[GAMEPAD]` connect diagnostic (`gamepad.ts`, one line through
`window.api.logInfo`) stays in the tree, so a future capture of `mapping`/button-count/axis-count
needs no new code. Its TEMPORARY per-frame `[GAMEPAD-BTN]`/`[GAMEPAD-AXIS]` dump (Piece B) was
deleted in quick-260923-qe5's Task 5 as planned, so a future capture of the stick-click or
Home/Capture indices specifically would need that dump (or an equivalent) re-added first.
