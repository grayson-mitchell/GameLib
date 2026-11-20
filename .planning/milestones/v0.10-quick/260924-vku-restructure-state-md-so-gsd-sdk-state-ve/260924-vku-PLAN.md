---
phase: quick-260924-vku
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/STATE.md
  - .planning/STATE-HISTORY.md
  - .planning/state-sdk-field-anchor-gate.py
  - meta/runPlanningGates.py
  - .planning/todos/pending/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md
  - .planning/todos/completed/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md
  - .planning/todos/pending/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md
autonomous: true
requirements: [TODO-2026-09-23-gsd-sdk-state-corruption]

must_haves:
  truths:
    - "Every SDK field literal matches at most once in STATE.md's body (bold anywhere + plain at line start, case-insensitive), and each canonical field (Phase, Plan, Status, Last activity, Progress, Last session, Stopped at, Resume file) matches exactly once, on a single line, inside the section the SDK's section regex computes"
    - "Every archived line removed from STATE.md is present byte-for-byte in STATE-HISTORY.md, proven by a line-multiset comparison whose only differences are enumerated new lines"
    - "Running advance-plan / update-progress / record-metric / add-decision / record-session with the real gsd-sdk 1.42.3 against the restructured tree changes only canonical field lines, frontmatter, and the intended appends; the same sequence against the pre-restructure STATE.md visibly corrupts archived lines (RED control)"
    - "pnpm planning-gates discovers 13 gates, floor is 13, all pass; the new gate fails against the pre-restructure STATE.md"
    - "The todo is resolved and moved to completed/, and exactly one pending todo tracks the upstream report"
  artifacts:
    - path: ".planning/STATE-HISTORY.md"
      provides: "Verbatim archive of the old Current Position body, old Session Continuity body, old frontmatter last_activity line, and any other stray-match blocks"
    - path: ".planning/state-sdk-field-anchor-gate.py"
      provides: "Anchor gate with self-test and anti-vacuity"
      contains: "stateReplaceField"
    - path: "meta/runPlanningGates.py"
      provides: "Floor raised 12 -> 13 with history entry"
      contains: "MINIMUM_EXPECTED_GATES = 13"
  key_links:
    - from: "meta/runPlanningGates.py"
      to: ".planning/state-sdk-field-anchor-gate.py"
      via: "rglob('*-gate.py') discovery"
      pattern: "GATE_SUFFIX"
    - from: ".planning/STATE.md ## Current Position"
      to: ".planning/STATE-HISTORY.md"
      via: "pointer line"
      pattern: "STATE-HISTORY.md"
---

<objective>
Retire the `gsd-sdk query state.*` corruption defect from this repo's side, using the route the operator chose and locked: RESTRUCTURE STATE.md and ADD AN ANCHOR GATE. Do NOT patch the global SDK and do NOT build a wrapper.

The root cause is already measured; cite it, do not re-derive it. In get-shit-done-cc 1.42.3, `sdk/src/query/state-document.ts:12` `stateExtractField` and `:22` `stateReplaceField` look for a bold `**Field:**` anywhere in the body, case-insensitive, and take the first hit. If there is none, they take the first line-start `Field:`, again case-insensitive (`im`). `state-mutation.ts:64-77` and `:480-512` also do case-sensitive first-hit replaces (`^Status:`, `^Plan:`, `^Phase:`, and the case-insensitive `^Last activity:`) inside `## Current Position`. That section is computed as `/(##\s*Current Position\s*\n)([\s\S]*?)(?=\n##|$)/i`, so it ends at the next line that starts with `##`, and `###` counts. `buildStateFrontmatter` (`state.ts:105-114`) then re-derives frontmatter `status`, `stopped_at` and `last_activity` from those same first-hit body reads. `update-progress` (`state-mutation.ts:~698-710`) does first-hit bold-then-plain on `Progress`. `record-session` (`:1026-1038`) writes `Last session`, `Last Date`, `Stopped At`/`Stopped at` and `Resume File`/`Resume file`.

Right now `## Current Position` spans lines 71-4535, and it carries stale bold and plain field lines ahead of the live ones. `## Session Continuity` (6004-EOF) carries 23 `Stopped at:` and 5 `Last session:` lines. So the fix is to leave exactly one match per field, and put it where the SDK looks.

Output: the restructured STATE.md, a new STATE-HISTORY.md, the new gate plus a floor raise, before/after proof against the real SDK, the resolved todo, and one upstream-report todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md
@meta/runPlanningGates.py
@.planning/planning-frontmatter-gate.py

Only read the parts of STATE.md (7748 lines) that you need: frontmatter 1-17, 60-220, 950-1130, 3930-3950, 4530-4580, 6000-6200. Use grep for the rest. The SDK source is outside the repo and read-only: `~/AppData/Roaming/npm/node_modules/get-shit-done-cc/sdk/src/query/{state-document.ts,state-mutation.ts,state.ts}`.

<interfaces>
SDK field literals seen at planning time (re-grep them and do not trust this list: `grep -n "stateExtractField\|stateReplaceField\|WithFallback" state*.ts | grep -v test`):
Status, Last Activity, Last activity, Last Activity Description, Current Phase, Current Phase Name, Current Plan, Total Plans in Phase, Total Phases, Plan, Progress, Last session, Last Date, Stopped At, Stopped at, Resume File, Resume file, Paused At. The section-scoped regexes also cover `^Phase:` (case-sensitive) and `^Plan:`/`^Status:` (case-sensitive) inside Current Position. state.ts:434-439 reads `Last Date`/`Resume File` from within the Session Continuity section.

advance-plan (state-mutation.ts:537-605) takes the legacy path when BOTH `Current Plan` and `Total Plans in Phase` are present. Otherwise it parses `Plan:` as `N of M` (compound format). So the compact `Plan:` line MUST start `<N> of <M>`.

buildStateFrontmatter (state.ts:99-200): `if (lastActivity) fm.last_activity = lastActivity`. Frontmatter `last_activity` is REPLACED by the first body `Last Activity` hit on every mutation, and dropped if there is none. `stopped_at` works the same way. `status` is normalizeStateStatus(body Status), falling back to the existing frontmatter only when it is 'unknown'.

Planning-time census (orchestrator-measured, re-measure it): bold `**Phase:**` x2 first@111, `**Plan:**` x2 first@127, `**Status:**` x2 first@192, `**Progress:**` x6 first@3529. Plain `Phase:` x3 (965 live), `Plan:` x6 first@976, `Status:` 1119 (live "Executing Phase 46") and 3625, `Last activity:` x1 @3944 (multi-KB single line), `Stopped at:` x23 first@6172, `Last session:` x5 first@6171. There is NO `Resume file:` line today. Headings: `## Current Position` 71, `## Native-Install Arc Phase Map` 4535, ..., `### Decisions` 4951, `### Quick Tasks Completed` 5572, `## Deferred Items` 5993, `## Session Continuity` 6004 (runs to EOF 7748 and includes table rows near the end).

Phase 46 live state at planning time: 46-01..46-06 have SUMMARYs. 46-07-PLAN.md exists with no SUMMARY, and its commit `1779f7532` wrote 46-LIVE-GATE-RERUN.md. Frontmatter: status executing, stopped_at "46-05 live gate FAIL at Check 3 -- fix-forward via /gsd-plan-phase 46 --gaps", progress 506/495/83%. Confirm all of this from `.planning/phases/46*/` and `git log` before writing the canonical lines.

Existing gates discovered by runPlanningGates.py today: 12 (`find .planning -name '*-gate.py'`). `MINIMUM_EXPECTED_GATES = 12`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Census script, then verbatim move of archived blocks into STATE-HISTORY.md, compact canonical sections, and a line-multiset move proof</name>
  <files>.planning/STATE.md, .planning/STATE-HISTORY.md</files>
  <action>
Record `PRE_SHA=$(git rev-parse HEAD)` first. Put it in the SUMMARY, because Tasks 2 and 3 use it as the pre-restructure baseline. Do NOT run any `gsd-sdk query state.*` verb against the real `.planning/STATE.md` at any point in this plan, including the read verbs. All SDK runs happen in a worktree (Task 3).

(a) Census. Write a python script in the scratchpad (`C:\Users\grays\AppData\Local\Temp\claude\C--Users-grays-Projects-GameLib\f0474bc3-8980-49ad-ba87-1f70bb3cce3e\scratchpad\state_census.py`). It reads the file as bytes, decodes utf-8, and strips frontmatter the same way the SDK does: the leading `---\n...\n---\n` block. For every SDK field literal (re-derive the list by grep, as described in `<interfaces>`) it lists every bold hit (`\*\*FIELD:\*\*`, case-insensitive, anywhere) and every plain hit (`^FIELD:`, case-insensitive, multiline), with line number, owning `##`/`###` heading, and the first 100 chars. It also prints the Current Position and Session Continuity spans, computed with the SDK's own section regex. Run it against the current file and keep the output for the SUMMARY.

(b) Decide the move set. Always move: the whole old `## Current Position` body (the line after the heading, through the line before `## Native-Install Arc Phase Map`) and the whole old `## Session Continuity` body (the line after the heading to EOF). For every census hit OUTSIDE those two spans, find the smallest containing archived block (a blockquote run, a paragraph, or a single Decisions bullet) and move it too, leaving a one-line pointer in its place, `> Moved verbatim to STATE-HISTORY.md § <section> (260924-vku).`. Never reword a moved line. If a hit sits in a live structure that must stay, say so in the SUMMARY with the reason it is not a match. For example, a table row starting with `|` can never be a plain match, but a bold hit inside it IS a match and must be moved. Also move the old frontmatter `last_activity:` YAML line, verbatim, into STATE-HISTORY.md under a heading that says it is the pre-260924-vku frontmatter narrative (see (c)).

(c) Write the restructure as a python script (`state_restructure.py` in the scratchpad) that works on line ranges. Preserve the existing line endings and the trailing newline exactly; check whether the file is LF or CRLF first. Hand-editing thousands of lines is prohibited. The new `## Current Position` body contains exactly these single-line fields, in this order, after one blank line:
- `Phase: 46 (windows-single-instance-guard-and-gamelib-deep-link-registra) — EXECUTING`
- `Plan: 7 of 7 — 46-07 <short live description confirmed from 46-07-PLAN.md>`. It MUST start `<N> of <M>` for advance-plan's compound parse.
- `Status: Executing Phase 46`
- `Last activity: 2026-09-24 -- <one short clause>`
- `Progress: [████████░░] 83%`. Use the frontmatter percent, and the SDK's own bar format from state-mutation.ts:~690: 10 cells, U+2588/U+2591.

Then a blank line, then a pointer line (`History: the pre-2026-09-24 Current Position narrative lives verbatim in STATE-HISTORY.md § Current Position archive.`). That line must NOT begin with any field literal followed by `:`. Choose the pointer wording so the line does not start with `Phase`, `Plan`, `Status`, `Progress`, or any other field literal.

The new `## Session Continuity` body contains `Last session: <value from the current first Last session line>`, `Stopped at: 46-05 live gate FAIL at Check 3 -- fix-forward via /gsd-plan-phase 46 --gaps` (confirm it is still current), `Resume file: None`, then a blank line and a pointer line.

Decision on Progress: keep exactly ONE canonical `Progress:` line. update-progress returns `updated:false` with no Progress field, so a single anchored line is what makes it correct. Record this choice in the SUMMARY.

Decision on frontmatter `last_activity`: after the restructure, the SDK will overwrite it with the short body `Last activity:` value on the next mutation (state.ts `fm.last_activity = lastActivity`). So set it to that same short value now, as a deliberate collapse. The old narrative is preserved verbatim in STATE-HISTORY.md per (b). State this plainly in the SUMMARY: future frontmatter `last_activity` will carry only whatever single line an executor writes. Update `last_updated`. Keep the frontmatter valid YAML, because planning-frontmatter-gate parses it.

STATE-HISTORY.md starts with a short header. The header explains why the file exists (it keeps these lines out of the SDK's first-hit field regexes), gives the date and the 260924-vku reference, and states that everything below the section headings is byte-verbatim from STATE.md at `PRE_SHA`. It uses sections `## Current Position archive`, `## Session Continuity archive`, `## Frontmatter last_activity archive`, plus `## Other archived blocks` if (b) moved any. Each section gives the original line range at PRE_SHA.

(d) Move proof. A python script loads `git show $PRE_SHA:.planning/STATE.md`, the new STATE.md, and the new STATE-HISTORY.md as line lists. It asserts two multiset equalities: `Counter(old) - Counter(new_state) == Counter(history) - Counter(HISTORY_ADDED)` and `Counter(new_state) - Counter(old) == Counter(STATE_ADDED)`. HISTORY_ADDED and STATE_ADDED are explicit literal lists inside the script: the headers, pointers, blank separators, the canonical lines and the changed frontmatter lines. The script also prints both enumerated lists. Also assert that each moved range appears in STATE-HISTORY.md as a contiguous, in-order run, so order is preserved as well as content. Re-run the census against the new file. It must show exactly 1 hit for each canonical field, 0 for every other field literal, and each canonical hit inside its intended section per the SDK section regex.

Commit STATE.md and STATE-HISTORY.md together, e.g. `docs(quick-260924-vku): move archived STATE.md history verbatim into STATE-HISTORY.md, leave one anchored SDK field each`. This STATE.md restructure IS this task's product, and the executor commits it. That is separate from the orchestrator's later docs commit of PLAN/SUMMARY and the quick-task row. No `--no-verify`, no `git stash`.
  </action>
  <verify>
    <automated>python "C:/Users/grays/AppData/Local/Temp/claude/C--Users-grays-Projects-GameLib/f0474bc3-8980-49ad-ba87-1f70bb3cce3e/scratchpad/state_move_proof.py" && python "C:/Users/grays/AppData/Local/Temp/claude/C--Users-grays-Projects-GameLib/f0474bc3-8980-49ad-ba87-1f70bb3cce3e/scratchpad/state_census.py" .planning/STATE.md && python meta/runPlanningGates.py</automated>
    Formatter note (record it in the SUMMARY; do not fake it): `.planning` is listed in `.prettierignore`, so `npx prettier --check .planning/STATE.md .planning/STATE-HISTORY.md` matches zero files and proves nothing. Run it if you like, but never count it as a formatting guarantee. No formatter covers these files.
  </verify>
  <done>The move proof exits 0 with both enumerated lists printed. The census shows each canonical field exactly once, in the right section, single-line, and every other field literal at 0. Planning gates are still 12/12 green, including planning-frontmatter-gate. There is one commit containing exactly those two files.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: state-sdk-field-anchor-gate.py with two-direction self-test and anti-vacuity, and raise the runner floor 12 -> 13</name>
  <files>.planning/state-sdk-field-anchor-gate.py, meta/runPlanningGates.py</files>
  <behavior>
    - Self-test REJECT: a second bold `**Status:**` in an archived paragraph; a second plain `plan:` (lowercase, which proves case-insensitivity) outside Current Position; a canonical `Last activity:` followed by a non-blank continuation line; a canonical `Phase:` placed after a `### ` subheading inside Current Position (the section regex ends there); a missing `Resume file:`; any `Current Plan:` line (a non-canonical field, required count 0); a missing STATE.md path; a body with zero canonical fields.
    - Self-test ACCEPT: a minimal compact document shaped like the new STATE.md; the same document with a `**Current focus:**` bold line and a `| Plan: x |` table row (neither is a match); a document with the field literal mid-line (`see Status: x`), which is not a line-start match.
    - Real run: PASS on the restructured .planning/STATE.md, and FAIL on `git show $PRE_SHA:.planning/STATE.md` passed as a path argument.
  </behavior>
  <action>
Follow the conventions of `.planning/planning-frontmatter-gate.py`: a long WHY docstring, `fail()`, `_case_reject`/`_case_accept` self-test helpers, the self-test running first in CI mode, a `--self-test` flag, and resolving the target relative to the gate's own directory (runPlanningGates runs each gate with cwd = its directory). Also accept an optional explicit path argument, used for the RED run against the pre-restructure file.

The docstring must cite `state-document.ts:12` (stateExtractField) and `:22` (stateReplaceField) with their bold-anywhere-then-plain-line-start, case-insensitive, first-hit semantics. It must cite the section regex in `state-mutation.ts:64/481`, and the three todo occurrences (quick-260816-qcn add-decision, 34.6-01 hand-apply avoidance, 46-02 advance-plan/record-session). It must also say honestly that this gate DETECTS after the fact, the next time planning-gates runs. It does not stop an SDK write.

Keep the field table in ONE constant, `SDK_FIELDS`. For each entry record the literal, whether it is canonical, the required count (1 for Phase, Plan, Status, Last activity, Progress, Last session, Stopped at, Resume file; 0 for every other literal), and the section it must lie in. Case-variant duplicates (Last Activity / Last activity, Stopped At / Stopped at, Resume File / Resume file) collapse under case-insensitive counting. Handle that explicitly: do not double-count.

Add a comment that the list was copied from get-shit-done-cc 1.42.3 and must be re-derived on upgrade.

Drift detection (planner's call, justified): CI has no SDK installed, so the pinned list is authoritative and must work alone. When the SDK source is present, though, the gate also re-derives literals by regex over `state.ts` and `state-mutation.ts`: the string-literal args of `stateExtractField(`, `stateReplaceField(` and `stateReplaceFieldWithFallback(`, both primary and fallback. It looks in `$GSD_SDK_QUERY_SRC` if set, else `~/AppData/Roaming/npm/node_modules/get-shit-done-cc/sdk/src/query`, else `/usr/local/lib/node_modules/...` and `/opt/homebrew/lib/node_modules/...` with the same suffix. It FAILS if the installed SDK uses a literal missing from `SDK_FIELDS` (case-insensitively), and prints the SDK version from its package.json. When the SDK is absent it prints one explicit `SDK source not found; using pinned 1.42.3 list` line. Justification: a silently stale list is this repo's recurring green-check-proving-nothing trap, and re-deriving is cheap. Failing on a literal-set change rather than a version change avoids false reds on no-op upgrades.

Checks over the body (after stripping the leading frontmatter block exactly as the SDK does):
1. Per field, the count of bold-anywhere plus plain line-start matches (case-insensitive, re.I and re.M, the SDK's regexes transliterated) equals the required count.
2. Each canonical plain line is followed by a blank line, another canonical field line, or EOF. Anything else is a continuation line and fails.
3. Each canonical line lies inside its section span, computed with the SDK's own section regex transliterated to Python (`(##\s*Current Position\s*\n)([\s\S]*?)(?=\n##|$)` with re.I and no re.M; likewise for Session Continuity).
4. Canonical `Phase`/`Plan`/`Status` must also match the case-sensitive `^Phase:`/`^Plan:`/`^Status:` forms that state-mutation.ts uses.
5. `Plan:` value matches `^\d+\s+of\s+\d+`.

Anti-vacuity: FAIL if the target file is missing or the frontmatter can't be stripped, if zero canonical fields are found, or if the self-test ran fewer cases than a pinned minimum.

Write the self-test cases first (RED: run them against a stub checker that accepts everything and watch the reject cases fail), then implement.

In `meta/runPlanningGates.py`, set `MINIMUM_EXPECTED_GATES = 13` and append a `# 12 -> 13 (quick task 260924-vku):` history paragraph in the established voice. The paragraph says what the thirteenth gate holds; that the SDK's unanchored first-hit field regexes corrupted archived STATE.md lines three times while every gate stayed green; and that leaving the floor at 12 would let this gate be deleted with everything else still green.

Commit both files, e.g. `feat(quick-260924-vku): add state-sdk-field-anchor-gate and raise planning-gates floor to 13`.
  </action>
  <verify>
    <automated>cd .planning && python state-sdk-field-anchor-gate.py --self-test && python state-sdk-field-anchor-gate.py && git show $PRE_SHA:.planning/STATE.md > "C:/Users/grays/AppData/Local/Temp/claude/C--Users-grays-Projects-GameLib/f0474bc3-8980-49ad-ba87-1f70bb3cce3e/scratchpad/state-pre.md" && ! python state-sdk-field-anchor-gate.py "C:/Users/grays/AppData/Local/Temp/claude/C--Users-grays-Projects-GameLib/f0474bc3-8980-49ad-ba87-1f70bb3cce3e/scratchpad/state-pre.md" && cd .. && pnpm planning-gates</automated>
    The last command must report `13/13 planning gates passed.`. The RED run's output lists the multi-match fields; paste it into the SUMMARY. Formatter note: prettier has no Python parser, so it does not cover `.py` files. `npx prettier --check` on these two paths would error or match nothing. State in the SUMMARY that no formatter covers them; do not run a vacuous check and count it as proof.
  </verify>
  <done>The self-test passes, with every reject and accept case printed. The gate is green on the new STATE.md and red on the PRE_SHA STATE.md. `pnpm planning-gates` reports 13/13 and the floor is 13 with its history entry. There is one commit with the two files.</done>
</task>

<task type="auto">
  <name>Task 3: Real-SDK proof in disposable worktrees (RED control vs restructured), state.json comparison, resolve and move the todo, file the upstream-report todo</name>
  <files>.planning/todos/pending/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md, .planning/todos/completed/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md, .planning/todos/pending/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md</files>
  <action>
(a) Check the argv first. Run `gsd-sdk query --help` and grep `parseNamedArgs` in state-mutation.ts for add-decision and record-metric. Find out how gsd-sdk resolves the project dir: cwd, or a `--cwd`/`--project-dir` flag. Always point it at the worktree explicitly, never at the real repo.

(b) Create two detached worktrees under the scratchpad: `git worktree add --detach <scratch>/wt-red $PRE_SHA` and `git worktree add --detach <scratch>/wt-green HEAD` (HEAD being the Task 2 commit). In each, first run `gsd-sdk query state.json` and save the output. Then run, in order: `state.advance-plan`, `state.update-progress`, `state.record-metric <args>`, `state.add-decision <args>`, `state.record-session --stopped-at "260924-vku proof run"`. Save each JSON result. After each call, capture `git -C <wt> diff --stat` and the full diff. This satisfies the "state.json before/after the restructure" requirement WITHOUT touching the real STATE.md: wt-red at PRE_SHA and wt-green at HEAD are byte-identical to the real tree before and after.

(c) Classify every changed line in wt-green. Allowed classes are: frontmatter lines; the canonical lines in the compact Current Position and Session Continuity; the appended Decisions bullet; the appended Performance Metrics row. Any hunk outside those classes must be explained. Read the SDK's `normalizeMd` to decide whether it is whole-file normalization, and report it honestly; do not hide it. Also run the new gate inside wt-green after the sequence, and report whether the SDK's own writes keep it green. In particular, check whether advance-plan with the plan at 7 of 7 takes the `last_plan` branch. In wt-red, show the specific archived lines that were corrupted, with before/after text: the stale `**Phase:**`/`**Plan:**`/`**Status:**` bold hits, the `Last activity:` @~3944 truncation, and the first `Stopped at:`/`Last session:` in the archive. This is the RED control. Compare the two state.json outputs and explain every field that differs, e.g. current phase/plan or status now read from the canonical lines instead of stale bold hits.

(d) Remove both worktrees with `git worktree remove --force` and `git worktree prune`. Confirm `git worktree list` shows only the main tree, and that the real `.planning/STATE.md` is unchanged: `git diff --quiet HEAD -- .planning/STATE.md`. Delete the scratchpad diff captures once their essential excerpts are in the SUMMARY; they contain no secrets, but do not leave bulk captures behind.

(e) Resolve the todo. Append a `## Resolution` section covering four things. First, what was done: the restructure plus the anchor gate, on the operator-chosen route, with the commit shas. Second, the proof: the move-proof result, the RED and GREEN worktree diffs summarized, and the state.json deltas. Third, the honest limits:
- The gate only detects after the fact, the next time planning-gates runs.
- The SDK defect is unfixed upstream.
- Any SDK or hand write that inserts a new multi-line value, or re-adds a bold `**Field:**` anywhere in the body (e.g. a pasted Decisions entry), re-arms first-hit mis-targeting until the gate catches it.
- Frontmatter `last_activity` now collapses to the single body line by design.
- `state.update`/`state.patch` take arbitrary field names and are not covered by the pinned list.

Fourth, whether the workaround in the todo (the snapshot plus diff review) is still advised; it is, as belt-and-braces. Then update the frontmatter to match the convention of recently completed todos (look at one in `.planning/todos/completed/`, e.g. the 260924-tjg one, for its status/resolved keys) and `git mv` the file to `.planning/todos/completed/`. Commit the Resolution edit and the rename as separate commits, so git records a clean R100 rename.

(f) Upstream report. `grep -il "upstream" .planning/todos/pending/*.md` and read any hits. If none already covers reporting this SDK defect upstream, create `.planning/todos/pending/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md` with frontmatter `created`, `title`, `area: tooling`, `severity: minor`, `platform: any`, `ready: human`, in that key order with platform right after severity and ready right after platform, bare lowercase values. Its body gives the SDK version, the exact file:line regexes, a minimal reproduction (the wt-red excerpt), and a suggested upstream fix (anchor replaces to the Current Position/Session Continuity sections and require line-start for bold too). Do NOT edit CLAUDE.md. Commit, e.g. `docs(quick-260924-vku): resolve gsd-sdk STATE.md corruption todo, file upstream-report todo`.
  </action>
  <verify>
    <automated>git worktree list && git diff --quiet HEAD -- .planning/STATE.md && test -f .planning/todos/completed/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md && test ! -f .planning/todos/pending/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md && grep -c "^## Resolution" .planning/todos/completed/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md && pnpm planning-gates</automated>
    `git worktree list` must show a single entry. `pnpm planning-gates` must report 13/13, with the todo-frontmatter gate green over the new pending todo. `git log --stat -M -1` on the move commit shows R100. Formatter note: all three paths are under `.planning` (in `.prettierignore`), so a prettier check is vacuous there; say so in the SUMMARY.
  </verify>
  <done>The SUMMARY holds the RED diff showing archived-line corruption and a GREEN diff whose every hunk is classified. The state.json deltas are explained. The worktrees are gone and the real STATE.md is untouched by the SDK. The todo has its Resolution and lives in completed/ via a clean rename. Exactly one pending upstream-report todo exists, or an existing one is cited. Gates are 13/13.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| gsd-sdk (global npm package, outside repo) -> .planning/STATE.md | Untrusted mutation tool that writes to the live planning record |
| restructure script -> STATE.md history | Bulk line-range rewrite of a 7748-line historical record |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vku-01 | Tampering | Real .planning/STATE.md during SDK proof | mitigate | SDK runs only in detached worktrees under the scratchpad; `git diff --quiet HEAD -- .planning/STATE.md` checked after removal |
| T-vku-02 | Tampering | Archived history during move | mitigate | Script-only line-range moves; multiset and contiguous-order proof against `git show $PRE_SHA`; enumerated added lines |
| T-vku-03 | Repudiation | Gate silently stale after an SDK upgrade | mitigate | Pinned list plus optional re-derivation from the installed SDK source that fails on literal drift |
| T-vku-04 | Denial of service | Gate deleted later | mitigate | Floor raised 12 -> 13 with history entry |
| T-vku-05 | Information disclosure | Scratchpad diff captures | accept | STATE.md contains no secrets; captures deleted after excerpting |
</threat_model>

<verification>
- Move proof passes, and the census on the new STATE.md shows each canonical field exactly once and every other field at 0.
- `python .planning/state-sdk-field-anchor-gate.py` is green on the new file and red on the PRE_SHA file; its self-test is green.
- `pnpm planning-gates` reports 13/13 and the floor is 13.
- The worktree SDK proof shows RED corruption at PRE_SHA and only classified changes at HEAD. The worktrees are removed.
- The todo is resolved and in completed/, and the upstream todo is filed with valid frontmatter.
- No formatter covers any file in this plan (.planning is prettier-ignored; prettier has no .py parser). This is stated, not faked.
</verification>

<success_criteria>
STATE.md has exactly one SDK-matchable line per canonical field, all inside the sections the SDK computes. All archived history is preserved byte-verbatim in STATE-HISTORY.md. A 13th planning gate holds the invariant. Real-SDK before/after evidence is recorded. The todo is closed honestly, with its limits stated.
</success_criteria>

<output>
Create `.planning/quick/260924-vku-restructure-state-md-so-gsd-sdk-state-ve/260924-vku-SUMMARY.md` (orchestrator commits it). Include PRE_SHA, the census before and after, the enumerated added-line lists, the Progress and last_activity decisions, the RED/GREEN diff excerpts, the state.json deltas, the formatter-coverage note, and the commit shas. Task 1's commit intentionally includes STATE.md and STATE-HISTORY.md. The orchestrator must NOT treat the STATE.md change as its own quick-task row edit, and should add its row on top of the restructured file.
</output>
