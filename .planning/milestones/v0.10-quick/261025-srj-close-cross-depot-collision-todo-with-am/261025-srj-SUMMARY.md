---
phase: quick-261025-srj
plan: 01
status: complete
completed: 2026-10-25
---

# Quick 261025-srj: Close cross-depot collision todo with Amnesia evidence

Docs-only. The cross-depot collision todo is closed with real-Steam evidence from Amnesia 57300,
and two follow-up defects from the library-wide manifest scan are filed as pending todos.

## Commits

- `0b92cdb63` chore(quick-261025-srj): close todo (git mv pending -> completed, status line,
  "Rule confirmed 2026-10-25 (Amnesia 57300)" section, item 2 struck)
- docs(quick-261025-srj): file depot-config-keys and case-only collision todos (see git log)

## Files

- `.planning/todos/completed/2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md`
- `.planning/todos/pending/2026-10-25-depot-selection-ignores-realm-steamdeck-and-optional-depot-config.md`
  (major, any, code)
- `.planning/todos/pending/2026-10-25-case-only-cross-depot-path-collisions-are-not-detected.md`
  (medium, any, code)

## Deviations

None. The Amnesia caveat (winner is also the more platform-specific depot) is recorded, not
overclaimed. Nothing under `src/` changed. The untracked `261025-rkj-*` directory was not staged.
