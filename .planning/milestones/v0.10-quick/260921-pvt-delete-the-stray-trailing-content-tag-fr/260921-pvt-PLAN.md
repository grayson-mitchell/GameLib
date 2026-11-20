---
phase: quick-260921-pvt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md
  - .planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md
  - .planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md
  - .planning/todos/pending/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md
  - .planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md
  - .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
  - .planning/todos/pending/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md
autonomous: true
requirements: [QUICK-260921-PVT]

must_haves:
  truths:
    - "All six pending todos that carried a stray trailing XML-style closing tag as their final line no longer carry it, and each lost EXACTLY that one line: `git diff --numstat` reports `0` added and `1` deleted for each of the six, so no other byte of any file moved."
    - "A repo-wide search of `.planning/todos/` for the literal stray tag returns ZERO hits AFTER the new cause-todo has been written — the cause-todo therefore names the tag in a split spelling that the search pattern cannot match, and does not reintroduce the very string it documents."
    - "A new pending todo records the CAUSE and states it accurately as RECURRING across two independent sessions and two dates (`30630b9d2`, quick `260921-nub`, 2026-09-21, for the three `2026-09-20-*` files; `82ac54d86`, 2026-09-17, for the three `2026-09-17-*` files) — not as a single incident by one agent."
    - "The cause-todo states why nothing caught this: `todo-frontmatter-gate.py` parses ONLY the frontmatter block, and its own docstring records that frontmatter-block-only parsing is load-bearing (a whole-file grep would convict correct files on their body prose — self-test cases 11 and 12). The gate is structurally blind to the body BY DESIGN, and all 11 planning gates were green with the tag present in six files."
    - "The cause-todo leaves the question of whether a gate should exist at all OPEN and explicitly un-decided, and records the self-referential trap any such gate would face."
    - "Nothing under `src/` or `src-tauri/` changed: `git diff --quiet -- src/ src-tauri/` exits 0. No gate file was edited."
    - "`pnpm planning-gates` is green (11/11) after all edits."
  artifacts:
    - path: ".planning/todos/pending/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md"
      provides: "The cause-todo: recurring authoring artifact, why the gate is blind by design, gate decision left open"
      contains: "ready: human"
      min_lines: 40
  key_links:
    - from: ".planning/todos/pending/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md"
      to: ".planning/todos/todo-frontmatter-gate.py"
      via: "cited by path as the gate that is blind to todo BODIES by design"
      pattern: "todo-frontmatter-gate\\.py"
    - from: ".planning/todos/pending/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md"
      to: "commits 30630b9d2 and 82ac54d86"
      via: "provenance shas naming the two independent authoring sessions"
      pattern: "30630b9d2"
---

<objective>
Delete the stray trailing XML-style closing tag that sits as the final line of six pending todos,
and file ONE todo recording the cause — which is an authoring artifact that has now recurred across
two independent sessions on two different dates.

Purpose: the tag is orphaned. There is NO opening tag anywhere under `.planning/todos/`, so it is
not half of a pair and nothing reads it. It is a leaked fragment of an agent's own tool-call
envelope that got written into the file body. It has been sitting in six committed files, through
green CI, because the only gate over `pending/` reads the FRONTMATTER block and is structurally
blind to the body.

Output: six one-line deletions, and one new pending todo. NOTHING ELSE. This is a docs-only task.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/todo-frontmatter-gate.py

Measured by the planner at HEAD `421d5195f`. Re-confirm before editing, but these were exact:

Exactly six files under `.planning/todos/pending/` carry the literal stray tag. In every one it is
the FINAL line of the file, occurs EXACTLY once, and the file ends with a proper trailing newline
(`... .\n</content>\n`, verified with `od -c`):

| file | total lines | tag at line |
| --- | --- | --- |
| `2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md` | 109 | 109 |
| `2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md` | 103 | 103 |
| `2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md` | 66 | 66 |
| `2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md` | 66 | 66 |
| `2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` | 64 | 64 |
| `2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md` | 286 | 286 |

`completed/` has ZERO occurrences — scope is `pending/` only. There is no opening `<content>` tag
anywhere under `.planning/todos/`.

Provenance, which the cause-todo must state accurately:
- The three `2026-09-20-*` files carried it FROM BIRTH, added in `30630b9d2`
  ("docs(quick-260921-nub): file three adjacent findings and close the parent todo", 2026-09-21).
- The three `2026-09-17-*` files carried it from `82ac54d86`
  ("docs(todos): file Linux compile-failure and Windows install-deps todos", 2026-09-17), an
  unrelated earlier session.

TWO independent sessions, TWO dates. Recurring artifact, not a one-off slip.

CONCURRENT SESSION WARNING: another session has been committing to this repo throughout. Use an
explicit pathspec on EVERY commit and check `git diff --cached --name-only` before each one.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete the stray final line from all six pending todos</name>
  <files>
.planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md,
.planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md,
.planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md,
.planning/todos/pending/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md,
.planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md,
.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
  </files>
  <action>
Re-confirm the population FIRST, at the executor's own HEAD, before editing anything: enumerate the
pending todos whose final line is the stray closing tag, and confirm the set is exactly the six
listed in `<context>`, that each has exactly one occurrence, and that the occurrence is the last
line. If the set differs — a seventh file, or a file where the tag is NOT the last line — STOP and
report rather than adapting the edit; a tag in the middle of a body is a different defect with a
different safe fix.

Then remove ONLY the final line of each of the six. The mechanical shape that is correct here is a
last-line deletion (for example `sed -i '' -e '$d' <file>` on macOS, applied once per file), because
the tag is the last line in all six and each file ends with a trailing newline — the result still
ends `.\n` with no trailing blank line added. Do NOT hand-edit the surrounding prose, do NOT reflow,
do NOT let a formatter touch these files, and do NOT strip or add a trailing blank line.

PROHIBITED in this task and the next:
- Any edit under `src/` or `src-tauri/`. This is docs-only.
- Any edit to `.planning/todos/todo-frontmatter-gate.py` or to ANY file matching `*-gate.py`, or to
  `meta/runPlanningGates.py`. CLAUDE.md and that gate's own docstring both say a vocabulary or gate
  that grows to admit whatever failed is free text with extra steps. The gate is not at fault here
  and is not being changed.
- Adding a NEW gate for this. Whether one should exist at all is a judgement call that belongs to
  the todo filed in Task 2, not to this task. A reflexive gate is precisely what CLAUDE.md warns
  against in its sidecar-contract section.

Do not commit in this task — Task 2 commits, so that the repair and its cause-todo land as a
reviewable pair.
  </action>
  <verify>
    <automated>
# Re-confirm the six, then prove the edit was surgical. Run from the repo root.
set -e
FILES="
.planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md
.planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md
.planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md
.planning/todos/pending/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md
.planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md
.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
"

# 1. Zero occurrences remain in any of the six.
for f in $FILES; do
  n=$(grep -c '</content>' "$f" || true)
  [ "$n" = "0" ] || { echo "FAIL: $f still has $n occurrence(s)"; exit 1; }
done

# 2. Each file lost EXACTLY one line versus its committed state.
for f in $FILES; do
  before=$(git show HEAD:"$f" | wc -l | tr -d ' ')
  after=$(wc -l < "$f" | tr -d ' ')
  [ "$((before - after))" = "1" ] || { echo "FAIL: $f went $before -> $after lines (expected -1)"; exit 1; }
done

# 3. Each diff is exactly 0 added / 1 deleted. This is the assertion that proves nothing else moved.
git diff --numstat -- $FILES | while IFS=$'\t' read -r add del path; do
  [ "$add" = "0" ] && [ "$del" = "1" ] || { echo "FAIL: $path has +$add/-$del (expected +0/-1)"; exit 1; }
done

# 4. The set of changed files is EXACTLY these six -- no gate, no source, no stray neighbour.
changed=$(git diff --name-only | sort)
expected=$(printf '%s\n' $FILES | sort)
[ "$changed" = "$expected" ] || { echo "FAIL: changed set differs"; diff <(echo "$expected") <(echo "$changed"); exit 1; }

# 5. Docs-only: no source touched.
git diff --quiet -- src/ src-tauri/ || { echo "FAIL: src/ or src-tauri/ modified"; exit 1; }

# 6. No gate file touched.
git diff --name-only | grep -E 'gate\.py|runPlanningGates\.py' && { echo "FAIL: a gate was edited"; exit 1; } || true

echo "OK: six surgical one-line deletions, nothing else moved."
    </automated>
  </verify>
  <done>All six todos end on their real closing prose line; each shows +0/-1 in `git diff --numstat`; the changed-file set is exactly those six; `src/` and `src-tauri/` are untouched; no gate file was edited. Nothing committed yet.</done>
</task>

<task type="auto">
  <name>Task 2: File the cause-todo, run the gates, and commit the pair</name>
  <files>.planning/todos/pending/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md</files>
  <action>
Write ONE new pending todo at the path above.

FRONTMATTER — per CLAUDE.md, `severity:` then `platform:` then `ready:`, in that order, bare and
lowercase, adjacent. Use these values, and justify each in the body:
- `severity: minor` — the damage is already repaired by Task 1, the artifact is inert prose that no
  parser reads, and there is and was no runtime consequence. What is left is a latent authoring trap
  with no live consequence, which is exactly the `minor` definition in CLAUDE.md.
- `platform: any` — reproducible and fixable on any machine; no live gate and no second OS.
- `ready: human` — the residual question is "should a gate exist at all, and if so what could it
  even match?". That is a decision, not a code task, and CLAUDE.md's vocabulary defines `human` as
  "needs a decision, credentials or a person — not code". Do NOT file it as `code`: there is no
  edit-and-typecheck action left to pick up, and a `ready: code` label would send the next session
  looking for one.

Include the repo's other conventional frontmatter keys in the shape the neighbouring pending todos
already use (`created`, `title`, `area`, `status`, `files`), matching their existing style.

BODY — it must state, accurately and in its own words:

1. WHAT happened. Six pending todos carried a stray XML-style closing tag as their final line: a
   leaked fragment of an agent's own tool-call envelope, written into the file body. Name the six
   files. State that the tag was ORPHANED — there is no opening tag anywhere under
   `.planning/todos/`, so it was never half of a pair and nothing read it. State that `completed/`
   had zero occurrences.

2. THAT IT RECURRED, which is the point. Two independent sessions, two different dates:
   `30630b9d2` (quick `260921-nub`, 2026-09-21) birthed the three `2026-09-20-*` files with the tag
   already present, and `82ac54d86` (2026-09-17) birthed the three `2026-09-17-*` files the same
   way. Write it up as a recurring authoring artifact of agents writing todo files, NOT as one
   agent's one-off slip. This framing is the reason the todo is worth filing at all.

3. WHY NOTHING CAUGHT IT. `.planning/todos/todo-frontmatter-gate.py` validates
   `severity`/`platform`/`ready` inside the FRONTMATTER block only. The tag sits in the BODY, so the
   gate cannot see it — and that blindness is DELIBERATE and load-bearing, not an oversight. Quote
   or cite the gate's own docstring section ("FRONTMATTER-BLOCK-ONLY PARSING IS LOAD-BEARING, NOT A
   NICETY") and its reasoning: todo bodies legitimately contain lines like
   `Severity: low, and NOT a security regression`, and a whole-file grep would convict correct files
   on their own explanatory prose. Self-test cases 11 and 12 are the accept-side controls that pin
   exactly that. All 11 planning gates were green the entire time the tag was present in six
   committed files. This is the repo's recorded "green check proving nothing" family.

4. THE SELF-REFERENTIAL TRAP any future gate would face, because it is a real design constraint and
   the next session will hit it immediately: a gate that matches the literal tag string would be
   tripped by the very todo that documents the tag. That is this repo's recorded
   "raw-source gate is satisfied by / broken by the prose that names it" pattern. This todo itself
   has to dodge it (see the spelling rule below), and any gate would need an exemption mechanism or
   a narrower match before it could be green.

5. THE DECISION IS OPEN AND DELIBERATELY NOT MADE HERE. State plainly that quick `260921-pvt`
   repaired the damage and deliberately did NOT add a gate, that whether a body-level gate should
   exist at all must be decided on its merits, and that CLAUDE.md's sidecar-contract section is the
   precedent: "a gate is not obviously the answer, and is a separate, deliberate decision... do not
   add one reflexively". Note the honest asymmetry too — the damage is repaired but recurrence is
   NOT prevented, which is the inverse of this repo's usual "code fix stops recurrence, leaves
   damage" shape. Sketch the options without picking one (for example: a gate with an exemption
   ledger; a broader "no raw tool-envelope tags in todo bodies" check; a pre-commit shape check on
   newly-added todos; or simply nothing, accepting that the artifact is inert and cheap to clean).

CRITICAL SPELLING RULE — this todo MUST NOT contain the literal closing-tag string, because the
final verification in this task greps `.planning/todos/` for exactly that string and asserts zero
hits. A todo that spells the tag out verbatim would make its own repair look incomplete forever, and
would turn every future grep for the artifact into a false positive. Refer to it in a SPLIT spelling
that the pattern cannot match — for example `` `</content` `` followed by `` `>` ``, or the prose
form "a closing `content` tag" — and say once, explicitly, why the split spelling is used, so the
next reader does not "helpfully" join it back up.

COMMIT. Use an explicit pathspec listing the six edited todos and the new todo. Before committing,
run `git diff --cached --name-only` and confirm the staged set is exactly those seven paths and
nothing else — a concurrent session has been committing to this repo throughout, so a bare
`git commit -a` or a `git add .` would absorb its work. If the staged set contains anything else,
unstage it and restage by explicit path. Commit message shape:
`docs(quick-260921-pvt): delete the stray trailing closing tag from six todos, file the cause`
End the commit message with the attribution line
`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

The PLAN and SUMMARY for this quick task may be committed separately, also by explicit pathspec.
  </action>
  <verify>
    <automated>
set -e

NEW=.planning/todos/pending/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md

# 1. The cause-todo exists and carries the three triage keys, bare, lowercase, in order.
test -f "$NEW" || { echo "FAIL: cause-todo missing"; exit 1; }
grep -qE '^severity: minor$'  "$NEW" || { echo "FAIL: severity"; exit 1; }
grep -qE '^platform: any$'    "$NEW" || { echo "FAIL: platform"; exit 1; }
grep -qE '^ready: human$'     "$NEW" || { echo "FAIL: ready"; exit 1; }
sev=$(grep -n '^severity:' "$NEW" | cut -d: -f1)
plat=$(grep -n '^platform:' "$NEW" | cut -d: -f1)
rdy=$(grep -n '^ready:' "$NEW" | cut -d: -f1)
[ "$plat" = "$((sev + 1))" ] && [ "$rdy" = "$((plat + 1))" ] || { echo "FAIL: triage keys not adjacent and in order"; exit 1; }

# 2. It records the two independent provenance sessions and the blind gate, by name.
for token in 30630b9d2 82ac54d86 todo-frontmatter-gate.py; do
  grep -q "$token" "$NEW" || { echo "FAIL: cause-todo does not cite $token"; exit 1; }
done

# 3. THE headline assertion: zero literal occurrences anywhere under .planning/todos/,
#    INCLUDING in the new todo that documents the artifact.
hits=$(grep -rn '</content>' .planning/todos/ | wc -l | tr -d ' ')
[ "$hits" = "0" ] || { echo "FAIL: $hits literal occurrence(s) remain:"; grep -rn '</content>' .planning/todos/; exit 1; }

# 4. Docs-only, no gate edited, staged set is exactly the seven expected paths.
git diff --quiet -- src/ src-tauri/ || { echo "FAIL: src/ or src-tauri/ modified"; exit 1; }
git status --porcelain -- '*gate.py' meta/runPlanningGates.py | grep . && { echo "FAIL: a gate changed"; exit 1; } || true

# 5. All planning gates green.
pnpm planning-gates
    </automated>
  </verify>
  <done>The cause-todo exists with `severity: minor` / `platform: any` / `ready: human` adjacent and in order; it cites both provenance shas and the blind gate by path; it names the artifact in a split spelling so a repo-wide grep of `.planning/todos/` for the literal tag returns ZERO hits; `pnpm planning-gates` is green 11/11; `src/`, `src-tauri/` and every gate file are untouched; the seven paths are committed with an explicit pathspec verified against `git diff --cached --name-only`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
| --- | --- |
| none crossed | Docs-only. No runtime code, no network, no input parsing, no package install. The edited bytes are prose read only by humans. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
| --- | --- | --- | --- | --- |
| T-PVT-01 | Tampering | the six todo bodies | mitigate | A last-line deletion could silently take a real prose line if the tag were not actually last. Verify asserts `+0/-1` per file via `git diff --numstat` and re-confirms the population before editing. |
| T-PVT-02 | Tampering | concurrent session's uncommitted work | mitigate | Explicit pathspec on every commit plus a `git diff --cached --name-only` check against the expected seven paths, so no neighbour's work is absorbed. |
| T-PVT-03 | Repudiation | the gate's closed vocabulary | mitigate | Gate files are prohibited from edit and the prohibition is asserted in both tasks' verify blocks. No vocabulary is widened, no gate is added. |
| T-PVT-SC | Tampering | npm/pip/cargo installs | n/a | No package installs in this plan. |
</threat_model>

<verification>
1. `grep -rn '</content>' .planning/todos/` returns ZERO hits, after the cause-todo is written.
2. `git diff --numstat` showed `+0/-1` for each of the six repaired todos.
3. `git diff --quiet -- src/ src-tauri/` exits 0.
4. No file matching `*-gate.py` and not `meta/runPlanningGates.py` appears in `git status --porcelain`.
5. `pnpm planning-gates` is green, 11/11.
6. `git diff --cached --name-only` was checked before each commit and contained only the intended paths.
</verification>

<success_criteria>
- Six pending todos repaired, each losing exactly one line and nothing else.
- One new pending todo records the cause as RECURRING across `30630b9d2` and `82ac54d86`, explains
  why `todo-frontmatter-gate.py` is blind to todo bodies BY DESIGN, records the self-referential
  trap facing any future gate, and leaves the gate decision explicitly open.
- The cause-todo does not reintroduce the literal string it documents.
- No source file, no gate file, and no new gate.
</success_criteria>

<output>
Create `.planning/quick/260921-pvt-delete-the-stray-trailing-content-tag-fr/260921-pvt-SUMMARY.md` when done.
</output>
