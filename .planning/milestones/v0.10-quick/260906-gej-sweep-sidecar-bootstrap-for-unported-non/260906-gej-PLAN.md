---
phase: quick-260906-gej
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [QUICK-260906-GEJ]
files_modified:
  - .planning/todos/pending/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md
  - .planning/todos/pending/2026-09-06-queued-gog-playtime-never-drains-at-boot.md
  - .planning/todos/pending/2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md
  - .planning/todos/pending/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md
  - .planning/todos/pending/2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md
  - .planning/todos/pending/2026-09-06-checkrosettainstall-never-runs-under-tauri.md
  - .planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md
  - .planning/todos/pending/2026-09-06-disable-smooth-scrolling-accessibility-toggle-is-inert.md
  - .planning/todos/pending/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md
  - .planning/todos/completed/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md
  - .planning/STATE.md

must_haves:
  truths:
    - "Eight new pending todos exist, one per FINDINGS.md A1-A7 plus the section-D inert-toggle residue"
    - "Each new todo carries its own bundle-level evidence (sidecar.js line numbers or zero-occurrence counts) verbatim from FINDINGS.md, so no future reader must re-derive it"
    - "The 2026-09-05 sweep todo is out of pending/, in completed/, status RESOLVED, and its resolution records that the sweep target WAS recoverable from git"
    - "The resolution section links all eight spawned todos by filename"
    - "STATE.md's Quick Tasks Completed table has one new row for 260906-gej"
    - "No file under src/ or src-tauri/ is created, modified, or staged by this task"
    - "Nothing from FINDINGS.md sections B, C, or E became a todo"
  artifacts:
    - path: ".planning/todos/pending/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md"
      provides: "A1 defect record"
      contains: "23940"
    - path: ".planning/todos/pending/2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md"
      provides: "A5 defect record"
      contains: "15102"
    - path: ".planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md"
      provides: "A7 defect record, Windows-only"
      contains: "verifiable_on"
    - path: ".planning/todos/completed/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md"
      provides: "closed sweep todo with resolution"
      contains: "RESOLVED"
  key_links:
    - from: ".planning/todos/completed/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md"
      to: "the eight spawned todos"
      via: "resolution section filename list"
      pattern: "2026-09-06-.*\\.md"
    - from: "each new todo"
      to: "this quick task"
      via: "source: frontmatter field"
      pattern: "quick-260906-gej"
---

<objective>
Record the already-complete sidecar-bootstrap sweep as durable planning artefacts: file eight new
pending todos for the confirmed-unported side effects, close the sweep todo that commissioned the
work, and log the task in STATE.md.

Purpose: FINDINGS.md is a one-off document inside a quick-task directory. Nothing in the todo
queue points at it, so A1 (permanently-wedged GOG playtime lock) and A5 (Steam install badges
never reconcile) — both with live user-visible consequences on the operator's own macOS machine —
would be invisible to every future queue sweep. Todos are the only artefact this project actually
re-reads.

Output: 8 new files in `.planning/todos/pending/`, 1 file moved pending → completed with a
resolution section, 1 row appended to STATE.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260906-gej-sweep-sidecar-bootstrap-for-unported-non/260906-gej-FINDINGS.md
@.planning/todos/pending/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md
@.planning/todos/pending/2026-09-01-helper-processes-orphan-on-app-quit-no-before-quit-hook-under-tauri.md
@.planning/todos/pending/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md
</context>

<scope_boundaries>
**FINDINGS.md is LOCKED INPUT.** The sweep is finished. Do not re-run any part of it. Do not
re-grep `build/main/sidecar.js`. Do not re-recover `src/backend/main.ts` from git. Do not
"verify" or revise any claim, line number, or count in FINDINGS.md. Copy its evidence forward
verbatim. If a FINDINGS.md claim looks wrong to you, record the doubt in the SUMMARY — do not
act on it.

**This is a documentation task. NO CODE.** Do not create, edit, or delete any file under `src/`
or `src-tauri/`. The defects are being RECORDED, not fixed. Fixing them is future work owned by
the todos you are about to file.

**Do NOT file todos for these — stated so you do not over-file:**
- **Section B** (DXVK / Winetricks / default-Wine startup pre-fetch, now lazy at first use) is a
  recorded, accepted degradation. Correctness is intact. NOT a defect, NOT a todo.
- **Section C** (12 rows) is already ledgered elsewhere — ported, accepted-gap, or covered by an
  existing todo. Files nothing new.
- **Section E** (window-bounds persistence) is explicitly out of scope for this sweep. It belongs
  to a future shell-side sweep. NOT a todo.
- **Section D's five Electron-only switches** are correctly absent. Only the ONE named residue
  (`disableSmoothScrolling`'s now-inert Accessibility toggle) becomes a todo.

**Do not run `graphify update .`** — no source changes.
**Do not touch ROADMAP.md.**
</scope_boundaries>

<known_hazards>
Read before touching anything.

1. **`gsd-sdk` state-write verbs CORRUPT STATE.md.** This has recurred repeatedly; the most
   recent instance (quick 260905-mv5) deleted 865 lines. Update STATE.md by **direct file edit
   only**. Do not invoke any `gsd-sdk` `state.*` verb.
2. **`gsd-sdk query commit` stages the entire tree.** Do not use it. Commit with plain
   `git add <explicit paths>` + `git commit`.
3. **The working tree already carries unrelated state** that must NOT be swept into this
   commit: `.claude/skills/archify/` (untracked) and `skills-lock.json` (untracked).
   **Never `git add -A` or `git add .`.** Stage only the paths this plan names.

   ORCHESTRATOR CORRECTION (applied after planning, before dispatch): a CONCURRENT session
   advanced HEAD from `36832a3df` to `82393c01c` while this plan was being written, committing
   `src/backend/sidecar/__tests__/enrichmentFlows.test.ts` and
   `.planning/debug/anticheat-response-frame-drop.md` in `5ac8b8e66`/`82393c01c`. Both are now
   clean and tracked, so this plan's original description of them as pending working-tree state
   is stale. Two of this plan's own gates were written against that stale snapshot and have been
   corrected in place (Task 1's `2026-09-06-*.md` glob count, Task 3's `^ M` assertion) — see the
   inline notes at each. Do not "restore" either gate to its original form.

5. **`2026-09-06-*.md` in `.planning/todos/pending/` is NOT an empty namespace.** The concurrent
   session above filed `2026-09-06-jest-run-orphans-gamelib-sidecar-spinning-at-100-cpu.md`, and
   `2026-09-06-bootstrapwirings-protocol-url-log-assertion-drops-under-load.md` already existed.
   Any check that counts that glob measures 2 pre-existing files plus this task's 8. Assert the
   8 by NAME, never by globbed count.
4. **`git checkout -- <file>` fires the post-checkout hook**, which triggers a binary download
   that throws. If you need to undo a file, use `git show HEAD:<path> > <path>` instead.
</known_hazards>

<tasks>

<task type="auto">
  <name>Task 1: File the eight new pending todos</name>
  <files>
.planning/todos/pending/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md
.planning/todos/pending/2026-09-06-queued-gog-playtime-never-drains-at-boot.md
.planning/todos/pending/2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md
.planning/todos/pending/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md
.planning/todos/pending/2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md
.planning/todos/pending/2026-09-06-checkrosettainstall-never-runs-under-tauri.md
.planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md
.planning/todos/pending/2026-09-06-disable-smooth-scrolling-accessibility-toggle-is-inert.md
  </files>
  <action>
Create exactly these eight files, with exactly these filenames (they are referenced by name from
Task 2's resolution section — do not rename them).

Follow the frontmatter and section shape of the exemplar
`.planning/todos/pending/2026-09-01-helper-processes-orphan-on-app-quit-no-before-quit-hook-under-tauri.md`.

**Frontmatter, every file:**
- `created: 2026-09-06`
- `title:` — one quoted sentence naming the defect, not the surface. State the consequence, not
  just the missing call.
- `area:` — `tauri-sidecar` for A1-A4, A6, A7; `tauri-sidecar` for A5 as well (the sidecar has no
  focus trigger); `frontend` for the D residue.
- `status: OPEN`
- `severity:` — per the mapping in the table below.
- `source: "quick-260906-gej, sweep FINDINGS.md section A row <An>"` (or `section D residue` for
  the eighth). This field is mandatory on all eight.
- `files:` — the in-tree files a fixer will need, with line numbers where FINDINGS.md gives them.
- `resolves_phase: null` — none of these is owned by a live phase.

**Body, every file** — three sections minimum:
- `## The unported side effect` — what old `main.ts` did, at which line, quoted from FINDINGS.md.
- `## Bundle-level evidence` — **copy the FINDINGS.md evidence cell verbatim**, including the
  literal `sidecar.js` line numbers and zero-occurrence counts. This is the whole point of the
  file: a future reader must not have to re-derive it. Note that the evidence was taken against
  `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27) so a later reader knows which bundle
  build it describes.
- `## Consequence` — copy the FINDINGS.md consequence cell.

Add a `## Fix sketch` section ONLY where FINDINGS.md gives enough to write one honestly (A1: clear
the stale lock at bootstrap; A5: no Tauri window-focus event is forwarded to the sidecar at all,
so the fix needs a shell-side listener first — say so). Where it does not, write nothing rather
than guessing. Do not invent verification requirements that FINDINGS.md does not support.

**Per-file content and severity:**

| File | Source row | Severity | Evidence that MUST appear literally |
|---|---|---|---|
| `2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md` | A1 | `major` | `playtimeSyncQueue.delete("lock")` appears exactly once, `sidecar.js:23940`, inside `syncQueuedPlaytime()` itself; guard at `gog/library.ts:170`; old site `main.ts:469` |
| `2026-09-06-queued-gog-playtime-never-drains-at-boot.md` | A2 | `medium` | only caller in bundle is `sidecar.js:23753` (`gog/games.ts:1346`, post-game-session); old site `main.ts:471` |
| `2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md` | A3 | `medium` | `setPresence` call sites `:2434` (own 5-min `setInterval`, armed only from inside a first call), `:2496`, `:8205`, `:8220`; **no startup call**; old site `main.ts:477` |
| `2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md` | A4 | `medium` | log string `User Not Found, removing it from Store` → **0 occurrences** in bundle; old site `main.ts:442-457` |
| `2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md` | A5 | `major` | `refreshInstallState` in bundle at `:15063` (doc comment) and `:15102` (method definition), **zero call sites**; old site `main.ts:272-274`; D-01/D-02 rationale and 8 unit tests survive, only the trigger is gone; `src-tauri/src/main.rs` has `set_focus()`/`.focused(true)` but forwards no focus **listener** |
| `2026-09-06-checkrosettainstall-never-runs-under-tauri.md` | A6 | `medium` | **0 occurrences** in bundle; in-tree at `utils.ts:1395`, referenced only by its own test file; old site `main.ts:241` |
| `2026-09-06-detectvcredist-never-runs-on-windows.md` | A7 | `medium` | **0 occurrences** in bundle; in-tree at `utils.ts:775`, re-exported `utils.ts:1789`, no caller; old site `main.ts:288` |
| `2026-09-06-disable-smooth-scrolling-accessibility-toggle-is-inert.md` | D residue | `minor` | the setting still renders a live toggle at `src/frontend/screens/Accessibility/index.tsx:51,232`; its only consumer was the deleted Electron `app.commandLine.appendSwitch('disable-smooth-scrolling')` (`main.ts:465`); the control is now inert |

**A7 additionally requires a `verifiable_on:` frontmatter field**, matching the shape used by
`.planning/todos/pending/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`:
`verifiable_on: "operator has a Windows machine (not primary OS)"`. It is the only one of the
eight that is unverifiable locally. Also add `platform: windows` to A7, per that same exemplar.

**A1 and A5 must state in their bodies that they are the two findings with live user-visible
consequences on macOS, the operator's platform** — that ranking is FINDINGS.md's own and is the
reason they carry `major`.

Do not create a ninth file. Do not file anything from sections B, C, or E.
  </action>
  <verify>
    <automated>
NEW8="gog-playtime-sync-lock-never-cleared-at-boot
queued-gog-playtime-never-drains-at-boot
gog-presence-never-set-at-startup-and-its-keepalive-never-arms
boot-time-epic-and-gog-user-reconciliation-lost
steam-refreshinstallstate-has-zero-call-sites
checkrosettainstall-never-runs-under-tauri
detectvcredist-never-runs-on-windows
disable-smooth-scrolling-accessibility-toggle-is-inert" &&
for n in $NEW8; do
  test -e ".planning/todos/pending/2026-09-06-$n.md" || { echo "MISSING: $n"; exit 1; }
  grep -q "quick-260906-gej" ".planning/todos/pending/2026-09-06-$n.md" || { echo "NO SOURCE: $n"; exit 1; }
  grep -q "^status: OPEN" ".planning/todos/pending/2026-09-06-$n.md" || { echo "NOT OPEN: $n"; exit 1; }
done &&
grep -q "23940" .planning/todos/pending/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md &&
grep -q "23753" .planning/todos/pending/2026-09-06-queued-gog-playtime-never-drains-at-boot.md &&
grep -q "2434" .planning/todos/pending/2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md &&
grep -q "User Not Found, removing it from Store" .planning/todos/pending/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md &&
grep -q "15102" .planning/todos/pending/2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md &&
grep -q "utils.ts:1395" .planning/todos/pending/2026-09-06-checkrosettainstall-never-runs-under-tauri.md &&
grep -q "verifiable_on" .planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md &&
grep -q "Accessibility/index.tsx" .planning/todos/pending/2026-09-06-disable-smooth-scrolling-accessibility-toggle-is-inert.md &&
echo TASK1_OK
    </automated>
  </verify>
  <done>
Exactly 8 files matching `.planning/todos/pending/2026-09-06-*.md` exist. Every one has
`status: OPEN`, a `severity:`, and `source:` naming `quick-260906-gej`. Every one carries its
own row's bundle evidence literally. A7 carries `verifiable_on:`. Nothing under `src/` or
`src-tauri/` changed.
  </done>
</task>

<task type="auto">
  <name>Task 2: Close the sweep todo with a resolution that corrects its own premise</name>
  <files>
.planning/todos/pending/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md (removed)
.planning/todos/completed/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md (created)
  </files>
  <action>
Move the file with `git mv` so the rename is recorded rather than appearing as a delete + add:

```
git mv .planning/todos/pending/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md \
       .planning/todos/completed/
```

Then edit the file **in its new location**:

**Frontmatter changes** — follow the shape of
`.planning/todos/completed/2026-08-25-installed-json-watcher-not-ported-to-tauri.md`:
- `status:` becomes a quoted multi-line string beginning `RESOLVED 2026-09-06 by quick-260906-gej.`
  and summarising the outcome: the question is answered **No** — seven side effects (A1-A7) are
  unported and were unledgered, three are silently degraded but not lost, one class (window
  concerns) was out of scope.
- Add `discharged: 2026-09-06`
- Add `discharged_by: quick-260906-gej`
- Leave `created`, `title`, `area`, `severity`, `files` as they are.

**Append a resolution section** at the end of the body, headed
`## Disposition (2026-09-06, quick-260906-gej) — RESOLVED`. It must contain:

1. **The premise correction, stated plainly.** This todo's own title and Context assert that "the
   original main.ts sweep target no longer exists" and quote an `ls` returning
   `No such file or directory`. That was a claim about the **working tree**, not about the
   repository. The file was recoverable, and was recovered:

   ```
   $ git log --oneline --all --diff-filter=D -- src/backend/main.ts
   5643c7583 feat(35-14)!: delete the Electron entry points — POINT OF NO RETURN (commit A)

   $ git show 5643c7583^:src/backend/main.ts   # 1561 lines
   ```

   State the consequence: the sweep did **not** have to fall back to this todo's own suggested
   "grep the sidecar and guess" approach (its Suggested-approach step 1). It got the exact
   pre-cutover file the parent todo wanted diffed. Note the generalisable lesson — a deleted file
   is not an absent file, and `ls` is the wrong instrument for asking whether a sweep target
   exists.

2. **The verdict**, quoted from FINDINGS.md's own answer: **No.** A1-A7 unported and unledgered;
   B degraded-not-lost; C already ledgered (12 rows, files nothing new); D correctly absent bar
   one inert-toggle residue; E out of scope with a named suspicion recorded for the next sweeper.

3. **The confirmation of the parent todo's generalisation:** every one of A1-A7 is invisible to a
   channel-by-channel IPC inventory because none of them carries a channel name.

4. **A link to the full write-up:**
   `.planning/quick/260906-gej-sweep-sidecar-bootstrap-for-unported-non/260906-gej-FINDINGS.md`

5. **The eight spawned todos, listed by exact filename**, each with a one-line description and its
   severity, in A1..A7 then D-residue order. Use the filenames created in Task 1 verbatim.

6. **What this closure does NOT cover**, so a future reader does not mistake RESOLVED for
   "everything is fine": section B's lost 2.5s background pre-fetch is an accepted cost, and
   section E (window bounds / maximise state persistence across launches) was never swept — the
   next sweeper starts from that named suspicion.

Do not check any checkbox that this todo does not have, and do not alter the todo's original body
text — the premise correction goes in the appended section, so the record shows both what was
believed and what was found.
  </action>
  <verify>
    <automated>
test ! -e .planning/todos/pending/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md &&
F=.planning/todos/completed/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md &&
test -e "$F" &&
grep -q "RESOLVED 2026-09-06 by quick-260906-gej" "$F" &&
grep -q "^discharged_by: quick-260906-gej" "$F" &&
grep -q "5643c7583" "$F" &&
grep -q "260906-gej-FINDINGS.md" "$F" &&
test "$(grep -o '2026-09-06-[a-z0-9-]*\.md' "$F" | sort -u | wc -l | tr -d ' ')" = "8" &&
for n in $(grep -o '2026-09-06-[a-z0-9-]*\.md' "$F" | sort -u); do test -e ".planning/todos/pending/$n" || { echo "DANGLING LINK: $n"; exit 1; }; done &&
echo TASK2_OK
    </automated>
  </verify>
  <done>
The sweep todo is gone from `pending/` and present in `completed/` with `status:` starting
`RESOLVED 2026-09-06 by quick-260906-gej`, `discharged_by:` set, the `5643c7583` recovery command
recorded as a correction to its own premise, a link to FINDINGS.md, and exactly 8 distinct
`2026-09-06-*.md` filenames listed — **each of which resolves to a file that actually exists in
`pending/`** (no dangling links). Pending count is now 47, completed 80.
  </done>
</task>

<task type="auto">
  <name>Task 3: Log in STATE.md and commit only this task's files</name>
  <files>.planning/STATE.md</files>
  <action>
**STATE.md — the Quick Tasks Completed table ONLY.**

Append one row at the very end of the table under `### Quick Tasks Completed` (around line 6385;
the last existing row is `260905-upz`). **Match the shape of the immediately preceding row
exactly** — note the live rows use FOUR columns
(`| id | Description | Date | [dir](path) |`) even though the header line declares five. Copy the
neighbouring row's column count, do not follow the header.

Row content:
- id: `260906-gej`
- Description: lead with the finding, not the activity. It must say the sweep target **was
  recoverable from git** (`git show 5643c7583^:src/backend/main.ts`, 1561 lines), contradicting
  the commissioning todo's own premise that it no longer existed; that the answer is **No** —
  7 unported and unledgered (A1-A7), 3 degraded-not-lost, 12 already ledgered, 1 class out of
  scope; that **A1 (GOG playtime `lock` cleared only on the success path at `sidecar.js:23940`,
  so one interrupted sync wedges playtime sync forever) and A5 (`refreshInstallState` has zero
  call sites — Steam install badges never reconcile, and no Tauri window-focus listener is
  forwarded to the sidecar at all)** are the two with live user-visible consequences on macOS;
  that every candidate was discharged against the **shipping bundle** rather than the source
  tree, so a symbol present only as a definition or a comment proves the effect cannot fire; and
  that 8 todos were filed and the commissioning todo closed. Mark the limits honestly: this task
  **recorded** defects and **fixed none**, A7 is Windows-only and unverifiable locally, and
  section E (window-bounds persistence) was never swept.
- Date: `2026-09-06`
- Directory link:
  `[260906-gej-sweep-sidecar-bootstrap-for-unported-non](.planning/quick/260906-gej-sweep-sidecar-bootstrap-for-unported-non/)`

Keep it on a single line — every row in this table is one physical line. Escape any `|` inside
the description.

**Do NOT touch** `stopped_at`, `last_activity`, `last_updated`, the `progress:` block, or any
other part of STATE.md. **Do NOT touch ROADMAP.md.** **Do NOT invoke any `gsd-sdk` `state.*`
verb** — edit the file directly.

**Commit.**

First confirm the index is clean so you do not absorb someone else's staged work:

```
git diff --cached --name-only
```

If that prints anything, stop and report rather than committing.

Then stage **only** these paths, explicitly. Never `git add -A`, never `git add .`:

```
git add .planning/todos/pending/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md \
        .planning/todos/pending/2026-09-06-queued-gog-playtime-never-drains-at-boot.md \
        .planning/todos/pending/2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md \
        .planning/todos/pending/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md \
        .planning/todos/pending/2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md \
        .planning/todos/pending/2026-09-06-checkrosettainstall-never-runs-under-tauri.md \
        .planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md \
        .planning/todos/pending/2026-09-06-disable-smooth-scrolling-accessibility-toggle-is-inert.md \
        .planning/todos/completed/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md \
        .planning/STATE.md \
        .planning/quick/260906-gej-sweep-sidecar-bootstrap-for-unported-non/
```

(The `git mv` in Task 2 already staged the deletion of the pending path; the explicit add of the
completed path completes the rename.)

**Before committing, prove the staged set is clean of code:**

```
git diff --cached --name-only | grep -E '^(src|src-tauri)/' && echo "ABORT: code staged" && exit 1
git diff --cached --name-only | grep -vE '^\.planning/' && echo "ABORT: non-planning path staged" && exit 1
```

Both must find nothing. In particular `.claude/skills/archify/` and `skills-lock.json` are
pre-existing untracked working-tree state and must remain untracked and unmodified.
(`enrichmentFlows.test.ts` and `.planning/debug/anticheat-response-frame-drop.md` were committed
by a concurrent session in `5ac8b8e66`/`82393c01c` and are now clean — see hazard 3.)

Commit message:

```
docs(quick-260906-gej): record the sidecar-bootstrap sweep — 8 todos filed, sweep todo closed
```

Then verify the commit touched nothing outside `.planning/`:

```
git show --stat --name-only HEAD
```
  </action>
  <verify>
    <automated>
grep -q "260906-gej" .planning/STATE.md &&
grep -c "^| 260906-gej |" .planning/STATE.md | grep -qx '1' &&
git diff --cached --name-only | wc -l | grep -qx '\s*0' &&
git show --name-only --pretty=format: HEAD | grep -v '^$' | grep -vE '^\.planning/' | wc -l | grep -qx '\s*0' &&
git show --name-only --pretty=format: HEAD | grep -c '^\.planning/todos/pending/2026-09-06-' | grep -qx '8' &&
test -z "$(git status --porcelain .claude/skills/archify skills-lock.json | grep -v '^??')" &&
echo TASK3_OK
    </automated>
  </verify>
  <done>
STATE.md has exactly one `260906-gej` row in the Quick Tasks Completed table, matching its
neighbours' column shape. `stopped_at`, `last_activity`, `progress:` and ROADMAP.md are
byte-identical to before. One commit exists whose file list is 100% under `.planning/` and
includes all 8 new todos, the moved todo (both sides of the rename), STATE.md, and the quick-task
directory. The index is empty. `.claude/skills/archify/` and `skills-lock.json` are still
untracked and unmodified, exactly as they were at task start.
  </done>
</task>

</tasks>

<verification>
Run after all three tasks:

```
# 8 new todos, all with a source pointing at this task
ls .planning/todos/pending/2026-09-06-*.md | wc -l          # expect 8
grep -L "quick-260906-gej" .planning/todos/pending/2026-09-06-*.md   # expect no output

# queue counts moved as predicted
ls .planning/todos/pending/ | wc -l                          # expect 47 (was 40, +8 -1)
ls .planning/todos/completed/ | wc -l                        # expect 80 (was 79)

# nothing from B / C / E leaked into a todo
grep -il "winetricks\|downloadDefaultWine\|DXVK.getLatest" .planning/todos/pending/2026-09-06-*.md   # expect no output
grep -il "window-props\|enter-full-screen" .planning/todos/pending/2026-09-06-*.md                   # expect no output

# no code touched, staged, or committed
git show --name-only --pretty=format: HEAD | grep -E '^(src|src-tauri)/'   # expect no output
git diff --cached --name-only                                              # expect empty
```

**Not verified here, and say so in the SUMMARY:** none of the eight recorded defects is fixed;
FINDINGS.md's bundle evidence was copied forward, not independently re-measured; section E remains
unswept.
</verification>

<success_criteria>
- 8 new pending todos exist with the exact filenames this plan names, each carrying its own
  bundle-level evidence verbatim and a `source:` of `quick-260906-gej`
- A1 and A5 carry `severity: major` and say why (live user-visible on macOS); A7 carries
  `verifiable_on:` and `platform: windows`; the D residue carries `severity: minor`
- The 2026-09-05 sweep todo is in `completed/`, `status:` RESOLVED, with a resolution that records
  the `git show 5643c7583^:src/backend/main.ts` recovery as a correction to the todo's own premise
  and links all 8 spawned todos with no dangling filenames
- Nothing from FINDINGS.md sections B, C, or E became a todo
- STATE.md gained exactly one Quick Tasks Completed row; nothing else in STATE.md changed;
  ROADMAP.md untouched
- One commit, 100% `.planning/` paths, with the four pre-existing working-tree items still
  unstaged
</success_criteria>

<output>
Create `.planning/quick/260906-gej-sweep-sidecar-bootstrap-for-unported-non/260906-gej-SUMMARY.md`
when done.
</output>
