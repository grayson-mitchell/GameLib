# Quick Task 260906-gej: Sweep the sidecar bootstrap for unported non-handler side effects — Summary

Recorded the already-complete sidecar-bootstrap sweep (`260906-gej-FINDINGS.md`) as durable
planning artefacts: filed 8 new pending todos for the confirmed-unported side effects, closed the
2026-09-05 todo that commissioned the sweep, and logged the task in STATE.md. This is a
documentation-only task — no source file under `src/` or `src-tauri/` was created, modified, or
staged.

## What was done

**Task 1 — Filed 8 new pending todos**, one per FINDINGS.md section A row (A1-A7) plus the
section-D inert-toggle residue:

| File | Source | Severity |
|---|---|---|
| `2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md` | A1 | major |
| `2026-09-06-queued-gog-playtime-never-drains-at-boot.md` | A2 | medium |
| `2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md` | A3 | medium |
| `2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md` | A4 | medium |
| `2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md` | A5 | major |
| `2026-09-06-checkrosettainstall-never-runs-under-tauri.md` | A6 | medium |
| `2026-09-06-detectvcredist-never-runs-on-windows.md` | A7 | medium, Windows-only, `verifiable_on` set |
| `2026-09-06-disable-smooth-scrolling-accessibility-toggle-is-inert.md` | D residue | minor |

Each carries its own bundle-level evidence (line numbers / zero-occurrence counts) copied
verbatim from FINDINGS.md, plus `source: quick-260906-gej`. A1 and A5 are the two findings
FINDINGS.md itself flags as having live user-visible consequences on macOS, the operator's
platform — GOG playtime sync wedges forever after one interrupted sync, and Steam install
badges never reconcile with the live client because no window-focus event reaches the sidecar
at all.

**Task 2 — Closed the commissioning todo.** `git mv`'d
`2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md` from
`pending/` to `completed/`, set `status:` to `RESOLVED 2026-09-06 by quick-260906-gej`, added
`discharged`/`discharged_by`, and appended a `## Disposition` section that:
- corrects the todo's own premise (`ls src/backend/main.ts` said the file was gone; it was
  recoverable via `git show 5643c7583^:src/backend/main.ts`, 1561 lines — a deleted file is not
  an absent file)
- quotes FINDINGS.md's verdict (**No** — 7 unported/unledgered, 3 degraded-not-lost, 12 already
  ledgered, 1 class out of scope)
- confirms the parent todo's generalisation (non-handler side effects carry no channel name, so
  a channel-by-channel IPC inventory is blind to all of them)
- links `260906-gej-FINDINGS.md` and lists all 8 spawned todos by exact filename
- states what the closure does NOT cover: section B's lost background pre-fetch (accepted cost,
  not a defect) and section E (window-bounds persistence, never swept, left as a named
  suspicion for a future shell-side sweep)

**Task 3 — STATE.md and commit.** Appended one row to the Quick Tasks Completed table (matching
the neighbouring rows' 4-column shape), leading with the premise-correction finding and the
A1/A5 live-consequence summary. Staged only the explicit paths the plan names, ran both abort
guards (no `src/`/`src-tauri/` staged; no non-`.planning/` path staged — both found nothing),
and committed.

## Queue counts

Pending: 40 → 47 (+8 new, -1 moved to completed). Completed: 79 → 80. Both match the plan's
predicted counts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] Task 3's `git diff --cached --name-only` was non-empty before staging**
- **Found during:** Task 3, pre-stage check
- **Issue:** The plan's guard step ("confirm the index is clean... if that prints anything, stop
  and report") found the `git mv` from Task 2 already staged (the rename of the sweep todo). This
  is this task's own prior step, not foreign staged work — the hazard the guard exists to catch
  (a concurrent session's staged changes) was absent.
- **Fix:** Proceeded to stage the remaining explicit paths on top of the already-staged rename,
  matching the plan's own note: "The `git mv` in Task 2 already staged the deletion of the
  pending path; the explicit add of the completed path completes the rename."
- **Files modified:** none (staging only)
- **Commit:** n/a (pre-commit check)

**2. [Rule 3 - blocking issue] SUMMARY.md did not exist yet when Task 3's commit ran**
- **Found during:** Task 3, immediately after commit
- **Issue:** The task instructions state the quick-task directory (PLAN.md, FINDINGS.md,
  SUMMARY.md) is staged as part of the single commit. `git add
  .planning/quick/260906-gej-sweep-sidecar-bootstrap-for-unported-non/` at that point only picked
  up PLAN.md and FINDINGS.md, because SUMMARY.md (this file) had not been written yet — the
  standard execute-plan flow writes SUMMARY.md only after all tasks complete.
- **Fix:** Rather than amend the prior commit (project convention: always create a new commit,
  never amend, since amending after any commit risks destroying work in a concurrent-session
  environment), this file is added in a second, small commit immediately following.
- **Files modified:** `.planning/quick/260906-gej-sweep-sidecar-bootstrap-for-unported-non/260906-gej-SUMMARY.md`
- **Commit:** see completion report (second commit hash)

## Not verified here

Per the plan's own verification section: none of the eight recorded defects is fixed;
FINDINGS.md's bundle evidence was copied forward, not independently re-measured; section E
remains unswept. This task recorded defects; it fixed none.

## Concurrent session note

Per the orchestrator's known-hazards correction, a concurrent session advanced HEAD from
`36832a3df` to `82393c01c` (via `5ac8b8e66`/`82393c01c`) while this plan was being written,
committing `src/backend/sidecar/__tests__/enrichmentFlows.test.ts` and
`.planning/debug/anticheat-response-frame-drop.md`. Both were clean and tracked at the start of
this execution and were not touched. `.planning/todos/pending/2026-09-06-bootstrapwirings-protocol-url-log-assertion-drops-under-load.md`
and `.planning/todos/pending/2026-09-06-jest-run-orphans-gamelib-sidecar-spinning-at-100-cpu.md`
(also filed by that concurrent session) were left untouched. No further HEAD drift was observed
during this task's execution.

## Self-Check

- `.planning/todos/pending/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md` — FOUND
- `.planning/todos/pending/2026-09-06-queued-gog-playtime-never-drains-at-boot.md` — FOUND
- `.planning/todos/pending/2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md` — FOUND
- `.planning/todos/pending/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md` — FOUND
- `.planning/todos/pending/2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md` — FOUND
- `.planning/todos/pending/2026-09-06-checkrosettainstall-never-runs-under-tauri.md` — FOUND
- `.planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md` — FOUND
- `.planning/todos/pending/2026-09-06-disable-smooth-scrolling-accessibility-toggle-is-inert.md` — FOUND
- `.planning/todos/completed/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md` — FOUND
- `.planning/todos/pending/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md` — CONFIRMED ABSENT (moved)
- Commit `d2632eeac` — FOUND in `git log`

## Self-Check: PASSED
