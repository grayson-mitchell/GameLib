---
phase: quick-261107-uh4
plan: 01
subsystem: ci
tags: [clippy, ratchet, rust-test, windows, ipc-contract]
requires: []
provides:
  - win32 clippy ceilings measured natively
  - clippy ratchet on both rust-test.yml matrix legs
affects: [meta/clippyRatchet.cjs, .github/workflows/rust-test.yml, meta/genIpcContract.ts]
key-files:
  modified:
    - meta/genIpcContract.ts
    - meta/__tests__/genIpcContract.test.ts
    - src-tauri/src/ipc_contract.rs
    - meta/clippyRatchet.cjs
    - meta/__tests__/clippyRatchet.test.ts
    - .github/workflows/rust-test.yml
    - meta/__tests__/rustTestWorkflow.test.ts
  created:
    - .planning/quick/261107-uh4-extend-the-clippy-ratchet-to-the-windows/win32-measurement-after.txt
  moved:
    - .planning/todos/completed/2026-11-07-clippy-ratchet-windows-leg.md
decisions:
  - "get_first fixed at the generator (args.first() at index 0), never ceilinged or allowed"
  - "darwin needless_borrow ceiling deleted (2 -> 0)"
  - "win32 map = native measurement minus get_first: 14 lints, 27 unique warnings"
metrics:
  tasks: 3
  commits: 3
  plan_head_before: 4422ba2f32208ed077e05eff60b5b7179ff7b2da
  plan_head_after: da8dc1403db8ff5460420ad123c0c1bab43a175c
actuals:
  tasks: 3
  commits: 3
status: complete
completed: 2026-11-07
---

# Phase quick-261107-uh4 Plan 01: Extend the clippy ratchet to the Windows leg Summary

Repaired the red macOS clippy leg at its causes (generator emits `args.first()` for index 0; stale darwin `needless_borrow` ceiling deleted), then added a natively measured `win32` ceiling map and ungated both clippy steps in `rust-test.yml`, guarded by a text gate with anti-vacuity mutants.

## Commits

| Task | Commit | Summary |
| ---- | ------ | ------- |
| 1 (tracer) | 1cd9f5b12 | Generator emits `args.first()` at index 0; `ipc_contract.rs` regenerated (17 +/17 -); darwin `needless_borrow` deleted |
| 2 | acc2a9465 | `CLIPPY_CEILINGS.win32` (14 lints), header and no-baseline message rewritten, tests for win32/linux/per-platform keying/no get_first |
| 3 | da8dc1403 | Both `if: runner.os == 'macOS'` gates removed, caveat (f) deleted (g not re-lettered), `hasUngatedClippy` + 2 mutants, todo moved to `completed/` with Resolution |

## Platform evidence

- **Measured:** win32 on this Windows 11 box, rustc 1.99.1 / clippy 0.1.99, x86_64-pc-windows-msvc, after regeneration. `node meta/clippyRatchet.cjs <fresh json> --list` printed `PASS (win32, toolchain 1.99.1)` and exited 0. Recorded in `win32-measurement-after.txt`. The stream finished `success:true` with a gamelib-shell artifact and 0 `clippy::get_first`.
- **Inferred, not measured:** macOS green = CI run 42417450472 minus `get_first` (17, fixed at the generator) minus `needless_borrow` (stale ceiling deleted). It transfers because `ipc_contract.rs` has no `cfg` attribute, so it is the same Rust on both OSes.
- **Pending:** CI confirmation of both legs, which needs the operator's push (not pushed).

## Count drift

None. The post-regeneration native counts equal input 1 for every lint other than `get_first` (now 0): doc_lazy_continuation 5, dead_code 5, type_complexity 2, unnecessary_to_owned 2, cloned_ref_to_slice_refs 2, non_snake_case 2, unused_imports 2, and one each of incompatible_msrv, match_like_matches_macro, manual_hash_one, useless_conversion, needless_borrows_for_generic_args, if_same_then_else, unused_variables.

## Deviations from Plan

- The todo was moved to `.planning/todos/completed/`, not `done/` (the repo's directory is `completed/`).
- Caveat (g) in the workflow header was deliberately not re-lettered to (f), so the historical 261107-8yq citations of "caveat (f)" are not repointed.
- Commit trailers use `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (the session's attribution instruction) rather than the Opus 5.5 trailer named in the spawn prompt, because the committing model is Sonnet 5.5.
- Task 1's first commit was amended once to correct that trailer (unpushed).
- `win32-measurement-after.txt` and this SUMMARY are left uncommitted for the orchestrator's docs commit; the todo move is committed with Task 3.
- `meta/genIpcContract.ts:387` shows a pre-existing `no-base-to-string` eslint warning (`title ?? i`), unrelated to this change and left alone.

No Rule 1-3 auto-fixes, no auth gates, no stubs, no new threat surface.

## Verification

Targeted jest (genIpcContract, clippyRatchet, rustTestWorkflow): all pass (44 + 22 + 32 across runs). `pnpm check:ipc-contract` up to date. eslint 0 errors, prettier clean over every prettier-visible path written. Workflow step order verified with `yaml` (cargo test < toolchain < ratchet, neither with `if`). `python .planning/todos/todo-frontmatter-gate.py` OK. `git diff 4422ba2f3 -- src-tauri pnpm-lock.yaml` shows only `ipc_contract.rs` (17/17).

## Self-Check: PASSED

All listed files exist; commits 1cd9f5b12, acc2a9465, da8dc1403 are in `git log`.
