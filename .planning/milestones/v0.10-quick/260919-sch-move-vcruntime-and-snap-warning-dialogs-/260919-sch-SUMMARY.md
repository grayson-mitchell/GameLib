---
quick_id: 260919-sch
date: 2026-09-19
status: complete
commits:
  - 3c71b9cb2 # widen ButtonOptions.action, wire renderer handlers, record policy
  - e592f2e92 # VCRuntime dialog moved in-app + regression test
  - 453e3cc9c # Snap warning moved in-app, re-point repeat-count test
  - 92f8a1225 # frontend regression test for the three new button actions
  - 2ace8d6f5 # close the source todo, file the residue todo
files_changed: 8
source_todo: .planning/todos/completed/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md
todo_status_after: CLOSED
residue_todo: .planning/todos/pending/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md
---

# Quick Task 260919-sch — Summary

Both dialog-shim collapse defects the source todo named — VCRuntime's unreachable "Don't
show again" button and the Snap warning's checkbox that could never be checked — were moved
off the native `dialog.showMessageBox`/`checkboxLabel` shim onto the in-app `showDialog`
path. Neither fix was observed running live; both are Windows-only and Linux/Snap-only
respectively, unreachable on this machine, and are backed only by regression tests plus
static reading.

**The todo called both defects "live"; only the Snap one actually is.** `detectVCRedist` has
had no call site since the Phase 35 cutover deleted `main.ts`, so the VCRuntime defect was
already unreachable for a second, independent reason. Its fix here is structural. See
"Honesty — what was NOT verified" below, which governs over any "fixed" wording above.

## What shipped

| commit | what |
| --- | --- |
| `3c71b9cb2` | widened `ButtonOptions.action` with `vcRuntimeDownload`/`vcRuntimeSkip`/`snapWarningSuppress`, wired all three in `DialogHandler`'s `resolveButtonAction`, recorded a 3-rule native-vs-in-app policy docstring in `dialog.ts` |
| `e592f2e92` | `detectVCRedist` (`backend/utils.ts`) no longer calls the native 3-button dialog; raises one in-app `showDialogBoxModalAuto` dialog instead. New test: `src/backend/__tests__/detectVCRedistDialog.test.ts` (2 tests) |
| `453e3cc9c` | Snap warning (`appShellFlowRegistration.ts`) moved to the same in-app path; re-pointed the existing CR-02 repeat-count test in `appShellFlows.test.ts` (42 tests, all passing) |
| `92f8a1225` | new frontend regression test, `DialogHandler/__tests__/buttonActions.test.tsx` (5 tests), covering all three new actions plus two no-regression cases |
| `2ace8d6f5` | closed the source todo with a closing note; filed a new residue todo for the four items this task did not touch |

## Why `action` discriminators, not `onClick`

Backend-composed dialog buttons cross the `sendFrontendMessage`/structured-clone JSON hop
into the renderer, which cannot carry a function. `ButtonOptions.action` is the existing
serializable escape hatch (`37-02`/D-07's pattern, already used for `steamSignIn`) —
`DialogHandler`'s `resolveButtonAction` maps each action string to a real handler
renderer-side before render, and a `const _exhaustive: never = action` guard forces a
`tsc` failure if a new action literal is ever added without a case here.

## The native path was not widened — it structurally cannot be

`main.rs:5803`'s Rust dialog command only maps a `buttons` array to a native dialog when
its length is exactly 2 (`MessageDialogButtons::OkCancelCustom`). It cannot express a
third button (VCRuntime's "Don't show again") or a checkbox readback (Snap's "do not show
again"), and dismissing (Escape/close) on the native path returns response index 1 — so
any "don't show again" mapped there fires silently on Escape, persisting a suppression the
user never chose. Both are structural ceilings of the shim, not sloppiness in it; this is
recorded as a docstring above `showDialogBoxModalAuto` in `dialog.ts`, not as a proposal to
extend the native shim.

## Honesty — what was NOT verified

- **No live run was possible on this machine for either defect.** VCRuntime detection only
  runs on Windows; the Snap warning only fires under `isSnap`. This machine is neither.
  Every claim above is backed by mocked regression tests
  (`detectVCRedistDialog.test.ts`, the re-pointed CR-02 case in `appShellFlows.test.ts`,
  `buttonActions.test.tsx`) and direct reading of the call sites — never an observed
  Windows or Snap run. Do not read "fixed" above as "seen working."
- **`detectVCRedist` has no call site at HEAD.** Confirmed by grep and reading: the
  function is defined and re-exported but nothing calls it (tracked separately at
  `.planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md`, left
  unmodified by this task per its own instruction — it is not re-filed here). This task's
  fix to `detectVCRedist`'s *internal* dialog behavior is structural: correct if and when
  the function is ever called, but it does not make a single Windows user see anything
  today, because nothing calls it.
- **The baseline for "pre-existing" claims in this task is `31b1336c8`** (the commit at
  HEAD when this task began). No pre-existing-failure claims were needed during execution
  — no unrelated red was hit.
- **Every targeted jest run reported a non-zero test count**: 2 (detectVCRedistDialog), 42
  (appShellFlows, full file), 5 (buttonActions) — none were silently empty.

## The grep-blind-spot trap, confirmed live

`grep 'dialog\.'` on `appShellFlowRegistration.ts` returns zero hits for the Snap warning's
call site despite it existing — the `showDialogBoxModalAuto({` call wraps across two lines
(`:388`/`:389` at the time of reading), splitting `dialog` from the rest of the expression
across the grep's line boundary. Confirmed by direct reading, not trusted from the grep;
recorded here as the plan warned it would happen.

## The `git mv` trap — avoided, checked

Task 5 moved a todo from `pending/` to `completed/` and then edited it. Move was staged
first (`git mv`), the closing-note edits were applied to the file at its new path second,
then `git add` was run explicitly and `git diff --cached -M` was checked before
committing — it showed the move as an edited rename carrying the original **233** lines
forward plus the closing note, not a fresh file that had silently discarded the original
content. Independently re-checked by the orchestrator: the file is **275** lines at its new
path, and 233 + 49 insertions − 7 deletions = 275 reconciles exactly. (An earlier draft of
this summary said "279 lines"; that figure was wrong.)

## Lint ceiling — held exactly at 638, one refactor required to stay there

Mirroring `removeEosOverlayConfirmation.test.tsx`'s
`mockShowDialogModal.mock.calls[0][0] as CapturedDialogOptions` cast pattern verbatim in
`buttonActions.test.tsx` (used 6 times) pushed `pnpm lint`'s tests count to 644 against the
638 ceiling — that exact pattern already carries 4 `no-unsafe-member-access` warnings in
its precedent file, and repeating it added 6 more. Fixed by typing the mocks with the
two-generic `jest.fn<ReturnType, ArgsType>()` form (precedented in `SteamSignOut.test.ts`)
so `.mock.calls[0][0]` resolves typed with no `as` cast needed. Re-measured at exactly 638
after the fix, with `production: PASS | tests: PASS`. `pnpm codecheck` and `pnpm prettier`
both clean on every task.

## Deviations from plan

None beyond the lint-ceiling fix above, which is a mechanical typing correction to hit the
plan's own "stay within TESTS_CEILING" requirement — not a scope change.

## Todo disposition (Task 5)

- **Closed**: `.planning/todos/completed/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md`
  (moved from `pending/`), with a closing note recording what shipped and the honesty
  caveats above.
- **Filed**: `.planning/todos/pending/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md`,
  carrying the four items the closed todo listed that this task did not touch: the
  dead-code sideloaded browser-game unload confirmation (owned by D-35-15-01, out of
  scope), the inverted-polarity quit confirmation at `utils.ts:281` (still native, still
  live, untouched), cosmetic dead CSS in `Dialog/index.css`, and the shim's latent
  `showMessageBoxSync` axis-3 trap (zero live consumers today).
- **Not re-filed**: `.planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md`
  was left untouched, per this task's own instruction — its missing-call-site defect is a
  separate, already-tracked item, not residue of this task.

## Pending todo count

24 files in `.planning/todos/pending/` before and after this task (one moved out to
`completed/`, one new one filed in) — verified via `ls .planning/todos/pending/ | wc -l`.

## Self-Check: PASSED

All 5 files referenced above (`detectVCRedistDialog.test.ts`, `buttonActions.test.tsx`,
the closed todo, the new residue todo, the untouched `detectVCRedist` todo) confirmed
present on disk. All 5 commit hashes (`3c71b9cb2`, `e592f2e92`, `453e3cc9c`, `92f8a1225`,
`2ace8d6f5`) confirmed present in `git log --oneline --all`. The old
`pending/2026-08-24-eos-remove-dialog-*.md` path confirmed no longer present (moved, not
copied).
