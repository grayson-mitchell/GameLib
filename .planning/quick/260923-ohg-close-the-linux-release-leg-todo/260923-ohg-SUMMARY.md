# Quick Task 260923-ohg: Close the Linux release-leg todo Summary

Closed the Linux E0599 release-leg todo on its own live-gate evidence (run 35808881023), resolved
its debug session, and repaired the one live cross-reference the move would otherwise strand — no
source, tag, workflow, or release touched.

## What Happened

The Linux release-leg todo (`2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md`)
was `ready: live-gate`, `needs: verify-fix-on-live-linux-leg`, blocked on a tag push reaching
`release-tauri.yml`'s `ubuntu-24.04` matrix leg. That condition was met 2026-09-23 by GitHub
Actions run `35808881023` (tag `v0.7.0-notarize-test2` at commit `77f3b4388`, Linux job
`107015694055`): the leg concluded success, the downloaded 3090-line job log contains zero
occurrences of `E0599` and zero of `get_window`, `gamelib-shell` built at 02:08:57, and the
AppImage was produced and uploaded at 02:10:24.

Three tasks, in order (move-then-edit each time, to avoid the measured `git mv` hazard of
committing HEAD content and dropping unstaged edits):

1. **`git mv` the Linux todo** from `todos/pending/` to `todos/completed/`, then edited it at the
   new path: `status: completed` plus `resolved: 2026-09-23` / `resolved_by: quick-260923-ohg`
   added immediately after `needs:`; the `## Verification — INCOMPLETE` heading rewritten to
   `## Verification — SATISFIED 2026-09-23 by run 35808881023` with a new subsection recording the
   full live evidence (run, tag, commit, job, matrix leg, conclusion, timing, log-scan counts,
   build/upload timestamps) and stating plainly what it does and does not prove; and the evidence
   pointer repointed at `.planning/debug/resolved/linux-get-window-e0599.md`. `ready:`, `needs:`,
   `severity:`, `platform:`, and the closing "Shared provenance" paragraph were left byte-identical
   per the closing convention (mirroring the Windows sibling closed by `quick-260922-txw`).

2. **`git mv` the debug session** from `.planning/debug/` to `.planning/debug/resolved/`, then
   edited: `status: awaiting_human_verify` -> `status: resolved`, `updated: 2026-09-21` ->
   `updated: 2026-09-23`, `source_todo:` repointed from the `pending/` path to the new `completed/`
   path, and a `live_verification:` field appended to the Resolution section's `verification:`
   text recording the same live-run facts and stating that it closes the exact gate that field
   named. No `resolved:` key was added, matching the convention that 30 of 35 files in
   `debug/resolved/` carry none.

3. **Corrected the notarization todo's sibling bullet** — replaced the `- **STALE pointer:**`
   bullet (lines 464-465) with a `- **CLOSED:**` bullet naming the completed path and the
   verifying run/job. The word `STALE` no longer appears anywhere in the file. Nothing else in
   that file changed: its five frontmatter keys, `status: OPEN`, `ready: live-gate`, and
   `needs: retag-and-confirm-notarization-accepted` are all untouched — its own notarization gate
   stays unanswered.

Before each commit-eligible edit, `git show :<path> | grep -c '107015694055'` was run against the
staged index (not the working tree) to prove the edit was actually staged, per the plan's
mandatory hazard check. All three returned non-zero.

## Verification

Ran the plan's full Task 3 battery (all four cross-file assertions, the `.prettierignore` vacuity
check, `npx prettier --check` on the three files, and `pnpm planning-gates`) before committing:

- Both old paths (`todos/pending/2026-09-17-linux-release-leg-...md`,
  `.planning/debug/linux-get-window-e0599.md`) absent; both new paths present.
- All six live-run anchors present in the completed todo; `status`/`resolved`/`resolved_by` set;
  `ready`/`needs`/`severity`/`platform` unchanged; Shared provenance sentence intact verbatim.
- Debug session `status: resolved`, `updated: 2026-09-23`, `source_todo:` both names and resolves
  to the completed path (`test -f` on the parsed pointer, not a string match).
- Notarization todo names the `completed/` path, contains zero `STALE`, and its `status`/`ready`/
  `needs` are unchanged.
- No document anywhere under `.planning/debug` or `.planning/todos/pending` still points at the
  old pending path.
- No historical artifact (`260917-8hr`, `260921-pvt`, `260923-np3`, the Windows completed todo,
  the stray-tag census todo) appears in `git diff --cached --name-only`.
- `.prettierignore:29` confirmed a bare `.planning` (prettier over these three paths is vacuous by
  design, per CLAUDE.md convention — it is emitted anyway and pairs with this assertion).
- `pnpm planning-gates` — **12/12 PASS**.
- `git status --porcelain` empty except this task's own directory (containing this SUMMARY.md,
  which per the orchestrator's instructions is not committed here).

All checks passed; committed as a single commit `2fc3171df`.

## Deviations from Plan

None — plan executed exactly as written. Both HISTORICAL-column files and the notarization
todo's line-460 bullet were left untouched, as scoped.

## Known Stubs

None.

## Threat Flags

None — documentation-only change to `.planning/` files; no new network endpoints, auth paths,
file access patterns, or schema changes.

## Expected, Not a Regression

`.planning/quick/260917-8hr-.../260917-8hr-PLAN.md:407`'s verify block `test -f`s the old
`todos/pending/` path for this todo. That block will now fail if re-run — this is a completed
plan's verify block rotting against its own baseline sha, recorded deliberately by the plan (D-5),
not a defect introduced by this task.

## Self-Check: PASSED

- FOUND: `.planning/todos/completed/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md`
- FOUND: `.planning/debug/resolved/linux-get-window-e0599.md`
- MISSING (expected): `.planning/todos/pending/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md`
- MISSING (expected): `.planning/debug/linux-get-window-e0599.md`
- FOUND (unchanged location): `.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`
- Commit `2fc3171df` found in `git log --oneline -1`.

## Metadata

- **Duration:** ~20 minutes
- **Completed:** 2026-09-23
- **Tasks:** 3/3
- **Files touched:** 3 (2 moved+edited, 1 edited in place)
- **Commit:** `2fc3171df` — `docs(quick-260923-ohg): close the Linux release-leg todo on live run 35808881023`
