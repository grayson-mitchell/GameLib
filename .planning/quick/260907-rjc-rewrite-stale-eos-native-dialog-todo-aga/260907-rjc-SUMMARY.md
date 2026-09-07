---
phase: quick-260907-rjc
plan: 01
subsystem: docs
tags: [dialog, showMessageBox, tauri-sidecar, todo-maintenance]

requires: []
provides:
  - "Rewritten todo recording three live dialog-shim collapse defects (VCRuntime button 2 unreachable, Snap checkbox never read back, sideloaded-game unsaved-progress fail-open) with file/line/mechanism/consequence/platform gate"
  - "Corrected 10-site census (was ~14, two sites no longer exist)"
  - "EOS headline claim and Traps 1-2 marked CLOSED/MITIGATED with closing evidence; Trap 3 marked still-live"
affects: [ui-dialogs, tauri-sidecar]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md

key-decisions:
  - "Kept the todo's filename and created date stable (path is referenced elsewhere); rewrote title, severity, files, and body in place rather than creating a new todo"
  - "Raised severity minor -> major because defect 3 (sideloaded-game unsaved-progress fail-open) is a data-loss guard reachable on the operator's own platform, unlike defects 1-2 which are each platform-gated nags"
  - "Dropped the EOS migration step and the Dialog-primitive-styling step from Suggested shape — both are closed; replaced with fixing the three shim defects and deciding the native-vs-in-app policy"

requirements-completed: [QUICK-260907-rjc]

duration: 25min
completed: 2026-09-07
---

# Quick Task 260907-rjc: Rewrite stale EOS native-dialog todo Summary

**Rewrote a stale todo whose headline claim (EOS remove dialog renders native) is false at HEAD, replacing it with three previously-unrecorded live defects caused by the Tauri dialog shim's narrower contract.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2/2 completed
- **Files modified:** 1

## Accomplishments

- Spot-checked every `path:line` anchor in the plan's verified findings (12 anchors across
  `eos_overlay.ts`, `AdvancedSettings/index.tsx`, `Dialog.tsx`, `index.css`, `platform/index.ts`,
  `processGuards.ts`, and the 10-site census) against HEAD source before writing — all resolved
  exactly at the cited lines, zero drift.
- Rewrote the todo in place: title no longer claims the EOS dialog is native; severity raised
  minor -> major; `files:` re-pointed at the four still-live files; three new defects documented
  each with file, line, exact shim mechanism, caller consequence, and platform gate; census
  corrected from ~14 to the 10 sites that actually exist at HEAD; EOS headline + Trap 1 (dead
  Dialog CSS) + Trap 2 (rejecting-dialog crash) recorded as CLOSED/MITIGATED with their closing
  evidence; Trap 3 (inverted `handleExit` polarity) recorded as still live; both memory
  cross-links retained and labelled HISTORICAL; Suggested shape narrowed to exactly two items.
- Ran every gate from Task 2 (frontmatter checks, anchor-resolution against source, content
  checks, census-count consistency) before committing.

## Task Commits

1. **Task 1: Rewrite the todo against HEAD** — folded into the single commit below (no
   intermediate commit was made between writing and gating, since Task 2's gates are what
   validate Task 1's output before it is allowed to land).
2. **Task 2: Gate the rewrite, then commit** - `1aead7b52` (docs)

No separate plan-metadata commit was made for this quick task per the orchestrator's explicit
instruction: SUMMARY.md and PLAN.md are not committed by this executor; the orchestrator owns
that.

## Files Created/Modified

- `.planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md` - rewritten in place, 199 lines (was 96), path and `created:` date unchanged, `resolves_phase:` still absent, `status: OPEN`

## Deviations from Plan

None — plan executed exactly as written. All anchors verified against HEAD with zero line drift,
so no citation corrections were needed.

## Verification

- `git diff --name-only -- src/` returned empty both before and after the commit — zero
  source-code files touched.
- All 12 verified-finding anchors (A-D plus the 10-site census) confirmed to resolve at the exact
  cited line at HEAD via direct `grep -n` / `sed -n` inspection of the source files — no citation
  needed correction.
- All Task 2 gate checks passed: `resolves_phase` absent, `created: 2026-08-24` unchanged,
  `status: OPEN`, `severity: major`, false headline string absent from title, four `files:`
  entries each exist on disk, `eos_overlay.ts`/`dialog/dialog.ts`/`index.css` absent from
  `files:` block, both memory links present with `HISTORICAL` label nearby, `2026-09-07` present,
  all ten census paths present, `main.ts`/`updater.ts` appear only in "why the original was
  wrong" prose (never in the live census table), and no stray `~14` claim outside that same
  context.
- `git show --stat --name-only HEAD` confirms exactly one file in the commit
  (`1aead7b52`); the committed blob's line count (199) matches the on-disk file exactly.
- Pre-existing unrelated dirty state (`.planning/ROADMAP.md`, `.planning/STATE.md` modified;
  `.claude/skills/archify/`, `.planning/phases/42-humble-key-platform-identity-evidenced-key-type-table-drivin/`,
  `skills-lock.json` untracked) was confirmed untouched by `git status --short` both before
  staging (only the todo path was `git add`ed) and after the commit.

## Self-Check: PASSED

- FOUND: `.planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md`
- FOUND: commit `1aead7b52` in `git log --oneline`
