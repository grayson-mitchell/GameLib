---
phase: quick-261027-cwy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md
  - .planning/todos/completed/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md
autonomous: true
requirements: [REQ-34.4.1-GAP-11]

must_haves:
  truths:
    - "The F-9 todo is in .planning/todos/completed/ under its original filename, and is gone from pending/"
    - "It ends with a concise '## RETIRED 2026-10-27 (quick task 261027-cwy)' section that keeps Q1 UNDETERMINED (never rounded to no) and states 2026-09-07 to 2026-10-22 was UNOBSERVED"
    - "Frontmatter status: is a single line saying it was retired and why; the historical keys are byte-identical to before"
    - "pnpm planning-gates passes"
    - "Only the moved todo (and any live-index reference fixes) is staged and committed"
  artifacts:
    - path: ".planning/todos/completed/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md"
      provides: "Retired F-9 todo"
      contains: "## RETIRED 2026-10-27 (quick task 261027-cwy)"
  key_links:
    - from: "RETIRED section"
      to: ".planning/todos/completed/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md"
      via: "cites the known, fixed cause of all 27 channel=launch recurrences (261026-jmm)"
      pattern: "261026-jmm"
---

<objective>
Retire the F-9 generic RPC timeout todo. The operator has decided this. Q2's unpark trigger fired, but
all 27 recurrences are `channel=launch`. That cause is already known and was fixed by 261026-jmm. No
cookie-leg timeout appears in any log we still have. Q1 (id=1575) stays UNDETERMINED for good.

Purpose: close a parked todo whose trigger fired and was fully explained, without turning the unknown
into a "no".
Output: the todo with a RETIRED section appended, moved to completed/ with `git mv`, plus fixes to any
live-index references, committed on its own.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md

Load Skill("gamelib-conventions") before you start. Two of its rules apply here: the todo-triage
frontmatter rule and the `<verify>` prettier rule.

The todo is 442 lines long. Its sections, in order: the original finding, then dispositions dated
2026-08-25, 2026-09-05 (260905-omc), 2026-09-07 (260907-fni, 260907-j8n), then "CLOSED AS UNANSWERABLE
2026-09-07" (Q1), "PARKED 2026-09-07" (Q2, which includes the unpark grep and the 537-line / count-0
baseline), and last "Cross-reference (2026-09-21, 260921-saw)".

Evidence (FACT, observed live by the orchestrator on 2026-10-27 NZDT). You may re-run these greps to
quote output, but these are the authoritative numbers. If a re-run gives a different count (the log is
live), report both numbers and do not overwrite these.
- `grep -c 'invoke abandoned\|unknown/timed-out' ~/Library/Logs/GameLib/gamelib-shell.log` returned **27**.
  The file had 1397 lines. Its earliest entry is epoch 1792651220 = 2026-10-22 19:40 NZDT. The file has
  rotated or been truncated since the 2026-09-07 baseline (537 lines, count 0), so **2026-09-07 to
  2026-10-22 is UNOBSERVED**. Do not describe that window as clean.
- All 27 matches are `channel=launch`, across pids 20824, 58139, 13798, 98083 and 5294. None is a cookie
  channel. Example lines:
  `1792653908 pid=20824 response for unknown/timed-out id=8169 channel=launch (dropped)` and
  `1792962084 pid=5294 invoke abandoned (timeout): id=2809 channel=launch`.
- Known cause: bridge-launch timeouts during the first launch's redist install, fixed by quick task
  `261026-jmm`. It added `launch` to `LONG_RUNNING_CHANNELS` (`src-tauri/src/main.rs:1552`; doc comment
  at main.rs:1470). Its todo is
  `.planning/todos/completed/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md`.
- Cookie leg: `grep 'rustInvoke timed out.*humble_login_cookies'` returned 0 in each of the 7
  `~/Library/Logs/GameLib/gamelib.log*` files, and there were 0 `rustInvoke timed out` lines of any kind.

Pre-checked by the planner, to save a lookup. Confirm both points yourself.
- The gate is `pnpm planning-gates`, which runs `python3 meta/runPlanningGates.py`. Its comment at about
  line 54 refers to frontmatter that `.planning/todos/pending/` "must carry". It appears to scan pending/
  only. Confirm whether it reads completed/ at all.
- The completed 2026-10-25 bridge-launch todo still carries `severity: minor`, `platform: macos` and
  `ready: live-gate`. So completed todos seem to keep their triage keys unchanged rather than being
  rewritten.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Learn the completed-todo convention, append the RETIRED section, set status</name>
  <files>.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md</files>
  <action>
Step A, research before editing (no writes yet):
- Read `meta/runPlanningGates.py` and record two things: whether it globs `.planning/todos/completed/`,
  and the exact allowed values for `severity`, `platform` and `ready`.
- Read the frontmatter (first ~25 lines) of
  `.planning/todos/completed/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md`
  and `.planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md`.
- Run `grep -l '^status:' .planning/todos/completed/*.md | head` and read a few `status:` / `ready:`
  lines, to see how a closure is usually worded. Check whether closed or parked todos use any closure
  key such as `closed:`, `resolved:` or `retired:`.
- Follow what you find. Do NOT invent new keys. Do NOT widen the gate's vocabulary.

Step B, frontmatter. Replace only the value of `status:` with one line: retired on 2026-10-27 by quick
task 261027-cwy, because Q2's unpark trigger fired (27 matches) and every recurrence was
`channel=launch`, already fixed by 261026-jmm, with no cookie-leg timeout in any retained log; Q1
(id=1575) remains UNDETERMINED. Keep it as one quoted YAML string.
- `ready:` should stay `blocked`, because that is a valid gate value and completed todos keep their
  triage keys. Change it only if Step A shows that completed todos get a different `ready:` value; if
  you change it, record the evidence in the SUMMARY.
- If Step A shows a closure-date key is conventional, add it in the house style.
- Leave every other key byte-identical: created, title, source, severity, platform, resolves_phase,
  blocked_by, parked, parked_by, revisit_trigger, related_requirement, audit_acknowledged.

Step C, body. Append one final section, `## RETIRED 2026-10-27 (quick task 261027-cwy)`, after the
2026-09-21 Cross-reference section. Keep it to roughly 25–40 lines, plainly worded like the existing
dispositions but shorter. Use short bullets or paragraphs that cover these points:
1. The unpark trigger fired. Give the exact grep, the count of 27, and the line count of 1397.
2. Coverage gap. The earliest retained line is epoch 1792651220 = 2026-10-22 19:40 NZDT. The log no
   longer reaches the 2026-09-07 baseline (537 lines, 0). So 2026-09-07 to 2026-10-22 is UNOBSERVED,
   not clean.
3. Attribution. All 27 matches are `channel=launch`, across pids 20824/58139/13798/98083/5294. Quote
   the two example lines in a fenced block. This is the bridge-launch redist-install timeout fixed by
   261026-jmm (`launch` added to `LONG_RUNNING_CHANNELS`, `src-tauri/src/main.rs:1552`). Link the
   completed 2026-10-25 todo by its path.
4. Cookie leg. `rustInvoke timed out.*humble_login_cookies` returned 0 in each of the 7 `gamelib.log*`
   files, and there were 0 `rustInvoke timed out` lines at all. Mention both legs and both files,
   consistent with the PARKED section's "two legs, two files" warning.
5. "Same class is not the same case": the launch recurrences are NOT evidence about id=1575. Q1 stays
   UNDETERMINED, forever, and is not rounded to no.
6. Why retiring is safe. The passive channel-named logging (260905-omc; 260907-j8n / `6fb96c76a`)
   stays in place, so a future cookie-channel timeout would identify itself from a single log line and
   should be filed as a fresh todo, not used to reopen this one. Keep the Windows caveat: the shell log
   does not exist on Windows, so that platform stays uncovered.

Do not edit any earlier section. Do not leave a stray trailing closing tag in the body; see the
completed todo about agents emitting a stray trailing closing tag.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && f=.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md && grep -c '^## RETIRED 2026-10-27 (quick task 261027-cwy)' $f && awk '/^## RETIRED 2026-10-27/{p=1} p' $f | wc -l && grep -n 'UNOBSERVED\|261026-jmm\|UNDETERMINED' $f | tail -5 && git diff -- $f | grep '^[-+][a-z_]*:' </automated>
  </verify>
  <done>The RETIRED section exists once, is about 25–40 lines, and contains UNOBSERVED, 261026-jmm and
UNDETERMINED. In the frontmatter diff, only `status:` changed (plus any key that Step A evidence
justified, recorded in the SUMMARY).</done>
</task>

<task type="auto">
  <name>Task 2: git mv to completed/, fix live-index references, gate, prettier, scoped commit</name>
  <files>.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md, .planning/todos/completed/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md</files>
  <action>
1. Run `git mv .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md .planning/todos/completed/`.
2. Find inbound references with
   `grep -rn '2026-08-23-f9-generic-rpc-timeout' .planning CLAUDE.md | grep -v 'quick/261027-cwy'`.
   In zsh, do not pass an unquoted `--include=*.md`, because it fails on glob expansion. List every
   hit. Classify each hit:
   - Historical records of past tasks (quick/*/PLAN.md and SUMMARY.md, phase PLAN/SUMMARY/VERIFICATION
     files, other todos' dated dispositions): leave them as they are.
   - Live indexes that cite the path as current (for example STATE.md pending-todo lists, or a notes
     index): update `todos/pending/` to `todos/completed/`, and add those files to this commit.
   Report the full list and how you classified each hit in the SUMMARY, even if there are zero hits.
   STATE.md must change only if it has a live reference to this todo; otherwise leave it alone,
   because the orchestrator handles STATE updates.
3. Run `pnpm planning-gates`. It must pass. If it fails because of this todo, fix the frontmatter
   within the existing vocabulary. Never edit the gate.
4. Run `npx prettier --file-info .planning/todos/completed/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`.
   If it is ignored, say so in the SUMMARY and skip the check. Otherwise run
   `npx prettier --check` on that exact path, plus any reference-fix files from step 2 that are not
   ignored. If the check fails, run `npx prettier --write` on those same paths only, then check again.
5. Stage ONLY the rename and any reference-fix files from step 2 by naming each path. Never use
   `git add -A` or `git add .`; the tree has unrelated changes under src/, public/locales and
   .planning. Before committing, `git diff --cached --name-status` must show only the R
   (pending to completed) entry plus the reference-fix files. Commit with message
   `docs(quick-261027-cwy): retire F-9 generic RPC timeout todo — Q2 trigger fired, all channel=launch`
   and end it with the attribution line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md && test -f .planning/todos/completed/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md && pnpm planning-gates && npx prettier --file-info .planning/todos/completed/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md && npx prettier --check .planning/todos/completed/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md && git show --stat --name-status HEAD</automated>
  </verify>
  <done>The file exists only in completed/, and git records it as a rename. planning-gates passes.
Prettier is either clean, or the file was reported as ignored and the check skipped. The HEAD commit
contains only the rename plus any justified live-index fixes. The unrelated working-tree changes are
still unstaged.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Docs-only move inside .planning/. No code, input or network surface. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261027cwy-01 | Tampering | git index (unrelated dirty tree) | mitigate | Stage by explicit path only and inspect `git diff --cached --name-status` before committing |
| T-261027cwy-02 | Repudiation | evidentiary record (Q1 answer) | mitigate | The RETIRED section states that Q1 is UNDETERMINED and that 2026-09-07 to 2026-10-22 is UNOBSERVED, so nothing gets rounded to "no" |
</threat_model>

<verification>
- The todo is only in completed/, and the rename is preserved in history.
- The RETIRED section is present and concise, and it keeps the UNDETERMINED and UNOBSERVED wording.
- `pnpm planning-gates` is green. Prettier is green, or the file is reported as ignored.
- Every inbound reference was reported and classified. Only live indexes were updated.
</verification>

<success_criteria>
The F-9 todo is retired in one scoped commit, with a rationale a later reader can audit, and no
gate is widened or broken.
</success_criteria>

<output>
Create `.planning/quick/261027-cwy-retire-f-9-generic-rpc-timeout-todo-q2-t/261027-cwy-SUMMARY.md` when done. Include the Step A findings (gate scope, completed-todo key convention), the inbound-reference list with each hit's classification, the prettier result, and the commit hash.
</output>
