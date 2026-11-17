---
phase: quick-261117-sin
plan: 01
status: complete
completed: 2026-11-17
---

# Quick 261117-sin: field-anchor gate drift check now reads gsd-core

The drift check looked only for get-shit-done-cc 1.42.3's `sdk/src/query` under global npm
paths. It never covered the macOS npx install, so on these machines it had always fallen back to
the pinned list. It now scans `~/.claude/gsd-core/bin/lib/*.cjs`. Override order is
`GSD_CORE_LIB_DIR`, then `$CLAUDE_CONFIG_DIR`. It reads both compiled call shapes and the
`stateFieldValue` body-field argument.

First real run against 1.21.0 found three field literals the pinned list lacked: `Completed
Phases` (state-transition.cjs), `State Head` (smart-entry.cjs body fallback) and `milestone`
(phase.cjs). None appears in STATE.md's body, so they are pinned as required-0 and STATE.md
passes. A doc comment wrapping `'Current` / `Phase'` across lines briefly produced a bogus
literal; quoted groups now exclude newlines, and the new fixture self-test covers that case.

## Verification

- Real install: `Drift check: gsd-core library found ... (version 1.21.0)`, STATE.md OK,
  self-test 14/14.
- No install (HOME pointed at an empty dir): falls back to the pinned list and passes, as CI does.
- Sabotage: a `GSD_CORE_LIB_DIR` fixture with `'Brand New Field'` exits 1 with DRIFT naming it.
- `pnpm planning-gates` 12/12.
