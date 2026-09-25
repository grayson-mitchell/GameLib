---
created: 2026-09-25T00:00:00.000Z
title: "No layout in this repo dispatches L3/R3 (buttons[10]/buttons[11]) as stick clicks, so 38-C04's stick-click clause describes a feature that does not exist"
area: gamepad
severity: medium
platform: any
ready: code
found_by: "quick-260925-9de Task 6, verified at HEAD a603b888e on 2026-09-25 while filing this todo after fixing checkNintendo's right-stick axis read"
files:
  - src/frontend/helpers/gamepad_layouts/standard.ts:24-25
  - src/frontend/helpers/gamepad_layouts/genius.ts:27-28
  - src/frontend/helpers/gamepad_layouts/nintendo.ts:25-26
  - src/frontend/helpers/gamepad_layouts/ps.ts
  - src/frontend/helpers/gamepad.ts:188
---

# No layout dispatches `buttons[10]`/`buttons[11]` (L3/R3) as stick clicks

Verified in source, 2026-09-25, at HEAD `a603b888e`:

- `standard.ts:24-25` and `genius.ts:27-28` both have `L3 = buttons[10]` / `R3 = buttons[11]`
  COMMENTED OUT. Neither dispatches anything from those indices.
- `nintendo.ts:25-26`'s LIVE `left = buttons[10], right = buttons[11]` is inside `checkGameCube`,
  where these indices are the GameCube D-PAD (`checkAction('padLeft'/'padRight', ...)`), not stick
  clicks. `checkNintendo` (the function that actually runs for this repo's Nintendo pads) does not
  reference `buttons[10]`/`buttons[11]` at all.
- `ps.ts` has no reference to either index -- its button list stops commenting out indices at
  `Start = buttons[9]`.
- Therefore **no layout in this repo dispatches `buttons[10]`/`buttons[11]` on any pad.**

Two further facts make this consequential rather than merely descriptive:

- `leftClick` is NEVER a button binding anywhere in the codebase. It is DERIVED from `mainAction`
  at `gamepad.ts:188`, only when `shouldSimulateClick()` is true (the focused element is a
  `<select>` or a MUI select). No button press, on any pad, on any mapping, ever produces
  `leftClick` directly.
- `rightClick` is always a FACE button, never a stick click: X on Nintendo (`nintendo.ts`'s
  `checkAction('rightClick', X.pressed, ...)`), Square on PS, and `contextMenuButton` on standard.

## Consequence

`38-VERIFICATION.md:110`'s expected clause for `38-C04` -- "Left/right stick clicks (the
click-equivalents) activate the element currently under focus or cursor" -- describes a feature
that DOES NOT EXIST anywhere in this codebase. It can never be discharged by a human pressing
anything on any controller, because there is no code path from a stick-click button press to
`leftClick`/`rightClick` (or to any other action) on any layout.

This todo does NOT edit `38-VERIFICATION.md` or `38-HUMAN-UAT.md`. The operator re-scores Phase 38
as a separate sitting, exactly as was done for `38-S08`.

## Cross-reference: this is not a duplicate of the sibling (now-resolved) todo

`.planning/todos/completed/2026-09-24-nonstandard-nintendo-pad-stick-clicks-and-guide-unmeasured.md`
said the stick-click INDICES were never MEASURED on the operator's non-standard-mapping PowerA
pad specifically (`ready: human` -- it needed the operator and that hardware to capture a value).

**Update, 2026-09-25 (quick-260925-ms5):** the capture has now been taken. L3 = `buttons[10]`, R3 =
`buttons[11]`, measured live with a positive control, confirming the "matches the shoulders" prior.
The sibling todo is RESOLVED and moved to `completed/`.

This todo's own conclusion is UNCHANGED by that measurement: NO CODE DISPATCHES
`buttons[10]`/`buttons[11]` AT ALL, on ANY mapping, on ANY layout in this repo -- established
entirely by reading source (`ready: code`), independent of which raw HID index the pad reports.
Knowing the index does not create a dispatch path where none exists. The two were never duplicates,
and this one remains open.

**Measuring the non-standard pad's stick-click indices would NOT make `38-C04` dischargeable.**
Even if a future capture confirmed exactly which raw HID index the PowerA pad's L3/R3 buttons sit
at, that measurement alone changes nothing here: no layout function has a `checkAction` call
wired to those indices in the first place, on ANY mapping, standard or non-standard. The gap this
todo records is upstream of the measurement question the sibling todo is about -- there is no
dispatch to attach the measured index to. Implementing that dispatch (deciding what action a
stick click should produce, e.g. `leftClick`/`rightClick`, and wiring it into every layout) is a
distinct, unscoped feature addition, which this todo deliberately does not do.

## Do NOT implement stick clicks

Filing this finding is the whole deliverable. Wiring `buttons[10]`/`buttons[11]` to an action is
out of scope for this todo.

## Resolution

- **Date:** 2026-09-25
- **resolved_by:** quick 260925-oyr
- **Disposition:** RETIRED, not implemented.

The operator chose "Retire the expectation" over "Implement stick clicks" and "Leave it open". The
34.1 item-7 clause ("Left/right stick clicks (the click-equivalents) activate the element currently
under focus or cursor") was a MISDESCRIPTION, not a deferred feature: A / `mainAction` already
activates the focused element, and stick clicks were never a feature in this codebase.

`38-C04b` moved from `human_verification` to `human_verification_retired` in `38-VERIFICATION.md`
(retired, NOT a pass and NOT a discharge -- nothing was observed). Measured at the tool:
`gsd-sdk query audit-uat` moved 25 -> 24 for Phase 38 and 50 -> 49 in total. This SUPERSEDES the
decision recorded by quick `260925-nxt` to keep the item open in `human_verification` so the unmet
expectation stayed visible to `audit-uat`.

NO `src/` executable code changed (two comments were repointed at this file's new `completed/`
path), and this todo's "Do NOT implement stick clicks" ruling stands. The `nintendoLayout.test.ts`
"stick clicks (L3/R3) dispatch nothing" test continues to pin the non-dispatch, so any future
stick-click wiring is a deliberate new feature that needs a new UAT item, not a revival of
`38-C04b`.
