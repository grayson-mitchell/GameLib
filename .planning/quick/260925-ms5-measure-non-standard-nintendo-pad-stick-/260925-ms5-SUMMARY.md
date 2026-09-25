# Quick 260925-ms5: Measure the non-standard Nintendo pad's stick-click and Home/Capture indices — Summary

**One-liner:** L3/R3 (stick clicks) measured at `buttons[10]`/`buttons[11]` on the operator's PowerA
Advantage Wired Controller for Nintendo Switch 2, confirming the "matches the shoulders" prior by
measurement; Home/Capture measured at `buttons[12]`/`buttons[13]` respectively, overturning the
2026-09-23 null (which had no positive control) — `guide` is now wired to the measured Home index
only, on `checkNintendo`'s non-standard arm.

## Branches that fired (named per `<conditionality>`)

- **Parity: P1.** All four fields of the live `[GAMEPAD]` connect line matched the recorded triple
  byte-identically: `mapping="" buttons=17 axes=10`, same `id`. The shoulder cross-check (Step 3)
  independently reproduced 4/5/6/7 exactly, which is index-level parity proof, not just enumeration
  parity. Proceeded to the press sequence.
- **Stick clicks: S1.** L3 and R3 each produced a `[GAMEPAD-BTN]` line, at indices 10 and 11 — the
  predicted indices, confirmed rather than assumed.
- **Home/Capture: H1.** Home produced an index (12); Capture produced a DIFFERENT index (13). Per the
  H1 rule, `guide` is bound to Home only; Capture's index is recorded but not bound.
- **D2 did not run.** Step 3's shoulder cross-check reproduced 4/5/6/7 exactly — no contradiction, so
  `ConsoleMode/controller.ts`'s `BTN_L1`/`BTN_R1`/`BTN_R2` constants needed no change. This is a no-op
  decision worth recording as such: those constants are correct BY MEASUREMENT (twice now — 2026-09-23
  and 2026-09-25), not by assumption.

## The measurement transcript (captured live, 2026-09-25, ~16:43–16:48, orchestrator-relayed)

Device: PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720),
operator's Windows 11 machine.

**Parity read (Step 0):**

```
[GAMEPAD] id="PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720)" mapping="" buttons=17 axes=10
```

Byte-identical to the 2026-09-23 capture and to the 2026-09-25-earlier (quick-260925-9de) capture.

**Resting baseline:**

```
[GAMEPAD-BTN] first=true count=17 pressed=[]
```

Nothing latched at rest — no false-null risk on this sitting.

**Positive control (Step 1), CONFIRMED LIVE before any unknown was pressed:**

```
[GAMEPAD-BTN] index=2 pressed=true
[GAMEPAD-BTN] index=2 pressed=false
```

(A cap, already measured at index 2 on 2026-09-23.) This is what makes every subsequent reading —
including a null, had one occurred — interpretable as a device fact rather than an instrument
failure.

**The four unknowns (Step 2), one button at a time, pressed alone, ~2s apart:**

| physical button | index |
| --- | --- |
| A cap (control, cross-check) | 2 |
| LEFT stick click (L3) | **10** |
| RIGHT stick click (R3) | **11** |
| Home (house icon) | **12** |
| Capture (circle icon) | **13** |

Home was pressed twice, in separate reads, and returned 12 both times — reproducibility confirmed
for the one value wired into code.

**Shoulder cross-check (Step 3):** L, R, ZL, ZR reproduced 4, 5, 6, 7 in order — identical to the
2026-09-23 capture. This is index-level parity evidence, stronger than the enumeration-triple match
alone, because it proves the numbering itself (not just the counts) is unchanged.

**There are no nulls in this capture.** All four unknowns emitted an observable index.

## Discarded data, and why

An EARLIER, unattributed sitting (~16:38–16:39, before the one-at-a-time procedure was adopted)
logged presses producing indices 13 and 16, with no record of which physical button produced which
reading — the operator was, at that point, still unfamiliar with the button names. **This data is
discarded.** It is not reconciled against the attributed capture above and is not used as
corroboration: an unattributed reading is the precise defect the one-at-a-time re-capture exists to
eliminate, and letting it corroborate a later attributed reading (index 13, in this case, which the
attributed capture separately and independently assigned to Capture) would launder an unattributed
observation into an attributed one after the fact.

**The one thing carried forward from the discarded sitting:** index 16 exists on this pad's `buttons`
array (`buttons.length` is 17, so indices 0-16 all exist) and no identified physical button has been
mapped to it by this task. This is recorded as an explicit KNOWN-UNKNOWN, not a finding — no
speculation about which button it is, and nothing is wired to it. For context only, not as evidence:
index 16 is where `guide` sits under the STANDARD mapping (`checkNintendo`'s `if (mapping ===
'standard')` arm), which is a coincidence of numbering on an entirely different wire format, not
evidence about what index 16 does on this non-standard pad's raw HID report.

## What was written, and what was deliberately not

**`nintendo.ts`, `checkNintendo`'s non-standard arm:**

- Corrected the overstated comment that previously claimed buttons[12-15] "are Home and Capture." The
  measured truth: `buttons[12]` = Home, `buttons[13]` = Capture. `buttons[14]` and `buttons[15]`
  remain UNMEASURED — the corrected comment says so explicitly rather than overstating in the other
  direction.
- Added `checkAction('guide', buttons[12]?.pressed, controllerIndex)`, replacing the prior
  "`guide` is deliberately NOT dispatched" comment with the measurement record: the 2026-09-23
  (quick-260923-qe5 A5) null had no positive control; this capture did, and Home reproduced twice.
  Capture (`buttons[13]`) is recorded in the same comment but NOT bound — `guide` means the
  system/home button, and binding Capture to it is a design decision nobody has made.
- Added a measurement-record comment for the stick clicks (L3=10, R3=11), cross-referencing
  `.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md` by filename. **No
  `checkAction` call was added for buttons[10]/[11].** Per Correction 2 in the plan and the sibling
  todo's binding "Do NOT implement stick clicks" ruling, that stays declined regardless of which
  index the measurement produced — this is a measurement record only.

**`nintendoLayout.test.ts`:**

- One case pinning that pressing `buttons[10]` and `buttons[11]` on the non-standard pad dispatches
  nothing (`toHaveLength(0)`), so a future accidental wiring is caught.
- One case proving `guide` fires from the measured Home index (12) on the non-standard pad. **Note on
  how `guide` is observed:** `guide` resolves to a `window.location.hash` toggle inside `checkAction`
  (`gamepad.ts`), returning BEFORE the `window.api.gamepadAction` call every other action in this file
  goes through — so it is NOT visible via `pressButton`'s `actions()` return value (the mechanism the
  file's other cases rely on). This case instead reads `window.location.hash` back off the harness's
  `window` global after the press, and asserts it toggled to `'#/console'`.
- One CONTRACT-PRESERVATION case (labelled as such, GREEN pre-fix by design, not RED evidence) pinning
  that the standard-mapped arm still reads `guide` from `buttons[16]`, unchanged by this task's edit
  to the non-standard arm.

**`gamepad.ts`:** the temporary `HID_DUMP` constant, `hidDumpPrevButtons` state, and the whole
`if (HID_DUMP) { ... }` emission block (added in `10b9e720a`) were removed in full, including from
comments (residue-grep clean). The permanent `[GAMEPAD] id=...` connect line and its why-it-is-
permanent comment in `addgamepad()` are untouched.

**Todos:**

- `.planning/todos/pending/2026-09-24-nonstandard-nintendo-pad-stick-clicks-and-guide-unmeasured.md`
  was `git mv`'d to `.planning/todos/completed/` and given `status: RESOLVED`,
  `resolved: 2026-09-25`, `resolved_by: quick-260925-ms5`, plus a `## Resolution` section recording
  both measured halves and the index-16 known-unknown, and an updated `## Downstream effect` section
  stating plainly that measuring the stick-click indices does NOT make `38-C04` dischargeable (that
  gap is upstream, per the sibling todo).
- `.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`'s
  `## Cross-reference` section was updated to record that the capture has now been taken (10/11) and
  that its own "no dispatch exists" conclusion is unchanged by that measurement. It remains OPEN,
  `ready: code`, and its "Do NOT implement stick clicks" ruling was not touched or overridden.

## Where this task's own priors were right, and where a prior sitting's was wrong

The plan's `<established_vs_unknown>` section explicitly forbade four specific deductions, including
"the shoulders matched at 4/5/6/7, so the stick clicks are 10/11." **That deduction, if it had been
made, would have happened to be correct** — S1's measured values are exactly 10 and 11. This is
recorded honestly as a coincidence of measurement, not vindication of the forbidden reasoning: the
plan's rule against deducing indices from the shoulders remains correct in general (qe5's own A4
retired an identically-shaped deduction — the parent todo's "shifted shoulders" claim — by measuring
it and finding it WRONG), and this task's contribution is that the stick-click question is now closed
by an actual reading rather than by the coincidence that the reading matches what deduction would
have produced.

The 2026-09-23 (quick-260923-qe5 A5) prediction that Home/Capture would produce no observable index
was WRONG, per Rule 1 precedent: it is OVERTURNED here, not merely re-confirmed, because this
sitting's positive control is exactly what the original sitting lacked.

## Deviations from Plan

None. Both `<conditionality>` branches executed (S1, H1) matched named rows exactly; D2 did not fire
because Step 3 reproduced 4/5/6/7 without contradiction. The `guide` test case required reading
`window.location.hash` rather than `pressButton`'s `actions()` return value — this is not a deviation
from the plan's instructions (which specified the assertion outcome, not its exact mechanism) but a
necessary adaptation once the actual dispatch path for `guide` (an early-return hash toggle, not a
`window.api.gamepadAction` call) was found during implementation; documented here for transparency.

## Known Stubs

None. This task wires one `checkAction` call to a measured index and adds measurement-record
comments and tests; no UI surface, hardcoded empty value, or placeholder text was introduced.

## Threat Flags

None. `T-ms5-01` (the temporary `[GAMEPAD-BTN]` dump writing button-press state to
`gamelib.log`) is fully removed — proved below by residue grep. `T-ms5-02` (an unguarded
`window.api.logInfo` throw) never manifested; every emission was guarded and the temporary code is
now gone entirely. No new network endpoint, auth path, file-access pattern, or trust-boundary schema
change was introduced.

## Task Commits

1. **Task 1: Re-add the temporary `[GAMEPAD-BTN]` dump** — `10b9e720a` (test) — completed prior to
   this session.
2. **Task 2: Live operator capture** — checkpoint, no commit (relayed by the orchestrator; results
   above).
3. **Task 3: Pin the measured branches (S1, H1)** — `44f86b509` (feat)
4. **Task 4: Remove the temporary dump, resolve/update the todos** — `e254c9812` (docs)

_No plan-metadata commit is included here — the orchestrator commits SUMMARY.md/STATE.md per this
task's explicit instructions._

## Verification

- `npx prettier --check src/frontend/helpers/gamepad_layouts/nintendo.ts
  src/frontend/helpers/__tests__/nintendoLayout.test.ts` → all matched files use Prettier code style.
- `npx prettier --check src/frontend/helpers/gamepad.ts` (Task 4) → all matched files use Prettier
  code style.
- `pnpm codecheck` → both tsc projects clean, zero errors (run after Task 3 and again after Task 4).
- `npx jest --selectProjects Frontend --testPathPattern "nintendoLayout|controllerButtonLabels"` →
  **2/2 suites, 52/52 tests pass** (Task 3).
- `npx jest --selectProjects Frontend --testPathPattern "gamepad"` → **2/2 suites, 4/4 tests pass**
  (Task 4 — `gamepadDisconnect.test.ts`, `gamepadRepeatTiming.test.ts`).
- `pnpm lint` → `production: PASS | tests: PASS`, 0 errors, 638 warnings (at the existing ceiling, none
  introduced by this task).
- Residue check, `! grep -nE "HID_DUMP|GAMEPAD-BTN|hidDumpPrevButtons" src/frontend/helpers/gamepad.ts`
  → **zero matches** (success).
- Positive check, `grep -nE "\[GAMEPAD\] id=" src/frontend/helpers/gamepad.ts` → **found at line 634**
  — the permanent connect diagnostic survives.
- `python meta/runPlanningGates.py` → **13/13 gates pass**, including `todo-frontmatter-gate.py` over
  both todos this task moved/edited.
- `git diff --quiet HEAD -- .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/`
  → clean, confirming `38-VERIFICATION.md`/`38-HUMAN-UAT.md` are untouched.
- `npx jest --selectProjects Frontend` (full, run separately, not chained per the plan's own note on
  why the pre-existing failure blocks a fully-`&&`-chained command) → **174/176 suites,
  3002/3005 tests pass.** The two failing suites are
  `src/frontend/screens/Game/GamePage/components/__tests__/labelSuiteI18nCensus.test.ts` (2
  assertions) and `src/frontend/screens/WebView/__tests__/storeEmbedSingleOpener.test.ts` (1
  assertion) — **both pre-existing and unrelated**, confirmed by `git status`/`git diff` showing
  neither `public/locales/en/gamelib.json` nor any WebView store-embed file touched by this task, and
  the `labelSuiteI18nCensus` failure independently documented as pre-existing in
  `260923-qe5-SUMMARY.md`, `260924-swb-SUMMARY.md`, and `260925-9de-SUMMARY.md`. Neither is this
  task's to fix.

## Self-Check

- `[ -f src/frontend/helpers/gamepad_layouts/nintendo.ts ]` → FOUND
- `[ -f src/frontend/helpers/__tests__/nintendoLayout.test.ts ]` → FOUND
- `[ -f src/frontend/helpers/gamepad.ts ]` → FOUND
- `[ -f .planning/todos/completed/2026-09-24-nonstandard-nintendo-pad-stick-clicks-and-guide-unmeasured.md ]` → FOUND
- `[ -f .planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md ]` → FOUND
- `[ -f .planning/quick/260925-ms5-measure-non-standard-nintendo-pad-stick-/260925-ms5-SUMMARY.md ]` → FOUND
- Commit `10b9e720a` (Task 1) → FOUND in `git log --oneline --all`
- Commit `44f86b509` (Task 3) → FOUND
- Commit `e254c9812` (Task 4) → FOUND

## Self-Check: PASSED
