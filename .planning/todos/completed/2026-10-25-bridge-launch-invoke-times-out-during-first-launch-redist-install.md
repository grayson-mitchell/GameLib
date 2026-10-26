---
created: 2026-10-25
title: "A bridge launch that installs shared redists outlasts the shell's 60 s invoke timeout, so the renderer gets an unhandled 'sidecar invoke timed out: launch'"
source: 261025-rkj live check, Manor Lords (1363080)
area: steam-bridge
files:
  - src-tauri/src/main.rs
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
severity: minor
platform: macos
ready: live-gate
status: RESOLVED
resolved: 2026-10-26
resolved_by: quick-261026-jmm
---

Quick 261025-rkj made the bridge launch await `installSteamBridgeSharedRedists` before the game
starts. On Manor Lords' first launch (2026-10-25 20:55:06), the step downloaded the declared 228980
depots (about 50 s) and ran three installers (about 70 s). The game started at 20:57:04, about
2 minutes after the click.

At 20:56:05 the renderer logged
`[BLANKPROBE-MARK] unhandled-rejection sidecar invoke timed out: launch t=101402ms`. `launch` is
not on `LONG_RUNNING_CHANNELS` (`src-tauri/src/main.rs:1551`), so the shell rejects it at
`INVOKE_TIMEOUT` (60 s) while the sidecar keeps working. `main.rs:1470` already records this as
expected for runners whose launch handler awaits the whole game session. Bridge launches normally
return in seconds and only cross 60 s on a first launch that installs redists. The launch itself
was unaffected: the game started, and the second launch skipped the step.

Unknown: what the Play button showed while the install ran. The `redist` status should render
"Installing Redistributables (...)", but the operator did not report what the button showed. It
is also not known what the rejected promise does to the renderer's launch state. It could show a
toast, flip the button back to Play, or do nothing.

Options, not yet decided:
1. Add `launch` to `LONG_RUNNING_CHANNELS`. This is simple, but it trades the 60 s rejection for a
   promise that never settles if a launch handler wedges. The list's own precedent is to exempt a
   channel on measurement, not argument.
2. Have the bridge launch return before the redist step, and drive the remaining steps
   (redists, then the game) through status events. This matches how the monitor already decouples
   the wine child from the invoke (Plan 51-23).
3. Have the renderer treat a launch timeout as non-fatal when a `redist` or `winetricks` status is
   active.

Done-when: a first launch that installs redists shows a correct, continuous Play-button state from
click to game start, with no unhandled rejection logged. Verify by deleting a bridge bottle's
`gamelib-shared-redists.json` ledger and relaunching (the HasRunKey values make the installers
no-ops, so remove those too, or use a title that has not installed them yet).

## Resolution

Option 1 taken: `launch` was added to the shell's `LONG_RUNNING_CHANNELS` (quick 261026-jmm), on the 261025-rkj Manor Lords measurement plus the structural reason that non-Steam launch handlers await the whole game session, so no wall-clock bound is correct for them. Options 2 (decouple the bridge launch via status events) and 3 (renderer treats the timeout as non-fatal) were rejected because each fixes only the bridge path, and option 3 also leaves the late real result dropped as an unknown id. The `dispatch_tray_launch` doc comment was corrected to say `launch` is now exempt, and the Library GameCard's launch is now try/finally so a rejection can no longer strand the card in the launching state.

**Live gate: pass — 2026-10-26.** Manor Lords (1363080), operator-driven `tauri dev` restarted after the fix (shell binary built 14:12:00 after the `main.rs` edit, shell pid 84859 started 14:15:10). Redist state reset: ledger moved to `gamelib-shared-redists.json.bak`, `HKLM\Software\Valve\Steam\Apps\CommonRedist` deleted with `reg delete /reg:32` (`system.reg` count 0 once wineserver flushed). Launched from the Library card at 14:18:20: vcredist 2022 x86/x64 installed 14:18:38-14:19:05, DirectX Jun2010 at 14:19:41, game started 14:19:43 (about 83 s from click), HELLO and GINIT ok=1 at 14:19:44. `gamelib.log` carries no `unhandled-rejection`; `gamelib-shell.log` carries no `invoke abandoned (timeout)` or `(dropped)` line for `channel=launch` under pid 84859 (earlier shell pids show five such pairs, including the 10-25 Manor Lords run). The operator reports the Library card showed `Installing Redistributables` and stayed steady until the game started. The ledger was rewritten and settled.
