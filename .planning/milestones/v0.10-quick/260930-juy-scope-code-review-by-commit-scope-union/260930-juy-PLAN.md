---
phase: quick-260930-juy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - $HOME/.claude/gsd-core/workflows/code-review.md
  - .planning/todos/pending/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md
  - .planning/todos/completed/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md
autonomous: true
requirements: [JUY-01, JUY-02, JUY-03, JUY-04, JUY-05]

estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 3
  confidence: low # estimate-calibration: {"factor":1,"applied":false,"sample_count":0,"confidence":"low","min_samples":3} — 0 samples, so factor 1 and confidence is DERIVED, not self-rated

must_haves:
  truths:
    - "For a phase with at least one scope-tagged commit carrying a reviewable file, /gsd-code-review's git-derived file scope is the union of those commits' own file sets, not the DIFF_BASE..DIFF_HEAD range."
    - "Every file the range contained and the union does not is PRINTED by name before being excluded — never silently discarded."
    - "For a phase with NO scope-tagged commit carrying a reviewable file (phase 45), the scope is the DIFF_BASE..DIFF_HEAD range and is non-empty. An empty union never yields an empty review scope."
    - "Scope-tagged commits landing AFTER DIFF_HEAD are still counted — the union is not clamped to the range window."
    - "#4666's measured table and all six prior comments (#3503, #2989, #3191, #3995, #3661, #4460) survive byte-intact; #4666 gains a supersession line rather than being deleted."
  artifacts:
    - "$HOME/.claude/gsd-core/workflows/code-review.md — carries phase_scope_exclude() and resolve_phase_file_scope(), a #4667 comment, and an updated #4666"
    - ".planning/todos/completed/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md — the todo, moved (not copied) from pending/"
    - ".planning/quick/260930-juy-scope-code-review-by-commit-scope-union/260930-juy-SUMMARY.md"
  key_links:
    - "resolve_phase_file_scope() sets PHASE_SCOPE_FILES, and BOTH diff consumption sites (the Tier-3 full fallback and the #2666 SUMMARY cross-check) read it instead of running their own git diff."
    - "DIFF_HEAD_ALT (built by #4666) is the single scope-token alternation feeding both the DIFF_HEAD anchor grep and the new union grep — one regex, two consumers."
    - "PHASE_SCOPE_SOURCE reaches the 'File scope: N files from …' log line, so which tier fired is visible in the review's own output."
---

<objective>
Make `/gsd-code-review`'s git-derived file scope the **union of the phase's own scope-tagged
commits** instead of the `DIFF_BASE..DIFF_HEAD` range, retaining the range as a printed safety net
and as the fallback when the union is empty.

This EXTENDS quick task `260930-ivj`'s `#4666` patch; it does not replace it. `#4666`'s `DIFF_HEAD`
computation, its `DIFF_HEAD_ALT` alternation, and both of its `HEAD` fallback guards remain
load-bearing and are consumed directly by the new code.

Purpose: a range contains every interleaved commit between base and anchor. Measured on this repo,
that is 14 foreign files on phase 41, 154 on phase 34.6, and 534 on phase 42 — a reviewer reading
602 files for a 69-file phase reads superficially. The union makes the scope per-phase exact.

Output: the edited out-of-repo workflow file, the residual todo closed, and a SUMMARY recording the
measured numbers, the cost delta, and the upgrade trap.

**Requirements this plan discharges:**

- **JUY-01** — the union becomes the primary git-derived scope at both diff sites.
- **JUY-02** — the range is retained and its difference from the union is printed by name, never
  silently discarded.
- **JUY-03** — strictly ordered fallback: union non-empty → union; union empty → range; range's own
  `HEAD` fallbacks (`#4666` guards 1 and 2) unchanged. An empty union NEVER yields an empty scope.
- **JUY-04** — the union is NOT clamped to the range window; scope-tagged commits after `DIFF_HEAD`
  count.
- **JUY-05** — comment provenance: `#4667` added, `#4666` updated (not deleted), six prior comments
  byte-intact.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md
@.planning/quick/260930-ivj-bound-code-review-scope-to-phase-end/260930-ivj-SUMMARY.md

**The file being edited is OUTSIDE this repository:**
`$HOME/.claude/gsd-core/workflows/code-review.md` (1019 lines at plan time). Read the whole
`<step name="compute_file_scope">` block (lines 102–486) before editing, and `#4666` (lines ~282–340)
especially.

**Project skills:** `.claude/skills/` holds `archify`, `sketch-findings-gamelib`,
`spike-findings-gamelib`. None apply — this task edits a bash block in an out-of-repo GSD workflow
file and touches no UI, no Steam/macOS/Tauri code, and no diagram. There is no `.claude/rules/` and
no `.agents/skills/`. Stated so the executor does not go looking.

**Shell environment, measured at plan time:**

- macOS system bash is **3.2.57** — no associative arrays, no `mapfile`, no `${var^^}`. Match the
  file's existing idioms: `grep -Fxq` for whole-line membership, `printf '%s\n' "${ARR[@]}"` for
  array emission, `while IFS= read -r` for consumption.
- The interactive shell here is **zsh** and interactive `grep` is **ugrep**. Every assertion in this
  plan uses `/bin/bash` and `/usr/bin/grep` explicitly.
- `#4109` (already in the file) records the trap: a bare `$VAR` in `for x in $VAR` word-splits under
  bash but NOT under zsh, collapsing every element onto one iteration there. The file's fix is to
  wrap in unquoted command substitution — `for x in $(printf '%s' "$VAR")`. The new commit-hash loop
  MUST use that form.

**Pipeline-status discipline for every gate below (plan-criteria R4).** A `git … | grep -c …` gate
reports only the LAST stage's status, so a broken or erroring `git` yields `0` and any `expect 0`
assertion passes vacuously. Wherever a gate below asserts a count of zero through a pipeline whose
first stage is `git`, it is paired with a **positive control** on the same pipeline — a case that
must return a non-zero count — so a silently-failing `git` reds the gate instead of greening it.
Where no control is given, capture the count into a variable and check `git`'s own status before
comparing. Also per CLAUDE.md's grep hygiene: never take a bare `grep -c <token>` over a file that
contains the token in comment prose — filter comments (`grep -v '^ *#'`) first, or match a fixed
string whose presence (not absence) is the assertion.
</context>

<measured_baseline>
**The measurement pass is DONE. Do not re-derive the table; reproduce it as a gate.**

All six numbers below were independently reproduced at plan time on this checkout with the harness
in `<probe_harness>`, using bases derived exactly as the workflow derives them
(`PHASE_START^`, where `PHASE_START = git log --format=%H --diff-filter=A -- <phase dir> | tail -1`):

| phase | base | anchor | range | **union** | range∖union | union∖range | scoped commits | commits in window |
| ----- | ---- | ------ | ----- | --------- | ----------- | ----------- | -------------- | ----------------- |
| 41    | `3ecd7b0b1` | `de4aa7250` | 23  | **9**  | 14  | 0 | 32  | 47   |
| 34.6  | `21d6c5f94` | `d1829d3fb` | 194 | **42** | 154 | 2 | 117 | 387  |
| 42    | `f60e8ad91` | `ee46df158` | 602 | **69** | 534 | 1 | 43  | 1140 |

Phase 45 (the zero-scoped-commit probe): scope-tagged commit count **0**, phase start
`410ec15d7`, so base `410ec15d7^`, anchor `HEAD` (via `#4666` guard 1). Range = **426** files at
plan time.

**Cost check — measured, not assumed.** Phase 34.6's 117 `git show` calls plus the range diff and
the set arithmetic completed in **1.15s wall** (0.58s user / 0.46s sys). Phase 41: 0.40s. Phase 42:
0.53s. That is well under the 5s threshold, so **no batching is needed**. If it ever grows, the
remedy is a single batched `git show --format= --name-only c1 c2 …` invocation — record that as the
remedy, do NOT implement it.

**MUTABLE-SCOPE AUTHORITY (#3786).** Git history and `HEAD` are mutable. Every figure above is
pinned with the exact command that produced it (`<probe_harness>`). The three closed phases (41,
34.6, 42) are bounded at a fixed anchor and should be stable. **Phase 45's 426 is `HEAD`-relative
and WILL drift** as commits land — its stable assertion is `union == 0 AND scope == range AND
scope > 0`, not the literal 426. If any probe disagrees with a figure above, **record BOTH numbers
in the SUMMARY** with the command and the date, and carry on. Never edit the target file to make a
number come out.
</measured_baseline>

<probe_harness>
Write this verbatim to `.planning/quick/260930-juy-scope-code-review-by-commit-scope-union/probe-union.sh`
(a committed planning artifact, so every pinned figure stays re-checkable). It was validated at plan
time and reproduces all three rows of the table exactly.

Usage: `/bin/bash <script> '<escaped-scope-alternation>' <base> <anchor>`
— e.g. `'41' 3ecd7b0b1 de4aa7250`, `'34\.6' 21d6c5f94 d1829d3fb`, `'42' f60e8ad91 ee46df158`.

```bash
#!/bin/bash
# Probe harness for quick task 260930-juy. Validated 2026-09-30 against phases 41, 34.6, 42.
# $1 = scope alternation (POSIX ERE, dots already escaped), $2 = DIFF_BASE, $3 = DIFF_HEAD
ALT="$1"; BASE="$2"; ANCHOR="$3"
filt() {
  /usr/bin/grep -v '^\.planning/' \
  | /usr/bin/grep -vxF 'ROADMAP.md' \
  | /usr/bin/grep -vxF 'STATE.md' \
  | /usr/bin/grep -v -- '-SUMMARY\.md$' \
  | /usr/bin/grep -v -- '-VERIFICATION\.md$' \
  | /usr/bin/grep -v -- '-PLAN\.md$' \
  | /usr/bin/grep -vxF 'package-lock.json' \
  | /usr/bin/grep -vxF 'yarn.lock' \
  | /usr/bin/grep -vxF 'Gemfile.lock' \
  | /usr/bin/grep -vxF 'poetry.lock'
}
SCOPED=$(git log --format="%H %s" | /usr/bin/grep -E "^[0-9a-f]+ [a-z]+\((phase-)?(${ALT})(-[0-9]+)?\)!?:" | cut -d' ' -f1)
NCOMMITS=$(printf '%s\n' "$SCOPED" | /usr/bin/grep -c . )
UNION_RAW=""
for c in $(printf '%s' "$SCOPED"); do
  UNION_RAW="${UNION_RAW}$(git show --format= --name-only "$c" 2>/dev/null)
"
done
UNION=$(printf '%s\n' "$UNION_RAW" | /usr/bin/grep -v '^$' | filt | sort -u)
NUNION=$(printf '%s\n' "$UNION" | /usr/bin/grep -c . )
RANGE=$(git diff --name-only "${BASE}..${ANCHOR}" -- . \
  ':!.planning/' ':!ROADMAP.md' ':!STATE.md' \
  ':!*-SUMMARY.md' ':!*-VERIFICATION.md' ':!*-PLAN.md' \
  ':!package-lock.json' ':!yarn.lock' ':!Gemfile.lock' ':!poetry.lock' 2>/dev/null | sort -u)
NRANGE=$(printf '%s\n' "$RANGE" | /usr/bin/grep -c . )
DROPS=$(comm -23 <(printf '%s\n' "$RANGE" | /usr/bin/grep -v '^$') <(printf '%s\n' "$UNION" | /usr/bin/grep -v '^$'))
NDROPS=$(printf '%s\n' "$DROPS" | /usr/bin/grep -c . )
OUTSIDE=$(comm -13 <(printf '%s\n' "$RANGE" | /usr/bin/grep -v '^$') <(printf '%s\n' "$UNION" | /usr/bin/grep -v '^$'))
NOUT=$(printf '%s\n' "$OUTSIDE" | /usr/bin/grep -c . )
NWINDOW=$(git log --format=%H "${BASE}..${ANCHOR}" 2>/dev/null | /usr/bin/grep -c . )
echo "alt=${ALT} scoped_commits=${NCOMMITS} commits_in_window=${NWINDOW} range=${NRANGE} union=${NUNION} range_minus_union=${NDROPS} union_minus_range=${NOUT}"
[ "${DUMP_DROPS:-}" = "1" ] && printf '%s\n' "$DROPS"
exit 0
```

**The probe is a cross-check, not the gate.** It is an independent re-implementation, so on its own
it proves nothing about the shipped file. The load-bearing gates in Task 1 EXTRACT the two functions
out of the live workflow text and execute them — that is what binds the numbers to the file.
</probe_harness>

<safety_finding>
**Why defaulting to the union is safe, already measured.** On phase 41 all 14 files the union drops
trace to three interleaved quick tasks plus one differently-scoped commit:

- `quick-260906-h2k` — `.claude/settings.json`
- `quick-260906-mdc` — `.prettierignore` + 9 files under `doc/archify/**`
- `quick-260906-hq8` — `meta/runTs.cjs` + its test
- one `fix(test): poll for getAnticheatInfo response frames` commit

Phase 41 is **i18n gate honesty** (`.planning/phases/41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-`),
so **none of the 14 is phase-41 work** — the union is correct on all 14. Of the 47 commits in that
window exactly one carries no conventional scope at all (`2561a48a3 wip: macOS dev paused`), also not
phase work.

**The residual is real and unmeasurable, which is why the range stays.** A genuine phase commit
scoped `fix(test):` or bare `fix:` instead of `fix(41):` WOULD be dropped by the union. Nothing can
detect that automatically — a commit that failed to say which phase it belongs to cannot be
attributed by machine. The printed drop list is the control that keeps that failure **visible**
rather than silent, exactly as `#4666`'s D-02 deleted-file fix and the `#2666` cross-check already
do: warn about what the narrower method missed.
</safety_finding>

<tasks>

<task type="tracer">
  <name>Task 1: Union as primary scope, wired end-to-end at both diff sites</name>
  <files>$HOME/.claude/gsd-core/workflows/code-review.md, .planning/quick/260930-juy-scope-code-review-by-commit-scope-union/probe-union.sh</files>
  <precondition>`/bin/bash --version` reports 3.2.x and `$HOME/.claude/gsd-core/workflows/code-review.md` contains the literal `#4666` — i.e. `260930-ivj`'s patch is present and has not been reverted by a gsd-core upgrade. If `#4666` is absent, HALT: this task extends it and cannot be applied to a pristine file.</precondition>
  <action>
FIRST, before any edit, snapshot the pristine file to the session scratchpad and record its
sha256. `260930-ivj` failed to keep a snapshot and had to report an estimated diff size instead of
a measured one; the snapshot is also the negative control for every gate below, and Task 3 needs it
for an exact diff.

Then write the probe harness from the plan's `<probe_harness>` section verbatim to
`.planning/quick/260930-juy-scope-code-review-by-commit-scope-union/probe-union.sh` and make it
executable.

Now edit `compute_file_scope` in the workflow file. Insert two shell functions immediately AFTER
`#4666`'s guard 2 (the `git merge-base --is-ancestor` block) and BEFORE the
`if [ ${#REVIEW_FILES[@]} -eq 0 ]; then` line:

`phase_scope_exclude()` — a stdin filter reproducing the exclusion pathspec set the two diff sites
already use, as explicit line filters. `git show --name-only` does NOT accept those `:!…`
pathspecs the way `git diff -- . ':!…'` does, so the filtering has to be explicit. The equivalences
were verified at plan time against the real diff sites and are exact: `':!.planning/'` becomes a
prefix filter on `^\.planning/`; `':!ROADMAP.md'`, `':!STATE.md'` and the four lockfiles are
magic-free git pathspecs, which match the repo-root path only, so they become whole-line fixed
filters (`grep -vxF`); `':!*-SUMMARY.md'` and its two siblings use git's pathspec wildmatch, where
`*` crosses `/`, so they match at ANY depth and become suffix filters. Use the exact ten filter
stages listed in the probe harness's `filt()`, in that order.

`resolve_phase_file_scope()` — sets two globals and prints the drop warning; it must NOT echo the
file list on stdout. Returning the list by global rather than by stdout is deliberate: if the
function echoed both the warning and the list, the warning lines would be captured as filenames and
reviewed as files. Setting globals removes that failure mode structurally instead of guarding it.

Its body, in order:

1. Grep `git log --format="%H %s"` for the phase's scope-tagged commits with the SAME pattern
   `#4666` already uses for the anchor, reusing `DIFF_HEAD_ALT` verbatim — one alternation, two
   consumers. Do not rebuild or widen the regex. Take every match's hash, not `head -1`.
2. Accumulate each hash's `git show --format= --name-only` output. Iterate the hashes with the
   `#4109` idiom — unquoted command substitution around `printf '%s'`, never a bare `$VAR` — or the
   loop runs once under zsh. `--format=` emits a leading blank line per commit; drop empties.
3. Pipe the accumulation through `phase_scope_exclude` and `sort -u` into the union.
4. Compute the range with the existing `git diff --name-only "${DIFF_BASE}..${DIFF_HEAD}"` plus its
   ten `:!…` pathspecs, `sort -u`. Keep `DIFF_HEAD` — do NOT revert to a bare `HEAD` bound.
5. If the union is EMPTY: set the scope to the range, set the source label to record that the range
   fallback fired, and return. This is JUY-03 and it is the most important branch in the task —
   silently reviewing nothing is worse than over-collecting.
6. Otherwise set the scope to the union and the source label to the union.
7. Build the drop list: every range path with no whole-line match in the union, tested with
   `grep -Fxq --`, appended to a bash array (`#2666`'s exact membership idiom, which is already in
   this file three lines of reasoning deep — reuse it, do not invent a second one).
8. If the drop list is non-empty, print a header naming the count and stating the files are being
   excluded from review scope, then emit every path with the file's own `printf '  - %s\n'` idiom.
   Per JUY-02 this is a NAMED list, never a bare count.

Deliberate widening to record, not hide: the locked decision describes the fallback trigger as "no
scope-tagged commit at all". The implemented trigger is the strictly broader "the union is empty
after exclusions" — which also fires when scope-tagged commits exist but touched only excluded
paths (a planning-only phase). That serves the decision's own stated intent ("never let an empty
union produce an empty review scope") strictly better, so it is implemented that way and stated in
the `#4667` comment rather than silently differing.

Structural constraint that makes the behavioural gates possible: write BOTH functions with their
opening line at column 0 (`name() {`) and their closing brace as a bare `}` at column 0, with no
other column-0 `}` in between. The gates below extract each function by that delimiter and execute
it against the shipped text. Keep the `phase_scope_exclude` pipeline's continuation lines indented.

Then convert BOTH consumption sites to read the resolved scope:

- Site A, the Tier-3 full fallback (`if [ ${#REVIEW_FILES[@]} -eq 0 ]` → `if [ -n "$DIFF_BASE" ]`):
  call the resolver, feed its scope global into the existing `while IFS= read -r file` loop in place
  of the inline `git diff`, and extend the existing `File scope: … from git diff (base: …, head: …)`
  line to report the source label so which tier fired is visible in the review's own output.
- Site B, the `#2666` cross-check (the `elif [ -z "$FILES_OVERRIDE" ] && [ -n "$DIFF_BASE" ]`
  branch): call the resolver and feed its scope global into the existing cross-check loop in place
  of the inline `git diff`. Leave `#4460`'s `FILES_OVERRIDE` gate, the `IN_SCOPE` line, the
  `MISSING_FROM_SUMMARY` loop and its warning exactly as they are — the cross-check keeps working,
  it just now cross-checks against the narrower union.

Because the two sites are mutually exclusive branches of one `if`/`elif`, the resolver runs at most
once per invocation by construction; no memoisation is needed and none should be added.

Do not touch `#3503`, `#2989`, `#3191`, `#3995`, `#3661`, `#4460`, `#4109`, or `#4666` in this
task — comment work is Task 2. Do not change `DIFF_HEAD`, `DIFF_HEAD_ALT`, either `#4666` guard, the
`DIFF_BASE` computation, or any of the five post-processing steps. Do not touch this repo's `src/`.
  </action>
  <verify>
    <automated>
# All gates run from the checkout root. SNAP = the pristine snapshot written at task start.
# Every gate is run against SNAP FIRST as a negative control; any gate that passes pre-fix
# is VACUOUS and must be reported as such in the SUMMARY, not counted as assurance.
F="$HOME/.claude/gsd-core/workflows/code-review.md"
SNAP="$SCRATCH/code-review.pristine.md"   # written before any edit

# G1 — the two functions exist, delimited so they are extractable. Asserted per-function with
# `>= 1` / `== 0` rather than an exact `grep -c 2`, because `grep -c` counts LINES not matches
# (plan-criteria R1) — and `grep -n` is used where the line positions themselves matter.
for fn in 'phase_scope_exclude' 'resolve_phase_file_scope'; do
  test "$(/usr/bin/grep -c "^${fn}() {\$" "$F")"   -ge 1   # present in the live file
  test "$(/usr/bin/grep -c "^${fn}() {\$" "$SNAP")" =   0   # negative control: absent pre-fix
done
/usr/bin/grep -n '^phase_scope_exclude() {$\|^resolve_phase_file_scope() {$\|^}$' "$F" | head -20
# ^ read the line numbers and confirm each `name() {` is followed by a column-0 `}` with no other
#   column-0 `}` between them, so the sed extraction in G2 is exact.

# G2 — BEHAVIOURAL, on the shipped text: extract both functions out of the live file and run them.
# This is the gate that binds the numbers to the file; the probe harness alone does not.
run_live() {  # $1=alt  $2=base  $3=anchor
  /bin/bash -c '
    eval "$(/usr/bin/sed -n "/^phase_scope_exclude() {/,/^}/p" "'"$F"'")"
    eval "$(/usr/bin/sed -n "/^resolve_phase_file_scope() {/,/^}/p" "'"$F"'")"
    DIFF_HEAD_ALT="'"$1"'"; DIFF_BASE="'"$2"'"; DIFF_HEAD="'"$3"'"
    OUT=$(resolve_phase_file_scope)
    echo "scope=$(printf "%s\n" "$PHASE_SCOPE_FILES" | /usr/bin/grep -c .) source=${PHASE_SCOPE_SOURCE}"
    echo "warned=$(printf "%s\n" "$OUT" | /usr/bin/grep -c "^  - ")"
  '
}
run_live '41'    3ecd7b0b1 de4aa7250   # expect scope=9   warned=14, source names the union
run_live '34\.6' 21d6c5f94 d1829d3fb   # expect scope=42  warned=154
run_live '42'    f60e8ad91 ee46df158   # expect scope=69  warned=534

# G3 — THE MOST IMPORTANT GATE (JUY-03). Phase 45 has zero scope-tagged commits; the empty union
# must yield the RANGE, never an empty scope. 426 is HEAD-relative and WILL drift: the stable
# assertion is scope>0 AND scope == the range AND the source label says the fallback fired.
# R4 positive control FIRST: the identical pipeline must be NON-empty for phase 41, so a silently
# erroring `git log` cannot make the phase-45 zero below pass vacuously. The phase-41 figure was 32
# at plan time — RECORD what it actually is (one commit per line here, so lines == matches) and if
# it differs, report BOTH numbers per #3786; the GATE is `>= 1`, not the exact 32.
SUBJ=$(git log --format='%H %s'); test $? -eq 0
printf '%s\n' "$SUBJ" | /usr/bin/grep -cE '^[0-9a-f]+ [a-z]+\((phase-)?(41)(-[0-9]+)?\)!?:'  # record; pinned 32
test "$(printf '%s\n' "$SUBJ" | /usr/bin/grep -cE '^[0-9a-f]+ [a-z]+\((phase-)?(41)(-[0-9]+)?\)!?:')" -ge 1
test "$(printf '%s\n' "$SUBJ" | /usr/bin/grep -cE '^[0-9a-f]+ [a-z]+\((phase-)?(45)(-[0-9]+)?\)!?:')" =   0
run_live '45' "410ec15d7^" HEAD   # expect scope>0, source = range fallback, warned=0
git diff --name-only "410ec15d7^..HEAD" -- . ':!.planning/' ':!ROADMAP.md' ':!STATE.md' \
  ':!*-SUMMARY.md' ':!*-VERIFICATION.md' ':!*-PLAN.md' ':!package-lock.json' ':!yarn.lock' \
  ':!Gemfile.lock' ':!poetry.lock' | sort -u | /usr/bin/grep -c .   # must EQUAL G3's scope (426 at plan time)

# G4 — the warning NAMES paths, it does not merely count them (JUY-02). Assert at least one emitted
# line is a real tracked path, so a header-only "14 file(s)" cannot pass.
run_live '41' 3ecd7b0b1 de4aa7250 >/dev/null  # re-run capturing OUT; assert a named path is a real
# path from the phase-41 drop set, e.g. meta/runTs.cjs or .prettierignore
P=.planning/quick/260930-juy-scope-code-review-by-commit-scope-union/probe-union.sh
DROPS=$(DUMP_DROPS=1 /bin/bash "$P" '41' 3ecd7b0b1 de4aa7250); test $? -eq 0
for p in 'meta/runTs.cjs' '.prettierignore'; do
  test "$(printf '%s\n' "$DROPS" | /usr/bin/grep -cxF -- "$p")" -ge 1   # each named, individually
done

# G5 — the warning is NOT captured into the scope (the stdout/global separation). No scope entry may
# begin with the warning header or the "  - " bullet.
run_live '41' 3ecd7b0b1 de4aa7250   # then assert: no PHASE_SCOPE_FILES line matches '^  - ' or '^Note:'

# G6 — both consumption sites read the resolver; no inline git diff survives as the scope source.
# `grep -n` (not an exact `grep -c`, per R1) so the call sites are READ and confirmed to be the
# Tier-3 branch and the #2666 branch, one each — a count cannot tell you WHERE they are.
/usr/bin/grep -n '^ *resolve_phase_file_scope$' "$F"          # read: exactly those two branches
test "$(/usr/bin/grep -c '^ *resolve_phase_file_scope$' "$F")" -ge 2
/usr/bin/grep -n 'git diff --name-only "\${DIFF_BASE}' "$F"   # read: now only inside the resolver
test "$(/usr/bin/grep -c 'git diff --name-only "\${DIFF_BASE}\.\.HEAD"' "$F")" = 0  # ivj's fix intact

# G7 — #4666's machinery is byte-intact (this task extends it, it does not replace it).
# Self-relative: each pattern's count in the live file must EQUAL its count in the snapshot. That is
# the honest shape here — an absolute number would be an exact `grep -c` gate (R1), and what matters
# is that this task changed none of them.
for pat in 'DIFF_HEAD_ALT="${DIFF_HEAD_PADDED}|${DIFF_HEAD_UNPADDED}"' \
           'git merge-base --is-ancestor' 'DIFF_HEAD="HEAD"' \
           'DIFF_HEAD=$(git log --format="%H %s"'; do
  A=$(/usr/bin/grep -cF -- "$pat" "$F"); B=$(/usr/bin/grep -cF -- "$pat" "$SNAP")
  test "$A" = "$B" || echo "REGRESSION on #4666 machinery: [$pat] live=$A snapshot=$B"
  test "$A" -ge 1 || echo "MISSING #4666 machinery: [$pat]"
done

# G8 — bash 3.2 portability: no associative arrays, no mapfile, no ${var^^} introduced. Strip
# comment lines FIRST (CLAUDE.md grep hygiene) so a comment naming `mapfile` cannot red the gate.
test "$(/usr/bin/sed -n '/^phase_scope_exclude() {/,/^}/p;/^resolve_phase_file_scope() {/,/^}/p' "$F" \
  | /usr/bin/grep -v '^ *#' \
  | /usr/bin/grep -c 'declare -A\|mapfile\|readarray\|\^\^}')" = 0
# and the #4109 idiom IS present on the hash loop (presence, so `>= 1`):
test "$(/usr/bin/sed -n '/^resolve_phase_file_scope() {/,/^}/p' "$F" \
  | /usr/bin/grep -c '^ *for .* in \$(printf')" -ge 1
/bin/bash --version | head -1    # must report 3.2.x

# G9 — whitespace-in-path correctness, on a SYNTHETIC fixture. This repo's only space-containing
# tracked path is `.planning/UAT Log.md`, which the exclusion filter drops, so the real repo CANNOT
# exercise this. Build a throwaway git repo under $SCRATCH with a scope-tagged commit touching a
# source path containing a space, run the extracted resolver against it, and assert the path comes
# back as ONE scope entry, not two.

# NO PRETTIER CHECK — deliberate, not forgotten. The edited workflow file is outside this
# repository, and the two in-repo paths this task writes are prettier-ignored: re-probe with
# `npx prettier --file-info <path>` and match space-tolerantly
# (`/usr/bin/grep -Eq '"ignored":[[:space:]]*true'`). Per CLAUDE.md, `--check` over an ignored path
# prints "All matched files use Prettier code style!" and exits 0 having matched ZERO files —
# byte-identical to a real pass. Carrying it here would be a green that proves nothing.
# Confirmed at plan time for the plan path: `{ "ignored": true, "inferredParser": null }`, verified
# with `od -c` because the plain render COLLAPSED the spaces (CLAUDE.md is right; the unspaced
# reading is a renderer artifact — do not normalise it away).
    </automated>
  </verify>
  <done>G1–G9 all pass on the live file and G1/G2/G3/G6 all FAIL against the pristine snapshot. Phase 41/34.6/42 return scope 9/42/69 with 14/154/534 named drops FROM THE SHIPPED TEXT; phase 45's empty union returns the range with a non-empty scope and zero drops; a space-containing path survives as one entry; `#4666`'s machinery is unchanged; no vacuous gate is reported as assurance.</done>
  <reversibility rating="reversible">The whole change is additive text in one out-of-repo file with a pristine snapshot on disk; restoring the snapshot reverts it completely.</reversibility>
</task>

<task type="auto">
  <name>Task 2: Record the mechanism — add #4667, update #4666, measure the cost</name>
  <files>$HOME/.claude/gsd-core/workflows/code-review.md</files>
  <action>
Confirm the comment number is still free before using it. At plan time `#4667` was unused across
`$HOME/.claude/gsd-core`, `$HOME/.claude/gsd-pristine` and `$HOME/.claude/gsd-local-patches`
(`#4668`, `#4669`, `#4671`, `#4672`, `#4673` were also free; `#4670` was taken). Scope the check to
those three trees — `$HOME/.claude/projects/` holds session transcripts, not install source, and a
substring grep there returns false hits. If `#4667` has since been taken, take the next free number
and say which in the SUMMARY.

Add a `#4667` comment block immediately above `phase_scope_exclude()`. It must record, all of it:

- That this is a **LOCAL patch of quick task `260930-juy` on the GameLib checkout, with no upstream
  gsd-core issue filed** — so a reader does not hunt for an issue that does not exist. Same framing
  `#4666` uses for itself.
- The mechanism in one paragraph: the union of `git show --format= --name-only` across every commit
  whose subject carries the phase's conventional-commit scope token, reusing `DIFF_HEAD_ALT`; and
  that `git show --name-only` does not accept the `:!…` pathspecs `git diff` does, which is why the
  exclusion set is reproduced as explicit line filters, with the three equivalence classes named
  (root-only magic-free pathspecs → whole-line fixed filters; wildmatch `*` crossing `/` → suffix
  filters at any depth; the `.planning/` prefix).
- The full measured table from `<measured_baseline>`, **including the range∖union and union∖range
  columns**, with the bases, the anchors, the scoped-commit counts and the commits-in-window counts.
  Date it 2026-09-30 and name the repo.
- Why the range is retained and PRINTED rather than discarded: the residual is real but
  unmeasurable — a phase commit scoped `fix(test):` or bare `fix:` instead of `fix(41):` WOULD be
  dropped, and nothing can attribute it by machine. The printed list is the control that keeps that
  failure visible rather than silent, the same philosophy as `#4666`'s D-02 deleted-file fix and the
  `#2666` cross-check.
- The phase-41 safety finding: all 14 dropped files trace to three named interleaved quick tasks
  (`quick-260906-h2k`, `quick-260906-mdc`, `quick-260906-hq8`) plus one `fix(test):` commit, and
  phase 41 is i18n gate honesty, so none of the 14 is phase-41 work. One of 47 commits in that
  window carries no conventional scope at all and is also not phase work.
- That the union is **deliberately NOT clamped** to the range window: scope-tagged commits landing
  after `DIFF_HEAD` are kept (2 extra files on 34.6, 1 on 42 — later `fix(N)` commits), because a
  `fix(42)` landing after the phase closed IS phase 42 work.
- The ordered fallback, and the deliberate widening: the trigger is "union empty after exclusions",
  broader than "no scope-tagged commit exists", so a phase whose scoped commits touched only
  excluded paths also falls back. Never let an empty union produce an empty review scope.
- The **measured cost**: 117 `git show` calls on phase 34.6, 1.15s wall for the whole probe
  including the range diff and the set arithmetic; 0.40s on phase 41, 0.53s on phase 42 — under the
  5s threshold, so unbatched is fine. Name the remedy if it ever grows (one batched
  `git show --format= --name-only c1 c2 …`) and state it is deliberately NOT implemented.
- Two known residuals, stated honestly: a **merge** commit emits no names under `--name-only`, so a
  scope-tagged merge contributes nothing to the union — measured zero scope-tagged merges across
  phases 41, 34.6 and 42, so this is unexercised rather than proven harmless; and git quotes
  non-ASCII paths under the default `core.quotePath`, identically on both the `git show` and
  `git diff` sides, so the comparison stays symmetric — `core.quotePath` is deliberately left alone
  to preserve that symmetry, and this repo has zero tracked paths git would quote.
- The `#4109` word-splitting idiom note on the hash loop.

Then UPDATE `#4666` — do NOT delete it, and do NOT touch its measured before/after table or its
"this is a scope-token match, not the banned prose grep" paragraph. Append a supersession line to
the paragraph that currently ends with the union being "filed as a residual todo by quick task
260930-ivj, not implemented here": record that `#4667` below implemented that union and made it the
primary scope; that the range computed here is retained as the visible safety net and as the empty-
union fallback; and that the "not implemented here" sentence is historically accurate for
`260930-ivj` and is left standing on purpose.

Reproduce the two remaining probe rows and the non-clamping evidence as this task's gates (phase 41
was Task 1's tracer). Touch nothing but comment text in this task.
  </action>
  <verify>
    <automated>
F="$HOME/.claude/gsd-core/workflows/code-review.md"
SNAP="$SCRATCH/code-review.pristine.md"

# G10 — the number was free in the three install trees at edit time. Positive control FIRST: the
# identical recursive search for #4666 must find the ONE file ivj patched, so a mistyped path or a
# silently-failing `grep -r` cannot make the #4667 zero below pass vacuously.
for d in "$HOME/.claude/gsd-core" "$HOME/.claude/gsd-pristine" "$HOME/.claude/gsd-local-patches"; do
  test -d "$d" || echo "MISSING TREE: $d"
done
CTL=$(/usr/bin/grep -rlE '#4666([^0-9]|$)' "$HOME/.claude/gsd-core" "$HOME/.claude/gsd-pristine" \
  "$HOME/.claude/gsd-local-patches" 2>/dev/null)
test "$(printf '%s\n' "$CTL" | /usr/bin/grep -c .)" -ge 1   # control: the search mechanism works
HITS=$(/usr/bin/grep -rlE '#4667([^0-9]|$)' "$HOME/.claude/gsd-core" "$HOME/.claude/gsd-pristine" \
  "$HOME/.claude/gsd-local-patches" 2>/dev/null | /usr/bin/grep -v 'workflows/code-review\.md')
test "$(printf '%s\n' "$HITS" | /usr/bin/grep -c .)" = 0   # nobody else uses #4667

# G11 — #4667 present and carries the load-bearing facts. Every assertion here is a PRESENCE check
# on prose, so it cannot be self-invalidated by a comment (CLAUDE.md's `== 0` grep trap needs an
# absence assertion); bare small integers are NOT used as gates because "9" matches anywhere.
/usr/bin/grep -cE '#4667' "$F"   # expect >= 1
for lit in '260930-juy' 'no upstream' 'not clamped' 'range fallback' 'merge' 'core.quotePath' '#4109'; do
  /usr/bin/grep -c -i -F -- "$lit" "$F"   # each >= 1
done
# The table must be present as ROWS, not as loose digits — each probe's own figure triple, matched
# as one line so a stray occurrence of "42" elsewhere cannot satisfy it. Adapt the separator to
# however the row is actually written; the requirement is that all three figures share a line.
/usr/bin/grep -cE '(^|[^0-9])23([^0-9].*)9([^0-9].*)14([^0-9]|$)'    "$F"   # phase 41  row >= 1
/usr/bin/grep -cE '(^|[^0-9])194([^0-9].*)42([^0-9].*)154([^0-9]|$)' "$F"   # phase 34.6 row >= 1
/usr/bin/grep -cE '(^|[^0-9])602([^0-9].*)69([^0-9].*)534([^0-9]|$)' "$F"   # phase 42  row >= 1
/usr/bin/grep -c -F '117' "$F"   # >= 1: the measured cost's commit count

# G12 — #4666 UPDATED, not deleted: its table and its anti-regression paragraph byte-intact.
for lit in 'phase 41    625 -> 23' 'phase 34.6 1040 -> 194' 'phase 42    604 -> 602' \
           'not the free-prose' 'banned prose grep' '260930-ivj'; do
  diff <(/usr/bin/grep -c -F -- "$lit" "$F") <(/usr/bin/grep -c -F -- "$lit" "$SNAP")  # counts must match SNAP
done
/usr/bin/grep -c -i 'supersed' "$F"   # expect >= 1 (the new supersession line); 0 in SNAP

# G13 — all six prior comments survive with unchanged occurrence counts.
for n in 3503 2989 3191 3995 3661 4460 4109; do
  A=$(/usr/bin/grep -cE "#$n([^0-9]|$)" "$F"); B=$(/usr/bin/grep -cE "#$n([^0-9]|$)" "$SNAP")
  test "$A" = "$B" || echo "REGRESSION on #$n: $A vs $B"
done

# G14 — expansion probes: reproduce the two remaining rows and the non-clamping evidence, both via
# the probe harness AND via Task 1's run_live extraction against the shipped text.
P=.planning/quick/260930-juy-scope-code-review-by-commit-scope-union/probe-union.sh
/bin/bash "$P" '34\.6' 21d6c5f94 d1829d3fb  # expect range=194 union=42 range_minus_union=154 union_minus_range=2
/bin/bash "$P" '42'    f60e8ad91 ee46df158  # expect range=602 union=69 range_minus_union=534 union_minus_range=1

# G15 — COST CHECK, recorded not hidden. Time the union path on the worst case (34.6, 117 commits)
# against the single range diff. Report the delta in the SUMMARY whatever it is; if the union
# exceeds ~5s, SAY SO and note the batched-git-show remedy rather than quietly shipping it.
time /bin/bash "$P" '34\.6' 21d6c5f94 d1829d3fb >/dev/null
time git diff --name-only "21d6c5f94..d1829d3fb" -- . ':!.planning/' ':!ROADMAP.md' ':!STATE.md' \
  ':!*-SUMMARY.md' ':!*-VERIFICATION.md' ':!*-PLAN.md' ':!package-lock.json' ':!yarn.lock' \
  ':!Gemfile.lock' ':!poetry.lock' >/dev/null

# G16 — comment-only task: no executable line changed. Diff SNAP against the live file and confirm
# every added/removed non-comment, non-blank line belongs to Task 1's hunks, not this task's.
diff "$SNAP" "$F" | /usr/bin/grep '^[<>]' | /usr/bin/grep -vc '^[<>] *#'   # inspect; Task 2 adds none

# NO PRETTIER CHECK — the only file this task writes is the out-of-repo workflow file. Same
# reasoning as Task 1: a `--check` over it would be vacuous, so it is omitted rather than carried.
    </automated>
  </verify>
  <done>`#4667` exists under a number verified free in all three install trees, carrying the full measured table with the range∖union and union∖range columns, the no-upstream-issue framing, the safety finding, the non-clamping decision, the widened fallback trigger, the measured cost with the unimplemented batching remedy named, and both residuals. `#4666` is updated with a supersession line, its table and anti-regression paragraph byte-identical to the snapshot. All seven prior comment tags have unchanged occurrence counts. The 34.6 and 42 rows reproduce from both the harness and the shipped text, including union∖range 2 and 1.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo in one pathspec, record the upgrade trap, run the gates</name>
  <files>.planning/todos/pending/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md, .planning/todos/completed/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md, .planning/quick/260930-juy-scope-code-review-by-commit-scope-union/probe-union.sh</files>
  <action>
`git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/`.

**Stage and commit the rename's SOURCE and DESTINATION in the SAME pathspec.** `260930-ivj` split
exactly this rename across two commits (`9eb52c388` then `7e3394a24`) because its pathspec named
only the destination, so `git commit -- <pathspec>` committed the add side and left the
pending-side deletion staged. The commit's pathspec must list BOTH the `pending/` path and the
`completed/` path, plus `probe-union.sh`. Verify with `git status --porcelain` afterwards that no
`D` on the old pending path survives, and that the old path is gone from disk.

Record in the SUMMARY, as findings and not as decoration:

- The **exact** diff size, computed from the pristine snapshot
  (`diff "$SNAP" "$F" | wc -l`, plus added/removed line counts). `260930-ivj` had to report an
  estimate because it kept no snapshot; this task has one, so report a measured number.
- The **cost delta** from G15 verbatim — union wall time vs range wall time on phase 34.6 — and
  whether it exceeded 5s. If it did, name the batched `git show` remedy and state it is not
  implemented.
- The **upgrade trap**, re-stated and re-measured, not copied: the live file's sha256 already
  diverges from `$HOME/.claude/gsd-file-manifest.json`'s pristine hash
  (`8c4f74ce02a47cb918f9651204a5179e243ccc4b25b190161ee6ba980d6cc2f9`) because of `260930-ivj`, and
  this task's edit diverges it further. Re-probe both the manifest entry and
  `$HOME/.claude/gsd-local-patches/backup-meta.json` live and report what each actually says.
  `/gsd-update --reapply` is a **MANUAL** step nobody runs automatically; until it runs, an upgrade
  silently reverts this fix and the mis-scoping regresses. **Nothing in this task exercises the
  installer's local-modification/parking detector** — say that plainly rather than implying the
  parking is demonstrated.
- The **remaining step, as a remaining step**: the durable fix is an upstream report against
  `@opengsd/gsd-core`. None was filed and `/gsd-update` was not run — both out of scope by
  constraint, both still open.
- Which gates were **vacuous** (passed against the pristine snapshot). Report them as vacuous, not
  as assurance.
- Any probe figure that disagreed with `<measured_baseline>`, with BOTH numbers and the command.

Do not commit the workflow file: it is outside this repository, cannot be added, and no git repo is
to be created at `$HOME/.claude`. Do not run `/gsd-update`. Do not open an upstream issue. Do not
touch this repo's `src/`.
  </action>
  <verify>
    <automated>
# G17 — the rename landed as ONE commit, both sides.
# The two `test -f` checks are the R4-safe half: they touch the filesystem, not a git pipeline.
test ! -f .planning/todos/pending/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md
test -f .planning/todos/completed/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md
# R4: capture git's status before asserting a zero count through a pipeline.
ST=$(git status --porcelain); test $? -eq 0
test "$(printf '%s\n' "$ST" | /usr/bin/grep -c 'todos/pending/2026-09-30-code-review-anchor')" = 0
git log -1 --name-status --format= | /usr/bin/grep -c '^R'   # expect >= 1: the rename recorded as R in ONE commit

# G18 — planning gates (the todo's severity/platform/ready frontmatter, envelope tags, floor of 12).
pnpm planning-gates

# G19 + G20 — src/ untouched, and the out-of-repo workflow file never staged. Both are zero-count
# assertions through a git pipeline, so reuse the status-captured $ST from G17 (R4) and pair them
# with a positive control proving the pipeline sees the task's OWN changes.
test "$(printf '%s\n' "$ST" | /usr/bin/grep -c '^...src/')" = 0
test "$(printf '%s\n' "$ST" | /usr/bin/grep -c 'code-review\.md')" = 0
test "$(git status --porcelain --untracked-files=all .planning/quick/260930-juy-scope-code-review-by-commit-scope-union/ \
  | /usr/bin/grep -c .)" -ge 1   # positive control: the pipeline is alive and sees this task's files

# G21 — upgrade-trap premises re-probed LIVE, not copied from the ivj SUMMARY.
shasum -a 256 "$HOME/.claude/gsd-core/workflows/code-review.md"
/usr/bin/grep -o '"gsd-core/workflows/code-review.md"[^}]*' "$HOME/.claude/gsd-file-manifest.json" | head -1
/usr/bin/grep -c 'code-review' "$HOME/.claude/gsd-local-patches/backup-meta.json"   # report whatever it is

# G22 — exact diff size against the pristine snapshot (replaces ivj's estimate).
diff "$SCRATCH/code-review.pristine.md" "$HOME/.claude/gsd-core/workflows/code-review.md" | wc -l
diff "$SCRATCH/code-review.pristine.md" "$HOME/.claude/gsd-core/workflows/code-review.md" \
  | /usr/bin/grep -c '^>'
diff "$SCRATCH/code-review.pristine.md" "$HOME/.claude/gsd-core/workflows/code-review.md" \
  | /usr/bin/grep -c '^<'

# NO PRETTIER CHECK — both in-repo paths written here are prettier-ignored. Re-probe to prove the
# premise rather than asserting it, matching space-tolerantly:
npx prettier --file-info .planning/todos/completed/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md \
  | /usr/bin/grep -Eq '"ignored":[[:space:]]*true'
npx prettier --file-info .planning/quick/260930-juy-scope-code-review-by-commit-scope-union/probe-union.sh \
  | /usr/bin/grep -Eq '"ignored":[[:space:]]*true|"inferredParser":[[:space:]]*null'
# Per CLAUDE.md a `--check` over an ignored path exits 0 having matched zero files, output identical
# to a real pass — so the check itself is omitted deliberately, and this is the proof of the premise.
    </automated>
  </verify>
  <done>The todo lives only in `completed/`, its rename recorded as a single `R` in one commit with no leftover staged deletion. `pnpm planning-gates` passes. `src/` and the out-of-repo workflow file are both absent from git status. The SUMMARY carries the exact measured diff size, the cost delta, the live-re-probed upgrade-trap facts with reapply stated as MANUAL and the parking detector stated as unexercised, the upstream report named as a REMAINING step, and an explicit list of any vacuous gates.</done>
  <reversibility rating="reversible">One `git mv` and one commit on planning artifacts; `git revert` undoes it.</reversibility>
</task>

</tasks>

<source_audit>
## Coverage Audit

This is a quick task, so three of the four source types do not exist: there is no ROADMAP phase
**Goal** line, no `phase_req_ids` in REQUIREMENTS.md, and no phase RESEARCH.md. Stated rather than
faked. The two real sources are the **TODO** being actioned and the orchestrator's **locked
decisions**, numbered D-01…D-05 here to match their order in the dispatch.

| # | Source item | Covered by | Status |
|---|-------------|-----------|--------|
| TODO | union-of-scoped-commits replaces/alternates with the range diff, generalized past hardcoded `42`, reusing ivj's `DIFF_HEAD_ALT` regex and iterating matches instead of `head -1` | Task 1 | COVERED |
| TODO | "needs its own measurement pass across phase 41, 34.6, and 42 before shipping" | `<measured_baseline>` (done pre-dispatch, reproduced at plan time) + Tasks 1–2 gates | COVERED |
| TODO | cost profile (N `git show` vs one `git diff`) unverified | G15, recorded in `#4667` | COVERED |
| TODO | edge case: a scoped commit inside a repo-wide sweep pollutes the union | `<safety_finding>` + the printed drop list; measured harmless on phase 41 | COVERED |
| D-01 | the union becomes the PRIMARY scope, reusing `DIFF_HEAD_ALT`, with the exclusion set applied explicitly because `git show --name-only` does not take those pathspecs | Task 1 | COVERED |
| D-02 | the range is retained as a VISIBLE safety net — printed by name, then excluded; rationale written into the comment | Task 1 (steps 4, 7, 8) + Task 2 (`#4667` rationale) | COVERED |
| D-03 | strictly ordered fallback; an empty union never yields an empty scope; phase 45 is the probe | Task 1 step 5 + gate G3 | COVERED |
| D-04 | do NOT clamp the union to the range window | Task 1 (no clamp is implemented) + G14's `union_minus_range` 2/1 + `#4667` | COVERED |
| D-05 | comment discipline: six prior comments untouched, `#4666` UPDATED not deleted, next unused number, LOCAL-patch framing, full table recorded | Task 2 + gates G10–G13 | COVERED |
| CONSTRAINT | out-of-repo file, no commit, no repo at `$HOME/.claude`; upgrade trap re-stated | Task 3 + G20/G21 | COVERED |
| CONSTRAINT | bash 3.2, `/usr/bin/grep`, explicit `/bin/bash`, `#4109` trap | `<context>` + Task 1 + G8 | COVERED |
| CONSTRAINT | close the todo with source AND destination in ONE pathspec | Task 3 + G17 | COVERED |
| CONSTRAINT | no upstream issue, no `/gsd-update`; record as remaining step | Task 3 | COVERED |
| CONSTRAINT | do not touch `src/` | Task 3 + G19 | COVERED |
| VERIFY | reproduce 9/42/69 and 14/154/534 | G2, G14 | COVERED |
| VERIFY | phase-45 empty-union fallback yields the range, not an empty scope | G3 | COVERED |
| VERIFY | the warning PRINTS paths, not just counts | G4 | COVERED |
| VERIFY | negative control against the unmodified file; report vacuous gates | snapshot at Task 1 start; G1/G2/G3/G6/G12/G13 all snapshot-relative; Task 3 reports vacuity | COVERED |
| VERIFY | `pnpm planning-gates` passes | G18 | COVERED |
| VERIFY | NO prettier check, said explicitly rather than carried vacuously | every task's verify block, premise re-probed in G-final | COVERED |

**No item is MISSING.** Nothing is deferred and no phase split is needed: the whole change is one
bash block in one file, measured at ~1.15s worst-case runtime cost and well inside one agent's
context.
</source_audit>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| phase argument → `grep -E` pattern | `PADDED_PHASE` / `PHASE_NUMBER` reach a regex via `DIFF_HEAD_ALT` |
| commit subject → scope-token predicate | commit subjects are repo content, not necessarily authored locally |
| `git show --name-only` stdout → shell array | path bytes become elements of `REVIEW_FILES` |

## STRIDE Threat Register

ASVS level 1, block on `high`. This surface is small and mostly inherited — said plainly rather
than inflated. Threat IDs continue from `#4666`'s task; no prior PLAN exists in this quick
directory, so numbering starts at 01.

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-JUY-01 | Tampering | the phase argument reaching the new union grep via `DIFF_HEAD_ALT` | low | accept | Inherited, not new. `PADDED_PHASE` is grammar-validated at `<step name="initialize">` against `^[0-9]+[A-Z]?(\.[0-9]+)*$`, and the pattern reaches `grep -E` as a single quoted argv element — never `eval`, never a subshell string. `#4666` already records this for the identical alternation; this task reuses `DIFF_HEAD_ALT` verbatim and adds no new interpolation point. |
| T-JUY-02 | Tampering | `git show --name-only` stdout interpolated into `REVIEW_FILES` | medium | mitigate | **The realistic risk, and it is correctness not injection.** A path containing whitespace or a glob character splits or expands if consumed by a bare `for f in $VAR`. Mitigated structurally: paths are only ever consumed via `while IFS= read -r`, emitted via `printf '%s\n' "${ARR[@]}"`, and matched via `grep -Fxq --`. Word-splitting is applied ONLY to the commit-hash list, whose elements are hex and cannot contain whitespace. Gate G9 proves it on a synthetic fixture, because this repo's only space-containing tracked path (`.planning/UAT Log.md`) is dropped by the exclusion filter and so cannot exercise it. |
| T-JUY-03 | Tampering | a crafted commit subject adding a false scope tag | low | accept | A forged `feat(41):` subject pulls unrelated files INTO the review scope. Over-collecting into a review is not a security failure: the reviewer reads files, it does not execute them, and the scope only ever grows toward today's behaviour. The operator reviews their own checkout. Under-collecting is the failure this task guards, via the printed drop list. |
| T-JUY-04 | Information disclosure | the drop warning printing repo-relative paths | low | accept | Paths go to the operator's own console in their own checkout — identical in kind to the adjacent `#2666` and `#4666` warnings already in this step. No path content, no credentials, no absolute home paths beyond what `git diff` already prints. |
| T-JUY-05 | Repudiation | a scope-tagged **merge** commit contributing nothing to the union | low | accept | `git show --name-only` emits no names for a merge by default, so a scope-tagged merge silently contributes zero files. Measured: zero scope-tagged merges across phases 41, 34.6 and 42, so this is **unexercised rather than proven harmless**. The range safety net prints anything the union misses, which is the control. Recorded as a named residual in `#4667`, not fixed. |
| T-JUY-SC | Tampering | npm/pip/cargo installs | high | mitigate | **Not applicable to this task: it installs nothing.** No package-manager install task exists in this plan, so no `## Package Legitimacy Audit` is required and no legitimacy checkpoint is inserted. The row is retained per template rather than dropped, so a reader can see the question was asked and answered rather than skipped. `pnpm planning-gates` in G18 runs only existing in-repo tooling. |
</threat_model>

<verification>
1. Every gate G1–G22 runs against the **pristine snapshot first** as a negative control. Any gate
   that passes pre-fix is VACUOUS and is reported as vacuous in the SUMMARY, not counted.
2. All three union figures (**9 / 42 / 69**) and all three range∖union figures
   (**14 / 154 / 534**) reproduce — from the SHIPPED FILE TEXT via the extracted-function harness
   (G2/G14), with the standalone probe as an independent cross-check only.
3. The empty-union fallback on **phase 45** yields the range and a NON-EMPTY scope (G3). This is the
   single most important gate in the plan: an empty scope means reviewing nothing.
4. The warning PRINTS the dropped paths by name, proven by matching real paths from the phase-41
   drop set, not by counting header lines (G4).
5. `#4666` and the six prior comments survive with unchanged occurrence counts (G12/G13).
6. Cost delta measured and recorded whatever it is (G15).
7. `pnpm planning-gates` passes (G18); `src/` untouched (G19); the out-of-repo file never staged (G20).
8. **No prettier check anywhere**, stated in each task's verify block with the premise re-probed
   live and matched space-tolerantly — not omitted silently, and not carried as a vacuous green.
</verification>

<success_criteria>
- `/gsd-code-review <phase>`'s git-derived scope is the union of that phase's own scope-tagged
  commits whenever that union is non-empty, at both diff consumption sites.
- Every file the range carried and the union does not is printed by name before exclusion.
- A phase with no scope-tagged commit carrying a reviewable file still gets a non-empty scope.
- `#4667` records the mechanism, the full measured table, the cost, the safety finding, the
  non-clamping decision and both residuals; `#4666` is updated, not deleted.
- The todo is closed by a single-commit rename; `pnpm planning-gates` passes.
- The SUMMARY states the upgrade trap, the manual `--reapply` step, the unexercised parking
  detector, and the unfiled upstream report as remaining work.
</success_criteria>

<output>
Create `.planning/quick/260930-juy-scope-code-review-by-commit-scope-union/260930-juy-SUMMARY.md` when done
</output>
