# Quick 260925-9de: Fix `checkNintendo`'s axis reads — right stick dead on non-standard Nintendo pads — Summary

**One-liner:** `checkNintendo` read the right stick's vertical axis unbranched at `axes[3]`, above
the mapping check; on the operator's PowerA Advantage Wired Controller for Nintendo Switch 2 the
real axis is `axes[5]` — MEASURED live, not `axes[4]` (`checkGamecube`'s row for a different
device) and not "one past `axes[3]`". Fixed by branching all four stick-axis reads through a new
`nintendoStickAxes(mapping)` table, mirroring the shape `nintendoFaceIndices` already established
for the face buttons.

## Honesty note on this SUMMARY's evidence

This Task 6 execution is a fresh session with no first-hand memory of Task 1's operator sitting —
Tasks 1–3 were executed and committed (`75e3dc18f`, `88cd2e4b7`, `4e1ec7f1b`) by prior sessions, and
Task 5's live checkpoint result was relayed to this session by the orchestrator. Exactly as
`260923-qe5-SUMMARY.md` records for the same class of gap: the raw `[GAMEPAD-AXIS]`/
`[GAMEPAD-SCROLL]` console/log transcript from the operator's live sitting was not preserved to a
file. M1–M3 below are reconstructed from the most specific first-hand record available — the
values those prior sessions wrote into committed source comments (`nintendo.ts`,
`nintendoLayout.test.ts`) and commit messages — not a re-captured verbatim log. Where a value is
not recorded anywhere in the tree, that gap is stated explicitly rather than invented.

## M1–M4, and which `<conditionality>` row applied

- **M1 — the right stick's real Y-axis index and sign.** `axes[5]`. Pushing the right stick fully
  UP drove axis 5 NEGATIVE through three observed samples — `-0.14510 -> -0.45882 -> -0.97647` —
  then fully DOWN drove it back POSITIVE (recorded verbatim in `nintendo.ts`'s
  `RAW_HID_STICK_AXES` comment and `nintendoLayout.test.ts`'s `RIGHT_STICK_Y_NON_STANDARD`
  comment). UP is therefore NEGATIVE on axis 5, the same sign convention the left stick's
  `axes[1]` already uses — no per-device sign inversion was needed.
- **M2 — right-stick X re-confirmed.** `axes[2]`, re-confirmed on this instrument via the
  `[tauriGamepadInput] unhandled gamepad action "rightStickLeft"` warning still reaching the
  `default` arm at `tauriGamepadInput.ts:394` (Task 1 step d / step e cross-check).
- **M3 — resting baseline.** Not preserved as a full one-shot ten-axis transcript (the gap named
  above). What IS recorded, for every axis `checkNintendo`'s stick reads and hat read actually
  compare against a threshold: `axes[0]=0.00392`, `axes[1]=0.00392`, `axes[2]=0.00392`,
  `axes[5]=0.00392` — all resting well inside the `±0.5` dispatch threshold, which is why Task 2's
  optional case (G) ("a resting deflected axis dispatches no right-stick action") was deliberately
  **not written** — no axis `checkNintendo`'s stick logic reads warrants it. The hat axis (index 9)
  rests at `3.28571`, outside `±0.5`, but it is never compared against that threshold — only
  `nintendoHatDirection`'s rounded-value switch reads it, so it does not warrant case (G) either.
  **The load-bearing part of M3, stated by the orchestrator relaying the prior session's finding
  and worth recording verbatim because the plan itself flagged it as the likely trap:** the plan
  named `axes[4]` — `checkGamecube`'s row for a different device in the same file — as "the most
  inviting wrong answer." Measurement showed `axes[4]` **never moved once across the whole
  sitting** — zero samples, resting at exactly `0.00000`, identically to `axes[3]`. A plan that had
  guessed `axes[4]` (by symmetry with `checkGamecube`, or by "one past `axes[3]`") would have
  produced a principled-looking fix that was still completely dead on this pad.
- **M4 — no `[GAMEPAD-SCROLL]` line appeared** during vertical right-stick motion. `doScroll` is
  reached only if `rightStickUp`/`rightStickDown` actually dispatch, which requires `axes[3]` to
  cross `±0.5` — and `axes[3]` rests at `0.00000` and never moved (see M3), so the scroll path was
  never entered pre-fix. This is the correct reading on an independent instrument, agreeing with
  M1: axis 3 is not the stick.

**Decision-table row applied:** M1 an index **other than 3** (it is 5), M4 **no `[GAMEPAD-SCROLL]`
line** → **H-A CONFIRMED.** "The code reads an axis the stick does not drive. H-B is UNTESTED — the
scroll path was never reached, so nothing has been learned about it either way." Per that row:
**Tasks 2, 3, 5, 6 ran. Task 4 did NOT run** (confirmed directly by the orchestrator: "Task 4 did
NOT run (H-A confirmed)"). `nintendo.ts` was the defective file; `tauriGamepadInput.ts`'s `doScroll`
target-resolution logic was never touched by a fix, only by the now-removed diagnostic.

## H-A vs H-B: what was true, and where the plan's own framing needed correcting

**H-A was true; H-B stays UNTESTED, not disproven — this must not be overstated.** With the axis
index corrected the scroll path now works end to end (Task 5's checks 1–3), so no evidence was ever
gathered about `doScroll`'s target-resolution behaviour under a genuinely failing target
resolution. It would be wrong to write that `doScroll` was "verified healthy" — it was simply never
exercised under the failure condition H-B describes, because H-A alone fully explains the dead
stick.

**What the plan itself got wrong, stated plainly rather than smoothed over:** the plan's
`<conditionality>` section flagged `axes[4]` as "the most inviting wrong answer" and warned not to
inherit it from `checkGamecube`'s row for the same device family — correctly anticipating that a
plausible-looking deduction would be wrong. What it did NOT anticipate is how wrong: the measured
answer was `axes[5]`, one further out than even the flagged trap, and `axes[4]` was not merely a
worse guess than `axes[5]` — it was completely inert on this pad (zero samples moved, resting
exactly at `0.00000`). A plan that had substituted `axes[4]` for `axes[3]` by symmetry or
"next-index" reasoning would have shipped a fix that looked principled and changed nothing.

## RED text, labelled BEHAVIOURAL

**Source (reconstructed, not a re-captured jest transcript — see the honesty note above):**
Task 2's own commit message (`88cd2e4b7`), written by the session that ran the RED proof, is the
most specific first-hand record available:

> Cases (A)/(B)/(C) are RED against pre-fix source: (A)/(B) fail by absence (dispatched array empty
> because axes[3] never moves), (C) fails by presence (moveAxis(POWERA_ID, 3, -1, ...) still
> dispatches rightStickUp pre-fix). Cases (D)/(E)/(F) are GREEN pre-fix by design — contract
> preservation for standard-mapped pads, the horizontal no-op, and the left stick — and are not
> claimed as RED evidence. codecheck is clean, confirming a pure behavioural red under
> isolatedModules. The 19 pre-existing it() cases are character-identical and green.

This is a **BEHAVIOURAL, value-based RED** (cases fail on the CONTENTS of the dispatched-action
array, not on an import/arity error), exactly as `<action>`'s prediction described: cases (A)/(B)
failed because pre-fix `checkNintendo` reads `axes[3]`, which those cases leave at `0`, so nothing
crosses `±0.5` and nothing dispatches; case (C)'s contrast direction — failing by PRESENCE of
`'rightStickUp'` where the assertion expected absence — is what proves the defect is a wrong INDEX
rather than a dead code path. The accompanying `pnpm codecheck` result was **CLEAN — zero TS
errors**, which is itself the signature of a pure behavioural red under this project's
`isolatedModules: true` ts-jest configuration (arity/export errors would surface as compile errors,
not runtime `TypeError`s, under that setting) — recorded per the plan's explicit instruction to
report the codecheck result alongside the jest red so the red is correctly labelled.

## Cases GREEN pre-fix, and why that is not RED evidence

- **(D) — standard-mapped regression bar** (`SWITCH_PRO_ID` right stick up/down/left at `axes[3]`/
  `axes[2]`): green before any fix landed because the standard path was never broken. Labelled
  CONTRACT-PRESERVATION in the test file's own comment.
- **(E) — right-stick horizontal still dispatches** (`axes[2]` on the non-standard pad): green
  pre-fix because `axes[2]` was never the bug — `rightStickLeft`/`rightStickRight` already reached
  `window.api.gamepadAction`; the horizontal no-op is downstream, in the PRELOAD switch's `default`
  arm, out of scope. This case asserts DISPATCH, not effect.
- **(F) — left stick unmoved** (`axes[0]`/`axes[1]` on the non-standard pad): green pre-fix because
  the fix touches the axis-read block serving all four sticks; this pins that only the one axis
  meant to move, moved.
- **(G) was never written**, per M3 above: no axis `checkNintendo`'s right-stick logic reads rests
  outside `±0.5`, so there is no spurious-dispatch condition to pin. Manufacturing a case here to
  look thorough was explicitly against the plan's own instruction, and the test file's comment says
  so directly.

## Task 5 — live check results 1–8, set against the pre-fix symptom

Pre-fix symptom, measured 2026-09-25 before any code changed: **"right stick UP/DOWN: no scroll
whatsoever."**

Operator's own words, relayed 2026-09-25: **"right stick now scrolls up and down, ran all
regression checks all pass."**

- **Checks 1–3 — PASS.** Right stick UP scrolls the library toward the TOP; DOWN scrolls toward the
  BOTTOM; the direction matches the push, both ways, repeatably. This is `38-C02`'s substance.
- **Checks 5–8 — ALL PASS.** Left stick moves focus in all four directions; d-pad moves focus in
  all four directions; the A/B/X/Y caps and every `ControllerHints` glyph agree with what its
  button does; right stick LEFT/RIGHT is still the by-design no-op (still prints the `unhandled
  gamepad action` warning) — the scope fence around the horizontal no-op was not crossed.
- **Check 4 — GAP, not a pass.** The `[GAMEPAD-SCROLL]` diagnostic line was **NOT captured
  verbatim** during the live sitting. Recorded honestly as a gap rather than silently dropped. It
  does not block the plan's conclusion, for a reason stated as an INFERENCE, not a captured
  reading: check 4's purpose was to distinguish a correctly-resolved scrollable target from a
  `usedFallback=true` resolution, and checks 1–3 passing already answers that question by a
  different route — in this app `document.scrollingElement` is the 830px viewport-sized
  `body`/`html`, while `main.content` is the real scroller (evidenced by a `[BLANKPROBE]` line in
  `gamelib.log`: `main.content` at `1076.00x788.00` with `overflow: auto`, containing a
  `div.gameList` of `1066.00x24922.81`). A fallback resolution would therefore have scrolled
  NOTHING visible. Visible, correct, repeatable scrolling entails the target resolved to a
  genuinely scrollable element. This is inference from checks 1–3, not a captured `usedFallback`
  reading, and is labelled as such.
- Both jest projects were re-run as part of Task 5's automated verify: `Frontend` and `Preload`
  both green (see Verification below for exact counts, including the one pre-existing unrelated
  failure).

## `<honesty_about_reach>` split, carried from the plan

**Runs anywhere (synthetic pads and `FakeElement` doubles), proves DISPATCH AND RESOLUTION LOGIC
only:** every case in `nintendoLayout.test.ts` and `gamepadAction.test.ts`. They construct fake
`Gamepad` objects and fake DOM nodes from the report Task 1 measured. They prove the code does the
right thing GIVEN that report. They prove NOTHING about the report itself.

**Needed the operator's specific pad and the running app:** M1–M4 and Task 5's checks 1–8. The axis
index, its values, the resting baseline, and the live scroll-target behaviour are DEVICE and DOM
facts; no synthetic test can produce them and no other machine in this project has this pad.

**Proven by neither, and must NOT be claimed:**
- That every non-standard Nintendo-style pad reports its right stick on axis 5. Only ONE device of
  that class has ever been observed.
- That non-standard PlayStation, GameCube, N64-clone, or Genius pads are correct. Untouched, never
  measured.
- Anything about the horizontal right-stick direction DOING anything. It dispatches (it already
  did); the downstream no-op is deliberate and unchanged.
- Anything about Phase 38 SCORES (see below).
- That `doScroll`'s target resolution is correct in general. Task 5 exercised ONE view (the games
  library). Other scroll containers are untested, and H-B stays UNTESTED rather than disproven, as
  stated above.

## `38-C02` is now SCOREABLE; this task does NOT score it

This plan makes `38-C02` (right-stick scroll sign convention) — never previously scoreable — and
likely `38-C05`, scoreable. Both stay the operator's to score in a separate live sitting.
`38-VERIFICATION.md` and `38-HUMAN-UAT.md` are confirmed byte-identical to HEAD (`git diff --quiet
HEAD -- .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/`) —
neither was edited by this task.

## Task 6 — what changed

**Piece A removed** from `src/frontend/helpers/gamepad.ts`: the `AXIS_DUMP` constant, its
justifying comment, the `axisDumpPrevAxes` previous-frame state array, and the `if (AXIS_DUMP)`
one-shot/per-frame `[GAMEPAD-AXIS]` emission block inside `updateStatus`. The permanent `[GAMEPAD]
id=... mapping=... buttons=... axes=...` connect line and its why-it-is-permanent comment
(`addgamepad`) are UNTOUCHED — proved below by a positive grep.

**Piece B removed** from `src/preload/api/tauriGamepadInput.ts`: the `SCROLL_DIAG` constant, its
justifying comment, the `describeScrollDiagElement` helper, and both `if (SCROLL_DIAG)` blocks
inside `doScroll` (the before-scroll capture and the after-scroll `[GAMEPAD-SCROLL]` emission).
Since Task 4 did not run, there was no shipped fix to preserve here — `doScroll` reverts to exactly
its pre-Task-1 shape, unchanged apart from the diagnostic's removal.

**No source comment mentions the removed diagnostics' names** (the residue trap named in the
plan's Task 6 action item 3) — the history is recorded in this SUMMARY and in commit messages
only, never in a source comment that would itself trip the residue gate.

**The L3/R3 todo was filed** at
`.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`, documenting: no
layout dispatches `buttons[10]`/`buttons[11]`; `leftClick` is never a button binding
(`gamepad.ts:188`, derived from `mainAction`); `rightClick` is always a face button; and therefore
`38-C04`'s stick-click clause describes a feature that does not exist. It cross-references the
sibling `ready: human` todo and states why measuring the indices would not make `38-C04`
dischargeable — that todo is about which raw index the stick click sits at; this one is about there
being no dispatch to attach any index to, on any mapping, which is a stronger and independent
finding. `severity: medium`, `platform: any`, `ready: code`, bare lowercase, in order, immediately
after `files:`.

## Deviations from Plan

None beyond the honesty reconstruction of M1–M4 already described above (not a code deviation —
Rules 1–4 do not apply to a documentation gap in a prior session's transcript). No auto-fixed bugs,
no added functionality beyond the plan's own scope, and no architectural changes were needed for
Task 6's removal-only work.

## Known Stubs

None. This task removes diagnostic code and files a documentation todo; it introduces no new UI
surface, no hardcoded empty values, and no placeholder text.

## Threat Flags

None. Both diagnostics registered in the plan's own `<threat_model>` (T-9de-03, T-9de-04) are now
fully removed — the mitigation each row named ("Deleted in Task 6 with a `! grep -nE` residue
proof") is complete, proved below. No new network endpoint, auth path, file-access pattern, or
trust-boundary schema change was introduced by this task.

## Verification

- `npx prettier --check src/frontend/helpers/gamepad.ts src/preload/api/tauriGamepadInput.ts
  .planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md` → all matched
  files use Prettier code style (the `.planning` path is vacuous per `.prettierignore`, run per
  convention, not as a guarantee).
- Residue check, `! grep -nE "AXIS_DUMP|SCROLL_DIAG|GAMEPAD-AXIS|GAMEPAD-SCROLL|describeScrollDiagElement"
  src/frontend/helpers/gamepad.ts src/preload/api/tauriGamepadInput.ts` → **zero matches** (success).
- Positive check, `grep -nE "\[GAMEPAD\] id=" src/frontend/helpers/gamepad.ts` → **found at line
  634** — the permanent connect diagnostic survives.
- `pnpm codecheck` → both tsc projects clean, zero errors.
- `pnpm lint` → `production: PASS | tests: PASS`, 0 errors, 638 warnings (exactly at the existing
  ceiling, none introduced by this task).
- `npx jest --selectProjects Frontend` → **173/174 suites, 2953/2955 tests pass.** The one failing
  suite is `src/frontend/screens/Game/GamePage/components/__tests__/labelSuiteI18nCensus.test.ts`
  (2 assertions), **pre-existing and unrelated** — confirmed by `git status`/`git diff` showing
  `public/locales/en/gamelib.json` untouched in this working tree (clean relative to HEAD), and
  independently documented as the identical pre-existing failure in `260923-qe5-SUMMARY.md` and
  `260924-swb-SUMMARY.md`'s own verification sections. Neither this task's two modified files nor
  the new todo touch i18n in any way. Not fixed here — out of scope, and CLAUDE.md forbids treating
  an unrelated pre-existing failure as this task's to repair.
- `npx jest --selectProjects Preload` → **10/10 suites, 143/143 tests pass**, including
  `gamepadAction.test.ts` and `gamepadAction.test.ts:268-282` (REQ-34.1-06, the sign convention)
  green and byte-identical.
- `python meta/runPlanningGates.py` → **13/13 gates pass**, including `todo-frontmatter-gate.py`
  over the newly filed todo.
- `git diff --quiet HEAD -- .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/`
  → clean, confirming the Phase 38 ledger is untouched.

**Note on the plan's fully-`&&`-chained `<verify>` command as literally written:** because of the
pre-existing, unrelated `labelSuiteI18nCensus.test.ts` failure, the single `&&`-chained command as
written in the plan cannot complete end-to-end (it halts at the `Frontend` jest step). Each stage
was therefore run and confirmed individually, in the order the chain specifies, exactly as
`260923-qe5` and `260924-swb` both did when they hit the same pre-existing issue. All stages after
the `Frontend` jest step were confirmed to pass when run directly.

## Push status

**No push was attempted.** The orchestrator's explicit instruction for this task was "DO NOT PUSH.
I handle that," which supersedes the plan's own Task 6 action item 7 (which anticipated a push
attempt against a concurrent session's lint-ceiling breach). The working tree at commit time
carried no evidence of that concurrent session's uncommitted edits (`git status --short` clean
before this task's own changes), so the specific push-blocking scenario the plan anticipated may
not currently apply — but this was not tested, since no push was made.

## Self-Check

(completed after commits — see below)
