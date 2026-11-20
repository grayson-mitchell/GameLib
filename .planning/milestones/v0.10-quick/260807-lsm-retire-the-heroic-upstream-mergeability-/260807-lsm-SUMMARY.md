---
quick_id: 260807-lsm
status: complete
date: 2026-08-07
---

# Summary — 260807-lsm: Retire the Heroic upstream-mergeability constraint

**Docs only. Zero code changes.**

## What changed

### `.planning/PROJECT.md:88` (source of truth)

The `## Constraints` → **Tech stack** bullet previously marked only the **Electron half**
superseded, dated 2026-08-02, and framed it as a consequence of the Tauri port. It now states
plainly that GameLib is an independent project and that upstream mergeability is not a constraint,
retired **in full as of 2026-08-07 by operator decision**. It carries the standing instruction not
to raise deviation from Heroic, broken mergeability, or harder re-porting as a concern, caveat, or
trade-off — while noting that deliberately borrowing an upstream fix remains fine. The original
wording is preserved as history.

### `CLAUDE.md:12` (generated block)

Replaced the stale constraint with:

> **Tech stack**: React + TypeScript on a Rust/Tauri shell. GameLib is an independent project, not
> a fork tracking Heroic — upstream mergeability is not a constraint. Do not raise deviation from
> upstream Heroic as a concern or caveat.

## Finding worth keeping

`CLAUDE.md`'s `## Project` section is **GSD-generated**, delimited by
`<!-- GSD:project-start source:PROJECT.md -->` / `<!-- GSD:project-end -->`. That is why the two
files disagreed: `PROJECT.md` was amended on 2026-08-02 but the generated block was never
refreshed, so `CLAUDE.md` kept asserting the original pre-v0.8 constraint — and `CLAUDE.md` is what
loads into context every session. Any future edit to the project overview must go through
`PROJECT.md` or a regeneration will silently revert it.

## Verification

- `grep -in "mergeab\|mergab" CLAUDE.md` → 1 hit, the new negating line. No live constraint.
- `grep -in "mergeab\|mergab" .planning/PROJECT.md` → 2 hits: the new line 88, and line 97's
  `Port to Tauri v2` Key Decisions row (a dated decision record, deliberately out of scope).
- No source files touched — `git status` shows only `CLAUDE.md`, `.planning/PROJECT.md`,
  `.planning/STATE.md`, and this task directory.

## Deliberately out of scope

- `PROJECT.md:83` — "**Why a fork**: Heroic maintainers are explicitly anti-Steam…". Accurate
  history of the project's origin, not a live constraint.
- The `Fork Heroic (not build from scratch)` and `Port to Tauri v2` rows in Key Decisions — dated
  decision records; rewriting history was not the ask.

## Companion

A matching auto-memory was written outside the repo at
`~/.claude/projects/-Users-graysonmitchell-Projects-GameLib/memory/heroic-mergeability-constraint-dead.md`
so the instruction survives context resets even in sessions that do not read `PROJECT.md`.
