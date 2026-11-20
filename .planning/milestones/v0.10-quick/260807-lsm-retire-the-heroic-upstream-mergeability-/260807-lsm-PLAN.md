---
quick_id: 260807-lsm
slug: retire-the-heroic-upstream-mergeability-
date: 2026-08-07
mode: quick
---

# Quick Task 260807-lsm: Retire the Heroic upstream-mergeability constraint

## Description

The "must stay mergeable with Heroic upstream" constraint is retired by operator decision
(2026-08-07). GameLib is now an independent project, not a fork tracking upstream. Two documents
still assert the constraint and keep regenerating it as a false-alarm caveat during planning and
review:

- `CLAUDE.md:12` — states it flatly, in its *original* pre-v0.8 wording. This file is loaded into
  context every session, so it is the direct source of the recurring warning.
- `.planning/PROJECT.md:88` — already marks it *partly* superseded, but only the **Electron half**,
  and only as a consequence of the Tauri port. It still frames GameLib as a fork trading
  mergeability away rather than as an independent project.

**Docs only. No code changes.**

## Key constraint discovered during planning

The `## Project` block in `CLAUDE.md` is GSD-generated — it is delimited by
`<!-- GSD:project-start source:PROJECT.md -->` / `<!-- GSD:project-end -->`. `PROJECT.md` is the
source of truth, so **`PROJECT.md` must be updated too** or a future regeneration reintroduces the
retired constraint. This also explains why `CLAUDE.md` still carries the original wording while
`PROJECT.md` had already been amended on 2026-08-02: the generated block was never refreshed.

## Tasks

### Task 1 — Retire the constraint in `.planning/PROJECT.md` (source of truth)

- **files:** `.planning/PROJECT.md`
- **action:** Rewrite the `## Constraints` → **Tech stack** bullet (line 88) so the *whole*
  mergeability constraint is retired as of 2026-08-07 by operator decision — not just the Electron
  portion. Keep the historical record of what it originally said and why it lapsed (the amendment
  exists precisely because an unamended constraint kept resurfacing). State the standing
  instruction: deviation from upstream Heroic is not a concern to raise.
- **verify:** `grep -n "mergeab" .planning/PROJECT.md` shows no surviving live constraint — only
  historical/decision prose.
- **done:** The bullet reads as an independent-project statement, dated, attributed to the operator
  decision, with the original wording preserved as history.

### Task 2 — Refresh the generated `## Project` block in `CLAUDE.md`

- **files:** `CLAUDE.md`
- **action:** Replace the stale line 12 constraint with the agreed wording:
  `**Tech stack**: React + TypeScript on a Rust/Tauri shell. GameLib is an independent project, not
  a fork tracking Heroic — upstream mergeability is not a constraint.`
  Keep the edit inside the `GSD:project-start`/`GSD:project-end` markers so it stays consistent with
  `PROJECT.md`.
- **verify:** `grep -n "mergeable" CLAUDE.md` returns nothing.
- **done:** A fresh session reading `CLAUDE.md` sees no mergeability constraint.

### Task 3 — Record in STATE.md

- **files:** `.planning/STATE.md`
- **action:** Add a row to the "Quick Tasks Completed" table.
- **verify:** Row present with quick id `260807-lsm`.
- **done:** STATE.md tracks the task.

## Out of scope

- The `- **Why a fork**` line in `PROJECT.md:83` (Heroic maintainers are anti-Steam) — that is
  accurate history explaining the project's origin, not a live constraint.
- The `Fork Heroic (not build from scratch)` and `Port to Tauri v2` rows in Key Decisions — these
  are dated decision records; rewriting history is not the ask.
- Any code change.
