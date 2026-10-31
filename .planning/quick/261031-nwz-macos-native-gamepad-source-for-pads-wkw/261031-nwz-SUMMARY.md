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

## Live gate results (2026-10-31, operator + PowerA 20d6:a720)

- Step 1 restart: pass.
- Step 2 log lines: pass (`[NATIVE-GAMEPAD] connected slot=8`, `[GAMEPAD] ... mapping="" buttons=17 axes=10`).
- Step 4 unplug/replug: pass (reconnects at the next gilrs index, slot 9/10, and drives again).
- Step 3 navigation: input verified clean end to end, navigation itself NOT clean:
  - gilrs state probe (scratchpad) and a temporary renderer diagnostic (`[NATIVE-GAMEPAD-DIAG]`,
    since reverted) show every stick hold/flick returning to neutral within ~20 ms, and D-pad
    up = hat -1.000, down = 0.143, release = 3.286 neutral. No stuck or flickering state.
  - Operator: holding a direction repeats far too fast, and afterwards focus "jumps" (moves up
    two, snaps back down) across the whole interface, on the stick too. Since the input stream
    is clean, both are frontend issues outside this source: repeat speed is the inherited
    50 ms / 300 ms default (`gamepadRepeatDelay` / `gamepadInitialRepeatDelay`, saved in the
    user's config), and the jump is in focus handling (suspects: a3a9db170, adc2ad54d).
