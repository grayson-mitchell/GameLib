---
phase: quick-260930-ivj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - $HOME/.claude/gsd-core/workflows/code-review.md
  - .planning/todos/pending/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md
  - .planning/todos/completed/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md
autonomous: true
requirements:
  - IVJ-01 # D-01 DIFF_HEAD anchor bounds both diff sites at the phase's end
  - IVJ-02 # D-02 deleted-file filter prints the paths it drops
  - IVJ-03 # D-03 DIFF_HEAD surfaced in report metadata
  - IVJ-04 # upgrade-trap finding stated honestly; todo closed
estimate:
  tokens: 84000
  raw_tokens: 42000
  tasks: 3
  confidence: low # derived: zero calibration samples for out-of-repo workflow edits
must_haves:
  truths:
    - "Per D-01: both diff sites in compute_file_scope bound the range at the phase's newest scope-tagged commit, not HEAD."
    - "Per D-01: a phase with no scope-tagged commit still reviews exactly as it does today (DIFF_HEAD falls back to HEAD)."
    - "Per D-01: scope (4) never anchors phase 42, scope (42) never anchors phase 4, and decimal phase 34.6 resolves its own anchor."
    - "Per D-02: the deleted-file filter names every path it drops, so a phase whose deliverable was later deleted is visible."
    - "Per D-03: diff_head appears beside diff_base in the reviewer's config block."
    - "The new numbered comment records the measured numbers and explicitly distinguishes itself from the prose grep #3503/#3995 banned."
  artifacts:
    - $HOME/.claude/gsd-core/workflows/code-review.md
    - .planning/todos/completed/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md
    - .planning/quick/260930-ivj-bound-code-review-scope-to-phase-end/260930-ivj-SUMMARY.md
  key_links:
    - "DIFF_HEAD is computed AFTER DIFF_BASE and BEFORE the first diff site, so both sites see it."
    - "The #3661 LAST_REVIEW_COMMIT path can make DIFF_BASE newer than DIFF_HEAD; the ancestor guard prevents a reversed range."
    - "PADDED_PHASE's existing grammar validation is what keeps shell metacharacters out of the new regex."
---

<objective>
Bound `/gsd-code-review`'s file scope at the reviewed phase's END rather than at `HEAD`, name the
deleted files the scope filter currently discards silently, and surface the new upper bound in the
review's own metadata.

Purpose: reviewing a phase that closed weeks ago currently sweeps in every commit made since,
across unrelated phases. Measured on this repo at plan time (2026-09-30): phase 41 scopes **625**
files where the phase's own end yields **23**; phase 34.6 scopes **1040** where its end yields
**194**. Past 50 files `code-review-depth.cjs` silently downgrades `deep` to `standard`, so the
mis-scope also defeats the depth the operator asked for, and blames "large file count" for it.

Output: an edited workflow file outside this repo, a closed todo, and a SUMMARY carrying the
upgrade-trap finding and the remaining upstream step.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md

Read before editing — the region you are changing and the region you must NOT change:
@~/.claude/gsd-core/workflows/code-review.md
</context>

<measurement_authority>
**Every number below was measured at plan time, 2026-09-30, on this checkout.** Git history and
`HEAD` are mutable: if a probe disagrees, re-derive it with the command given and record BOTH
numbers in the SUMMARY rather than editing the target to fit.

Shared exclusion list (identical to the diff sites being edited):

```bash
EX=(':!.planning/' ':!ROADMAP.md' ':!STATE.md' ':!*-SUMMARY.md' ':!*-VERIFICATION.md' \
    ':!*-PLAN.md' ':!package-lock.json' ':!yarn.lock' ':!Gemfile.lock' ':!poetry.lock')
```

| probe | DIFF_BASE | before (bound at HEAD) | after (bound at anchor) | anchor |
| ----- | --------- | ---------------------- | ----------------------- | ------ |
| phase 41 | `3ecd7b0b1` | 625 | **23** | `de4aa7250` 2026-09-06 |
| phase 34.6 | `21d6c5f94` | 1040 | **194** | `d1829d3fb` 2026-08-26 |
| phase 42 | `f60e8ad91` | 604 | **602** | `ee46df158` 2026-09-30 |
| phase 45 | — | 426 | **426** (inert by design) | none → `HEAD` |

**READ THIS BEFORE SCORING PHASE 42 — the originating todo's `590 → 66` is NOT this mechanism's
number, and the plan does not ask you to reproduce it.** The todo's 66 (69 before the
`.planning/` filter) is the **union of each `(42)`-scoped commit's own file set** — the snippet in
its "Workaround" section — which is a *different algorithm* from bounding a `..` range. A range
still contains every interleaved commit between base and anchor. Re-measured at plan time: the
union method yields 95 paths, 69 after dropping `.planning/`; the anchored range yields 602.

Phase 42 is additionally a **poisoned probe**: it received fresh `(42)`-scoped commits on
2026-09-30 (`fbdd294bd docs(42): add code review report`, `f7a013b06 fix(42): IN-01 …`,
`ee46df158 docs(42): add code review fix report`) from the very investigation that found this
defect, so its newest scoped commit is ~`HEAD` and the anchor has almost nothing to bite on.
Phase 41 (625 → 23) and phase 34.6 (1040 → 194) are the probes that demonstrate the fix; phase 42
is recorded as the honest counter-case.

Phase 42 also now has a `42-REVIEW.md`, so a live re-run takes the `#3661` path
(`DIFF_BASE=LAST_REVIEW_COMMIT`) and cannot reproduce 604 at all. The probe commands below force
the first-review path by pinning `DIFF_BASE` explicitly.
</measurement_authority>

<tasks>

<task type="tracer">
  <name>Task 1: Anchor both diff sites at the phase's end, end-to-end</name>
  <files>$HOME/.claude/gsd-core/workflows/code-review.md</files>
  <precondition>`$HOME/.claude/gsd-core/workflows/code-review.md` hashes to `8c4f74ce02a47cb918f9651204a5179e243ccc4b25b190161ee6ba980d6cc2f9` (`shasum -a 256`). A different hash means the install moved under you — re-locate the two diff sites by name before editing, and record the new hash in the SUMMARY.</precondition>
  <action>
In the `<step name="compute_file_scope">` block, insert a `DIFF_HEAD` computation immediately AFTER
the existing `DIFF_BASE` if/elif/fi chain closes and BEFORE the `if [ ${#REVIEW_FILES[@]} -eq 0 ]`
line that opens the Tier-3 fallback. Both diff sites must see it, so placement between those two
points is load-bearing.

Per D-01, `DIFF_HEAD` is the newest commit whose SUBJECT carries a conventional-commit scope for
the phase under review. Build it as: escape `.` in both `PADDED_PHASE` and `PHASE_NUMBER` via
`sed 's/\./\\./g'` (an unescaped ERE dot makes scope `(3416)` match phase `34.6`); collapse the two
spellings to one alternation when they are equal; then `git log --format="%H %s"` piped to
`grep -E` with the scope pattern, `head -1`, `cut -d' ' -f1`. The pattern accepts an optional
`phase-` prefix and an optional `!` before the colon, and closes the scope token at either `)` or
`-NN)` so a shorter number cannot prefix-match a longer one.

Then two guards, both resolving to `HEAD`:
  1. Empty grep result — per D-01 the fallback is `HEAD`, preserving today's behaviour exactly for
     an in-flight phase or a project not using conventional commits.
  2. Anchor not a descendant of `DIFF_BASE`, tested with `git merge-base --is-ancestor`. The `#3661`
     path can set `DIFF_BASE` to a `LAST_REVIEW_COMMIT` newer than the newest scoped commit, and
     `git diff A..B` with B an ancestor of A emits the REVERSE diff — silently non-empty (measured
     at plan time: 489 files for `HEAD..HEAD~40`). Falling back beats inverting the scope.

Replace the hardcoded upper bound at BOTH diff sites — the Tier-3 full fallback and the `#2666`
SUMMARY/diff cross-check — with `"${DIFF_BASE}..${DIFF_HEAD}"`. Leave every pathspec exclusion,
every surrounding guard, and the `#4460` `FILES_OVERRIDE` gate exactly as they are. Extend the
Tier-3 `File scope: … from git diff (base: …)` echo to also print the head.

Add a new comment numbered `#4666` — the next unused number after the file's own highest (`#4665`),
and unused anywhere else in the install (verified at plan time). Mark it plainly as a LOCAL patch
from quick task `260930-ivj` with no upstream issue filed, so a reader does not go hunting for a
gsd-core issue that does not exist. The comment MUST carry all four of:
  - That this is a subject-line conventional-commit **SCOPE TOKEN** match, which is the class
    `#3503` moved *to*; it is NOT the free-prose `[Pp]hase N` match that `#2989`/`#3191` used and
    that `#3995` removed from the base computation. Say explicitly: do not "fix" this back to a
    bare `HEAD` bound believing it is the banned grep — it is a different predicate, and the prose
    forms cannot match this pattern at all.
  - The measured table from the plan's "Measurement authority" section, including 604 → 602
    AND the reason (re-touched the same day), AND that the report's `590 → 66` came from the
    union-of-scoped-commits algorithm, not from bounding a range.
  - The residual, stated plainly: a range still contains every interleaved commit between base and
    anchor, so this narrows the window and does not make the scope per-phase exact.
  - The `HEAD` fallback, the padded/unpadded acceptance (citing `#3503`), the escaped decimal dot,
    the `)`/`-NN)` anchoring, POSIX-ERE-only per `#3191`, and that `PADDED_PHASE` is already
    grammar-validated upstream in this workflow so no shell metacharacter can reach the regex.

Do NOT touch the `#3503`, `#2989`/`#3191`, `#3995`, `#3661` or `#4460` comments. Bash 3.2 is the
system shell on macOS: no associative arrays, no `mapfile`, no `${var^^}`.
  </action>
  <verify>
    <automated>
# G1 — both diff sites carry the anchored range; the HEAD-bound form is gone from live code
# (comment lines stripped first: the new #4666 comment discusses the old behaviour in prose).
F="$HOME/.claude/gsd-core/workflows/code-review.md"
test "$(grep -c -F '${DIFF_BASE}..${DIFF_HEAD}' "$F")" = 2 || { echo "G1a FAIL: anchored range not at exactly 2 sites"; exit 1; }
test "$(grep -v '^[[:space:]]*#' "$F" | grep -c -F '${DIFF_BASE}..HEAD')" = 0 || { echo "G1b FAIL: HEAD-bound range still live"; exit 1; }
test "$(grep -v '^[[:space:]]*#' "$F" | grep -c 'DIFF_HEAD="HEAD"')" -ge 2 || { echo "G1c FAIL: both HEAD fallbacks absent"; exit 1; }
test "$(grep -c -F 'merge-base --is-ancestor' "$F")" -ge 1 || { echo "G1d FAIL: ancestor guard absent"; exit 1; }
# G2 — the new comment exists, is marked local, and the banned-grep distinction is written down
test "$(grep -c '#4666' "$F")" -ge 1 || { echo "G2a FAIL: #4666 comment absent"; exit 1; }
grep -q '260930-ivj' "$F" || { echo "G2b FAIL: local-patch provenance absent"; exit 1; }
grep -q '604' "$F" && grep -q '625' "$F" || { echo "G2c FAIL: measured numbers not recorded"; exit 1; }
# G3 — the pre-existing comments #3503 / #3995 survive untouched
for n in 3503 2989 3191 3995 3661 4460; do grep -q "#$n" "$F" || { echo "G3 FAIL: #$n comment lost"; exit 1; }; done
echo "G1-G3 PASS"
    </automated>
    <automated>
# G4 — MEASURED PROBES, first-review path forced by pinning DIFF_BASE. Run from the checkout root.
# Numbers pinned 2026-09-30; if any differs, record BOTH in the SUMMARY (see measurement_authority).
/bin/bash -c '
EX=(":!.planning/" ":!ROADMAP.md" ":!STATE.md" ":!*-SUMMARY.md" ":!*-VERIFICATION.md" ":!*-PLAN.md" ":!package-lock.json" ":!yarn.lock" ":!Gemfile.lock" ":!poetry.lock")
anchor() { P=$(printf "%s" "$1" | sed "s/\./\\\\./g"); U=$(printf "%s" "$2" | sed "s/\./\\\\./g")
  if [ "$P" = "$U" ]; then A="$P"; else A="${P}|${U}"; fi
  git log --format="%H %s" | /usr/bin/grep -E "^[0-9a-f]+ [a-z]+\((phase-)?(${A})(-[0-9]+)?\)!?:" | head -1 | cut -d" " -f1; }
cnt() { git diff --name-only "$1..$2" -- . "${EX[@]}" 2>/dev/null | sed "/^$/d" | sort -u | wc -l | tr -d " "; }
probe() { DH=$(anchor "$1" "$2"); [ -z "$DH" ] && DH=HEAD
  echo "phase $2: before=$(cnt "$3" HEAD) after=$(cnt "$3" "$DH") anchor=$(git rev-parse --short "$DH")"; }
probe 41 41 3ecd7b0b1        # expect before=625 after=23
probe 34.6 34.6 21d6c5f94    # expect before=1040 after=194
probe 42 42 f60e8ad91        # expect before=604 after=602 (poisoned probe, see plan)
# fallback probe: phase 45 has a real phase dir and ZERO scope-tagged commits
test -z "$(anchor 45 45)" && echo "phase 45: no scoped commit -> DIFF_HEAD=HEAD (change is inert)" || { echo "FAIL: phase 45 unexpectedly has a scoped commit"; exit 1; }
'
    </automated>
    <automated>
# G5 — NEAR-MISS isolation, on system bash 3.2 with BSD grep (not the shell alias).
/bin/bash -c '
T=$(mktemp -t ivjscope); trap "rm -f $T" EXIT
printf "%s\n" "aaaaaa1 feat(4): unrelated phase four work" "bbbbbb2 feat(42): phase forty-two" \
  "cccccc3 feat(42-08): plan eight" "dddddd4 feat(420): four-twenty" \
  "eeeeee5 feat(3416): not a decimal" "ffffff6 feat(34.6): real decimal" \
  "abc1234 docs(phase-42): mark complete" "abc1235 feat(42)!: breaking" > "$T"
m() { P=$(printf "%s" "$1" | sed "s/\./\\\\./g"); U=$(printf "%s" "$2" | sed "s/\./\\\\./g")
  if [ "$P" = "$U" ]; then A="$P"; else A="${P}|${U}"; fi
  /usr/bin/grep -cE "^[0-9a-f]+ [a-z]+\((phase-)?(${A})(-[0-9]+)?\)!?:" "$T"; }
test "$(m 42 42)" = 4 || { echo "FAIL phase42: expected 4 matches (42, 42-08, phase-42, 42!), got $(m 42 42)"; exit 1; }
test "$(m 04 4)"  = 1 || { echo "FAIL phase4: (4) only; (42)/(42-08)/(420) must not match, got $(m 04 4)"; exit 1; }
test "$(m 34.6 34.6)" = 1 || { echo "FAIL phase34.6: (34.6) only; (3416) must not match, got $(m 34.6 34.6)"; exit 1; }
echo "G5 PASS: near-miss isolation holds on bash $BASH_VERSION"
'
    </automated>
    <human-check>Not required — every assertion above is automated.</human-check>
  </verify>
  <done>Both diff sites bound the range at `${DIFF_HEAD}`; the empty-grep and non-ancestor fallbacks both resolve to `HEAD`; the `#4666` comment carries the banned-grep distinction, the measured table, the residual and the fallback; `#3503`/`#3995` and the other four prior comments are byte-unchanged; G1-G5 all pass.</done>
  <reversibility rating="reversible">A markdown workflow edit outside the repo; revert by restoring the pristine file from the npm tarball or re-running the installer.</reversibility>
</task>

<task type="auto">
  <name>Task 2: Name the dropped files; surface the anchor in report metadata</name>
  <files>$HOME/.claude/gsd-core/workflows/code-review.md</files>
  <action>
Per D-02, in post-processing step 3 ("Filter deleted files") of `compute_file_scope`, replace the
bare `DELETED_COUNT` integer with a `DELETED_FILES=()` array, push each absent path onto it, and
under the existing `-gt 0` guard print a header line followed by every dropped path using the
file's own established idiom `printf '  - %s\n' "${ARR[@]}"` (the same shape the `#2666` block
already uses for `MISSING_FROM_SUMMARY`). Keep the count in the header line so existing readers
still see it. Guard on the array length, not on a separate counter.

Attach a `#4666` note recording WHY: on GameLib phase 42 this step silently dropped
`src/frontend/screens/Humble/Keys/All/index.tsx`, its sibling test, and
`src/frontend/components/HumbleKeyGroup/index.tsx` — the three files holding plan 42-06's entire
deliverable, deleted afterwards by `edec139bd` under phase 43. All three are confirmed absent from
disk at plan time. A phase whose deliverable was later deleted is a finding, not noise.

Per D-03, in the `<config>` block of the `Agent(subagent_type="gsd-code-reviewer", …)` dispatch,
add a `diff_head` line directly beneath the existing `diff_base` line, matching that line's
conditional-emit idiom exactly (`${VAR:+key: ${VAR}}`) so an unset value emits nothing rather than
an empty key.

Bash 3.2: no associative arrays, no `mapfile`.
  </action>
  <verify>
    <automated>
F="$HOME/.claude/gsd-core/workflows/code-review.md"
# D-02: array replaces the bare counter, and the paths are printed
test "$(grep -c 'DELETED_FILES' "$F")" -ge 3 || { echo "FAIL: DELETED_FILES array not wired (need decl + push + print)"; exit 1; }
test "$(grep -v '^[[:space:]]*#' "$F" | grep -c 'DELETED_COUNT')" = 0 || { echo "FAIL: bare DELETED_COUNT counter still live"; exit 1; }
grep -q -F 'printf '"'"'  - %s\n'"'"' "${DELETED_FILES[@]}"' "$F" || { echo "FAIL: dropped paths not printed with the house idiom"; exit 1; }
# D-03: conditional-emit metadata line, sitting beside diff_base
test "$(grep -c -F '${DIFF_HEAD:+diff_head: ${DIFF_HEAD}}' "$F")" = 1 || { echo "FAIL: diff_head metadata line absent or duplicated"; exit 1; }
grep -A1 -F '${DIFF_BASE:+diff_base: ${DIFF_BASE}}' "$F" | grep -q 'diff_head' || { echo "FAIL: diff_head not adjacent to diff_base"; exit 1; }
# the three phase-42 paths named in the comment are genuinely absent from disk (run from repo root)
for p in src/frontend/screens/Humble/Keys/All/index.tsx src/frontend/components/HumbleKeyGroup/index.tsx; do
  test ! -f "$p" || { echo "FAIL: $p exists — the comment's claim is stale, re-measure before shipping it"; exit 1; }
done
echo "Task 2 gates PASS"
    </automated>
    <automated>
# Behavioural proof: the filter names paths instead of swallowing them. Executes the edited
# region's logic verbatim against a fixture of one present and two absent paths.
/bin/bash -c '
cd "$(mktemp -d -t ivjdel)" || exit 1
touch present.txt
REVIEW_FILES=(present.txt gone-a.tsx gone-b.tsx)
EXISTING_FILES=(); DELETED_FILES=()
for file in "${REVIEW_FILES[@]}"; do
  if [ -f "$file" ]; then EXISTING_FILES+=("$file"); else DELETED_FILES+=("$file"); fi
done
OUT=$( if [ ${#DELETED_FILES[@]} -gt 0 ]; then
  echo "Filtered ${#DELETED_FILES[@]} deleted files from review scope:"
  printf "  - %s\n" "${DELETED_FILES[@]}"
fi )
printf "%s\n" "$OUT"
echo "$OUT" | /usr/bin/grep -q "gone-a.tsx" && echo "$OUT" | /usr/bin/grep -q "gone-b.tsx" \
  && echo "PASS: both dropped paths named" || { echo "FAIL: dropped paths not named"; exit 1; }
test ${#EXISTING_FILES[@]} -eq 1 || { echo "FAIL: surviving scope wrong"; exit 1; }
'
    </automated>
  </verify>
  <done>`Filtered N deleted files from review scope:` is followed by one `  - <path>` line per dropped file; no bare `DELETED_COUNT` remains in live code; `diff_head` emits conditionally on the line after `diff_base`; both behavioural probes pass.</done>
</task>

<task type="auto">
  <name>Task 3: Record the upgrade-trap finding, close the todo, run the gates</name>
  <files>.planning/todos/completed/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md, .planning/quick/260930-ivj-bound-code-review-scope-to-phase-end/260930-ivj-SUMMARY.md</files>
  <action>
Re-verify the upgrade trap against disk and record the honest finding in the SUMMARY. The facts
established at plan time, which you must CONFIRM rather than copy:
  - `gsd-core/workflows/code-review.md` **is** hash-tracked in `$HOME/.claude/gsd-file-manifest.json`
    (917 entries) with pristine hash `8c4f74ce02a47cb918f9651204a5179e243ccc4b25b190161ee6ba980d6cc2f9`,
    and the live file hashed identically before this task — i.e. it was PRISTINE, not previously
    patched.
  - It is **NOT** in `$HOME/.claude/gsd-local-patches/backup-meta.json`, which tracks only
    `gsd-core/bin/lib/template.cjs` and `gsd-core/templates/phase-prompt.md` (`from_version` 1.14.0).
  - Therefore this edit makes the live hash diverge from the manifest, so the installer's
    local-modification detector CAN see it and SHOULD newly park it on the next upgrade. State that
    as the expectation it is — nothing here has exercised the detector.
  - `/gsd-update --reapply` is a **MANUAL** step the operator must run after every upgrade. Do NOT
    write that reapply is automatic. Until it runs, an upgrade silently reverts this fix.

Record as a remaining step, NOT as work done: the durable fix is an upstream report against
`@opengsd/gsd-core`. Do not open one — that is the operator's call.

Also record in the SUMMARY: the `590 → 66` correction from the plan's "Measurement
authority" section (different
algorithm, plus phase 42 being a poisoned probe), the phase 41 and 34.6 numbers that do
demonstrate the fix, and the residual that a range still spans interleaved commits.

Close the todo by moving it pending → completed with `git mv` (how prior todos were closed here —
`R075` rename detected on the last one). CLAUDE.md scopes the frontmatter gate to `pending/` only,
so `completed/` needs no frontmatter edit. `git mv` stages the rename; a plain `mv` leaves the gate
reading a half-moved tree, so do the move, the gate run and the commit in ONE invocation.
  </action>
  <verify>
    <automated>
# todo moved, not copied
test ! -f .planning/todos/pending/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md || { echo "FAIL: todo still in pending/"; exit 1; }
test -f .planning/todos/completed/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md || { echo "FAIL: todo not in completed/"; exit 1; }
git status --porcelain .planning/todos/ | grep -q '^R' || { echo "WARN: rename not staged as R — confirm git mv was used"; }
# the SUMMARY states the trap honestly and does not overclaim reapply
S=.planning/quick/260930-ivj-bound-code-review-scope-to-phase-end/260930-ivj-SUMMARY.md
grep -q 'gsd-local-patches' "$S" || { echo "FAIL: upgrade trap not recorded"; exit 1; }
grep -qi 'manual' "$S" || { echo "FAIL: reapply not stated as manual"; exit 1; }
grep -qi 'upstream' "$S" || { echo "FAIL: remaining upstream step not recorded"; exit 1; }
grep -q '590' "$S" && grep -q '602' "$S" || { echo "FAIL: the 590->66 correction is not recorded"; exit 1; }
# the live file now differs from the manifest's pristine hash (so the detector can see it)
node -e 'const m=require(process.env.HOME+"/.claude/gsd-file-manifest.json").files;const c=require("crypto"),f=require("fs");const p=process.env.HOME+"/.claude/gsd-core/workflows/code-review.md";const h=c.createHash("sha256").update(f.readFileSync(p)).digest("hex");const pr=m["gsd-core/workflows/code-review.md"];console.log("manifest:",pr);console.log("live    :",h);if(h===pr){console.error("FAIL: file unchanged from pristine — the edit did not land");process.exit(1)}console.log("PASS: diverged from pristine, detector can see it")'
    </automated>
    <automated>pnpm planning-gates</automated>
    <automated>
# NO PRETTIER CHECK — DELIBERATELY OMITTED, NOT FORGOTTEN.
# Measured at plan time under prettier 3.7.4, both targets of this task:
#   .planning/quick/260930-ivj-.../260930-ivj-PLAN.md  -> { "ignored": true, "inferredParser": null }
#   $HOME/.claude/gsd-core/workflows/code-review.md     -> { "ignored": true, "inferredParser": null }
# (Note the space after each colon — a fixed-string grep for an unspaced form scores 0.)
# Per CLAUDE.md, `--check` over an ignored path prints "All matched files use Prettier code style!"
# and exits 0 having matched ZERO files — byte-identical to a real pass. `.planning/` is
# prettier-ignored, and the workflow file lives outside the repo entirely. Carrying the check here
# would be a green that proves nothing. This task writes no prettier-visible path.
# Re-assert the premise rather than trusting this comment:
npx prettier --file-info .planning/quick/260930-ivj-bound-code-review-scope-to-phase-end/260930-ivj-PLAN.md | grep -Eq '"ignored":[[:space:]]*true' || { echo "FAIL: PLAN path is NOT prettier-ignored — the omission above is no longer justified, add the check"; exit 1; }
npx prettier --file-info "$HOME/.claude/gsd-core/workflows/code-review.md" | grep -Eq '"ignored":[[:space:]]*true' || { echo "FAIL: workflow path is NOT prettier-ignored — re-evaluate the omission"; exit 1; }
echo "PASS: both paths confirmed prettier-invisible; check correctly omitted"
    </automated>
  </verify>
  <done>Todo is a staged rename into `completed/`; the SUMMARY records the manifest/local-patches finding with reapply stated as MANUAL, the upstream report as a REMAINING step, and the `590 → 66` correction; the live workflow hash diverges from the manifest pristine hash; `pnpm planning-gates` passes; the prettier omission is re-justified by a live `--file-info` probe rather than asserted.</done>
</task>

</tasks>

<source_coverage_audit>
No ROADMAP phase, REQUIREMENTS IDs or RESEARCH.md exist for a quick task; the sources are the
actioned todo and the operator's locked decisions.

| source | item | covered by |
| ------ | ---- | ---------- |
| CONTEXT | D-01 `DIFF_HEAD` anchor at both diff sites, `HEAD` fallback, padded/unpadded, decimals, per-plan scopes, near-miss anchoring, new numbered comment preserving `#3503`/`#3995` | Task 1 |
| CONTEXT | D-01 rejected alternative (last artifact commit under `PHASE_DIR`) NOT implemented | Task 1 — the anchor is a subject-scope match; `PHASE_DIR` is used only for the pre-existing `DIFF_BASE` |
| CONTEXT | D-02 deleted-file filter prints dropped paths | Task 2 |
| CONTEXT | D-03 `diff_head` in report metadata, conditional-emit idiom | Task 2 |
| TODO | measurement re-run for phase 42, honest numbers | Task 1 G4 + "Measurement authority" |
| TODO | fallback path exercised | Task 1 G4 (phase 45) |
| TODO | near-miss / decimal assertions | Task 1 G5 |
| TODO | `pnpm planning-gates` | Task 3 |
| TODO | no prettier check, stated explicitly | Task 3 |
| CONSTRAINT | bash 3.2 portability | Tasks 1-2 actions; G5 runs on `/bin/bash` 3.2.57 |
| CONSTRAINT | upgrade-trap finding, stated honestly, reapply MANUAL | Task 3 |
| CONSTRAINT | no upstream issue opened; recorded as remaining step | Task 3 |
| CONSTRAINT | no `src/` edits; in-repo changes limited to PLAN/SUMMARY + todo move | Task 3; `files_modified` carries no `src/` path |

No item is MISSING. Nothing was deferred.
</source_coverage_audit>

<threat_model>
## Trust Boundaries

| Boundary | Description |
| -------- | ----------- |
| operator argv → `PHASE_ARG` → `PADDED_PHASE`/`PHASE_NUMBER` | user-supplied phase token reaches a regex built at runtime |
| git history → `DIFF_HEAD` | repository content (commit subjects) selects the review's upper bound |
| `$HOME/.claude/gsd-core/` → every project on this machine | the edited file is shared, unversioned mutable state outside any repo |

## STRIDE Threat Register

ASVS level 1; block on `high`. No threat below is rated `high` or `critical`, so nothing here is
blocking — recorded because the surface is real, not to pad the table.

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
| --------- | -------- | --------- | -------- | ----------- | --------------- |
| T-IVJ-01 | Injection / Tampering | new `DIFF_HEAD` grep in `compute_file_scope` | medium | mitigate | `PADDED_PHASE` is already validated upstream in this workflow against `^[0-9]+[A-Z]?(\.[0-9]+)*$`, which admits no shell metacharacter, no quote and no backtick. The built pattern reaches `grep -E` as a single quoted argv element — never `eval`, never a re-parsed command string — so the worst case is a malformed ERE, on which grep errors, the capture is empty, and the `HEAD` fallback fires. Fail-safe by construction. |
| T-IVJ-02 | Tampering | `PHASE_NUMBER` (from init JSON) is NOT itself grammar-validated | low | accept | Tool-derived from ROADMAP, not raw argv, and it enters the same quoted-argv path as T-IVJ-01 with `.` escaped. Residual is a malformed regex, which degrades to the `HEAD` fallback. Tightening it would mean validating a variable this task does not otherwise touch. |
| T-IVJ-03 | Denial of correctness (Repudiation) | reversed range when `#3661` sets `DIFF_BASE` newer than the anchor | medium | mitigate | `git merge-base --is-ancestor` guard in Task 1; without it `git diff A..B` emits the REVERSE diff and is silently non-empty (measured: 489 files for `HEAD..HEAD~40`), producing a confident wrong scope. Falls back to `HEAD`. |
| T-IVJ-04 | Tampering | edited file is outside the repo, shared machine-wide, reverted by a `@opengsd/gsd-core` upgrade | medium | transfer | Manifest divergence lets the installer detect and park the file in `gsd-local-patches/`; `/gsd-update --reapply` restores it. Reapply is MANUAL — the operator owns it, and Task 3 records that plus the upstream report as remaining steps rather than claiming durability. |
| T-IVJ-05 | Information disclosure | the new `printf` prints dropped file paths to the console | low | accept | Repository-relative source paths only. This workflow already prints comparable lists (`MISSING_FROM_SUMMARY` in the `#2666` block) and hands the whole scope to the reviewer agent; naming the dropped files is the point of D-02. |
| T-IVJ-SC | Tampering | npm/pip/cargo installs | low | accept | This task installs nothing — no package-manager invocation, no dependency change, no `package.json` edit. No legitimacy gate is required because there is no package to audit. |
</threat_model>

<verification>
1. Task 1 gates G1-G5 pass: both diff sites anchored, both `HEAD` fallbacks present, ancestor guard
   present, `#4666` comment carries the four required elements, six prior comments intact, measured
   probes reproduce (or their divergence is recorded), near-miss isolation holds on bash 3.2.
2. Task 2 gates pass: dropped paths named, bare counter gone, `diff_head` adjacent to `diff_base`,
   behavioural probe names both absent fixtures.
3. Task 3 gates pass: todo is a staged rename, SUMMARY carries the trap and the `590 → 66`
   correction, live hash diverges from the manifest pristine hash, `pnpm planning-gates` green, and
   both prettier-ignored premises re-probed live.
4. No file under `src/` is modified: `git status --porcelain src/` is empty.
</verification>

<success_criteria>
- Reviewing a phase left alone since it closed scopes to that phase's window, not to `HEAD`:
  demonstrated at phase 41 (625 → 23) and phase 34.6 (1040 → 194).
- A phase with no scope-tagged commit reviews byte-identically to today (phase 45: 426 → 426).
- Scope `(4)` never anchors phase 42; scope `(42)` never anchors phase 4; `(3416)` never anchors
  phase 34.6.
- A later reader cannot mistake the new anchor for the prose grep `#3503`/`#3995` banned, because
  `#4666` says so in as many words and records why.
- A phase whose deliverable was deleted afterwards yields named paths instead of a bare count.
- `diff_head` is visible in the review's metadata beside `diff_base`.
- The SUMMARY states the upgrade trap honestly — reapply MANUAL, upstream report outstanding — and
  records that this mechanism yields 604 → 602 on phase 42, not 66.
</success_criteria>

<output>
Create `.planning/quick/260930-ivj-bound-code-review-scope-to-phase-end/260930-ivj-SUMMARY.md` when done.
</output>
