---
phase: quick-261119-8rf
plan: 01
subsystem: steam-depot-download
tags: [depot, macos, exec-bit, shebang, rust]
requires: []
provides:
  - shebang +x fallback for #! launchers in *.app/Contents/MacOS (gamelib-depot post.rs)
  - Outcome.stats.shebangExecApplied and shebang=N in the [depot-rust] outcome log line
affects: [gamelib-depot, depotRust TS outcome type]
key-files:
  modified:
    - src-tauri/crates/gamelib-depot/src/post.rs
    - src-tauri/crates/gamelib-depot/src/download.rs
    - src-tauri/crates/gamelib-depot/src/outcome.rs
    - src-tauri/crates/gamelib-depot/src/delta.rs
    - src-tauri/crates/gamelib-depot/tests/job_install.rs
    - src-tauri/crates/gamelib-depot/tests/post.rs
    - src/backend/storeManagers/steam/depotRust/types.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/depotRust/rustDepot.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/fixtures/stubRustDepot.ts
    - src/backend/storeManagers/steam/__tests__/depotRustErrorMap.test.ts
decisions:
  - "Shebang fallback requires content (#!) AND path (*.app/Contents/MacOS/ on the resolved dest); a path never grants +x alone"
metrics:
  tasks: 3
  completed: 2026-11-19
status: complete
actuals:
  tasks: 3
  commits: 4
plan_head_before: 2e3d78909f5345b802db9acec9a60c18f7605d16
plan_head_after: 20240b7b3a31f3cf2b22ee0882f46f7333a4a4c5
---

# Phase quick-261119-8rf Plan 01: Shebang exec fallback for depot installs Summary

Depot installs now give 0o755 to an unflagged `#!` script inside an app bundle's `Contents/MacOS`, so Bastion (107100)'s bash launcher runs through Steam instead of opening in TextEdit.

## What was built

- `post.rs`: `shebang_wants_exec` (2-byte bounded probe), `in_app_bundle_macos_dir` (pure path gate on the resolved destination, 4-wide component window, ASCII case-insensitive, any depth and nested `.app`), `apply_shebang_fallback` (Windows/flag/path gates, chmod 0o755, warnings on failure).
- `download.rs`: `Counters.shebang_exec`; `apply_modes_sync` runs the shebang fallback only when the Mach-O fallback declined, so a file is never counted twice. This covers fresh writes, the reconciled-file heal and delta commits. The `Stats` construction carries the count.
- `outcome.rs` / `delta.rs`: `Stats.shebang_exec_applied` (serde default, serialized `shebangExecApplied`) and the delta stats closure.
- TS: `RustOutcome.stats.shebangExecApplied`, and `logOutcome` prints `shebang=N` next to `macho=N`.
- Todo `2026-11-18-depot-install-misses-exec-bit-on-shell-script-launchers.md` moved to `completed/` with a Resolution section.

## Red runs

- Task 1: before the code existed, `job_install shebang` failed to build (`no field shebang_exec_applied on type Stats`).
- Task 3: no unit case was red. The 11 `mod shebang` cases passed on first run against the Task 1 implementation, so `post.rs` was not changed in Task 3.

## Commits

- `25487537d` fix: make #! launchers in app bundles executable on depot install (Task 1)
- `fc4d35a8b` feat: log the shebang exec fallback count in the depot outcome line (Task 2)
- `ade7147ab` test: pin the shebang exec fallback probe, path gate and apply contract (Task 3)
- `20240b7b3` docs: close the depot shebang exec-bit todo

## Verification

- `cargo test -p gamelib-depot`: 371 passed, 0 failed (359 at HEAD; golden parity included). `--test job_install` 13 (was 12). `--test post` 64 (was 53).
- `cargo fmt -p gamelib-depot -- --check`: exit 0.
- Clippy ratchet: `PASS (darwin, toolchain 1.99.1)`.
- `git diff --quiet 2e3d78909` on Cargo.lock, the crate Cargo.toml and tests/fixtures: clean.
- Jest, 9 outcome-fixture suites: 176 passed. `pnpm codecheck`, scoped `eslint --max-warnings 0`, scoped `prettier --check` on the 5 TS files: all pass.
- `pnpm planning-gates`: 12/12.

## Scope decision

The rule needs both conditions: the first two bytes are `#!` and the resolved destination lies inside `*.app/Contents/MacOS/` at any depth. A path never grants +x by itself (the Phase 23-08 content-gated invariant, pinned by a test), and `#!` alone is too weak a signal to apply everywhere. No `Info.plist` parse, since `CFBundleExecutable` always names a file in that directory and files land concurrently. Not covered on purpose: `#!` scripts in `Contents/Resources`, in a `.bundle`, or outside any bundle. Widening trigger: a title whose unflagged `#!` launcher sits outside `*.app/Contents/MacOS/` (a Linux `start.sh`, a `Contents/Resources` script) is the evidence that would justify widening the rule.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. No new network, auth or schema surface; mitigations T-8rf-01..03 are implemented as specified.

## Follow-up (human, live; not run by this plan)

On the Mac, uninstall Bastion (107100), install it fresh through GameLib's depot path, then press Play. Expected: `ls -l` on `Bastion.app/Contents/MacOS/Bastion` shows `-rwxr-xr-x` with no manual chmod; gamelib.log's `[depot-rust] outcome appId=107100 ...` line shows `shebang=1`; Steam runs the game, TextEdit does not open, and no `AppError_16` appears on the next launch. `81-HUMAN-UAT.md` item 3 (launch L2) is ready to re-run and carries this check.

## Self-Check: PASSED

All created/modified files exist and commits 25487537d, fc4d35a8b, ade7147ab and 20240b7b3 are ancestors of HEAD.
