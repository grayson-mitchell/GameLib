---
phase: quick-260923-ohg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md
  - .planning/todos/completed/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md
  - .planning/debug/linux-get-window-e0599.md
  - .planning/debug/resolved/linux-get-window-e0599.md
  - .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
autonomous: true
requirements:
  - OHG-01
  - OHG-02
  - OHG-03
  - OHG-04
must_haves:
  truths:
    - 'The Linux E0599 todo lives in `completed/` and records, in its own Verification section, the live run that satisfied its gate — run 35808881023, Linux job 107015694055, tag v0.7.0-notarize-test2 at 77f3b4388.'
    - 'The debug session lives in `debug/resolved/`, is no longer `awaiting_human_verify`, and its `source_todo:` resolves to a file that exists.'
    - 'No LIVE planning document points at the old `todos/pending/` path for this todo.'
    - 'The notarization todo no longer calls its Linux sibling STALE, and its own five frontmatter keys are byte-identical to HEAD.'
    - 'The todo''s closing "Shared provenance" paragraph is byte-unchanged (it is a true statement about run 35223308954).'
    - 'Historical planning artifacts that cite the old pending path are left byte-unchanged.'
  artifacts:
    - path: '.planning/todos/completed/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md'
      provides: 'The closed Linux todo carrying its live-gate evidence'
      contains: '107015694055'
    - path: '.planning/debug/resolved/linux-get-window-e0599.md'
      provides: 'The resolved debug session, repointed at the completed todo'
      contains: 'status: resolved'
    - path: '.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md'
      provides: 'A corrected sibling pointer that names the completed/ path'
      contains: 'completed/2026-09-17-linux-release-leg'
  key_links:
    - from: '.planning/debug/resolved/linux-get-window-e0599.md'
      to: '.planning/todos/completed/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md'
      via: 'frontmatter source_todo:'
      pattern: 'source_todo: .planning/todos/completed/'
    - from: 'the notarization todo Related section'
      to: 'the completed Linux todo'
      via: 'a corrected CLOSED bullet replacing the STALE bullet'
      pattern: 'completed/2026-09-17-linux-release-leg'
---

<objective>
The Linux release-leg E0599 todo is `ready: live-gate`, `needs: verify-fix-on-live-linux-leg`. Its
own Verification section sets the pass condition: it stays open until a tag push reaches
`release-tauri.yml`'s `ubuntu-24.04` leg and comes back green.

That condition was met on 2026-09-23 by run 35808881023 (tag `v0.7.0-notarize-test2` at commit
`77f3b4388`, Linux job `107015694055`). Measured, not inferred: the Linux leg concluded **success**;
the downloaded 3090-line job log contains **zero** occurrences of `E0599` and **zero** of
`get_window`; `02:08:57 Built application at: .../src-tauri/target/release/gamelib-shell`; the
AppImage was produced and uploaded at `02:10:24`; and `git show 77f3b4388:src-tauri/src/main.rs`
carries the `#[cfg(target_os = "macos")]` / `#[cfg(not(target_os = "macos"))]` pair at ~`:6926-6940`.

Purpose: close the todo, resolve its debug session, and repair the two LIVE references that the move
would otherwise strand — without touching source, tags, workflows, or the historical record.

Output: three edited planning files, two of them moved, one commit.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/todos/pending/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md
@.planning/debug/linux-get-window-e0599.md
@./CLAUDE.md

Baseline measured at plan time, HEAD `3906a6af0`, working tree clean:

- `pnpm planning-gates` — **12/12 PASS**.
- Anchors `35808881023`, `107015694055`, `77f3b4388`, `v0.7.0-notarize-test2` are **absent (count 0)**
  from the Linux todo and from the debug session. `35808881023` already appears **5×** in the
  notarization todo, so it is **not** a usable anchor there; `107015694055` is absent everywhere.
- `STALE` appears exactly **2×** in the notarization todo, both inside the bullet being rewritten
  (lines 464-465), so `grep -c 'STALE' == 0` is a sound post-condition for that file.
- `.prettierignore:29` is a bare `.planning`.
</context>

<closing_conventions>
The Windows sibling — same run, same family, closed yesterday by `quick-260922-txw` — is the
template. Its frontmatter at
`.planning/todos/completed/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md`
reads:

```
status: completed
resolved: 2026-09-22
resolved_by: quick-260922-txw
```

and it **kept `ready:` and `needs:` byte-identical** to what they were while pending. Mirror that
exactly. Do **not** "discharge" `ready: live-gate` or `needs: verify-fix-on-live-linux-leg` by
editing them — `needs:` is a record of what was needed, `completed/` is exempt from the
todo-frontmatter gate, and changing them is an unforced edit with no gate asking for it. The verify
block asserts both are unchanged.

Debug-session convention: `status: resolved` (30 of 35 files in `debug/resolved/` have no `resolved:`
date key at all, so do not add one — set `status:` and `updated:` only, plus the `source_todo:`
repoint).
</closing_conventions>

<reference_classification>
Every file in the repo that cites the old pending path, enumerated at plan time so the executor is
not guessing. **Do not open or edit anything in the HISTORICAL column.**

| File | Lines | Class | Why |
|---|---|---|---|
| `.planning/debug/linux-get-window-e0599.md` | 7 | **LIVE — update** | `source_todo:` is a resolvable pointer; the move strands it |
| `.planning/todos/pending/2026-09-17-notarization-...-resources.md` | 464-467 | **LIVE — update** | the STALE bullet, per D-3 |
| `.planning/todos/pending/2026-09-17-notarization-...-resources.md` | 460 | **LIVE — leave** | bare filename, no directory component, so it strands nothing; and "sibling failure from the same run, unrelated cause" stays true |
| `.planning/quick/260917-8hr-.../260917-8hr-PLAN.md` | 9, 30, 347, 407 | HISTORICAL — leave | completed quick-task plan |
| `.planning/quick/260917-8hr-.../260917-8hr-SUMMARY.md` | 22, 54, 71 | HISTORICAL — leave | completed quick-task summary |
| `.planning/quick/260921-pvt-.../260921-pvt-PLAN.md` | 11, 77, 105, 144 | HISTORICAL — leave | completed quick-task plan |
| `.planning/quick/260923-np3-.../260923-np3-PLAN.md` | 270, 292 | HISTORICAL — leave | completed quick-task plan |
| `.planning/todos/completed/2026-09-17-windows-release-leg-...md` | 322 | HISTORICAL — leave | bare filename cross-link in an already-closed todo |
| `.planning/todos/completed/2026-09-21-agents-emit-a-stray-trailing-closing-tag-...md` | 26 | HISTORICAL — leave | census entry, bare filename |

`.planning/STATE.md` was grepped: **zero** references to this todo's path or to the debug slug.
Nothing to update there.

Recorded so a later reader does not mistake it for a regression: `260917-8hr-PLAN.md:407`'s verify
block does `test -f` against the **pending** path. After this task that block would go red if
re-run. That is a completed plan's verify block rotting against its own baseline sha, not a defect
introduced here, and per D-5 it is left alone.
</reference_classification>

<hazards>
**`git mv` commits HEAD content and silently drops unstaged edits — measured three times in this
repo.** This plan sidesteps it by ordering the move BEFORE the edit, and then proves the staged
content anyway. Both halves are mandatory, not advice.

**A resolved debug session is not moved for you**, and this repo has a measured case of closing
todos citing a debug-session path that does not exist. The verify block checks both new paths exist
AND both old paths do not.

**`pnpm planning-gates`' todo-frontmatter gate scopes to `pending/` only** — `completed/` is
deliberately exempt. Moving this file therefore RELAXES that gate. A green run after the move is
**not** evidence the frontmatter is right; the verify block asserts the frontmatter keys directly.

**`npx prettier --check` over these paths is VACUOUS** — `.prettierignore:29` is a bare `.planning`,
so prettier matches nothing and exits 0 regardless. It is emitted per the CLAUDE.md convention and
paired with a `grep -qx` that explains the green. **It proves nothing about these files.**
</hazards>

<tasks>

<task type="auto">
  <name>Task 1: Move the Linux todo to completed/ and record the live-gate evidence</name>
  <files>.planning/todos/pending/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md -> .planning/todos/completed/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md</files>
  <action>
Order is load-bearing — move first, edit second.

Step 1. `git mv` the file from `.planning/todos/pending/` to `.planning/todos/completed/`, filename
unchanged. The file is unmodified at this point, so the measured `git mv` hazard cannot arm.

Step 2. Edit the file AT ITS NEW PATH:

(a) Frontmatter: change `status: OPEN` to `status: completed`, and immediately after it add
`resolved: 2026-09-23` and `resolved_by: quick-260923-ohg`. Leave `ready:`, `needs:`, `severity:`,
`platform:`, `created:`, `title:`, `area:`, `found_by:`, `source:` and `files:` byte-identical — see
`<closing_conventions>`.

(b) Rewrite the `## Verification — INCOMPLETE, needs a live Linux leg` heading to name the outcome
(for example `## Verification — SATISFIED 2026-09-23 by run 35808881023`). Keep the existing body
paragraph about the failed local cross-compile — it is a true record of why a desk check was
impossible — and append a new dated subsection recording the live evidence. That subsection must
state, at minimum: run `35808881023`, tag `v0.7.0-notarize-test2` at commit `77f3b4388`, Linux job
`107015694055`, matrix leg `ubuntu-24.04`, conclusion success, `tauri-action` step 02:05:34 ->
02:10:27 (4m53s), the measured **zero** occurrences of `E0599` and of `get_window` across the
3090-line job log, the `Built application at: .../target/release/gamelib-shell` line at 02:08:57,
and the AppImage upload at 02:10:24.

Say plainly what this does and does NOT prove: it proves the Linux leg COMPILES and LINKS
`gamelib-shell` at `77f3b4388`. It does not prove anything about the resulting AppImage running, and
it does not prove anything about the notarization question that shared the run.

(c) Update the pointer to the debug session — the Verification section currently says
"(session not yet archived — awaiting this live verification)". Repoint it at
`.planning/debug/resolved/linux-get-window-e0599.md` and drop the "not yet archived" clause.

(d) **Do NOT touch the closing "Shared provenance" paragraph.** It is a true, run-scoped statement
about run 35223308954 and stays as history (D-4). The verify block asserts its final sentence
verbatim.

Step 3. `git add` the edited file, then prove the staged content carries the new text before you go
any further:

  git show :.planning/todos/completed/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md | grep -c '107015694055'

A zero here means the edit is not in the index — stop and fix it. Do not proceed on a working tree
that merely looks right.
  </action>
  <verify>
    <automated>N=2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md; P=.planning/todos/completed/$N; test -f "$P" || { echo FAIL_NEW_PATH; exit 1; }; if test -e ".planning/todos/pending/$N"; then echo FAIL_OLD_PATH_STILL_THERE; exit 1; fi; for s in 35808881023 107015694055 77f3b4388 v0.7.0-notarize-test2 gamelib-shell ubuntu-24.04; do grep -qF "$s" "$P" || { echo "FAIL_ANCHOR $s"; exit 1; }; done; grep -qx 'status: completed' "$P" || { echo FAIL_STATUS; exit 1; }; grep -qx 'resolved: 2026-09-23' "$P" || { echo FAIL_RESOLVED; exit 1; }; grep -qx 'resolved_by: quick-260923-ohg' "$P" || { echo FAIL_RESOLVED_BY; exit 1; }; grep -qx 'ready: live-gate' "$P" || { echo FAIL_READY_DRIFT; exit 1; }; grep -qx 'needs: verify-fix-on-live-linux-leg' "$P" || { echo FAIL_NEEDS_DRIFT; exit 1; }; grep -qx 'severity: major' "$P" || { echo FAIL_SEVERITY_DRIFT; exit 1; }; grep -qx 'platform: linux' "$P" || { echo FAIL_PLATFORM_DRIFT; exit 1; }; grep -qF 'three matrix legs failed, for three UNRELATED reasons, and all three defects are pre-existing.' "$P" || { echo FAIL_PROVENANCE_ALTERED; exit 1; }; grep -qF 'debug/resolved/linux-get-window-e0599.md' "$P" || { echo FAIL_DEBUG_POINTER; exit 1; }; test "$(git show ":$P" | grep -c '107015694055')" -gt 0 || { echo FAIL_STAGED_CONTENT_MISSING_EDIT; exit 1; }; echo OK</automated>
  </verify>
  <done>The todo is in `completed/`, absent from `pending/`, carries all six live-run anchors and the three closing frontmatter keys, has `ready:`/`needs:`/`severity:`/`platform:` unchanged, has its Shared provenance sentence intact, points at the resolved debug path, and the INDEX (not just the worktree) holds the new text.</done>
</task>

<task type="auto">
  <name>Task 2: Resolve the debug session and repoint it at the completed todo</name>
  <files>.planning/debug/linux-get-window-e0599.md -> .planning/debug/resolved/linux-get-window-e0599.md</files>
  <action>
Same order — move first, edit second.

Step 1. `git mv .planning/debug/linux-get-window-e0599.md .planning/debug/resolved/linux-get-window-e0599.md`
(the destination directory already exists and holds 35 sessions).

Step 2. Edit at the new path:

(a) Frontmatter: `status: awaiting_human_verify` -> `status: resolved`; `updated: 2026-09-21` ->
`updated: 2026-09-23`; and repoint `source_todo:` from the `todos/pending/...` path to
`.planning/todos/completed/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md`.
Do NOT add a `resolved:` key — 30 of the 35 files in `debug/resolved/` do not carry one.

(b) In the `## Resolution` section, the `verification:` field currently ends with "**No sound local
Linux compile check exists on this host.** Verification is honestly incomplete and requires a live
CI leg ...". Keep that text — it is the true record of what the desk could and could not establish —
and append the live outcome to the same field (or as an adjacent `live_verification:` field, your
call): run `35808881023`, Linux job `107015694055`, tag `v0.7.0-notarize-test2` at `77f3b4388`,
`ubuntu-24.04` conclusion success, zero `E0599` and zero `get_window` across the 3090-line job log,
`gamelib-shell` built at 02:08:57. State that this closes the exact gate the field named.

(c) Do not revise the root-cause or fix text. It was confirmed against vendored crate source and is
unaffected.

Step 3. `git add` it, then prove the staged content:

  git show :.planning/debug/resolved/linux-get-window-e0599.md | grep -c '107015694055'

Non-zero required before continuing.
  </action>
  <verify>
    <automated>N=2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md; D=.planning/debug/resolved/linux-get-window-e0599.md; test -f "$D" || { echo FAIL_NEW_PATH; exit 1; }; if test -e .planning/debug/linux-get-window-e0599.md; then echo FAIL_OLD_PATH_STILL_THERE; exit 1; fi; grep -qx 'status: resolved' "$D" || { echo FAIL_STATUS; exit 1; }; grep -qx 'updated: 2026-09-23' "$D" || { echo FAIL_UPDATED; exit 1; }; grep -qx "source_todo: .planning/todos/completed/$N" "$D" || { echo FAIL_SOURCE_TODO_NOT_REPOINTED; exit 1; }; grep -qF '107015694055' "$D" || { echo FAIL_LIVE_ANCHOR; exit 1; }; grep -qF '35808881023' "$D" || { echo FAIL_RUN_ANCHOR; exit 1; }; test -f "$(grep -m1 '^source_todo: ' "$D" | sed 's/^source_todo: //')" || { echo FAIL_SOURCE_TODO_DOES_NOT_RESOLVE; exit 1; }; test "$(git show ":$D" | grep -c '107015694055')" -gt 0 || { echo FAIL_STAGED_CONTENT_MISSING_EDIT; exit 1; }; echo OK</automated>
  </verify>
  <done>The session is in `debug/resolved/`, absent from `debug/`, is `status: resolved` / `updated: 2026-09-23`, and its `source_todo:` both names the `completed/` path AND resolves to a file that exists on disk (that second check is the one that catches a stranded pointer).</done>
</task>

<task type="auto">
  <name>Task 3: Correct the notarization todo's sibling pointer, run the full battery, commit once</name>
  <files>.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md</files>
  <action>
Step 1. In that todo's `## Related` section, replace the final bullet (currently lines 464-467,
beginning `- **STALE pointer:**`) with a corrected one.

The word STALE is wrong and was written by the same author closing it now. The Linux todo was never
stale: its premise held, its fix landed 2026-09-21, and it was deliberately parked as
`ready: live-gate` awaiting evidence that has now arrived. The replacement bullet must say the
sibling is CLOSED/verified by run 35808881023 and must carry the full
`.planning/todos/completed/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md`
path. The word `STALE` must not survive anywhere in the file (it currently appears exactly twice,
both inside this bullet).

Leave the `## Related` bullet at line 460 alone: it is a bare filename with no directory component,
so it strands nothing, and "sibling failure from the same run, unrelated cause" remains true.

**Change nothing else in this file.** Its five frontmatter keys stay byte-identical, it stays
`status: OPEN`, and it stays in `pending/` — its own notarization gate is still unanswered.

Step 2. `git add` it and prove the staged content:

  git show :.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md | grep -c 'completed/2026-09-17-linux-release-leg'

Non-zero required.

Step 3. Confirm no HISTORICAL file was touched. `git status --porcelain` must show exactly five
entries and nothing else: the R-pair for the todo, the R-pair for the debug session (git may render
each rename as one `R` line or as a D/A pair — either is fine), the modified notarization todo, and
this plan file plus the task's SUMMARY. Concretely: `git diff --cached --name-only` must contain no
path under `.planning/quick/260917-8hr`, `.planning/quick/260921-pvt`, `.planning/quick/260923-np3`,
and no `completed/2026-09-17-windows-release-leg` or
`completed/2026-09-21-agents-emit-a-stray-trailing` path.

Step 4. Run the full battery in the verify block below, then commit once. Suggested message:
`docs(quick-260923-ohg): close the Linux release-leg todo on live run 35808881023`.

Prettier: emit `npx prettier --check` over the three paths per the CLAUDE.md convention, but pair it
with `grep -qx '.planning' .prettierignore` so the green is explained. **It is vacuous here and
proves nothing about these files.**
  </action>
  <verify>
    <automated>set -u; N=2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md; LT=.planning/todos/completed/$N; DS=.planning/debug/resolved/linux-get-window-e0599.md; NT=.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md; f(){ echo "FAIL: $1"; exit 1; }; test -f "$LT" || f new-todo-path; if test -e ".planning/todos/pending/$N"; then f old-todo-path-still-present; fi; test -f "$DS" || f new-debug-path; if test -e .planning/debug/linux-get-window-e0599.md; then f old-debug-path-still-present; fi; for s in 35808881023 107015694055 77f3b4388 v0.7.0-notarize-test2 gamelib-shell ubuntu-24.04; do grep -qF "$s" "$LT" || f "todo-anchor-$s"; done; grep -qx 'status: completed' "$LT" || f todo-status; grep -qx 'resolved: 2026-09-23' "$LT" || f todo-resolved; grep -qx 'resolved_by: quick-260923-ohg' "$LT" || f todo-resolved-by; grep -qx 'ready: live-gate' "$LT" || f todo-ready-drift; grep -qx 'needs: verify-fix-on-live-linux-leg' "$LT" || f todo-needs-drift; grep -qx 'severity: major' "$LT" || f todo-severity-drift; grep -qx 'platform: linux' "$LT" || f todo-platform-drift; grep -qF 'three matrix legs failed, for three UNRELATED reasons, and all three defects are pre-existing.' "$LT" || f provenance-paragraph-altered; grep -qx 'status: resolved' "$DS" || f debug-status; grep -qx 'updated: 2026-09-23' "$DS" || f debug-updated; grep -qx "source_todo: .planning/todos/completed/$N" "$DS" || f debug-source-todo-not-repointed; grep -qF '107015694055' "$DS" || f debug-live-anchor; grep -qF 'completed/2026-09-17-linux-release-leg' "$NT" || f notarization-not-repointed; test "$(grep -c 'STALE' "$NT")" -eq 0 || f notarization-still-says-stale; grep -qx 'status: OPEN' "$NT" || f notarization-status-changed; grep -qx 'ready: live-gate' "$NT" || f notarization-ready-changed; grep -qx 'needs: retag-and-confirm-notarization-accepted' "$NT" || f notarization-needs-changed; test "$(grep -rl "todos/pending/$N" .planning/debug .planning/todos/pending 2>/dev/null | wc -l | tr -d ' ')" -eq 0 || f a-live-doc-still-points-at-the-old-pending-path; if git diff --cached --name-only | grep -Eq '260917-8hr|260921-pvt|260923-np3|completed/2026-09-17-windows-release-leg|completed/2026-09-21-agents-emit'; then f historical-artifact-modified; fi; grep -qx '.planning' .prettierignore || f prettierignore-assumption-broken-prettier-green-is-no-longer-vacuous; npx prettier --check "$LT" "$DS" "$NT" || f prettier; pnpm planning-gates | tail -3 | grep -q '12/12 planning gates passed' || f planning-gates; echo ALL_OK</automated>
    <automated>git status --porcelain; test -z "$(git status --porcelain)" || { echo "FAIL: working tree not clean after commit"; exit 1; }; echo CLEAN</automated>
  </verify>
  <done>The notarization todo names the `completed/` path, contains no `STALE`, and its status/ready/needs are unchanged; no historical artifact is staged; all four cross-file assertions hold; `pnpm planning-gates` is 12/12; the tree is clean after a single commit.</done>
</task>

</tasks>

<verification>
The Task 3 verify block is the phase-level check. It was controlled in BOTH directions at plan time
before this plan shipped:

- **Negative control:** run against the current tree (HEAD `3906a6af0`) it FAILS at the first
  assertion (`todo absent from completed/`).
- **Positive control:** run against a simulated completion built in a scratch tree — todo moved and
  frontmatter amended, debug session moved and repointed, notarization bullet rewritten — it PASSES
  (`FILE/CONTENT ASSERTIONS OK`).
- **Mutation-proven load-bearing**, four mutations applied to the passing simulated tree, each
  turning it red with the right message: (1) `source_todo:` left on the pending path ->
  `debug source_todo not repointed at completed/`; (2) a stray `STALE` reintroduced into the
  notarization todo -> `notarization todo still calls the Linux sibling STALE`; (3) the Shared
  provenance sentence reworded -> `Shared provenance paragraph altered (D-4 forbids)`; (4)
  `107015694055` scrubbed from the debug session -> `debug session missing live-run anchor`.

Only `pnpm planning-gates` and the `git status --porcelain` cleanliness check were not simulated;
both are established at baseline (12/12 PASS, clean tree at `3906a6af0`).
</verification>

<success_criteria>
- `.planning/todos/completed/2026-09-17-linux-release-leg-...md` exists and records run 35808881023 /
  job 107015694055 / tag `v0.7.0-notarize-test2` @ `77f3b4388` as the live evidence.
- `.planning/debug/resolved/linux-get-window-e0599.md` exists, is `status: resolved`, and its
  `source_todo:` resolves to an existing file.
- Neither old path exists; no LIVE document points at either.
- The notarization todo names the `completed/` path, contains no `STALE`, and is otherwise unchanged
  and still OPEN in `pending/`.
- No source file, tag, workflow or release was touched.
- `pnpm planning-gates` 12/12; `git status --porcelain` empty.
</success_criteria>

<out_of_scope>
- `src-tauri/src/main.rs` and every other source file — the fix shipped 2026-09-21 (D-6).
- Creating, pushing or deleting any git tag; triggering any workflow; touching any release (D-7).
  The `v0.7.0` draft whose `latest.json` is currently Linux-only is a separate, still-open concern
  owned by the notarization todo.
- The closing "Shared provenance" paragraph (D-4).
- Every file in the HISTORICAL column of `<reference_classification>` (D-5).
- The notarization todo's own live gate — it remains unanswered and that todo stays OPEN.
</out_of_scope>

<output_artifact>
Create `.planning/quick/260923-ohg-close-the-linux-release-leg-todo/260923-ohg-SUMMARY.md` when done.
</output_artifact>
