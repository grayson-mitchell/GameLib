---
phase: 260908-gye
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
files_modified:
  - .planning/todos/pending/*.md
  - .planning/todos/todo-frontmatter-gate.py
  - meta/runPlanningGates.py
  - CLAUDE.md
  # Task 3 only — OUTSIDE this repo, captured by no GameLib commit:
  - ~/.vscode/extensions/gsd-phase-status/parse.js
  - ~/.vscode/extensions/gsd-phase-status/extension.js
  - ~/.vscode/extensions/gsd-phase-status/test-parse.js
  - ~/.vscode/extensions/gsd-phase-status/package.json
requirements: [QUICK-260908-GYE]

must_haves:
  truths:
    - "Every file in .planning/todos/pending/ carries severity/platform/ready from a controlled vocabulary"
    - "A bad or missing triage key fails `pnpm planning-gates` in CI"
    - "The gate cannot be deleted later without the runner's anti-vacuity floor noticing"
    - "CLAUDE.md tells every future session the three keys the gate requires, so filing a todo does not redden CI"
    - "Each pending todo in the VS Code Explorer shows a 2-char severity+readiness badge, not a uniform grey circle"
    - "Readiness is legible by colour as well as badge, and neither channel alone is load-bearing"
    - "`node test-parse.js` stays green and pins the badge/colour mapping including the 2-char cap"
  artifacts:
    - path: ".planning/todos/todo-frontmatter-gate.py"
      provides: "CI-run vocabulary lint over pending todo frontmatter, with a built-in self-test"
      contains: "def self_test"
    - path: "meta/runPlanningGates.py"
      provides: "MINIMUM_EXPECTED_GATES raised 8 -> 9 with a house-style rationale comment"
      contains: "MINIMUM_EXPECTED_GATES = 9"
    - path: "CLAUDE.md"
      provides: "Conventions entry naming the three required todo triage keys and their vocabularies"
      contains: "ready:"
  key_links:
    - from: "meta/runPlanningGates.py"
      to: ".planning/todos/todo-frontmatter-gate.py"
      via: "suffix discovery (*-gate.py under .planning/)"
      pattern: "9/9 planning gates passed"
    - from: "~/.vscode/extensions/gsd-phase-status/extension.js"
      to: "parse.js todoTriage()"
      via: "decorateTodoFile reads severity/platform/ready off frontmatterOf()"
      pattern: "todoTriage"
---

<objective>
Make pending-todo triage readable at a glance in the VS Code Explorer.

Two halves, deliberately ordered so the durable one lands first:

1. **Frontmatter + CI lint (tasks 1-2).** Normalize `severity:` to a closed vocabulary and
   backfill two new keys (`platform:`, `ready:`) on every pending todo, then guard the vocabulary
   with a Python gate that `meta/runPlanningGates.py` discovers by suffix and CI already runs as
   `pnpm planning-gates`. This half is version-controlled, runs without any editor, and answers
   "what can I actually pick up right now?" with a plain `grep -l 'ready: code'`.

2. **Extension rendering (task 3).** Teach the hand-installed `gsd-phase-status` extension to
   render a 2-char badge and a readiness colour per pending todo instead of the single grey `○`
   every open todo gets today.

Purpose: a folder of identical grey circles carries no triage information — every open todo
renders the same `○` regardless of severity or whether it is even actionable on this machine. The
frontmatter half fixes that for tooling and grep; the extension half fixes it for the eye.

Output: normalized todo frontmatter, a new planning gate, a raised anti-vacuity floor, and
extension v0.10.0.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

Source files to read before editing (do NOT re-read ranges already quoted below):
@meta/runPlanningGates.py
@.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/model-a-retirement-gate.py
</context>

<measured_facts>
Measured against the live tree at planning time.

**The corpus size is a MOVING TARGET — three counts in one planning session.** The briefing said
38 pending / 98 completed. First measurement: **37 / 99**. Twenty minutes later, unprompted:
**35 / 101**. The concurrent session is filing todos while you work. The two that left were both
`minor`.

**Therefore: do not trust any count in this plan, including this one. Re-measure in task 1 and
record what YOU observe.** The distribution below is advisory context for sizing the work, not a
pin to assert against. Nothing in the gate or the verification depends on a file count.

Distribution as last measured (35 files, all with a `severity:` line):

| value | count |
|---|---|
| `minor` | 12 |
| `medium` | 10 |
| `major` | 6 |
| `low` | 3 |
| `unknown` | 2 |
| free text (`unknown-pending-one-gesture (upper bound: …)`) | 1 |
| `critical` | 1 |

All 35 files have a well-formed `---` frontmatter block on line 1 (verified), so the
frontmatter-only parsing both the gate and the task-1 sweep rely on is sound across the corpus.

**The six files needing severity adjudication** (every other file is already one of the four
target values and must be left byte-unchanged):

- fold `low` → `minor`, no judgement needed:
  - `2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`
  - `2026-09-04-adtraction-ad-block-detection-has-no-derivable-signal-under-tauri.md`
  - `2026-09-03-all-10032-non-english-fork-strings-are-unreviewed-machine-translation.md`
- read the file and assign a real severity:
  - `2026-09-06-jest-run-orphans-gamelib-sidecar-spinning-at-100-cpu.md` (`unknown`)
  - `2026-09-06-bootstrapwirings-protocol-url-log-assertion-drops-under-load.md` (`unknown`)
  - `2026-09-02-gog-and-amazon-logout-never-clear-the-shared-cookie-jar.md` (free text; keep its
    upper/lower-bound nuance in the BODY, not the frontmatter)

**`ready:` exists on zero files today.** `platform:` exists on exactly 2, both `windows`
(`2026-09-06-detectvcredist-never-runs-on-windows.md`,
`2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`), and both also carry
`verifiable_on:`. `needs:` free prose exists on 7 files. All of these are preserved untouched.

**Key placement is already conventioned.** `detectvcredist` reads:

```
status: OPEN
severity: medium
platform: windows
verifiable_on: "operator Windows machine (not primary OS)"
```

so `platform:` goes immediately after `severity:`, and `ready:` immediately after `platform:`.

**`.planning` is in `.prettierignore` (line 29).** Editing todo markdown cannot introduce prettier
drift. Do not spend a gate run chasing it.

**`parseFrontmatter` (parse.js:514-539) lowercases KEYS but not VALUES**, strips surrounding
quotes, and stores arbitrary top-level keys. So `fm.severity`, `fm.platform` and `fm.ready` all
arrive as raw-case strings — the new mapper must lowercase values itself.

**Runner output shape** (`runPlanningGates.py:94`): `print(f"\n{len(gates) - len(failures)}/{len(gates)} planning gates passed.")`
→ the task-2 assertion is the literal line `9/9 planning gates passed.`
</measured_facts>

<design>
Approved by the user. Do not re-litigate; implement it.

**Vocabulary (frontmatter is the source of truth).**

| key | values | default |
|---|---|---|
| `severity` | `critical` \| `major` \| `medium` \| `minor` | none — required |
| `platform` | `macos` \| `windows` \| `linux` \| `any` | `any` |
| `ready` | `code` \| `live-gate` \| `human` \| `blocked` | none — required |

`ready` meanings: `code` = desk-ready, edit and typecheck, no live gate and no other OS;
`live-gate` = needs a live run on this Mac; `human` = needs a decision, credentials or a person,
not code; `blocked` = parked or externally blocked.

**Badge — exactly 2 characters, always.**
char 1 = severity digit: `1` critical, `2` major, `3` medium, `4` minor, `?` unrecognised.
char 2 = readiness letter: `.` code, `G` live-gate, `H` human, `W` platform=windows,
`L` platform=linux, `B` blocked, `?` unrecognised.

Platform letters take precedence over readiness letters when platform is windows/linux: "not on
this machine" dominates. Digits rather than glyphs — ordinal at a glance, and no font-rendering
risk across themes (unlike the `🧍` already in `STYLE`).

**Colour — readiness only.**

| colour | meaning |
|---|---|
| `charts.green` | `code` — desk-ready |
| `charts.blue` | `live-gate` |
| `charts.orange` | `human` |
| `charts.red` | platform-blocked (windows/linux) |
| `charts.purple` | blocked / parked (already today's parked colour — preserve it) |
| `descriptionForeground` | unrecognised or missing |

**Full precedence ladder** (first match wins; implement in exactly this order):

1. folder is `completed/` → `✓` / `charts.green` — today's behaviour, unchanged
2. `todoFileStatus(...) === 'parked'` → badge `{sev}B`, `charts.purple`
3. `todoFileStatus(...) === 'inprogress'` → `▶` / `charts.yellow` — today's behaviour, preserved
4. `platform === 'windows'` → `{sev}W`, `charts.red`
5. `platform === 'linux'` → `{sev}L`, `charts.red`
6. `ready === 'code'` → `{sev}.`, `charts.green`
7. `ready === 'live-gate'` → `{sev}G`, `charts.blue`
8. `ready === 'human'` → `{sev}H`, `charts.orange`
9. `ready === 'blocked'` → `{sev}B`, `charts.purple`
10. anything else → `{sev}?`, `descriptionForeground`

Rungs 3 and 10 are planner discretion filling gaps the approved design did not name. Rung 3
preserves a working in-progress signal rather than displacing it (zero pending files use it
today, so it is an empty case — but regressing it silently would be wrong). Rung 10 uses `?` for
char 2 so a file with no triage keys reads `??`, unmistakably "this one was never triaged".

**Two comments the code must carry** (both are load-bearing rationale, not decoration):

- The badge deliberately **repeats** what the colour says. That redundancy is intentional: colour
  tuning on this hand-installed extension is already documented as fragile (`contributes.colors`
  never registers), so colour alone is a poor sole channel.
- Accepted wart: `charts.green` means *complete* on phase folders and *ready to start* on todos.
  Accepted under the extension's existing cross-namespace reuse rationale
  (`extension.js:50-53`, `:57-62`) — phase folders, artifact files and todo files are three
  separate namespaces.

**Out of scope:** completed todos keep today's `✓` green. The gate checks `pending/` only.
Folder count badges (`countBadge`, `tallyTodos`) must keep working unchanged. `status:` handling
is already correct — do not touch it.
</design>

<hard_constraints>
**Filenames are frozen.** Do NOT rename, move or re-slug any todo file.
`2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md` is cited by name in 21 other
planning docs, `2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md` in 11, six
more in ≥4. A rename silently breaks every citation, and a grep for the old name returns zero,
which reads as "no references".

**Badge is hard-capped at 2 characters.** VS Code truncates silently (`parse.js:893` comment). A
3-char badge is a wrong answer, not a missing one.

**Only built-in theme colour IDs are usable.** `contributes.colors` does not register for this
hand-installed extension — its VS Code registry entry is pinned to an old version
(`extension.js:39-43`). Usable: `charts.green|blue|orange|red|purple|yellow`,
`descriptionForeground`, `disabledForeground`. Shades tune via `workbench.colorCustomizations` in
`.vscode/settings.json`, which already carries a `charts.red` override.

**The extension is not version controlled and lives outside this repo.** Precedent is established
(quick `260823-d7j` bumped it 0.7.x→0.8.0 and recorded exactly this). Edit in place, bump
`version` to `0.10.0`, and state plainly in the SUMMARY that those four files are captured by no
GameLib commit.

**Do NOT run any `gsd-sdk state.*`, `roadmap.*`, `phase.complete` or `state.record-session` verb.**
The orchestrator owns STATE.md. Standing project ban; silence is not permission.

**A concurrent session is active.** Every commit is explicit-path
`git add <paths> && git commit`. Run `git diff --cached --name-only` and read it immediately
before every commit. Never `git add -A`, never `git stash`, never `git checkout --`.
</hard_constraints>

<tasks>

<task type="auto">
  <name>Task 1: Normalize and backfill triage frontmatter on every pending todo</name>
  <files>.planning/todos/pending/*.md</files>
  <action>
First re-measure the corpus: `ls -1 .planning/todos/pending/*.md | wc -l` and the severity
distribution. Record the number you observe in the SUMMARY. It will probably NOT be 35 — the count moved twice
during planning alone. Proceed against what you measure, and say so. Backfill whatever is on disk
when you run; a todo filed to `completed/` mid-task needs no triage keys and must not be dragged
back out of `completed/` to get them.

For every file in `.planning/todos/pending/`:

1. **`severity:`** — normalize to exactly one of `critical|major|medium|minor`. Files already
   carrying one of those four are left BYTE-UNCHANGED. Fold the 3 `low` files to `minor`.
   For the 3 files named in `<measured_facts>` with `unknown`/free-text severity, READ the file
   and assign a real severity from its own evidence. For the free-text
   `gog-and-amazon-logout` file, move its upper-bound/lower-bound nuance into the BODY (a
   `Severity rationale:` line under the existing prose is fine) so the judgement survives the
   frontmatter collapse rather than being deleted by it.
2. **`platform:`** — add immediately after `severity:`, one of `macos|windows|linux|any`. Default
   `any`. The 2 files that already say `windows` keep it and get no duplicate key.
3. **`ready:`** — add immediately after `platform:`, one of `code|live-gate|human|blocked`.
   Assign by reading each file. Use the `needs:` prose (7 files have it) and `verifiable_on:`
   (2 files) as evidence where present. A `status: PARKED …` file is `blocked`.

Leave `needs:`, `verifiable_on:`, `status:`, `created:`, `title:`, `area:`, `source:`, `files:`
and every other key untouched. Do not reorder existing keys. Do not rename, move or re-slug any
file (see `<hard_constraints>`).

`.planning` is prettier-ignored, so no formatting pass is needed or wanted.

Commit with explicit paths only, after reading `git diff --cached --name-only`:
`git add .planning/todos/pending && git commit -m "docs(260908-gye): normalize pending todo triage frontmatter"`
  </action>
  <verify>
    <automated>cd .planning/todos/pending &amp;&amp; for f in *.md; do awk '/^---$/{n++; next} n==1' "$f" | grep -qE '^severity: (critical|major|medium|minor)$' || echo "BAD severity: $f"; awk '/^---$/{n++; next} n==1' "$f" | grep -qE '^platform: (macos|windows|linux|any)$' || echo "BAD platform: $f"; awk '/^---$/{n++; next} n==1' "$f" | grep -qE '^ready: (code|live-gate|human|blocked)$' || echo "BAD ready: $f"; done; echo "SWEEP DONE"</automated>
  </verify>
  <done>
Every file in `pending/` has all three keys with in-vocabulary values (the sweep above prints only
`SWEEP DONE`, no `BAD` lines). No file was renamed or moved: `git diff --cached --name-status`
shows `M` on every path and zero `R`/`A`/`D`. The three adjudicated severities are justified in
the SUMMARY, and the free-text file's nuance is present in its body.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add the vocabulary gate and raise the anti-vacuity floor 8 -> 9</name>
  <files>.planning/todos/todo-frontmatter-gate.py, meta/runPlanningGates.py, CLAUDE.md</files>
  <action>
Create `.planning/todos/todo-frontmatter-gate.py`. The `-gate.py` suffix is what
`meta/runPlanningGates.py` discovers by (`rglob('*-gate.py')` under `.planning/`), so no
registration edit is needed — only the floor bump below.

Follow the house style of `model-a-retirement-gate.py` exactly: a long docstring stating what the
gate forbids and why, a `self_test()` that proves each check can REJECT its bad input and that the
accept-side controls are NOT convicted, a `--self-test` flag, and a `main()` that runs the
self-test first and then walks the live tree. No `--write` flag — this is a pure predicate.

Requirements:

- Resolve the corpus as `Path(__file__).resolve().parent / "pending"`, NOT from cwd. The runner
  sets cwd to the gate's own directory, but `__file__` is correct under both invocations.
- Scope is `pending/` ONLY. `completed/` is explicitly out of scope — assert that in a comment so
  a later widening is a deliberate act.
- **Parse the FRONTMATTER BLOCK ONLY** — the text between the first `---` line and the next `---`
  line. This is load-bearing, not a nicety: todo BODIES contain prose lines like
  `Severity: low, and NOT a security regression`, so a whole-file grep would convict correct
  files. Cover this with a dedicated accept-side self-test case.
- Fail on: a missing `severity`/`platform`/`ready` key, an out-of-vocabulary value, or a duplicate
  key within the frontmatter block. Report EVERY offending file and key in one run (do not stop at
  the first), each as `path :: key :: value`.
- Do not hard-code a file count. The floor lives in the runner, not here; this gate walks whatever
  is on disk. A corpus of zero files IS worth failing on though — an empty `pending/` means the
  glob broke, so fail loudly rather than reporting a cheerful green over nothing.
- Fail with a message that tells the maintainer the correct action is to fix the todo's
  frontmatter, never to widen the vocabulary to make the gate pass.

**Also required — otherwise this gate is a foot-gun (orchestrator addition, measured 2026-09-08).**
The workflow that files todos, `~/.claude/get-shit-done/workflows/add-todo.md:95-101`, emits a
frontmatter template of exactly `created` / `title` / `area` / `files`. It does **not** emit
`severity:` at all, never mind `platform:` or `ready:` — every `severity:` in the corpus was added
by hand. So the moment this gate lands, the next todo any session files turns CI red through no
fault of its own. A concurrent session (`260908-gx3`) was filing and closing todos in this repo
during planning, so this is live, not hypothetical.

That template lives outside this repo and is shared by every GSD project, so do NOT edit it —
a GameLib-specific vocabulary must not be forced on unrelated projects. Instead close the loop
through the in-repo channel every session already reads: **add a `## Conventions` entry to
`./CLAUDE.md`** (the section currently reads "Conventions not yet established. Will populate as
patterns emerge during development." — replace that placeholder line, keep the heading). It must
state the three required keys, their exact vocabularies, that they are required on every file in
`.planning/todos/pending/`, that `pnpm planning-gates` enforces them, and that the correct
response to a red gate is to fix the todo rather than widen the vocabulary. Commit it with the
gate, in the same commit — the gate and the instruction that makes it satisfiable must not be
separable.

Then edit `meta/runPlanningGates.py`: raise `MINIMUM_EXPECTED_GATES` from `8` to `9`, adding an
`8 -> 9` comment in the established house style directly below the existing `6 -> 7` and `7 -> 8`
comments. Say what the ninth gate is and why the floor must move: leaving it at 8 would let this
gate be deleted later with every remaining gate still reporting green — the exact property the
constant exists to hold.

**Prove the gate is not vacuous against the real corpus, without disturbing the concurrent
session.** Extract the PRE-normalization todos into a scratch dir and run the gate against them:
`git show HEAD~1:<path>` per file (or `git archive HEAD~1 .planning/todos/pending | tar -x -C <scratchdir>`),
copy the gate beside them, and observe it RED with a finding for every un-backfilled file. Never
`git stash`, never `git checkout --` — both disturb a concurrent session, and the post-checkout
hook fires on the latter. Record the observed RED count in the SUMMARY.

Commit with explicit paths only, after reading `git diff --cached --name-only`:
`git add .planning/todos/todo-frontmatter-gate.py meta/runPlanningGates.py CLAUDE.md && git commit -m "feat(260908-gye): gate pending todo triage vocabulary, floor 8 -> 9"`
  </action>
  <verify>
    <automated>python3 .planning/todos/todo-frontmatter-gate.py --self-test &amp;&amp; python3 meta/runPlanningGates.py 2>&amp;1 | tee /dev/stderr | grep -q '^9/9 planning gates passed\.$' &amp;&amp; echo "RUNNER OK 9/9"</automated>
  </verify>
  <done>
Three things are true and each was OBSERVED, not assumed:
1. `--self-test` passes, and every reject-side case was demonstrated to actually reject (the
   self-test fails if a check is incapable of failing).
2. The gate is GREEN against the live post-task-1 tree and was seen RED against the
   pre-normalization corpus extracted with `git show`/`git archive`; the RED finding count is in
   the SUMMARY.
3. `python3 meta/runPlanningGates.py` prints exactly `9/9 planning gates passed.` — discovery
   found the new gate and the floor moved with it. `MINIMUM_EXPECTED_GATES = 9` carries an
   `8 -> 9` rationale comment.
  </done>
</task>

<task type="auto">
  <name>Task 3: Render severity+readiness badges in the gsd-phase-status extension</name>
  <files>~/.vscode/extensions/gsd-phase-status/parse.js, ~/.vscode/extensions/gsd-phase-status/extension.js, ~/.vscode/extensions/gsd-phase-status/test-parse.js, ~/.vscode/extensions/gsd-phase-status/package.json</files>
  <action>
These four files are OUTSIDE this repo and under no version control. Nothing in this task is
captured by a GameLib commit — say so plainly in the SUMMARY (precedent: quick `260823-d7j`).
Make no GameLib commit for this task.

**`parse.js`** — add a pure exported function `todoTriage(fm, folder)` where `fm` is the
`parseFrontmatter` result (or `null`) and `folder` is `'pending'` or `'completed'`. Return
`{ badge, color, label }` — `color` is a plain theme-colour ID string, matching the shape of the
existing `STYLE` entries so `deco()` consumes it unchanged.

Implement the 10-rung precedence ladder in `<design>` in exactly that order. Notes:
- Lowercase values before matching. `parseFrontmatter` lowercases keys but NOT values.
- Reuse the existing `todoFileStatus(fm && fm.status, folder)` for rungs 1-3 rather than
  re-deriving status. Status handling is already correct — do not duplicate or change it.
- `badge` must be exactly 2 characters on every pending path (rung 1 `✓` and rung 3 `▶` are the
  two single-char exceptions, both preserved from today).
- `label` is human prose for the tooltip, e.g. `major · needs a live gate`.
- Carry both rationale comments named in `<design>` (intentional badge/colour redundancy; the
  accepted `charts.green` cross-namespace wart).
- Export `todoTriage` from `module.exports` alongside `todoFileStatus`.

**`extension.js`** — in `decorateTodoFile` (~line 411), replace the
`todoFileStatus(...)` → `STYLE[status]` lookup with `todoTriage(fm, folder)`. Keep the existing
`stale` clause verbatim — the disagreement report between a file's `status:` line and its folder
is how you find todos in `completed/` still declaring themselves OPEN. Fold the triage label into
the tooltip alongside it. Add `todoTriage` to the `require('./parse')` destructure. Do NOT touch
`todoDecoration`'s routing, the folder count badges, `countBadge`, `tallyTodos`, or `TODO_OPEN_COLOR`/
`TODO_DONE_COLOR`.

**`test-parse.js`** — extend the existing todo block (the harness is `eq(actual, expected, label)`
comparing `JSON.stringify`; the module is `p`). Keep all 13 existing `todo:` assertions green and
unmodified. Add assertions covering:
- one case per rung of the ladder (all 10), asserting the full `{badge, color, label}` object;
- **the 2-char cap**: iterate every severity × every readiness/platform combination and assert
  `badge.length === 2` for each — this is the cap proof, and it must be a loop over the real
  vocabulary, not a handful of spot checks;
- **the unrecognised-value fallback**: a garbage `severity:`, a garbage `ready:`, and a file with
  NO triage keys at all → `??` / `descriptionForeground`;
- platform precedence: `platform: windows` with `ready: code` renders `W` and red, NOT `.` and
  green;
- `completed/` is untouched: a completed todo still renders `✓` / `charts.green` whatever its
  severity says;
- mixed case (`severity: Major`) normalizes, proving values are lowercased.

**`package.json`** — bump `"version"` from `0.9.0` to `0.10.0`. It is a single-line minified file;
change only that value.

Reload the VS Code window afterwards and confirm by eye that pending todos show varied badges and
colours rather than a column of identical grey circles. Report what you actually see.
  </action>
  <verify>
    <automated>cd ~/.vscode/extensions/gsd-phase-status &amp;&amp; node test-parse.js 2>&amp;1 | tail -3 | grep -q 'All parser tests passed\.' &amp;&amp; grep -c 'todo:\|triage:' test-parse.js &amp;&amp; grep -q '"version":"0.10.0"' package.json &amp;&amp; node -e "const p=require('./parse');const V=['critical','major','medium','minor','nonsense'];const R=['code','live-gate','human','blocked','nonsense',undefined];let n=0;for(const s of V)for(const r of R)for(const pl of ['any','windows','linux','macos']){const b=p.todoTriage({severity:s,ready:r,platform:pl},'pending').badge;if(b.length!==2){console.log('CAP VIOLATION',s,r,pl,JSON.stringify(b));process.exit(1)}n++}console.log('CAP OK across',n,'combinations')"</automated>
  </verify>
  <done>
`node test-parse.js` prints `All parser tests passed.` with the new assertions present and all 13
pre-existing `todo:` assertions still green. The independent cap sweep prints `CAP OK` across
every severity × readiness × platform combination with zero violations. `package.json` reads
`0.10.0`. A window reload shows varied badges and colours on `pending/`, and `completed/` is
visually unchanged. The SUMMARY states that these four files are captured by no GameLib commit.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Pending todo triage is now legible in three places: the frontmatter itself (greppable), the CI
gate (`9/9 planning gates passed.`), and the VS Code Explorer (2-char badge + readiness colour).
  </what-built>
  <how-to-verify>
1. Reload the VS Code window (`Cmd+Shift+P` → "Developer: Reload Window").
2. Expand `.planning/todos/pending` in the Explorer. Confirm you see a spread of 2-char badges
   (`1H`, `3.`, `4G`, `2W`, …) in varied colours — NOT a column of identical grey `○`.
3. Confirm `.planning/todos/completed` is visually unchanged (green `✓`).
4. Confirm the two folder count badges still show their numbers.
5. Spot-check that the readiness colours match your own sense of the work: green items should be
   ones you could genuinely start at the desk right now.
6. Sanity-check a few `ready:` assignments — the executor judged every pending file, and that judgement is
   the one thing here no gate can verify.
  </how-to-verify>
  <resume-signal>Type "approved", or name the todos whose `ready:`/`severity:` you disagree with</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| planning docs → CI gate | A gate that cannot fail lets the vocabulary rot back to free text |
| repo → hand-installed extension | Extension edits are uncommitted and unreviewable by any GameLib gate |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-GYE-01 | Tampering | `todo-frontmatter-gate.py` | mitigate | Built-in `self_test()` proves each check rejects its bad input; task 2 additionally observes the gate RED against the pre-normalization corpus extracted via `git show`, so non-vacuity is proven at corpus scale and not merely asserted |
| T-GYE-02 | Repudiation | `MINIMUM_EXPECTED_GATES` | mitigate | Raised 8 → 9 with a rationale comment, so deleting the gate later fails the runner instead of passing green over nothing |
| T-GYE-03 | Information disclosure | todo body prose | mitigate | Gate parses the frontmatter block only; a body line reading `Severity: low, …` must not convict its file — covered by a dedicated accept-side self-test case |
| T-GYE-04 | Denial of service | badge rendering | mitigate | VS Code truncates a 3-char badge silently, producing a WRONG answer; an independent sweep asserts `length === 2` across every severity × readiness × platform combination |
| T-GYE-05 | Tampering | citation integrity | mitigate | No todo file is renamed, moved or re-slugged; task 1's `done` requires `git diff --cached --name-status` to show `M` on every path and zero `R`/`A`/`D` |
| T-GYE-06 | Tampering | concurrent session's working tree | mitigate | All commits explicit-path with `git diff --cached --name-only` read first; `git add -A`, `git stash` and `git checkout --` are forbidden (the last fires the post-checkout hook) |
| T-GYE-SC | Tampering | package installs | accept | No npm/pip/cargo install in this task — Python stdlib and existing Node only, so the supply-chain surface is unchanged |
</threat_model>

<verification>
- `python3 .planning/todos/todo-frontmatter-gate.py --self-test` → passes
- `python3 meta/runPlanningGates.py` → `9/9 planning gates passed.`
- Frontmatter-only sweep over `pending/` → no `BAD` lines
- `node ~/.vscode/extensions/gsd-phase-status/test-parse.js` → `All parser tests passed.`
- Independent 2-char cap sweep → `CAP OK`
- `git log --oneline -2` → exactly two commits, both explicit-path, neither touching `src/`
</verification>

<success_criteria>
1. Every file in `.planning/todos/pending/` carries in-vocabulary `severity`, `platform` and
   `ready`, with no file renamed or moved.
2. A bad or missing value fails `pnpm planning-gates` in CI, and the gate was OBSERVED failing on
   the pre-normalization corpus — not merely assumed to be capable of it.
3. `MINIMUM_EXPECTED_GATES = 9` with an `8 -> 9` house-style rationale comment.
4. Pending todos in the Explorer render a 2-char severity+readiness badge in a readiness colour;
   completed todos and both folder count badges are unchanged.
5. `test-parse.js` is green, pins all 10 ladder rungs, the 2-char cap and the unrecognised-value
   fallback, and retains its 13 pre-existing `todo:` assertions.
6. The SUMMARY records: the corpus size actually measured, the three adjudicated severities with
   their justification, the RED finding count from the pre-normalization gate run, and a plain
   statement that the four extension files are captured by no GameLib commit.
</success_criteria>

<output>
Create `.planning/quick/260908-gye-todo-triage-decorations-normalize-todo-f/260908-gye-SUMMARY.md` when done.
</output>
