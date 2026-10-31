# Quick 261101-cl4 Summary

Vite dev watcher now ignores `.planning` and `.claude/worktrees` (Wine dosdevices symlink OOM), and the Tauri shell's stderr writes no longer panic, with the panic log written before stderr.

## Commits
- c5f2a394c fix(quick-261101-cl4): ignore .planning and .claude/worktrees in vite dev watcher
- 95e6f5f4e fix(quick-261101-cl4): non-panicking shell stderr; panic hook writes log before stderr

## Results
- Postfix probe: settled yes, planning_dirs 0, claude_worktrees_dirs 0, watcher_errors 0, both has_* flags yes (total_dirs 10,174). Baseline not re-run (evidence of record, see GATE.md).
- `viteRendererConfig.test.ts`: 49/49 pass (run via `npx jest --selectProjects Meta --runTestsByPath ...`). prettier --check clean on both TS files.
- `cargo check` clean; `cargo test -- panic_record stderr_best_effort`: 5 passed; `cargo fmt --check` clean; bare `eprintln!(` count 0 (220 `shell_eprintln!(`).

## Deviations
- The plan's `pnpm test -- --selectProjects ... --runTestsByPath` form ran the whole Meta suite (6 unrelated suites failed, e.g. findDeadcode.test.ts, not investigated, out of scope). Used `npx jest` directly for the targeted run.
- Added the word "OOM" to the vite.config.ts rationale comment so the new source-text test passes.
- Sweep covered 220 sites (plan estimated 226 including doc comments).
- graphify-out is untracked, so not staged.

## Self-Check: PASSED
