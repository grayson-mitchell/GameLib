---
quick_id: 260907-j8n
phase: quick-260907-j8n
plan: 01
subsystem: infra
tags: [rust, tauri, sidecar, ipc, logging, diagnostics, f-9]
requires:
  - phase: none (standalone quick task)
provides:
  - "invoke_abandoned_message() helper in src-tauri/src/main.rs, with cargo coverage"
  - "shell_diag routing for the four RPC transport-failure diagnostic sites"
  - "src/backend/__tests__/shellDiagPersistence.test.ts (CI gate, 15 tests)"
affects: [shell-diagnostics, gamelib-shell-log, f-9-todo]
tech-stack:
  added: []
  patterns:
    - "shell_diag() for any diagnostic that must survive a packaged build (LaunchServices discards bare eprintln! stderr)"
key-files:
  created:
    - src/backend/__tests__/shellDiagPersistence.test.ts
  modified:
    - src-tauri/src/main.rs
    - .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md
key-decisions:
  - "No log rotation or throttle for gamelib-shell.log added in this task — bounded per site, no supporting evidence of need (see Log Volume Decision below)"
  - "The new shell_diag call in each invoke() arm goes BEFORE self.record_abandoned, not after, because abandonedInvokeAttribution.test.ts's ordering pin only tolerates whitespace between record_abandoned and its Err"
requirements-completed: [F-9]
metrics:
  duration: "~30min"
  completed: 2026-09-07
---

# Quick Task 260907-j8n: Persist RPC transport-failure diagnostics Summary

**Routed all four of the shell's RPC transport-failure diagnostics through `shell_diag()` — adding
the two that previously emitted nothing at all (a 60s abandonment with no late response) — so a
recurrence is now passively captured in `gamelib-shell.log`, surviving a packaged build where
LaunchServices discards stderr. The F-9 todo does NOT close.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-09-07
- **Tasks:** 3/3 completed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Two previously-silent failure arms (`SidecarState::invoke`'s 60s timeout arm and its sidecar-disconnect
  arm) now each emit a `shell_diag` line naming both `id` and `channel` before the abandonment is
  recorded into the ring — closing the observability gap that made F-9's original `id=1575` event
  unattributable after the fact.
- Two pre-existing bare-`eprintln!` diagnostics (the reader thread's unknown/timed-out and
  malformed-id lines) converted to `shell_diag`, with byte-identical stderr output preserved.
- New CI-running jest gate (`shellDiagPersistence.test.ts`, 15 tests) pins all four sites, counts
  the two `invoke()` arm calls separately (not merely present), guards the double-`[shell] `-prefix
  failure mode with a non-vacuity control, and proves non-collision with the capture harness's two
  regexes against locally-declared copies verified byte-identical to the harness source.
- Both forbidden-to-edit gates remain green and unedited: `abandonedInvokeAttribution.test.ts`
  (9/9) and `captureShellScrollback.test.ts` (15/15).
- F-9 todo carries a fifth, append-only disposition. `status: pending` unchanged, no box checked,
  `id=1575` still UNDETERMINED.

## Task Commits

Each task committed atomically:

1. **Task 1: Route all four transport-failure diagnostics through shell_diag** - `6fb96c76a` (fix)
2. **Task 2: New CI gate pinning the four sites, RED-proved by mutating the implementation** - `e4dcb2600` (test)
3. **Task 3: Todo disposition — does NOT close** - `40390bbf6` (docs)

This SUMMARY.md is not committed by the executor per this task's explicit constraint (the
orchestrator handles the docs commit).

## Files Created/Modified

- `src-tauri/src/main.rs` — added `invoke_abandoned_message()` helper (+ 3 cargo tests, manual
  gate); Sites C/D (`SidecarState::invoke`'s timeout/disconnect arms) now call `shell_diag`; Sites
  A/B (reader thread) converted from `eprintln!` to `shell_diag` with the `[shell] ` prefix
  stripped from the literal.
- `src/backend/__tests__/shellDiagPersistence.test.ts` — new, 15 tests, CI-running.
- `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md` —
  append-only fifth disposition.

## Deviations from Plan

None — plan executed exactly as written, including the mandatory ordering (new `shell_diag` call
BEFORE `self.record_abandoned`) and the mandatory `[shell] ` prefix strip on both converted
literals.

## Ordering Discovery (restated, since it is the single most likely thing to be undone by accident)

`abandonedInvokeAttribution.test.ts` matches
`/self\.record_abandoned\(&id, &channel\);\s*Err\(...\)/` with only `\s*` tolerated between the two
statements. The new `shell_diag(&invoke_abandoned_message(...))` call in each `invoke()` arm
therefore had to be placed BEFORE `self.record_abandoned(...)`, never between it and the arm's
`Err(...)`. This placement is semantically neutral (both calls are local, infallible, single-threaded)
— the gate's shape is the only reason, and RED-proof (d) below demonstrates it is a real, load-bearing
constraint on the untouched sibling gate, not planner folklore.

## RED-proofs (Task 2), verbatim, each produced by mutating `main.rs` and restored afterward

**(a) Revert Site A to its bare `eprintln!` form.**
Mutation: replaced
`shell_diag(&format!("response for unknown/timed-out id={id} channel={channel} (dropped)"));`
with the original
`eprintln!("[shell] response for unknown/timed-out id={id} channel={channel} (dropped)");`.
Result: `npx jest shellDiagPersistence` → 13/15, with these two tests failing:
- `Site A and Site B route through shell_diag, not a bare eprintln! > Site A (unknown/timed-out id) calls shell_diag`
- `Site A and Site B route through shell_diag, not a bare eprintln! > Site A regression guard: the bare eprintln! form is gone`
Restored `main.rs` from the pre-mutation copy; `npx jest shellDiagPersistence` back to 15/15.

**(b) Delete the `shell_diag` call from the timeout arm only, leaving the disconnect arm's copy.**
Mutation: removed the line
`shell_diag(&invoke_abandoned_message("timeout", &id, &channel));`
from the timeout arm's `Err(_)` block, leaving the disconnect arm's call untouched.
Result: `npx jest shellDiagPersistence` → 13/15, with these two tests failing:
- `Sites C and D: both silent invoke() arms are now instrumented > shell_diag(&invoke_abandoned_message( occurs exactly twice — COUNTED` (2 → 1)
- `Sites C and D: both silent invoke() arms are now instrumented > the timeout arm carries the "timeout" reason, paired with its own Err`
This is the mutation that proves the count assertion is not satisfiable by the disconnect arm's
copy alone — the same blind spot `abandonedInvokeAttribution.test.ts`'s own history documents
having been hand-verified against for `record_abandoned`.
Restored `main.rs`; `npx jest shellDiagPersistence` back to 15/15.

**(c) Re-add `[shell] ` inside one `shell_diag` literal (Site B).**
Mutation: changed
`shell_diag("response frame with a missing or non-string id (dropped)")`
to
`shell_diag("[shell] response frame with a missing or non-string id (dropped)")`.
Result: `npx jest shellDiagPersistence` → 13/15, with these two tests failing:
- `double-prefix guard: no shell_diag call anywhere in main.rs passes a literal beginning with [shell]  > the guard passes against real main.rs`
- `Site A and Site B route through shell_diag, not a bare eprintln! > Site B (missing/non-string id) calls shell_diag` (side effect: the positive regex no longer matches the now-doubled literal)
The double-prefix guard (group 5) fires as required.
Restored `main.rs`; `npx jest shellDiagPersistence` back to 15/15.

**(d) Move the timeout arm's `shell_diag` call to sit BETWEEN `record_abandoned` and `Err(...)`.**
Mutation: reordered the timeout arm's `Err(_)` block from
```
self.pending.lock().ok().and_then(|mut p| p.remove(&id));
shell_diag(&invoke_abandoned_message("timeout", &id, &channel));
self.record_abandoned(&id, &channel);
Err(invoke_timeout_message(&channel))
```
to
```
self.pending.lock().ok().and_then(|mut p| p.remove(&id));
self.record_abandoned(&id, &channel);
shell_diag(&invoke_abandoned_message("timeout", &id, &channel));
Err(invoke_timeout_message(&channel))
```
Result: `npx jest abandonedInvokeAttribution` (the UNTOUCHED sibling gate, forbidden to edit) → 8/9,
failing:
- `F-9: an abandoned invoke is attributable to its channel > the recording sits in the timeout arm and the disconnect arm specifically`
This proves the ordering constraint stated above is real and enforced by a gate outside this
task's own file, not planner folklore. Restored `main.rs`; `npx jest abandonedInvokeAttribution`
back to 9/9.

**Final restoration verification** (after all four mutations): `npx jest abandonedInvokeAttribution
captureShellScrollback shellDiagPersistence` → 3 suites, 39/39 (9 + 15 + 15). `git diff --stat --
src-tauri/src/main.rs` against the Task 1 commit — empty. `cargo check` clean.

## Log Volume Decision (restated from the plan, decided deliberately)

No log rotation and no throttle were added for `gamelib-shell.log` in this task. Bounding argument,
per site:
- **Site C (timeout):** bounded by `INVOKE_TIMEOUT` = 60s; a pathological reconnect loop cannot
  produce more than roughly (concurrent pending invokes) lines per 60s.
- **Site D (disconnect):** fires once per pending invoke at the moment the sidecar dies; a spawn
  failure is fatal and exits, so there is no respawn loop to run away.
- **Site A:** bounded by the rate of late responses, itself bounded by the abandonment rate above.
- **Site B (malformed frame):** the only one unbounded in principle — a sidecar spamming malformed
  frames would write one line per frame. That state is already catastrophic on its own terms, and
  Site B was a bare `eprintln!` before this task, so the failure mode is not new — only its
  persistence is.

`gamelib-shell.log` has no rotation today and the 15 pre-existing `shell_diag` call sites already
append to it unrotated. Adding rotation would be a wider change touching every existing call site,
with no evidence to justify it — the F-9 line has fired exactly twice across this project's entire
recorded history (`id=1575`, `id=10023`). **Decision: no rotation, no throttle, no todo filed.**

## IPC Inventory (restated)

`.planning/IPC-PORT-INVENTORY.md` discipline is NOT engaged by this task and needed no edit. That
discipline tracks channel registration — channels added, removed, renamed, or reassigned. This task
adds no channel, removes none, renames none; `sidecar_invoke`'s command signature, the
`SidecarRpcRequest` frame shape, `LONG_RUNNING_CHANNELS`, and every registered channel name are
untouched. Only the sink a diagnostic string is written to changes.

## Named Residual (restated, deliberate — not filed as a todo)

After this change, an invoke abandoned with no late response emits
`[shell] invoke abandoned (timeout): id=… channel=…` (or the `sidecar closed` counterpart) — a line
`meta/captureShellScrollback.ts`'s `analyzeCapture()` does not recognise, so it will not raise a
`RECURRENCE` verdict on it. The analyzer's verdict remains keyed exclusively on `TARGET_DROP_RE`
(the late-response line). Deliberate consequence of the "do not edit the harness" constraint, not
an oversight. Widening the analyzer is a legitimate follow-on, out of scope here.

## Manual Gate Note

`src-tauri/src/main.rs`'s cargo module (`invoke_abandoned_message_renders_both_reasons`,
`invoke_abandoned_message_carries_no_shell_prefix`,
`invoke_abandoned_message_does_not_collide_with_the_capture_harness`) is a **manual** gate — this
project's CI runs no cargo step (`.github/workflows/*.yml` contains neither `cargo test` nor
`cargo check`). Verified locally: `cargo test invoke_abandoned` → 3 passed, `cargo check` clean.
`src/backend/__tests__/shellDiagPersistence.test.ts` is the gate that actually runs in CI.

## Baseline Hygiene

Baseline sha for every "pre-existing" claim in this SUMMARY: **`7bf39e3b5`**, confirmed matching
`HEAD` at plan start (`git rev-parse HEAD` before any edit). Confirmed GREEN at that sha, at plan
time, before any change: `abandonedInvokeAttribution.test.ts` 9/9, `captureShellScrollback.test.ts`
15/15.

Known reds at `7bf39e3b5`, **none of them this task's, none reported as this task's pass or
failure**: `pnpm test:ci` red from a leaked 60s `store_embed_open` timer; `pnpm lint` at ~4188
warnings against a 4157 ceiling (Phase 39 debt); `.husky/pre-push` prettier red repo-wide. None of
these were re-run or invoked to "confirm" this task, per the plan's explicit instruction not to run
a full-suite command for that purpose.

## Todo Disposition (Task 3)

Appended a fifth, dated disposition (`## Disposition (2026-09-07, quick task 260907-j8n) — does
NOT close`) to `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`.
`git diff` over that file shows **zero removed lines** (append-only). `status: pending` unchanged.
No box checked. `closes_todo: false`.

The new section: states what changed (four sites now route through `shell_diag`, two previously
silent); states the passive-recording gain over `260907-fni`'s active-capture-only route; corrects
`260907-fni`'s `gamelib-shell.log` claim by quoting it, stating it remains true for every
occurrence of these four lines **before** commit `6fb96c76a` and becomes false for them **from
`6fb96c76a` onward**, and explicitly does NOT generalise that correction to the other ~164 bare
`eprintln!` sites in `main.rs`, for which `260907-fni`'s original correction stands unchanged;
restates plainly what the change does NOT do (does not establish F-9's cause, cannot retroactively
answer `id=1575`, does not widen the analyzer); restates the named residual; and names both gates
(CI-running `shellDiagPersistence.test.ts` and the manual cargo module) plus the two unedited
sibling gates and their pass counts.

## Threat Model

No new surface beyond what the plan's own `<threat_model>` scoped (T-J8N-01 through T-J8N-04,
T-J8N-SC). No package installs in this task. No new network endpoint, auth path, or schema change.

## Known Stubs

None.

## Self-Check: PASSED

- `src-tauri/src/main.rs` — FOUND, modified as described.
- `src/backend/__tests__/shellDiagPersistence.test.ts` — FOUND.
- `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md` — FOUND, append-only diff confirmed (0 removed lines).
- Commit `6fb96c76a` — FOUND in `git log --oneline`.
- Commit `e4dcb2600` — FOUND in `git log --oneline`.
- Commit `40390bbf6` — FOUND in `git log --oneline`.
- Final gate state: `abandonedInvokeAttribution` 9/9, `captureShellScrollback` 15/15, `shellDiagPersistence` 15/15 — all confirmed green in the same session, after all RED-proof mutations were restored.
