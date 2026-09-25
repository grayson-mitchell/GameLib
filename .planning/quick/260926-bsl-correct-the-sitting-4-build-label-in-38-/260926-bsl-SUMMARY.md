---
phase: quick-260926-bsl
plan: 01
subsystem: planning-docs
tags: [uat, phase-38, steam, windows, docs-only]
dependency-graph:
  requires: ["260926-b5r"]
  provides: ["sitting-4-build-label-corrected"]
  affects:
    - ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md"
    - ".planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md"
tech-stack:
  added: []
  patterns: ["desk-diff transfer note", "inferred-vs-measured attribution labelling"]
key-files:
  created: []
  modified:
    - ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md"
    - ".planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md"
decisions:
  - "Sitting 4's build attribution is relabelled by INFERENCE from commit dates, not by measurement, and every place that carries the label (frontmatter row, Current Test prose, heading, Conditions paragraph) says so explicitly rather than reading as equally established with sitting 5's measured label."
metrics:
  duration: "~35 min"
  completed: "2026-09-26"
---

# Quick 260926-bsl: Correct the sitting-4 build label in 38-HUMAN-UAT.md Summary

Relabelled Phase 38 sitting 4 from "Windows 11, `tauri dev`, DEBUG build" to the stale installed
shell v0.7.0 (built 2026-09-24 07:34 from `5b6201e26`) that it almost certainly ran — and marked
that attribution INFERRED from commit dates, not measured, unlike sitting 5's live-measured
correction (quick `260926-b5r`).

## What changed

**`38-HUMAN-UAT.md`** (commit `9ee71c67d`) — six edits inside the plan's declared scope:

1. Frontmatter `sessions:` row (line 11): build description replaced with the installed-shell
   claim, explicitly flagged `attribution INFERRED from commit dates, not measured`; no backslash,
   no inner double quote, no `debug build` claim. The 5 `sessions:` rows still parse as YAML.
2. `## Current Test` prose (line 19): added a correction parenthetical for Sitting 4, matching the
   shape already used for Sitting 5.
3. `## Sitting 4` heading: dropped `` `tauri dev` ``, now names the installed shell, `5b6201e26`,
   and "label corrected by inference".
4. Conditions paragraph: fully rewritten to lead with `INFERRED, not measured`, name the stale
   binary and its sidecar path, explain how the single-instance guard let the mislabel go
   unnoticed, preserve the withdrawn label as quoted history (`Originally recorded as "Windows 11,
   `tauri dev`, DEBUG build"; that label is withdrawn.` — both phrases on one physical line, as the
   gate requires), and state the inference basis compactly (no clock time, no commit hash recorded
   for sitting 4; the two candidate installed-exe windows abut, leaving no dev-build window before
   the 06:30 write-up). The old "say debug build explicitly" argument for `38-W04`/`38-W05` being
   un-runnable is retired in favor of the build-profile-independent reason (no `v*` tag → no CI
   artifact).
5. Two new paragraphs added directly after Conditions:
   - **"Why `38-W01`, `38-W02` and `38-W03` still stand — a desk diff, not a re-run."** Maps each
     item to the unchanged code range, names the sha1 and both commits, attributes the whole
     +633-line `main.rs` drift to Phase 46 single-instance machinery, and states plainly that
     nothing was re-run on HEAD.
   - **"Honest limits of this relabel."** States the inference/measurement asymmetry against
     sitting 5, that an unlogged instance cannot be excluded, that the debug session's record (not
     Windows logs read on this Mac) is the source of the timing window, and names
     `GAMELIB_SHELL_EXE received=` in `gamelib.log.old` as the way to settle it, with a
     cross-reference to the pending todo.
6. Sitting 5's `38-W04` paragraph (lines 567-568 pre-edit): added a single qualifying clause
   noting the sitting-4 build label is now withdrawn, without touching the surrounding evidence.

The three result headings (`38-W01` PASS, `38-W02` PASS, `38-W03` FAIL-accepted) are byte-unchanged;
`^expected:` count and `### N.` heading count both stay 0.

**Pending todo** (commit `2f9f0c21e`) — two edits:

1. Appended a dated update to the `gamelib.log.old` bullet answering its own "check the sitting-4
   timings before re-labelling it" instruction: there were no timings to check, so the relabel is
   an inference; still not measured until the Windows `GAMELIB_SHELL_EXE received=` lines are read.
2. Prefixed decision 1 with `**Partially answered 2026-09-26.**`, recording that both sittings'
   "at minimum, correct the Conditions lines" is now done (sitting 5 measured via `260926-b5r`,
   sitting 4 inferred via this task), and naming what remains the operator's call: confirming the
   sitting-4 inference from Windows logs, and the whole of decision 2 (which touches the Phase 46
   single-instance design).

Frontmatter (`severity: major`, `platform: windows`, `ready: human`) is untouched; the todo remains
in `pending/`.

## Inferred vs. measured — the asymmetry is written into the file, not smoothed over

Sitting 5's installed-shell attribution (`260926-b5r`) was **measured** live: the running pid, its
log, and its bundle's pre-`3a0e62918` `Dropdown.toggle()` were all directly observed. Sitting 4's
attribution is **inferred**: sitting 4's section carries zero clock times and zero commit hashes
(unlike sittings 2 and 3, which both carry build hashes), so the only available proxy is git
author dates. Both candidate installed-exe windows (`gamelib.log.old`'s 21:01→05:42 and the
installed shell's pid-12812 start at 05:43:39) abut sitting 4's own commits (`0736ec037` 06:29:19,
`a710fe9cc` 06:30:22) with no gap for a dev-build session on 2026-09-26 before the write-up. The
only clean dev-build gap in the data is 20:14–21:01 on 2026-09-25 — which contradicts the recorded
sitting date. This is a strong inference, not a measurement, and every place the file states the
new label says so.

## Re-asserted desk-diff checks (both matched, as required by hard constraint 3)

- `git show 5b6201e26:src-tauri/src/main.rs | head -8405 | shasum` and the same for `0736ec037`:
  both print `f7af5438ac02bc476a76b6493394243506c98232`. Confirmed byte-identical.
- `git diff --stat 5b6201e26 0736ec037 -- src/frontend/components/UI/WindowControls/ src/preload/api/tauriWindowChrome.ts`:
  printed nothing. Confirmed unchanged.

Because both checks matched, the "38-W01/W02/W03 still stand, no re-run needed" claim in the file
is true, and the task proceeded rather than stopping for human review.

## Pre-existing gate/parse facts confirmed, not fixed

- `pnpm planning-gates` still exits 1 at baseline after this task's edits: 12/13 pass, the sole
  `[FAIL]` is `planning-envelope-tag-gate.py` over exactly 3 untouched files under
  `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/`. `uat-visibility-gate.py` and
  `todo-frontmatter-gate.py` both PASS. This failure set is unchanged from the plan's recorded
  baseline and is not this task's to fix.
- `38-HUMAN-UAT.md`'s full frontmatter still does not parse as YAML — line 4's `source:` field is
  an unquoted flow sequence that breaks on an unescaped comma inside a flow-collection entry. Only
  the `sessions:` rows parse cleanly (verified: 5 rows). This was true before this task and remains
  true after.
- **The plan's `npx prettier --check` steps were VACUOUS, not a real check.** `.prettierignore:29`
  lists `.planning`, and `npx prettier --file-info` confirms `"ignored": true` for all three
  `.planning` paths this task wrote or edited. Every `--check` invocation therefore matched zero
  files and printed "All matched files use Prettier code style!" without inspecting content. This
  is the same trap `260926-a1l` first established and `260926-b5r` repeated in its STATE.md row;
  this task repeats the finding rather than being fooled by it. No formatting defect is claimed to
  have been avoided by these runs — the files simply were never in scope for prettier.

## UAT item-shape convention: measured inapplicable

`38-HUMAN-UAT.md` carries zero `^expected:` lines and zero `### N.` item headings both before and
after this task's edits — confirmed by grep, not assumed. The CLAUDE.md "expected: inline, never a
block scalar" hazard does not apply to this file because it has no such items at all. Separately,
`audit-uat` cannot see `*-HUMAN-UAT.md` files at all (the file's own banner states this), so "no
audit-uat visibility change" is vacuously true here — there was no visibility to change.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written for both tasks.

### Discovered anomaly (not caused by this task, not touched)

While staging commits, a concurrent, unrelated modification to `src/backend/storeManagers/steam/depot.ts`
and `src/backend/storeManagers/steam/depot.test.ts` was observed in the working tree (linked to the
untracked `.planning/debug/depot-stall-bound-did-not-fire.md` file present at session start — an
active `/gsd-debug depot-stall-bound-did-not-fire` investigation running against the same main-tree
checkout). This task never staged, edited, or committed those files; both task commits (`9ee71c67d`,
`2f9f0c21e`) were verified via `git show --stat` to contain exactly one file each. A `git reset`
from that concurrent process was also observed in the reflog between the first `git add` and
`git commit` attempt (it unstaged, but did not alter, this task's edited file — confirmed by
re-reading file content from disk before re-staging and committing). No destructive git command was
run by this task in response; files were simply re-staged and committed immediately. This working
tree is evidently shared with at least one other active agent/process outside this task's control —
worth surfacing to the user, not something for this task to fix.

## Auth Gates

None encountered.

## Known Stubs

None — documentation-only task, no rendering/data-wiring surface touched.

## Threat Flags

None — no new network endpoints, auth paths, file-access patterns, or schema changes introduced.
This task only edits existing planning-doc prose.

## Follow-ups left untouched (carried over from `260926-b5r`'s ledger)

- `38-VERIFICATION.md` — still repeats an old sitting-5 label; not touched here.
- `.planning/todos/pending/2026-09-26-webview2-delete-cookie-does-not-remove-epic-cookies.md:16`
- `.planning/debug/resolved/epic-cookie-clear-read-divergence.md:206-207`
- The historical `260926-a1l` PLAN/SUMMARY files.

## Still open

- Decision 2 of the pending stale-install todo (guarding the trap: uninstall / refuse-handoff /
  `tauri:dev` pre-flight) — deliberately left for the operator; it touches the Phase 46
  single-instance design.
- Operator confirmation of the sitting-4 inference from the Windows machine's `gamelib.log.old`
  `GAMELIB_SHELL_EXE received=` lines — the clean way to settle it, not attempted in this task.

## Self-Check: PASSED

- FOUND: `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md`
- FOUND: `.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md`
- FOUND commit `9ee71c67d` (`docs(quick-260926-bsl): correct sitting-4 build label in 38-HUMAN-UAT.md`)
- FOUND commit `2f9f0c21e` (`docs(quick-260926-bsl): record decision 1 as partially answered for sitting 4`)
- `git show --stat` on both commits confirmed exactly one file each, no unrelated files absorbed.
- `pnpm planning-gates` re-run after both edits: 12/13, one `[FAIL]` (`planning-envelope-tag-gate.py`),
  3 `260925-uok` mentions — matches the plan's recorded baseline exactly.
