---
phase: quick-260926-mja
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md
  - .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md
autonomous: true
requirements:
  - QUICK-260926-MJA
estimate:
  tokens: 34000
  raw_tokens: 17000
  tasks: 2
  confidence: low
must_haves:
  truths:
    - The migration todo no longer sits in `.planning/todos/pending/`; it sits in `.planning/todos/completed/` under the same filename.
    - Its body records the migration as ALREADY DONE on this Mac (gsd-core 1.14.0, 2026-09-26), not as pending work timed to a future repo setup on the operator's other OS.
    - Steps 1 and 3 are recorded as satisfied by OUTCOME, with the procedure stated plainly as not performed - no dry-run, no scratch config-dir trial, no per-gate passes/breaks/redundant record.
    - Step 2's fallback snapshot is recorded as never taken and accepted as residual risk, with NO new todo spun out for it.
    - Running `pnpm planning-gates` reports 12/12 after the rename is staged.
    - The commit's staged file list contains only this todo's two paths and this quick task's own directory.
  artifacts:
    - .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md
  key_links:
    - The rename must be staged with `git mv` BEFORE `pnpm planning-gates` runs - `.planning/planning-envelope-tag-gate.py` enumerates its corpus via `git ls-files`, so a plain `mv` leaves it opening a path that no longer exists.
    - The `.planning/todos/pending/` directory must stay non-empty - `todo-frontmatter-gate.py` hard-fails on a zero-file glob. Measured at planning time - 19 pending todos, so removing one is safe.
---

<objective>
Close the gsd-core migration todo, which is stale rather than unfinished. It decides to migrate,
timed to a future repo setup on the operator's other OS, but the migration already happened on this
Mac on 2026-09-26, ahead of that ordering, and nothing closed the todo.

Purpose: a `ready: human` todo describing work that is already done is a rotten blocker - it sits
out of the desk-ready sweep forever and its stated plan actively misdescribes reality.

Output: the same file, rewritten to record what actually happened, moved to
`.planning/todos/completed/`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md

# Deliberately NOT referenced: .planning/STATE.md (1.3MB). Its two mentions of this todo - the
# 260925-o9b decision-log lines and the 260925-o9b quick-task table row - are HISTORICAL RECORDS
# and stay verbatim, the same call 260925-o9b itself made for the three records it found. Checked
# at planning time: this todo is NOT listed in STATE.md's `### Pending Todos` section, so there is
# no stale live index pointer to fix. Do not edit STATE.md in this plan.
#
# Deliberately NOT referenced: the 260926-m91 quick task directory. Different task, and it
# committed itself during this planning session - see the absorption bullet below.
</context>

<measured_at_planning_time>
Every fact below was measured in this repo or on this machine during planning. Do not re-derive
them from memory; DO re-verify any you restate as a claim in the todo body.

- `cat ~/.claude/gsd-core/VERSION` -> `1.14.0`.
- `find ~/.claude/get-shit-done -type f | wc -l` -> `0`. The directory still exists; its subdirs
  (`bin`, `contexts`, `references`, `templates`, `workflows`) are all empty. It is a skeleton.
- `npm ls -g --depth=0` -> `gsd-pi@3.0.0` and `npm@11.13.0` only. No `get-shit-done-cc`. The
  `~/AppData/Roaming/npm/node_modules/get-shit-done-cc` path the todo's step 2 names is the
  OTHER machine's path and does not exist here.
- `pnpm planning-gates` -> `12/12 planning gates passed.` (baseline, before any edit).
- `ls .planning/todos/pending/*.md | wc -l` -> `19`.
- `.planning/planning-frontmatter-gate.py` targets ONLY `.planning/STATE.md` and
  `.planning/ROADMAP.md`. It places no constraint on todo frontmatter keys.
- `.planning/todos/todo-frontmatter-gate.py` asserts `PENDING_DIR.name == "pending"` and scopes to
  `pending/` only; its own comment states `completed/` is deliberately exempt because it holds
  100+ historical files written before the convention existed. It also hard-fails if `pending/`
  globs zero files, which is why the 19-file count above matters.
- 166 of 232 files in `.planning/todos/completed/` carry a `status:` frontmatter key recording the
  closure. That is the house convention for a closed todo.
- `grep -n "1\.42\.3" CLAUDE.md` -> lines 295, 303, 306, 328, 367 only, every one historical
  provenance. `grep -n "pinned" CLAUDE.md` returns nothing matching the old wording. The
  "pinned `v1.42.3`" text step 3 targeted is already gone.
- **`.prettierignore` lists `.planning`.** Measured both ways: `npx prettier --check` over a
  `.planning` path prints "All matched files use Prettier code style!" having matched ZERO files,
  while the same path under `--ignore-path /dev/null` warns "Code style issues found" on the
  CURRENT, untouched todo. So the pass is vacuous, forcing a real check would fail on pre-existing
  content, and `--write` would reformat the whole file into unrelated churn. `.husky/pre-commit`
  states the same in its own comment: ignored paths "exit 0, so `.planning/*.md` ... pass through
  untouched". STATE.md's 260925-o9b row already recorded this, proven there with a deliberately
  misformatted probe that came back clean.
- **The absorption risk MOVED DURING PLANNING, and the live reading is what governs.** When this
  task was briefed, `.planning/quick/260926-m91-...` was the working tree's single untracked path.
  Re-measured at the END of planning: that task committed itself as `06d751032`, so its directory
  is now TRACKED and clean, and `git status --porcelain` shows only THIS task's own directory.
  Do not plan against the briefed reading. The consequence is not that the risk went away - it
  CHANGED SHAPE and got harder to name in advance: that session is concurrent and shares this
  working tree (worktrees are effectively off here, so every session sits on `main`), and it can
  stage new work at any moment between the executor's steps. So the load-bearing check is the
  PREFIX ALLOWLIST over the staged set, which rejects any foreign path whatever its name - not the
  by-name assertion, which is now a check on a path that is currently clean and is kept only as a
  cheap regression tripwire. Measured precedent for why this matters at all: 260925-o9b's first
  commit swept in two VERIFICATION files belonging to a concurrently-running session and had to be
  recovered with `git reset --soft HEAD~1`.
</measured_at_planning_time>

<tasks>

<!-- Tracer-first decomposition does not apply here: a documentation closure has no layers to wire
     end-to-end, and a thinner slice than "rewrite the body" would not be runnable. Two `auto`
     tasks - content, then move+gate+commit - because the rename must be staged in the same
     invocation as the gate run. -->

<task type="auto">
  <name>Task 1: Rewrite the todo body to record what actually happened (in place, still under pending/)</name>
  <files>.planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md</files>
  <read_first>.planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md</read_first>
  <action>
Rewrite this file in place. Do NOT move it yet - Task 2 owns the rename. Do NOT create a second
todo file for the closure.

KEEP UNCHANGED, byte for byte: the `created:`, `area:`, `severity: medium`, `platform: any`,
`ready: human` and `found_by:` frontmatter keys, and `files: []`. `completed/` is exempt from the
todo frontmatter gate, so there is no reason to strip or retune them, and no new vocabulary value
may be introduced into `severity`/`platform`/`ready`.

KEEP UNCHANGED, verbatim: the research sections `## Why that pin is now a dead end`,
`## What the successor is` and `## Research, 2026-09-26`, including the comparison table, the
name-trap paragraph, the other-forks paragraph and the pros/cons lists. They are the reasoning that
produced a correct decision and they are still accurate. Only the framing around them changes.

CHANGE the `title:` frontmatter value to exactly:

title: "Migrated off deprecated get-shit-done-cc 1.42.3 to @opengsd/gsd-core 1.14.0 - done on the Mac 2026-09-26, ahead of the planned ordering"

ADD a `status:` frontmatter key immediately after `title:`. This is the convention 166 of the 232
files in `completed/` follow. Its value names the closing quick task `260926-mja` and the date
2026-09-26, then in one clause each: that gsd-core 1.14.0 is installed; that steps 1 and 3 were
satisfied by outcome rather than by procedure; and that step 2's snapshot was never taken and is
accepted residual risk. Keep the value on ONE line, single- or double-quoted, with no unescaped
quote character of the same kind inside it - STATE.md's frontmatter was invalid YAML for weeks over
exactly that mistake.

RETITLE the `# ` H1 to match the new `title:` value.

REPLACE `## What GameLib pins` with a past-tense section recording that the pin is gone: the global
package is absent from `npm ls -g --depth=0`, which lists only `gsd-pi@3.0.0` and `npm@11.13.0`;
`~/.claude/get-shit-done/` survives as an empty skeleton, with a measured `find -type f` count of 0
across all five of its subdirectories; `~/.claude/gsd-core/VERSION` reads `1.14.0`. Record that the
`~/AppData/Roaming/npm/node_modules/get-shit-done-cc` path this section used to cite was the other
machine's path, never this one's.

REWRITE `## The decision, and its blast radius` to record the OUTCOME. The decision itself stands
and was right; what did not hold is its timing. Delete the clause tying the migration to a future
repo setup on the operator's other OS, and delete the paragraph arguing why that setup was the
right moment - the install happened here on the Mac instead, so the machine-wide half of the blast
radius that paragraph promised to avoid was simply taken on. Do not restate the deleted timing
clause anywhere in the file, in any casing; paraphrase it. Then say plainly that nothing closed
this todo at the time, and name why it went unnoticed: neither downstream quick task referenced it
(measured - a recursive `grep -rln` for this todo's filename slug across `.planning/` returns only
STATE.md, the creating task 260925-o9b's own PLAN and SUMMARY, and the completed todo it was spun
out of), so there was no autoclose, and `ready: human` kept it off the desk-ready sweep that
`grep -l 'ready: code' .planning/todos/pending/*.md` drives.

REPLACE `## Steps` with a section recording each step's real disposition. Do not dress any of it
up:

- Steps 1 and 3 were satisfied by OUTCOME, NOT by procedure. State explicitly that no
  `npx @opengsd/gsd-core@latest --dry-run` was run, that no scratch `--config-dir` install was
  trialled alongside the real `~/.claude`, and that the per-gate record step 1 asked for - passes,
  breaks, now redundant - was never produced. What exists instead is the outcome:
  `pnpm planning-gates` reports 12/12 under gsd-core, and exactly one gate was resolved rather than
  ported. Quick task 260926-kkt retired the UAT visibility gate on the finding that it copied
  1.42.3's `parseUatItems` regex verbatim and so, after the migration, was counting against a
  parser nobody runs; the anti-vacuity floor in `meta/runPlanningGates.py` moved 13 to 12, the
  first lowering in its history, with the reason recorded in that file. Step 3's remaining item is
  also already done: the "pinned `v1.42.3`" wording it targeted is gone from CLAUDE.md, whose five
  surviving 1.42.3 mentions are all historical provenance and correct as written.
- Step 2's fallback snapshot was NEVER TAKEN, and is recorded here as accepted risk rather than
  spun out as a new todo. There is no local action left: the legacy tree is an empty skeleton and
  the global package is gone, so there is nothing on this machine to snapshot, and a todo for
  something that cannot be done locally would be a rotten blocker. Record the residual honestly -
  recovering 1.42.3 now depends entirely on it remaining published on npm, which this same todo's
  own research section warns against assuming, because the deprecation is npm's generic staff-set
  message and staff-set deprecations sometimes precede removal.

Do NOT add a `## Verification` section promising future work. This todo is closed, not handed on.
Do NOT edit CLAUDE.md in this task.
  </action>
  <acceptance_criteria>
    - The `title:` line names `@opengsd/gsd-core 1.14.0` and no longer names the operator's other OS.
    - A `status:` key is present in frontmatter and names `260926-mja`.
    - `severity: medium`, `platform: any` and `ready: human` are each still present, bare and unquoted.
    - The body cites `1.14.0`, `260926-kkt`, `accepted risk`, and the never-run `--dry-run`.
    - The stale timing clause is absent from the whole file, in any casing.
    - The frontmatter still parses as a YAML mapping after the `status:` addition.
  </acceptance_criteria>
  <verify>
    <automated>F=.planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md; test "$(grep -ic 'local repo on Linux' "$F")" = 0 && test "$(grep -c '^title:.*Linux' "$F")" = 0 && echo STALE_TIMING_GONE</automated>
    <fails_when>The stale timing clause survives anywhere in the body (case-insensitive), or the `title:` line still names the operator's other OS. Both are the exact "rewrote the framing but left the old claim standing" failure this task exists to prevent. Prints nothing and exits non-zero.</fails_when>

    <automated>F=.planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md; test "$(grep -c '^title:.*1\.14\.0' "$F")" = 1 && test "$(grep -c '^status:.*260926-mja' "$F")" = 1 && test "$(grep -c '^severity: medium$' "$F")" = 1 && test "$(grep -c '^platform: any$' "$F")" = 1 && test "$(grep -c '^ready: human$' "$F")" = 1 && test "$(grep -c '260926-kkt' "$F")" -ge 1 && test "$(grep -c 'accepted risk' "$F")" -ge 1 && test "$(grep -c 'dry-run' "$F")" -ge 1 && echo CLOSURE_CONTENT_OK</automated>
    <fails_when>Any required positive marker is absent: the new title, the `status:` closure key naming this quick task, one of the three preserved triage keys (bare and unquoted, so a stray quote or a changed value fails), the 260926-kkt citation, the accepted-risk record, or the statement that the dry-run never happened. Prints nothing and exits non-zero.</fails_when>

    <automated>node -e "const fs=require('fs'),yaml=require('js-yaml');const t=fs.readFileSync(process.argv[1],'utf8');const m=t.match(/^---\n([\s\S]*?)\n---\n/);if(!m)throw new Error('no frontmatter block');const d=yaml.load(m[1]);if(typeof d!=='object'||d===null||Array.isArray(d))throw new Error('frontmatter is not a mapping');for(const k of ['created','title','status','area','severity','platform','ready'])if(!(k in d))throw new Error('missing key: '+k);console.log('YAML_OK');" .planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md</automated>
    <fails_when>The `status:` value's quoting broke the YAML mapping - the exact defect `.planning/planning-frontmatter-gate.py` was written for, where an unescaped quote inside a quoted scalar terminated it early and nine green gates stayed blind for weeks. That gate does NOT cover todo files, so this is the only parse check on this edit. Throws and exits non-zero.</fails_when>

    <automated>npx prettier --check .planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md</automated>
    <fails_when>Nothing. THIS CHECK IS VACUOUS BY DESIGN and is recorded as such: `.prettierignore` lists `.planning`, so prettier matches ZERO files here and prints "All matched files use Prettier code style!" regardless of content. Measured at planning time - the same path under `--ignore-path /dev/null` warns on the CURRENT, untouched file. It is run because CLAUDE.md requires the formatter check over the exact paths written, and it is annotated because a green that proves nothing must never be read as formatting assurance. DO NOT "fix" this by forcing `--ignore-path /dev/null`: that fails on pre-existing content, and `--write` would reformat the whole file into unrelated churn. Formatting here rests on hand-matching the surrounding corpus, exactly as 260925-o9b recorded.</fails_when>
  </verify>
  <done>The file, still at its `pending/` path, carries the new title, a `status:` closure key, the three untouched triage keys, and a body whose `## What GameLib pins`, decision and steps sections describe a completed migration. Frontmatter parses as a YAML mapping. The stale timing clause appears nowhere.</done>
</task>

<task type="auto">
  <name>Task 2: Move the todo to completed/, prove 12/12 gates, and commit explicit paths only</name>
  <files>.planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md</files>
  <action>
Do these five steps IN THIS ORDER. The order is the whole point of the task; reordering it arms a
measured failure.

1. Rename with `git mv`, NEVER a plain `mv`, keeping the filename byte-identical:

   git mv .planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md

   `git mv` stages the rename in one step. A plain `mv` leaves `.planning/planning-envelope-tag-gate.py`
   enumerating its corpus via `git ls-files`, which still reports the `pending/` path, and the gate
   then crashes opening a file that no longer exists - a crash that reads as a content failure and
   is not one.

2. Stage this quick task's own directory, by EXPLICIT path, nothing else:

   git add .planning/quick/260926-mja-close-the-stale-gsd-core-migration-todo/

   Never `git add -A`, never `git add .`, and do not reach for the gsd-sdk commit verb: it has been
   measured on this repo to stage the entire working tree, which is precisely how an unrelated
   directory gets absorbed.

3. Run `pnpm planning-gates` now that the index is final, and require the literal line
   `12/12 planning gates passed.` The gate corpus is index-derived, so running it before step 1 or
   between steps 1 and 2 measures a tree nobody is committing. Two things this proves and one it
   does not: it proves the envelope-tag gate still reads every tracked planning document at its new
   path, and that `todo-frontmatter-gate.py` still finds a non-empty `pending/` - which drops 19 to
   18, so its zero-file hard-fail cannot arm. It does NOT prove anything about the moved file's
   triage keys, because that gate is scoped to `pending/` only and the moved file has left its
   scope. Task 1's greps are the only check on those keys, and they already ran.

4. Assert the staged file list BEFORE committing. A concurrent session shares this working tree
   and can stage its own work between your steps, so do not trust a tree reading taken earlier -
   assert the index as it stands at commit time. Read the
   list with `git diff --cached --name-only --no-renames` - `--no-renames` is required so the
   rename shows as both its old and its new path rather than collapsing to one, which is what makes
   the allowlist below able to see the whole move. Require all three of: every line falls under
   either this todo's `pending/`-or-`completed/` path or
   `.planning/quick/260926-mja-close-the-stale-gsd-core-migration-todo/`; the list is at least two
   lines long, which is the non-vacuity control that stops an empty index from passing the
   allowlist trivially; and the string naming the other quick task appears zero times. If the
   assertion fails, do NOT commit - unstage the foreign paths with `git restore --staged` and
   re-assert.

5. Commit the staged paths with a message in the house style of recent history:

   docs(quick-260926-mja): close the stale gsd-core migration todo

   Add a body recording, in one line each, that the migration had already happened on this Mac
   ahead of the planned ordering, that steps 1 and 3 were satisfied by outcome rather than
   procedure, and that step 2's snapshot was never taken and is accepted residual risk with no todo
   spun out. End the message with exactly:

   Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

Do NOT edit CLAUDE.md in this task - its five 1.42.3 mentions are correct historical provenance.
Do NOT edit STATE.md's 260925-o9b decision-log lines or quick-task table row - they are historical
records and stay verbatim, the same call 260925-o9b itself made.
  </action>
  <acceptance_criteria>
    - `.planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md` exists; the `pending/` path does not.
    - `ls .planning/todos/pending/*.md | wc -l` is 18, down from the 19 measured at planning time.
    - `pnpm planning-gates` prints `12/12 planning gates passed.`
    - The pre-commit staged list contains only this todo's two paths and this quick task's own directory, is at least two lines long, and names the other quick task zero times.
    - `HEAD` touches only those same paths, and its message ends with the required attribution line.
  </acceptance_criteria>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md && test -f .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md && test "$(ls .planning/todos/pending/*.md | wc -l | tr -d ' ')" = 18 && echo MOVE_OK</automated>
    <fails_when>The file is still at its `pending/` path, never arrived at `completed/`, or was copied rather than moved so both paths exist. The `18` also fails if the rename landed while something else added or removed a pending todo, which is worth knowing before committing. Prints nothing and exits non-zero.</fails_when>

    <automated>OUT=$(pnpm planning-gates 2>&1) || { printf '%s\n' "$OUT" | tail -20; exit 1; }; printf '%s\n' "$OUT" | grep -qxF '12/12 planning gates passed.' && echo GATES_12_OF_12</automated>
    <fails_when>Any gate went red, or the count is no longer 12. The most likely cause by far is running this before the rename was staged: `planning-envelope-tag-gate.py` builds its corpus from `git ls-files` and will crash opening the now-absent `pending/` path, which reads as a content failure and is not one. A count ABOVE 12 is also a failure here, not a bonus - it means a gate was added without this plan knowing. Prints nothing and exits non-zero.</fails_when>

    <!-- planner-discipline-allow: 260926-m91 -->
    <automated>S=$(git diff --cached --name-only --no-renames) || exit 1; test "$(printf '%s\n' "$S" | grep -cv '^\.planning/todos/\(pending\|completed\)/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc\.md$\|^\.planning/quick/260926-mja-close-the-stale-gsd-core-migration-todo/')" = 0 && test "$(printf '%s\n' "$S" | grep -c .)" -ge 2 && test "$(printf '%s\n' "$S" | grep -c '260926-m91')" = 0 && echo STAGED_SET_CLEAN</automated>
    <fails_when>The index carries a path outside the two allowed groups. The PREFIX ALLOWLIST is the load-bearing half, because the real risk is a concurrent session on this shared working tree staging something whose name nobody could predict - the `260926-m91` clause is a cheap tripwire on a path that was the briefed risk but committed itself during planning, not the threat model. The `-ge 2` line-count is the non-vacuity control: without it an EMPTY index satisfies the allowlist trivially and this check would go green over a commit that stages nothing. Run this BEFORE committing; after the commit the index is empty and the check self-invalidates, which is why the next check exists. Prints nothing and exits non-zero.</fails_when>

    <automated>H=$(git show --format= --name-only --no-renames HEAD) || exit 1; M=$(git log -1 --format=%B) || exit 1; test "$(printf '%s\n' "$H" | grep -cv '^\.planning/todos/\(pending\|completed\)/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc\.md$\|^\.planning/quick/260926-mja-close-the-stale-gsd-core-migration-todo/')" = 0 && test "$(printf '%s\n' "$H" | grep -c .)" -ge 2 && test "$(printf '%s\n' "$M" | grep -cF 'Co-Authored-By: Claude Opus 5 (1M context)')" = 1 && echo COMMIT_CLEAN</automated>
    <fails_when>The landed commit absorbed a foreign path, touched fewer than two files, or is missing the attribution line. This is the post-hoc twin of the staged-set assertion and exists because the staged check self-invalidates the moment the commit is made - so without this one, nothing proves the thing that actually landed in history. Prints nothing and exits non-zero.</fails_when>

    <automated>npx prettier --check .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md</automated>
    <fails_when>Nothing. VACUOUS BY DESIGN, identical to Task 1's formatter line and annotated for the same reason: `.prettierignore` lists `.planning`, so this matches ZERO files and passes on any content. It is run because CLAUDE.md requires the formatter check over the exact paths written; it is annotated so the green is never mistaken for formatting assurance. `.husky/pre-commit` will likewise pass this file through untouched - its own comment says ignored paths exit 0, naming `.planning/*.md`. Do NOT force it with `--ignore-path /dev/null`: measured at planning time, that warns on the file's pre-existing content, and `--write` would reformat the whole document into churn unrelated to this closure.</fails_when>
  </verify>
  <done>The todo lives at its `completed/` path under the original filename, `pending/` holds 18 files, `pnpm planning-gates` reports 12/12, and one commit exists whose file list is confined to this todo's two paths plus this quick task's own directory, carrying the required attribution line. The other quick task's directory is still untracked and untouched.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary                      | Description                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none crossed                  | Documentation-only change confined to `.planning/`. No runtime code, no network call, no credential, no user input, no new dependency, no package-manager install. |
| working tree -> git history   | The one real boundary: an over-broad `git add` can carry a concurrent session's unrelated work into this commit.                                                   |

## STRIDE Threat Register

| Threat ID   | Category  | Component                     | Severity | Disposition | Mitigation Plan                                                                                                                                                                                     |
| ----------- | --------- | ----------------------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-MJA-01    | Tampering | the commit's staged file list | medium   | mitigate    | Task 2 steps 2 and 4: explicit-path staging only, then an allowlisted `git diff --cached --name-only --no-renames` assertion with a non-vacuity floor and a by-name exclusion, run BEFORE committing. |
| T-MJA-02    | Tampering | the landed commit             | medium   | mitigate    | Task 2's post-commit `git show --name-only` twin, because the staged-set assertion self-invalidates once the commit exists.                                                                          |
| T-MJA-03    | Repudiation | the closure record          | low      | mitigate    | The rewritten body states what was NOT done (no dry-run, no scratch config-dir trial, no per-gate record, no snapshot) rather than implying the procedure was followed.                               |
| T-MJA-04    | Tampering | npm/pip/cargo installs        | low      | accept      | No package-manager install task exists in this plan, so the package-legitimacy gate has nothing to audit. `npx prettier` resolves the already-installed local binary; no new package is fetched.     |
</threat_model>

<verification>
Phase-level checks, run after both tasks:

1. `pnpm planning-gates` prints `12/12 planning gates passed.`
2. `.planning/todos/pending/` holds 18 `*.md` files; `.planning/todos/completed/` holds 233.
3. The closed todo's frontmatter parses as a YAML mapping carrying `created`, `title`, `status`, `area`, `severity`, `platform` and `ready`.
4. `git status --porcelain` shows nothing belonging to this task left unstaged or unexpected. Note the `260926-m91` directory is now TRACKED and clean - it committed itself as `06d751032` during planning - so its absence from the untracked list is correct, not a sign it was absorbed.
5. The stale timing clause returns zero case-insensitive matches anywhere in the closed todo.

Known-vacuous, recorded not hidden: the `npx prettier --check` lines in both tasks match zero files,
because `.prettierignore` lists `.planning`. They are run to honour CLAUDE.md's standing formatter
requirement and annotated so nobody reads the green as formatting assurance.
</verification>

<success_criteria>
- The gsd-core migration todo is at `.planning/todos/completed/`, same filename, and its body records a COMPLETED migration - gsd-core 1.14.0 on this Mac, 2026-09-26, ahead of the planned ordering - not pending work.
- Steps 1 and 3 are recorded as satisfied by outcome, with the procedure named plainly as not performed.
- Step 2's snapshot is recorded as never taken and accepted as residual risk, with NO new todo spun out and the npm-availability dependency stated.
- `pnpm planning-gates` is 12/12.
- One commit, confined to this todo's two paths plus this quick task's own directory, carrying the required attribution line.
- CLAUDE.md and STATE.md are untouched.
</success_criteria>

<output>
Create `.planning/quick/260926-mja-close-the-stale-gsd-core-migration-todo/260926-mja-SUMMARY.md` when done.

In it, record honestly: that the formatter check over both written paths was a NO-OP rather than a
passed gate, and why; that steps 1 and 3 of the original todo were discharged by outcome rather than
by the procedure they specified; and that step 2's fallback snapshot is closed as accepted risk with
no local action available.
</output>