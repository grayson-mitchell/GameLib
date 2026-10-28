---
status: resolved
trigger: "DRM stage: a fresh wine session can hit the winebus/GameController abort-spin and hang reg add"
created: 2026-10-29
updated: 2026-10-29
source_todo: .planning/todos/pending/2026-10-29-drm-stage-session-can-hit-winebus-gamecontroller-abort-spin.md
---

## Current Focus

hypothesis: CONFIRMED live 2026-10-29 11:46 — the PowerA Switch 2 wired pad's input reports wedge winedevice via winebus's IOHID path (hot-plug reproduces 1/1). The stage hang is that wedge landing during wineboot --init. The uncommitted stage retry is a band-aid, and its pid sweep cannot see winedevice (wine blanks its env in ps -E).
next_action: none (resolved 2026-10-29). Root cause follow-up: .planning/todos/pending/2026-10-29-winebus-iohid-wedges-on-powera-switch2-pad.md
reasoning_checkpoint:
  hypothesis: "Wedged first-session winedevice blocks reg add; a second fresh session passes"
  confirming_evidence:
    - "56-26: stage hung 2/2 on unstaged bottles, 0/4 on staged; retry 1b passed (17 s) on the partly staged bottle"
    - "processes self-exit after ~90 s, so the wedge is session-local, not bottle state"
  falsification_test: "On a fresh bottle the retry also times out, or the kill does not end the spinning winedevice"
  fix_rationale: "Bounded retry on a fresh session; kills only processes carrying this bottle's WINEPREFIX/CX_BOTTLE env"
  blind_spots: "Root cause of first-session dependence unproven; kill of winedevice via ps -E env match untested live; game session itself could hit the same wedge"
tdd_checkpoint:

## Symptoms

expected: The first DRM-mode launch on a fresh (unstaged) bottle stages the registry values (`reg add SteamClientDll64` etc.) within the timeout and the game launches.

actual: The first stage on an unstaged bottle hangs 2 of 2 times in live gate 56-26 (Grim Dawn launch 1, Ranch launch 7). `wineboot.exe --init` is stuck, one `winedevice.exe` sits at 102-108% CPU, and `reg add SteamClientDll64` times out at 15000 ms. Repeat launches on already-staged bottles hung 0 of 4 (since 5ff2dbd8c skips `reg add` for staged bottles). Grim Dawn retry 1b passed on the partly staged bottle the failed stage left behind (3 of 4 values still unstaged, stage took 17 s). The processes exit on their own after about 90 s.

errors: SIDECAR line `reg add SteamClientDll64 timed out after 15000 ms`. An earlier hang showed winedevice (winebus.so) crashing in macOS GameController `_onqueue_addMouse` (malloc_zone_error -> SIGABRT) with wine's ntdll.so signal handler spinning. A 3 s `sample` of the spinning winedevice in the Ranch hang shows 20 of 20 samples on the main thread in `-[IOHIDDeviceClass valueAvailableCallback:]` > `IOHIDQueueClass copyNextValue:` > `_IOHIDValueCreateWithElementValuePtr` (an IOKit HID value-callback spin, not an abort). No wine log exists for the stage session (see todo 2026-10-29-drm-stage-session-has-no-wine-log.md).

timeline: Residual risk after 5ff2dbd8c; previously treated as rare (medium), raised to major after 56-26 showed it blocks every first DRM launch on a fresh bottle. Related resolved sessions: .planning/debug/resolved/drm-bottle-stage-reg-add-hang.md, .planning/debug/resolved/drm-second-launch-bottle-stage.md (fix 110920bcd settles stage reg calls on exit, not pipe close).

reproduction: Use a fresh (or registry-reset) bottle and trigger the first DRM-mode launch of a game (Grim Dawn, Ranch). A staged bottle never reproduces it. The crashing code is stock CrossOver (winebus.so, ntdll.so, winedevice.exe identical to the clone).

constraints:
- Rejected: disabling winebus (`winebus.sys=d`) for the stage call, because the game reuses the stage session and controller input would break.
- Risky: writing user.reg directly without knowing no session is live.
- Candidate: short-timeout first stage, then retry after killing the stage session's own winedevice (only that session's process, not other wine sessions).
- Open: why the first launch is the one that hits it; whether Raft (648800) hung for the same reason.
- Any fix needs a live gate on a fresh bottle (checkpoint the user for it; Claude can't drive the live launch alone). Restart tauri dev after backend changes (it does not rebuild the sidecar).
- Child spawns must use createFakeHomeProfile() per repo conventions (load Skill gamelib-conventions before writing spawn/test code).

files:
- src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts

## Eliminated

## Evidence
<!-- live gate run 2026-10-29 with the user, step by step -->

- timestamp: 2026-10-29 11:35 (live gate, fix in sidecar build 11:21:38)
  checked: Grim Dawn 219990, user.reg with the 4 DRM values removed (backup user.reg.bak-livegate); PowerA Switch 2 wired pad plugged in (IOKit gamepad, not claimed by GameController)
  found: stage passed in ~3 s, no timeout, no retry; game launched; both winedevice idle
  implication: a registry reset on a long-lived bottle did not reproduce; retry path not exercised

- timestamp: 2026-10-29 11:37 (live gate)
  checked: Ranch Simulator 1119730, untouched partly staged bottle from 56-26 launch 7; same pad plugged in
  found: stage passed in ~2 s, no retry; game launched. But in the shared stage/game session (wineserver 26614, started 11:37:32) winedevice 26626 sat at 47-89% CPU. 3 s sample, 1387/1387 main-thread samples: CFRunLoop > -[IOHIDDeviceClass valueAvailableCallback:] > __IOHIDDeviceInputReportWithTimeStampCallback > __IOHIDDeviceInputReportApplier > 0x0 > _sigtramp > ntdll.so. Sample saved at /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/f5931e19-6aef-4bcb-b626-85f9774b43b0/scratchpad/ranch-winedevice.sample.txt
  implication: mechanism is an IOHID input-report callback invoked through a NULL function pointer (jump to 0x0), and wine's ntdll signal handler spins on the fault. It is a race inside the session: here it fired after the reg adds finished, so the stage passed; when it fires during wineboot --init, reg add hangs. The game session itself carries the wedge (CPU burn, likely dead pad input), so a stage-only retry cannot cover it.

- timestamp: 2026-10-29 11:38 (live gate)
  checked: whether the fix's pidsOfBottleSession can see the spinning winedevice
  found: `ps -axwwE` prints winedevice 26626 as `C:\windows\system32\winedevice.exe` with NO env entries (wine rewrites the argv/env area); wineserver 26614 does show CX_BOTTLE/WINEPREFIX. lsof shows winedevice's cwd under the bottle's drive_c.
  implication: the fix's SIGKILL sweep matches 0 winedevice processes live, which is the one it exists to kill. Match by cwd (lsof) under bottleDir instead of env.

- timestamp: 2026-10-29 11:42-11:43 (live gate)
  checked: Ranch quit with winedevice 26626 still spinning
  found: whole session (wineserver, both winedevice, game) gone within ~11 s of game exit, with no endPerGameBridgeBottleSession line; game was not sluggish; pad gave no input (pad is unrecognised on macOS generally, a separate open issue)
  implication: in the game session the wedge costs a core but self-clears at exit; it only blocks when it lands during wineboot --init at stage time

- timestamp: 2026-10-29 11:45 (live gate)
  checked: Ranch relaunch (staged bottle, no reg add) with the PowerA pad unplugged (ioreg: 0 PowerA devices)
  found: both winedevice at 0.0% and 1.3% CPU at 20 s and 28 s
  implication: consistent with the pad being the trigger, but one clean run proves little since Grim Dawn was also clean with the pad in

- timestamp: 2026-10-29 11:46 (live gate)
  checked: hot-plugged the PowerA pad into the same running Ranch session (ioreg: 6 PowerA HID entries)
  found: winedevice 29709 went from 1.3% to 87.6% CPU within seconds. 3 s sample, 1254/1254 main-thread samples: -[IOHIDDeviceClass valueAvailableCallback:] > -[IOHIDQueueClass copyNextValue:] > _IOHIDValueCreateWithElementValuePtr > CFRuntimeCreateInstance > tiny_malloc_should_clear > _os_unfair_lock_lock_slow (the same signature as the 56-26 Ranch stage hang). Sample: /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/f5931e19-6aef-4bcb-b626-85f9774b43b0/scratchpad/ranch-hotplug-winedevice.sample.txt
  implication: CONFIRMED trigger: input reports from the PowerA Switch 2 wired pad (VID 8406 / PID 42784) through winebus's IOHID path. Hot-plug reproduces 1/1 with no relaunch. The three observed signatures (malloc_zone_error SIGABRT in _onqueue_addMouse, jump to a NULL input-report callback, spin on the malloc lock) all look like heap corruption / a bad callback in winebus's IOHID handling of this device, with ntdll's fault handler spinning. The first-launch dependence is only timing: the stage hangs when the pad's reports start during wineboot --init. This is very likely also why the pad gives no input in-game (the separate "pad not recognised" issue).

- timestamp: 2026-10-29 11:53 (live gate, sidecar rebuilt 11:52:18)
  checked: the shipped pidsOfBottleSession + pidsWithCwdInBottle, run read-only against the live Ranch session with the pad hot-plugged (winedevice 33355 at 87-89% CPU), plus a decoy shell parked in the bottle's drive_c
  found: env match = wineserver 33343 only; cwd match = the 14 processes of Ranch's session, including spinning winedevice 33355; the decoy shell not matched (after restricting the cwd match to wine commands, which this check prompted)
  implication: the stage session-end sweep now reaches the process it exists to kill, and nothing outside the bottle's wine session

## Resolution

root_cause: Input reports from a HID gamepad that macOS GameController does not claim (here the PowerA Switch 2 wired pad, VID 8406 / PID 42784) fault winebus's raw IOHID path inside winedevice.exe, and wine's ntdll fault handler spins on one core. When that lands during the stage's wineboot --init, the stage reg add hangs (15 s timeout). "First launch on a fresh bottle" was only timing; hot-plugging the pad into a running session reproduces it 1/1. The first-cut retry fix also could not kill the spinning winedevice, because wine blanks its env in ps -E.
fix: stageDrmBottle retries a timed-out stage reg add once (DRM_REG_ADD_RETRIES), first ending the stage session: clone wineserver -k via endPerGameBridgeBottleSession, then SIGKILL of the bottle's processes matched by env (ps -E WINEPREFIX/CX_BOTTLE; pidsOfBottleSession) or by a cwd inside the bottle restricted to wine commands (lsof; pidsWithCwdInBottle). The root cause (winebus IOHID on that pad) is filed separately; this fix recovers the stage, it does not prevent the wedge, and the game session still spins until exit (self-clears in ~10 s).
verification: Live 2026-10-29: Grim Dawn and Ranch stages passed (no wedge in the window); the wedge reproduced by hot-plug and was sampled; the shipped matchers run read-only against the live wedged session picked out spinning winedevice 33355 and excluded a decoy shell in the bottle. Unit: jest drm suites + fakeHomeIsolation 11/11 (284 passed, 1 skipped), tsc, prettier clean, eslint 0 errors. Residual: the end-to-end timeout -> kill -> retry path never fired live (the wedge cannot be timed into the ~2 s stage window on demand).
files_changed: [src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts, src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts]
