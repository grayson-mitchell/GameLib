# Quick 260923-qe5: Fix `checkNintendo` trusting Chromium's `standard` mapping — Summary

**One-liner:** `checkNintendo` and Console Mode's `getActionButtonIndex`/`getBackButtonIndex` both
hard-coded Chromium's `standard`-mapping face-button positions with no check of the actual
`mapping` value; on the operator's PowerA Advantage Wired Controller for Nintendo Switch 2
(`mapping: ""`), all four face buttons fired the wrong action and the d-pad was dead. Fixed by
reading `mapping` and resolving both subsystems' face indices through one shared exported table,
`nintendoFaceIndices`, plus a measured hat-axis d-pad branch for the non-standard path.

## Dependency Graph

- **requires:** none (self-contained quick fix)
- **provides:** `nintendoFaceIndices(mapping)` and `nintendoHatDirection(hatValue)` exported from
  `frontend/helpers/gamepad_layouts` (barrel); `getActionButtonIndex`/`getBackButtonIndex` now take
  a required `mapping: GamepadMappingType` second argument
- **affects:** `checkNintendo` (global spatial navigation), Console Mode's `ConfirmDialog`,
  `LaunchOverlay`, `InstallOverlay`, `useGamepadInfo` (now also returns `mapping`)

## Tech Stack

- **added:** nothing (no new packages; scope fence T-qe5-SC in the plan's threat model explicitly
  forbids adding any)
- **patterns:** single shared lookup table consumed by two independent call sites (global nav +
  Console Mode) so they cannot structurally disagree about a pad — the same "single source of
  truth" pattern `nintendo.ts` already documented for the pre-existing standard-mapping A/B swap,
  now generalised to cover the mapping axis too

## Key Files

- **created:** none
- **modified:** `src/frontend/helpers/gamepad_layouts/nintendo.ts`,
  `src/frontend/helpers/gamepad.ts`, `src/frontend/screens/ConsoleMode/controller.ts`,
  `src/frontend/screens/ConsoleMode/hooks.ts`,
  `src/frontend/screens/ConsoleMode/components/ConfirmDialog/index.tsx`,
  `src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx`,
  `src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx`,
  `src/frontend/helpers/__tests__/nintendoLayout.test.ts`,
  `src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts`,
  `.planning/todos/pending/2026-09-23-checknintendo-trusts-standard-mapping-on-non-standard-pads.md`
  → `.planning/todos/completed/` (retired)

## Task 1 — the measured HID report (A1–A7), verbatim

Read live off the operator's real pad, 2026-09-23:

```
[GAMEPAD] id="PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720)" mapping="" buttons=17 axes=10
```

- **A1/A2** — `mapping` is the literal empty string `""` (non-standard, CONFIRMED not deduced),
  `buttons.length=17`, `axes.length=10`.
- **A3** — face-cap indices: **A=2, B=1, X=3, Y=0** (raw HID order `[Y, B, A, X]`) — matched the
  todo's table exactly.
- **A4** — shoulders L/R/ZL/ZR = **4/5/6/7, IDENTICAL to the standard mapping**. This retires the
  parent todo's "shifted" claim for the shoulders — it was a deduction, and it was wrong. Stick
  clicks (`buttons[10]/[11]`) were **NOT MEASURED** — a spillover todo records this gap.
- **A5** — Home/Capture: **NOT MEASURED / no observable index**. `guide` is deliberately left
  unbound on the non-standard path rather than guessing.
- **A6** — hat axis **index 9**: up `-1.00000`, right `-0.42857`, down `0.14286`, left `0.71429`,
  up-right (diagonal) `-0.71429`, **neutral `3.28571`**.
- **A7** — the up-right diagonal reads `-0.71429`, distinct from every cardinal, supporting
  cardinals-only dispatch.

**The neutral divergence, stated plainly.** The plan predicted neutral `1.28571` from the
Chromium/W3C generic-hat convention, reasoning from the documented convention as a PRIOR. The
measurement was `3.28571`. Every cardinal matched the predicted convention exactly; neutral did
not. This is the one place the prior was wrong, and it mattered: a neutral constant built on the
predicted `1.28571` would have encoded a phantom d-pad direction at rest on this exact pad —
`Math.round(1.28571 * 10) = 13`, which is not one of the four cardinal integers, so it would have
been silently absorbed by the `default: return null` branch rather than causing a visible bug, but
it would still have been the WRONG reason for the code to be correct. The implementation
(`nintendo.ts`) uses the measured `3.28571`, not the predicted value.

## Task 2 — the RED proof, and how it actually differed from the plan's prediction

**Honesty note on this section's evidence.** This SUMMARY is being written in a continuation
session, after Tasks 1–4 were already executed and committed (`84a44811d`, `adf7aeafb`,
`cb8d0a60e`, `7b209bf6b`) in a prior session. The raw jest console output from that RED run was not
preserved to a file, and reproducing it live in this session — temporarily reverting the tracked
source files to their pre-fix state and re-running jest — was attempted and then stopped: the
sandbox's destructive-action guard denied the bulk file-overwrite step used to stage the
reproduction (multiple tracked source files rewritten via shell redirection in one action), on the
grounds that it is an irreversible-looking local-destruction pattern even though it was fully
backed up and would have been reverted via `git checkout HEAD --` afterward. Rather than route
around that guard through a different tool, the RED evidence below is taken from `adf7aeafb`'s own
commit message — written by the session that performed the real RED run — which is the most
specific first-hand record available. It is NOT a re-captured verbatim jest transcript, and is
labelled as such rather than presented as one.

**BEHAVIOURAL RED (`nintendoLayout.test.ts`), against the unmodified pre-fix source:** 9
behavioural failures on VALUES — wrong or empty dispatched actions — run via
`npx jest --selectProjects Frontend`. Per the commit message this includes cases (b)–(i) and (k):
the received actions containing `'altAction'` where `'back'` was expected (the todo's measured
table reproduced deterministically, on any host, without the pad) and an empty action list for the
hat-axis d-pad cases (the dead d-pad). The six pre-existing regression cases and the four
pre-existing `controllerButtonLabels` cases were verified byte-identical/value-identical and
stayed green throughout — the RED is scoped to the new cases only.

**SIGNATURE-ABSENCE RED (`controllerButtonLabels.test.ts`) — a DIFFERENT KIND of evidence than the
plan predicted, and the plan's literal claim was wrong.** The plan's Task 2 `<action>` stated this
suite's RED would be a ts-jest COMPILE error. What actually happened, per the commit message: 2
RUNTIME failures — a value mismatch and a `TypeError` from calling the not-yet-exported
`nintendoFaceIndices` — because this project's root `tsconfig.json` sets `isolatedModules: true`,
so ts-jest TRANSPILES per file without type-checking; a call with the wrong arity or an import of a
non-existent export is not caught at transpile time, only at test runtime. The compile-time RED
the plan predicted DOES exist, but only under `pnpm codecheck` (`tsc --noEmit`), which the commit
message records as independently confirming: `TS2554` ("Expected 1 arguments, but got 2") and
`TS2305` ("has no exported member 'nintendoFaceIndices'") across all 16 two-argument call sites.
**Both are real and both are reported here** — the runtime TypeError under `npx jest` and the
`TS2554`/`TS2305` compile errors under `pnpm codecheck` — because presenting only the plan's
predicted compile-error framing would misdescribe what `npx jest` alone actually shows on this
project's ts-jest configuration.

**Which cases were GREEN pre-fix, and why that is not RED evidence.** Four cases were green before
any source fix landed, per the plan's own case design, and must not be read as proof the fix works:
- Case (c), "the printed A cap confirms rather than backing", is a weak not-`'back'` assertion (the
  positive `mainAction` dispatch is invisible in this DOM-less harness), so it is a WEAKER claim
  than a true positive check.
- Cases (h) and (i), the two absence-of-dispatch hat cases (diagonal silence, neutral silence),
  hold trivially pre-fix because the pre-fix code never reads the hat axis at all — absence of a
  read is absence of dispatch, by construction, not by correctness.
- Case (j), "a standard-mapped Nintendo pad still reads its d-pad from `buttons[12-15]`", is
  explicitly a CONTRACT-PRESERVATION case, labelled as such in the test file's own comment, and is
  green pre-fix by design since the standard path was never broken.

**Case (e), "rightClick follows the printed X cap", needed a harness amendment — the plan as
written contained a test that could never have gone green.** `rightClick` reaches
`window.api.gamepadAction` only when `metadata()` is truthy, and `metadata()` resolves through
`currentElement()` → `document.querySelector(':focus')`, which is permanently `null` in this
project's node-environment (no jsdom) jest harness — there is no focused DOM element, ever, in
that environment. The orchestrator's resolution (recorded in `cb8d0a60e`'s commit message) was an
OPT-IN, single-case focused-element stub scoped to exactly this one case, deliberately not applied
to any other case in the file, so the six byte-identical regression cases could not be perturbed by
a stub that exists to unblock one assertion.

Task 1's instrumentation (`84a44811d`, the `[GAMEPAD]`/`HID_DUMP` diagnostics) was present in the
working tree during the RED run and is inert to it — it only calls `window.api?.logInfo?.()` — so
the RED is attributable to the layout functions alone.

## Task 3 — what changed

`nintendo.ts` gained an exported `nintendoFaceIndices(mapping: GamepadMappingType)` returning
`{ action, back, alt, menu }`, backed by two rows: `STANDARD_FACE_INDICES` (action 1, back 0, alt
2, menu 3 — a pure refactor of what shipped before, values unchanged) and `RAW_HID_FACE_INDICES`
(action 2, back 1, alt 0, menu 3, from A3). `'xr-standard'` is deliberately treated as non-standard
rather than adding a third branch, per the plan's decision record. `nintendoHatDirection(hatValue)`
reads `Math.round(hatValue * 10)` against the A6 constants (up `-10`, right `-4`, down `1`, left
`7`), returning `null` for diagonals, neutral, and `NaN` (an absent axis).

`checkNintendo` takes `mapping` as a required fifth parameter and resolves its four face buttons
through `nintendoFaceIndices(mapping)` instead of hard-coded 0/1/2/3. Its d-pad branches: standard
mapping reads `buttons[12..15]` exactly as before; non-standard reads the hat axis at index 9 and
dispatches cardinals only via `nintendoHatDirection` — it never reads `buttons[12..15]`, since on
raw HID those are Home/Capture, not directions. `guide` binds to `buttons[16]` on the standard path
only; A5 found no Home/Capture index, so `guide` dispatches nothing on the non-standard path.

`gamepad.ts` passes `controller.mapping` as the fifth argument at the single existing
`checkNintendo` call site — no new branch in the `id.match()` chain.

`ConsoleMode/controller.ts`'s `getActionButtonIndex`/`getBackButtonIndex` now take
`(layout, mapping)`, both required with no default, resolving `'nintendo'` through the SAME
`nintendoFaceIndices` table via the barrel import. `getActionButtonLabel`/`getBackButtonLabel`
deliberately keep ONE parameter — the printed cap is a property of the plastic, not the HID report.
`useGamepadInfo` in `hooks.ts` now also returns `mapping`, and the five call sites in
`ConfirmDialog`, `LaunchOverlay`, and `InstallOverlay` (×2) all destructure and pass it, gated by
`pnpm codecheck` catching any missed site since the parameter is required.

**`ConsoleMode/controller.ts` was under-scoped by the original todo.** It was listed in the todo's
`files:` as a plain reference ("related file"), but it carried a SECOND, INDEPENDENT instance of
the exact same standard-mapping assumption `checkNintendo` had — with no shared code between them
before this fix. It was fixed in the same change, through the same table. A `files:` list is not a
blast-radius ceiling.

## Task 4 — live re-confirmation on the operator's real pad

The operator ran Task 4's checks 1–8 on the PowerA Advantage Wired Controller for Nintendo Switch
2. **Reported result: first half passes, second half passes.**

- Checks 1–6 (games library / global spatial navigation via `checkNintendo`): d-pad up/down/left/
  right move selection; the cap printed A confirms (does not launch); the cap printed B goes back;
  the cap printed Y does its hint-bar-promised action; the cap printed X opens the context menu;
  every glyph in the `ControllerHints` bar now agrees with the acting button. This is the todo's
  table (A launches / B opens details / Y backs / X menus) fully reversed.
- Checks 7–8 (Console Mode: confirm dialog, install overlay): A confirms/acts, B dismisses, on both
  surfaces.

Both subsystems act on the correct caps, which is the confirmation that Task 3's shared-table
wiring genuinely reached Console Mode rather than only the global-navigation half.

## Honesty about reach

**Runs anywhere (synthetic pads), proves ROUTING AND MAPPING LOGIC only:** every case in
`nintendoLayout.test.ts` and `controllerButtonLabels.test.ts`. These construct fake `Gamepad`
objects from the HID report Task 1 measured. They prove the code does the right thing GIVEN that
report. They prove nothing about the report itself.

**Needed the operator's specific pad:** Task 1's A1–A7 measurements and Task 4's live checks 1–8.
The `mapping` value, the hat axis index and its values, and the face-cap indices are DEVICE facts;
no synthetic test can produce them and no other machine in this project has this pad.

**Proven by neither, and not claimed:**
- That every non-standard Nintendo-style pad reports the same raw HID order or the same hat axis
  index. Only ONE device of the non-standard class has been observed. A different third-party
  Nintendo-style pad with a different raw order or hat index would still be wrong, and this change
  cannot detect that.
- That non-standard PlayStation, GameCube, N64-clone, or Genius pads are correct — untouched and
  never measured; test case (n) asserts only that this change did not MOVE them.
- That `guide` is correct on a non-standard pad — A5 found no Home/Capture index, so it stays
  unbound, not guessed.
- That the stick-click indices (`buttons[10]/[11]`) are correct on a non-standard pad — A4 measured
  only the shoulders (matched, 4/5/6/7); stick clicks were never pressed during the capture. See
  spillover todo below.
- Anything about Phase 38 SCORES. This change makes `38-C01` (d-pad half), `38-C03`, `38-C04`, and
  `38-C08` SCOREABLE. `38-VERIFICATION.md` and `38-HUMAN-UAT.md` are the orchestrator's separate
  live sitting and are NOT edited or scored here.

## Deviations from Plan

### Auto-fixed / plan-corrected issues

**1. [Rule 1 — plan's own literal claim was wrong] `controllerButtonLabels.test.ts`'s RED is not a
ts-jest compile error under `npx jest`.** The plan's Task 2 `<action>` predicted a compile-time RED
for the signature-absence cases. The project's `isolatedModules: true` tsconfig setting means
ts-jest transpiles without type-checking, so the actual `npx jest` RED was 2 runtime failures
(value mismatch + TypeError), not a compile error. The compile-time RED the plan predicted is real
but lives under `pnpm codecheck` instead. Both are now recorded, correctly labelled, above.

**2. [Rule 3 — blocking issue] Case (e) `rightClick` was structurally unobservable in the DOM-less
harness as originally specified.** `metadata()` needs a focused DOM element that this
node-environment jest project can never provide. Resolved with an opt-in, single-case
focused-element stub, scoped to that one case only (see Task 2 section above). Applied by the prior
session executing Task 2/3; recorded here since it changes what the plan's case (e) actually tests.

### None applicable in Task 5 itself

Task 5's own scope (delete Piece B, retire the todo, file spillovers) required no deviation from
the plan.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced by this
change.

## Threat Flags

None. This change introduces no new network endpoint, auth path, file-access pattern, or
trust-boundary schema change beyond what the plan's own `<threat_model>` already registered
(T-qe5-01 through T-qe5-04, T-qe5-SC) — all of which were addressed as designed: every new read is
optional/guarded, the temporary dump is deleted with a grep proving no residue, and no package was
installed.

## Multiple-simultaneous-pad limitation (recorded, not fixed)

`useGamepadInfo` reads `layout` AND `mapping` from the FIRST connected pad, while
`useGamepadButtonPress`/`useGamepadButtonHold` apply the resulting index to EVERY connected pad.
With a standard Xbox pad and a non-standard Nintendo pad both connected, one of them gets the
other's indices. This is PRE-EXISTING (already true of `layout` before this change), recorded in a
comment at `useGamepadInfo`, and deliberately not fixed — a per-pad resolution is a separate, wider
change touching every consuming hook.

## Spillover Todos Filed

1. `.planning/todos/pending/2026-09-24-checkn64clone1-dpad-code-contradicts-its-own-comment.md` —
   `checkN64Clone1`'s d-pad code (`nintendo.ts:276-279`) contradicts its own documented hat-value
   table (`padDown`/`padRight` are bound to the down-right/down-left diagonal values instead of the
   true down/right cardinals). Previously suspected from reading; now MEASURED as correct
   convention by Task 1's live hat-axis capture on a real pad (a different device's hat, but the
   same Chromium/W3C convention `checkN64Clone1`'s own comment already documents). `severity:
   minor`, `platform: any`, `ready: code`. No N64-clone hardware was available to confirm the live
   symptom.
2. `.planning/todos/pending/2026-09-24-nonstandard-nintendo-pad-stick-clicks-and-guide-unmeasured.md`
   — the stick-click indices (`buttons[10]/[11]`) and Home/Capture were never captured during
   Task 1's live session, so `guide` is deliberately unbound on the non-standard path and
   `38-C04`'s stick-click half stays unconfirmed by measurement. `severity: minor`, `platform:
   any`, `ready: human` — needs the operator and the specific pad, not code. Notes that the
   permanent `[GAMEPAD]` line makes a future connect-time capture cheap, but Piece B's per-frame
   dump is gone and would need re-adding for a future button/axis-level capture.

**No todo filed for A4's shoulder finding** — the measurement showed shoulders at 4/5/6/7, the SAME
as standard, so the parent todo's "shifted" claim was simply wrong and there is nothing to fix.
Recorded in the retired todo's Resolution section that this retires the claim and that `38-C03` was
therefore always scoreable.

## Deferred Issues

None new from Task 5. The pre-existing, out-of-scope `labelSuiteI18nCensus.test.ts` failure (2
assertions) recorded during Task 3's verify remains logged in `deferred-items.md` and untouched —
confirmed unrelated (`git diff` against the base commit for `src/frontend/screens/Game/` is empty).

## Verification (Task 5)

- `grep -nE "HID_DUMP|GAMEPAD-BTN|GAMEPAD-AXIS" src/frontend/helpers/gamepad.ts` → no matches
  (confirmed via `! grep -nE ...` returning success).
- `npx prettier --check` on `gamepad.ts` and the retired todo path → both pass (the `.planning`
  check is vacuous per `.prettierignore`, run per convention only).
- `pnpm codecheck` → both tsc projects clean.
- `npx jest --selectProjects Frontend` → 172/173 suites pass, 2929/2931 tests pass; the one failing
  suite is the pre-existing, unrelated `labelSuiteI18nCensus.test.ts` documented above.
- `pnpm lint` → `production: PASS | tests: PASS` (0 errors on both ceilings; pre-existing warnings
  only, none introduced by this change).
- `python meta/runPlanningGates.py` → 12/12 gates pass, including `todo-frontmatter-gate.py` over
  the two new spillover todos.

## Self-Check

- `[ -f src/frontend/helpers/gamepad.ts ]` → FOUND
- `[ -f .planning/todos/completed/2026-09-23-checknintendo-trusts-standard-mapping-on-non-standard-pads.md ]` → FOUND
- `[ ! -f .planning/todos/pending/2026-09-23-checknintendo-trusts-standard-mapping-on-non-standard-pads.md ]` → CONFIRMED ABSENT
- `[ -f .planning/todos/pending/2026-09-24-checkn64clone1-dpad-code-contradicts-its-own-comment.md ]` → FOUND
- `[ -f .planning/todos/pending/2026-09-24-nonstandard-nintendo-pad-stick-clicks-and-guide-unmeasured.md ]` → FOUND
- Commit `84a44811d` (Task 1 instrumentation) → FOUND in `git log --oneline --all`
- Commit `adf7aeafb` (Task 2 RED tests) → FOUND
- Commit `cb8d0a60e` (Task 3 fix) → FOUND
- Commit `7b209bf6b` (Task 3 deferred-items doc) → FOUND
- Commit `0978dba81` (Task 5 Piece B removal) → FOUND

## Self-Check: PASSED
