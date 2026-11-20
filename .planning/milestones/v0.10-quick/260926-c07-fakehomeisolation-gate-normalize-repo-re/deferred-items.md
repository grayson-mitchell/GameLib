# Deferred Items — quick 260926-c07

Out-of-scope discoveries logged per the executor's scope-boundary rule (not fixed, not touched).

## `pnpm planning-gates` fails on pre-existing, unrelated files

`planning-envelope-tag-gate.py` fails (12/13 gates passed) because three files from an earlier,
unrelated quick task carry a trailing orphan envelope-closing-tag:

- `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/260925-uok-SUMMARY.md` (2 lines)
- `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/260925-uok-VERIFICATION.md` (1 line)
- `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/deferred-items.md` (1 line)

These files were committed by quick task 260925-uok (`20ffb98e7`), before this session started, and
were never touched by quick 260926-c07. None of this task's files (`CLAUDE.md`, the moved todo,
`src/backend/__tests__/fakeHomeIsolation.test.ts`, `meta/sidecarStartupSmoke.cjs`) triggered the
gate — `.planning\todos\todo-frontmatter-gate.py` (the gate scoped to the todo move) passed
independently, as did all frontmatter/state-anchor gates.

Per the executor's scope boundary, this is logged here rather than fixed: fixing it means editing
files this plan does not own, outside quick-260926-c07's `files_modified` list. Recommend a
follow-up todo to delete the stray tags from the three 260925-uok files.
