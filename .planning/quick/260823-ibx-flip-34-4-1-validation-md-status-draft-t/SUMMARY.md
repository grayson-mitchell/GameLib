---
quick_id: 260823-ibx
slug: flip-34-4-1-validation-md-status-draft-t
description: Flip 34.4.1-VALIDATION.md frontmatter status draft -> approved
date: 2026-08-23
status: complete
commit: 9a4939b47
---

# Quick Task 260823-ibx — SUMMARY

## What changed

One field. `.planning/phases/34.4.1-…/34.4.1-VALIDATION.md` line 4:
`status: draft` → `status: approved`. Diff was a single hunk, `+1/-1`.

## Why the folder was yellow

Diagnosed by replaying the `gsd-phase-status` extension's own pipeline (v0.8.0,
`~/.vscode/extensions/gsd-phase-status/parse.js`) against the real tree, rather than reading the
prose:

| Input | `rollup()` contribution |
|---|---|
| 29/29 `PLAN`+`SUMMARY` pairs | `complete` |
| `34.4.1-VALIDATION.md` → `status: draft` | `pending` |
| **folder** | **`inprogress`** (yellow) |

`rollup()` returns `inprogress` the moment the set contains `complete` **and** anything else —
`statuses.every(complete)` fails, then `statuses.includes('complete')` fires.

`VALIDATION.md` is the **only tier-1 gate artifact in the folder carrying frontmatter at all**.
CONTEXT, RESEARCH, PATTERNS, LIVE-GATE×3, PORTED-CHANNELS, deferred-items and the three `.py`
gates have none, so they are invisible to the rollup and could not have been the cause.

## Why the flip was honest

Same shape as phase 08.1 (resolved 2026-08-22 by the identical one-field flip), including the
staleness. `34.4.1-VALIDATION.md` was written 2026-07-27 and never updated while the phase
executed through 2026-07-31.

Per the 08.1 lesson — *check whether the named artifact exists before treating a `false` flag as
a blocker* — all six test files named by its 12 `❌ W0` "file does not exist" flags were confirmed
present on disk **before** flipping:

- `src/backend/sidecar/__tests__/humbleLoginFlows.test.ts`
- `src/frontend/screens/WebView/__tests__/loginRoutes.test.ts`
- `src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx`
- `src/backend/sidecar/__tests__/oauthLoginCapture.test.ts`
- `src/backend/sidecar/__tests__/humbleFlows.test.ts`
- `src/backend/humble/__tests__/user.test.ts`

`approved` is the house convention for a settled VALIDATION (22 files vs 13 still `draft`).

## Verification

Re-ran the pipeline after the edit:

```
artifact: 34.4.1-VALIDATION.md -> complete (raw "approved")
plans: 29   all complete: true
FOLDER COLOUR -> complete
PASS — folder rolls up to complete (green)
```

## Scope discipline

Untouched, deliberately: the 27 `⬜ pending` per-task rows, `wave_0_complete: false`,
`ROADMAP.md`, and `STATE.md` beyond this task's own Quick-Tasks row.

Two unrelated renames were already staged from concurrent work
(`.planning/debug/…steam-library-22-games-missing.md`,
`.planning/todos/…steam-library-22-games-never-reach…md`). Commit used
`git commit --only <paths>` and was confirmed afterwards to contain exactly 2 files; both renames
survived staged and uncommitted.

STATE.md row was hand-applied — **no `gsd-sdk state.*` verb was invoked** — and the diff asserted
to be one hunk at `+1/-0`.

## What this does NOT do

**It does not close phase 34.4.1, and the real gap is larger than the colour.**

- **No `34.4.1-VERIFICATION.md` exists at all.** The phase closed on a 4/4 live gate, never on a
  verify pass. That also makes it structurally invisible to `gsd-sdk query audit-uat`, which reads
  VERIFICATION.md.
- **Ten findings `D-29-01`..`D-29-10`** sit in `34.4.1/deferred-items.md` with **zero todo files** —
  `grep -rl "34\.4\.1" .planning/todos/` is empty in both `pending/` and `completed/`. By that
  file's own stated rule: *"a carry-forward without an owning plan that declares the file is a
  note, not a task."*
- `D-29-07` — cookie-clear domain scoping **UNTESTED**. `survivingNonHumble=0` was vacuous, not
  passing: `before total=34` equalled `matched=34`. The gate contract's precondition 6 struck the
  planted non-Humble cookie, then required an outcome only that cookie could produce. Next cycle
  must unstrike it and re-run item 3(b).
- `D-29-06` / F-9 — open and unassigned.
- `D-29-01` — UX-blocking: Manage Accounts keeps rendering its in-progress state after a
  successful sign-in.
- `D-29-08` — Epic logout UNOBSERVED, names Phase 34.5 as owner but appears **orphaned**:
  `clearEpicCookies` exists in no phase folder except 34.4.1's own, and Epic was later descoped
  34.5 → 34.7 (ON HOLD) → re-homed to 34.6.
- ROADMAP says `**Plans:** 28/29 plans executed` while all 29 have SUMMARYs on disk.
