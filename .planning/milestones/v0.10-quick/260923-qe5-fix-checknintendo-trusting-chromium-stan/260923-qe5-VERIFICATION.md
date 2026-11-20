---
quick: 260923-qe5
verified: 2026-09-24T00:00:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Quick 260923-qe5: `checkNintendo` trusting Chromium's `standard` mapping — Verification Report

**Goal:** Fix `checkNintendo`'s (and Console Mode's `getActionButtonIndex`/`getBackButtonIndex`)
unchecked trust of Chromium's `standard` mapping, which made all four face buttons and the d-pad
act wrong on a non-standard-mapped Nintendo pad, WITHOUT regressing standard-mapped Nintendo pads.

**Verified:** 2026-09-24
**Status:** passed
**Method:** Direct source read (not SUMMARY-trusting), re-run of every automated gate the plan
names, `git diff` against the plan's base commit (`aaae8a1d2`), and line-level cross-check of
commit messages against SUMMARY.md's quoted evidence.

## Goal Achievement

### Observable Truths (hardest-first, per the task brief)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `nintendoFaceIndices(mapping)` exists; `checkNintendo` resolves face indices through it, not hard-coded; non-standard path reads the hat axis; standard path unchanged behaviourally | VERIFIED | `nintendo.ts:107-117` (table fn), `:186-199` (checkNintendo resolves via `faceIndices`), `:209-231` (mapping branch: `buttons[12-15]` on standard, hat axis `axes[9]` via `nintendoHatDirection` on non-standard). Diff vs `aaae8a1d2` shows `STANDARD_FACE_INDICES = {action:1,back:0,alt:2,menu:3}` reproduces the exact pre-fix hard-coded assignment (`B=buttons[0], A=buttons[1], Y=buttons[2], X=buttons[3]`) bit-for-bit. |
| 2 | Console Mode's `getActionButtonIndex`/`getBackButtonIndex` resolve through the SAME exported table, not a parallel copy; `mapping` param is required, no default | VERIFIED | `controller.ts:1-4` imports `nintendoFaceIndices` from the barrel; `:53-61` — both functions call `nintendoFaceIndices(mapping).action`/`.back` for `'nintendo'`, no literal duplication; signature `(layout: ControllerLayout, mapping: GamepadMappingType)` has no default. `pnpm codecheck` ran clean, which is only possible if every call site supplies both args (proving no site was missed). Case (p) in `controllerButtonLabels.test.ts:159-171` asserts the invariant directly and passes. |
| 3 | Measured constants (A=2,B=1,X=3,Y=0; hat axis 9; up -1, right -0.42857, down 0.14286, left 0.71429, **neutral 3.28571 not 1.28571**) match source | VERIFIED | `nintendo.ts:100-105` (`RAW_HID_FACE_INDICES`), `:124` (`NON_STANDARD_HAT_AXIS = 9`), `:126-139` comment records exactly these values and explicitly flags neutral `3.28571` as diverging from the predicted `1.28571`; `nintendoHatDirection`'s switch (`:143-151`) implements `-10→up, 1→down, 7→left, -4→right`, matching `Math.round(v*10)` of the measured cardinals. Test constants in `nintendoLayout.test.ts:78-83` use the same literal values. |
| 4 | SUMMARY is honest about: neutral divergence; wrong ts-jest-compile-RED prediction; 4 pre-fix-GREEN cases; case (e) rightClick unobservability + opt-in stub; reach limits | VERIFIED | SUMMARY.md lines 64-72 (neutral divergence, stated plainly with the math for why it mattered), 99-112 (labelled "a DIFFERENT KIND of evidence than the plan predicted, and the plan's literal claim was wrong" — both the runtime TypeError and the `tsc` compile errors are reported, correctly separated), 114-124 (four GREEN-pre-fix cases c/h/i/j named and explained as non-evidence), 126-134 (case (e)'s structural impossibility and the scoped opt-in stub), 190-215 ("Honesty about reach" section, matching the plan's `<honesty_about_reach>` almost verbatim). Independently re-derived the RED count: of the plan's 12 new behavioural cases, exactly 4 (c, h, i, j) are pre-fix-green by construction, leaving 9 — matches SUMMARY's "9 behavioural failures" exactly. |
| 5 | The disclosed RED-capture deviation is honestly labelled, not smoothed over | VERIFIED | SUMMARY.md lines 76-88, headed "Honesty note on this section's evidence," states plainly: continuation session, raw jest output not preserved, live re-capture attempted and stopped by the sandbox's destructive-action guard, no attempt to route around it, and the RED text below is "taken from `adf7aeafb`'s own commit message... NOT a re-captured verbatim jest transcript, and is labelled as such." Cross-checked against `git show -s --format=%B adf7aeafb`: the commit message does contain exactly the RED counts and category breakdown SUMMARY quotes (9 behavioural VALUE failures; 2 runtime failures, not a compile error, with `TS2554`/`TS2305` under `pnpm codecheck` separately). No overclaim found. |
| 6 | Scope fence: `38-VERIFICATION.md`/`38-HUMAN-UAT.md`, `checkN64Clone1` body, `isNintendoControllerId`, `XBOX_ID`, `detectControllerLayout`, `ControllerHints` all untouched | VERIFIED | `git diff aaae8a1d2 HEAD -- .planning/phases/38-VERIFICATION.md .planning/phases/38-HUMAN-UAT.md` → empty. Full `git diff --stat aaae8a1d2 2bc6275d0` (219 files, mostly unrelated concurrent-session work) contains no entry for `components/UI/ControllerHints`. `git diff aaae8a1d2 HEAD -- nintendo.ts` shows the diff hunk ends before `checkN64Clone1`; its body carries zero changes (only a comment elsewhere *references* it). `isNintendoControllerId`/`XBOX_ID`/`NINTENDO_ID`/`detectControllerLayout` all outside every diff hunk. |
| 7 | Temporary `HID_DUMP` per-frame dump fully removed; permanent `[GAMEPAD]` line survives, guarded | VERIFIED | `grep -nE "HID_DUMP|GAMEPAD-BTN|GAMEPAD-AXIS" src/frontend/helpers/gamepad.ts` → zero matches (re-run live, not trusted from SUMMARY). `gamepad.ts:626-643` — `addgamepad` still emits `[GAMEPAD] id=... mapping=... buttons=... axes=...` via `window.api?.logInfo?.(...)` inside try/catch, with a comment recording why it's permanent. Full frontend jest run (2929/2931 tests, 172/173 suites) shows no throw from the three window.api-stubbing harnesses. |
| 8 | Todo retired correctly; 2 spillover todos filed with correct frontmatter order/values; no shoulder-index todo filed | VERIFIED | `.planning/todos/pending/2026-09-23-checknintendo*` absent; `.planning/todos/completed/2026-09-23-checknintendo*` present with `status: completed`, `resolved: 2026-09-23`, `resolved_by: quick-260923-qe5`, and a Resolution section quoting the measured A1-A7 report verbatim. Two spillover todos (`2026-09-24-checkn64clone1-...`, `2026-09-24-nonstandard-nintendo-pad-stick-clicks-and-guide-unmeasured.md`) both carry `severity:`/`platform:`/`ready:` in that order, bare lowercase (`minor`/`any`/`code` and `minor`/`any`/`human`). No todo filed about shoulder indices — the one mention of "shoulder" in the stick-clicks todo confirms they matched standard (4/5/6/7), not that they need fixing. `python meta/runPlanningGates.py` → 12/12 passed, including `todo-frontmatter-gate.py`. |

**Score:** 8/8 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/frontend/helpers/gamepad_layouts/nintendo.ts` | shared face-index table + mapping-aware `checkNintendo` | VERIFIED | `nintendoFaceIndices` exported (`:107`), `NintendoFaceIndices` type exported (`:73`), `checkNintendo` takes required 5th `mapping` param (`:184`) |
| `src/frontend/screens/ConsoleMode/controller.ts` | index helpers resolving through shared table | VERIFIED | imports `nintendoFaceIndices` from barrel, both helpers call it, `mapping` required |
| `src/frontend/helpers/__tests__/nintendoLayout.test.ts` | behavioural coverage of both mappings incl. hat-axis d-pad | VERIFIED | 6 regression cases unedited + 12 new cases (b-k), all pass live (`npx jest` run) |
| `src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts` | label/index agreement extended to non-standard mapping | VERIFIED | 4 original cases + 5 new incl. invariant case (p), all pass live |
| `.planning/todos/completed/2026-09-23-checknintendo-...md` | retired todo with resolution + measured HID report | VERIFIED | present, `resolved_by: quick-260923-qe5`, Resolution section quotes A1-A7 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `gamepad.ts updateStatus` | `checkNintendo`'s mapping param | `controller.mapping` passed at the dispatch site | WIRED | `gamepad.ts:582`: `checkNintendo(buttons, axes, index, checkAction, controller.mapping)` |
| `ConsoleMode/controller.ts getActionButtonIndex` | `nintendoFaceIndices` in `nintendo.ts` | barrel import, direct call | WIRED | `controller.ts:56,61` call `nintendoFaceIndices(mapping).action/.back` |
| `ConsoleMode/hooks.ts useGamepadInfo` | 5 call sites (ConfirmDialog ×2, LaunchOverlay ×1, InstallOverlay ×2) | `mapping` threaded through | WIRED | Confirmed by live grep of all 5 sites — every one destructures `mapping` from `useGamepadInfo()` and passes it to `getActionButtonIndex`/`getBackButtonIndex` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Nintendo layout + labels suites pass live | `npx jest --selectProjects Frontend --testPathPattern "nintendoLayout\|controllerButtonLabels"` | 2 suites, 36/36 tests pass | PASS |
| Full frontend suite unaffected elsewhere | `npx jest --selectProjects Frontend` | 172/173 suites, 2929/2931 tests pass; sole failure is pre-existing unrelated `labelSuiteI18nCensus.test.ts` (confirmed via empty `git diff fe936ba47 HEAD -- src/frontend/screens/Game/`) | PASS |
| Type-safety gate (proves no call site missed) | `pnpm codecheck` | clean, both tsc projects | PASS |
| Lint ceilings | `pnpm lint` | `production: PASS \| tests: PASS`, 0 errors | PASS |
| Formatting on every exact path written | `npx prettier --check <9 exact paths>` | all pass | PASS |
| Residue check | `grep -nE "HID_DUMP\|GAMEPAD-BTN\|GAMEPAD-AXIS" gamepad.ts` | zero matches | PASS |
| Planning gates | `python meta/runPlanningGates.py` | 12/12 passed | PASS |

### Human/Live Verification (recorded evidence, not re-run — per task instructions)

Task 4's live checks 1-8 on the operator's PowerA pad were run by the operator during execution
(not by this verifier). Per SUMMARY.md and the task's provided "LIVE RESULT" context, both halves
(games library / global nav, and Console Mode overlays) passed. This verifier cannot re-run a
physical device check and treats it as recorded evidence per the task brief — SUMMARY.md's
description of the live result (lines 174-188) matches the "LIVE RESULT" context given by the
orchestrator without embellishment (no additional claims of correctness beyond what the operator
reported; the "proven by neither" section explicitly limits the claim to the one measured device).

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers, no empty implementations, no
hardcoded-empty stubs in any of the 9 modified source/test files. `Known Stubs: None` in SUMMARY.md
matches direct inspection.

### Scope Fence Confirmation

`git diff aaae8a1d2 HEAD -- .planning/phases/38-VERIFICATION.md .planning/phases/38-HUMAN-UAT.md`
is empty. `checkN64Clone1`'s body (`nintendo.ts:235-288`) carries zero diff hunks — only a comment
elsewhere references it. `isNintendoControllerId`, `NINTENDO_ID`, `XBOX_ID`, `detectControllerLayout`,
and `components/UI/ControllerHints` all fall outside every diff hunk in the full 219-file diffstat
between `aaae8a1d2` and `2bc6275d0`.

### Gaps Summary

None found. Every observable truth in the task brief resolved to VERIFIED against direct source
inspection, live gate re-execution, and commit-message cross-checks — not SUMMARY.md's narrative
alone. The one process deviation (RED evidence sourced from a commit message rather than a
re-captured transcript, due to a sandbox destructive-action denial) is disclosed honestly in
SUMMARY.md, labelled correctly, and independently corroborated: recomputing the plan's own test
case (b)-(k) design by hand against the pre-fix source predicts exactly 9 behavioural failures and
4 pre-fix-green cases, which is exactly what SUMMARY.md reports the commit message said.

The single pre-existing unrelated jest failure (`labelSuiteI18nCensus.test.ts`) is confirmed
genuinely unrelated: `git diff fe936ba47 HEAD -- src/frontend/screens/Game/` is empty, and this
task never modifies any file under that directory.

---

_Verified: 2026-09-24_
_Verifier: Claude (gsd-verifier)_
