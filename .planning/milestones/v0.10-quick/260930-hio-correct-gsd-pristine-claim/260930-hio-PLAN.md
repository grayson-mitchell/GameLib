---
phase: quick-260930-hio
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - CLAUDE.md
autonomous: true
requirements:
  - QUICK-260930-hio
estimate:
  tokens: 25000
  raw_tokens: 25000
  tasks: 2
  confidence: low # DERIVED: estimate-calibration returned sample_count 0, factor 1, applied false

must_haves:
  truths:
    - "A reader of the gsd-pristine paragraph learns that the pristine tree covers ONLY the files already known to be locally modified — not the release."
    - "A reader learns that a gsd-core file modified locally for the first time before the next upgrade still has no baseline, which is the same hole the 1.42.3 -> 1.14.0 move fell into."
    - "The paragraph states that gsd-pristine exists and holds 2 hash-verified files; it never describes the directory as absent or as holding nothing."
    - "The paragraph describes the 1.14.0 -> 1.15.0 outcome as indistinguishable from a verbatim restore, asserting neither that a three-way merge happened nor that it did not."
    - "The MANUAL-reapply caveat and the unversioned/overwritten-on-upgrade caveat survive the rewrite verbatim in substance."
    - "A reader of the get-shit-done clause can reproduce the figure 17 because the command that yields it is named, and cannot mistake it for a top-level entry count."
    - "The get-shit-done conclusion (a tree with no files in it cannot be run) and its self-correction sentence survive unchanged."
  artifacts:
    - CLAUDE.md
  key_links:
    - "The rewritten gsd-pristine paragraph stays the LAST paragraph of the formatter-check subsection, immediately before the `<!-- GSD:conventions-end -->` marker."
    - "The preceding paragraph (7-hits/1-hit counts, `/gsd-update --reapply`, `2 checked, 0 failures, 0 drifted`) is untouched — measured still accurate, so the rewrite must not restate or contradict it."
    - "The get-shit-done clause stays inside the `**What changed, and when.**` paragraph of the UAT subsection; the `34.5-UAT.md` (17 items) figure 3 lines below is a DIFFERENT 17 and must not be touched."
---

<objective>
Two precision edits to hand-maintained prose in `CLAUDE.md`. No source, no tooling, no new sections.

1. **Correct an overstated scope claim.** The final paragraph of the "A formatter check belongs in every
   task's `<verify>`" subsection (currently lines 420-428) says `~/.claude/gsd-pristine/` "is now seeded
   with the untouched 1.14.0 originals at canonical `gsd-core/` paths, so the next upgrade can do a real
   three-way merge". Measured: the tree holds exactly 2 files, and they are exactly the 2 files
   `gsd-local-patches/backup-meta.json` already lists as locally modified. It is a per-patched-file
   baseline, not a snapshot of the release — so the hole the wording implies is closed is still open for
   any file modified locally for the first time.

2. **Disambiguate a census figure** (NOT a correction — the existing claim measured out RIGHT). The
   `**What changed, and when.**` paragraph in the UAT subsection (currently lines 306-309) says
   `~/.claude/get-shit-done/` "holds 17 entries, every one a directory and not one a file". Both halves
   are true, but the bare "17 entries" reads as a top-level count when it is `find -type d` counting the
   root plus 16 sub-directories — and a plain `ls` showing 5 was in fact misread as contradicting it. A
   count whose measuring command is not named invites that misread; naming the command is the whole edit.

Purpose: stop two readable-but-misleading figures in the durable copy of the repo's conventions from
being repeated as fact — one that overstates what a safety net covers, one that invites a false
contradiction.
Output: a single modified `CLAUDE.md`, two hunks, nothing else.

**No tracer task.** Tracer-first decomposition is inapplicable here: one file, two prose paragraphs, no
layers to wire end-to-end. Each task is already the whole vertical slice of its own change.

**No `tdd="true"`.** Documentation-only edits are an explicit exception.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

**Do NOT read `.planning/STATE.md`.** It is 1.4 MB and nothing in it is needed. If you must touch it,
grep a narrow pattern only.

**Do NOT run graphify.** That rule governs *code* exploration. This plan edits two markdown paragraphs
and touches no source; graphify would return nothing useful and costs a turn.

**Paths under `~/.claude/` in this plan are EVIDENCE, read-only.** They were measured live at planning
time (2026-09-30) and every figure below was re-verified by the planner against this machine. The ONLY
file either task may modify is `CLAUDE.md`. Do not write to `~/.claude/`, and do not enumerate anything
under it as an edit target. You do not need to re-derive the measurements; if you choose to spot-check
one, use the command named beside the figure.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite the gsd-pristine paragraph to state the measured, per-patched-file scope</name>
  <files>CLAUDE.md</files>
  <read_first>
    `CLAUDE.md` lines 403-430 — the tail of the "A formatter check belongs in every task's `<verify>`"
    subsection. Lines 408-418 (the 7-hits/1-hit paragraph, the `/gsd-update --reapply` sentence, and
    `2 checked, 0 failures, 0 drifted`) are CORRECT and OUT OF SCOPE — planner re-measured the live
    counts as 7 and 1 on 2026-09-30. Line 430 is `<!-- GSD:conventions-end -->` and must stay put.
  </read_first>
  <action>
Replace the whole 9-line paragraph currently at lines 420-428 (opening `The upgrade path has genuinely
improved:` and closing `...not as the requirement.`) with a rewritten paragraph. Replace those 9 lines
and nothing else — do not reflow the paragraph above or below, do not add a heading, do not add a gate.

The rewritten paragraph MUST assert, in this order, all of the following measured facts. Every figure
here was verified by the planner on this machine on 2026-09-30; use the measured-fact-with-date voice
the surrounding corpus uses and do not soften any of them.

  - `~/.claude/gsd-pristine/` DOES exist and is not empty: `drwxr-xr-x@`, mtime `Sep 26 15:42`. Say so
    plainly. An earlier draft of this correction described the directory as not being there, and that
    was wrong — the rewritten paragraph must not characterise it that way in any wording. This file
    already records a near-identical prior error one section above, in the UAT subsection, where a claim
    that a path no longer existed had to be corrected to "exists but holds no files". Do not re-create
    that error one section later.
  - It holds exactly 2 files under 5 directories and nothing else (`find ~/.claude/gsd-pristine -type f
    | wc -l` returns 2; `-type d` returns 5): `gsd-core/templates/phase-prompt.md` (19412 bytes) and
    `gsd-core/bin/lib/template.cjs` (10781 bytes), both stamped `Sep 26 15:42`.
  - Those 2 are genuine untouched 1.14.0 originals, hash-verified: `shasum -a 256` yields `b6585df7…`
    for `template.cjs` and `6e0068f3…` for `phase-prompt.md`, matching `gsd-local-patches/
    backup-meta.json`'s `pristine_hashes` exactly. Truncate the hashes to a readable prefix like that —
    do not paste all 64 characters; the full values live in `backup-meta.json`.
  - Corroboration that they are pre-patch and that the reminder is ours: a case-insensitive
    `grep -ic -E 'prettier|formatter'` returns 0 in each `gsd-pristine/` copy, against the live 7 and 1
    the paragraph above already cites. State the 0s; do NOT restate the 7 and 1 as new findings.
  - **The load-bearing correction, and the paragraph's emphasis.** Include the literal phrase
    `per-patched-file baseline, not a snapshot of the release`, bolded, as the thesis. The reason is
    checkable: `backup-meta.json`'s `files` array is exactly `["gsd-core/bin/lib/template.cjs",
    "gsd-core/templates/phase-prompt.md"]` — the same 2 paths the pristine tree contains — so the tree
    holds a baseline only for files ALREADY known to be locally modified. Any gsd-core file modified
    locally for the first time before the next upgrade therefore still has **no baseline**, which is the
    same hole the 1.42.3 -> 1.14.0 move fell into and which the old wording implied had been closed.
    Keep the old paragraph's account of that hole compactly: that move had neither a git repo at
    `~/.claude` nor a pristine snapshot, and its baseline had to be reconstructed from the npm tarball
    and hash-validated.
  - The 1.14.0 -> 1.15.0 upgrade is the first one that had pristine available (`backup-meta.json`
    `from_version` `1.14.0`, `backed_up_at 2026-09-29T19:21:40.467Z`; `gsd-file-manifest.json`
    `version: 1.15.0` at `19:21:40.713Z`; `gsd-core/VERSION` reads `1.15.0`). Its observable outcome is
    **indistinguishable from a verbatim restore**: the live installed files are byte-identical to the
    `gsd-local-patches/` backups (`e559c6e7…` for `template.cjs`, `e021d981…` for `phase-prompt.md`).
    Use the literal phrase `indistinguishable from a verbatim restore`. Do NOT assert a three-way merge
    happened; do NOT assert it did not. Note that a verbatim restore is harmless only if 1.15.0 shipped
    those two files unchanged from 1.14.0, and that this cannot be checked from here because the live
    copies are patched.
  - Then KEEP the existing limit material, still true and still at equal weight: reapply is a MANUAL
    step the operator must run after every upgrade, nothing runs it automatically, and those gsd-core
    files remain outside this repo, unversioned, shared by every project on the machine, and a
    `gsd-core` upgrade will overwrite them — the same caveat this file already records for the UAT
    template. Preserve the existing bold span over the "remain outside this repo…overwrite them" clause.
  - Then KEEP the closing sentence, on its own, unchanged in substance: this section is the durable copy
    of the requirement; treat the template text as a convenience, not as the requirement.

Four literal strings must survive or appear verbatim, because the verify gates grep for them:
`MANUAL step the operator must run after every upgrade`, `nothing runs it automatically`,
`durable copy of the requirement`, and the two new phrases named above.

Style, matching the surrounding corpus exactly: hard-wrap at ~100 columns — note the line you are
replacing at 427 currently runs to 107 and the rewrite should not repeat that; `**bold**` for
load-bearing warnings only; backticks for paths, commands, hashes and JSON keys. Root `.prettierrc` sets
no `proseWrap`, so prettier preserves your wrapping and will not fix it for you.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && npx prettier --check CLAUDE.md</automated>
    <automated>test "$(grep -n -B2 -A10 'gsd-pristine' CLAUDE.md | grep -ciE '\b(missing|absent)\b')" = 0</automated>
    <automated>test "$(grep -cF 'per-patched-file baseline, not a snapshot of the release' CLAUDE.md)" = 1 && test "$(grep -cF 'indistinguishable from a verbatim restore' CLAUDE.md)" = 1 && test "$(grep -cF 'no baseline' CLAUDE.md)" -ge 1</automated>
    <automated>test "$(grep -cF 'MANUAL step the operator must run after every upgrade' CLAUDE.md)" = 1 && test "$(grep -cF 'nothing runs it automatically' CLAUDE.md)" = 1 && test "$(grep -cF 'durable copy of the requirement' CLAUDE.md)" = 1</automated>
    <automated>test "$(grep -cF 'returns 7 hits in the template' CLAUDE.md)" = 1 && test "$(grep -cF '2 checked, 0 failures, 0 drifted' CLAUDE.md)" = 1</automated>
  </verify>
  <done>
    The paragraph names the 2-file scope, cites the two truncated pristine hashes, carries the bolded
    `per-patched-file baseline, not a snapshot of the release` thesis and the `no baseline` consequence,
    describes the 1.15.0 outcome as `indistinguishable from a verbatim restore`, never describes
    gsd-pristine as not being there, retains the MANUAL-reapply and unversioned/overwritten caveats and
    the closing durable-copy sentence, and lines 408-418 are byte-identical to before.
  </done>
</task>

<task type="auto">
  <name>Task 2: Name the command behind the get-shit-done count so 17 cannot be misread</name>
  <files>CLAUDE.md</files>
  <read_first>
    `CLAUDE.md` lines 295-313 — the `**What changed, and when.**` paragraph of the "UAT item shape"
    subsection. The clause to change begins `That figure cannot be re-measured:` and ends
    `...cannot be run.` (currently lines 306-309). **Line 310's `` `34.5-UAT.md` (17 items) `` is a
    DIFFERENT 17** — an outstanding-item count, unrelated to the directory census — and is out of scope.
  </read_first>
  <action>
This is a DISAMBIGUATION, not a correction. On measurement the existing claim is RIGHT: `find
~/.claude/get-shit-done -type d | wc -l` returns 17, `-type f` returns 0, `-type l` returns 0, so "every
one a directory and not one a file" is exactly true and the conclusion it supports is untouched. Do not
write this up as fixing a false claim, and do not cast doubt on the figure.

The single soft spot is that a bare count reads as a top-level entry count. Replace ONLY the count clause
so the number is checkable and unambiguous. Planner-verified on this machine 2026-09-30, tree mtime
`Sep 26 15:35:42 2026` (unchanged since before the cited re-measurement, so the 17 was taken against
this exact tree):

  - 5 top-level entries — `bin`, `contexts`, `references`, `templates`, `workflows` (`ls -A` returns 5,
    `find … -mindepth 1 -maxdepth 1 | wc -l` returns 5, and there are no hidden entries since `ls -A`
    and `ls` agree)
  - 16 descendants in all (`find … -mindepth 1 | wc -l`), every one a directory
  - 17 directories when `find ~/.claude/get-shit-done -type d | wc -l` counts the root alongside those
    16 sub-directories — **name that command in the prose**, because making the figure checkable is the
    entire point of this edit
  - 0 files at any depth, and 0 symlinks

Add ONE clause recording why the edit exists: a count whose measuring command is not named invited
exactly the misread that prompted it — a plain `ls` showing 5 was read as contradicting the 17, when both
are correct measurements of an unchanged tree. One clause. Do not sermonize, do not add a new section,
do not add a gate.

Keep, unchanged: the `**What changed, and when.**` lead-in; the self-correction sentence about the
earlier claim that the path no longer existed at all; and the conclusion `because a tree with no files in
it cannot be run`, verbatim. Do not touch anything before `That figure cannot be re-measured:` or after
`...cannot be run.`

Style: same as Task 1 — ~100-column hard wrap, measured-fact-with-date voice, backticks for paths and
commands.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && npx prettier --check CLAUDE.md</automated>
    <automated>test "$(grep -cF 'find ~/.claude/get-shit-done -type d' CLAUDE.md)" -ge 1</automated>
    <automated>test "$(grep -cF 'a tree with no files in it cannot be run' CLAUDE.md)" = 1 && test "$(grep -cF 'used to claim the path no longer exists at all' CLAUDE.md)" = 1 && test "$(grep -cF '**What changed, and when.**' CLAUDE.md)" = 1</automated>
    <automated>test "$(grep -cF '17 entries' CLAUDE.md)" = 0 && test "$(grep -cF '(17 items)' CLAUDE.md)" = 1</automated>
  </verify>
  <done>
    The clause names `find ~/.claude/get-shit-done -type d` as the source of 17, distinguishes it from
    the 5 top-level entries and 16 descendants, states 0 files at any depth, records in one clause why
    an unnamed command invited a misread, and preserves the self-correction sentence and the
    no-files-cannot-be-run conclusion verbatim. `34.5-UAT.md` (17 items) on the following line is
    untouched.
  </done>
</task>

</tasks>

<!--
planner-discipline-allow: missing, absent, 17 entries
Reason: Task 1's third `<automated>` negative-greps `missing|absent` and Task 2's fourth negative-greps
`17 entries`, and all three literals appear in this plan's `<action>`/`<read_first>` prose as
prohibited-vocabulary being named. Self-invalidation is physically impossible here: every grep target is
`CLAUDE.md`, and no text from this plan is ever written into `CLAUDE.md`. The plan file itself is under
`.planning/`, which the greps never read.
-->

<threat_model>
## Trust Boundaries

| Boundary                                                     | Description                                                                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| local operator state (`~/.claude/`) → repo-tracked `CLAUDE.md` | Figures measured from unversioned, machine-local operator state are transcribed into a file tracked in a public fork. Read-only in that direction.  |
| planner/executor prose → public git history                  | `origin` IS the fork and the repo is public, so anything written here is published.                                                                |

## STRIDE Threat Register

Proportionate by design: the only artifact touched is one repo-tracked markdown file, and everything read
from `~/.claude/` is local operator state. **Spoofing, Repudiation, Denial of Service and Elevation of
Privilege have no surface in a two-paragraph prose edit** — no identity, no authz, no request path, no
resource is involved — so no rows are opened for them. ASVS level 1, `security_block_on: high`; nothing
here reaches high.

| Threat ID       | Category               | Component                                     | Severity | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                                       |
| --------------- | ---------------------- | --------------------------------------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-Q260930-01    | Information disclosure | `CLAUDE.md` prose transcribing `~/.claude/` state | low      | mitigate    | Only non-secret values may be quoted: SHA-256 content hashes of two public npm-shipped template files, version strings, ISO timestamps, byte sizes and file counts. No tokens, keys, cookies or session data. Hashes truncated to an 8-char prefix. Paths written in `~/`-relative form, never absolute — no username leaks. |
| T-Q260930-02    | Tampering              | files under `~/.claude/` (gsd-core install)   | low      | mitigate    | `~/.claude/` is EVIDENCE, read-only. `files_modified` is `CLAUDE.md` alone; no task names a `~/.claude/` path as an edit target; the diff-scope gate in `<verification>` asserts `CLAUDE.md` is the only tracked file changed. A stray write there would also be invisible to this repo's history, which is why it is fenced off. |
| T-Q260930-SC    | Tampering              | `npx prettier` in every `<verify>` block      | low      | mitigate    | No package-manager install task exists in this plan, so no legitimacy audit is required. `prettier` 3.7.4 already resolves from the repo's `node_modules` — planner ran `npx prettier --check CLAUDE.md` at plan time and it exited 0 without fetching. `<verification>` asserts local resolution before the check, so `npx` cannot silently pull an arbitrary remote package. |
</threat_model>

<verification>
All commands assume cwd at the checkout root. Every path is repo-root-relative; `~/.claude/` paths appear
only as evidence inside prose, never as an operand.

1. **Formatter check — mandatory and NOT vacuous here.** `npx prettier --check CLAUDE.md`. Planner
   measured `npx prettier --file-info CLAUDE.md` → `{ "ignored": false, "inferredParser": "markdown" }`,
   so this check really sees the file. Scoped to the explicit path; never a bare `.`. Baseline verified
   green before the edit, so a red result is this plan's doing.
2. **prettier resolves locally** (T-Q260930-SC): `test -x node_modules/.bin/prettier`.
3. **Diff scope — exactly two hunks in exactly one tracked file.**
   `test "$(git diff -U0 -- CLAUDE.md | grep -c '^@@')" = 2` and
   `test "$(git diff --name-only | grep -v '^\.planning/')" = CLAUDE.md`.
   The two edit sites are ~110 lines apart, so they cannot legitimately merge into one hunk; a third hunk
   means an out-of-scope edit.
4. **Wrap discipline on what this plan wrote** (prettier preserves prose wrapping, so nothing else
   checks it):
   `test "$(git diff -U0 -- CLAUDE.md | grep '^+' | grep -v '^+++' | awk '{ if (length($0)-1 > 100) n++ } END { print n+0 }')" = 0`.
5. **Task 1 gates** as listed in its `<verify>`. Honest note on the `missing|absent` gate: it is green on
   the pre-edit file too — it is a regression guard against re-introducing the retracted "not there"
   framing, not proof the edit happened. The three positive greps are what prove the edit landed.
6. **Task 2 gates** as listed in its `<verify>`. The `(17 items)` gate is the guard that `34.5-UAT.md`'s
   unrelated 17 was not swept up by an over-broad edit.
7. **Not run, and deliberately so:** `pnpm planning-gates`, `pnpm codecheck`, `pnpm lint`, jest, cargo.
   No source, no locale catalogue, no todo frontmatter and no envelope-tagged planning body is touched by
   this plan, so all of them are vacuous against it. Stating that here rather than running one for a
   green that proves nothing.
</verification>

<success_criteria>
- `CLAUDE.md` is the only tracked file changed outside `.planning/`, in exactly 2 hunks.
- `npx prettier --check CLAUDE.md` exits 0, and no line this plan added exceeds 100 columns.
- The gsd-pristine paragraph states the 2-file, per-patched-file scope with the `no baseline` consequence
  as its emphasis; never describes the directory as not being there; and describes the 1.15.0 outcome as
  indistinguishable from a verbatim restore without asserting a merge either way.
- The MANUAL-reapply caveat, the unversioned/overwritten-on-upgrade caveat, and the closing durable-copy
  sentence all survive.
- Lines 408-418 (7 hits / 1 hit, `/gsd-update --reapply`, `2 checked, 0 failures, 0 drifted`) are
  byte-identical to before.
- The get-shit-done clause names `find ~/.claude/get-shit-done -type d` as the source of 17, separates it
  from 5 top-level entries and 16 descendants, and keeps both the self-correction sentence and the
  no-files-cannot-be-run conclusion verbatim.
</success_criteria>

<output>
Create `.planning/quick/260930-hio-correct-gsd-pristine-claim/260930-hio-SUMMARY.md` when done.

Record in it, briefly: that Task 2 was a disambiguation of a figure that measured out CORRECT, not a
correction of a false claim — an ambiguous census figure whose measuring command was not named caused a
real misread (a plain `ls` of 5 read as contradicting a `find -type d` of 17 on an unchanged tree). One
or two sentences; the durable lesson is that a bare count needs its command named.
</output>
