---
status: complete
quick_id: 261114-lsl
commits: [e27ef9d9d, d0cacafd2]
---

# Quick 261114-lsl: Call ManifestStore::prune from production

`manifest::prune_after_install` now runs from `download::run_install` after a Completed install or update that wrote its ACF.

- Protected set: every InstalledDepots GID across the steamapps dirs GameLib has finalized into. These are tracked in `<cache>/steamapps-dirs.json`, and missing dirs are dropped.
- Fails closed: if any ACF in those dirs is unreadable, nothing is deleted.
- A prune failure is logged as a depot warning and never changes the job outcome.
- Bound after updates: installed GID(s) plus one newest other per depot. `ManifestStore::prune` is unchanged and delegates to a new `prune_dir`.
- Tests: 5 new in `tests/manifest.rs`, 2 new in `tests/delta.rs`. The full gamelib-depot suite passes, and fmt and clippy are clean.
- The todo is moved to `completed/` with a Resolution section.

## Deviations

- Task 2 tests and wiring were written together, so there was no separate RED run for the delta tests. Task 1 had a proper RED (compile failure).
- The first commit attempt for task 2 only included the todo rename. I amended it to include the code and the todo edit.

## Notes

- `pnpm planning-gates` reports 11/12: `.planning/STATE.md` failed the SDK field-anchor check. This is not caused by this task, and the orchestrator owns STATE.md.
- `.planning/STATE.md` and `src/common/types.ts` show as modified in the working tree. I did not edit them and did not stage them.
- Not live-verified.
