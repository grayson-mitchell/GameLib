---
quick_id: 260823-ibx
slug: flip-34-4-1-validation-md-status-draft-t
description: Flip 34.4.1-VALIDATION.md frontmatter status draft -> approved
created: 2026-08-23
status: planned
---

# Quick Task 260823-ibx — Flip `34.4.1-VALIDATION.md` `status: draft` → `approved`

## Problem

The phase 34.4.1 folder renders **yellow (`inprogress`)** in the `gsd-phase-status` VS Code
explorer (v0.8.0) while every file under it reads green.

Cause, established by replaying the extension's own pipeline
(`~/.vscode/extensions/gsd-phase-status/parse.js`) against the real tree:

| Input | `rollup()` contribution |
|---|---|
| 29/29 `PLAN`+`SUMMARY` pairs | `complete` |
| `34.4.1-VALIDATION.md` → `status: draft` | `pending` |

`rollup()` returns `inprogress` the moment the set contains `complete` **and** anything else
(`statuses.every(complete)` fails, then `statuses.includes('complete')` fires). `VALIDATION.md`
is the **only** tier-1 gate artifact in the folder carrying frontmatter — every other document
(CONTEXT, RESEARCH, PATTERNS, LIVE-GATE×3, PORTED-CHANNELS, deferred-items, the three `.py`
gates) has none and is invisible to the rollup.

Identical shape to phase 08.1, resolved 2026-08-22 by the same one-field flip.

## Why the flip is honest, not cosmetic

`34.4.1-VALIDATION.md` was written 2026-07-27 and never updated while the phase executed
through 2026-07-31. Its doubts are stale bookkeeping:

- `wave_0_complete: false` and 12 `❌ W0` "file does not exist" flags in the per-task table.
- All six test files those flags name **exist on disk now** (verified this session):
  - `src/backend/sidecar/__tests__/humbleLoginFlows.test.ts`
  - `src/frontend/screens/WebView/__tests__/loginRoutes.test.ts`
  - `src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx`
  - `src/backend/sidecar/__tests__/oauthLoginCapture.test.ts`
  - `src/backend/sidecar/__tests__/humbleFlows.test.ts`
  - `src/backend/humble/__tests__/user.test.ts`

`approved` is the house convention for a settled VALIDATION (22 files vs 13 still `draft`).

## Scope

**Exactly one field.** Line 4 of `34.4.1-VALIDATION.md`: `status: draft` → `status: approved`.

Explicitly **out of scope** — do not touch:

- the 27 `⬜ pending` rows in the per-task verification map
- `wave_0_complete: false`
- `ROADMAP.md`, `STATE.md` (beyond this quick task's own Quick-Tasks row)

## Tasks

- **T1** — Edit `34.4.1-VALIDATION.md` line 4, `draft` → `approved`. Assert the diff is a single
  hunk, `+1/-1`.
- **T2** — Verify by replaying the extension pipeline (`parseFrontmatter` →
  `folderArtifactStatuses` → `classifyPlans` → `rollup`) and asserting the 34.4.1 folder rolls up
  to `complete`.
- **T3** — Commit with `git commit --only <path>` (two unrelated renames are already staged from
  concurrent work and must not be absorbed).

## Verification

Folder rollup for `34.4.1-…` transitions `inprogress` → `complete`.

## Explicitly NOT accomplished by this task

This does **not** close phase 34.4.1. Still outstanding, and untouched here:

- **No `34.4.1-VERIFICATION.md` exists at all** — the phase closed on a 4/4 live gate, never on a
  verify pass, which also makes it invisible to `gsd-sdk query audit-uat`.
- **Ten findings `D-29-01`..`D-29-10`** in `34.4.1/deferred-items.md`, none of which has a todo
  file (`grep -rl "34\.4\.1" .planning/todos/` is empty in both `pending/` and `completed/`).
  By that file's own stated rule, "a carry-forward without an owning plan that declares the file
  is a note, not a task."
- `D-29-08` (Epic logout, UNOBSERVED) names Phase 34.5 as owner, but `clearEpicCookies` appears
  in no phase folder except 34.4.1's own, and Epic was later descoped 34.5 → 34.7 (ON HOLD) →
  re-homed to 34.6. Likely orphaned.
