---
phase: quick-260923-ihw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
autonomous: true
requirements: [QUICK-260923-ihw]
must_haves:
  truths:
    - "Step 4 of `### The only real verification` counts FILES (not grep lines) and restricts to Mach-O by `file -b`, so its stated `must be 0` pass condition is reachable"
    - "Step 4 prints each survivor's path, so a non-zero result is actionable rather than a bare number"
    - "Step 5 carries BOTH a positive control (253 on the all-ad-hoc local helper tree) and a negative control (0 on an Apple-signed dir containing a plain text file)"
    - "A new dated `### STATUS 2026-09-23 (quick-260923-ihw)` sub-section records the 530 measurement, its 506+24 breakdown, both defects, and why step 5's old single-file control could not have caught either"
    - "The same sub-section records the HEAD re-measurement: 277 regular files / 253 Mach-O, and `sign:macos-resources --dry-run` still selects the IDENTICAL 253-path SET"
    - "The todo still says, in words, that the tag push has NOT happened and the live gate is entirely unrun"
    - "Frontmatter is byte-identical: severity critical, platform macos, ready live-gate, needs retag-and-confirm-notarization-accepted, status OPEN"
    - "The file is still in `.planning/todos/pending/`; no source file, script or test was created or touched"
    - "`pnpm planning-gates` still reports 12/12"
  artifacts:
    - path: ".planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md"
      provides: "corrected step 4/5 plus the dated 2026-09-23 measurement sub-section"
      contains: "### STATUS 2026-09-23 (quick-260923-ihw)"
  key_links:
    - from: "the corrected step 4 fenced block"
      to: "### STATUS 2026-09-23 (quick-260923-ihw)"
      via: "an in-block comment naming the prohibited old form and pointing at the dated section"
      pattern: "2026-09-23"
---

<objective>
The macOS notarization todo prescribes a live-gate verification recipe whose **step 4 cannot ever
pass**. Its survivor count is inflated roughly 2x (grep counts LINES, not FILES) and it does not
restrict to Mach-O, so every non-Mach-O resource reports "code object is not signed at all"
forever — including after a perfect signing run, because the signer deliberately never touches
them. Its stated pass condition, "this must be ZERO", is unreachable **by construction**. Step 5's
positive control as written would not have caught either defect.

Replace step 4 with a form that was positive- AND negative-controlled today, replace step 5 with
both controls, and add a dated sub-section recording the measurement.

Purpose: the live gate this todo gates on has never been run. When it IS run, its most mechanical
check would have reported a large positive number on a correct, fully-notarized app and been read
as a FAILURE.

Output: one edited todo file.

**This ships no code.** One planning document is touched. The signer is correct and is not edited.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
</context>

<measured_evidence>

**Everything below was MEASURED on the operator's Mac on 2026-09-23, before this plan was
written. Do NOT re-derive it, do NOT soften it into "may be" language, and do NOT ask the
operator to re-run it.** The measurement tree is the real local helper tree
`build/bin/arm64/darwin` — the same tree the CI step signs — which is 100% ad-hoc-signed and is
therefore a perfect positive control.

**1. The todo's step-4 command, run VERBATIM, returns 530.** Not 253.

**2. The 530 breaks down exactly:**

| component       | count   | what it is                                                                            |
| --------------- | ------- | ------------------------------------------------------------------------------------- |
| adhoc lines     | 506     | 253 Mach-O files x TWO matching lines each: a `flags=0x2(adhoc)` AND a `Signature=adhoc` |
| unsigned lines  | 24      | the 24 NON-Mach-O regular files, each emitting "code object is not signed at all"     |
| **total**       | **530** |                                                                                       |

Regular files in the tree: 277. Mach-O: 253. Non-Mach-O: 24.

**3. TWO independent defects follow. BOTH must be written into the todo.**

- **(a) `grep -c` counts LINES, not FILES.** The count is inflated ~2x for the population it is
  supposed to measure.
- **(b) The command does not restrict to Mach-O.** Every non-Mach-O resource reports "code object
  is not signed at all" FOREVER — after a perfect signing run just as much as before it, because
  the signer deliberately and correctly never touches them. So the stated pass condition is
  **unreachable by construction**. It is WORSE in the real app than in this subtree: the recipe
  runs over the whole `GameLib.app/Contents/Resources`, which holds the entire non-Mach-O frontend
  bundle, so a correct, fully-notarized app would report a large positive number and read as a
  FAILURE.
- **(c) Step 5's positive control would NOT have caught either defect.** A single ad-hoc file
  returns **2** under that pipeline, not 1, and a single-file control can never expose the
  non-Mach-O contamination at all. This is the SAME SHAPE the todo already documents once — the
  BSD `head -n -1` control that passed for the wrong reason. Write this into the todo's own
  honesty section; it is the point, not a footnote.

**4. CONTROL RESULTS for the corrected form, both run today, both exact:**

- **POSITIVE** — the corrected loop pointed at the untouched, all-ad-hoc `build/bin/arm64/darwin`
  returns **253**. Exactly the population Apple rejected. (The todo's own version returns **530**
  on this same tree.)
- **NEGATIVE** — the corrected loop pointed at a directory holding Apple-signed `/bin/ls` and
  `/bin/cat` plus **one plain text file** returns **0**. This is the control the todo currently
  lacks entirely: it proves the loop CAN report zero, so a zero from the real run is not just a
  broken pipeline. **The text file is the part that matters** — it proves the Mach-O restriction
  actually suppresses the non-Mach-O noise.

**5. Independently re-measured at HEAD today, also to be recorded in the todo:**

- `build/bin/arm64/darwin` still holds **277** regular files, **253** Mach-O. Unchanged from the
  2026-09-17 measurement.
- `pnpm sign:macos-resources -- --dir build/bin/arm64/darwin --keychain ... --identity FAKE
  --dry-run` still reports **"would sign 253 file(s)"**, and its selection is the **IDENTICAL SET**
  to a `file -b`-derived ground truth — compared as a SET with `diff` over two sorted path lists,
  which produced EMPTY output, **not merely by count**. The todo's existing 2026-09-17 claim about
  the detector still holds at HEAD.

</measured_evidence>

<locked_decisions>

Decided. Do not revisit, do not plan alternatives, do not ask.

- The todo stays **OPEN** and stays in `.planning/todos/pending/`.
- Frontmatter `severity: critical`, `platform: macos`, `ready: live-gate`,
  `needs: retag-and-confirm-notarization-accepted`, `status: OPEN` all stay **EXACTLY** as they
  are. **Nothing about the live gate has been verified.**
- **The tag push has NOT happened.** No throwaway tag exists locally or on origin. The live gate
  is still entirely unrun. Nothing written in this change may imply otherwise — not in the todo,
  not in the commit message, not in the SUMMARY.
- Do **NOT** create any new script under `meta/`, `src/`, or anywhere else. Do **NOT** add tests.
  The corrected recipe lives in the todo body as a fenced block, exactly like the recipe it
  replaces.
- Do **NOT** touch `meta/signMachOResources.ts`, `.github/workflows/release-tauri.yml`, or any
  source file. The signer is CORRECT — evidence item 5 re-confirms it at HEAD. **The defect is in
  the todo's VERIFICATION PROSE only.**
- Do **NOT** delete or rewrite the todo's existing history. `## STATUS 2026-09-17
  (quick-260917-uik)` and the `## Verification` section at line ~122 are the record of what was
  believed then. Correct step 4/5 **in place** and **ADD** a dated sub-section; do not silently
  revise the earlier narrative.
- Today's date is **2026-09-23**. Use it for every new date stamp.

</locked_decisions>

<hazards>

**H1 — `npx prettier --check` over this path is a GREEN CHECK PROVING NOTHING, and the plan says
so rather than pretending otherwise.** `.prettierignore` carries a bare `.planning` entry (under
the comment "Tooling/agent state and planning artifacts, not shipped source"), so prettier ignores
this whole tree. **Measured at plan time:** a deliberately mis-formatted markdown file written to
`.planning/tmp-prettier-probe/probe.md` returned **exit 0** with "All matched files use Prettier
code style!". CLAUDE.md's "a formatter check belongs in every task's `<verify>`" convention is
still honoured — the command IS in both verify blocks, scoped to the explicit path and never a
bare `.` — but it is paired with an assertion that `.prettierignore` still lists `.planning`, so
the green is **explained** rather than trusted. If someone ever removes that ignore entry, that
assertion goes red and this note self-invalidates instead of rotting. Do not read the prettier
line as coverage.

**H2 — `pnpm planning-gates` must stay 12/12, and a red gate means fix the DOCUMENT.** Measured at
plan time on this Mac: `pnpm planning-gates` → `12/12 planning gates passed` (it works here; it
does NOT need the `python` fallback that a Windows host needed). Two of those twelve watch this
file: `.planning/todos/todo-frontmatter-gate.py` (scope is `pending/` only — which is exactly where
this file lives) and `.planning/planning-envelope-tag-gate.py` (fires on ANY planning file).
**Never widen or edit a gate to admit what failed.**

**H3 — do not introduce anything that looks like a stray closing tag.** The envelope-tag gate
fires on orphan `</...>` tool-call tags in any planning file. The corrected recipe contains none
and must keep containing none. Note that the recipe legitimately contains `< <(` — that is process
substitution, not a tag, and must survive verbatim.

**H4 — the corrected recipe is bash/zsh, NOT `sh`.** `done < <(find ...)` is process substitution
and fails under POSIX `sh`. macOS defaults to zsh so the operator running it interactively is fine,
but the recipe must carry a one-line note saying so, because the recipe it replaces was a plain
pipeline that ran anywhere.

**H5 — self-invalidating grep.** The corrected block carries a comment line naming the prohibited
old command so a reader knows why it changed. That comment line contains the old command's text.
**Any grep asserting the old form is gone MUST strip comment lines first** (`grep -v ':[[:space:]]*#'`),
or it will match its own prohibition and report a false failure. This is the exact trap CLAUDE.md
and the GSD grep-gate rule warn about.

**H6 — this change verifies NOTHING about the live gate.** No tag, no notarization result, no
helper launch. The todo's `### NOTHING HERE IS VERIFIED` list stays true in full and is not edited.
The commit message and SUMMARY must not imply otherwise.

</hazards>

<corrected_recipe_verbatim>

**Use these two blocks verbatim** as the replacement for steps 4 and 5 inside the existing fenced
block under `### The only real verification`. They are the text that was controlled today. Preserve
the surrounding steps 1, 2, 3 and 6 exactly as they are.

Replacement for step 4:

    # 4. count SURVIVORS -- FILES, and Mach-O only. This must be 0.
    #    NOTE: bash/zsh only -- `done < <(...)` is process substitution, not POSIX sh.
    #    Do NOT use the old one-liner form
    #    (`find ... | xargs -0 -n1 codesign -dv 2>&1 | grep -c 'adhoc|not signed'`):
    #    it counts LINES not FILES (~2x inflated) and never reaches 0 because every
    #    non-Mach-O resource reports "not signed at all" forever. See the
    #    2026-09-23 sub-section below for the measurement.
    root=GameLib.app/Contents/Resources; n=0
    while IFS= read -r -d '' f; do
      file -b "$f" | grep -q 'Mach-O' || continue
      if codesign -dv "$f" 2>&1 | grep -qE 'adhoc|code object is not signed'; then
        n=$((n + 1)); printf 'SURVIVOR %s\n' "$f"
      fi
    done < <(find "$root" -type f -print0)
    echo "survivors=$n"     # must be 0

Replacement for step 5:

    # 5. step 4 is a CONTROL trap and needs BOTH directions, run BEFORE trusting a zero.
    #    POSITIVE: point the SAME loop at the untouched local helper tree
    #      build/bin/arm64/darwin, which is 100% ad-hoc. It must report 253
    #      (measured 2026-09-23). A single-file control is NOT enough: one ad-hoc
    #      file returns 2 under the OLD pipeline, not 1, and one file can never
    #      expose the non-Mach-O contamination at all.
    #    NEGATIVE: point the SAME loop at a scratch dir holding Apple-signed
    #      /bin/ls and /bin/cat PLUS one plain text file. It must report 0
    #      (measured 2026-09-23). The text file is the part that matters -- it
    #      proves the Mach-O restriction actually suppresses the non-Mach-O noise.

Why this form: it counts **files**, restricts to Mach-O by `file -b` (matching the population the
signer targets), and **prints each survivor's path** so a non-zero result is actionable rather than
a bare number. `-type f` skips symlinks, which is correct and consistent with the signer, which
never follows them.

</corrected_recipe_verbatim>

<tasks>

<task type="auto">
  <name>Task 1: Replace the unachievable step 4 and its inadequate step 5</name>
  <files>.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md</files>
  <action>
Edit ONLY the `### The only real verification` sub-section, inside its existing fenced block.

(a) Replace the step-4 lines (currently the `# 4. count survivors -- this must be ZERO` comment
plus the two-line `find ... | xargs -0 -n1 codesign -dv 2>&1 | grep -c ...` pipeline) with the
step-4 block given verbatim in `<corrected_recipe_verbatim>`.

(b) Replace the step-5 lines (currently the two-line `# 5. step 4 above is a POSITIVE-CONTROL
trap...` comment) with the step-5 block given verbatim in `<corrected_recipe_verbatim>`.

(c) Leave steps 1, 2, 3 and 6 byte-identical. Leave the `**Step 6 is not optional...**` paragraph
that follows the fence in place, but extend its second sentence so it stays true: it currently
says "Step 5 is not optional either: this task already caught one positive control passing for the
wrong reason (BSD `head -n -1` ...)". Add that as of 2026-09-23 it has now caught a SECOND one —
step 4's own former control — and that this is why step 5 now demands BOTH a positive and a
negative control rather than a single-file check. Name the 2026-09-23 sub-section as the record.

(d) Change NOTHING else in the file in this task. Do not touch the frontmatter, the `## Problem`,
`## Verification`, `## STATUS 2026-09-17 (quick-260917-uik)` or `### NOTHING HERE IS VERIFIED`
sections. The dated sub-section is Task 2's job.

Per H4, keep the bash/zsh note. Per H3, introduce no `</...>`-shaped text.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && F=.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md && grep -q 'echo "survivors=\$n"' "$F" && grep -q "file -b \"\$f\" | grep -q 'Mach-O'" "$F" && grep -q "done < <(find \"\$root\" -type f -print0)" "$F" && grep -q 'printf .SURVIVOR' "$F" && grep -q 'NEGATIVE: point the SAME loop' "$F" && grep -q 'POSITIVE: point the SAME loop' "$F" && test "$(grep -n 'xargs -0 -n1 codesign' "$F" | grep -cv ':[[:space:]]*#')" = 0 && grep -q '# 6. LAUNCH the app' "$F" && npx prettier --check "$F" && grep -qx '.planning' .prettierignore && echo "OK step4/5 replaced; old pipeline survives only as a comment; prettier ignores .planning (H1)"</automated>
  </verify>
  <done>
Step 4 counts files, restricts to Mach-O and prints survivor paths; step 5 carries both a positive
(253) and a negative (0) control; the old `xargs -0 -n1 codesign` pipeline appears ONLY inside a
comment line; steps 1/2/3/6 are untouched; the `Step 6 is not optional` paragraph records the
second control that passed for the wrong reason.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add the dated 2026-09-23 measurement sub-section, prove the gates, commit</name>
  <files>.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md</files>
  <action>
(a) ADD a new sub-section immediately AFTER `### The only real verification` (and before
`## Related`), titled:

`### STATUS 2026-09-23 (quick-260923-ihw) — step 4 of that recipe was unachievable by construction`

Write it in this file's existing register — blunt, measured, no hedging. It must record, using the
numbers in `<measured_evidence>` and inventing none:

1. The todo's step-4 command run VERBATIM against the real local helper tree
   `build/bin/arm64/darwin` returns **530**, not 253. Name the tree and say why it is a perfect
   positive control: it is the same tree the CI step signs, and it is 100% ad-hoc.
2. The exact breakdown — **506 adhoc lines** (253 Mach-O files x TWO matching lines each: a
   `flags=0x2(adhoc)` line AND a `Signature=adhoc` line) plus **24 unsigned lines** (the 24
   non-Mach-O regular files, each emitting "code object is not signed at all") = 530. Out of 277
   regular files, 253 Mach-O, 24 non-Mach-O.
3. **Defect (a): `grep -c` counts LINES, not FILES** — ~2x inflated for the population it is
   supposed to measure.
4. **Defect (b): no Mach-O restriction, so the pass condition is UNREACHABLE BY CONSTRUCTION.**
   Every non-Mach-O resource reports "not signed at all" forever, after a perfect signing run just
   as much as before it, because the signer deliberately and correctly never touches them. State
   the escalation explicitly: it is WORSE in the real app than in this subtree, because the recipe
   runs over the whole `GameLib.app/Contents/Resources`, which holds the entire non-Mach-O frontend
   bundle — so a correct, fully-notarized app would report a large positive number and read as a
   FAILURE.
5. **Defect (c), in the file's own honesty register: step 5's old control would NOT have caught
   either defect.** A single ad-hoc file returns **2** under that pipeline, not 1, and a
   single-file control can never expose the non-Mach-O contamination at all. Say plainly that this
   is the SAME SHAPE this todo already documents once — the BSD `head -n -1` control that passed
   for the wrong reason — and that it is now the second instance, which is why step 5 now demands
   a negative control too.
6. **The controls that were run on the corrected form**, both exact: POSITIVE — the corrected loop
   against the untouched all-ad-hoc `build/bin/arm64/darwin` returns **253**, exactly the
   population Apple rejected, where the old form returns 530 on that same tree. NEGATIVE — the
   corrected loop against a directory of Apple-signed `/bin/ls` and `/bin/cat` PLUS one plain text
   file returns **0**. State why the negative control is the one that was missing entirely: it
   proves the loop CAN report zero, so a zero from the real run is not just a broken pipeline, and
   the plain text file is the part that matters because it proves the Mach-O restriction actually
   suppresses the non-Mach-O noise.
7. **The HEAD re-measurement of the detector, 2026-09-23.** `build/bin/arm64/darwin` still holds
   277 regular files and 253 Mach-O — unchanged from the 2026-09-17 measurement.
   `pnpm sign:macos-resources -- --dir build/bin/arm64/darwin --keychain ... --identity FAKE
   --dry-run` still reports "would sign 253 file(s)", and its selection is the IDENTICAL SET to a
   `file -b`-derived ground truth, compared as a SET with `diff` over two sorted path lists which
   produced EMPTY output — **not merely by count**. Say explicitly that the 2026-09-17 claim about
   the detector still holds at HEAD and that `meta/signMachOResources.ts` was NOT edited: the
   defect was in this todo's verification prose only.
8. A closing paragraph that leaves no room for misreading: **the tag push has NOT happened.** No
   throwaway tag exists locally or on origin. The live gate is entirely unrun. Every item in
   `### NOTHING HERE IS VERIFIED` above is still UNOBSERVED, including notarization returning
   `Accepted`. This change corrected a recipe; it verified nothing. The todo stays OPEN, stays in
   `pending/`, and `ready: live-gate` / `needs: retag-and-confirm-notarization-accepted` are
   unchanged.

Also add one line near the top of the sub-section noting it deliberately does NOT revise the
2026-09-17 narrative above — that section records what was believed then and is left intact.

(b) Do not touch the frontmatter. Do not move the file.

(c) VERIFY, then commit.

- `pnpm planning-gates` — expect `12/12 planning gates passed`. Measured green at HEAD at plan time
  on this Mac, so a red result is caused by THIS change. Per H2, fix the document, never the gate.
- `npx prettier --check` over the explicit todo path. Per H1 this is a green check proving nothing
  because `.prettierignore` lists `.planning`; the verify block asserts that ignore entry still
  exists so the green is explained. Do not remove the entry to "make the check real".
- `git diff --name-only HEAD` must list exactly one path, the todo. Any second path means a source
  file was touched, which is prohibited.

Then commit that one file:
`docs(quick-260923-ihw): fix the unachievable survivor count in the notarization todo`
Body: record that the old step 4 returned 530 (506 adhoc lines + 24 non-Mach-O) on a tree holding
253 Mach-O files; that its zero pass condition was unreachable by construction; that the corrected
form was positive-controlled at 253 and negative-controlled at 0; and that **nothing about the live
gate was verified and no tag was pushed**. End the message with:
`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

Do NOT assert anything about push state inside the commit message.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && F=.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md && test -f "$F" && grep -q '^### STATUS 2026-09-23 (quick-260923-ihw)' "$F" && for p in '530' 'would sign 253 file(s)' 'IDENTICAL SET' 'unreachable by construction' 'negative control'; do grep -Fqi "$p" "$F" || { echo "MISSING ANCHOR: $p"; exit 1; }; done && test "$(grep -Fc '2026-09-23' "$F")" -ge 3 && grep -qi 'tag push has NOT happened' "$F" && grep -qi 'head -n -1' "$F" && grep -qx 'severity: critical' "$F" && grep -qx 'platform: macos' "$F" && grep -qx 'ready: live-gate' "$F" && grep -qx 'needs: retag-and-confirm-notarization-accepted' "$F" && grep -qx 'status: OPEN' "$F" && npx prettier --check "$F" && grep -qx '.planning' .prettierignore && pnpm planning-gates 2>&1 | grep -q '12/12 planning gates passed' && test "$(git diff --name-only HEAD | wc -l | tr -d ' ')" = 1 && echo "OK dated section present; frontmatter intact; gates 12/12; exactly one file changed"</automated>
  </verify>
  <done>
The file carries `### STATUS 2026-09-23 (quick-260923-ihw)` recording 530 = 506 + 24 against 277
files / 253 Mach-O, both defects, the step-5 control admission naming the `head -n -1` precedent,
the 253/0 control results, the HEAD detector re-measurement as an identical SET, and an explicit
statement that the tag push has NOT happened. Frontmatter is unchanged, the file is still in
`pending/`, exactly one file is modified, `pnpm planning-gates` is 12/12, and the change is
committed with the required attribution line.
  </done>
</task>

</tasks>

<verification>

| check                                                   | expected                    | what a failure means                                                        |
| ------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| `grep 'xargs -0 -n1 codesign'` minus comment lines       | **0**                       | non-zero → the broken pipeline is still live, not merely quoted (H5)         |
| `echo "survivors=$n"` present                            | present                     | absent → step 4 was not replaced                                            |
| `file -b "$f" \| grep -q 'Mach-O'` present               | present                     | absent → the unreachable-by-construction defect is not fixed                |
| POSITIVE and NEGATIVE control lines in step 5            | both present                | one missing → step 5 is still the single-direction control that failed      |
| `### STATUS 2026-09-23 (quick-260923-ihw)`               | present                     | absent → the measurement is uncorded and the correction looks unmotivated   |
| `530`, `would sign 253 file(s)`, `IDENTICAL SET`          | all present                 | any missing → the measurement was paraphrased away. NOTE: `506`/`253`/`277` already appear in the 2026-09-17 text, so asserting them would be VACUOUS — these three anchors were confirmed absent at plan time. |
| frontmatter five keys                                    | byte-identical              | any change → a locked decision was violated                                 |
| `git diff --name-only HEAD`                              | exactly 1 path              | 2+ → a source file was touched, which is prohibited                         |
| `pnpm planning-gates`                                    | **12/12** (green at HEAD)   | red → fix the document, never the gate (H2)                                 |
| `npx prettier --check <path>`                            | exit 0, **proves nothing**  | see H1 — paired with `grep -qx '.planning' .prettierignore` to explain it    |

</verification>

<success_criteria>

- Step 4 of `### The only real verification` counts FILES, restricts to Mach-O via `file -b`,
  prints each survivor's path, and carries the bash/zsh note plus a pointer to the dated section.
- Step 5 demands BOTH a positive control (253 on the all-ad-hoc helper tree) and a negative control
  (0 on an Apple-signed dir containing a plain text file), and says why one file was never enough.
- `### STATUS 2026-09-23 (quick-260923-ihw)` records the 530 = 506 + 24 measurement, both defects,
  the escalation in the real `.app`, the step-5 control admission next to the `head -n -1`
  precedent, the 253/0 control results, and the HEAD detector re-measurement as an identical SET.
- The todo states in words that the tag push has NOT happened and the live gate is entirely unrun.
- Frontmatter unchanged; file still in `pending/`; no source file, script or test created or edited.
- `pnpm planning-gates` 12/12; exactly one file in the diff; one atomic commit with the attribution
  line.

</success_criteria>

<output>
Create `.planning/quick/260923-ihw-fix-the-notarization-todos-unachievable-verif/260923-ihw-SUMMARY.md` when done.

The SUMMARY must state plainly that this was a documentation correction, that nothing about the
macOS live gate was verified, and that no tag was pushed.
</output>
