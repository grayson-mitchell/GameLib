# Deferred Items — Phase 40

Out-of-scope discoveries logged during plan execution. Not fixed by the executor per scope-boundary rules.

## 40-02 Task 2: pre-existing clippy failures in main.rs (out of scope)

`cargo clippy -- -D warnings` fails with 12 pre-existing errors in `src-tauri/src/main.rs`
(e.g. `needless_borrows_for_generic_args` at line 5534, `needless_borrow` at line 5561).
These are unrelated to Task 2's change (`src-tauri/Cargo.toml` only — `main.rs` was not
touched by this plan's Task 2). Confirmed pre-existing via `git diff --stat -- src-tauri/src/main.rs`
showing zero changes at the time clippy was run. Logged, not fixed, per scope-boundary rule
(only auto-fix issues directly caused by the current task's changes).
