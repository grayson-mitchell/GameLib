---
created: 2026-09-24T00:00:00.000Z
title: "Non-standard Nintendo pad: stick-click indices and Home/Capture were never measured, so `guide` stays unbound and `38-C04`'s stick-click half is unconfirmed"
area: gamepad
severity: minor
platform: any
ready: human
status: RESOLVED
resolved: 2026-09-25
resolved_by: quick-260925-ms5
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

## Resolution (quick-260925-ms5, 2026-09-25)

Both halves are now measured. quick-260925-ms5 Task 2 ran a live capture on the operator's PowerA
Advantage Wired Controller for Nintendo Switch 2, one button at a time, with a positive control (the
A cap, already-measured at index 2) confirmed live BEFORE any of the four unknowns were pressed --
the exact safeguard the 2026-09-23 capture lacked.

- **Stick clicks (A4 second half): MEASURED, not a null.** L3 = `buttons[10]`, R3 = `buttons[11]`.
  The "probably matches the shoulders" prior is CONFIRMED, this time by measurement rather than by
  deduction. Recorded as a measurement-record comment in `nintendo.ts`, plus a pinning test in
  `nintendoLayout.test.ts` proving pressing either index dispatches nothing -- per the sibling todo's
  binding "do NOT implement stick clicks" ruling, no `checkAction` call was added.
- **Home/Capture (A5): MEASURED, the 2026-09-23 null is OVERTURNED.** Home = `buttons[12]`,
  reproduced across two separate presses in the same sitting. Capture = `buttons[13]`, a DIFFERENT
  index. `guide` is now wired to `buttons[12]` (Home only) on `checkNintendo`'s non-standard arm;
  Capture's index is recorded in a comment but deliberately left unbound -- `guide` means the
  system/home button, and binding Capture to it would be a distinct design decision nobody has made.
- **Known unknown, explicitly not wired:** an EARLIER, unattributed sitting (before the one-at-a-time
  procedure that produced the table above) logged an unattributed press at index 16. That capture is
  discarded as evidence for anything about WHICH button produced it, but the fact that index 16 exists
  on this pad and is unmapped is worth recording as an open question for a future capture -- see
  `260925-ms5-SUMMARY.md`.

What this resolution does NOT do: it does not make `38-C04`'s stick-click clause dischargeable. See
the updated Downstream effect section below -- that gap is upstream of this measurement, per the
sibling todo `2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`.

## Downstream effect

`38-C04` ("back + stick clicks") is recorded in the retired todo's resolution as having its
stick-click half still unconfirmed by measurement on this pad -- distinct from `38-C03`
(shoulders/Tab), which quick-260923-qe5's A4 measurement did confirm as scoreable.

**Updated by quick-260925-ms5 (2026-09-25):** the stick-click indices ARE now measured (10/11,
above), but that measurement does NOT make `38-C04` dischargeable. The sibling todo
`2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md` establishes something stronger and upstream
of this one: no layout in this repo dispatches `buttons[10]`/`buttons[11]` to any action, on any
mapping -- there is no code path from a stick-click press to `leftClick`/`rightClick` at all. So
`38-C04`'s stick-click clause describes a feature that does not exist, independent of whether its
raw HID index is known. Measuring the index closes THIS todo; it does not close that gap.

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
