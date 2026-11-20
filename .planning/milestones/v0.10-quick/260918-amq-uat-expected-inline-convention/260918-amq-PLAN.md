---
phase: quick-260918-amq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - CLAUDE.md
  - .planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md
  - .planning/quick/260918-amq-uat-expected-inline-convention/260918-amq-SUMMARY.md
autonomous: true
requirements: [QUICK-260918-AMQ]

must_haves:
  truths:
    - "A person authoring a new *-UAT.md file learns from CLAUDE.md that `expected:` carries inline text with `result:` on the very next line, and learns the mechanism that makes a block scalar suppress the whole file."
    - "The convention names its enforcement honestly: the uat-visibility gate ratchets and fails a new invisible item even in a file absent from its ledger, but only after that item is written."
    - "The convention explicitly FORBIDS flattening the 26 existing blocks, with the render-checkpoint trade as the stated reason."
    - "The convention warns that a file scaffolded from the upstream GSD UAT template starts non-conforming and must be hand-corrected."
    - "The todo's title no longer claims a never-measured population; it describes a measured population with a made decision."
    - "The todo records the 2026-09-18 decision at the top and restates all four items (A/B/C/D) by current status, without deleting any prior section."
    - "`gsd-sdk query audit-uat` still emits 8 phases / 59 items with phase 34.5 absent — this task moved the tool in neither direction."
    - "No *-UAT.md file, no gate file, and nothing under ~/.claude/get-shit-done/ was modified."
  artifacts:
    - path: "CLAUDE.md"
      provides: "A FOURTH ### convention inside the GSD:conventions region"
      contains: "### UAT item shape"
    - path: ".planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md"
      provides: "Retitled, decision-bearing, still in pending/"
      contains: "## DECISION 2026-09-18"
  key_links:
    - from: "CLAUDE.md convention"
      to: "sdk/dist/query/uat.js testPattern"
      via: "cited mechanism (L150), verified live at v1.42.3"
    - from: "CLAUDE.md convention"
      to: ".planning/uat-visibility-gate.py"
      via: "named enforcement limit, self-test direction 2"
    - from: "todo DECISION section"
      to: "CLAUDE.md convention"
      via: "pointer recording where the convention now lives"
---

<objective>
Adopt remedy option 2 for the `audit-uat` body-block-scalar todo: write the authoring convention
that stops NEW UAT files being born suppressed, deliberately leave the 26 existing hidden blocks
alone, and restate the todo to match measured reality.

Purpose: the 26 existing `expected: |` blocks are permanently ledgered by a passing gate and will
NOT be flattened — flattening would regress `uatRenderCheckpoint`, which reads them correctly
today, in order to repair `audit-uat`, and both parsers live in an upstream npx package this repo
does not control. What is missing is the authoring shape that prevents the next file being born
suppressed.

Output: a fourth convention in CLAUDE.md, and a restated todo that stays in `pending/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md

Scratchpad — use for ALL temp files, never `/tmp`. Export it once at the start of each task:
`SP=/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/de4e5ce0-5c62-42b9-a52b-51d32b1b037d/scratchpad`

Do NOT read `.planning/STATE.md` (7633 lines) — nothing in it is needed here.
</context>

<measured_baseline>
Measured by the planner at HEAD `e147ed20e` on 2026-09-18 by driving the real tools. Do not
re-derive these; do re-verify the ones the verify blocks name.

- `gsd-sdk query audit-uat` → `summary.total_files` = **8**, `summary.total_items` = **59**,
  `summary.by_phase` keys = `27 30 32 33 34 34.13 35 38`. **`34.5` is ABSENT.** A pre-edit capture
  of the full JSON is already on disk at `$SP/audituat.baseline.json` — it is the control.
- CLAUDE.md carries **7** `GSD:*-start` and **7** `GSD:*-end` markers. The conventions region holds
  **3** `###` headings today; it must hold **4** when you are done.
- `npx prettier --check CLAUDE.md` is **clean at HEAD** — a usable negative control.
- `pnpm planning-gates` → final line is exactly `11/11 planning gates passed.`
- `.planning/uat-visibility-gate.py` passes with
  `OK: 36 UAT-type file(s), 154 candidate item heading(s), 95 visible to audit-uat, 59 invisible across 12 file(s) -- exactly matching the ledger.`
  Its self-test names, verbatim: `direction 1: a ledgered file's invisible count EXCEEDS its entry`
  and `direction 2: a file ABSENT from the ledger carries an invisible item`.
- `.planning/todos/todo-frontmatter-gate.py` runs standalone and ends
  `OK: 26 pending todo(s) all carry in-vocabulary severity, platform, ready triage keys.`
  That count stays **26** — the todo is restated in place, not moved.
- **SDK citations re-verified live** at `get-shit-done-cc` **v1.42.3**
  (`~/.npm/_npx/4db0de1f85c3165e/node_modules/get-shit-done-cc/sdk/dist/query/uat.js`):
  `testPattern` is at **L150**; the `render-checkpoint` block-scalar reader `expectedBlockMatch` is
  at **L81-82**; `reason`/`blocked_by` matches at **L158/L159**. The todo's citations have NOT
  rotted — cite them as-is.
- Body `expected: |` blocks: `34.5-UAT.md` **23**, `34.6-UAT.md` **2**, `34.3-UAT.md` **1** = **26**
  across 3 files. `27-UAT.md` carries `reason: |` at L31 and L51, `detail: |` at L86.
- CLAUDE.md and the todo are both **clean at HEAD** (no pre-existing uncommitted changes).
- Milestone is still `v0.8`, so item D's 17 milestone-hidden fields stay out of scope and
  UNMEASURED.
</measured_baseline>

<hard_constraints>
- Do NOT edit ANY `*-UAT.md` file. Do NOT edit `.planning/uat-visibility-gate.py` or its ledger.
  Do NOT touch anything under `~/.claude/get-shit-done/`.
- Do NOT alter the three existing conventions — add a fourth alongside them.
- Restore ONLY by `cp` from the scratchpad pre-edit copies (both sha1-verified on disk):
  `$SP/CLAUDE.md.preedit2` → sha1 `9c6eec6835eb832283ebe8f98258c89951f5ca5a`;
  `$SP/audituat-todo.preedit` → sha1 `3a8f9cd78f57f9a741e7ca4525577f8cb5288379`.
  NEVER `git checkout --` (fires the repo post-checkout hook). NEVER `git stash` (a CONCURRENT
  session is live in this repo and modified untracked files mid-run during the previous task).
- Stage EXPLICIT pathspecs only, never `git add -A` / `git add .`. NEVER stage:
  `.claude/skills/archify/`, `skills-lock.json`,
  `.planning/quick/260912-d84-align-the-humble-keys-game-column-header/`,
  `.planning/todos/completed/2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md`,
  `.planning/spikes/024-epic-store-in-embedded-child-webview/run.log`,
  `.planning/spikes/024-epic-store-in-embedded-child-webview/shot-epic-*.png`,
  `.planning/phases/43-*/43-UAT.md`,
  `.planning/todos/pending/2026-09-18-43-03-candidate-a-verdict-rests-on-an-unsatisfied-precondition.md`.
- Do NOT push.
- BSD/macOS userland: no `timeout`, no `cat -A`; `grep -c` returning 0 EXITS 1 and breaks `&&`
  chains — use `;` separators or append `; true`; quote globs.
</hard_constraints>

<tasks>

<task type="auto">
  <name>Task 1: Add a FOURTH convention to CLAUDE.md's conventions region</name>
  <files>CLAUDE.md</files>
  <action>
First capture the pre-existing dirty set, so later tasks can prove what this task did and did not
touch: run `git diff --name-only > $SP/dirty.before` and read it. It is expected to be non-empty
(a concurrent session is live) — capturing it is what makes the later comparison meaningful.

Insert a new `### ` convention inside the `GSD:conventions` region, positioned AFTER the existing
"The sidecar's exit contract" convention and BEFORE the `<!-- GSD:conventions-end -->` marker. Do
not alter a single character of the three existing conventions.

The heading must begin `### UAT item shape` so the verify grep can anchor on it; complete the
heading as you see fit.

The convention must convey this substance:

- **The shape.** In a `*-UAT.md` item, `expected:` carries its text INLINE, and `result:` is the
  VERY NEXT LINE. Never `expected: |`. Show the conforming shape as a short yaml example — the
  `### N. name` heading line, `expected:` with inline text, `result:` immediately below — and show
  the non-conforming block-scalar shape beside it so the contrast is visible.

- **The mechanism, so it is not mistaken for style.** `parseUatItems`' `testPattern`
  (`uat.js:150`) requires inline `expected:` text AND `result:` on the next line. A block scalar
  puts the body in between, the pattern never matches, and EVERY `### N.` item in that file
  disappears from `audit-uat` — not just the one item that carries the block.

- **Suppression, not truncation — and strictly worse.** Truncation shows an operator an
  obviously-wrong `"|"`. Suppression shows a clean, complete-looking audit with `blocked` items
  silently missing. Phase 34.5 is the live proof: 22 items and 3 `blocked` absent, with `summary`
  reporting its reduced count and no indication anything is gone.

- **What is enforced, honestly.** The uat-visibility gate ratchets: it fails a new invisible item,
  including in a file ABSENT from its ledger (its self-test direction 2). So CI does catch this —
  but only AFTER the item is written. This convention exists so the shape is right first. Follow
  the register of the three existing conventions, which state their enforcement limits out loud
  rather than overselling them; do not imply the gate prevents authoring the wrong shape.

- **The deliberate non-goal, stated as a PROHIBITION.** The 26 existing blocks in
  `34.3/34.5/34.6-UAT.md` are NOT to be flattened. Give the reason: `uatRenderCheckpoint`
  (`uat.js:81-82`) deliberately matches `expected: |` and dedents it correctly — it works today.
  Flattening regresses a correct reader in order to repair a broken one, and both live in an
  upstream npx package (v1.42.3) this repo does not control. Someone hitting the gate WILL reach
  for flattening; forbid it explicitly so they stop.

- **The upstream trap.** A UAT file scaffolded from `~/.claude/get-shit-done/templates/UAT.md`
  starts non-conforming (its line 23 emits `expected: |`, as does `workflows/verify-work.md:230`)
  and must be corrected by hand at authoring time. Those files are outside this repo and are NOT
  being changed here.

Match the register of the three existing conventions — detailed, measured, honest about limits —
but do not pad. Wrap prose to roughly the surrounding width (~100 cols); prettier is configured
with prose wrapping preserved, so it will not reflow your paragraphs.

Then run `npx prettier --write CLAUDE.md` and audit `git diff -- CLAUDE.md`. Prettier re-aligns
markdown tables: if you include a table, expect YOURS to be realigned, but realignment of any
PRE-EXISTING line is a REPORT-not-commit condition — stop and report rather than committing.

Planned deletion inventory for this file, derived from what this task changes: **ZERO deleted
lines.** This is a pure insertion before the end marker. The verify asserts that.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib; echo "starts:"; grep -c '<!-- GSD:[a-z-]*-start' CLAUDE.md; echo "ends:"; grep -c '<!-- GSD:[a-z-]*-end -->' CLAUDE.md; echo "conventions-### (want 4):"; awk '/GSD:conventions-start/,/GSD:conventions-end/' CLAUDE.md | grep -c '^### '; echo "new heading (want 1):"; grep -c '^### UAT item shape' CLAUDE.md; echo "prettier:"; npx prettier --check CLAUDE.md; echo "numstat added/deleted (deleted MUST be 0):"; git diff --numstat -- CLAUDE.md</automated>
  </verify>
  <done>
Markers 7/7. Conventions region holds 4 `###` headings, the fourth beginning `### UAT item shape`.
`prettier --check` passes. `git diff --numstat -- CLAUDE.md` shows deletions == **0**. The three
pre-existing conventions are byte-identical to `$SP/CLAUDE.md.preedit2`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Restate the todo IN PLACE (it stays in pending/)</name>
  <files>.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md</files>
  <action>
The file STAYS in `pending/`. Do NOT move it to `completed/`.

This file's established convention is that later sections govern earlier ones and NOTHING is ever
deleted. Follow it: add your new section at the TOP of the body and leave every existing section
untouched. Do not edit the older sections to "correct" them — supersede them.

**Retitle it (frontmatter `title:`).** The current title claims "a second, NEVER-MEASURED
block-scalar population". That is FALSE: the census completed 2026-09-12 (652 fields / 51 files;
3 reachable; 628 read by nothing). The title advertises an unmeasured unknown when the reality is
a measured population with a declined remedy and, now, a made decision. Write a title that
describes that reality — measured population, decision made, residue named.

**Add `## DECISION 2026-09-18 — remedy option 2 adopted` as the first body section**, immediately
after the frontmatter and before the existing `# ` title heading or the `## ITEM B CLOSED` section
(place it so a reader hits it first). It must record:

- What was decided: accept the 26 existing hidden blocks as permanently ledgered by the passing
  uat-visibility gate; prevent NEW ones via an authoring convention.
- What was rejected and why: flattening the existing blocks. `uatRenderCheckpoint`
  (`uat.js:81-82`) deliberately matches `expected: |` and dedents it correctly — it works today.
  Flattening would regress a correct reader to repair a broken one, and both parsers live in an
  upstream npx package (v1.42.3) this repo does not control.
- That the convention now lives in CLAUDE.md's conventions region, named by its heading.
- That the upstream template (`~/.claude/get-shit-done/templates/UAT.md:23`,
  `workflows/verify-work.md:230`) is the root cause and is OUT OF SCOPE — outside this repo.

**Restate all four items by CURRENT status, inside that new section:**

- **B — CLOSED** 2026-09-12 (quick `260912-n9i`).
- **C — DECIDED**, accepted as ledgered, NOT fixed. Name the live residue honestly: phase 34.5's
  22 items and 3 `blocked` are still invisible to `audit-uat`, and that is now a known, ledgered,
  gate-asserted condition rather than a silent one.
- **A — still OPEN.** The two `reason: |` fields at `27-UAT.md` L31/L51 still emit `"|"`. Record
  the trap: both are MULTI-PARAGRAPH (3 paragraphs at L31, 2 at L51), and this todo's own census
  hard-excludes multi-paragraph blocks from flattening — so item A cannot be fixed by flattening
  either. It needs a different remedy shape.
- **D — still OPEN and LATENT.** 17 milestone-hidden fields across `17-UAT.md`, `18-UAT.md`,
  `23.2-HUMAN-UAT.md`, UNMEASURED. Milestone is still `v0.8`; they enter scope if it advances,
  with no gate noticing.

**Reassess `severity:` and ARGUE it in the file** against the CLAUDE.md vocabulary. It is `major`
today on "a measurement is silently contaminated". The crux you must engage: the contamination
still EXISTS (34.5's 3 `blocked` items are still invisible), but it is no longer SILENT — a
passing gate ledgers 59 invisible items across 12 files, and new cases now fail CI. `medium`
("real defect, bounded blast radius, workaround exists") is defensible and is the orchestrator's
view. Make the call and justify it against the vocabulary, not by assertion.

**Reassess `ready:` and ARGUE it.** It is `human` because a decision was outstanding; that
decision has now been MADE. But do not rubber-stamp `code` — engage the tension: item A still
needs a remedy SHAPE chosen, and this file already set the precedent that authorship (writing a
`## Current Focus` line) was treated as "not a shape fix" and deliberately NOT done as desk work.
If `human` stays, say what the REMAINING human question is and how it differs from the one just
answered. If it moves to `code`, say what desk work is now unblocked. Either is acceptable if
argued; an unargued value is not.

Frontmatter values must stay **bare, lowercase, exact** — no quotes, no capitals. The
todo-frontmatter gate scopes `pending/` and will fail otherwise. Keep `platform:` immediately
after `severity:` and `ready:` immediately after `platform:`.

**Derive your own deletion inventory before committing.** Body deletions MUST be ZERO (the file is
append-only by convention). Frontmatter deletions are exactly the key lines you actually chose to
change: `title:` always, plus `severity:` and/or `ready:` if your argued call moved them. State
the number you intend, then assert it. If `git diff` shows a removed line that is not one of those
frontmatter keys, you deleted body content — restore from `$SP/audituat-todo.preedit` and redo.

If you must restore: `cp $SP/audituat-todo.preedit <the todo path>`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib; T=.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md; echo "still in pending:"; test -f "$T" && echo yes; echo "NOT in completed (want 'absent'):"; test -e .planning/todos/completed/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md && echo PRESENT-BAD || echo absent; echo "triage keys:"; sed -n '1,12p' "$T" | grep -E '^(severity|platform|ready):'; echo "decision section (want 1):"; grep -c '^## DECISION 2026-09-18' "$T"; echo "title no longer claims never-measured (want 0):"; grep -ci 'never-measured' "$T"; true; echo "--- REMOVED lines (every one MUST be a frontmatter title/severity/ready key):"; git diff -U0 -- "$T" | grep '^-[^-]'; true; echo "--- numstat:"; git diff --numstat -- "$T"; echo "--- frontmatter gate:"; python3 .planning/todos/todo-frontmatter-gate.py 2>&1 | tail -2</automated>
  </verify>
  <done>
File is still in `pending/` and absent from `completed/`. It carries exactly one
`## DECISION 2026-09-18` section, zero occurrences of "never-measured", and bare lowercase
`severity`/`platform`/`ready` values. Every removed line in the diff is a frontmatter
`title:`/`severity:`/`ready:` line — zero body deletions. The standalone frontmatter gate still
reports `OK: 26 pending todo(s) ...`. Severity and readiness are each argued in the file against
the CLAUDE.md vocabulary, not merely asserted.
  </done>
</task>

<task type="auto">
  <name>Task 3: Prove the tool did not move, run the gates, stage explicitly and commit</name>
  <files>.planning/quick/260918-amq-uat-expected-inline-convention/260918-amq-SUMMARY.md</files>
  <action>
This task proves the documentation change moved nothing, then commits.

**1. Prove `audit-uat` is unmoved in BOTH directions.** Re-run `gsd-sdk query audit-uat` into
`$SP/audituat.after.json` and compare against the pre-edit control `$SP/audituat.baseline.json`.
Assert `total_files` == 8, `total_items` == 59, and that `summary.by_phase` has NO `34.5` key. A
byte-identical diff against the baseline is the strongest form; if the JSON key order is unstable
across runs, fall back to the three explicit assertions, which decide the result. A change in
EITHER direction is a failure — this is documentation and must not move that number.

**2. Confirm no UAT file, gate file, or ledger was touched.** Compare the current tracked-modified
set against `$SP/dirty.before` captured in Task 1. The only NEW entries may be `CLAUDE.md` and the
todo. Any `*-UAT.md`, `*-VERIFICATION.md`, or gate `.py` appearing as newly modified is a failure.

**3. Run `pnpm planning-gates`** and report the pass count — expected `11/11 planning gates passed.`

**4. Stage EXPLICIT pathspecs only** — `CLAUDE.md`, the todo path, and this plan's directory
`.planning/quick/260918-amq-uat-expected-inline-convention/`. Never `git add -A` or `git add .`.
Then read back `git diff --cached --name-only` and confirm it contains ONLY those paths. If any
forbidden path from the hard constraints appears (archify, skills-lock.json, the 260912-d84 quick
dir, the humble-keys completed todo, the spike log/PNGs, `43-UAT.md`, the 43-03 pending todo),
unstage it with `git restore --staged <path>` — do NOT `git checkout`.

**5. Write the SUMMARY** at the path in `<files>`, recording: the decision adopted, both measured
counts (audit-uat before/after, gates), the argued severity and ready values with their reasoning,
and what was deliberately NOT done (the 26 blocks, item A, item D, the upstream template).

**6. Commit** with a message naming the quick id and the decision — subject line in the
`docs(260918-amq): ...` shape, body recording that the 26 existing blocks were deliberately left
ledgered and why. End the commit message with:
`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

**Do NOT push.**
  </action>
  <verify>
    <automated>SP=/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/de4e5ce0-5c62-42b9-a52b-51d32b1b037d/scratchpad; cd /Users/graysonmitchell/Projects/GameLib; gsd-sdk query audit-uat > "$SP/audituat.after.json" 2>/dev/null; echo "--- audit-uat assertions:"; node -e 'const a=require(process.env.SP+"/audituat.after.json").summary; const ok = a.total_files===8 && a.total_items===59 && !("34.5" in a.by_phase); console.log("files:",a.total_files,"items:",a.total_items,"has34.5:",("34.5" in a.by_phase)); console.log(ok?"PASS: tool unmoved":"FAIL: tool moved");' ; echo "--- byte diff vs baseline:"; diff -q "$SP/audituat.baseline.json" "$SP/audituat.after.json" && echo IDENTICAL; echo "--- newly-modified vs dirty.before (want only CLAUDE.md + the todo):"; git diff --name-only > "$SP/dirty.after"; diff "$SP/dirty.before" "$SP/dirty.after"; true; echo "--- no UAT/gate touched (want no output):"; git diff --name-only | grep -E '(UAT|VERIFICATION)\.md$|gate\.py$'; true; echo "--- planning gates:"; pnpm planning-gates 2>&1 | tail -3; echo "--- staged set:"; git diff --cached --name-only</automated>
  </verify>
  <done>
`audit-uat` reports 8 files / 59 items with `34.5` still absent — unmoved in both directions.
`git diff --name-only` differs from `$SP/dirty.before` by exactly `CLAUDE.md` and the todo, and no
`*-UAT.md`/`*-VERIFICATION.md`/gate `.py` appears. `pnpm planning-gates` prints
`11/11 planning gates passed.` The staged set contains only `CLAUDE.md`, the todo, and the
`260918-amq-*` quick directory. SUMMARY written. Commit made, carrying the Co-Authored-By trailer.
Nothing pushed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none introduced | Documentation-only change. No input parsing, no network, no package install, no executable surface added. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-amq-01 | Tampering | concurrent session's uncommitted files | mitigate | Explicit pathspec staging only; forbidden-path list enforced; `git diff --cached --name-only` read back before commit. No `git add -A`, no `git stash`. |
| T-amq-02 | Tampering | pre-existing CLAUDE.md content via prettier reflow | mitigate | `git diff --numstat -- CLAUDE.md` must show 0 deletions; `prettier --check` clean at HEAD is the negative control. REPORT-not-commit on any wider diff. |
| T-amq-03 | Repudiation | todo's append-only record | mitigate | Body deletions must be zero; every removed line asserted to be a frontmatter key line; pre-edit copy sha1-verified for restore. |
| T-amq-04 | Denial of Service | repo post-checkout hook / concurrent session | mitigate | Restore only by `cp` from scratchpad. `git checkout --` and `git stash` forbidden outright. |
| T-amq-SC | Tampering | package installs | accept | No package manager install occurs in this plan. Package Legitimacy Gate not applicable. |
</threat_model>

<verification>
Phase-level checks, all of which must hold at completion:

1. CLAUDE.md has 7 `GSD:*-start` and 7 `GSD:*-end` markers, and the conventions region holds
   exactly 4 `###` headings.
2. `npx prettier --check CLAUDE.md` passes and `git diff --numstat -- CLAUDE.md` shows 0 deletions.
3. The todo is still in `pending/`, retitled, carries `## DECISION 2026-09-18`, and has zero body
   deletions.
4. `gsd-sdk query audit-uat` still reports 8 files / 59 items with `34.5` absent.
5. `pnpm planning-gates` reports `11/11 planning gates passed.`
6. No `*-UAT.md`, no gate `.py`, and nothing under `~/.claude/get-shit-done/` is modified.
7. Nothing pushed.
</verification>

<success_criteria>
- A fourth convention exists in CLAUDE.md that teaches the inline `expected:`/`result:` shape, cites
  the `uat.js:150` mechanism, names suppression-vs-truncation with phase 34.5 as proof, states the
  gate's enforcement limit honestly, forbids flattening the 26 existing blocks with the
  `render-checkpoint` trade as the reason, and warns about the upstream template.
- The todo's title describes a measured population with a made decision, and its new top section
  records the decision and restates items A/B/C/D by current status with severity and readiness
  each argued against the CLAUDE.md vocabulary.
- The task is provably inert with respect to `audit-uat` and all 11 planning gates.
</success_criteria>

<output>
Create `.planning/quick/260918-amq-uat-expected-inline-convention/260918-amq-SUMMARY.md` when done.
</output>
