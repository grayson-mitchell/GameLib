---
phase: quick-260924-tjg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md
  - .planning/todos/completed/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md
autonomous: true
requirements: [TODO-260924-python3-git-bash-store-stub]

must_haves:
  truths:
    - 'The python3/Git Bash todo is no longer in `.planning/todos/pending/` and IS in `.planning/todos/completed/`.'
    - 'The moved file carries `status: RESOLVED` — not OPEN, and not a newly-invented status value.'
    - 'The moved file carries a `## Resolution` section recording the 2026-09-24 re-measurement of all four Verification bullets with their concrete values.'
    - 'The Resolution section records the `type -a` evidence that names the actual mechanism (Bash will not resolve a bare name to a `.cmd`).'
    - 'The Resolution section states plainly that Direction item 4 (a CLAUDE.md conventions note) was decided AGAINST, and that enforcement is therefore essentially nil.'
    - 'The Resolution section states that Direction item 3 (disabling the Store app-execution alias) remains unverified and untested.'
    - '`package.json`, `CLAUDE.md`, and everything under `src/`, `meta/`, `src-tauri/`, `.github/` are byte-identical to HEAD.'
    - '`pnpm planning-gates` still reports 12/12 after the move.'
    - 'The move is recorded by git as a rename, not as a delete plus an unrelated add.'
  artifacts:
    - path: '.planning/todos/completed/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md'
      provides: 'The closed todo: original Problem/Why/Direction/Verification body, preserved intact, plus a Resolution section'
      contains: '## Resolution'
  key_links:
    - from: '.planning/todos/completed/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md'
      to: 'quick 260924-pm3'
      via: 'Resolution prose naming the incident this trap already caused'
      pattern: '260924-pm3'
---

<objective>
Close the `python3`-in-Git-Bash Store-stub todo as VERIFIED-NOT-A-DEFECT. Every one of the todo's
own four Verification bullets was re-measured on 2026-09-24 and reproduced exactly, so the todo's
premise still holds and nothing on this box has drifted.

**This plan changes no code.** It records evidence and moves one planning document.

Purpose: the todo describes a real trap (a red-looking command certifying a working one) that has
already produced a false claim in a planning doc once. The operator has decided against the only
remaining open item — Direction item 4's proposed CLAUDE.md conventions note — so there is nothing
left to build. The correct close-out is an honest record, not a fix.

Output: the todo, edited with a `## Resolution` section and `status: RESOLVED`, `git mv`'d from
`.planning/todos/pending/` to `.planning/todos/completed/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md
@CLAUDE.md

## Scope lock — read before touching anything

The operator has already made every decision this plan encodes. Do not reopen them.

**This plan MUST NOT modify:**

- `package.json` — the `python3 meta/runPlanningGates.py` invocation at line 42 stays exactly as
  written. Changing it to `python` would break Linux and macOS, where `python` frequently does not
  exist. This is Direction item 1 and it is settled.
- `CLAUDE.md` — Direction item 4 proposed a conventions note. The operator has now decided
  AGAINST it. Do not add one.
- Anything under `src/`, `meta/`, `src-tauri/`, `.github/`.
- `.planning/ROADMAP.md`.
- `.planning/STATE.md` — the Quick Tasks Completed row is the orchestrator's job, in its own step
  after this plan. The executor must not touch STATE.md.

**No new gate, test, or script.** A gate cannot catch "an agent misread an error string," and this
repo's CLAUDE.md repeatedly stamps out gates that appear to cover more than they do.

## Evidence already gathered — do NOT re-run these

All four Verification bullets were re-measured on 2026-09-24 this session and reproduced exactly.
These values are inputs to the Resolution prose, not work to be redone:

| measurement                        | result                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git Bash `python3 --version`       | `Python was not found; run without arguments to install from the Microsoft Store, or disable this shortcut from Settings > Apps > Advanced app settings > App execution aliases.`, **exit 49**      |
| Git Bash `python --version`        | `Python 3.12.10`                                                                                                                                                                                   |
| cmd `where python3`                | `C:\Users\grays\AppData\Local\Programs\Python\Python312\python3.cmd` **first**, then `C:\Users\grays\AppData\Local\Microsoft\WindowsApps\python3.exe` — ordering intact                             |
| `pnpm planning-gates`              | **12/12 planning gates passed**                                                                                                                                                                    |
| Git Bash `type -a python3` (extra) | returns ONLY `/c/Users/grays/AppData/Local/Microsoft/WindowsApps/python3` — the `python3.cmd` shim is invisible to bare-name resolution in Bash. This names the mechanism.                          |
| Git Bash `type -a python` (extra)  | returns `/c/Users/grays/AppData/Local/Programs/Python/Python312/python` first                                                                                                                      |

## Convention evidence already gathered

- `.planning/todos/completed/` uses `status: RESOLVED` as the dominant recent value. Use it. Do
  not invent a new one.
- Some completed todos additionally carry `resolved:`, `resolved_by:` and/or a `resolution:`
  frontmatter line (e.g. `2026-07-26-uploaded-log-delete-button-lies.md` carries
  `resolution: NOT-A-DEFECT (false premise) — invariant now enforced by a regression gate`).
- `.planning/todos/todo-frontmatter-gate.py` scopes to `pending/` **only**; `completed/` is
  deliberately exempt (the gate asserts its own directory name to keep widening it a deliberate
  act). The three triage keys already on this file are valid, so the intermediate in-place edit
  while the file is still in `pending/` is gate-clean, and the move is gate-neutral.

## Honest note on the prettier check in each `<verify>` below

CLAUDE.md requires every task's `<verify>` to run `npx prettier --check` over the exact paths it
wrote, and both tasks below do. **Measured this session: for `.planning/**` paths that command
exits 0 having checked nothing** — `.prettierignore` lists `.planning` (alongside `.claude` and
`graphify-out`, "tooling/agent state and planning artifacts, not shipped source"), so prettier
filters the path out and prints `All matched files use Prettier code style!` over an empty set.

Run it anyway — the convention is unconditional and the cost is seconds — but **do not read its
green as evidence that the file is formatted.** It is a no-op here. Do not "fix" this by passing
`--ignore-path`: forcing prettier over a hand-wrapped prose todo would reflow a document whose
line breaks are deliberate, to satisfy a check the repo has explicitly opted out of for this tree.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Record the resolution in the todo, in place</name>
  <files>.planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md</files>
  <action>
Edit the todo in place, while it is still in `pending/`. Do not move it yet — that is Task 2.

**Frontmatter.** Change `status: OPEN` to `status: RESOLVED`. Add `resolved: 2026-09-24` and
`resolved_by: quick-260924-tjg` immediately after it, matching the shape used by
`2026-09-24-steam-facet-row-can-outlive-its-grid-games-reopening-t-34-11-12.md` and
`2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md`. A
`resolution:` one-liner in frontmatter is optional and is your call; if you add one, it must say
the todo is a verified standing trap that was closed WITHOUT a fix — not that anything was fixed.
Leave `severity`, `platform`, `ready`, `area`, `found_by`, `files` and `created` exactly as they
are: they are the historical record.

**Body.** Leave the existing `## Problem`, `## Why it matters`, `## Direction` and
`## Verification` sections byte-identical. Add one new `## Resolution` section; placing it before
or after `## Related` is your judgement.

Match the existing todo's voice — measured, specific, willing to state what is not known. The
Resolution section must carry all four of the following:

1. **Re-measured 2026-09-24 — all four Verification bullets reproduce exactly.** Give the concrete
   values from the evidence table in `<context>`: the Store-stub string and exit 49 under Bash,
   `Python 3.12.10` from Bash `python`, `python3.cmd` still ordered before the WindowsApps stub
   under cmd, and 12/12 planning gates. Then add the `type -a` evidence and say what it proves:
   Bash's `python3` resolves to ONLY the WindowsApps stub, because Bash does not resolve a bare
   name to a `.cmd` file, so `python3.cmd` is structurally invisible to it. That is the mechanism —
   not a PATH-ordering accident, and not something a reordering would fix.

2. **Decision: no code change, and no CLAUDE.md note.** Direction items 1 and 2 were already
   settled ("do not change the invocation"; "use `python` or `pnpm planning-gates` from Bash").
   Item 4 — whether a one-line note belongs in CLAUDE.md's conventions — was the single open
   judgement call, and the operator has now decided against it.

3. **What enforcement now exists: essentially none. Say it plainly.** This file, sitting in
   `completed/`, is the entire durable record of the trap. Nothing prevents a future agent from
   running `python3` in Git Bash, reading exit 49 and "Python was not found", and concluding Python
   is absent — which is exactly what happened in quick `260924-pm3`. Prose in a completed todo is
   weaker than prose in CLAUDE.md, and the todo itself already conceded that CLAUDE.md prose would
   be weak. Do not dress this close-out up as a fix; an over-confident close-out here would be the
   green-check-proving-nothing pattern this repo keeps stamping out, in narrative form.

4. **Direction item 3 remains unverified and untested.** Turning off the Store app-execution alias
   at Settings > Apps > Advanced app settings > App execution aliases was NOT measured as part of
   this close-out. The todo's own reasoning suggests it plausibly would not fix Bash anyway, since
   Bash still will not resolve `.cmd` for a bare name. It stays a hypothesis.

Do not add a `## Resolution` claim that anything was fixed, hardened, or prevented. Nothing was.
  </action>
  <verify>
    <automated>test "$(grep -c '^status: RESOLVED$' .planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md)" = 1 && test "$(grep -c '^## Resolution$' .planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md)" = 1 && grep -q 'type -a' .planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md && grep -q '260924-pm3' .planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md && ! grep -q '^status: OPEN' .planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md</automated>
    <automated>git diff --name-only | grep -qvE '^\.planning/todos/pending/2026-09-24-python3-' && echo "FAIL: a file outside the todo was modified" && exit 1 || true</automated>
    <automated>npx prettier --check .planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md</automated>
  </verify>
  <done>
The todo still sits in `pending/`, its original four sections untouched, carrying
`status: RESOLVED` plus resolution metadata and a `## Resolution` section covering all four
required points. `git diff --name-only` names that one file and nothing else — in particular not
`package.json`, not `CLAUDE.md`, and nothing under `src/`, `meta/`, `src-tauri/` or `.github/`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Move the todo to completed/ and prove the repo is otherwise untouched</name>
  <files>.planning/todos/completed/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md</files>
  <action>
Move the edited todo with `git mv` so the rename is preserved in history:

`git mv .planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md .planning/todos/completed/`

Do not use a plain `mv` followed by `git add`, and do not copy-then-delete. The filename does not
change — only the directory.

Then confirm the close-out is inert with respect to every gate:

- `pnpm planning-gates` must still report 12/12. The todo-frontmatter gate scopes to `pending/`
  only, so the move should be gate-neutral; running it proves that rather than assuming it.
- The working tree must contain exactly one change relative to HEAD: this file's rename-with-edit.

If `pnpm planning-gates` reports anything other than 12/12, STOP and report the failing gate. Do
not modify a gate to make it pass.

Note for your own shell use, and the whole point of the todo you are closing: if you invoke a `.py`
gate by hand from Git Bash, use `python <script>`, never `python3` — `python3` will hand you exit
49 and "Python was not found" while Python 3.12.10 sits right there. Prefer `pnpm planning-gates`,
which goes through cmd and resolves correctly.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md && test ! -e .planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md</automated>
    <automated>git status --porcelain -- .planning/todos | grep -qE '^R' || (echo "FAIL: move was not recorded as a git rename" && exit 1)</automated>
    <automated>git status --porcelain -- package.json CLAUDE.md src meta src-tauri .github .planning/ROADMAP.md .planning/STATE.md | grep -q . && (echo "FAIL: an out-of-scope file changed" && exit 1) || true</automated>
    <automated>pnpm planning-gates</automated>
    <automated>npx prettier --check .planning/todos/completed/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md</automated>
  </verify>
  <done>
The todo lives at
`.planning/todos/completed/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md`,
is gone from `pending/`, and git records the change as a rename. `pnpm planning-gates` reports
**12/12 planning gates passed**. `package.json`, `CLAUDE.md`, `ROADMAP.md`, `STATE.md` and
everything under `src/`, `meta/`, `src-tauri/` and `.github/` are unchanged.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary                            | Description                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| planning record → future agent      | A future agent reads this closed todo as its only warning about the Git Bash `python3` trap. Wrong or overconfident prose here propagates.       |
| executor shell → repo working tree  | The executor runs shell commands in a repo whose cross-platform invocation (`python3`) is the exact thing the todo warns against "fixing".       |

## STRIDE Threat Register

| Threat ID       | Category    | Component                      | Disposition | Mitigation Plan                                                                                                                                                                       |
| --------------- | ----------- | ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-260924-tjg-01 | Tampering   | `package.json:42`              | mitigate    | Scope lock in `<context>` forbids the edit; Task 2's `git status --porcelain -- package.json ...` verify fails the task if it changed. Changing `python3`→`python` breaks Linux/macOS.  |
| T-260924-tjg-02 | Repudiation | the todo's move                | mitigate    | `git mv` required; Task 2 asserts `git status --porcelain` reports an `R` rename, so provenance of the original text survives rather than reading as an unrelated delete + add.        |
| T-260924-tjg-03 | Information | Resolution prose overclaiming  | mitigate    | Task 1 point 3 requires an explicit statement that enforcement is essentially nil, and forbids fix/hardened/prevented framing. Must-have truths pin it.                                |
| T-260924-tjg-04 | Tampering   | `pnpm planning-gates` result   | mitigate    | Task 2 forbids editing a gate to make it pass; 12/12 is a hard stop condition.                                                                                                        |
| T-260924-tjg-SC | Tampering   | npm/pip/cargo installs         | accept      | No package installs in this plan. No `package.json` change is permitted at all, so the supply-chain surface is nil.                                                                    |
</threat_model>

<verification>
1. `.planning/todos/pending/` no longer contains the python3 todo;
   `.planning/todos/completed/` does, under the same filename.
2. `git status --porcelain -- .planning/todos` shows an `R` rename entry, not a `D` plus a `??`.
3. `grep -c '^## Resolution$'` on the completed file returns 1, and that section names: exit 49,
   `Python 3.12.10`, `python3.cmd` ordering, 12/12, `type -a`, `260924-pm3`, and the decision
   against a CLAUDE.md note.
4. `pnpm planning-gates` → 12/12 planning gates passed.
5. `git status --porcelain -- package.json CLAUDE.md src meta src-tauri .github .planning/ROADMAP.md .planning/STATE.md` is empty.
</verification>

<success_criteria>
- The python3 Git Bash Store-stub todo is closed as verified-not-a-defect, with the 2026-09-24
  re-measurement recorded and the mechanism (`type -a`: Bash will not resolve a bare name to a
  `.cmd`) named explicitly.
- The close-out is honest: it states that no fix was made, that no CLAUDE.md note was added by
  operator decision, that the completed-todo prose is the entire remaining enforcement, and that
  Direction item 3 stays unverified.
- Exactly one file changed in the repo, and it is a planning document.
- `pnpm planning-gates` reports 12/12.
</success_criteria>

<output>
Create `.planning/quick/260924-tjg-close-the-python3-git-bash-store-stub-to/260924-tjg-SUMMARY.md` when done
</output>
