---
phase: quick-260912-bul
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/ROADMAP.md
autonomous: true
requirements: []
baseline_head: 687b6dc8a

must_haves:
  truths:
    - "The Phase 34.6 heading declares `COMPLETE 2026-08-26` in the house form used by phases 36, 37 and 40"
    - "The `**Plans:**` line says 21/21 executed on disk and no longer claims 34.6-19..21 are unexecuted"
    - "The 34.6-21 plan row is checked and carries a DONE 2026-08-26 note"
    - "`**The phase closes FAIL 7/9**` survives verbatim; `FAIL 7/9` still occurs exactly 3 times in the block"
    - "The roadmap entry and the on-disk folder rollup now AGREE: both resolve `complete` under the real extension parser"
    - "Exactly 3 insertions and 3 deletions in exactly 1 file"
  artifacts:
    - path: ".planning/ROADMAP.md"
      provides: "Phase 34.6 block (lines 3127-3239) stating its true completion facts"
      contains: "COMPLETE 2026-08-26"
  key_links:
    - from: ".planning/ROADMAP.md line 3127"
      to: "gsd-phase-status strongStatus()"
      via: "U+2705 emoji marker on the phase declaration line"
      pattern: "COMPLETE 2026-08-26"
---

<objective>
Correct three stale facts in the Phase 34.6 block of `.planning/ROADMAP.md`. All 21 plans are paired
and executed on disk; the roadmap still says 18/21 and leaves 34.6-21 unchecked.

Purpose: the 34.6 folder ALREADY rolls up to `complete` under the real parser. The roadmap heading
currently declares nothing, so folder evidence is the only thing keeping the phase green. Making the
declaration explicit and true removes the divergence between the record and the disk.

Output: three single-line edits, one file, 3 insertions / 3 deletions, committed with explicit
pathspecs.
</objective>

<scope_fence>
**`.planning/ROADMAP.md` ONLY. ONE task. Do not expand scope.**

- Do NOT touch `STATE.md` (the orchestrator owns it), any 34.6 phase artifact, or any other file.
- Do NOT re-score, soften, hide or relocate the `FAIL 7/9` verdict — see `<fail_verdict_is_load_bearing>`.
- Do NOT "fix" line 3237 — see `<the_3237_trap>`.
- Never use `gsd-sdk` to write `ROADMAP.md`; it corrupts the file. Never `gsd-sdk query commit`.
- Three unrelated paths are dirty at baseline and must stay uncommitted AND unmodified:
  `.planning/todos/completed/2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md`,
  `.claude/skills/archify/`, `skills-lock.json`.
</scope_fence>

<established_evidence>
Already measured at baseline `687b6dc8a`. **Do not re-derive any of this.**

- All 21 plans are PAIRED on disk (`34.6-NN-PLAN.md` + `34.6-NN-SUMMARY.md`, NN = 01..21).
  `34.6-21-SUMMARY.md` is `status: DONE`, `completed: 2026-08-26`.
- 34.6-21's deliverable landed: `## GAP CYCLE 2` is present in `34.6-LIVE-GATE.md`.
- Tier-1 artifacts all resolve `complete`: VALIDATION `approved`, VERIFICATION `passed` (9/9),
  UAT `complete`, REVIEW `issues_found` rescued by `REVIEW-FIX.md` at `resolved`.
- The 34.6 folder rollup already computes `complete`.
- Block bounds: heading **3127**, block runs **3127-3239**, next phase (`### Phase 34.8:`) at 3240.
- `FAIL 7/9` occurs 3 times in the block: lines **3208, 3231, 3238**.
- The block's ONLY `- [ ]` is line **3238**. 20 rows are already `- [x]`.
- Phase dir: `.planning/phases/34.6-tauri-ipc-re-plumb-slice-9-eos-overlay-steamgriddb-artwork-w`
- `meta/runPlanningGates.py` has `MINIMUM_EXPECTED_GATES = 10`; baseline was 10/10.
</established_evidence>

<length_units_warning>
**The pinned length table is in BYTES. Python `len()` returns CHARACTERS. Both are correct.**

| line | bytes (`awk length`) | chars (`python len`) | non-ASCII |
| --- | --- | --- | --- |
| 3127 | 156 | **154** | 1 em dash |
| 3208 | 467 | **463** | 2 em dashes |
| 3238 | 375 | **373** | 1 em dash |

Each `—` (U+2014) is 3 bytes / 1 char, hence the +2-per-em-dash gap. The script below asserts the
**character** counts. Do not "reconcile" a 154-vs-156 disagreement by editing anything — there is no
disagreement.
</length_units_warning>

<anchor_hazard>
**Never retype an anchor from a rendered line — including from this plan.** The shell renderer in
this environment silently drops substrings (line 3127 has been observed rendering without its
`the ` and `from ` tokens). An anchor retyped from a lossy render matches nothing and the edit
silently no-ops while reporting success.

**Mitigation, mandatory:** every anchor used below is **short and pure ASCII**, and the two non-ASCII
characters that must be *written* are constructed from escape sequences, never typed:

- `EM = '—'` (em dash) — verified on disk at lines 4433 / 4502 / 4798 / 1788.
- `CHECK = '✅'` (white heavy check mark) — verified on disk at the same four lines.

`✅` is **bare U+2705 with NO variation selector** (no U+FE0F). Confirmed: the house headings'
non-ASCII codepoint sequence is exactly `[0x2014, 0x2705]`. Do not append U+FE0F.

**Emoji vocabulary is load-bearing.** In `strongStatus()`, `/[✅✔☑]/` is the complete class.
`⚠️` is the BLOCKED class and would redden the whole planning tree. `⊘` declares nothing. Use
U+2705 and nothing else.
</anchor_hazard>

<fail_verdict_is_load_bearing>
**`**The phase closes FAIL 7/9**` MUST SURVIVE VERBATIM.** 34.6-21's own contract forbids re-scoring
that verdict. A phase can be complete and still have closed on a failed live gate, and the body must
keep saying so. The completion marker is NOT permitted to hide or soften it.

The edit to line 3208 rewrites only its FIRST sentence. Everything from `The 14 planned plans` to the
end of that line — including the bolded FAIL verdict — is untouched. Line 3238's
`(never re-score the FAIL 7/9)` is likewise untouched. Line 3231 is not edited at all.
</fail_verdict_is_load_bearing>

<the_3237_trap>
**Line 3237 legitimately contains a backticked `` `[ ]` `` and MUST NOT be touched.**

34.6-20's row reads `...removed and left ``[ ]`` pending the live re-drive...` — prose describing
REQ-34.6-05 being deliberately left un-ticked in `REQUIREMENTS.md`. It is correct as written.

Consequence for the gate: the unchecked-box census must grep the **exact `- [ ]` form**, not a loose
`\[ \]`. A loose grep returns 1 hit from line 3237 and looks like the gate failed. Gate 2 below is
written with the `- [ ]` form and a pinned expectation that line 3237 still contains its backticked
`` `[ ]` `` afterwards.
</the_3237_trap>

<context>
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Correct the three stale Phase 34.6 facts in ROADMAP.md</name>
  <files>.planning/ROADMAP.md</files>

  <action>
Apply three single-line edits to `.planning/ROADMAP.md` via a Python script (NOT `gsd-sdk`). Using a
script rather than hand-typed `old_string` values is deliberate: it keeps every anchor pure-ASCII and
derives the line content from disk, defeating the renderer substring-drop hazard described in
`<anchor_hazard>`.

Write the script to the scratchpad and run it. It must **assert before it writes** and **abort on any
assertion failure without touching the file**:

Preconditions (character counts, per `<length_units_warning>`):
  - `len(L[3127]) == 154` and `L[3127].startswith('### Phase 34.6:')` and `L[3127].endswith('(INSERTED)')`
  - `len(L[3208]) == 463` and `L[3208].startswith('**Plans:**')`
  - `len(L[3238]) == 373` and `L[3238].startswith('- [ ] 34.6-21-PLAN.md')`
  - each ASCII anchor below occurs **exactly once** on its own line (`.count(anchor) == 1`)

Edit 1 — heading, line 3127. Pure append, no anchor needed beyond the `(INSERTED)` suffix assertion:
  append `' ' + EM + ' ' + CHECK + ' COMPLETE 2026-08-26'` where `EM='—'`, `CHECK='✅'`.
  This matches the bare house form on phases 36, 37 and 40 (`— ✅ COMPLETE <date>`), not the
  extended form on 34.18/34.13. Do not add trailing detail.

Edit 2 — `**Plans:**`, line 3208. Two ASCII substring replacements, first sentence only:
  - `**18/21 executed on disk**` → `**21/21 executed on disk**`
  - `and not yet executed.` → `and executed 2026-08-26.`
  Everything from `The 14 planned plans` onward is untouched, preserving the bolded FAIL verdict.

Edit 3 — plan row, line 3238. One ASCII replacement plus an append:
  - leading `- [ ] 34.6-21-PLAN.md` → `- [x] 34.6-21-PLAN.md`
  - append `' ' + EM + ' DONE 2026-08-26 (see `34.6-21-SUMMARY.md`)'`
  The `— DONE <date> (see `34.6-NN-SUMMARY.md`)` shape matches the sibling rows at 3235-3237. Do NOT
  hunt for commit SHAs to match the siblings more closely — that is scope the corrections do not need
  and the SHAs are not in evidence.

Postconditions the script asserts before writing:
  - total line count unchanged
  - lines 3231 and 3237 are byte-identical to their pre-edit values
  - the block (3127-3239) still contains `FAIL 7/9` exactly 3 times

Informational only (do NOT gate on these — arithmetic pins can convict correct code): expected new
character counts are 178 / 466 / 418.
  </action>

  <verify>
    <automated>
cd /Users/graysonmitchell/Projects/GameLib && python3 - <<'PY'
import subprocess, sys
L = open('.planning/ROADMAP.md', encoding='utf-8').read().split('\n')
blk = L[3126:3239]          # lines 3127..3239 inclusive
ok = True
def chk(name, cond, got=''):
    global ok
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  got: ' + repr(got)))
    ok = ok and cond

# Gate 1 - FAIL 7/9 verdict preserved, still exactly 3 occurrences
n = sum(l.count('FAIL 7/9') for l in blk)
chk('G1 FAIL 7/9 count == 3', n == 3, n)
chk('G1 verdict verbatim on 3208', '**The phase closes FAIL 7/9**' in L[3207])

# Gate 2 - zero unchecked boxes, EXACT '- [ ]' form (see <the_3237_trap>)
un = [3127 + i for i, l in enumerate(blk) if '- [ ]' in l]
chk('G2 zero "- [ ]" in block', un == [], un)
chk('G2 line 3237 keeps its backticked [ ]', '`[ ]`' in L[3236])

# The three corrections landed
chk('C1 heading declares completion', L[3126].endswith('— ✅ COMPLETE 2026-08-26'))
chk('C1 no variation selector', '️' not in L[3126])
chk('C2 21/21 executed', '**21/21 executed on disk**' in L[3207])
chk('C2 stale 18/21 gone', '18/21 executed on disk' not in L[3207])
chk('C2 "not yet executed" gone', 'not yet executed' not in L[3207])
chk('C3 row checked', L[3237].startswith('- [x] 34.6-21-PLAN.md'))
chk('C3 DONE note', L[3237].endswith('— DONE 2026-08-26 (see `34.6-21-SUMMARY.md`)'))

# Gate 3 - exactly 3 insertions / 3 deletions in exactly 1 file
ns = subprocess.run(['git', 'diff', '--numstat'], capture_output=True, text=True).stdout.strip()
chk('G3 numstat == "3\t3\t.planning/ROADMAP.md"', ns == '3\t3\t.planning/ROADMAP.md', ns)
sys.exit(0 if ok else 1)
PY
    </automated>
    <automated>
cd /Users/graysonmitchell/Projects/GameLib && node -e '
const P = require(require("os").homedir()+"/.vscode/extensions/gsd-phase-status/parse.js");
const fs=require("fs"), path=require("path");
const L=fs.readFileSync(".planning/ROADMAP.md","utf8").split("\n");
const heading=L[3126];
if(!heading.startsWith("### Phase 34.6:")) { console.log("FAIL heading not at 3127"); process.exit(1); }
const s=P.strongStatus(heading);
// classifyPlans takes an ARRAY OF FILE NAMES; folderArtifactStatuses takes a NAME->FRONTMATTER map.
// Passing a directory path returns empty and silently measures nothing.
const dir=".planning/phases/34.6-tauri-ipc-re-plumb-slice-9-eos-overlay-steamgriddb-artwork-w";
const files=fs.readdirSync(dir);
const fmByName={};
for(const f of files) if(f.endsWith(".md")) fmByName[f]=P.parseFrontmatter(fs.readFileSync(path.join(dir,f),"utf8"));
const plans=[...P.classifyPlans(files,{}).values()].map(r=>r.status);
const roll=P.rollup(plans.concat(P.folderArtifactStatuses(fmByName)));
console.log("plans classified:", plans.length, "strongStatus:", s, "rollup:", roll);
const ok = s==="complete" && roll==="complete" && plans.length===21;
console.log(ok?"PASS G4 roadmap and folder AGREE (both complete)":"FAIL G4");
process.exit(ok?0:1);'
    </automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm planning-gates 2>&1 | tail -15</automated>
  </verify>

  <done>
Gate 1: `FAIL 7/9` occurs exactly 3 times in the 34.6 block and the bolded verdict is verbatim.
Gate 2: zero `- [ ]` lines in the block; line 3237 still carries its backticked `` `[ ]` ``.
Gate 3: `git diff --numstat` is exactly `3	3	.planning/ROADMAP.md` — one file, 3 insertions, 3 deletions.
Gate 4: the real parser reports `strongStatus` = `complete` on the new heading AND the 34.6 folder
rollup = `complete` over 21 classified plans — roadmap and folder AGREE.
Gate 5: `pnpm planning-gates` is 10/10, matching baseline `687b6dc8a`.
  </done>
</task>

</tasks>

<commit>
Stage explicit pathspecs only. Nothing is staged at baseline, so `git add` + `git commit` is safe;
**never `gsd-sdk query commit`** (it stages the entire tree) and never `git commit -a` or `--only`.

    git add .planning/ROADMAP.md \
            .planning/quick/260912-bul-correct-three-stale-phase-34-6-facts-in-/260912-bul-PLAN.md \
            .planning/quick/260912-bul-correct-three-stale-phase-34-6-facts-in-/260912-bul-SUMMARY.md
    git commit -m "docs(quick-260912-bul): correct three stale Phase 34.6 facts in ROADMAP"

Then verify the COMMIT, not just the working tree (a gate can measure the tree and miss the commit):

    git show --name-only --format= HEAD
    git show --numstat --format= HEAD -- .planning/ROADMAP.md

The first must list ONLY the three paths above. The second must read `3	3	.planning/ROADMAP.md`.
`git status --porcelain` must still show the three baseline-dirty paths, unmodified:
`.planning/todos/completed/2026-09-11-humble-keys-...-unverified-live.md` (` M`),
`.claude/skills/archify/` (`??`), `skills-lock.json` (`??`).
</commit>

<success_criteria>
- All five gates pass.
- The Phase 34.6 roadmap entry declares `COMPLETE 2026-08-26` and the folder rollup agrees.
- The FAIL 7/9 verdict is undiminished: still 3 occurrences, still bolded on line 3208.
- Exactly 3 insertions / 3 deletions in `.planning/ROADMAP.md`, and no other file is modified.
- The three baseline-dirty paths are untouched and uncommitted.
</success_criteria>

<output>
Create `.planning/quick/260912-bul-correct-three-stale-phase-34-6-facts-in-/260912-bul-SUMMARY.md` when done.

The SUMMARY must record that the phase closed on a **FAIL 7/9** live gate and that the completion
marker does not change that verdict. A summary implying the phase closed clean would be false.
</output>
