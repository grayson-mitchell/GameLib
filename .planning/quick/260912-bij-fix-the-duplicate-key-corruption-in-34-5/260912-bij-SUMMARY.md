---
task: quick-260912-bij
type: execute
baseline_head: 8c3eb8ffc
files_modified:
  - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UAT.md
---

# Quick Task 260912-bij: Fix the duplicate-key corruption in 34.5-UAT item 18 Summary

Deleted the orphaned `blocked_by: other` / `reason: |` pair at lines 640-641 of
`34.5-UAT.md`, leaving item 18 (Epic login from scratch) with exactly one
`blocked_by`/`reason` pair: `blocked_by: prior-phase` and its intact travelled-to-34.6
narrative.

## What changed

- **File:** `.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UAT.md`
- **Change:** Two-line deletion only — `blocked_by: other` and the empty-bodied `reason: |`
  that sat between `result: blocked` and the surviving `blocked_by: prior-phase` pair.
- **Diff:** `0 insertions, 2 deletions`, confirmed by `git diff --numstat`.
- Nothing else in the file was touched — no reflow, no re-indent, no flattening of any
  block scalar (including the `expected: |` block at line 637), no added marker or comment.

## Why

`audit-uat`'s body reader (`uat.js:158`) is an unanchored first-match-wins regex
(`blockText.match(/reason:\s*(.+)/)`). With the duplicate key pair present, the code path
that assembles item 18's blocking record would have bound the orphaned `blocked_by: other`
and its empty `reason` first, silently dropping the true `prior-phase` disposition and its
narrative if the file were ever machine-read in full. This was the only duplicate-key
instance across every UAT file in the repo.

This is a pure deletion, not a restoration. No narrative text was lost or recovered — the
original body is, and remains, intact under the `history_third_run:` key. Commit `b8b2eaa96`
had moved the original `reason` body there and added the correct `blocked_by: prior-phase`
pair, but left the old pair stranded above it. That stranded pair is what this task removed.

## Explicit scope note: visibility is UNCHANGED

**Item 18 remains INVISIBLE to `audit-uat` after this fix.** `34.5-UAT.md` stays fully
suppressed by its 23 body `expected: |` blocks — `parseUatItems`'s `testPattern` requires
`expected:` inline with `result:` on the next line, which this file's block-scalar
`expected: |` style does not satisfy. This fix corrects the **record** (so that if/when the
file's format is ever changed to become visible, or if any other code reads this key pair
directly, it reads the correct single answer) — it does **not** restore visibility. The
pre-registered post-condition proves this: `audit-uat` output is byte-identical before and
after the edit (see Verification below).

## Verification (plan's verify block, run after edit, before commit)

```
$ awk '/^### 18\./{f=1} /^### 19\./{f=0} f' 34.5-UAT.md | grep -c '^reason:'
1
$ awk '/^### 18\./{f=1} /^### 19\./{f=0} f' 34.5-UAT.md | grep -c '^blocked_by:'
1
$ ... grep -q '^blocked_by: prior-phase'   -> found
$ ... grep -q 'TRAVELLED TO PHASE 34.6'    -> found
$ ... grep -q '^history_third_run:'        -> found
$ git diff --numstat -- 34.5-UAT.md
0	2	.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UAT.md
$ diff "$SCRATCH/audit-before.txt" "$SCRATCH/audit-after.txt"
(no output — byte-identical)
$ pnpm planning-gates
[PASS] .planning/phases/34.2-.../currency-gate.py
[PASS] .planning/phases/34.3-.../ported-channels-gate.py
[PASS] .planning/phases/34.4-.../ported-channels-gate.py
[PASS] .planning/phases/34.4.1-.../ported-channels-gate.py
[PASS] .planning/phases/34.4.1-.../seam-parity-sweep-gate.py
[PASS] .planning/phases/34.5-.../ported-channels-gate.py
[PASS] .planning/phases/34.5-.../preload-surface-gate.py
[PASS] .planning/phases/40-.../model-a-retirement-gate.py
[PASS] .planning/planning-frontmatter-gate.py
[PASS] .planning/todos/todo-frontmatter-gate.py
10/10 planning gates passed.
OK
```

All checks passed exactly as the plan specified. Nothing in the plan proved wrong; no
workarounds were needed.

## Deviations from Plan

None — plan executed exactly as written.

## Commit

Committed with explicit pathspecs limited to the modified UAT file and this quick task's own
plan/summary directory. `git show --name-only --format= HEAD` was used to confirm the three
unrelated dirty paths at baseline (`.planning/todos/completed/2026-09-11-humble-keys-...md`,
`.claude/skills/archify/`, `skills-lock.json`) do not appear in the commit.

## Self-Check: PASSED

- FOUND: `.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UAT.md`
- Commit hash and file list verified below after commit.
