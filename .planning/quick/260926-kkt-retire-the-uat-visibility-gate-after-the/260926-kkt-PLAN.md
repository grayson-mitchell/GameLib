---
phase: quick-260926-kkt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/uat-visibility-gate.py # DELETED (git rm)
  - meta/runPlanningGates.py
  - .planning/planning-envelope-tag-gate.py
  - CLAUDE.md
autonomous: true
requirements: [QUICK-260926-kkt]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 2
  confidence: low # estimate-calibration: factor 1, sample_count 0, applied false

must_haves:
  truths:
    - "`.planning/uat-visibility-gate.py` no longer exists, and `pnpm planning-gates` reports `12/12 planning gates passed.`"
    - "`MINIMUM_EXPECTED_GATES` equals the discovered gate count (12), AND a runner handed 11 gates exits 1: the floor is still live, not just lowered"
    - "The 13 -> 12 LOWERING is recorded in the runner's floor-history comment in the same style as the raises, justified by the deliberate retirement; the runner diff against baseline `1ec323874` deletes exactly one line (the old constant), so the 10 -> 11 entry and all other history is untouched"
    - "`planning-envelope-tag-gate.py` no longer cites the deleted file as a live example, every remaining mention of it carries `260926-kkt` on the same line, and the gate's behaviour is unchanged (its self-test and live walk pass inside `pnpm planning-gates`)"
    - "CLAUDE.md's UAT item shape section describes gsd-core 1.14.0's parser, not 1.42.3's: block scalars are read; unreadable items are reported by the tool itself via `parse_gap_files` / `unparsed_blocks`; the gate is retired in 260926-kkt; enforcement is stated honestly (nothing in CI now checks UAT visibility)"
    - "Every figure in the rewritten section was measured in the executing session; the headline phrase `<N> outstanding items across <M> files` matches live `audit-uat --raw` output"
    - "CLAUDE.md outside the UAT section is byte-identical to baseline `1ec323874`, so the formatter section, including its cross-reference to 'the same caveat this file already records for the UAT template', is untouched and still true"
    - "History is unmodified: `.planning/STATE.md`, every `.planning/quick/*` record, and the pending block-scalar todo `.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md`"
  artifacts:
    - path: "meta/runPlanningGates.py"
      provides: "Floor lowered 13 -> 12 with a justified history entry"
      contains: "MINIMUM_EXPECTED_GATES = 12"
    - path: ".planning/planning-envelope-tag-gate.py"
      provides: "Docstring provenance marked retired; no live-example citation of a deleted file"
      contains: "260926-kkt"
    - path: "CLAUDE.md"
      provides: "UAT item shape section rewritten to the gsd-core 1.14.0 truth"
      contains: "parse_gap_files"
  key_links:
    - from: "meta/runPlanningGates.py"
      to: ".planning/**/*-gate.py"
      via: "suffix discovery checked against the MINIMUM_EXPECTED_GATES floor"
      pattern: "MINIMUM_EXPECTED_GATES = 12"
    - from: ".github/workflows/codecheck.yml"
      to: "meta/runPlanningGates.py"
      via: "`pnpm planning-gates` at codecheck.yml:33 (package.json:42), so CI turns red if the floor is wrong"
      pattern: "pnpm planning-gates"
    - from: "CLAUDE.md formatter section"
      to: "CLAUDE.md UAT item shape section"
      via: "'the same caveat this file already records for the UAT template': the rewritten UAT section must still record that caveat"
      pattern: "outside this repo"
---

<objective>
Retire `.planning/uat-visibility-gate.py` now that this machine has moved from `get-shit-done-cc`
1.42.3 to `@opengsd/gsd-core` 1.14.0. The operator has already made this decision. It is locked.
Do not relitigate it, and do not replace the gate with a new one.

Purpose: the gate copied 1.42.3's `parseUatItems` regex verbatim and ledgered UAT items that
**that** parser could not see. gsd-core 1.14.0 rewrote the parser (`~/.claude/gsd-core/bin/lib/uat.cjs`,
`parseUatItemsWithStats` ~line 1157). The new parser slices every column-0 `### N.` heading to the
next heading, reads `expected: |` block scalars, and reports what it cannot read on its own via
`parse_gap_files` / `unparsed_blocks`. So the gate is now counting against a parser nobody runs.
Keeping it would mean CI enforces a false model of the tool. CLAUDE.md's "UAT item shape" section
teaches that same false model, so it has to be rewritten to what gsd-core actually does.

Output: the gate is deleted. The planning-gates floor goes 13 -> 12, with a recorded justification.
The one live cross-reference in `planning-envelope-tag-gate.py` is marked retired. The CLAUDE.md
section is rewritten from live measurements. Each task gets its own commit, and one SUMMARY is written.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
Planner measurements, taken 2026-09-26 at HEAD `1ec323874`. Treat them as data and re-assert
anything you write down:

- `pnpm planning-gates`: 13/13 passed. CI runs it at `.github/workflows/codecheck.yml:33`.
- `git ls-files` matching the gate: only `.planning/uat-visibility-gate.py` itself plus two
  historical records under `.planning/quick/260912-csq-.../`. No ledger file, no fixtures
  directory, no package.json script, no CI line. The gate is one self-contained file.
- Files still citing the gate outside history: `meta/runPlanningGates.py` (floor history, the
  `10 -> 11` entry, ~line 75), `.planning/planning-envelope-tag-gate.py` (docstring ~line 83,
  where it is listed as a live example of the "no --write flag" shape; `_mutate()` docstring
  ~line 295, as design provenance), and `CLAUDE.md` (UAT section, ~lines 281-333). Every other
  hit is history: STATE.md, `.planning/quick/*`, and the pending todo. Leave those alone.
- `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` from the repo root: 418 items across
  56 files, `parse_gap_files: 2`. Per file: `34.3-UAT.md` 5 items, `34.5-UAT.md` 17 items (both 0
  under 1.42.3); `34.6-UAT.md` 0 items, `parse_gap: true`, `unparsed_blocks: 5`;
  `32-HUMAN-UAT.md` 3 items, `parse_gap: true`, `unparsed_blocks: 1`. The 1.42.3 comparison
  figure (42 items across 13 files) was measured by the orchestrator before the old tool was
  removed. `~/.claude/get-shit-done/` no longer exists, so that figure cannot be re-measured.
  Attribute it rather than restating it as your own measurement.
- `require(~/.claude/gsd-core/bin/lib/uat.cjs).parseUatItemsWithStats` is exported. Probed with
  in-memory fixtures:
  - (a) An item whose `expected:` is a `|` block scalar, plus a `## Current Test` block scalar:
    both items are returned, the body is dedented, `headingsSeen: 0`.
  - (b) An item whose `result:` value opens with bold markup (`**PASS**`): that item is NOT
    returned and `headingsSeen: 1`. `headingsSeen` is the counter behind `parse_gap`. The regex
    responsible is `RESULT_LINE_RE`, `/^result:\s*\[?(\w+)\]?.../i` (~line 1387). The value has
    to open with an optionally bracketed word token.
  - Causes behind the two live gaps. In `34.6-UAT.md`, every `result:` is bolded prose, e.g.
    `result: **PASS** (2026-08-26 19:26)...`. In `32-HUMAN-UAT.md`, a non-numbered
    `### CORRECTION 2026-08-22 ...` heading (line 20) sits between item 1's heading (line 16)
    and its `result:` (line 81). An item's block runs to the next heading of any level, so item 1
    ends before it reaches its result.
- `~/.claude/gsd-core/VERSION` = `1.14.0`. `templates/UAT.md:23`, `workflows/verify-work.md:309`
  and `workflows/execute-phase.md:1252` all write `expected: |`, and all three do it inside the
  `## Current Test` cursor block, not inside a `### N.` item. The template's own `### N.` items
  (`templates/UAT.md` ~lines 29-50) use inline `expected:` followed by `result:` on the next line.
- Block-scalar count: 26 `^expected: |` lines across `34.3-UAT.md` (1), `34.5-UAT.md` (23) and
  `34.6-UAT.md` (2), and 27 across all phase UAT files.
- `.prettierignore:29` ignores `.planning`, so `prettier --check` on `.planning/**` is vacuous.
  Prettier has no parser for `.py` either. The formatter convention applies to `CLAUDE.md` only,
  which uses the root config.
- There is no Python linter in CI, and `graphify-out/` does not exist, so there is no `graphify update`.
- The pending todo `2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md` is
  `ready: blocked`. Its TITLE says the suppression defect is "ledgered by a gate and CI-asserted".
  This task makes that claim false. Do NOT edit the todo. Report it in the SUMMARY as a follow-up.
- 260926-bsl recorded an unrelated concurrent process doing a `git reset` on this same working
  tree. Stage explicit paths only, and confirm every commit with `git show --stat HEAD`.
- Work on `main`, no worktree. The orchestrator owns STATE.md and the plan/summary docs commit.
  Do not edit STATE.md.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Retire the gate end-to-end: delete it, lower the runner floor to 12, mark the one live cross-reference, prove 12/12 with a live floor</name>
  <files>.planning/uat-visibility-gate.py (delete), meta/runPlanningGates.py, .planning/planning-envelope-tag-gate.py</files>
  <read_first>
    - meta/runPlanningGates.py lines 30-117: the floor-history comment block and the constant. Match its voice.
    - .planning/uat-visibility-gate.py lines 1-35: the gate's stated purpose, so the history entry describes it accurately. Read it BEFORE deleting.
    - .planning/planning-envelope-tag-gate.py lines 78-84 and 288-300: the two docstring mentions.
  </read_first>
  <action>
    Implements the operator's locked decision to retire the gate. Sequence:

    1. Baseline. Run `pnpm planning-gates` and record the result in the SUMMARY. The planner
       measured 13/13. If anything other than 13/13 is green, record the pre-existing failure SET
       by name, so it is never attributed to this task (the 260926-bsl pattern), and carry on.

    2. Delete the gate with `git rm .planning/uat-visibility-gate.py`. Nothing ships alongside it
       (measured: no ledger, fixtures, script or CI line). Do not delete or edit its historical
       records under `.planning/quick/260912-csq-.../`.

    3. In `meta/runPlanningGates.py`, change the constant from 13 to 12 and add a history entry
       directly after the existing `12 -> 13 (quick task 260924-vku)` entry, inside the same
       comment block and in the same voice. Headed `13 -> 12 (quick task 260926-kkt):`. The entry
       must say:
       - (a) This is a LOWERING, the first in this block. It follows a deliberate operator
         retirement, not convenience.
       - (b) What the retired gate was: `.planning/uat-visibility-gate.py`, the eleventh gate
         (see the `10 -> 11` entry above). It copied 1.42.3's `parseUatItems` regex verbatim and
         ledgered items invisible to THAT parser.
       - (c) Why its subject is gone: the machine moved to `@opengsd/gsd-core` 1.14.0, whose
         rewritten parser reads block scalars and reports what it cannot read on its own
         (`parse_gap_files`). Include the measured contrast: 418 items across 56 files under
         gsd-core against 42 across 13 under 1.42.3. The gate's census was measuring a parser no
         longer in use.
       - (d) Why 13 would be wrong: a floor left above the discovered count keeps the runner red
         forever over a deliberate deletion. That is the kind of red that teaches people to ignore
         the runner.
       - (e) Why exactly 12: lowering by exactly one, to the discovered count, keeps the floor
         tight, so accidentally deleting any of the twelve remaining gates still turns it red.

       Leave the `10 -> 11` entry, the module docstring and every other line byte-identical. They
       are history, and they were true when written. The verify asserts that the runner diff
       deletes exactly one line.

    4. In `.planning/planning-envelope-tag-gate.py`, edit docstrings only:
       - (i) ~line 83, the "no `--write` flag ... the same shape as" sentence. Drop the retired
         file from that list, so the sentence cites only `todo-frontmatter-gate.py`. A list of
         live examples of a shape should contain only files that exist.
       - (ii) ~line 295, the `_mutate()` docstring. Keep the design provenance, but mark it
         retired, e.g. "Modelled on the `mutate()` of `uat-visibility-gate.py` (retired in quick
         task 260926-kkt; recoverable from git history)." Put the filename and `260926-kkt` on the
         SAME physical line, because the verify checks per line.

       Keep line width at or under 100 characters, like the surrounding docstring. Change no code,
       constant, regex or self-test fixture. This gate's behaviour must not move, and
       `pnpm planning-gates` runs its self-test and live walk to prove it.

    5. Do not touch CLAUDE.md (Task 2), STATE.md, `.planning/quick/*`, or `.planning/todos/*`.

    6. Run the verify. Then stage exactly these three paths: the deletion,
       `meta/runPlanningGates.py`, and `.planning/planning-envelope-tag-gate.py`. Commit with the
       message `chore(quick-260926-kkt): retire the UAT visibility gate and lower the planning-gates floor to 12`
       and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Confirm with
       `git show --stat HEAD` that the commit holds exactly those three paths.

    Formatter convention: not applicable here, as measured, not assumed. Two of the paths are
    `.py` (prettier has no parser for them), and all three sit under a `.prettierignore`d or
    non-prettier path. Say this in the SUMMARY instead of running a vacuous `--check`.
  </action>
  <reversibility rating="reversible">`git revert` of the task commit restores the gate and the 13 floor together. Nothing downstream consumes the gate's output.</reversibility>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && test ! -e .planning/uat-visibility-gate.py && out=$(pnpm planning-gates 2>&1); rc=$?; printf '%s\n' "$out"; test $rc -eq 0 && printf '%s\n' "$out" | grep -qxF '12/12 planning gates passed.' && PYTHONDONTWRITEBYTECODE=1 python3 -c "
import sys; sys.path.insert(0, 'meta'); import runPlanningGates as r
src = open('meta/runPlanningGates.py').read()
assert '13 -> 12 (quick task 260926-kkt)' in src, 'lowering not recorded in the floor history'
n = len(r.discover_gates())
assert n == r.MINIMUM_EXPECTED_GATES == 12, ('floor not tight', n, r.MINIMUM_EXPECTED_GATES)
real = r.discover_gates; r.discover_gates = lambda: real()[:-1]
try:
    r.main()
except SystemExit as e:
    assert e.code == 1, e.code
    print('negative control OK: 11 gates -> exit 1')
else:
    sys.exit('NEGATIVE CONTROL FAILED: runner accepted 11 gates')
" && python3 -c "
lines = [l for l in open('.planning/planning-envelope-tag-gate.py') if 'uat-visibility-gate' in l]
assert lines, 'provenance mention deleted instead of marked retired'
unmarked = [l for l in lines if '260926-kkt' not in l]
assert not unmarked, unmarked
print('envelope-tag gate: %d mention(s), all marked retired' % len(lines))
" && ns=$(git diff --numstat 1ec323874 -- meta/runPlanningGates.py) && test -n "$ns" && awk '{ if ($2 != 1) { print "runner diff deletes " $2 " lines; only the constant line may go"; exit 1 } }' <<< "$ns"</automated>
  </verify>
  <done>
    The gate file is gone. `pnpm planning-gates` prints `12/12 planning gates passed.` and exits 0.
    The floor constant is 12 and equals the discovered count. The monkeypatched 11-gate run exits 1
    with the runner's floor FAIL message. The runner diff against `1ec323874` deletes exactly one line.
    Every remaining envelope-gate mention of the retired file carries `260926-kkt`. One commit holds
    exactly the three intended paths, confirmed with `git show --stat HEAD`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rewrite CLAUDE.md's "UAT item shape" section to what gsd-core 1.14.0 actually does, from live measurements</name>
  <files>CLAUDE.md</files>
  <precondition>`cat ~/.claude/gsd-core/VERSION` prints `1.14.0`. Every claim in the new section is about that version, so if it prints anything else, halt and report instead of writing.</precondition>
  <read_first>
    - CLAUDE.md lines 281-359: the whole UAT section, plus the formatter section's closing paragraph (~line 355-359), whose "the same caveat this file already records for the UAT template" must stay true.
    - ~/.claude/gsd-core/bin/lib/uat.cjs: `parseUatItemsWithStats` (~1157-1200), the result-line match `RESULT_LINE_RE` (~1385-1400), the parse-gap assignment (~190-200), and the summary block (~257-290). Grep for these; do not read the 3600-line file whole.
    - ~/.claude/gsd-core/templates/UAT.md lines 18-50: the `## Current Test` cursor against the `### N.` item shape.
  </read_first>
  <action>
    Rewrite the section to the truth under gsd-core. This is Claude's discretion as delegated by
    the orchestrator. The decisions: inline `expected:` stays as a stated PREFERENCE, with its real
    reason. The no-flattening prohibition is replaced by one sentence saying the existing block
    scalars stay, because nothing now motivates touching them.

    Step 1: measure before writing. Do not write any figure you have not produced in this session.
    - (a) From the repo root, run `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` and
      record `summary.total_items`, `summary.total_files` and `summary.parse_gap_files`. Also
      record the per-file entries for `34.3-UAT.md`, `34.5-UAT.md`, `34.6-UAT.md` and
      `32-HUMAN-UAT.md`: item count, `parse_gap`, `unparsed_blocks`. Plan-time values are in
      `<context>`. If yours differ, write yours and note the drift in the SUMMARY.
    - (b) Probe `parseUatItemsWithStats` directly via `node -e` with two small IN-MEMORY fixture
      strings. Write no fixture file anywhere in the repo.
      - One fixture has an `### N.` item whose `expected:` is a `|` block scalar, plus a
        `## Current Test` block scalar. Expect both items returned and the body dedented.
      - The other has an item whose `result:` value opens with bold markup. Expect the item
        missing and `headingsSeen` at 1.
    - (c) Read the lines that make the two live gaps: the bolded `result:` lines in `34.6-UAT.md`,
      and lines 16-81 of `32-HUMAN-UAT.md`, where the `### CORRECTION` heading sits between item
      1's heading and its `result:`.
    - Only state a cause in CLAUDE.md that (b) and (c) reproduce. If one does not reproduce, leave
      it out and say only that gsd-core reports the gap.

    Step 2: replace the text from the `### UAT item shape` heading up to, but NOT including, the
    `### A formatter check` heading. Change nothing outside that range. Write in the file's
    existing voice: bold lead-ins, dated measured figures, and honest-enforcement phrasing. Content,
    in this order:
    - **Heading.** Retitle it so it no longer forbids block scalars. It must still begin with
      `### UAT item shape`, because the verify anchors on that. Suggested:
      `### UAT item shape (`expected:` inline by preference; `result:` opens with a status word)`.
    - **The shape.** The `### N. <name>` heading sits at column 0. `expected:` inline is the house
      preference. `result:` is a column-0 line whose value opens with a bare or bracketed status
      word (`pending`, `pass`, `issue`, `skipped`, `blocked`, or `[pending — note]`); prose may
      follow the word. Keep the existing inline conforming yaml example. Delete the second example
      (the block-scalar one) and its caption, because the caption's claim is false under gsd-core.
    - **What changed, and when.** This section used to describe `get-shit-done-cc` 1.42.3's
      adjacency-matched `parseUatItems`, under which one block scalar hid every `### N.` item in
      its file. Name that tool by package and version only. Do not carry over its source line
      citations: the install directory is gone, so a reader cannot check them. Then describe
      gsd-core 1.14.0 (`~/.claude/gsd-core/bin/lib/uat.cjs`, `parseUatItemsWithStats`). It slices
      each column-0 `### N.` heading to the next heading and reads `expected: |` values dedented.
      Give the step-1 figures, including the literal phrase `<total_items> outstanding items across
      <total_files> files` built from your live numbers (the verify rebuilds it from live output),
      dated 2026-09-26. Include the attributed 1.42.3 comparison (42 items across 13 files,
      measured by the 260926-kkt orchestrator before the old tool was removed) and the
      `34.3-UAT.md` / `34.5-UAT.md` item counts, which were 0 before. Conclude that block scalars
      are no longer a visibility hazard. Inline stays preferred because it is the shipped
      template's own `### N.` item shape and diffs cleanly, not because anything breaks. The
      existing block scalars (26 across 34.3/34.5/34.6) stay as written, and there is no reason
      to flatten them.
    - **What still goes unread, and it is now LOUD.** gsd-core reports unread items itself:
      `summary.parse_gap_files`, plus per-file `parse_gap: true` and `unparsed_blocks: N`. List
      the causes step 1 reproduced, each with its live file and count. A `result:` whose value
      does not open with a word token, like bolded prose, is unread. So is a non-numbered `###`
      heading between an item's heading and its `result:`, which ends the item's block early.
      Instruction: an audit with `parse_gap_files` above 0 is not a clean audit. Do not state or
      imply that this task fixes those two files. No UAT file is edited here.
    - **What is enforced, honestly.** `.planning/uat-visibility-gate.py` (added in 260912-csq) was
      retired in quick task 260926-kkt. It copied 1.42.3's regex, so after the migration it was
      counting against a parser no longer in use. The planning-gates floor went 13 -> 12, and the
      reason is recorded in `meta/runPlanningGates.py`. Nothing in CI now checks UAT item shape or
      visibility: `audit-uat` runs from the global gsd-core install, which CI does not have. That
      means `parse_gap_files` is seen only by someone who actually runs `audit-uat`. Say this
      plainly. The tool's reporting is not enforcement.
    - **Upstream files.** `~/.claude/gsd-core/templates/UAT.md:23`, `workflows/verify-work.md:309`
      and `workflows/execute-phase.md:1252` still write `expected: |`. They do it in the
      `## Current Test` cursor, not in a `### N.` item, and gsd-core reads it, so a freshly
      scaffolded file needs no hand-correction. KEEP the caveat that those files are outside this
      repo, unversioned, shared by every project on the machine, and overwritten by a gsd-core
      upgrade. The formatter section points at this caveat.

    Step 3: out of scope, and do not touch:
    - the formatter section, including its template path under the old install directory, which
      is a separate follow-up;
    - the pending block-scalar todo;
    - STATE.md;
    - every UAT file.

    Step 4: run `npx prettier --check CLAUDE.md`. If it fails, run `npx prettier --write CLAUDE.md`
    and re-run the verify. The verify's scope check proves the write did not reflow anything
    outside the section.

    Step 5: stage `CLAUDE.md` alone. Commit with the message
    `docs(quick-260926-kkt): rewrite CLAUDE.md UAT item shape section for the gsd-core parser`
    and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Confirm with
    `git show --stat HEAD`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && npx prettier --check CLAUDE.md && python3 -c "
import json, os, subprocess
t = open('CLAUDE.md').read()
a = t.index('### UAT item shape'); b = t.index('### A formatter check')
base = subprocess.run(['git', 'show', '1ec323874:CLAUDE.md'], capture_output=True, text=True, check=True).stdout
assert t[:a] == base[:base.index('### UAT item shape')], 'CLAUDE.md changed ABOVE the UAT section'
assert t[b:] == base[base.index('### A formatter check'):], 'CLAUDE.md changed at/below the formatter section'
s = ' '.join(t[a:b].split())
for bad in ('uat.js:150', 'uat.js:81-82', 'get-shit-done/templates/UAT.md', 'verify-work.md:230', 'silently deletes every item', 'Never write', 'never a block scalar'):
    assert bad not in s, 'stale 1.42.3 claim still in section: ' + bad
for good in ('260926-kkt', 'parse_gap_files', 'unparsed_blocks', 'gsd-core', '1.14.0', 'uat-visibility-gate.py', 'outside this repo'):
    assert good in s, 'section is missing: ' + good
d = json.loads(subprocess.run(['node', os.path.expanduser('~/.claude/gsd-core/bin/gsd-tools.cjs'), 'audit-uat', '--raw'], capture_output=True, text=True, check=True).stdout)
phrase = '%d outstanding items across %d files' % (d['summary']['total_items'], d['summary']['total_files'])
assert phrase in s, 'headline figure is not the live measurement: ' + phrase
print('UAT section OK;', phrase)
" && out=$(pnpm planning-gates 2>&1) && printf '%s\n' "$out" | grep -qxF '12/12 planning gates passed.' && echo 'planning-gates 12/12'</automated>
  </verify>
  <done>
    `npx prettier --check CLAUDE.md` passes. CLAUDE.md above the UAT heading and from the formatter
    heading onward is byte-identical to `1ec323874`. The section carries no stale 1.42.3 mechanism
    claim and names gsd-core 1.14.0, `parse_gap_files`, `unparsed_blocks`, the retired gate and
    `260926-kkt`. Its headline figure equals live `audit-uat` output, and it keeps the
    "outside this repo" upstream caveat. `pnpm planning-gates` is still 12/12. One commit holds
    `CLAUDE.md` only.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CI runner -> `.planning/**/*-gate.py` | `pnpm planning-gates` (codecheck.yml:33) discovers gates by suffix and trusts a floor constant to detect missing ones |
| CLAUDE.md -> every future agent session | CLAUDE.md is loaded as authoritative instruction, so a false mechanism claim there spreads into every plan and execution |
| Shared working tree -> commits | an unrelated concurrent process was recorded operating on this tree (260926-bsl) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-kkt-01 | Tampering | `meta/runPlanningGates.py` floor | medium | mitigate | Lower by exactly one, to the discovered count. Task 1's verify asserts the floor equals the discovered count (12) AND runs a monkeypatched 11-gate negative control that must exit 1, so a future deletion of any remaining gate is still red. The runner diff is limited to a single deleted line, so no history is rewritten. |
| T-kkt-02 | Repudiation | UAT visibility detection in CI | low | accept | The operator's locked decision. gsd-core now reports `parse_gap_files` itself, but only to whoever runs `audit-uat`. Task 2 states this gap plainly in CLAUDE.md instead of implying enforcement. |
| T-kkt-03 | Tampering | CLAUDE.md UAT section (instruction integrity) | medium | mitigate | Every figure is measured in-session. The verify rebuilds the headline figure from live `audit-uat --raw` and requires it verbatim. A cause is stated only if the in-memory parser probe and a file read reproduce it. Negative checks bar the stale 1.42.3 mechanism claims. A byte-identity check proves nothing outside the section moved. |
| T-kkt-04 | Tampering | commits on a shared working tree | low | mitigate | Stage explicit paths only (never `-A`) and confirm each commit's path set with `git show --stat HEAD`. |
| T-kkt-05 | Information disclosure | probe/audit output | low | accept | `audit-uat` and the parser probe read only repo `.planning/` content and in-memory strings. The sidecar/SEA binary is not spawned, so the two-profile HOME rule does not arm, and no capture file is written to the repo. |
</threat_model>

<verification>
- `pnpm planning-gates`: 13/13 before, 12/12 after, exit 0.
- Floor tightness plus the negative control: floor == discovered == 12, and 11 gates exit 1.
- `git grep -n 'uat-visibility-gate' -- ':!.planning/quick' ':!.planning/STATE.md' ':!.planning/todos'`
  should show only the runner's floor history (the `10 -> 11` and `13 -> 12` entries), the
  envelope-tag gate's retired-marked provenance line, and the CLAUDE.md section's retirement
  statement. Record the output in the SUMMARY.
- `npx prettier --check CLAUDE.md` passes. Nothing else written is prettier-scoped (measured).
- History untouched: `git diff --stat 1ec323874 -- .planning/STATE.md .planning/quick .planning/todos`
  shows nothing from this task's commits. The orchestrator's own later docs commit is expected and excluded.
</verification>

<success_criteria>
- The retired gate is deleted and CI's planning-gates run is green at 12/12 with a floor that is still live.
- The lowering is justified in the runner's history in the house style, and no existing history line is rewritten.
- No live file cites the deleted gate as though it exists.
- CLAUDE.md teaches the gsd-core 1.14.0 parser's actual behaviour, with live-measured figures and an honest enforcement statement, and nothing outside its section changes.
- Two task commits (plus the orchestrator's docs commit), each holding only its intended paths.
</success_criteria>

<output>
Create `.planning/quick/260926-kkt-retire-the-uat-visibility-gate-after-the/260926-kkt-SUMMARY.md` when done. Beyond the standard template, it must record:
- planning-gates before and after, the negative-control output, and the `git grep` residue listing;
- the step-1 live figures, and any drift from the plan-time values in `<context>`;
- **Follow-ups (not actioned here):**
  - (1) The pending todo `2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md`. Its
    title claims the defect is "ledgered by a gate and CI-asserted", which is now false. State
    whether its remaining substance (its item D, the milestone-hidden case) looks resolved under
    gsd-core 1.14.0. Note that `audit-uat --raw` reports `archived.files: 0`, and say what you
    checked. Recommend a rewrite or closure. Do not perform it.
  - (2) The live parse gaps in `34.6-UAT.md` (5) and `32-HUMAN-UAT.md` (1), now visible, with
    their measured causes.
  - (3) The CLAUDE.md formatter section still cites a template path under the removed
    `get-shit-done` install directory (explicitly out of scope).
  - (4) CI no longer has any UAT-visibility signal.
</output>
