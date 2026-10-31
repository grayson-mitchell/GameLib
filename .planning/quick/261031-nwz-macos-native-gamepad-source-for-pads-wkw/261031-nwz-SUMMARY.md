---
phase: quick-261031-nwz
plan: 01
status: tasks 1-2 complete; Task 3 live gate PENDING (operator)
requirements: [todo-2026-10-30-macos-native-gamepad-source]
---

# Quick 261031-nwz: macOS native gamepad reader hardening

Reader loop is now a tested driver (`PadSource` / `EmitGate` / `run_reader` in the cfg-free `native_gamepad_shape.rs`) with 8 ms emit coalescing and a trailing emit; renderer hot-plug cases added. Live gate (Task 3) not run.

## Commits
- 3362e5816 feat: driver + coalescing + 5 Rust tests (native_gamepad_shape.rs, macos_native_gamepad.rs)
- Task 2 commit (see git log, "test(quick-261031-nwz)"): 3 hot-plug renderer tests (tauriNativeGamepad.test.ts)

## Results
- `cargo test --bin gamelib-shell`: 387 passed, 0 failed, 2 ignored. 9 native_gamepad tests (4 old + 5 new) pass.
- Preload jest: 11 suites, 183 tests pass. `pnpm codecheck` clean. Prettier clean on the test file. rustfmt --check clean.
- main.rs, Cargo.toml, Cargo.lock, gamepad.ts, nintendo.ts unchanged. Shim untouched (no defect found).

## Deviations
- TDD RED/GREEN were not committed separately: tests and implementation were written together and committed as one feat commit.
- `run_reader` logs connection-change lines via a small private `tick_logged` wrapper (Spy PadSource) on `EmitGate`, so `tick`'s public signature stays as planned. Slightly clunky; behavior-equivalent.

## Task 3 live gate: PENDING
Operator steps recorded in the plan (restart `pnpm tauri:dev`, press A, hold stick ~3 s, unplug/replug and expect `[native-gamepad] all pads disconnected` then `pad N ... connected=true` and a new `[NATIVE-GAMEPAD] connected slot=...` in gamelib.log). Results: not yet reported. Todo stays in pending/.
