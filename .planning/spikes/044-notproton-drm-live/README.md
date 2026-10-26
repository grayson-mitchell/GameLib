---
spike: 044
name: notproton-drm-live
type: standard
validates: "Given Grim Dawn (219990, SteamStub 3.1) and XCOM EU/EW (200510, CEG) installed into native Mac Steam as Windows builds and forced onto NotProton 1.2.1's compat tool (CrossOver 26.3.0.39832), with GameLib's bridge removed from the install, when each is launched from Steam, then see whether it reaches its menu, and if not, name the step that fails"
verdict: PARTIAL
related: [035, 036, 037, 040, 041, 043]
tags: [steam, macos, notproton, lsteamclient, proton, steamstub, ceg, drm, dipc, crossover, grim-dawn, xcom, live]
---

# Spike 044: NotProton against the SteamStub and CEG walls, live

## What This Validates

Spike 043 read NotProton's source and inferred that its design (Valve's genuine
`steamclient(64).dll` + export trampoline to `lsteamclient` + Mac `steamclient.dylib` + a port of
Proton's `steam_helper`) should clear both DRM walls GameLib's bridge stops at: the SteamStub file
check (040/041) and the CEG start handshake (035–037). This spike runs it.

## Setup

- **NotProton 1.2.1** release app, installed from `~/Applications/NotProton.app`. Setup needed the
  App Management permission added by hand: the app is ad-hoc signed, and macOS didn't list it
  until it was added with **+** (a copy run from `/private/tmp` never appeared).
- What setup did: cloned and patched CrossOver 26.3 into `~/Library/Application Support/notproton/runners/`;
  fetched `steamclient(64).dll`, `tier0_s64.dll` and `vstdlib_s64.dll` from
  `client-update.akamai.steamstatic.com`; installed the compat tool `compatibilitytools.d/notproton-26.3`
  (a `run` script, no `compatibilitytool.vdf`; Steam shows it as "crossover-26.3"); and changed
  `/Applications/Steam.app` (Info.plist `DYLD_INSERT_LIBRARIES=notproton.dylib`, a joystick
  blocklist entry, ad-hoc re-sign). `legacycompat` stayed 0/6.
- `stage.sh notproton-26.3` puts APFS clones of the two bottle installs into Mac Steam's library with
  `platform_override_source windows` ACFs and a `CompatToolMapping` for both. Grim Dawn's clone gets
  its original `steam_api*.dll` back, and GameLib's forwarder and `gamelib_bridge.cfg` are removed,
  so none of GameLib's code is in the path. Bottle installs are untouched. `stage.sh --undo`
  reverses it, using `~/.gamelib-spike044-backup/config.vdf.before`.
- `collect.sh <appid> <label>` copies a run's logs into `logs/<appid>-<label>/`.
- `ack_watch.c` / `arm_ack.sh`: the run-3 instrument (below).

## Investigation Trail

### Grim Dawn (219990): reaches the menu

The user picked launch option 1, which runs `compat/grim dawn.exe`. `decode_bind.py` from 040 shows
it's SteamStub 3.1 x64 with flags `0x00` and every check armed, the same as `x64/Grim Dawn.exe`.
First launch ran the install scripts (vcredist, DirectX), then the game reached its main menu on
DXVK, played, and exited 0 after 69s with no dialog. Through GameLib's bridge, the same check stops
the game with "Application load error" before `steam_api64.dll` loads (040).

The game log has no clean Steam API init line: only `SteamInternal_SetMinidumpSteamID … [API loaded no]`,
which is written before init. Under [[bridge-verified-criterion-is-strict]], Steam API init is
**not** verified. What is verified is that the stub's launch check passed.

### XCOM (200510): run 1, silent exit at ~36s

Steam ran `Binaries/Win32/XComGame.exe` (Enemy Unknown). It has the same CEG markers as the
`XComEW.exe` that 035 traced (`STEAMSTART`, `STEAM_DIPC`). Dock icon, no window, exit 0 after 36s.
The default `WINEDEBUG=err+all,fixme-all` showed nothing. The 30s CEG wait from 035 fits the time.

### Run 2: `WINEDEBUG=+sync,+loaddll %command%`

`logs/200510-run2/notproton-wine.log`:

- `steam.exe` (NotProton's `steam-shim`) creates `Steam3Master_SharedMemLock` and
  `Global\Valve_SteamIPC_Class`, loads `lsteamclient.dll` (builtin) and the genuine
  `steamclient64.dll`, `tier0_s64.dll` and `vstdlib_s64.dll` (native), then creates `STEAM_DIPC_CONSUME`.
- The game loads `XComGame.exe` and then `steam_api.dll`, creates
  `STEAM_START_ACK_EVENT_236_14811188` and `STEAM_TERM_EVENT_…`, releases the request
  semaphore, and waits 30s on the ACK (line 810).
- The DIPC thread wakes and runs `NtOpenEvent access 0x100000, name L"STEAM_START_ACK_EVENT_236_14811188"`
  (line 811), then `NtSetEvent` on that handle.
- The game's wait returns `0x102` (STATUS_TIMEOUT, line 910). It sets the TERM event and exits 0
  at 35s.

`0x100000` is `SYNCHRONIZE` alone. Signalling an event needs `EVENT_MODIFY_STATE` (`0x2`).
Genuine Windows Steam opens the same event with `0x100002` (036 `evidence-oracle.txt` line 10), and
so did 036's responder, whose ACK was accepted.

### Run 3: signal the ACK with the correct mask

`ack_watch.exe` runs beside NotProton's `steam.exe` in the same prefix, through NotProton's wine and
wineserver. It creates no DIPC semaphores and launches nothing. It polls the object directories for
`STEAM_START_ACK_EVENT_*` and, for each new one, first calls `SetEvent` through a `SYNCHRONIZE`-only
handle as a control, then through a `SYNCHRONIZE | EVENT_MODIFY_STATE` one.

`logs/200510-run3/ack044.log`:

```
saw STEAM_START_ACK_EVENT_252_14811188 in \BaseNamedObjects\Session\1
  control SetEvent(0x100000 handle) -> 0 err 5
  SetEvent(0x100002 handle) -> 1 err 0
```

The game's ACK wait then returned `0` (signalled) for the first time. The game exited 0 straight
afterwards, without opening a window. That's the same post-ACK exit 036 recorded. NotProton's
`steam.exe` stayed up after the game had gone, and later exited by itself.

### Run 4: NotProton's own steam.exe with the flag fixed

In NotProton's shipped `bridge/steam.exe`, `find_ack_event` has exactly one `OpenEventW` call:
`movl $0x100000, %ecx` at VA `0x140005962` (file offset `0x5962`). One byte was changed, giving
`b9 02 00 10 00` (`$0x100002`). The original (sha256 `adc7c09c…`) was backed up to
`~/.gamelib-spike044-backup/steam.exe.orig`. The run script's `cmp` staged the patched copy
into the prefix, and no other helper was running.

`logs/200510-run4/notproton-wine.log`:

```
00f0:trace:sync:NtWaitForSingleObject handle 0xd0, alertable 0, timeout -29.-9990000
00f4:trace:sync:NtOpenEvent access 0x100002, name L"STEAM_START_ACK_EVENT_236_14811188"
00f4:trace:sync:sysv_NtSetEvent handle 0xfc, prev_state 0x0
00f0:trace:sync:NtWaitForSingleObject -> 0
```

The ACK lands, and the session ends after 6s, not 35s. The game then exits 0 straight away, as in
run 3. The original `steam.exe` was put back afterwards. The prefix copy goes back to it on the
next launch.

### Source check

- NotProton `steam-shim/steam.cpp`, in the function that finds the ACK event:
  `ret = OpenEventW(SYNCHRONIZE, FALSE, di->ObjectName.Buffer);`. It's line 1691 at Gcenx `c09e0c4`
  and line 1708 at upstream NotProtonNot `b2f49e4` (2026-10-24), so it's still there at HEAD.
  `steam_drm_thread` calls `SetEvent(start_ack)` without checking the result.
- Proton `steam_helper/steam.c:848` (ValveSoftware `bc89621`):
  `ret = OpenEventW(SYNCHRONIZE | EVENT_MODIFY_STATE, FALSE, di->ObjectName.Buffer);`.
- So the bug was introduced in NotProton's port and isn't in Proton. Neither clone's shallow history
  reaches the commit that dropped the flag.

## Results

**PARTIAL: SteamStub cleared, CEG not.**

| wall | GameLib bridge | NotProton 1.2.1 as shipped | NotProton + correct ACK mask |
|---|---|---|---|
| SteamStub file check (Grim Dawn) | fails (040) | **passes, menu reached** | n/a |
| CEG start ACK (XCOM) | ACK accepted (036 responder) | **ACK refused**: `ERROR_ACCESS_DENIED`, 30s timeout | ACK accepted (run 3 helper; run 4 NotProton's own patched `steam.exe`) |
| CEG after ACK | exits 0 (036/037) | not reached | **exits 0** |

**What this changes:**

- **043's SteamStub inference holds.** A genuine signed `steamclient64.dll` in the slot, trampolined
  to `lsteamclient`, gets a fully armed SteamStub 3.1 title to its menu with only native Mac Steam
  running. That's the mechanism adoption option 2 in 043 would bring to GameLib. Steam API init
  behind it is still unverified.
- **043's CEG inference doesn't.** "The same ACK + the full `steam_helper` environment + a genuine
  client in the slot" is now tested. With the ACK fixed, XCOM does what it did under 036's bare
  responder. The full Proton environment and the genuine client add nothing at this step. In 036's
  oracle, genuine Windows Steam services the `STEAMSTART` request (the `STEAM_DRM_IPC` and
  `STEAM_DATA.<pid>` exchange) and the game keeps loading. Nothing on the Mac side does that, and
  037's verdict stands.
- **NotProton has a one-flag bug** that would stop every CEG title even if the later step were
  solved. It's in their code, not Proton's. The fix is submitted upstream as
  [NotProtonNot/NotProton#260](https://github.com/NotProtonNot/NotProton/pull/260), with evidence
  in `notproton-report-notes.md`.

**Bottled-Steam stance:** for SteamStub titles, the "DRM may justify bottled Steam" exception no
longer holds on mechanism grounds. There's a demonstrated non-bottled route, though GameLib doesn't
have it yet. For CEG titles the exception stands until the request-servicing step is understood
([[bottled-steam-is-narrow-fallback]]).

## Next

- **Spike 045 (proposed):** what genuine Windows Steam writes when it answers `STEAMSTART`. Diff
  036's oracle dumps of `STEAM_DRM_IPC` / `STEAM_DATA.<pid>` before and after the ACK against what
  the game reads after its wait returns. That decides whether the step is a protocol a responder
  can answer from Mac Steam's own state, or a Windows-client-only service.
- **Grim Dawn Steam init:** one more run with the overlay (Shift+Tab) or "In-Game" status checked,
  to close the strict-criterion gap.

## Current machine state

Left in place for follow-up runs:

- NotProton is still installed. `/Applications/Steam.app` carries its `DYLD_INSERT_LIBRARIES` plist
  entry and ad-hoc signature, and the original Info.plist and signature are in
  `~/.gamelib-spike044-backup/Steam.app`. Use NotProton's own uninstall to revert.
- Both games are still staged. Quit Steam and run `./stage.sh --undo` to remove them.
- XCOM's launch options still carry `WINEDEBUG=+sync,+loaddll %command%`.

## Artifacts

- `stage.sh`, `collect.sh`: staging and log collection.
- `ack_watch.c`, `arm_ack.sh`: run-3 instrument (`ack_watch.exe` is built by
  `.build-tools/zig/zig cc -target x86-windows-gnu -O2 -o ack_watch.exe ack_watch.c`).
- `logs/219990-run1/`, `logs/200510-run{1,2,3}/`: NotProton run logs, wine logs, Steam console and
  compat tails, and the run-3 `ack044.log`.
- `notproton-report-notes.md`: evidence for the upstream bug report.
- NotProton and Proton sources were read from scratch clones and not committed.
