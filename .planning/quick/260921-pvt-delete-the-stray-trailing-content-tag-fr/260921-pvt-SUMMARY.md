# Quick 260921-pvt: Delete the stray trailing closing tag Summary

One-liner: Deleted a stray, orphaned XML-style closing tag (split spelling `` `</content` `` + `` `>` ``) that sat as the final line of six pending todos, and filed one new todo recording it as a recurring authoring artifact across two independent sessions, with the frontmatter gate's by-design blindness and the self-referential trap any future gate would face.

## What was done

**Task 1 — surgical repair.** Re-confirmed the population at HEAD `421d5195f` before touching anything: exactly six files under `.planning/todos/pending/`, each carrying the literal stray tag exactly once, always as the file's final line, each ending `...\n</content>\n`. This matched the plan's table exactly (line counts 109/103/66/66/64/286). `completed/` had zero occurrences and no opening `<content>` tag exists anywhere under `.planning/todos/`.

Removed the last line of each of the six files with `sed -i '' -e '$d'`. Verified after: zero occurrences remaining in all six; each file's `git diff --numstat` reads exactly `0` added / `1` deleted; the changed-file set was exactly those six; `src/` and `src-tauri/` untouched; no gate file touched.

**Task 2 — cause-todo and commit.** Wrote `.planning/todos/pending/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md` (122 lines) with:
- `severity: minor` / `platform: any` / `ready: human`, bare, lowercase, adjacent, in that order (lines 5-7).
- Both provenance commits cited by sha: `30630b9d2` (quick `260921-nub`, 2026-09-21, birthed the three `2026-09-20-*` files) and `82ac54d86` (2026-09-17, an unrelated earlier session, birthed the three `2026-09-17-*` files) — written up explicitly as two independent sessions on two dates, not one incident.
- A direct quote of `todo-frontmatter-gate.py`'s own docstring ("FRONTMATTER-BLOCK-ONLY PARSING IS LOAD-BEARING, NOT A NICETY...") explaining why the gate is structurally, deliberately blind to todo bodies, citing self-test cases 11 and 12 as the accept-side controls.
- The self-referential trap: a gate matching the literal tag would be tripped by the very todo documenting it. Stated why this todo uses a split spelling instead of the literal string.
- The gate decision left explicitly open, citing CLAUDE.md's sidecar-contract precedent ("a gate is not obviously the answer... decide it on its merits; do not add one reflexively"), with four sketched-but-undecided options.

Confirmed the headline assertion — `grep -rn '</content>' .planning/todos/` — returns zero hits with the new todo in place, i.e. the todo does not reintroduce the literal string it documents.

Committed all seven paths (six repairs + new todo) with an explicit pathspec, after checking `git diff --cached --name-only` matched exactly those seven and nothing from the concurrent session was absorbed. Commit `9abc9e698`: `docs(quick-260921-pvt): delete the stray trailing closing tag from six todos, file the cause`.

Ran `pnpm planning-gates`: 11/11 green.

## Deviations from Plan

None — plan executed exactly as written. Both tasks were completed as specified; no scope was scaled down.

## Verification results

- `git diff --numstat` for all six repaired files: `0 1` (0 added, 1 deleted) each — confirmed individually post-commit against `HEAD~1`.
- Repo-wide `grep -rn '</content>' .planning/todos/` count: `0`.
- `git diff --quiet HEAD~1 HEAD -- src/ src-tauri/`: clean, no changes.
- No file matching `*gate.py` or `meta/runPlanningGates.py` appears in the commit's file list.
- `pnpm planning-gates`: 11/11 passed.
- `git diff --cached --name-only` was checked before the commit and matched exactly the seven intended paths.

## Known Stubs

None — this is a docs-only deletion and one new prose todo; nothing renders to UI or wires data.

## Threat Flags

None — no new network endpoints, auth paths, file-access patterns, or schema changes. All changes are prose edits to `.planning/todos/` files, consistent with the plan's threat model (no trust boundary crossed).

## Self-Check: PASSED

- `test -f .planning/todos/pending/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md` → FOUND
- `git log --oneline --all | grep -q 9abc9e698` → FOUND
- All six repaired files verified present and edited via `git show --stat HEAD`.
