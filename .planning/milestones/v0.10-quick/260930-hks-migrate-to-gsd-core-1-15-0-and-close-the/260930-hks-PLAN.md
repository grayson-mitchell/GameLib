---
phase: quick-260930-hks
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/planning-frontmatter-gate.py
  - .planning/**/*.md (the 42 frontmatter files gsd-core cannot parse; exact list comes from the Task 1 sweep)
  - .planning/uat-visibility-gate.py
  - .planning/state-sdk-field-anchor-gate.py
  - CLAUDE.md
  - .planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md (git mv to completed/)
  - .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md
autonomous: true
requirements: [QUICK-260930-hks]

must_haves:
  truths:
    - "Every frontmatter-bearing .md under .planning/ parses under gsd-core's own YAML load (vendored js-yaml, FAILSAFE_SCHEMA, json:true) -- 0 unparseable, down from 42"
    - "gsd-core audit-uat lists phase 38 again, with its 11 open deferred-hardware items"
    - "`pnpm planning-gates` fails if any .planning frontmatter file stops parsing -- not only STATE.md/ROADMAP.md"
    - "Every one of the 13 planning gates has a recorded verdict against gsd-core 1.15.0: still valid / needs update / now redundant"
    - "CLAUDE.md states measured gsd-core 1.15.0 truth, with no stale ~/.claude/get-shit-done/ paths or 'pinned v1.42.3' claims"
    - "The migration todo sits in .planning/todos/completed/ with a resolution section"
  artifacts:
    - path: ".planning/planning-frontmatter-gate.py"
      provides: "STATE/ROADMAP checks (unchanged) plus a whole-.planning frontmatter parse sweep in ONE node process"
      contains: "FAILSAFE_SCHEMA"
    - path: ".planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md"
      provides: "Closed todo with resolution"
      contains: "## Resolution"
  key_links:
    - from: ".planning/planning-frontmatter-gate.py"
      to: "every *.md under .planning/ that opens with ---"
      via: "one batched node child reading a JSON list of {path, region} and returning per-file errors"
      pattern: "rglob|os.walk"
    - from: "meta/runPlanningGates.py"
      to: ".planning/planning-frontmatter-gate.py"
      via: "*-gate.py suffix discovery"
      pattern: "GATE_SUFFIX"
---

<objective>
Finish the move from get-shit-done-cc 1.42.3 to @opengsd/gsd-core 1.15.0 inside the repo, and
close the migration todo.

gsd-core 1.15.0 is already installed globally at `~/.claude/gsd-core/`. The 1.42.3 snapshot is
kept at `~/.claude/backups/gsd-1.42.3-snapshot-2026-09-30`. The global npm `get-shit-done-cc`,
which provides `gsd-sdk`, is still installed. None of that is part of this task's commits.

What went wrong, as measured: gsd-core reads frontmatter with a real YAML parser. On a parse
error it quietly returns `{}` (the `FRONTMATTER_UNPARSEABLE` symbol). 42 of the 2895
frontmatter files under `.planning/` do not parse, and as a result all of phase 38 (11 open
items) drops out of `audit-uat`. This plan fixes those 42 files. It also widens the frontmatter
gate so the problem cannot come back, re-checks every planning gate against gsd-core, corrects
CLAUDE.md, and closes the todo.

Output: a gate sweep over all of `.planning/`, 42 files with corrected frontmatter, verdicts on
the 13 gates (recorded in the SUMMARY), an updated CLAUDE.md, and the todo moved to completed.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md
@.planning/planning-frontmatter-gate.py
@meta/runPlanningGates.py

<interfaces>
Facts the executor needs. The orchestrator/planner already measured these, so there is no need to re-discover them.

gsd-core frontmatter consumer, `~/.claude/gsd-core/bin/lib/frontmatter.cjs`:
- line 43: `const YAML_LOAD_OPTS = { schema: FAILSAFE_SCHEMA, json: true };` -- the gate sweep MUST
  load with these same options. Otherwise it checks something close to the consumer, not the
  consumer's actual behaviour.
- line 105: `FRONTMATTER_UNPARSEABLE` Symbol; line 677: `frontmatterRegion(content)` (read lines
  677-720 once to copy its region-extraction rules: optional BOM, `---\r?\n` opener, closing
  `---`); line 701: `extractFrontmatter(content, sourcePath)`.
- vendored parser: `~/.claude/gsd-core/bin/lib/vendor/js-yaml.cjs`. The gate keeps using the repo's
  `node_modules/js-yaml` 4.1.1 (it is committed/CI-resolvable; gsd-core's install is not in CI).

Existing gate `.planning/planning-frontmatter-gate.py` (701 lines):
- `TARGETS` at line 124: `(("STATE.md", True), ("ROADMAP.md", False))`
- `find_node()` line 187, `run_parser(node, frontmatter_text) -> dict` line 199 (one node per call),
  `extract_frontmatter(text)` line 238, `check_document(...)` line 322, `mutate(...)` line 404,
  `_case_reject` line 424, `_case_accept` line 431, `self_test()` line 441, `main()` line 665.
- Docstring lines 1-~120. Two stale passages must change: the DIVERGENCE-SHAPE paragraph, which
  names the consumer as `parseFrontmatterYamlLines` in `sdk/dist/query/frontmatter.js`, and
  THE LIMIT paragraph, which says "~2400 other files ... tracked separately as an open todo".

gsd-core templates, measured 2026-09-30:
- `~/.claude/gsd-core/templates/UAT.md:23` STILL emits `expected: |`
- `~/.claude/gsd-core/workflows/verify-work.md:322` STILL emits `expected: |`
- `~/.claude/gsd-core/templates/phase-prompt.md` exists; `grep prettier` on it returns NOTHING
  (the 1.42.3 hand-added reminder did not survive the upgrade).
- `audit-uat` under gsd-core: `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw`
  (418 items / 56 files, parse_gap_files 2; phase 38 absent before this task).

Existing measurement script (outside the repo, for cross-checking only; Task 1's gate supersedes
it): the orchestrator's scratchpad `yamlscan.cjs`. It requires gsd-core's own frontmatter.cjs and
prints `unparseable under gsd-core: N` and each file with its `@fm-line`.

`python3` is NOT on the Git-Bash PATH on this machine, but `pnpm planning-gates` works (pnpm's
shell finds it). Run individual gates via `pnpm exec python3 <gate>` or through `pnpm planning-gates`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend planning-frontmatter-gate.py to sweep all of .planning/, then fix the 42 unparseable files until it is green</name>
  <files>.planning/planning-frontmatter-gate.py, plus the 42 .planning/**/*.md files the sweep reports (the list includes 38-VERIFICATION.md, 38-HUMAN-UAT.md, 34.13-UAT.md, 34.4.1-VERIFICATION.md, about 34 *-SUMMARY.md, 1 quick SUMMARY and 2 completed todos)</files>
  <behavior>
    - Self-test REJECT (new): a non-STATE fixture document whose frontmatter is invalid YAML (for
      example `score: 11/11 must-haves verified: all pass` style, i.e. a plain scalar holding `: `)
      must be reported as unparseable by the sweep function, naming the file label and the
      js-yaml reason.
    - Self-test ACCEPT (new): the same fixture with that value single-quoted parses, and a file
      that does not open with `---` is skipped (not counted as checked).
    - Self-test ACCEPT (new): a single-quoted scalar using `''` doubling parses to one apostrophe
      under FAILSAFE_SCHEMA+json (this pins the convention the fixes rely on).
    - Every existing STATE/ROADMAP REJECT/ACCEPT case still behaves exactly as before.
  </behavior>
  <action>
Part A -- the gate (write it first so it serves as the scanner):
1. Add a sweep target over every `*.md` under `.planning/` whose content matches the gsd-core
   frontmatter opener (optional BOM, then `---` and a newline). Default scope is ALL of
   `.planning/`, and that includes `todos/completed/`, `quick/` and `phases/`. The evidence: the
   orchestrator's scan used exactly that scope, and gsd-core's `audit-uat` reads beyond phase
   dirs, so a narrower scope would leave files gsd-core reads unchecked. Record this scope
   decision in the docstring. Skip `node_modules`-style dirs only if any exist under `.planning/`
   (check; do not guess).
2. Performance requirement: parse the whole batch in ONE node child. Serialize a JSON array of
   `{path, region}` to the child's stdin. The child is a small inline script that requires the
   repo's `js-yaml`, asserts major version 4 (same fail-loud rule as the existing
   `run_parser`), loads each region with `{ schema: FAILSAFE_SCHEMA, json: true }` to match
   gsd-core `frontmatter.cjs:43`, and prints a JSON array of `{path, reason, line}` failures.
   Region extraction must follow gsd-core's `frontmatterRegion` (read `frontmatter.cjs`
   677-720 once). Do NOT spawn one node per file. The existing single-document `run_parser`
   stays for the STATE/ROADMAP key checks.
3. The sweep must FAIL LOUD, the same as the rest of the gate. Any unparseable file fails the
   run, and the report lists every file with its reason and fm-line. The summary line prints
   files checked, files skipped (no frontmatter) and files failed, so a vacuous zero-file sweep
   is visible. Add a floor: fail if fewer than 2000 files were checked. That catches a broken
   glob or a moved tree. Explain the floor in a comment.
4. Keep `TARGETS`, `REQUIRED_STATE_KEYS`, `check_divergence_shapes`, and every existing self-test
   unchanged. Add the new self-test cases from `<behavior>`, using the existing `_case_reject` /
   `_case_accept` style or a sibling helper for the sweep function.
5. Update the docstring. The frontmatter consumer is now gsd-core 1.15.0's `extractFrontmatter`
   (vendored js-yaml, FAILSAFE_SCHEMA, silent `{}` on error), not 1.42.3's
   `parseFrontmatterYamlLines`. Keep the DIVERGENCE-SHAPE history, but mark it as a check against
   the retired 1.42.3 line-parser: it still costs nothing and still protects `''`/block-scalar
   shapes for any line-based reader. Rewrite THE LIMIT: the "~2400 other files ... open todo"
   gap is now closed by the sweep (quick 260930-hks). The remaining limit is that the sweep
   proves "parses", not "has the right keys", for non-STATE files.

Part B -- fix the 42 files:
6. Run the gate. For each file it reports, fix ONLY the YAML quoting or indentation of the
   offending frontmatter value(s), so the loaded string equals the text the author wrote. Prefer
   single quotes, and double any embedded `'` as `''`. If a value already uses `''` doubling
   inside single quotes, keep it; js-yaml folds `''` to one apostrophe, which is the intended
   meaning. Use double quotes only when the value holds characters that require escapes, and do
   not introduce `\"` (the existing divergence check rejects it on STATE and it is the shape
   1.42.3 mangled). Change no prose, no key names and no body text. Keep each fixed value on one
   line unless the original was multi-line (then use a quoted multi-line scalar or keep the
   existing block form, provided it parses). For each file, compare the parsed value before and
   after against the raw text; a small throwaway node check in the scratchpad is fine. Do NOT
   touch STATE.md (not in the list, and its shape is pinned by this gate).
7. Re-run until the sweep reports 0 failures. Cross-check with the orchestrator's scratchpad
   `yamlscan.cjs` (gsd-core's own parser) if it still exists; it must also report 0. Then run
   `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` and confirm phase 38 appears with 11
   items. Record the new total item/file counts and `parse_gap_files` in the SUMMARY; if
   parse_gap_files is still nonzero, name the files and say why (body parse gaps, not
   frontmatter).
8. Prettier baseline rule for the .md fixes: many .planning files may already fail prettier
   at HEAD. For each touched file, check HEAD with
   `git show HEAD:<path> | npx prettier --stdin-filepath <path> --check`. If HEAD was clean, the
   new file must be clean too. If HEAD was already dirty, do not reformat the body (content
   churn is out of scope) and list the file in the SUMMARY as pre-existing prettier debt.
  </action>
  <verify>
    <automated>pnpm exec python3 .planning/planning-frontmatter-gate.py --self-test && pnpm exec python3 .planning/planning-frontmatter-gate.py && node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const r=JSON.stringify(j);if(!/\"phase\":\"?38\b/.test(r)&&!/38-/.test(r)){console.error('phase 38 missing');process.exit(1)}console.log('phase 38 present')})" && npx prettier --check .planning/planning-frontmatter-gate.py 2>/dev/null; echo "(prettier does not format .py -- the .md baseline rule in step 8 applies)"</automated>
    <fails_when>the self-test fails, any .planning frontmatter file is still unparseable, the sweep checks fewer than 2000 files, or audit-uat output contains no phase-38 items</fails_when>
  </verify>
  <done>The gate self-test passes, including the new unparseable-non-STATE REJECT case. The live gate reports 0 unparseable across the checked files (count at least 2000, printed). gsd-core audit-uat shows phase 38 with 11 items. Every fixed file's parsed values match the author's text, and no body text changed (`git diff --stat` shows only small frontmatter hunks).</done>
</task>

<task type="auto">
  <name>Task 2: Re-validate all 13 planning gates against gsd-core 1.15.0 and fix stale pointers</name>
  <files>.planning/state-sdk-field-anchor-gate.py, .planning/uat-visibility-gate.py (plus any other *-gate.py whose comments only name stale 1.42.3 paths)</files>
  <action>
1. Run `pnpm planning-gates` and list the 13 gates it discovers. For each gate, record in the
   SUMMARY a table row: gate | coupled to gsd tooling? (yes/no, and what) | verdict (still
   valid / needs update / now redundant) | evidence (file:line in the gate plus the gsd-core
   file:line compared). Gates that are about GameLib code, not gsd documents (for example
   `model-a-retirement-gate.py`), get "still valid -- not gsd-coupled" after a quick grep for
   `get-shit-done|gsd-sdk|gsd-core`.
2. `state-sdk-field-anchor-gate.py`: read around line 333, where it resolves the get-shit-done-cc
   SDK paths. Determine, and state, what it does when the SDK is absent: does it fail loud,
   skip, or pass vacuously? Then compare its transcribed STATE field regexes against gsd-core's
   STATE handling in `~/.claude/gsd-core/bin/lib/state*.cjs` (grep for the field-replace regex).
   If gsd-core anchors the field (the defect is fixed upstream), the verdict is "now redundant
   for gsd-core". Do NOT delete the gate. `gsd-sdk` 1.42.3 is still installed and could still be
   invoked until the operator uninstalls it. Update its comments to say this, point at the
   gsd-core source it was checked against, and note that it can be retired once
   `npm uninstall -g get-shit-done-cc` is done. If it would fail-open when the SDK is absent,
   say so in the SUMMARY; do not silently change its behaviour beyond comments unless it would
   go RED after the uninstall, in which case make that path explicit and loud.
3. `uat-visibility-gate.py`: compare its transcribed 1.42.3 `uat.js:150` `testPattern` against
   gsd-core `~/.claude/gsd-core/bin/lib/uat.cjs` (find `parseUatItems`). Measure the result rather
   than assume it. Build a two-item fixture UAT file in the scratchpad (one inline `expected:`,
   one `expected: |` block) and run gsd-core's `parseUatItems` on it through `node -e` with
   require. The orchestrator's measurement (36 -> 418 items) suggests block scalars are now
   visible; confirm or refute. Then decide whether the ledger still means anything. If gsd-core
   no longer suppresses, the gate is guarding a retired parser, so record the verdict ("now
   redundant for gsd-core" or "needs update") and update its comments and paths. Do not delete
   it and do not empty its ledger in this task.
4. For every other gate: where a comment only names a stale `~/.claude/get-shit-done/...` or
   `get-shit-done-cc` path that has a gsd-core equivalent, update the pointer. Change no logic
   without evidence.
5. Re-run `pnpm planning-gates`; all must pass.
  </action>
  <verify>
    <automated>pnpm planning-gates && grep -v '^\s*#' .planning/state-sdk-field-anchor-gate.py | grep -c . >/dev/null && grep -c "gsd-core" .planning/state-sdk-field-anchor-gate.py .planning/uat-visibility-gate.py</automated>
    <fails_when>any planning gate fails, or either of the two named gates carries no reference to gsd-core after the update (grep -c prints 0 for a file)</fails_when>
  </verify>
  <done>All 13 gates pass. The SUMMARY has a 13-row verdict table with evidence. Both named gates cite the gsd-core source they were checked against. No gate was deleted.</done>
</task>

<task type="auto">
  <name>Task 3: Update CLAUDE.md to measured gsd-core truth and close the migration todo</name>
  <files>CLAUDE.md, .planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md -> .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md</files>
  <action>
1. CLAUDE.md, top paragraph (line 3): replace "`gsd-sdk` contains no reference ... and
   `get-shit-done-cc` is not installed". State that GSD tooling is now @opengsd/gsd-core 1.15.0
   at `~/.claude/gsd-core/`, which does not read or rewrite these markers either. Grep
   `~/.claude/gsd-core` for `GSD:` / `source:` to confirm before writing that. Keep the
   "hand-maintained" guidance.
2. UAT item shape section: replace "pinned `v1.42.3`" and the `get-shit-done-cc` package naming
   with gsd-core 1.15.0. Change `~/.claude/get-shit-done/templates/UAT.md` to
   `~/.claude/gsd-core/templates/UAT.md` (still emits `expected: |` at line 23) and
   `workflows/verify-work.md:230` to `~/.claude/gsd-core/workflows/verify-work.md:322` (still
   emits it). Use Task 2's measurement of gsd-core `parseUatItems`. If block scalars are now
   visible, say plainly that the whole-file suppression mechanism is obsolete under gsd-core, and
   cite the uat.cjs line. Keep the still-valid guidance: write new items inline, do not flatten
   the 26 existing blocks, and describe what `uat-visibility-gate.py` now guards per its Task 2
   verdict. Keep the inline `expected:` / `result:` shape exactly as the convention requires
   (never a block scalar in CLAUDE.md's conforming example).
3. Formatter section: change `~/.claude/get-shit-done/templates/phase-prompt.md` and
   `bin/lib/template.cjs` to their gsd-core paths (check that `~/.claude/gsd-core/bin/lib/template.cjs`
   exists). State the measured fact: the reminder did NOT survive the gsd-core upgrade
   (`grep prettier` on the gsd-core phase-prompt.md is empty), which is exactly the overwrite the
   section predicted. This section stays the durable copy.
4. Grep CLAUDE.md for `get-shit-done`, `gsd-sdk`, `1.42.3` and `~/.claude/get-shit-done`. Update
   every remaining stale path, including in the Project Skills and GSD Workflow Enforcement
   sections if they name any. Do not rewrite unrelated text.
5. Todo: `git mv` it from `.planning/todos/pending/` to `.planning/todos/completed/`. Append a
   `## Resolution (2026-09-30)` section covering these points. The migration was done on Windows
   rather than at the Linux setup, because the operator already runs 1.15.0 on their other OSs.
   The install command. The 1.42.3 snapshot at `~/.claude/backups/gsd-1.42.3-snapshot-2026-09-30`.
   The 42-file frontmatter fix and the phase-38 reappearance, with counts. The widened
   frontmatter gate. The per-gate verdicts (short form; point at the SUMMARY for the table).
   The CLAUDE.md updates. The item left for the operator, `npm uninstall -g get-shit-done-cc`
   (and then retiring `state-sdk-field-anchor-gate.py` if Task 2 judged it redundant). Leave the
   existing frontmatter keys intact; `completed/` is exempt from the todo gate, but keep
   `severity`/`platform`/`ready` as they are.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md && test ! -f .planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md && grep -q "## Resolution" .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md && ! grep -n "~/.claude/get-shit-done/" CLAUDE.md && ! grep -n "pinned \`v1.42.3\`" CLAUDE.md && grep -q "gsd-core" CLAUDE.md && npx prettier --check CLAUDE.md .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md && pnpm planning-gates</automated>
    <fails_when>the todo is still in pending/ or lacks a Resolution section, CLAUDE.md still names ~/.claude/get-shit-done/ or the 1.42.3 pin, either touched file fails prettier, or any planning gate fails</fails_when>
  </verify>
  <done>CLAUDE.md names only gsd-core paths and states measured facts (UAT template still emits `expected: |`; the parseUatItems suppression status as measured; the phase-prompt reminder is lost). The todo is in completed/ with a resolution. prettier is clean on CLAUDE.md and the todo. `pnpm planning-gates` is green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| planning docs -> gsd-core parser | Malformed frontmatter makes gsd-core silently drop data (the phase-38 loss) |
| gate -> node child | The gate passes file content to a node process through stdin |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-HKS-01 | Tampering | 42 frontmatter fixes | mitigate | Per-file parsed-value comparison against the raw text; `git diff --stat` must show frontmatter-only hunks; no body edits |
| T-HKS-02 | Repudiation | frontmatter sweep | mitigate | Fail loud on missing node/js-yaml/wrong major; 2000-file floor plus a printed checked/skipped/failed count so a vacuous sweep cannot pass green |
| T-HKS-03 | Denial of Service | frontmatter sweep | mitigate | One batched node process, not one per file; FAILSAFE_SCHEMA (no alias/type expansion surprises beyond gsd-core's own) |
| T-HKS-04 | Information Disclosure | scratchpad fixtures | accept | Fixtures are synthetic UAT/frontmatter text with no profile data, and no sidecar/binary runs happen, so the two-profile rule does not apply |
| T-HKS-05 | Tampering | gate retirement | mitigate | No gate deleted without evidence; redundant gates keep running with updated comments until the operator uninstalls get-shit-done-cc |
</threat_model>

<verification>
- `pnpm planning-gates`: all 13 pass, including the widened frontmatter gate (0 unparseable, at least 2000 files checked)
- `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` includes phase 38 with 11 items
- prettier: CLAUDE.md and the completed todo are clean; for the fixed .md files, clean if they were clean at HEAD
- `git diff --stat` on the 42 files: small frontmatter hunks only
</verification>

<success_criteria>
- 42 -> 0 gsd-core-unparseable frontmatter files, with the same meaning preserved
- The regression is caught in CI by the widened gate, which has a self-test REJECT case
- 13-gate verdict table in the SUMMARY
- CLAUDE.md matches the gsd-core 1.15.0 facts as measured
- Todo closed via git mv, with a resolution; get-shit-done-cc uninstall left to the operator
</success_criteria>

<output>
Create `.planning/quick/260930-hks-migrate-to-gsd-core-1-15-0-and-close-the/260930-hks-SUMMARY.md` when done. Include: the fixed-file list (path plus which key), before/after audit-uat counts, parse_gap_files, the 13-gate verdict table, the parseUatItems block-scalar measurement, and any pre-existing prettier debt among the touched .md files.
</output>
