---
status: complete
phase: quick-260926-b5r
plan: 01
subsystem: planning-docs
tags: [uat, docs-correction, phase-38]
requires:
  - '.planning/debug/resolved/mouse-dead-dropdown-disclosure.md'
  - '.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md'
provides:
  - 'Corrected sitting-5 build label in 38-HUMAN-UAT.md (frontmatter row, Current Test prose, section heading, Conditions paragraph)'
  - 'Desk-diff note (5b6201e26..HEAD) transferring 38-S02/38-S14(a)/38-W06 to HEAD'
  - 'Corrected caret paragraph (not a regression)'
affects:
  - '.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md'
key-files:
  created: []
  modified:
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
decisions:
  - 'Re-label, not re-run (decision 1 of the pending todo), per the operator-approved objective'
  - 'Original 59df4c1b6/debug-build label kept as marked history (Originally recorded as ...), not deleted'
metrics:
  tasks: 1
  commits: 1
  completed: 2026-09-26
---

# Quick 260926-b5r: Correct the sitting-5 build label in 38-HUMAN-UAT.md — Summary

Sitting 5's record in `38-HUMAN-UAT.md` claimed a `pnpm tauri:dev` debug build of `59df4c1b6`. It
actually ran the INSTALLED shell `%LOCALAPPDATA%\GameLib\gamelib-shell.exe` (v0.7.0, mtime
2026-09-24 07:34, built from `5b6201e26`), whose sidecar was the repo's `build/main/sidecar.js`.
That mislabel is now corrected in four places, the original label is preserved as marked history,
a desk-diff note explains why the sitting's three scores still hold on HEAD, and the caret
paragraph no longer calls the dead caret a regression.

## What was built

**Task 1 — re-label, desk-diff note, caret correction** (`69042dd60`). Before writing, ran the
plan's cheap spot check (`git log --oneline 5b6201e26..HEAD -- src-tauri/src/main.rs
src/backend/storeManagers/legendary/user.ts`); it returned exactly the four commits named in the
plan's context item 4 (`9ca63c7d0`, `1fa6e9e93`, `08f24b05d`, `f3972c70f`), so the tree matched the
claim before anything was written.

- **(a) Frontmatter `sessions:` row.** Replaced the build clause with "INSTALLED shell v0.7.0
  (built 2026-09-24 07:34 from `5b6201e26`) with the repo build/main sidecar; label corrected by
  quick 260926-b5r". The scores tail from "-- 38-S02 PASS" onward is byte-identical. No backslash
  or double quote introduced (YAML trap avoided); frontmatter still parses under the same rules the
  file already used.
- **(b) `## Current Test` prose (line 21 region).** Added "run on a stale installed shell, not a
  dev build of HEAD; see the correction in its section" inline in the Sitting 5 clause. No
  `59df4c1b6` reference remains in that paragraph.
- **(c) `## Sitting 5` heading.** Changed to "## Sitting 5 — 2026-09-26, Windows 11, installed
  shell v0.7.0 (`5b6201e26`), label corrected". Prefix "## Sitting 5" preserved exactly, since the
  Current Test paragraph cites the section by that name.
- **(d) Conditions paragraph.** Opens with "**Conditions (corrected 2026-09-26, quick
  `260926-b5r`).**", states the real conditions (installed exe, mtime, `5b6201e26`, compile-time
  sidecar path, stale frontend/shell vs. current backend/log, single-instance hand-off), cites
  `mouse-dead-dropdown-disclosure.md` (`1f93c5812`) and the pending todo, then keeps the original
  claim as quoted history on one line: `Originally recorded as "`pnpm tauri:dev`, DEBUG build,
  commit `59df4c1b6`"; that label was wrong.` The "debug build ... keeps 38-W04/38-W05
  un-runnable" sentence was rewritten: build profile is now stated as not established, and the
  38-W04 not-run reason (no `v*` tag, no CI artifact) is stated as independent of build profile.
  The two library paths and the `enableSteamNativeInstall` ON sentence are unchanged.
- **(e) New "Why the scores transfer to HEAD" paragraph**, placed directly after Conditions.
  Records the desk diff `5b6201e26..HEAD` and all six context points, maps each of 38-S02,
  38-S14(a), 38-W06 to its specific reason, and ends with the explicit honest-limit sentence:
  nothing was re-run on HEAD, this is an argument from the diff, not an observation.
- **(f) Observation-trap paragraph.** The "regression of a resolved debug session" clause is now
  struck through (`~~regression of a resolved debug session~~`) and followed by a bold
  `**[Corrected 2026-09-26, quick `260926-b5r`: NOT a regression.]**`, explaining the stale
  installed bundle carried the pre-`3a0e62918` `Dropdown.toggle()` functional updater. Cites
  `mouse-dead-dropdown-disclosure.md` (`1f93c5812`) and the operator's 2026-09-26 mouse
  confirmation on HEAD under `pnpm tauri:dev`. The `steam-caret-dropdown-dead.md`/`3a0e62918`
  citation is kept, since it names the fix the stale bundle predates. The "filed as its own todo"
  clause now notes the todo is in `completed/` as not-a-regression (confirmed:
  `.planning/todos/completed/2026-09-26-mouse-click-no-longer-opens-dropdown-disclosures.md`
  exists on disk).

No `result:`/`status:` line, item block, or `expected: |` block was touched. Sitting 4's section,
the 38-W04 paragraph's sitting-4 claim (line ~536), `38-VERIFICATION.md`, and all other files were
left untouched.

## Verification — exact results

| Gate | Command | Result |
|---|---|---|
| Prettier | `npx prettier --check 38-HUMAN-UAT.md` | `All matched files use Prettier code style!` — exit 0 |
| Frontmatter row: no `59df4c1b6` | `grep -E '^  - "Sitting 5' \| grep -c '59df4c1b6'` | `0` — PASS |
| Frontmatter row: no `debug build` | same pattern, `debug build` | `0` — PASS |
| Heading: no `59df4c1b6`/`debug build` | `grep -E '^## Sitting 5' \| grep -cE '59df4c1b6\|debug build'` | `0` — PASS |
| Post-heading `59df4c1b6` occurs only on an `Originally recorded as` line | awk+grep gate from the plan | `0` — PASS |
| Current Test prose (lines 15-30): no `59df4c1b6` | awk+grep gate | `0` — PASS |
| Required strings present | `5b6201e26`, `mouse-dead-dropdown-disclosure`, `1f93c5812` | all present — PASS |
| No `result:`/`status:` line changed | `git diff -U0` filtered | `0` changed lines — PASS |
| Frontmatter YAML parse | `node -e ... js-yaml.load(...)` | **FAILS**, but proven pre-existing (see Deviations) |
| `pnpm planning-gates` | full battery | 12/13 passed; the one failure (`planning-envelope-tag-gate.py`) is entirely on untouched `260925-uok-*` files — pre-existing and unrelated |

## Deviations from Plan

### 1. `[Not a deviation — pre-existing, confirmed] The plan's js-yaml frontmatter-parse check fails on this file regardless of this edit`

- **Found during:** Task 1 `<verify>`.
- **Issue:** `node -e "...js-yaml.load(...)"` against the file's frontmatter throws
  `YAMLException: missed comma between flow collection entries` at the `source:` field (line 4:
  `source: [38-VERIFICATION.md, 34.1-HUMAN-UAT.md items 1a and 7, 34.10-VERIFICATION.md
  deferred[0]]`), which this task did not touch.
- **Confirmed pre-existing:** ran the identical `js-yaml.load` against `git show HEAD:<file>` (the
  pre-edit content, before this task's commit) — it throws the **exact same** error, same line,
  same column. The `source:` line is untouched by this task's diff (`git diff` shows only the
  sessions row, Current Test prose, heading, and the Sitting 5 body).
- **Resolution:** not fixed (out of scope per CLAUDE.md's scope-boundary rule — pre-existing defect
  in an unrelated frontmatter field). Documented here rather than silently worked around.

### 2. `[Not a deviation — pre-existing, confirmed] pnpm planning-gates shows one failure, entirely on files this task never touched`

- **Found during:** Task 1 `<verify>`.
- **Issue:** `planning-envelope-tag-gate.py` fails on three files under
  `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/` (`260925-uok-SUMMARY.md`,
  `260925-uok-VERIFICATION.md`, `deferred-items.md`), each carrying a trailing orphan
  envelope-tag run (e.g. a stray `</content></invoke>` at file end).
- **Confirmed pre-existing and unrelated:** `git status --short` immediately before and after this
  task's commit shows only `38-HUMAN-UAT.md` modified in the tracked tree (plus untracked quick
  directories). The failing files are fully committed, untouched by this diff, from a prior
  (260925-uok) quick task. 12/13 gates pass; this is the sole failure and it is not new.
- **Resolution:** not fixed — out of scope for this task (a different quick task's artifacts), per
  the plan's `<done>` criterion explicitly anticipating "the pre-existing, unrelated 260925-uok
  failure is expected."

No other deviations. The task otherwise executed exactly as written.

## Out-of-scope files still carrying the old `59df4c1b6` debug-build label (follow-ups, not fixed here)

Per the plan's explicit scope boundary, these were left untouched and are reported as follow-ups:

- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`
- `.planning/todos/pending/2026-09-26-webview2-delete-cookie-does-not-remove-epic-cookies.md:16`
- `.planning/debug/resolved/epic-cookie-clear-read-divergence.md:206-207`
- The historical 260926-a1l PLAN/SUMMARY files, which stay as written (they document what was
  believed true at the time, not what is true now)

## Threat Flags

None. This is a docs-only edit to a planning artifact; no new network endpoint, auth path, file
access pattern, or schema change was introduced. The threat register's three `mitigate`
dispositions (T-b5r-01 YAML-safe frontmatter, T-b5r-02 marked history not deletion, T-b5r-03
zero changed result/status lines) are all satisfied per the verify results above.

## Known Stubs

None.

## Commits

| Task | Commit | Message |
|---|---|---|
| 1 | `69042dd60` | `docs(quick-260926-b5r): correct the sitting-5 build label in 38-HUMAN-UAT.md` |

## Self-Check: PASSED

- File exists: `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md` — FOUND.
- Commit exists: `69042dd60` — FOUND in `git log`.
- Required tokens confirmed present in the file: `5b6201e26`, `mouse-dead-dropdown-disclosure`, `1f93c5812`.
- `git diff --diff-filter=D HEAD~1 HEAD` on the commit: no deletions.
