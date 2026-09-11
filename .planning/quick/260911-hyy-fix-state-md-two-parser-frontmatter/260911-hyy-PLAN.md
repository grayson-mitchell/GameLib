---
quick_id: 260911-hyy
date: 2026-09-11
status: complete
title: 'Fix STATE.md frontmatter unreadable by gsd-sdk, and re-scope the repo-wide frontmatter todo'
autonomous: false
---

# Quick 260911-hyy — STATE.md frontmatter, and re-scoping the two-parser todo

## Origin

Actioning `.planning/todos/pending/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md`.
Its measurement re-confirmed clean (53 of 2444 at `bab7a5dae`), but investigation showed its
**prescribed remedy was harmful**, so the sweep it asked for was NOT performed. See the re-scoped
todo for the full finding.

## Process deviation, recorded deliberately

This ran **inline in the orchestrator**, not via `gsd-planner` + `gsd-executor` subagents, and no
`gsd-sdk state.*` / `roadmap.*` verb was invoked. Both choices are deliberate: STATE.md is the file
this task repairs, it has been corrupted twice before by automated writes, and the repair is a
byte-sensitive transform of narrative fields whose loss is historically silent. The edit was made
by a verified script, never by retyping narrative text.

## Tasks

1. **Repair STATE.md frontmatter.** Convert `stopped_at` and `last_activity` from `|-` block
   scalars (unreadable by the SDK parser, which returns the literal string `|-`) to single-line
   single-quoted scalars readable by both parsers. Transform programmatically; verify before write.
2. **Re-scope the todo.** Replace its "fix 53 files then widen the gate" remedy with the actual
   blocker: two parsers that disagree, with no shape faithful to both. Raise `severity: minor` to
   `medium` and correct its false "not read by tooling as YAML" claim.

## Verification contract

- js-yaml parses STATE.md frontmatter as a mapping; both narrative values equal the originals.
- `gsd-sdk query frontmatter.get` returns real narrative for both fields, not `|-`.
- Simulated `phase-lifecycle.js:1122` rewrite still parses (time bomb defused).
- Body after the frontmatter is byte-identical.
- `pnpm planning-gates` stays 10/10; corpus failure count stays 53 (no new offender introduced).
