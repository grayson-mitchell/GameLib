---
quick_id: 261121-ssg
type: quick
---

# Fix macowned helper stub ETXTBSY flake on ubuntu

Todo: `.planning/todos/pending/2026-11-21-macowned-helper-exit-code-test-flakes-on-ubuntu.md`

## Task 1: make the stub helper's creation fork-safe

- files: `src-tauri/crates/gamelib-steamcm/src/macowned.rs` (test module `stub()`)
- action: stop writing the exec'd stub from this process. Write the body to a side file and have
  a `cp` child create the stub, then chmod by path, so no write fd on the stub can be inherited by a
  child forked on another test thread (Linux ETXTBSY → spawn error → `HelperFailed`).
- verify: `cargo fmt -p gamelib-steamcm -- --check`, `cargo clippy -p gamelib-steamcm --tests -- -D warnings`,
  `cargo test -p gamelib-steamcm`. No `<verify>` prettier check: the only path written is a `.rs` file,
  which prettier does not format.
- done: crate tests green; no retries added.
