---
phase: quick-260929-lrh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-REVIEW-CYCLE2.partB.md
  - .planning/phases/29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw/29-REVIEW.md
  - .planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md
autonomous: true
requirements:
  - QUICK-260929-lrh-01
  - QUICK-260929-lrh-02
  - QUICK-260929-lrh-03

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "QUICK-260929-lrh-01: `34.4.1-REVIEW-CYCLE2.partB.md`'s `findings:` counts agree with the published parent verdict (`critical: 0`), and the file says in words that this was a TRANSCRIPTION error corrected, never a re-adjudication of history."
    - "QUICK-260929-lrh-01: partB's `status: issues_found` is byte-identical to HEAD, proven by an empty `^[+-]status:` diff census, and every line of the B-CR-01 finding body present at HEAD is still present in order."
    - "QUICK-260929-lrh-02: an auditor reading `29-REVIEW.md`'s CR-06 learns without leaving the file that the cited deny-list symbol was deliberately DELETED by Phase 35 plan 16, that the protection is intact and strictly stronger at HEAD, and which test pins it."
    - "QUICK-260929-lrh-02: CR-06's `FIXED` verdict and its `40823a5b` attribution are unchanged — the note records a mechanism supersession, not a re-adjudication."
    - "QUICK-260929-lrh-03: a `.planning/todos/pending/` todo records the 24-CR-01/24-CR-02 missing-pin gap with the mutation evidence and the proposed ~10-line parity test, carrying gate-legal bare `severity: medium` / `platform: any` / `ready: code` in that order."
    - "No file outside `.planning/` is modified by any task, proven by `git status --porcelain` carrying only `.planning/` paths."
    - "`pnpm planning-gates` reports 12/12 PASS after every task."
  artifacts:
    - .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-REVIEW-CYCLE2.partB.md
    - .planning/phases/29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw/29-REVIEW.md
    - .planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md
  key_links:
    - "partB's `findings:` counts ↔ the parent `34.4.1-REVIEW-CYCLE2.md`'s `critical: 0`, its line-47 footnote, and its `## Corrections applied to lane output` section. If the counts and the parent disagree again, the defect is back."
    - "CR-06's supersession note ↔ the live `isAllowedStoreField` allow-list in `src/common/types/storePolicy.ts` and the `storePolicy.test.ts:96` D-08 convergence describe block. Every claim the note makes is re-proven by the exact commands the note cites, and the pinning suite is RUN, so the note cannot ship already stale."
    - "the todo's cited line numbers ↔ `shimGenerate.ts:63` (`SHIM_EXPORTED_SYMBOLS`), `native/steam-bridge/generated/steam_api.def` (12 symbols), `meta/gen_vtables.ts:117`/`:129`. Re-confirmed at write time so the todo does not arrive stale."
---

<objective>
Correct three review-bookkeeping defects found during the phase 29/41/24 critical-disposition audit.
All three are records that mislead an auditor about work that is, in fact, correct at HEAD.

Purpose: each defect has already caused, or nearly caused, a wrong conclusion. partB's counts
contradict its own parent's published verdict. `29-REVIEW.md`'s CR-06 cites a symbol that Phase 35
deliberately deleted, so grepping it today reads as a reverted fix — the audit orchestrator nearly
drew exactly that conclusion. Phase 24's two criticals are correct but pinned by nothing, and a
mutation re-creating 24-CR-02 exactly left the whole suite green.

Output: two annotated review records and one filed todo.

**THIS PLAN TOUCHES NO SOURCE CODE.** Every write is under `.planning/`. Nothing in `src/`,
`meta/`, `native/`, `src-tauri/`, or `public/` is modified by any task. Task 3 FILES A TODO
describing a missing test; it does not write the test.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

Read-only reference (do NOT edit):
@.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-REVIEW-CYCLE2.md
</context>

<planner_contributions_considered>
Stated so a reader can see each was weighed rather than skipped.

| Contribution | Fires? | Why |
|---|---|---|
| api-coverage / ai-integration | **NO** | No external API, SDK, or service is integrated, called, or configured. Scope is three markdown files. |
| assumption-delta | **NO** | No singular→plural, required→optional, or derived→chosen transition. Three fixed, enumerated items with no identity model in play. No question to surface. |
| schema-gate | **NO** | No Payload / Prisma / Drizzle collection or schema path is in scope. `files_modified` is three `.planning/**/*.md` paths. No `[BLOCKING]` schema-push task injected. |
| security | **YES** | `<threat_model>` below. It states honestly what is and is not affected: Task 2 DESCRIBES a credential-exposure finding's disposition and changes no security-relevant code. |

**Tracer-first does not fire.** There is no layered stack to thread end-to-end: the three items are
independent documentation corrections in three different files, and the orchestrator mandated
exactly one task per item. No task is foundation-only — each lands a complete, committed,
independently-verifiable correction.

**Task-level TDD does not fire.** No production code is created or modified. Documentation-only
work is an explicit exception to `tdd="true"`.
</planner_contributions_considered>

<rendered_output_discipline>
**Applies to every task. Non-negotiable.**

Rendered `cat`/`sed`/`awk` output on this machine has silently dropped and collapsed text at least
five times, and a previous session invented a non-existent defect twice because of it. It happened
again while this plan was being written: the same partB line rendered once as
`...array's contents is false when checked...` and once as `...array's contents false when
checked...` — from two reads of the same unchanged bytes, one of them through `python3 repr()`.

Therefore:

1. **The line numbers and section names in this plan are reliable. The quoted prose is NOT.** Treat
   every quotation below as a pointer to a location, never as the bytes to match.
2. **Make every edit with the `Edit` tool**, which hard-fails on a mismatched `old_string`. That
   failure is the guard: if the bytes are not what you read, the edit will not silently apply to
   something else.
3. **Never conclude anything about exact bytes or whitespace from a rendered read.** Confirm with a
   tool that makes both sides: `git diff`, `grep -c`, `python3`, or
   `awk '{printf "[%03d] %s|\n", NR, $0}'` — and if two reads of unchanged bytes disagree, the
   reader is wrong, not the file.
</rendered_output_discipline>

<formatter_status>
**A prettier check over these paths is VACUOUS and is deliberately omitted from every `<verify>`
block.** It is not an oversight and must not be "restored".

`.planning/` is prettier-ignored. Probed on this machine 2026-09-29 under prettier 3.7.4:

```
.planning/phases/29-.../29-REVIEW.md              => { "ignored": true, "inferredParser": null }
.planning/todos/pending/2026-09-25-controller-...md => { "ignored": true, "inferredParser": null }
```

Over such a path `npx prettier --check` matches zero files, prints
`All matched files use Prettier code style!` and exits 0 whether or not the file is well-formed —
byte-identical output and exit code to a real pass. Carrying it would be a green that proves
nothing.

If an executor wants the probe re-run as evidence, match it **space-tolerantly** — prettier prints
a space after each colon, and a fixed-string grep for an unspaced form scores 0 against a correct
result:

```bash
npx prettier --file-info "$P" | grep -Eq '"ignored":[[:space:]]*true'
```

What keeps these files consistent instead is hand-matching the surrounding corpus — the wrap,
indentation and key order already in the file being edited. That is weaker than a formatter, not
equivalent to it. It is what there is.

**The real gate is `pnpm planning-gates`, and every task runs it.** Measured at the starting commit:
12/12 PASS (`.planning/todos/todo-frontmatter-gate.py` and
`.planning/planning-envelope-tag-gate.py` among them). Expect exactly `12/12 planning gates
passed.` — the runner's floor is deliberately a floor, so assert the string, not a bare exit code.
</formatter_status>

<tasks>

<task type="auto">
  <name>Task 1: Reconcile partB's findings counts with its own parent's published verdict — a transcription fix, not a revision</name>

  <precondition>`pnpm planning-gates` reports `12/12 planning gates passed.` at the starting commit, so any later red is attributable to this task.</precondition>

  <files>.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-REVIEW-CYCLE2.partB.md</files>

  <read_first>
Read the parent, `.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-REVIEW-CYCLE2.md`, lines 40-75 and 145-155, BEFORE editing partB. You need its exact wording to cite. Established facts (re-confirm cheaply if you wish; do not re-derive):

- Parent frontmatter: `critical: 0`, `warning: 5`, `info: 17`, `total: 22`.
- Parent line 47-48 footnote: Lane B reported B-CR-01 as critical; downgraded to info by orchestrator verification, pointing at **Corrections** below.
- Parent line 50: `## Corrections applied to lane output`. Line 56: `### B-CR-01 downgraded: critical → info`. Its reasoning: Lane B's factual claim is **correct**; its impact analysis is wrong (the baseline array's only consumer is the growth tripwire, and the next test in the same file asserts `measured.size` is 0).
- Parent findings table line 149 lists the item as `B-CR-01→IN`.
- Parent line 221 records B-CR-01 as one of the items orchestrator verification was performed on.

partB's own structure (line numbers reliable, 226 lines total):
`findings:` block at 14-18 · `status: issues_found` at 19 · a Summary sentence ending at line 54 that calls B-CR-01 the lane's one critical finding · `## Critical Issues` at 78 · `### B-CR-01: ...` at 80 with `**File:**`/`**Confidence:**` at 82-84 · `## Info` at 140 with `### B-IN-01` at 142 and `### B-IN-02` at 161 · `## Scope Note` at 186 · the per-file Scope Note entry for `electronReachLedger.test.ts` at 204-206, whose line 205 still counts B-CR-01 as a critical finding.
  </read_first>

  <action>
The defect: partB's counts never matched the published verdict. The adjudication happened BEFORE
the parent was written — the parent has always said `critical: 0` and has always carried the
footnote and the Corrections section explaining why. So this is a transcription error being
corrected, **not** a post-hoc revision of history, and the file must say so in those terms.

Five additive edits. Nothing is deleted.

1. **`findings:` block (lines 15-18).** Set `critical: 0`, `warning: 0`, `info: 3`. Leave
   `total: 3` — the total was always right; only its distribution was wrong.

2. **A new `findings_note:` key** immediately after the `findings:` block, before `status:`. A
   single quoted scalar. It must state: these counts were a transcription error corrected by quick
   task 260929-lrh; B-CR-01 was adjudicated from critical to info by orchestrator verification
   before the parent `34.4.1-REVIEW-CYCLE2.md` was written; the parent's line-47 footnote, its
   `## Corrections applied to lane output` section and its findings-table row `B-CR-01→IN` are the
   record of that adjudication; nothing about the finding's substance changed and no history was
   revised — only this lane file's counts were wrong.

3. **`status:` at line 19 STAYS EXACTLY AS IT IS — `issues_found`.** Do not touch it. Three info
   findings are still findings, and a review's status is a write-time verdict that is never
   rewritten. The verify block proves at byte level that you did not touch it, precisely so a
   reader who knows that doctrine can see this task is a transcription fix.

4. **The `## Critical Issues` heading at line 78.** Re-label it so the section's contents are not
   mis-sold by its own heading, e.g. `## Reported as Critical — adjudicated to Info by the parent
   report`. Directly beneath the new heading, add one short note paragraph: the finding below was
   reported at critical severity by this lane, its factual claim was confirmed by orchestrator
   verification, and its severity was adjudicated down to info — with the parent's path and the
   two section names to read. Explain in that note why the finding still sits in its own section
   rather than being moved under `## Info`: moving it would rewrite where the audit trail
   physically is, and the trail is the point.

5. **Annotate B-CR-01 in place, and reconcile the two prose spots.**
   - Inside the finding: add a single `**Severity (adjudicated):** info — ...` line alongside the
     existing `**File:**`/`**Confidence:**` lines, so an auditor reading only the finding sees the
     adjudication without scrolling. **Do not delete or rewrite one word of the finding body.** The
     finding was real and factually correct; only its severity was adjudicated down.
   - The Summary sentence ending at line 54: append a clause recording that its factual claim was
     confirmed and its severity adjudicated to info by the parent.
   - The Scope Note's per-file entry for `electronReachLedger.test.ts` (line 205): rewrite the
     count so the finding is described as reported critical and adjudicated to info, keeping the
     `(B-CR-01)` identifier and the separate `(B-IN-01)` info finding exactly as they are.

**Do NOT touch line 33.** It sits inside the sentence stating the lane's own severity **rubric** —
the general rule about what rating a gate earns when it cannot see the defect it was built for.
That is the rubric Lane B was handed, not a claim about B-CR-01's final severity. Leaving it is
correct; "fixing" it would erase why the lane rated the finding as it did. The verify block proves
line 33 survives byte-identical by extracting both sides with a tool, so no literal from that
sentence needs to appear anywhere in this plan.
  </action>

  <verify>
  <automated>set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
PB='.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-REVIEW-CYCLE2.partB.md'
PARENT='.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-REVIEW-CYCLE2.md'

# (a) counts agree with the parent, total unchanged, status unchanged, note present
python3 - "$PB" "$PARENT" <<'PY'
import io, re, sys
def fm(p):
    return io.open(p, encoding='utf-8').read().split('---', 2)[1]
def k(block, name):
    m = re.search(r'^\s{2}' + name + r':\s*(\d+)\s*$', block, re.M)
    assert m, name + ' missing'
    return int(m.group(1))
b, par = fm(sys.argv[1]), fm(sys.argv[2])
got = (k(b, 'critical'), k(b, 'warning'), k(b, 'info'), k(b, 'total'))
assert got == (0, 0, 3, 3), 'partB counts wrong: %r' % (got,)
assert k(par, 'critical') == 0, 'parent no longer says critical: 0 -- re-derive before trusting this fix'
assert k(b, 'critical') == k(par, 'critical'), 'partB and parent disagree on critical again'
assert re.search(r'^status: issues_found$', b, re.M), 'status was changed -- it must not be'
assert 'findings_note:' in b, 'no transcription note recorded'
# the finding heading survives EXACTLY once (counted as line matches, not by grep -c)
hits = [n + 1 for n, l in enumerate(io.open(sys.argv[1], encoding='utf-8').read().split('\n'))
        if l.startswith('### B-CR-01')]
assert len(hits) == 1, 'B-CR-01 heading appears %d times at %r -- expected exactly once' % (len(hits), hits)
print('OK  counts=%r  status=issues_found  note present  parent critical=0  B-CR-01 heading x1' % (got,))
PY

# (b) the status line is byte-identical to HEAD. git is captured FIRST -- a fallible git in a
#     non-final pipeline stage is swallowed, so the pipeline would read clean on a broken command.
DIFF_PB="$(git diff -U0 -- "$PB")"
test "$(printf '%s\n' "$DIFF_PB" | grep -c '^[+-]status:')" -eq 0

# (c) every HEAD line of the B-CR-01 body survives, in order (additive annotation only)
python3 - "$PB" <<'PY'
import io, subprocess, sys
p = sys.argv[1]
def region(lines):
    out, on = [], False
    for l in lines:
        if l.startswith('### B-CR-01'):
            on = True
        elif on and (l.startswith('## ') or l.startswith('### B-IN')):
            break
        if on:
            out.append(l)
    return out
head = subprocess.run(['git', 'show', 'HEAD:' + p], capture_output=True, text=True, check=True).stdout
old = region(head.split('\n'))
new = region(io.open(p, encoding='utf-8').read().split('\n'))
assert old, 'HEAD B-CR-01 region empty -- the extractor is wrong, not the file'
assert new, 'B-CR-01 section vanished from the working tree'
it = iter(new)
missing = [l for l in old if not any(l == n for n in it)]
assert not missing, 'DELETED from or REORDERED in B-CR-01 body: %r' % (missing[:3],)
print('OK  B-CR-01 body is an in-order supersequence of HEAD (%d kept, +%d added)' % (len(old), len(new) - len(old)))
PY

# (d) the adjudication is stated in at least three places
test "$(grep -ci 'adjudicat' "$PB")" -ge 3
# the Scope Note entry no longer counts it as a plain critical finding
test "$(grep -c 'One critical finding' "$PB")" -eq 0
# the lane's severity-rubric sentence (line 33) survives byte-identical. BOTH sides are extracted
# by a tool from HEAD and the working tree -- no literal from that sentence is typed into this plan,
# so this check cannot be self-invalidated by the plan's own prose.
python3 - "$PB" <<'PY'
import io, subprocess, sys
p = sys.argv[1]
head = subprocess.run(['git', 'show', 'HEAD:' + p], capture_output=True, text=True, check=True).stdout
target = head.split('\n')[32]   # line 33: the lane's severity rubric
assert target.strip(), 'HEAD line 33 is blank -- the index is wrong, re-derive before trusting this'
assert target in io.open(p, encoding='utf-8').read().split('\n'), \
    'line 33 (the severity rubric) was altered or deleted; it must not be'
print('OK  severity-rubric line survives byte-identical')
PY

# (e) nothing outside .planning/ moved
PORCELAIN="$(git status --porcelain)"   # captured FIRST: a failing git inside a pipeline is
                                        # swallowed, and `test -z` on empty output reads CLEAN
NON_PLANNING="$(printf '%s' "$PORCELAIN" | grep -v '\.planning/' || true)"
test -z "$NON_PLANNING" || { printf 'NON-PLANNING FILES MODIFIED:\n%s\n' "$NON_PLANNING"; exit 1; }

# (f) the real gate
pnpm planning-gates 2>&1 | tail -1 | grep -qx '12/12 planning gates passed.'
echo 'TASK 1 VERIFY PASS'</automated>
  <formatter>**No prettier check — VACUOUS BY DESIGN, declared not run.** `.planning/` is prettier-ignored, so `npx prettier --check` over this path matches zero files and exits 0 with `All matched files use Prettier code style!` whether or not the file is well-formed. See `<formatter_status>` for the `--file-info` probe and the space-tolerant match if you want the evidence re-run. Consistency here comes from hand-matching this file's existing wrap and indentation.</formatter>
  </verify>

  <reversibility rating="reversible">A git-tracked markdown annotation; `git revert` restores the prior record exactly, and the verify block proves the original finding body survived intact.</reversibility>

  <done>
partB's `findings:` reads `critical: 0 / warning: 0 / info: 3 / total: 3`, matching the parent's
`critical: 0`, with a `findings_note:` stating in words that this was a transcription error and not
a revision. `status: issues_found` is byte-identical to HEAD (`^[+-]status:` census = 0). The
B-CR-01 finding body is an in-order supersequence of its HEAD version — annotated, never rewritten.
The former `## Critical Issues` heading, the Summary sentence, and the Scope Note entry all
describe the finding as reported critical and adjudicated to info. Line 33's severity rubric is
untouched. `pnpm planning-gates` 12/12, no non-`.planning/` file modified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Annotate 29-REVIEW's CR-06 with its mechanism supersession, so grepping the cited symbol no longer reads as a reverted fix</name>

  <files>.planning/phases/29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw/29-REVIEW.md</files>

  <read_first>
The graphify hook is MANDATORY before touching source. Run one orienting query first, e.g.
`graphify query "how does the preload store read path enforce the secret field policy"`, then the
path-scoped greps below (the hook permits grep once graphify has oriented you, and for specific
lines).

Established facts, measured at HEAD 2026-09-29 (re-confirm cheaply; do not re-derive):

- `29-REVIEW.md` frontmatter line 38 opens `resolution:`; line 44 is `  CR-06: fixed (40823a5b)`.
  Line 35 is `status: fixed`; line 37 is `fix_scope:`.
- The resolution table row is line 85: `| CR-06 | FIXED | \`40823a5b\` | additive deny-list
  extension; ... |`.
- The finding is `### CR-06: ...` at line 366. It cites `src/preload/api/misc.ts:144-147`, names a
  `SECRET_STORE_KEYS` deny-list, shows the three unprotected reads at 375-379, and proposes the
  additive deny-list extension at 391-398. Line 400-401 argue it is strictly additive with no
  Phase 35 coupling. The section closes with `---` at line 403.
- Commit `40823a5b9` exists and did land that fix as written.
- Phase 35 plan 16's D-08 convergence LATER DELETED the deny-list deliberately, replacing it with
  the fail-closed `isAllowedStoreField` allow-list.
- At HEAD: `grep -c SECRET_STORE_KEYS src/preload/api/misc.ts` → `0`. `misc.ts:115` imports
  `isAllowedStoreField` from `common/types/storePolicy`; `misc.ts:186` gates every `storeGet` on
  it; `misc.ts:173-184` carry the in-situ rationale, including that a deny-list is fail-open by
  shape. `src/common/types/storePolicy.ts:114-135` record each secret field as deliberately
  OMITTED from the allow-list.
- The pin: `src/common/types/__tests__/storePolicy.test.ts:96` —
  `describe('D-08 convergence: every SECRET_STORE_KEYS field, blocked by name AND by nested path')`
  — covers all five secret field paths both by name and by nested path (`credentials.accessToken`,
  `csrfToken.value`). The suite runs green in ~0.2s: 52/52.
- **The grep trap, measured:** a repo-wide `grep -rn SECRET_STORE_KEYS src/` still returns hits —
  in `storePolicy.ts`'s header comment (lines 7, 17, 24), `storeApi.test.ts`'s docstring, and the
  test's own `describe` name. Those are historical references to a deleted mechanism, not the live
  mechanism. The file CR-06 actually cites, `misc.ts`, has zero.
  </read_first>

  <action>
The defect: CR-06's protection is INTACT and strictly STRONGER than what CR-06 asked for — an
allow-list denies the next secret by default, a deny-list does not — but an auditor grepping the
cited symbol today concludes the fix was reverted. The audit orchestrator nearly did. Fix the
record, not the code.

Three additive edits. CR-06's verdict does not change.

1. **A new top-level frontmatter key `resolution_supersessions:`**, placed after the `resolution:`
   block ends (i.e. after the last `  IN-01..IN-05` / `  WR-*` entry, before the closing `---`), as
   a nested `CR-06:` with a single **quoted** scalar value. Quote it: an unquoted plain scalar
   containing `: ` is illegal YAML, and this repo has two frontmatter parsers that disagree, one of
   which invents keys from prose. The value states: the deny-list mechanism was deleted by Phase 35
   plan 16 (D-08 convergence) and replaced with the fail-closed `isAllowedStoreField` allow-list;
   the protection is intact and strictly stronger at HEAD; the cited symbol no longer exists in
   `src/preload/api/misc.ts`; see the supersession note on CR-06; **status stays FIXED — this
   records a mechanism change, not a re-adjudication.**
   **Leave line 44 (`  CR-06: fixed (40823a5b)`) exactly as it is.** It records the write-time
   truth, which is still true: it WAS fixed by that commit. The verify block proves at byte level
   that you did not touch it.

2. **The resolution table row at line 85.** Append to the Note cell only, e.g.
   ` — **mechanism superseded, protection intact:** see the supersession note on CR-06 below`.
   `FIXED` and the `40823a5b` hash stay untouched.

3. **A `**Supersession (verified at HEAD 2026-09-29):**` block** inserted at the END of the CR-06
   section — after line 401's closing argument, before the section's `---` at line 403. It must
   carry all seven points, because each one is load-bearing for the wrong conclusion it prevents:

   a. `40823a5b9` did land this fix exactly as written above.
   b. Phase 35 plan 16's D-08 convergence then DELETED the deny-list **deliberately**, replacing it
      with the fail-closed `isAllowedStoreField` allow-list in `src/common/types/storePolicy.ts`.
   c. The state at HEAD, with the commands, so the claim is re-provable: the cited symbol is absent
      from `src/preload/api/misc.ts` (count 0); `misc.ts:115` imports `isAllowedStoreField`;
      `misc.ts:186` gates every `storeGet` on it; `storePolicy.ts:114-135` record each secret field
      as deliberately OMITTED from the allow-list.
   d. The regression pin, cited by file, line and describe-block name:
      `src/common/types/__tests__/storePolicy.test.ts:96`, covering all five secret field paths
      both by name and by nested path (`credentials.accessToken`, `csrfToken.value`).
   e. **Net: strictly STRONGER than CR-06 asked for.** An allow-list denies the next secret by
      default; a deny-list does not. Say why, not just that.
   f. **The grep trap, stated explicitly.** A repo-wide grep for the symbol still returns hits, in
      `storePolicy.ts`'s header comment, `storeApi.test.ts`'s docstring, and the test's describe
      name — historical references to a deleted mechanism. The file CR-06 cites has zero. Grepping
      the cited symbol and concluding the fix was reverted is the wrong inference, and this note
      exists to stop it. Name the audit that nearly drew it.
   g. **Do not "restore" the deny-list.** Re-adding it would re-introduce the fail-open shape D-08
      deleted, weakening the protection in the name of honouring CR-06. This is the one way a
      documentation edit here could become a real security regression, so write it down.

<!-- planner-discipline-allow: SECRET_STORE_KEYS -->
The deny-list symbol name necessarily appears in this action and in the note being written. The
verify block's negative grep for it is **path-scoped to `src/preload/api/misc.ts`**, a file this
plan never writes, so the literal in this plan and in the review cannot invalidate the gate.
**That scoping is mandatory, not stylistic:** an unscoped `grep -rn` — or any grep whose path set
includes `.planning/` — hits this very note and inverts the result from 0 to non-zero. Scope every
grep of that symbol to the named source path.
  </action>

  <verify>
  <automated>set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
R='.planning/phases/29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw/29-REVIEW.md'
M='src/preload/api/misc.ts'
P='src/common/types/storePolicy.ts'
T='src/common/types/__tests__/storePolicy.test.ts'

# (a) CR-06's write-time verdict and attribution are intact. git is captured FIRST -- a fallible
#     git in a non-final pipeline stage is swallowed, so the pipeline would read clean on a break.
grep -Fq '| CR-06 | FIXED |' "$R"
grep -Fq '40823a5b' "$R"
DIFF_R="$(git diff -U0 -- "$R")"
test "$(printf '%s\n' "$DIFF_R" | grep -c '^-  CR-06: fixed')" -eq 0
test "$(printf '%s\n' "$DIFF_R" | grep -c '^[+-]status: fixed')" -eq 0

# (b) the supersession is recorded in frontmatter AND in the finding, and parses
grep -q '^resolution_supersessions:' "$R"
python3 - "$R" <<'PY'
import io, re, sys
t = io.open(sys.argv[1], encoding='utf-8').read()
fm = t.split('---', 2)[1]
assert re.search(r'^resolution_supersessions:\s*$', fm, re.M), 'key missing or has an inline value'
m = re.search(r'^resolution_supersessions:\s*\n\s{2}CR-06:\s*(.+)$', fm, re.M)
assert m, 'no nested CR-06 entry'
v = m.group(1).strip()
assert v[0] in '"\'', 'value must be QUOTED -- an unquoted scalar containing ": " is illegal YAML'
assert re.search(r'^  CR-06: fixed \(40823a5b\)$', fm, re.M), 'the original resolution line was altered'
body = t.split('---', 2)[2]
i = body.find('### CR-06')
assert i != -1, 'CR-06 heading gone'
j = body.find('\n### ', i + 1)
sec = body[i:] if j == -1 else body[i:j]
assert 'Supersession' in sec, 'no supersession block inside the CR-06 section'
for needle in ('isAllowedStoreField', 'storePolicy.test.ts', 'D-08'):
    assert needle in sec, 'supersession block omits %s' % needle
print('OK  frontmatter parses, CR-06 line intact, supersession block present in-section')
PY

# (c) every claim the note makes, re-proven with the commands the note cites.
#     PATH-SCOPED ON PURPOSE: an unscoped grep hits the note itself and inverts the result.
test "$(grep -c 'SECRET_STORE_KEYS' "$M")" -eq 0
test "$(grep -c 'isAllowedStoreField' "$M")" -ge 2
test "$(grep -cF "describe('D-08 convergence: every SECRET_STORE_KEYS field" "$T")" -ge 1
grep -q 'isAllowedStoreField' "$P"

# (d) the pin is RUN, not merely cited, so the note cannot ship already stale.
#     `mktemp`, never a hardcoded temp path -- the session dir differs per executor.
#     NOTE the negation form: `grep -qv failed` would be a green proving nothing, because -v
#     inverts per LINE and succeeds as soon as ANY line lacks the word. `! grep -q` is the check.
JOUT="$(mktemp)"
npx jest "$T" 2>&1 | tee "$JOUT" | tail -6
grep -Eq 'Tests:[[:space:]]+[0-9]+ passed, [0-9]+ total' "$JOUT"
! grep -q 'failed' "$JOUT"
rm -f "$JOUT"

# (e) NO source file was modified -- this task annotates a record, nothing else
PORCELAIN="$(git status --porcelain)"   # captured FIRST: a failing git inside a pipeline is
                                        # swallowed, and `test -z` on empty output reads CLEAN
NON_PLANNING="$(printf '%s' "$PORCELAIN" | grep -v '\.planning/' || true)"
test -z "$NON_PLANNING" || { printf 'NON-PLANNING FILES MODIFIED:\n%s\n' "$NON_PLANNING"; exit 1; }

# (f) the real gate
pnpm planning-gates 2>&1 | tail -1 | grep -qx '12/12 planning gates passed.'
echo 'TASK 2 VERIFY PASS'</automated>
  <formatter>**No prettier check — VACUOUS BY DESIGN, declared not run.** `.planning/` is prettier-ignored; `--check` here matches zero files and exits 0 regardless of the file's state. See `<formatter_status>`. Note the asymmetry deliberately: `src/preload/api/misc.ts` and `src/common/types/storePolicy.ts` are NOT ignored (`{ "ignored": false, "inferredParser": "typescript" }`) — but this task does not write them, and the verify block proves it (`git status --porcelain` carries only `.planning/` paths), so no formatter check is owed on them either.</formatter>
  </verify>

  <reversibility rating="reversible">Additive markdown and one new frontmatter key on a git-tracked record; no code path changes. `git revert` restores the prior record.</reversibility>

  <done>
`29-REVIEW.md` carries a quoted `resolution_supersessions: CR-06:` frontmatter entry and a
`Supersession (verified at HEAD 2026-09-29)` block inside the CR-06 section covering all seven
points — including the grep trap and the explicit instruction not to restore the deny-list.
CR-06's `FIXED`, its `40823a5b` attribution, the file's `status: fixed`, and the
`  CR-06: fixed (40823a5b)` resolution line are all byte-unchanged. Every claim the note makes is
re-proven by the path-scoped commands the note cites, and `storePolicy.test.ts` runs green. No
source file modified. `pnpm planning-gates` 12/12.
  </done>
</task>

<task type="auto">
  <name>Task 3: File a todo recording that Phase 24's two criticals are correct at HEAD but pinned by no test</name>

  <files>.planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md</files>

  <read_first>
**Read CLAUDE.md's "Todo triage frontmatter (enforced by CI)" section before writing a byte.** The
`/gsd-add-todo` frontmatter template does NOT emit `severity`/`platform`/`ready` — it stops at
`created`/`title`/`area`/`files` — so you add all three by hand. Omitting any one turns CI red.

Match the shape of an existing conforming file, e.g.
`.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md`: `created`,
`title` (quoted), `area`, `severity`, `platform`, `ready`, `source` (quoted), `files` (a list).
`area:` values already in this corpus include `steam` (15 uses), `tooling`, `build`, `test` — use
`steam`; do not coin a new one for a single file.

Established facts, measured 2026-09-29 (re-confirm the line numbers at write time; do not
re-derive the mutation experiment):

- **24-CR-01** — string-return marshaling. `isStringReturn()` at `meta/gen_vtables.ts:117`,
  `STRING_RETURN_BUF_BYTES = 256` at `:129`, consumed at `:257`/`:293`/`:297` and emitted into
  `native/steam-bridge/generated/steam_api_shim.c:37`, used at `:199-210`
  (`vt_SteamFriends018_GetPersonaName_buf`). Fixed in `1e744d204`. **Correct at HEAD.**
- **24-CR-02** — `SHIM_EXPORTED_SYMBOLS` at
  `src/backend/storeManagers/steam/bridge/shimGenerate.ts:63` must cover every symbol in
  `native/steam-bridge/generated/steam_api.def` (12 symbols). Consumed at `shimGenerate.ts:231`.
  Verified identical. Fixed in `934e51a0f`. **Correct at HEAD.**
- **The mutation proof.** Deleting `'SteamAPI_SteamUser_v023'` and `'SteamAPI_SteamFriends_v018'`
  from `SHIM_EXPORTED_SYMBOLS` — re-creating CR-02 exactly, a defect that wrongly rejects shim
  placement for any interface-using game — left **124/124 jest tests green across 8 suites** and
  `tsc --noEmit` **exit 0**.
- Repo-wide, the only test reference to either symbol is
  `expect(def).toContain('SteamAPI_SteamUser_v023')` at `meta/__tests__/gen_vtables.test.ts:190`,
  which asserts the GENERATED `.def` contains it — the opposite side of the parity CR-02 was about.
  `isStringReturn` / `STRING_RETURN_BUF_BYTES` have **zero** test references anywhere.
- Why the lists are hand-synced rather than imported: `tsconfig.json`'s `include` is `["src"]` only,
  so `src/` cannot statically import `meta/`. Recorded in situ at `shimGenerate.ts:54-55` and in the
  comment above the symbol set.

The graphify hook applies if you re-confirm the source line numbers: run one
`graphify query "how are the steam bridge shim exported symbols kept in sync with the generated
def file"` first, then grep the specific files.
  </read_first>

  <action>
**This task FILES A TODO. It does NOT write the test.** Nothing under `src/`, `meta/`, `native/`,
`src-tauri/`, or `public/` is created or modified. The verify block proves it.

Create the todo with frontmatter in exactly this key order — `platform:` immediately after
`severity:`, `ready:` immediately after `platform:`, all three values **bare, lowercase, exact,
never quoted, never capitalised**:

```yaml
created: 2026-09-29
title: "<one line naming both criticals, that both are correct at HEAD, and that a mutation re-creating 24-CR-02 exactly left 124/124 jest green and tsc exit 0>"
area: steam
severity: medium
platform: any
ready: code
source: "quick task 260929-lrh (the phase 29/41/24 critical-disposition audit) — the audit confirmed both fixes intact and deliberately scoped the missing pin OUT, filing it here"
files:
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - native/steam-bridge/generated/steam_api.def
  - meta/gen_vtables.ts
  - meta/__tests__/gen_vtables.test.ts
```

The vocabulary values are fixed by CLAUDE.md and the gate. `severity: medium` is the assigned
value: a real defect with a bounded blast radius. Do not write `low` (not in the vocabulary), do
not quote, do not capitalise, and **never widen the gate's vocabulary to admit a value** — pick the
value that fits.

Body sections:

1. **What is correct at HEAD, and where.** Both criticals, with the symbols, files, line numbers
   and fixing commits from `<read_first>`. Lead with this: the code is right. The gap is the pin.
2. **What the gap is.** Neither fix is pinned by any test. Give the mutation result as the evidence
   — 124/124 jest green across 8 suites and `tsc --noEmit` exit 0 while CR-02's exact defect was
   live in the tree. State what that defect does in production: wrongly rejects shim placement for
   any interface-using game.
3. **Why nothing caught it.** The single existing reference,
   `meta/__tests__/gen_vtables.test.ts:190`, asserts the generated `.def` contains the symbol — the
   opposite side of the parity CR-02 was about, so it is green under the mutation by construction.
   `isStringReturn` / `STRING_RETURN_BUF_BYTES` have zero test references at all.
4. **Proposed fix.** A parity test asserting `SHIM_EXPORTED_SYMBOLS` equals the `.def` export list
   exactly. Note honestly that it is ~10 lines and would have caught CR-02 originally. Describe it;
   do not write it. Record the constraint the implementer will hit first: `tsconfig.json`'s
   `src`-only `include` is why the two lists are hand-synced rather than imported
   (`shimGenerate.ts:54-55`), so the test must read the `.def` from disk rather than import from
   `meta/` — and that is the reason the parity can drift silently at all.
5. **Scope note.** State explicitly that this todo describes a test and does not contain one, and
   that `ready: code` means desk-ready: editable and typecheckable with no live gate and no second
   operating system.
  </action>

  <verify>
  <automated>set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
TD='.planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md'
test -f "$TD"

# (a) the three triage keys: present, ADJACENT in the mandated order, bare/lowercase/exact
python3 - "$TD" <<'PY'
import io, re, sys
lines = io.open(sys.argv[1], encoding='utf-8').read().split('\n')
assert lines[0] == '---', 'no frontmatter'
end = lines.index('---', 1)
fm = lines[1:end]
idx = {}
for n, l in enumerate(fm):
    m = re.match(r'^(severity|platform|ready):(.*)$', l)
    if m:
        assert m.group(1) not in idx, 'duplicate key ' + m.group(1)
        idx[m.group(1)] = (n, m.group(2))
for k in ('severity', 'platform', 'ready'):
    assert k in idx, 'MISSING KEY: ' + k + ' -- the add-todo template does not emit it'
want = {'severity': 'medium', 'platform': 'any', 'ready': 'code'}
for k, v in want.items():
    raw = idx[k][1]
    assert raw == ' ' + v, '%s must be bare lowercase exact %r, got %r' % (k, ' ' + v, raw)
assert idx['platform'][0] == idx['severity'][0] + 1, 'platform: must sit immediately after severity:'
assert idx['ready'][0] == idx['platform'][0] + 1, 'ready: must sit immediately after platform:'
print('OK  severity: medium / platform: any / ready: code -- adjacent, bare, exact')
PY

# (b) the todo is grounded: it names both criticals and the mutation evidence
for n in 24-CR-01 24-CR-02 SHIM_EXPORTED_SYMBOLS isStringReturn STRING_RETURN_BUF_BYTES 124/124; do
  grep -Fq "$n" "$TD" || { echo "todo omits: $n"; exit 1; }
done

# (c) the cited source facts still hold, so the todo does not arrive stale
test "$(grep -c '^const SHIM_EXPORTED_SYMBOLS' src/backend/storeManagers/steam/bridge/shimGenerate.ts)" -ge 1
# 12 symbols -- counted as MATCHES via grep -o, not as lines via grep -c, so a two-symbol line
# cannot silently under-count. This exact number is the whole subject of 24-CR-02's parity.
test "$(grep -o 'SteamAPI[A-Za-z0-9_]*' native/steam-bridge/generated/steam_api.def | wc -l | tr -d ' ')" -eq 12
grep -q 'export function isStringReturn' meta/gen_vtables.ts
grep -q 'export const STRING_RETURN_BUF_BYTES' meta/gen_vtables.ts
# the gap itself is still real: the only reference is the opposite side of the parity
test "$(grep -c "toContain('SteamAPI_SteamUser_v023')" meta/__tests__/gen_vtables.test.ts)" -ge 1

# (d) NO test was written and NO source file touched -- this task files a description
PORCELAIN="$(git status --porcelain)"   # captured FIRST: a failing git inside a pipeline is
                                        # swallowed, and `test -z` on empty output reads CLEAN
NON_PLANNING="$(printf '%s' "$PORCELAIN" | grep -v '\.planning/' || true)"
test -z "$NON_PLANNING" || { printf 'NON-PLANNING FILES MODIFIED:\n%s\n' "$NON_PLANNING"; exit 1; }

# (e) the real gate -- this is what enforces (a) in CI
pnpm planning-gates 2>&1 | tail -1 | grep -qx '12/12 planning gates passed.'
echo 'TASK 3 VERIFY PASS'</automated>
  <formatter>**No prettier check — VACUOUS BY DESIGN, declared not run.** `.planning/todos/pending/*.md` is prettier-ignored; probed 2026-09-29, a sibling pending todo reports `{ "ignored": true, "inferredParser": null }`. `--check` here matches zero files and exits 0 regardless. See `<formatter_status>`. Consistency comes from hand-matching an existing pending todo's key order and wrap — weaker than a formatter, not equivalent.</formatter>
  </verify>

  <reversibility rating="reversible">A new untracked-then-committed markdown file; deleting it restores the prior state exactly.</reversibility>

  <done>
`.planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md`
exists, carrying bare `severity: medium` / `platform: any` / `ready: code` adjacent in that order,
and a body covering what is correct at HEAD, the mutation evidence (124/124 green, `tsc` exit 0),
why the one existing reference is green by construction, the proposed ~10-line parity test with the
`tsconfig` `src`-only constraint, and an explicit note that it describes a test rather than
containing one. The cited source facts re-confirm at HEAD (12 `.def` symbols, both generator symbols
present, the single opposite-side reference). No source file created or modified.
`pnpm planning-gates` 12/12.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| *(none crossed)* | This plan writes three markdown files under `.planning/`. No process boundary, no IPC channel, no network input, no renderer→sidecar surface, and no parser of untrusted data is added or changed. The only "input" is the executor's own edits, and the verify blocks are the control on those. |

**What is and is not affected — stated plainly, because Task 2 reads like security work and is
not.** Task 2 DESCRIBES the disposition of a credential-exposure finding (CR-06: `csrfToken` and
two `credentials` blobs readable from a renderer). It changes **no security-relevant code**. The
protection it describes — the fail-closed `isAllowedStoreField` allow-list in
`src/common/types/storePolicy.ts`, gated at `src/preload/api/misc.ts:186` — is untouched by this
plan and is **re-verified rather than modified**: Task 2's verify block runs the pinning suite
(`src/common/types/__tests__/storePolicy.test.ts`, 52/52) and re-proves each claim the note makes
with the exact path-scoped commands the note cites. No threat is invented here to fill the section.

## STRIDE Threat Register (ASVS L1, block_on: high)

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260929-lrh-01 | Repudiation | `.planning/` review records (partB, `29-REVIEW.md`) | medium | mitigate | Annotating a shipped review can erase its write-time verdict, destroying the audit trail these very corrections depend on. Mitigated mechanically, not by intent: Task 1 asserts an empty `^[+-]status:` diff census and proves the B-CR-01 body is an in-order **supersequence** of its HEAD version; Task 2 asserts `CR-06 | FIXED |`, the `40823a5b` hash, `status: fixed`, and the `  CR-06: fixed (40823a5b)` line are all byte-unchanged. Every edit is additive. |
| T-260929-lrh-02 | Information disclosure *(documentation-mediated)* | the CR-06 supersession note in `29-REVIEW.md` | high | mitigate | The one way this docs-only plan could cause a real credential-exposure regression: a future engineer reads the note, believes CR-06's deny-list must be "restored", and re-adds `SECRET_STORE_KEYS` — re-introducing the fail-open shape D-08 deliberately deleted. Mitigated by making the note say so explicitly (action point 2g: **do not restore the deny-list**, with the reason — an allow-list denies the next secret by default, a deny-list does not) and by Task 2's verify re-proving the allow-list is live and running its pin, so the note cannot ship already stale. |
| T-260929-lrh-03 | Tampering | the verify gates themselves | medium | mitigate | A gate that greps the deny-list symbol without a path scope hits the note this plan writes and inverts its own result from 0 to non-zero — self-invalidation, the green-check-proving-nothing shape. Mitigated by scoping every such grep to `src/preload/api/misc.ts` (a file this plan never writes), by the `planner-discipline-allow` annotation recording why the literal in the action is safe, and by the `test -z "$(git status --porcelain \| grep -v '\.planning/')"` assertion in all three tasks. |
| T-260929-lrh-04 | Tampering | supply chain — npm/pip/cargo installs | n/a | **does not fire** | **No package-manager install task exists in this plan.** The Package Legitimacy Gate is not engaged and no `[ASSUMED]`/`[SUS]` checkpoint is owed. The only third-party invocations are `npx jest` and `npx prettier --file-info`, both already-installed project devDependencies at pinned versions, resolved from the local `node_modules` — no new package enters the tree. Recorded as not-firing rather than omitted, so a reader can see it was checked. |

No `critical` or `high` threat is left undispositioned, so `security_block_on: high` is satisfied.
</threat_model>

<verification>
Run after all three tasks, from the repo root:

```bash
# 1. exactly three files changed, all under .planning/
git status --porcelain
PORCELAIN="$(git status --porcelain)"   # captured FIRST: a failing git inside a pipeline is
                                        # swallowed, and `test -z` on empty output reads CLEAN
NON_PLANNING="$(printf '%s' "$PORCELAIN" | grep -v '\.planning/' || true)"
test -z "$NON_PLANNING" || { printf 'NON-PLANNING FILES MODIFIED:\n%s\n' "$NON_PLANNING"; exit 1; }

# 2. the real gate
pnpm planning-gates 2>&1 | tail -1 | grep -qx '12/12 planning gates passed.'

# 3. the cross-file invariant this whole task exists to restore:
#    partB and its parent agree on the critical count
python3 - <<'PY'
import io, re
d = '.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/'
def crit(p):
    fm = io.open(d + p, encoding='utf-8').read().split('---', 2)[1]
    return int(re.search(r'^\s{2}critical:\s*(\d+)\s*$', fm, re.M).group(1))
a, b = crit('34.4.1-REVIEW-CYCLE2.partB.md'), crit('34.4.1-REVIEW-CYCLE2.md')
assert a == b == 0, 'partB=%d parent=%d -- the defect is back' % (a, b)
print('OK  partB and parent agree: critical=0')
PY

# 4. the CR-06 note's subject is live and pinned
test "$(grep -c 'SECRET_STORE_KEYS' src/preload/api/misc.ts)" -eq 0
npx jest src/common/types/__tests__/storePolicy.test.ts

# 5. the todo is gate-legal (redundant with planning-gates; run it to see the message)
python3 .planning/todos/todo-frontmatter-gate.py
```

**No prettier check anywhere in this block — vacuous over `.planning/`, see `<formatter_status>`.**
</verification>

<success_criteria>
- [ ] partB `findings:` = `critical: 0 / warning: 0 / info: 3 / total: 3`, equal to the parent's `critical: 0`, with a `findings_note:` naming this a transcription fix rather than a revision
- [ ] partB `status: issues_found` byte-unchanged (`^[+-]status:` census = 0); B-CR-01 body an in-order supersequence of HEAD; the adjudication stated in the section heading, inside the finding, and in the Scope Note; line 33's severity rubric untouched
- [ ] `29-REVIEW.md` carries a quoted `resolution_supersessions: CR-06:` key and a `Supersession (verified at HEAD 2026-09-29)` block with all seven points, including the grep trap and the do-not-restore instruction
- [ ] CR-06's `FIXED`, its `40823a5b` hash, `status: fixed`, and the `  CR-06: fixed (40823a5b)` line all byte-unchanged
- [ ] The CR-06 note's claims re-proven by path-scoped commands, and `storePolicy.test.ts` run green
- [ ] Todo filed in `.planning/todos/pending/` with bare adjacent `severity: medium` / `platform: any` / `ready: code`, and a body carrying the mutation evidence and the proposed parity test
- [ ] The todo describes a test and does not contain one
- [ ] `git status --porcelain` carries only `.planning/` paths — no `src/`, `meta/`, `native/`, `src-tauri/`, or `public/` file touched
- [ ] `pnpm planning-gates` 12/12 PASS
- [ ] No prettier `--check` written into any verify block; its vacuity declared in words in all three
</success_criteria>

<output>
Create `.planning/quick/260929-lrh-correct-three-review-bookkeeping-defects/260929-lrh-SUMMARY.md` when done.
</output>
