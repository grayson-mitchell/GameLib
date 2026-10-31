# Quick 261031-mj9: Land spike 051 native gamepad reader on main - Summary

macOS-only gilrs reader thread in the Tauri shell plus a preload shim that merges its pads into `navigator.getGamepads()` at slot 8+, with WebKit-aware dedupe and failure isolation.

## Commits
- 70f7022af: Rust (Cargo.toml/lock, native_gamepad_shape.rs, macos_native_gamepad.rs, main.rs)
- (Task 2 shim + tests commit, between the two): tauriNativeGamepad.ts and its test
- d60cd6ccb: tauriAttach.ts wiring under isMacWebview()

## Verify results
- `cargo test --bin gamelib-shell native_gamepad`: 4 passed. Full crate: 382 passed, 0 failed, 2 ignored.
- rustfmt --check on the three Rust files: clean.
- Cargo.lock: 100 insertions, 0 deletions; added cfg_aliases, gilrs, gilrs-core, inotify, inotify-sys, libudev-sys, nix, objc2-io-kit, vec_map. No existing version moved.
- `cargo tree -i gilrs`: absent for x86_64-unknown-linux-gnu and x86_64-pc-windows-msvc (cargo prints "nothing to print", not "did not match", so the plan's grep-for-"did not match" form does not apply; verified by reading output); present for aarch64-apple-darwin. gilrs sits under the macOS dependency table.
- Preload jest project: 11 suites, 179 tests passed (new file: 14). `pnpm codecheck` clean. Scoped prettier clean on the three TS files. No "Spike 051 prototype" text remains.
- Prettier is not applicable to the .rs/.toml/.lock paths (`--file-info` gives inferredParser null).

## Deviations
- tauriAttach.test.ts left unchanged: it stays green with the real shim module (no navigator.getGamepads in its stub, so install returns early). No platform-gated assertion added.
- Task 2 tests and implementation were committed together (no separate red commit).
- Shim also listens to real `gamepaddisconnected` to re-evaluate, so a native copy is re-announced if the browser copy goes away.

## Live gate (pending user)
- [ ] L1: fully restart `pnpm tauri:dev` (shell changed; check sidecar.js mtime too)
- [ ] L2: with the PowerA pad, gamelib.log shows `[GAMEPAD] id="PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720)" mapping="" buttons=17 axes=10` and `[NATIVE-GAMEPAD] connected slot=8`
- [ ] L3: stick/D-pad move focus, A activates, B goes back; 261031-lrx: Down at the bottom tile scrolls the grid
- [ ] L4 (Xbox/DualSense available): one `[GAMEPAD]` line plus `[NATIVE-GAMEPAD] suppressed ... matched=...`, one focus step per press. If not, record the browser `[GAMEPAD] id=` verbatim and open a follow-up todo (severity/platform/ready frontmatter).

## Self-Check: PASSED
