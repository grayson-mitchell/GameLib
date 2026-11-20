# Deferred items — quick-260926-8vk

## Pre-existing `planning-envelope-tag-gate.py` failure (out of scope)

`pnpm planning-gates` fails on `.planning/planning-envelope-tag-gate.py` (12/13 gates pass). The
failure is entirely inside files from an already-committed, unrelated quick task
(`quick-260925-uok`, commit `20ffb98e7`), not touched by this plan:

- `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/260925-uok-SUMMARY.md` (2 orphan line(s))
- `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/260925-uok-VERIFICATION.md` (1 orphan line(s))
- `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/deferred-items.md` (1 orphan line(s))

`git status` confirms these three files are clean (no working-tree modifications) — the gate was
already red at `HEAD` before this task started. This plan is docs-only, scoped to a single todo
rename in `.planning/todos/`, and constrained by CLAUDE.md's scope boundary rule not to fix
defects in unrelated files. Per the executor's scope-boundary rule, this is logged here rather
than fixed.

All gates specific to this task's file — `.planning/todos/todo-frontmatter-gate.py`,
`.planning/planning-frontmatter-gate.py`, `.planning/state-sdk-field-anchor-gate.py`,
`.planning/uat-visibility-gate.py` — pass. The commit for this task was made without
`--no-verify`; the pre-commit hook (prettier over staged content only) is unaffected by this
gate, since `pnpm planning-gates` is not part of the git hook chain.
