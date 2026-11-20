# Quick 261008-qbb live gate results (2026-10-08, macOS, `pnpm tauri:dev`)

Fix binary = `5990a7e78`. Gesture for every arm: System Events on process `Dock`, `AXShowMenu` on the
`gamelib-shell` tile, then menu item `Quit`. "Lock-armed" = `GamesConfig/lock` present (the `isLocked`
disjunct of `handleExit()`), NOT a running download. Confirm panel is out-of-process:
CGWindowList owner `UserNotificationCenter`, layer 8, 260x218pt. Buttons `[YES] [NO]`, Return = No.

| Arm | State | Decisive observation | Result |
| --- | --- | --- | --- |
| 1-No | lock-armed (L1) | panel up (win 63282, onscreen, `arm-1-no-confirm-panel.png`); `quit (Dock Quit): handed to the sidecar handleExit`; Return -> panel gone, shell 30251 + sidecar 30348 alive, lock present, no `exit requested`, 0 `Trying to kill` | PASS |
| 1-Yes | lock-armed (L1) | panel up (win 63293, `arm-1-yes-confirm-panel.png`); CGEvent click YES -> shell gone <0.5s; `exit requested (code=Some(0))` once -- the exit did not re-enter the veto | PASS |
| 3 | lock absent (L2) | NO panel at any 0.25s poll; routing line + `exit requested (code=Some(0))` same second; sidecar `quit` send-handler marker; shell gone ~0.75s | PASS |
| dead sidecar | lock-armed, sidecar SIGKILLed (L3) | `WARN: quit (Dock Quit): sidecar health probe failed: Broken pipe -- exiting directly`, `exit requested (code=Some(0))`, shell gone ~0.5s, no panel -> the veto never leaves a no-op | PASS |
| negative control | lock-armed, PRE-FIX main.rs (L4) | identity: no `terminate veto` line in `dev-L4-negctl.log`; no panel, shell gone ~0.5s, NO routing line, NO `exit requested` -> bypass reproduced | PASS |

Not run: logout/shutdown. Unsafe to trigger on the operator's machine; the power-off passthrough rests on
`terminate_reply_tests::a_power_off_is_never_blocked` plus the `NSWorkspaceWillPowerOffNotification`
observer, and is INFERRED, not measured.

Restored: `main.rs` sha256 identical to the committed fix (`git diff --quiet -- src-tauri src`), lock file
absent, `config.json` sha256 `3140261a...` unchanged, no shell/sidecar/tauri-dev process left.
