# Quick 261008-kvz live gate results (2026-10-08, macOS, `pnpm tauri:dev`, fix binary FIX=0af008b98, BASE=f79d3a27c)

The pending operation was armed by creating `~/Library/Application Support/gamelib/GamesConfig/lock` (the `isLocked` disjunct of
`handleExit()`), not by running a download. That reaches the identical confirm branch; it is not evidence that a real download
survives "No" (that is handleExit's pre-existing `response === 0 -> return`).

The confirm panel is rendered out of process: CGWindowList lists it under owner `UserNotificationCenter` (pid 2555, layer 8,
260x218pt), not under the shell pid. It was proven by CGWindowList + a window-scoped `screencapture -l`, never by AX.

| Arm | Gesture | Armed state | Decisive observation | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| 5 | red X | exitToTray ON, lock armed (L1) | main window went onscreen=0 (hidden), shell + sidecar alive, no `quit (window close)` line, no panel | PASS | arm-5-redx-exittotray-on.md |
| 1-No | Cmd+Q | lock armed (L2, exitToTray off) | panel up; `quit (Cmd+Q): handed to the sidecar handleExit` + `[GAMELIB_SIDECAR_SEND_HANDLER] quit`; Return -> panel gone <=0.5s, shell + sidecar alive, main window onscreen=1, 0 kill lines | PASS | arm-1-no-cmdq-lock-armed.md, arm-1-no-confirm-panel.png |
| 2-No | red X | exitToTray off, lock armed (L2) | panel up with `quit (window close)` line, main window onscreen=1 throughout; Return -> gone, shell + sidecar alive, main window STILL onscreen=1, 0 kill lines | PASS | arm-2-no-redx-exittotray-off.md, arm-2-no-confirm-panel.png |
| tray Quit-No (optional) | tray menu Quit | lock armed (L2) | `quit (tray Quit)` line, panel, Return -> alive, window onscreen=1 | PASS | arm-tray-quit-no.md, arm-tray-quit-confirm-panel.png |
| 1-Yes | Cmd+Q | lock armed (L2) | panel; CGEvent click on YES; shell gone ~1s; Yes-branch kill lines; `exit requested (code=Some(0))`; `sidecar terminated on exit` | PASS | arm-1-yes-cmdq-lock-armed.md, arm-1-yes-confirm-panel.png |
| 2-Yes | red X | exitToTray off, lock armed (L3) | panel; main window onscreen=1 while up; click YES; shell gone ~1s; same exit lines | PASS | arm-2-yes-redx-exittotray-off.md, arm-2-yes-confirm-panel.png |
| 3a | Cmd+Q | lock absent, exitToTray off (L4) | no panel at any 0.25s poll; shell gone in 0.76s; routing line + sidecar marker + `exit requested (code=Some(0))` | PASS | arm-3a-cmdq-no-pending.md |
| 3b | red X | lock absent, exitToTray off (L5) | no panel; shell gone in 0.71s; same three lines | PASS | arm-3b-redx-no-pending.md |
| Dock Quit (optional residual) | Dock tile Quit | lock armed (L6) | NO panel, app exited, NO routing line, NO `exit requested` line, no sidecar marker -> still bypasses (`terminate:`) | RESIDUAL CONFIRMED | arm-dock-quit-residual.md |
| 4 (negative control) | Cmd+Q | lock armed, exitToTray true, PRE-FIX main.rs (L7) | identity: old `exitToTray: close handler attached` text, no `app menu: Quit ... routed` line for the pid; no panel, shell gone in 0.45s, no routing line, no `exit requested`, no sidecar marker | PASS (bypass reproduced) | arm-4-negative-control-prefix.md |

Not scored: on L1 the first Cmd+Q attempt produced the same panel but the No answer could not be delivered (the display session
was locked for ~15 minutes and focus was held by another app); the panel was later answered by something I did not drive
(15:53:13 Yes-branch kill lines). That launch is not used for any No/Yes arm; arms 1-No/1-Yes/2-No/2-Yes were re-run cleanly on L2/L3.

Restored: exitToTray back to `true` (config.json byte-identical to the pre-run snapshot, sha256 3140261a...), lock file absent,
`git diff --quiet -- src-tauri` exits 0 (cp from the snapshot of the committed fix), no shell/sidecar/tauri-dev process left.
