---
phase: quick-260905-upz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260905-upz-staleness-audit-of-the-41-pending-todos-/260905-upz-AUDIT.md
  - .planning/todos/pending/2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md
  - .planning/todos/pending/2026-08-25-installed-json-watcher-not-ported-to-tauri.md
  - .planning/todos/pending/2026-08-24-move-game-is-broken-on-macos-rsync-flags-openrsync-rejects.md
  - .planning/todos/pending/2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable.md
  - .planning/todos/pending/2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md
  - .planning/todos/completed/
  - .planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md
  - .planning/todos/pending/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md
  - .planning/todos/pending/2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "Every verdict in the audit ledger cites a command and its verbatim output, run in this session"
    - "The five audited candidates each carry a three-valued verdict: DISCHARGED / LIVE / PARTIAL"
    - "Every PARTIAL produced BOTH a closure record AND a newly filed residue todo"
    - "No source file outside .planning/ is modified by this task"
    - "The commit contains only explicitly named .planning/ paths — enrichmentFlows.test.ts and .planning/debug/anticheat-response-frame-drop.md are absent from it"
    - "The remaining pending todos each carry a verdict row, including an explicit UNVERIFIABLE-OFFLINE where the discharge condition needs live hardware or a human gesture"
  artifacts:
    - path: ".planning/quick/260905-upz-staleness-audit-of-the-41-pending-todos-/260905-upz-AUDIT.md"
      provides: "Per-todo verdict ledger with command + verbatim output for every row"
      contains: "DISCHARGED"
    - path: ".planning/todos/pending/2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance.md"
      provides: "Re-filed residue from the PathSelectionBox PARTIAL"
      contains: "message.unsync"
    - path: ".planning/todos/pending/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md"
      provides: "Re-filed residue from the 08-24 watcher todo's third clause (main.ts is gone)"
      contains: "bootstrap.ts"
    - path: ".planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md"
      provides: "Re-filed residue from the 08-25 watcher todo's unsatisfied second discharge clause"
      contains: "getDefaultSavePath"
  key_links:
    - from: ".planning/todos/completed/2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md"
      to: ".planning/todos/pending/2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance.md"
      via: "closure record names its residue todo by filename"
      pattern: "egs-sync-and-unsync-dialogs-are-indistinguishable"
    - from: ".planning/todos/completed/2026-08-25-installed-json-watcher-not-ported-to-tauri.md"
      to: ".planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md"
      via: "closure record names its residue todo by filename"
      pattern: "getdefaultsavepath-live-redrive"
---

<objective>
Re-establish the accuracy of `.planning/todos/pending/` (41 files) against HEAD, so the queue can be
used to select overnight work without shipping already-fixed items.

Purpose: several todos record a discharge condition HEAD now satisfies, but nobody re-checked. A
queue that reads as open work when the work is done wastes the exact hours it is about to be used to
allocate.

Output: an audit ledger with a per-todo verdict backed by a command and its verbatim output; five
candidate todos adjudicated three-valued (DISCHARGED / LIVE / PARTIAL); closure records appended and
files moved for those that close; three residue todos newly filed so no unsatisfied clause is buried
by a satisfied one.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/todos/completed/humble-user-info-404-two-candidates-undiscriminated.md

Read that completed record FIRST and copy its shape. Do not invent a new closure format. Its shape,
which every closure in this task must follow:

1. **Frontmatter edits, in place:**
   - `status:` becomes a prose sentence: `"RESOLVED 2026-09-05 by quick-260905-upz. <what discharged
     it, in one clause> <what is NOT claimed, in one clause>"`
   - add `discharged: 2026-09-05`
   - add `discharged_by: quick-260905-upz`
   - leave every other field (created, title, source, severity, resolves_phase, blocked_by, files)
     untouched.
2. **An appended section at the end of the body**, `## Disposition (2026-09-05, quick-260905-upz) — DISCHARGED`
   (or `— PARTIAL, closes on the mechanism only` where that is the verdict), containing, in order:
   - **The observation** — the command run and its verbatim output, in a fenced block.
   - **The claim that MAY now be made.**
   - **The claim that still may NOT be made.**
   - **Residue and its owner** — either a named newly-filed todo, or an explicit statement that
     there is none.
3. **`git mv`** the file from `.planning/todos/pending/` to `.planning/todos/completed/`, keeping
   the filename unchanged.

## Hard constraints on this task

- **Commit scope is `.planning/` only.** This audit changes no source file. If a fix looks
  one-line-obvious, that is out of scope — file a todo instead.
- **Never `git add -A`, never `git commit -a`, never `git add .`.** Stage explicit paths only.
  Two paths belong to a concurrent session and MUST NOT appear in this commit:
  `src/backend/sidecar/__tests__/enrichmentFlows.test.ts` (modified) and
  `.planning/debug/anticheat-response-frame-drop.md` (untracked). This project has a recorded
  history of commits absorbing whatever was already staged.
- **A verdict recorded from prose, or inherited from a previous agent's assertion, does not count.**
  Every row in the ledger cites a command actually run in this session and its actual output. The
  triage notes below are leads, not findings — re-run each one.
- **`2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` is deliberately PARKED with a
  written unpark condition.** Record it as PARKED in the ledger and move on. An audit may not
  reopen or close a parked item.

## Two evidence traps this project has already paid for

- **A build artifact is not HEAD.** `build/main/sidecar.js` can postdate or predate the source. Any
  grep against it is corroboration; the load-bearing evidence is the SOURCE file. Record both, and
  record the mtime comparison.
- **`grep -c` counts comments.** A file whose comment mentions its own subject satisfies a naive
  gate. Strip comments before counting a code artifact:
  `grep -vE '^\s*(//|\*|/\*)' <file> | grep -c '<token>'`. Use raw (unstripped) grep only when
  asserting a token is ABSENT.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-confirm the five candidates against HEAD and open the audit ledger</name>
  <files>.planning/quick/260905-upz-staleness-audit-of-the-41-pending-todos-/260905-upz-AUDIT.md</files>
  <action>
Create the ledger and populate its first section by RUNNING each command below and pasting its
actual output. Do not paste the expectations written here — they are leads from triage, and the
whole point of this audit is that a verdict recorded without a re-run is worthless. Where an
observed output disagrees with a lead, the observed output wins and the verdict changes.

**Candidate group A — the two `installed.json` watcher todos** (`2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md`, `2026-08-25-installed-json-watcher-not-ported-to-tauri.md`).
Run, and record verbatim:
  - `ls -la src/backend/sidecar/installedJsonWatcher.ts`
  - `grep -vE '^\s*(//|\*|/\*)' src/backend/sidecar/bootstrap.ts | grep -n 'startInstalledJsonWatcher'` — the comment-stripped count of real import + call site, NOT the raw grep (bootstrap.ts:661 is a comment naming the module and would satisfy a naive gate).
  - `grep -c "installed.json updated, refreshing library" build/main/sidecar.js` — this is the exact string BOTH todos named as their discharge condition, and both recorded `0`.
  - `ls -la build/main/sidecar.js src/backend/sidecar/installedJsonWatcher.ts` — record which is newer, and state in the ledger whether the bundle postdates the source. If it does not, say so and lean on the source evidence.
  - `ls src/backend/main.ts` — the 08-24 todo's third clause targets a file that must be shown absent.

**Candidate group B — the two rsync todos** (`2026-08-24-move-game-is-broken-on-macos-rsync-flags-openrsync-rejects.md`, `2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable.md`).
Both todos carry a "Not yet established" clause. Read those clauses first (`grep -n -A12 'Not yet established' <file>`), then run:
  - `sed -n '1200,1245p' src/backend/utils.ts` — the flavour probe and the branched flag list.
  - `grep -vE '^\s*(//|\*|/\*)' src/backend/utils.ts | grep -n "rsyncFlavour\|no-human-readable"` — comment-stripped, so the long explanatory comment block at 1205-1226 cannot satisfy the gate on its own.
  - `grep -rn "moveOnUnix\|moveInstall" src/backend/storeManagers/legendary/games.ts src/backend/storeManagers/gog/games.ts` — answers the "which call site builds the flag list" clause.
  Then judge, explicitly and in writing, whether each todo's "Not yet established" clause is now ANSWERED by that code, or only partly. If only partly, the verdict is PARTIAL, not DISCHARGED.

**Candidate group C — `2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md`.**
  - `grep -vE '^\s*(//|\*|/\*)' src/frontend/components/UI/PathSelectionBox/index.tsx | grep -n "commitFromBlur\|commitPath"` — establishes the rename and that no blur path bypasses the guard.
  - `sed -n '100,120p' src/frontend/components/UI/PathSelectionBox/index.tsx` — guard G1.
  - `grep -n "message.unsync\|message.sync\|title:" src/frontend/screens/Settings/components/EgsSettings.tsx` — the todo's item #3 residue.
  The todo lists THREE suggested fixes. Score each of the three separately in the ledger. Item #2 (guard the blur route) and item #3 (make the two dialogs distinguishable) have different answers; recording one verdict for the todo as a whole is exactly the failure this audit exists to correct.

**Known-live group — a QUICK re-check only, one command each, then stop.** Do not investigate
these further; the goal is only to confirm they have not silently been fixed:
  - `2026-08-22-steam-getgameinfo-returns-empty-on-async-cache-miss.md` — grep for `return {} as GameInfo` in the Steam store manager.
  - `2026-08-31-tray-about-window-opens-without-focus-on-secondary-display.md` — grep `src-tauri/src/` for `showAboutWindow` and for a nearby `set_focus`.
  - `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` — grep `src-tauri/src/main.rs` for `acquire_single_instance` and its unix-only guard.
  - `2026-09-03-lint-translations-is-structurally-blind-to-an-absent-key.md` — `sed -n '130,155p' meta/lintTranslations.ts`, confirm `checkFileAgainstEnglish` still iterates the TRANSLATION's keys.
  - `2026-09-03-six-gamelib-keys-are-empty-in-english-so-never-localisable.md` — a recursive scan of `public/locales/en/gamelib.json` counting empty strings; record the count and the key names, not just "still 6".
  - `2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md` — `sed -n '295,315p' src/frontend/.../MainButton.tsx`, confirm the guard still lacks `!is.installing`.

Write each as a ledger row: todo filename | command | verbatim output (abridged only by line count, never by editing) | verdict (DISCHARGED / LIVE / PARTIAL / PARKED). Do not move or edit any todo file in this task.
  </action>
  <verify>
    <automated>test -f .planning/quick/260905-upz-staleness-audit-of-the-41-pending-todos-/260905-upz-AUDIT.md && for t in DISCHARGED LIVE PARTIAL PARKED; do grep -q "$t" .planning/quick/260905-upz-staleness-audit-of-the-41-pending-todos-/260905-upz-AUDIT.md || { echo "MISSING VERDICT KIND: $t"; exit 1; }; done; echo OK; git status --porcelain -- src/ | grep -v 'enrichmentFlows.test.ts' | grep . && { echo "SOURCE FILE TOUCHED"; exit 1; }; echo "NO SOURCE CHANGES"</automated>
  </verify>
  <done>Ledger exists; all five candidates and all six known-live todos carry a row with a real command and its real output; all four verdict kinds appear; `git status` shows no source-tree change beyond the concurrent session's pre-existing `enrichmentFlows.test.ts`.</done>
</task>

<task type="auto">
  <name>Task 2: Adjudicate the five candidates — closure records, moves, and residue todos</name>
  <files>.planning/todos/pending/2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md, .planning/todos/pending/2026-08-25-installed-json-watcher-not-ported-to-tauri.md, .planning/todos/pending/2026-08-24-move-game-is-broken-on-macos-rsync-flags-openrsync-rejects.md, .planning/todos/pending/2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable.md, .planning/todos/pending/2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md, .planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md, .planning/todos/pending/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md, .planning/todos/pending/2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance.md</files>
  <action>
Act on Task 1's verdicts, in the closure shape copied from
`.planning/todos/completed/humble-user-info-404-two-candidates-undiscriminated.md`. Every closure
record's "observation" section pastes the command and output ALREADY CAPTURED in the ledger — the
record and the ledger must agree token-for-token, because a summary that disagrees with its own
evidence is a defect this project has recorded.

**A1 — `2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md`: PARTIAL → close, with residue re-filed.**
The headline defect (watcher absent from the sidecar) is answered by the source call site plus the
bundle string. The todo's third clause — "sweep `main.ts` for other unported non-handler side
effects (`watch(`, `setInterval`, `.on(` subscriptions)" — cannot be executed as written, because
`src/backend/main.ts` no longer exists. That clause is RE-FILED, not retired: the question it asks
(does the sidecar's own bootstrap carry every non-handler side effect the Electron main once had)
is still answerable and still unanswered, and the file's disappearance changed the target, not the
question. Its "may NOT be claimed" section must say plainly that no sweep was performed.
File `.planning/todos/pending/2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md`,
targeting `src/backend/sidecar/bootstrap.ts` and the sidecar import graph, carrying the same
`watch(` / `setInterval` / `.on(` search terms and the same cheap decisive test the original
described (grep the bundle for a distinctive log string per candidate side effect). Name the
originating todo in its `source:` field.

**A2 — `2026-08-25-installed-json-watcher-not-ported-to-tauri.md`: PARTIAL → close on the mechanism only, with residue re-filed.**
This todo's discharge condition is a conjunction: the watcher is ported AND a live re-drive of
`getDefaultSavePath` against a real legendary title returns a non-empty save path on the FIRST call.
The grep satisfies the first conjunct only. Close it on the mechanism being present, and title the
disposition section `— PARTIAL, closes on the mechanism only`. The "may NOT be claimed" section must
state that the reported symptom has never been re-observed as fixed. File
`.planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md`
carrying the live re-drive verbatim as its sole discharge condition, `severity: medium`,
`blocked_by:` naming that it needs a live app session with an installed legendary title (not
externally blocked, just unscheduled). Do not let the satisfied conjunct close the record for the
unsatisfied one.

**B — the two rsync todos.** Adjudicate per Task 1's finding on their "Not yet established" clauses.
If those clauses are answered by `utils.ts:1204-1233` and the call-site grep, both close as
DISCHARGED with no residue, and each record must say what is NOT claimed: the flavour branch has not
been exercised live on macOS in this session, so this closes on code, not on an observed move. If a
clause is only partly answered, close as PARTIAL and file the remainder. Cross-reference the two
records to each other as the same root cause.

**C — `2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md`: PARTIAL → close, with residue re-filed.**
Suggested fixes #1/#2 are satisfied by guard G1 in `commitPath`. Suggested fix #3 is NOT: the sync
and unsync outcomes still render under an identical `title: 'EGS Sync'`. File
`.planning/todos/pending/2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance.md`
carrying that residue verbatim, citing the concrete line evidence from the ledger, `area: ui-settings`,
`severity: minor`, `files:` naming `src/frontend/screens/Settings/components/EgsSettings.tsx`.
Note in it that this is now the ONLY live part of its parent, and that the parent's own argument
still holds: a one-word body difference under a shared title was misread once already by the
operator, and every other path reaching that dialog still carries the misreport.

Each of the three new todos must use the frontmatter shape of an existing pending todo (created,
title, area/source, status, severity, files, and — where it applies — `blocked_by` and
`resolves_phase`). Set `resolves_phase: null` or omit it: none of these is owned by a live phase,
and none may be auto-closed by one.

Then `git mv` each of the five adjudicated files from `.planning/todos/pending/` to
`.planning/todos/completed/`, filenames unchanged. Finally append a `## Adjudication` section to
the ledger recording, per todo, the verdict, the destination, and the residue todo filename or the
words "no residue".
  </action>
  <verify>
    <automated>set -e; for f in 2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md 2026-08-25-installed-json-watcher-not-ported-to-tauri.md 2026-08-24-move-game-is-broken-on-macos-rsync-flags-openrsync-rejects.md 2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable.md 2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md; do test ! -e ".planning/todos/pending/$f" || { echo "STILL PENDING: $f"; exit 1; }; test -f ".planning/todos/completed/$f" || { echo "NOT IN COMPLETED: $f"; exit 1; }; grep -q "discharged_by: quick-260905-upz" ".planning/todos/completed/$f" || { echo "NO DISCHARGE STAMP: $f"; exit 1; }; grep -q "quick-260905-upz)" ".planning/todos/completed/$f" || { echo "NO DISPOSITION SECTION: $f"; exit 1; }; done; for n in 2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md 2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md 2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance.md; do test -f ".planning/todos/pending/$n" || { echo "RESIDUE TODO MISSING: $n"; exit 1; }; done; grep -q "egs-sync-and-unsync-dialogs-are-indistinguishable" .planning/todos/completed/2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md || { echo "PARTIAL DOES NOT NAME ITS RESIDUE"; exit 1; }; grep -q "getdefaultsavepath-live-redrive" .planning/todos/completed/2026-08-25-installed-json-watcher-not-ported-to-tauri.md || { echo "PARTIAL DOES NOT NAME ITS RESIDUE"; exit 1; }; grep -q "sidecar-bootstrap-never-swept" .planning/todos/completed/2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md || { echo "PARTIAL DOES NOT NAME ITS RESIDUE"; exit 1; }; echo OK</automated>
  </verify>
  <done>Five files moved to `.planning/todos/completed/`, each stamped `discharged_by: quick-260905-upz` and each carrying a disposition section in the copied shape; three residue todos exist in pending; every PARTIAL closure names its residue todo by filename; the ledger's `## Adjudication` section agrees with the filesystem.</done>
</task>

<task type="auto">
  <name>Task 3: Sweep the remaining pending todos, record verdicts, and commit .planning only</name>
  <files>.planning/quick/260905-upz-staleness-audit-of-the-41-pending-todos-/260905-upz-AUDIT.md</files>
  <action>
Task 1 covered 11 of the 41 and 1 is PARKED. Sweep the ~29 not yet examined. This is a BOUNDED
triage, not an investigation — the budget is one command per todo.

Per todo, in this order:
  1. Read frontmatter plus whichever of `## Discharge condition` / `## Suggested fix` /
     `## Greppable landmarks` / `## Not yet established` the file has, using
     `grep -n -A15 '^## \(Discharge condition\|Suggested fix\|Greppable landmarks\|Not yet established\)' <file>`.
     Do not read the whole body.
  2. Decide whether the discharge condition is CHEAPLY CHECKABLE — one grep, one `sed -n`, one
     `test -f`. If it needs a live app session, real hardware, a human gesture, a network probe, a
     translation review, or a full test run, record verdict `UNVERIFIABLE-OFFLINE`, note in one
     clause WHY, leave it open, and move to the next. Do not attempt it.
  3. If it is cheaply checkable, run that ONE command, paste the output, and record
     `LIVE` or `DISCHARGE-CANDIDATE`.

Then handle any `DISCHARGE-CANDIDATE` rows:
  - If there are 3 or fewer, adjudicate them fully in this task using Task 2's closure procedure
    (closure record in the copied shape + `git mv` + a residue todo for any unsatisfied clause).
  - If there are more than 3, leave every one of them PENDING and file a single follow-up todo
    `.planning/todos/pending/2026-09-05-n-pending-todos-look-discharged-at-head-but-were-not-adjudicated.md`
    naming each candidate filename and the command that flagged it. Closing on a one-command signal
    without reading the todo's full residue clauses is precisely the failure mode this audit exists
    to correct — a bounded sweep may FLAG, it may not silently CLOSE at volume.

Finish the ledger with a `## Queue state after audit` section: the pending count before (41), the
count moved to completed, the count of newly filed todos, the count after, and a one-line-per-verdict
tally. Derive every number with `ls .planning/todos/pending/ | wc -l`, not by arithmetic on
assumptions.

Then commit. Stage EXPLICIT PATHS ONLY — never `git add -A`, `git add .`, or `git commit -a`:
  - `git add .planning/quick/260905-upz-staleness-audit-of-the-41-pending-todos-/`
  - `git add .planning/todos/pending/ .planning/todos/completed/`
  - `git status --porcelain --cached` and CONFIRM the staged set contains no path under `src/` and
    does not contain `.planning/debug/anticheat-response-frame-drop.md`. If either appears,
    `git restore --staged` it before committing.
  - `git commit -m "docs(quick-260905-upz): staleness audit of the pending todo queue"`
  </action>
  <verify>
    <automated>set -e; L=.planning/quick/260905-upz-staleness-audit-of-the-41-pending-todos-/260905-upz-AUDIT.md; grep -q "Queue state after audit" "$L" || { echo "NO QUEUE STATE SECTION"; exit 1; }; grep -q "UNVERIFIABLE-OFFLINE" "$L" || { echo "SWEEP RECORDED NO UNVERIFIABLE ROWS -- implausible, re-check"; exit 1; }; git show --stat --name-only HEAD | grep -E '^src/' && { echo "COMMIT TOUCHED SOURCE"; exit 1; }; git show --name-only HEAD | grep -q 'anticheat-response-frame-drop' && { echo "COMMIT ABSORBED CONCURRENT SESSION FILE"; exit 1; }; git status --porcelain -- src/backend/sidecar/__tests__/enrichmentFlows.test.ts | grep -q '^ M' || { echo "CONCURRENT SESSION WORK NO LONGER UNCOMMITTED -- it was absorbed or reverted"; exit 1; }; test -f .planning/debug/anticheat-response-frame-drop.md || { echo "CONCURRENT SESSION FILE GONE"; exit 1; }; git status --porcelain .planning/todos | grep . && { echo "TODO CHANGES UNCOMMITTED"; exit 1; }; echo OK</automated>
  </verify>
  <done>Every one of the 41 original pending todos has a verdict row in the ledger; the queue-state tally is derived from `ls | wc -l`; one commit exists touching `.planning/` only; `enrichmentFlows.test.ts` is still modified-and-unstaged and `.planning/debug/anticheat-response-frame-drop.md` is still untracked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| audit record → future work selection | A verdict written here directly gates whether an overnight run picks up a task. A false DISCHARGED buries live work; a false LIVE burns hours re-fixing a fixed bug. |
| executor working tree → git index | A concurrent session holds uncommitted work in the same tree. The commit boundary is where that work can be absorbed. |
| build artifact → HEAD claim | `build/main/sidecar.js` is not the source. A grep against it can assert something about a build that no longer matches HEAD. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-upz-01 | Tampering | Audit ledger verdicts | mitigate | Every row must cite a command run in THIS session plus its verbatim output. The plan's leads are explicitly labelled as leads, and the executor is told that observed output overrides them. Task 1's gate requires all four verdict kinds present. |
| T-upz-02 | Tampering | `git commit` scope | mitigate | Explicit-path staging only; `git add -A`/`git commit -a`/`git add .` forbidden in text; Task 3 gate asserts the commit touched no `src/` path AND that both concurrent-session paths are still in their pre-task state. |
| T-upz-03 | Repudiation | PARTIAL closures burying residue | mitigate | Three-valued verdicts are mandatory; Task 2's gate greps each PARTIAL closure record for the filename of its residue todo, so a closure that names no residue fails the gate. |
| T-upz-04 | Information disclosure | Build-artifact grep passed off as a HEAD claim | mitigate | Task 1 requires an mtime comparison between bundle and source, and requires the ledger to state whether the bundle postdates the source; source evidence is designated load-bearing. |
| T-upz-05 | Tampering | Comment prose satisfying a grep gate | mitigate | All positive code-artifact greps are comment-stripped (`grep -vE '^\s*(//|\*|/\*)'`); raw grep reserved for absence claims. `bootstrap.ts:661` and `utils.ts:1205-1226` are named as the specific comment blocks that would otherwise pass. |
| T-upz-06 | Elevation of privilege | Bounded sweep silently closing at volume | mitigate | Task 3 caps auto-adjudication at 3 candidates; beyond that it may only FLAG into a follow-up todo. |
| T-upz-SC | Tampering | package installs | accept | No package installs in this task; `.planning/`-only changes, no dependency surface. |
</threat_model>

<verification>
- `ls .planning/todos/pending/ | wc -l` equals 41 − (moved) + (newly filed), and that arithmetic is stated in the ledger.
- No file under `src/`, `src-tauri/`, or `meta/` differs from HEAD except the concurrent session's pre-existing `enrichmentFlows.test.ts`.
- `git log -1 --name-only` shows only `.planning/` paths, and does not show `.planning/debug/anticheat-response-frame-drop.md`.
- Every closure record in `.planning/todos/completed/` stamped `discharged_by: quick-260905-upz` contains a fenced block with real command output.
- `2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` is still in `.planning/todos/pending/`, unmodified.
</verification>

<success_criteria>
- The pending queue can be handed to an overnight run without shipping already-fixed work: every remaining file carries a verdict backed by a re-run command.
- No satisfied clause closed a record for an unsatisfied one — each PARTIAL produced both a closure record and a named residue todo.
- The concurrent session's two paths survive the task in exactly the state they started in.
</success_criteria>

<output>
Create `.planning/quick/260905-upz-staleness-audit-of-the-41-pending-todos-/260905-upz-SUMMARY.md` when done.
</output>
