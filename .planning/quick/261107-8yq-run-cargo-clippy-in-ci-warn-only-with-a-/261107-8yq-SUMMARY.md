# Quick 261107-8yq: Clippy ratchet in CI Summary

Warn-only `cargo clippy --all-targets` on the macOS CI leg, held by a per-lint equality-ceiling ratchet (`meta/clippyRatchet.cjs`), with `dbg_macro`/`todo` denied via `[lints.clippy]`.

## Measured (rustc 1.99.1 / clippy 0.1.99, aarch64-apple-darwin)

23 unique warnings (38 raw), identical to the planner's measurement: doc_lazy_continuation 5; type_complexity 2; needless_borrow 2; unnecessary_to_owned 2; cloned_ref_to_slice_refs 2; non_snake_case 2; dead_code 1; incompatible_msrv 1; match_like_matches_macro 1; manual_hash_one 1; useless_conversion 1; bool_comparison 1; needless_borrows_for_generic_args 1; if_same_then_else 1.

Toolchain pin: 1.99.1 (workflow and `CLIPPY_TOOLCHAIN`). Windows not covered (caveat (f), follow-up todo filed).

## Commits

- c5bf5aec9: ratchet script and jest test (20 tests, incl. CLI e2e under fake HOME)
- 7f138d51a: `[lints.clippy]` and workflow steps (after `cargo test`, macOS-gated)
- a third commit: source todo moved to completed with Closure, Windows-leg todo filed

## Deviations

None. The RED-first run was not executed separately (test and script were written together, then verified green). No `.rs` file or Cargo.lock changed. Cargo.toml and `.planning` paths are not prettier-checked (no TOML parser / ignored).

## Self-Check: PASSED
