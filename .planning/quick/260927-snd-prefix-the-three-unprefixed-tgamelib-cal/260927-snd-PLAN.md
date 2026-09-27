---
phase: quick-260927-snd
plan: 01
type: execute
wave: 1
depends_on: ["quick-260927-q9t"]
files_modified:
  - src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
  - .planning/todos/pending/2026-09-27-the-unprefixed-tgamelib-call-family-is-a-74-site-minority-outlier.md
  - .planning/todos/completed/2026-09-27-the-unprefixed-tgamelib-call-family-is-a-74-site-minority-outlier.md
autonomous: true
requirements:
  - QUICK-260927-SND
estimate:
  tokens: 35000
  raw_tokens: 35000
  tasks: 2
  confidence: high
must_haves:
  truths:
    - "Exactly three string literals change in `src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx`: `'setting.eosOverlay.unavailable'`, `'setting.eosOverlay.updatingStatus'` and `'setting.eosOverlay.unavailableDetail'` each gain a leading `gamelib:`. Nothing else in the file changes - not the English defaults, not the `:68-70` comment, not any of the ~20 plain `t('setting.eosOverlay.*')` calls in the same file."
    - "**The invariant: mixed-style files 1 -> 0.** A comments-stripped, multi-line-aware scan of `src/**/*.ts*` reports ZERO files that call `tGamelib` in both the prefixed and the unprefixed style. Before the edit that same scan reports exactly 1 (this file, 4 prefixed + 3 unprefixed), and that pre-edit reading is produced in the verify block itself as the non-vacuity control."
    - "Unprefixed `tGamelib(` call total goes 75 -> 72; prefixed goes 182 -> 185; the 257 total is unchanged. No call site is added or removed."
    - "**Zero catalog churn.** `pnpm i18n` after the edit leaves `git status --porcelain public/locales` EMPTY and its `[en] gamelib` block reads `Unique keys: 318 (16 are plurals)` / `Added keys: 0` / `Restored keys: 0` / `Unreferenced keys: 7` - all four unmoved - while NO namespace reports a non-zero `Added keys`. This is the load-bearing check: it is the one observable that would move if adding the prefix changed how i18next-parser resolves the namespace. `Added keys: 0` prints once per namespace, so a bare grep for it is a false green and must not be used."
    - "`pnpm lint-translations:gamelib` reports `0 findings, 0 hard failures`."
    - "`pnpm codecheck` exits 0 and `pnpm lint` exits 0 with production `1107` / tests `638` - both ceilings unmoved."
    - "`npx jest --selectProjects Frontend` passes, including `EosActionConfirmationGuard.test.ts`, `EosDeclineCallSiteGuard.test.ts` and `removeEosOverlayConfirmation.test.tsx`, which read this file by source-grep."
    - "`npx prettier --check` over the one TSX path passes, and is proven non-vacuous in the same block by `npx prettier --file-info` reporting `\"ignored\":false`."
    - "The todo sits at `.planning/todos/completed/` under its byte-identical filename, carrying a `## Resolution` that records what shipped, the CORRECTED premise, and the disposition of the other 72 unprefixed calls. The STAGED blob is asserted to carry `## Resolution` before the commit is made."
    - "`python3 .planning/todos/todo-frontmatter-gate.py` is OK at 15 pending (16 minus the one that moved out; no new todo is filed). `pnpm planning-gates` reports 12/12 with the rename STAGED."
  artifacts:
    - src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
    - .planning/todos/completed/2026-09-27-the-unprefixed-tgamelib-call-family-is-a-74-site-minority-outlier.md
  key_links:
    - "**The todo's premise is WRONG and the Resolution must correct it, not restate it.** The todo says the outlier is 'specifically the unprefixed `setting.eosOverlay.*` family'. Measured 2026-09-27: there are 75 unprefixed calls across 19 files and the eosOverlay family is 3 of them. The real anomaly is that exactly ONE file in the repo mixes both call styles - this one. The todo's census (182 prefixed vs 74/75 unprefixed) and its 'the `:68-70` comment is substantially accurate' finding both HOLD and must not be contradicted; only the which-thing-is-the-outlier claim is being corrected."
    - "**Key every edit on the literal text, never on a line number** (MUTABLE-SCOPE AUTHORITY #3786). All three literals are unique in the file - `grep -c -F` returns exactly 1 for each, measured at planning time - so an exact-string edit cannot land on the wrong site. Do NOT edit by line number and do NOT `sed` on the `setting.eosOverlay.` substring: the same file contains roughly twenty plain `t('setting.eosOverlay.*')` calls that resolve against the DEFAULT namespace and must not gain a `gamelib:` prefix."
    - "**`git mv` stages the INDEX's content, not the working tree's.** Hit twice in this repo (`260926-mja`, near-miss in `260927-q9t`): a Resolution written before the move can be left unstaged, and the commit then lands the stale, unclosed body under green checks. Write the Resolution, `git mv`, `git add` the destination path explicitly, then ASSERT `git show \":<dest>\" | grep -c '## Resolution'` equals 1 before committing. Do the move, the add, the assertion, the gates and the commit in ONE invocation - a plain `mv` crashes `.planning/planning-envelope-tag-gate.py` until the move is staged, because it enumerates via `git ls-files`."
    - "**`.planning/**` is prettier-ignored** (`{\"ignored\":true,\"inferredParser\":null}`). A `--check` over the todo file matches zero files, prints `All matched files use Prettier code style!` and exits 0 - byte-identical to a real pass. It is OMITTED from Task 2 deliberately; hand-matching the surrounding todo corpus is what keeps that file consistent. Per CLAUDE.md, do not write a vacuous green into a `<verify>` block."
    - "**The other 72 unprefixed calls are OUT OF SCOPE and NO todo is filed for them.** They sit in 18 files that are each internally consistent (all-unprefixed, zero mixed). `useTranslation('gamelib')` already scopes the hook, so the prefix is functionally redundant there - converting them is 18 files of churn that restores no invariant. The accepted resting state is per-file internal consistency, which this task makes repo-wide; filing a todo would park permanent churn in the backlog and re-open a question this task is closing. The Resolution states this explicitly so the question is closed on the record rather than left hanging."
---

<objective>
Add the `gamelib:` namespace prefix to the three unprefixed `tGamelib(` key literals in
`AdvancedSettings/index.tsx`, so that **no file in the repo mixes both `tGamelib` call styles**.

Three string literals change. Nothing else. The post-condition is an invariant, not a style
preference: **mixed-style files 1 -> 0.**
</objective>

<execution_context>
Repo root `/Users/graysonmitchell/Projects/GameLib`, branch `main`, tree clean at planning time.
Nothing is pushed. Do not push.
</execution_context>

<context>
`quick-260927-q9t` minted `setting.eosOverlay.updatingStatus` using the **unprefixed** call style,
joining the two unprefixed siblings already in `getMainEosText()` rather than reconciling them, and
filed a todo to reconcile the family afterwards. This task is that reconciliation.

The todo frames the unprefixed `setting.eosOverlay.*` family as the repo's outlier. **That framing
is wrong**, and correcting it is part of this task - see the measured census below. The scope the
todo proposes (these same three literals) is nonetheless exactly right, for a better reason than
the one it gives.
</context>

<measured_at_planning_time>
Everything in this block was measured live on 2026-09-27 on this tree. Line numbers are
**orientation only**.

### The three edits

| line | literal now | becomes |
|---|---|---|
| 158 | `'setting.eosOverlay.unavailable'` | `'gamelib:setting.eosOverlay.unavailable'` |
| 163 | `'setting.eosOverlay.updatingStatus'` | `'gamelib:setting.eosOverlay.updatingStatus'` |
| 536 | `'setting.eosOverlay.unavailableDetail'` | `'gamelib:setting.eosOverlay.unavailableDetail'` |

All three are the first argument to `tGamelib(`, wired at `:70` as
`const { t: tGamelib } = useTranslation('gamelib')`. All three calls are already Prettier-wrapped
across three lines (call, key, English default), so the key literal sits alone on its own line.
`grep -c -F` returns exactly **1** for each of the three literals in this file - they are unique
anchors.

### The census, and what is actually anomalous

Method: every `src/**/*.ts*` file, block and line comments stripped, matching
`tGamelib\(\s*(['"])(.*?)\1` with `re.S` so a Prettier-wrapped key is still counted as one call.
A naive same-line grep undercounts the PREFIXED family specifically and inverts the answer - the
todo records that trap and it is real.

- **182 prefixed, 75 unprefixed, 257 calls across 56 files.**
- By file: **37 prefixed-only (178 calls), 18 unprefixed-only (72 calls), 1 MIXED** -
  `AdvancedSettings/index.tsx`, 4 prefixed + 3 unprefixed.
- The `setting.eosOverlay.*` family is **3 of the 75**, not the whole outlier. Prefixed is the
  majority on both metrics (67% of files, 71% of calls), so the todo's census and its "`:68-70`
  comment is substantially accurate" finding both hold.

**The real anomaly is the single mixed-style file.** That is what this task eliminates, and it
gives a complete, verifiable post-condition that "fix the eosOverlay family" does not.

### Why this is catalog-safe - measured, not assumed

Both call styles land in `gamelib.json` today.

- Unprefixed side, same-day and direct: `quick-260927-q9t` added
  `setting.eosOverlay.updatingStatus` via an **unprefixed** `tGamelib(` call and `pnpm i18n`
  reported gamelib `Added keys: 1`, `Unique keys: 317 -> 318`, writing it into `en/gamelib.json`.
  The parser resolves the hook's namespace.
- Prefixed side: `gamelib:settings.eosOverlayInstallConfirmTitle` and its three siblings already
  live in `gamelib.json`, written by prefixed calls at `:214`/`:218`/`:302`/`:306`.

Therefore **`pnpm i18n` after this change must show ZERO churn.** Any movement in
`Unique keys` / `Added keys` / `git status --porcelain public/locales` means namespace resolution
changed and the edit must be reverted, not papered over by committing the catalog delta.

### Tests

No test pins these literals. Grepped `setting.eosOverlay.` across every `*.test.ts`/`*.test.tsx`
under `src/` - zero hits. The three guard tests that read this file by source-grep
(`EosActionConfirmationGuard.test.ts`, `EosDeclineCallSiteGuard.test.ts`,
`removeEosOverlayConfirmation.test.tsx`, all under
`src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/`, all in the **Frontend** jest
project) contain no reference to these literals or to `gamelib:`. Run them; do not expect movement.

### Prettier

The real risk named at planning time was reflow: 8 extra characters could cross `printWidth: 80`.
Measured on the actual lines - the longest becomes `                'gamelib:setting.eosOverlay.unavailableDetail',` at 16 spaces of indent + 46
characters = 62 columns, and all three calls are ALREADY wrapped, so no line can un-wrap either.
Reflow is unlikely but the check stays load-bearing: **if Prettier does reflow, accept its output
and do not hand-fight it.**

### Baselines, all live today

`pnpm lint` production **1107** / tests **638**, both PASS. `pnpm planning-gates` **12/12**.
`todo-frontmatter-gate.py` OK at **16 pending**. gamelib `Unique keys: 318`, `Added keys: 0`.
`pnpm lint-translations:gamelib` **0 findings / 0 hard failures**.
</measured_at_planning_time>

<tasks>

<task type="auto">
  <name>Task 1: Prefix the three literals and commit, proving the mixed-style count went 1 -> 0</name>
  <files>src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx</files>
  <read_first>
Read `src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx` lines 60-72 (the
`useTranslation` wiring and its house-convention comment), 154-166 (`getMainEosText()`) and 530-540
(the unavailable-detail block) with the **Read tool**, so the exact bytes of each literal are in
hand before editing.

Do NOT read the whole 600-line file and do NOT sweep the file for `setting.eosOverlay.` - the
substring also matches roughly twenty plain `t(` calls that must stay unprefixed.
  </read_first>
  <action>
Make exactly three edits with the **Edit tool**, each keyed on the exact literal text including its
quotes and trailing comma:

1. `'setting.eosOverlay.unavailable',` -> `'gamelib:setting.eosOverlay.unavailable',`
2. `'setting.eosOverlay.updatingStatus',` -> `'gamelib:setting.eosOverlay.updatingStatus',`
3. `'setting.eosOverlay.unavailableDetail',` -> `'gamelib:setting.eosOverlay.unavailableDetail',`

Each old string is unique in the file, so each Edit must succeed without `replace_all`. If any Edit
reports a non-unique match, STOP - the file has drifted from the planning measurement and the
mapping needs re-deriving before anything is written.

Change nothing else. Do not touch the English default strings, the `:68-70` comment (it is correct
as written), any plain `t(` call, or any file under `public/locales/`.

Then run the automated verify block below IN FULL, and only if it is green, stage and commit in a
single invocation:

- stage by explicit path: `git add src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx`
  plus this quick task's own `.planning/quick/260927-snd-*/` artifacts. Never `git add -A`,
  `git add .` or `git commit -a`.
- assert the STAGED blob carries all three prefixed literals before committing - a working-tree-only
  grep has shipped a wrong commit in this repo four times.
- commit subject:
  `refactor(quick-260927-snd): prefix the three unprefixed tGamelib calls in AdvancedSettings`
- end the message with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

Do not push.
  </action>
  <verify>
    <automated>
set -u
cd "$(git rev-parse --show-toplevel)"
F=src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
SCAN=$(mktemp /tmp/mixedscan.XXXXXX.py)

cat > "$SCAN" <<'PY'
import re, pathlib, sys
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.') / 'src'
call  = re.compile(r"tGamelib\(\s*(['\"])(.*?)\1", re.S)
block = re.compile(r"/\*.*?\*/", re.S)
line  = re.compile(r"^\s*//.*$", re.M)
pre = unpre = 0
mixed = []
for p in sorted(root.rglob('*.ts')) + sorted(root.rglob('*.tsx')):
    src = line.sub('', block.sub('', p.read_text()))
    keys = [m.group(2) for m in call.finditer(src)]
    if not keys:
        continue
    a = sum(1 for k in keys if k.startswith('gamelib:'))
    b = len(keys) - a
    pre += a; unpre += b
    if a and b:
        mixed.append(f"{p} prefixed={a} unprefixed={b}")
print(f"prefixed={pre} unprefixed={unpre} mixed_files={len(mixed)}")
for m in mixed:
    print("  MIXED:", m)
PY

# A. THE INVARIANT - after.
AFTER=$(python3 "$SCAN" . | head -1)
echo "after : $AFTER"
[ "$AFTER" = "prefixed=185 unprefixed=72 mixed_files=0" ] || { echo "FAIL A1: expected prefixed=185 unprefixed=72 mixed_files=0"; python3 "$SCAN" .; exit 1; }

# B. NON-VACUITY CONTROL - the same scanner over the pre-edit tree must report 1 mixed file.
#    Run BEFORE committing, so HEAD is still the pre-edit commit.
git diff --quiet --cached -- "$F" || { echo "FAIL B0: $F already staged - the HEAD control would be measuring the wrong tree"; exit 1; }
T=$(mktemp -d)
git archive HEAD src | tar -x -C "$T"
BEFORE=$(python3 "$SCAN" "$T" | head -1)
rm -rf "$T"
echo "before: $BEFORE"
[ "$BEFORE" = "prefixed=182 unprefixed=75 mixed_files=1" ] || { echo "FAIL B1: control expected prefixed=182 unprefixed=75 mixed_files=1, got: $BEFORE - the scanner is not measuring what it claims"; exit 1; }

# C. Exactly three lines changed, all three prefixed, no plain t() touched.
NUM=$(git diff --numstat -- "$F")
echo "numstat: $NUM"
[ "$(echo "$NUM" | awk '{print $1"\t"$2}')" = "3	3" ] || { echo "FAIL C1: expected 3 insertions / 3 deletions in $F"; exit 1; }
for K in unavailable updatingStatus unavailableDetail; do
  grep -qF "'gamelib:setting.eosOverlay.$K'" "$F" || { echo "FAIL C2: 'gamelib:setting.eosOverlay.$K' missing"; exit 1; }
done
ADDED_T=$(git diff -U0 -- "$F" | grep '^+' | grep -c "[^G]t('gamelib:" || true)
[ "$ADDED_T" = "0" ] || { echo "FAIL C3: a plain t() call gained a gamelib: prefix"; exit 1; }
DIRTY=$(git status --porcelain -- src | grep -v "AdvancedSettings/index.tsx" || true)
[ -z "$DIRTY" ] || { echo "FAIL C4: source files modified outside scope: $DIRTY"; exit 1; }

# D. THE LOAD-BEARING CHECK - zero catalog churn.
#    `Added keys: 0` appears once PER NAMESPACE, so a bare grep for it is a false green. Slice the
#    `[en] gamelib` block out and assert all four of its counters, then assert no namespace at all
#    gained a key - if the prefix changed resolution, the key would appear under a DIFFERENT
#    namespace while gamelib's own Unreferenced count rose.
pnpm i18n 2>&1 | tee /tmp/snd-i18n.log >/dev/null
awk '/^\[en\] gamelib$/{f=1;next} /^\[en\] /{f=0} f' /tmp/snd-i18n.log > /tmp/snd-i18n-gamelib.log
cat /tmp/snd-i18n-gamelib.log
grep -q '^Unique keys: 318 (16 are plurals)$' /tmp/snd-i18n-gamelib.log || { echo "FAIL D1: gamelib Unique keys is not 318 (16 plurals) - namespace resolution CHANGED, revert the edit"; exit 1; }
grep -q '^Added keys: 0$'        /tmp/snd-i18n-gamelib.log || { echo "FAIL D2: gamelib Added keys is not 0 - namespace resolution CHANGED, revert the edit"; exit 1; }
grep -q '^Restored keys: 0$'     /tmp/snd-i18n-gamelib.log || { echo "FAIL D3: gamelib Restored keys is not 0"; exit 1; }
grep -q '^Unreferenced keys: 7$' /tmp/snd-i18n-gamelib.log || { echo "FAIL D4: gamelib Unreferenced keys is not 7 - the three keys stopped resolving to this namespace"; exit 1; }
OTHER=$(grep '^Added keys: ' /tmp/snd-i18n.log | grep -v '^Added keys: 0$' || true)
[ -z "$OTHER" ] || { echo "FAIL D5: some namespace gained keys: $OTHER"; exit 1; }
LOC=$(git status --porcelain public/locales)
[ -z "$LOC" ] || { echo "FAIL D6: pnpm i18n churned the catalogs: $LOC"; exit 1; }

# E. Translations lint. Exact line measured at planning time.
pnpm lint-translations:gamelib 2>&1 | tee /tmp/snd-lt.log | tail -3
grep -qF 'lint-translations[gamelib]: 0 findings, 0 hard failures' /tmp/snd-lt.log || { echo "FAIL E1: lint-translations:gamelib not clean"; exit 1; }

# F. Types and lint ceilings, unmoved. Exact summary lines measured at planning time; a bare
#    grep for 638 also matches the line number "1638:47" in the warning stream, so anchor them.
pnpm codecheck || { echo "FAIL F1: codecheck"; exit 1; }
pnpm lint > /tmp/snd-lint.log 2>&1 || { echo "FAIL F2: lint exited non-zero"; exit 1; }
grep -qF '✖ 1107 problems (0 errors, 1107 warnings)' /tmp/snd-lint.log || { echo "FAIL F3: production lint ceiling moved off 1107"; exit 1; }
grep -qF '✖ 638 problems (0 errors, 638 warnings)'   /tmp/snd-lint.log || { echo "FAIL F4: test lint ceiling moved off 638"; exit 1; }
grep -qF 'production: PASS | tests: PASS'            /tmp/snd-lint.log || { echo "FAIL F5: lintScoped did not report both ceilings PASS"; exit 1; }

# G. Prettier - non-vacuity proved first, then the real check. Measured format has NO space after
#    the colon: {"ignored":false,"inferredParser":"typescript"}.
npx prettier --file-info "$F" | tee /tmp/snd-fi.log
grep -qF '"ignored":false' /tmp/snd-fi.log || { echo "FAIL G1: prettier ignores $F - the --check below would be vacuous"; exit 1; }
npx prettier --check "$F" || { echo "FAIL G2: $F is not Prettier-formatted - run npx prettier --write on it and ACCEPT the output"; exit 1; }

# H. Frontend jest, plus the three EOS guard tests by name.
npx jest --selectProjects Frontend || { echo "FAIL H1: Frontend project"; exit 1; }
npx jest --selectProjects Frontend \
  src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/EosActionConfirmationGuard.test.ts \
  src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts \
  src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/removeEosOverlayConfirmation.test.tsx \
  || { echo "FAIL H2: one of the three EOS guard tests failed"; exit 1; }

rm -f "$SCAN"
echo "PASS: mixed-style files 1 -> 0, unprefixed 75 -> 72, zero catalog churn"
    </automated>
    <human-check>
None. Every claim in this task is machine-checkable and the non-vacuity control is inside the
automated block.
    </human-check>
  </verify>
  <done>
`AdvancedSettings/index.tsx` carries `'gamelib:setting.eosOverlay.unavailable'`,
`'gamelib:setting.eosOverlay.updatingStatus'` and `'gamelib:setting.eosOverlay.unavailableDetail'`;
3 insertions / 3 deletions and nothing else changed. The scan reports `mixed_files=0` on the working
tree and `mixed_files=1` on the HEAD snapshot. `pnpm i18n` churned no catalog and reports
`Unique keys: 318`, `Added keys: 0`. codecheck, lint (1107/638), lint-translations:gamelib, prettier
and the Frontend jest project are all green. The change is committed, and the staged blob was
asserted to carry all three prefixed literals before the commit was made.
  </done>
</task>

<task type="auto">
  <name>Task 2: Close the todo, correcting its premise and disposing of the other 72</name>
  <files>.planning/todos/pending/2026-09-27-the-unprefixed-tgamelib-call-family-is-a-74-site-minority-outlier.md</files>
  <read_first>
Read the todo in full with the **Read tool** (69 lines) - the Resolution has to speak to its Problem
section, not to a paraphrase of it. Note especially that its census figures and its "`:68-70`
comment is substantially accurate" finding are CORRECT and must be affirmed, not contradicted.
  </read_first>
  <action>
Append a `## Resolution` section to the todo **in the working tree first**, then move it. The
section must cover exactly three things:

**(a) What shipped.** The three `tGamelib` key literals in `AdvancedSettings/index.tsx` gained the
`gamelib:` prefix, in commit `refactor(quick-260927-snd): …`. Zero catalog churn: `pnpm i18n`
reported gamelib `Unique keys: 318`, `Added keys: 0` and left `public/locales` untouched, which is
the direct evidence that both call styles resolve to the same namespace.

**(b) The corrected premise - state plainly that the todo was wrong on this one point.** The todo
called the unprefixed `setting.eosOverlay.*` family the outlier. It is not: measured 2026-09-27
over `src/**/*.ts*` with comments stripped and `re.S`, there are **75 unprefixed calls across 19
files** and the eosOverlay family is **3 of them**. What was genuinely anomalous is that
`AdvancedSettings/index.tsx` was the **only file in the repo mixing both call styles** (4 prefixed +
3 unprefixed). The delivered post-condition is therefore an invariant, not a style preference:
**mixed-style files 1 -> 0**; all 56 files that call `tGamelib` are now internally consistent.
Affirm explicitly that the todo's census (182 prefixed vs 74/75 unprefixed), its same-line-grep trap
warning, and its reading of the `:68-70` comment as substantially accurate all **stand**.

**(c) The other 72, disposed of - no follow-up todo is filed, and say why.** They sit in 18 files
that are each internally consistent (all-unprefixed, zero mixed); the largest are
`WebView/components/TauriLoginPanel.tsx` (28), `Winetricks/WinetricksBrowse/index.tsx` (7),
`WebView/components/WebviewUnavailablePanel.tsx` (6), `UI/RedeemSteamKeyDialog/index.tsx` (6),
`Winetricks/WinetricksBrowse/Row/index.tsx` (6). `useTranslation('gamelib')` already scopes the
hook, so the prefix is functionally redundant there and converting them would be 18 files of churn
restoring no invariant. **Per-file internal consistency is the accepted resting state**, and this
task makes it hold repo-wide - filing a todo would park permanent churn in the backlog and re-open
the question this Resolution closes. Anyone re-measuring this later must use a multi-line-aware,
comments-stripped scan or they will get the inverted answer the todo warns about.

Match the surrounding todo corpus for wrap, heading style and voice by hand - `.planning/**` is
prettier-ignored, so no formatter will do it for you.

Then, **in ONE invocation**: `git mv` the file to `.planning/todos/completed/` under its
byte-identical filename, `git add` the destination path explicitly, run the assertions and gates
below, and commit. A plain `mv` crashes `.planning/planning-envelope-tag-gate.py` until the move is
staged.

Commit subject:
`docs(quick-260927-snd): close the mixed-tGamelib-style todo, correcting its outlier premise`
End the message with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

Do not push. Do not file a new todo. Do not touch any other pending todo.
  </action>
  <verify>
    <automated>
set -u
cd "$(git rev-parse --show-toplevel)"
SRC=.planning/todos/pending/2026-09-27-the-unprefixed-tgamelib-call-family-is-a-74-site-minority-outlier.md
DST=.planning/todos/completed/2026-09-27-the-unprefixed-tgamelib-call-family-is-a-74-site-minority-outlier.md

# A. The move happened, filename byte-identical, nothing left behind.
[ -f "$DST" ] || { echo "FAIL A1: $DST missing"; exit 1; }
[ ! -e "$SRC" ] || { echo "FAIL A2: $SRC still exists"; exit 1; }

# B. THE STAGED BLOB - not the working tree. git mv stages the INDEX's content; this repo has
#    shipped a stale body under green checks twice this way.
git show ":$DST" > /tmp/snd-staged-todo.md 2>/dev/null || { echo "FAIL B1: $DST is not staged"; exit 1; }
[ "$(grep -c '^## Resolution' /tmp/snd-staged-todo.md)" = "1" ] || { echo "FAIL B2: staged blob has no (or duplicate) '## Resolution' - the working-tree edit was not staged"; exit 1; }
for NEEDLE in '75' '3 of' 'mixed' '72' '318'; do
  grep -qF "$NEEDLE" /tmp/snd-staged-todo.md || { echo "FAIL B3: staged Resolution never mentions '$NEEDLE'"; exit 1; }
done
diff <(git show ":$DST") "$DST" > /dev/null || { echo "FAIL B4: staged blob differs from the working tree"; exit 1; }

# C. Frontmatter unchanged by the move; body-only delta.
head -11 "$DST" | grep -q '^severity: minor' || { echo "FAIL C1: severity key altered"; exit 1; }
head -11 "$DST" | grep -q '^platform: any'   || { echo "FAIL C2: platform key altered"; exit 1; }
head -11 "$DST" | grep -q '^ready: code'     || { echo "FAIL C3: ready key altered"; exit 1; }

# D. Staged set is exactly this task's paths - a concurrent session may share this tree.
BAD=$(git diff --cached --name-only | grep -v '^\.planning/todos/\(pending\|completed\)/2026-09-27-the-unprefixed-tgamelib' | grep -v '^\.planning/quick/260927-snd-' || true)
[ -z "$BAD" ] || { echo "FAIL D1: staged paths outside the allowlist: $BAD"; exit 1; }

# E. Gates, with the rename STAGED.
python3 .planning/todos/todo-frontmatter-gate.py || { echo "FAIL E1: todo frontmatter gate"; exit 1; }
PEND=$(ls .planning/todos/pending/*.md | wc -l | tr -d ' ')
[ "$PEND" = "15" ] || { echo "FAIL E2: expected 15 pending todos (16 minus the one closed, none filed), got $PEND"; exit 1; }
pnpm planning-gates 2>&1 | tee /tmp/snd-gates.log
grep -q '12/12' /tmp/snd-gates.log || { echo "FAIL E3: planning-gates not 12/12"; exit 1; }

# F. No prettier check here, and that is deliberate: .planning/** reports
#    {"ignored":true,"inferredParser":null}, so --check over $DST matches zero files and exits 0
#    identically to a real pass. Recording the omission rather than carrying a vacuous green.
npx prettier --file-info "$DST" | grep -qF '"ignored":true' || { echo "FAIL F1: .planning is NOT prettier-ignored any more - the omission above needs revisiting"; exit 1; }

# G. Source untouched by this task.
git diff --cached --name-only | grep -q '^src/' && { echo "FAIL G1: Task 2 staged a source file"; exit 1; }

echo "PASS: todo closed with a staged Resolution, gates 12/12, 15 pending"
    </automated>
    <human-check>
Read the landed `## Resolution` back with the **Read tool** and confirm three things a grep cannot:
it says outright that the todo's outlier framing was wrong while affirming the parts of it that
hold; the other-72 paragraph reads as a decision with a reason, not as a deferral; and nothing in it
implies a future sweep is expected.
    </human-check>
  </verify>
  <done>
The todo is at `.planning/todos/completed/` under its byte-identical filename with exactly one
`## Resolution` section covering what shipped, the corrected premise (eosOverlay was 3 of 75; the
real anomaly was the single mixed-style file; census and `:68-70` findings affirmed) and the
no-follow-up disposition of the other 72. The STAGED blob was asserted to carry it before the
commit. `todo-frontmatter-gate.py` is OK at 15 pending, `pnpm planning-gates` is 12/12, no new todo
was filed, and no source file was touched.
  </done>
</task>

</tasks>
