---
status: resolved
trigger: "winebus's IOHID path wedges winedevice on the PowerA Switch 2 wired pad"
created: 2026-10-30
updated: 2026-10-30
source_todo: .planning/todos/pending/2026-10-29-winebus-iohid-wedges-on-powera-switch2-pad.md
---

## Current Focus

hypothesis: The defect is not winebus's IOHID bus. Any in-process consumer that opens the PowerA pad inside winedevice (winebus IOHID, SDL IOKit, Apple GameController/GCHIDLib) triggers memory/lock corruption (illegal-instruction faults in libsystem_platform, recursive sigtramp into ntdll.so, or a CPU spin). Native IOHID callbacks on arm64 and x86_64/Rosetta are clean (8-byte reports, no overflow), so the trigger is wine's winedevice process environment plus this device.
test: (next, needs user at the machine) 1) Plug in a different raw-IOHID pad that GameController does not claim (if one exists) with the same bottle and DisableHidraw=1 and SDL_JOYSTICK_MFI=0, and see whether the faults reproduce, which tells device-specific from generic. 2) Check whether a newer CrossOver build (or upstream wine winebus iohid/sdl) changes the behaviour. 3) Optionally, a native probe that links CoreFoundation and installs a SIGILL/SIGSEGV-friendly handler like wine's, to see whether wine's signal handling is the corrupting element.
expecting: If another pad also faults, the fix is generic (IOHID/SDL both unusable under this CrossOver, so a stage-time guard is the best available). If only this pad faults, a device-specific mitigation (or a report to CodeWeavers) is the route.
next_action: Run A failed (spin persists); decide between stopping at documented mitigation vs other-pad test vs CodeWeavers report. (Older: research done: no newer CrossOver; live-test env SDL_NO_SIGNAL_HANDLERS=1 per Evidence). Earlier plan follows. Checkpoint to the user. Ask for (a) the other-pad test, (b) a decision on whether to stop at a documented mitigation (DisableHidraw=1 alone is NOT sufficient; keep the existing stage retry in stageDrmBottle.ts) rather than chase a CrossOver-internal defect.
reasoning_checkpoint: DisableHidraw=1 prevents only the winebus IOHID path; it does not stop the spin (run 2) and SDL_JOYSTICK_MFI=0 swaps the spin for fatal setupapi driver-install failures (run 3). Neither registry value nor env var is a verified fix, so no code change is justified yet.
tdd_checkpoint:

## Symptoms

expected: With the PowerA Advantage Wired Controller for Nintendo Switch 2 (USB, VID 8406 / PID 42784) connected or hot-plugged during any DRM-mode wine session, winedevice.exe stays idle and the pad gives input in game.

actual: Input reports from the pad wedge winedevice.exe: one core spins (1.3% -> 87.6% CPU within seconds of hot-plug, 1/1). The pad gives no input in game. If the wedge lands during the stage's wineboot --init, the stage reg add hangs (15 s timeout); the stage retry in stageDrmBottle.ts recovers from that but does not prevent it. In the game session the spin lasts until game exit, then the session self-clears in ~10 s.

errors: Three sampled stack signatures in winedevice (winebus.so IOHID path, wine ntdll fault handler spinning):
- _onqueue_addMouse > malloc_zone_error > SIGABRT
- -[IOHIDDeviceClass valueAvailableCallback:] > __IOHIDDeviceInputReportWithTimeStampCallback > __IOHIDDeviceInputReportApplier > 0x0 > _sigtramp > ntdll.so
- -[IOHIDDeviceClass valueAvailableCallback:] > IOHIDQueueClass copyNextValue: > _IOHIDValueCreateWithElementValuePtr > CFRuntimeCreateInstance > tiny_malloc_should_clear > _os_unfair_lock_lock_slow
macOS GameController framework does not claim this pad, so winebus reads it through raw IOHID.

timeline: Found in live gate 2026-10-29 (debug drm-stage-winebus-hid-spin, now resolved with the stage-retry band-aid). Intermittent at stage time (timing), 1/1 on hot-plug. Phase 56-34 third live gate: one connected-pad Grim Dawn launch had no wedge (inconclusive).

reproduction: Start a DRM-mode game (Ranch Simulator 1119730 or Grim Dawn 219990) in GameLib on macOS with the pad unplugged; once winedevice is idle, hot-plug the PowerA pad. Watch winedevice CPU (ps) and `sample` it. Crashing code is stock CrossOver (winebus.so, ntdll.so, winedevice.exe identical to the clone).

constraints:
- Rejected: disabling winebus as a whole (`winebus.sys=d`) — the game reuses the stage session and controller input would break.
- Prefer steering only this device / only the IOHID bus (e.g. winebus SDL backend, or per-bus disable under HKLM\System\CurrentControlSet\Services\winebus). Also check whether newer CrossOver or upstream wine fixes the macOS IOHID backend.
- Gate (live, needs the user): hot-plug the pad into a running DRM session — winedevice must stay idle AND pad input must work in game. Also confirm other pads (GameController-claimed) still work.
- Live gates need the user at the machine; checkpoint them. Restart tauri dev after backend changes (it does not rebuild the sidecar; check sidecar.js mtime).
- Child spawns in src/ or meta/ must use createFakeHomeProfile() (load Skill gamelib-conventions before writing spawn/test code or todo/UAT edits). <verify> prettier checks scoped to exact paths.
- Known-bad does not mean reroute to bottled Steam (memory: bottled-steam-is-narrow-fallback).

files:
- src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts

## Eliminated

- hypothesis: a per-device (VID/PID) filter exists for the IOHID bus
  evidence: winebus.so has no getenv/SDL_GAMECONTROLLER_IGNORE_DEVICES strings; only "Ignoring HID device: not a joystick or gamepad" (class check). No per-device lever.
  timestamp: 2026-10-30
- hypothesis: IOHID can be disabled via its own registry value
  evidence: no IOHID-specific value in winebus.sys; it is gated by DisableHidraw (see Evidence).
  timestamp: 2026-10-30

- hypothesis: winebus DisableHidraw=1 (IOHID bus off) prevents the wedge
  evidence: run 2 (2026-10-30) and Run A (2026-10-31) spin at 91-102% with the IOHID bus confirmed off; the faulting callback is Apple GameController/GCHID, not winebus IOHID. Ranch no-spin run was luck.
  timestamp: 2026-10-31
- hypothesis: an SDL_GAMECONTROLLERCONFIG mapping makes SDL/winebus deliver the pad
  evidence: mapping applied ("Setting environment mapping") but SDL never created a device for the pad (run 2, Run A); with SDL_JOYSTICK_MFI=0 it enumerates but wine then takes c000001d faults and setupapi cannot install a function driver, so joy.cpl never lists it.
  timestamp: 2026-10-31
- hypothesis: SDL_JOYSTICK_MFI=0 avoids the GameController path
  evidence: run 3 swaps the spin for c000001d faults (14) 1 ms after SDL opens the pad; GameController libs stay mapped.
  timestamp: 2026-10-31
- hypothesis: SDL_NO_SIGNAL_HANDLERS=1 (upstream e90cb1c257b8) fixes it
  evidence: Run A (2026-10-31): winedevice 16229 spun at 91-94% with the same IOHIDDeviceClass valueAvailableCallback signature.
  timestamp: 2026-10-31

## Evidence

- timestamp: 2026-10-30
  checked: CrossOver.app winebus.sys (x86_64-windows) UTF-16 strings and disassembly of driver init (around 0x180002c7b-0x180002fa4)
  found: registry values read from the winebus service key: "Enable SDL" (stored as sdl_disabled = (value==0); absent => SDL enabled), DisableHidraw, DisableInput, DisableUdevd, Split Controllers, Map Controllers. Start order: SDL bus (if enabled), UDEV bus, IOHID bus only when the DisableHidraw flag (0x1800070a4) is 0, XBOX bus. winebus.so (unix side) ships sdl_bus_init, iohid_bus_init, udev, xbox ("xbox disabled on macOS Sequoia+").
  implication: DisableHidraw=1 is the only registry lever that stops IOHID; winebus.sys=d and per-device filters are not needed/available.
- timestamp: 2026-10-30
  checked: CrossOver lib64/libSDL2-2.0.0.dylib exists; winebus.so imports it
  found: SDL backend is compiled in and loadable; it already runs alongside IOHID by default.
  implication: after disabling IOHID, SDL should still expose joysticks; unverified for the PowerA pad.
- timestamp: 2026-10-30
  checked: existing bottles' system.reg
  found: [System\\CurrentControlSet\\Services\\winebus] exists in HKLM (system.reg) with no Disable* values. The stage only writes HKCU today, and its own reg add spawns a wine session where winebus runs (so a reg add cannot protect the first session; winebus reads values only at service start).
  implication: to prevent the stage-time wedge too, the value must be in system.reg before the session starts (offline text patch of system.reg while no wineserver is running for that bottle), or accept stage retry for the first session and reg add for later ones.
- timestamp: 2026-10-30
  checked: pad presence and whether newer CrossOver fixes it
  found: pad not connected on this machine now; no live test possible; newer CrossOver not checked.
  implication: live gate needed.
- timestamp: 2026-10-30 17:03-17:13 (live gate, user at machine)
  checked: Ranch bottle GameLibSteamBridge-1119730: system.reg backed up to system.reg.bak-hidraw; `reg add HKLM\System\CurrentControlSet\Services\winebus /v DisableHidraw /t REG_DWORD /d 1 /f` via /Applications CrossOver wine (reg query read back 0x1; system.reg line 92578 `"DisableHidraw"=dword:00000001` after session exit). Ranch launched from GameLib (clone runner crossover-26.3.0.39832, wineserver 30882 CX_BOTTLE=GameLibSteamBridge-1119730, started 17:05:21, after the value was written). User hot-plugged the PowerA pad after the game started.
  found: ioreg shows 3 PowerA (VendorID 8406) IOHIDDevice entries (vs 6 in the 10-29 hot-plug). winedevice 30974 / 31065 stayed at 0.0-2.0% CPU on every 2 s poll 17:08:59-17:13 (vs 87.6% within seconds on 10-29 without the value). Pad gives NO input in game.
  implication: DisableHidraw=1 prevents the wedge (IOHID bus off confirmed effective) but SDL bus does not deliver the pad to the game. Branch "idle but no input". Likely reason: wine's xinput only sees winebus devices SDL classifies as game controllers (SDL_IsGameController + Map Controllers); SDL2 probably has no mapping for 20d6:a720 (the WebKit Gamepad API also reports it mapping="" buttons=17 axes=10, quick 260925-ms5), so at best it is a generic DInput/HID joystick. Ranch's input API (XInput vs DInput) unknown. Next lever to test: SDL_GAMECONTROLLERCONFIG with a mapping for this GUID passed to the wine session env; also check (WINEDEBUG=+hid,+plugplay or SDL trace) whether the SDL bus enumerates the pad at all.
- timestamp: 2026-10-30
  checked: repo for a prior in-game controller spike (user recalled one)
  found: the recalled work is quick tasks 260923-qe5 / 260925-m5i / 260925-9de / 260925-ms5 — GameLib's own Console Mode (browser Gamepad API) index mapping for this pad, mostly done on Windows. It never touches wine/winebus. No in-game (wine) controller spike exists.
  implication: in-game wine input for this pad on macOS is unexplored ground.
- timestamp: 2026-10-30 (static, offline)
  checked: winebus.so strings, CrossOver libSDL2 strings, pad HID report descriptor via ioreg (read-only), quick 260925-ms5 button indices, env plumbing in bridgeKnownFixes.ts
  found: (1) winebus.so getenv("SDL_GAMECONTROLLERCONFIG") and logs "Setting environment mapping %s" / "Setting registry mapping %s"; it does not set the SDL background-events hint itself. (2) bundled SDL2 has no mapping for 20d6:a720 (only 20d6:2a79 BDA); it does carry SDL_GAMECONTROLLER_IGNORE_DEVICES / SDL_JOYSTICK_HIDAPI* envs. (3) Descriptor: GenericDesktop/GamePad, 17 buttons (usage 1-17), 1 hat (0-7, 4 bit), 4 x 8-bit axes (X,Y,Z,Rz); no analog triggers (ZL/ZR are buttons 6,7). (4) Windows measurements (ms5): L/R/ZL/ZR = 4/5/6/7, L3/R3 = 10/11, Home 12, Capture 13, A cap 2 => idx0 Y, 1 B, 2 A, 3 X, 8 minus, 9 plus. (5) injection point: tier-1 known-fix envVariables / bottle settings enviromentOptions (bridgeKnownFixes.ts ~l.326) via runWineCommand setupEnvVars; wineserver/winedevice inherit env from whichever process starts the bottle's wineserver (the stage session), so the var must be present at stage time, not only at game launch.
  implication: with no mapping SDL_IsGameController is false, so winebus exposes a raw joystick (DInput only, nothing for XInput). A mapping makes it a controller and winebus remaps to xinput layout. Candidate line (GUID version field 1201 = 274; add a version-0 twin as fallback):
  03000000d6200000 20a70000 12010000,PowerA Switch 2,a:b1,b:b2,x:b0,y:b3,back:b8,start:b9,leftstick:b10,rightstick:b11,guide:b12,misc1:b13,leftshoulder:b4,rightshoulder:b5,lefttrigger:b6,righttrigger:b7,dpup:h0.1,dpright:h0.2,dpdown:h0.4,dpleft:h0.8,leftx:a0,lefty:a1,rightx:a2,righty:a3,   (spaces in the GUID are only for reading; remove them). Axis order a2/a3 is a guess from usage order, to be confirmed live.
- timestamp: 2026-10-30 17:20-17:31 (live, user at machine; /Applications CrossOver wine, bottle GameLibSteamBridge-1119730, DisableHidraw=1, pad connected)
  checked: joy.cpl run 1 with SDL_GAMECONTROLLERCONFIG (powera.gcdb, two lines: version 1201 and 0000); WINEDEBUG was silently overridden to -all by the CrossOver wrapper (use --debugmsg / --cx-log). Then joy.cpl run 2 with the same mapping plus --debugmsg +plugplay,+hid,+hidp,+dinput,err+all --cx-log, SDL_LOGGING=*=verbose.
  found: run 1: pad NOT listed in joy.cpl; winedevice idle; lsof shows winebus.so + libSDL2 + Apple GCHIDLib.plugin (AppleGameControllerPersonality.kext) + GameControllerFoundation loaded in the winebus winedevice. Run 2: log confirms `bus_options_init UDEV hidraw devices disabled in registry`; buses started = SDL, UDEV (not compiled), XBOX (exits immediately); NO IOHID bus. `sdl_bus_init Setting environment mapping "03000000d620000020a7...PowerA Switch 2..."`. SDL never created a device for the pad (only the two 845e mouse/keyboard devices). Yet winedevice 53358 spun at 102% within 13 s: sample (scratchpad hidraw-winedevice-53358.sample.txt) main thread CFRunLoopRun > -[IOHIDDeviceClass valueAvailableCallback:] > __IOHIDDeviceInputReportWithTimeStampCallback > __IOHIDDeviceInputReportApplier > _sigtramp > ntdll.so recursion — the same signature as the 10-29 wedge.
  implication: the faulting IOHID input-report callback is NOT winebus's IOHID bus (it was off). The remaining in-process HID consumer is Apple's GameController framework (GCHIDLib), most likely pulled in by SDL2's MFi joystick driver; 10-29's `_onqueue_addMouse` signature is also GameController. DisableHidraw=1 is therefore not sufficient on its own; the Ranch no-spin run was likely luck (wedge is intermittent: run 1 and Ranch idle, run 2 spun). Mapping alone does not make SDL enumerate the pad. Next test: SDL_JOYSTICK_MFI=0 (and if needed SDL_JOYSTICK_HIDAPI=0) — does GCHIDLib still load, does the spin stop, does SDL then enumerate 20d6:a720 via its IOKit backend.
- timestamp: 2026-10-30 ~18:20 (live, run 3: same as run 2 plus SDL_JOYSTICK_MFI=0, log scratchpad joycpl3.log)
  checked: joy.cpl with mapping + SDL_JOYSTICK_MFI=0, --debugmsg +plugplay,+hid,+dinput,err+all; user checked the panel
  found: SDL now enumerates the pad: `sdl_add_device controller id 0 ... {vid 20d6, pid a720, version 0112, ... is_gamepad 1}`, `creating non-hidraw device 20d6:a720 with usages 0001:0005`. Pad still NOT listed in joy.cpl. 1 ms after the device is created, winedevice tid 00a4 starts taking `handle_syscall_fault code=c000001d` (illegal instruction) at 0x7ff815ba7cbb = libsystem_platform.dylib+0x7cbb (os_unfair_lock / trap territory; cf. 10-29 `_os_unfair_lock_lock_slow` signature): 14 faults, 0 in run 2 (where SDL never opened the pad). Consequence: setupapi `open_driver_key Failed to open driver class root key, error 0xC000001D`, `install_device_driver Failed to set config flags`, `Unable to install a function driver` for the pad AND wine's 845e mouse/keyboard devices -> no HID function driver -> dinput/xinput never see the pad. No CPU spin this run (GameController libs still mapped in winedevice despite MFI=0). Pad HID descriptor (ioreg): 16 buttons + hat + button 17 + 4x8-bit axes + 1 const byte = 8 bytes; MaxInputReportSize=8; ReportInterval 4000 us.
  implication: the defect is not specific to winebus's IOHID bus. Whichever in-process consumer opens this pad (winebus IOHID, SDL IOKit, or GameController) corrupts winedevice's memory / lock state almost immediately; the CPU spin is just one outcome. Natively (arm64 WebKit Gamepad API in GameLib, quick 260925-ms5) the pad works, so suspect the x86_64-under-Rosetta IOHID input-report path or a report larger than the declared 8 bytes overflowing the callback buffer. Discriminating experiment: a tiny native IOHID probe registering an input-report callback with an 8-byte buffer, built arm64 and x86_64 (Rosetta), logging reportLength — does x86_64 crash / do reports exceed 8 bytes?
- timestamp: 2026-10-30 (live, native IOHID probe outside wine; source scratchpad hidprobe/hidprobe.c)
  checked: standalone IOHIDManager probe matching 20d6:a720, IOHIDDeviceOpen + IOHIDDeviceRegisterInputReportCallback with an 8-byte buffer (MaxInputReportSize) followed by 256 guard bytes checked on every callback; built arm64 and x86_64 (run under Rosetta, as winedevice is).
  found: arm64 3 s: 375 reports, all len 8, overflows 0. x86_64/Rosetta 30 s (user asked to press buttons): 3741 reports (~125 Hz), all len 8, overflows 0, no crash, exit 0. Idle report = `00 00 0f 80 80 80 80 00` (buttons 0, hat neutral 0x0f, 4 axes centred). Every sampled line (1-5, then every 250th) showed the idle report, so the probe neither proves nor disproves that button presses were captured.
  implication: ELIMINATED report-size overflow (reports are exactly the declared 8 bytes) and ELIMINATED a plain Rosetta x86_64 IOHID input-report defect. The corruption needs wine's process environment (winedevice's CFRunLoop/signal handling/ntdll under CrossOver) plus a consumer opening this pad. Open questions: does another HID pad (e.g. one GameController does not claim) trigger the same in winedevice, i.e. is it this device or any raw-IOHID pad; does a newer CrossOver behave differently.

- timestamp: 2026-10-30 (research: newer CrossOver / upstream wine)
  checked: /Applications/CrossOver.app Info.plist; runner clone dir name; codeweavers.com/crossover/changelog; bugs.winehq.org REST (quicksearch iohid, winebus, winedevice+macos, SDL+joystick+macos); gitlab.winehq.org commit history for dlls/winebus.sys/{bus_iohid.c,bus_sdl.c,unixlib.c,main.c}; strings of bundled libSDL2 and winebus.so
  found: (1) /Applications CrossOver.app is 26.3.0.39832, identical to the clone crossover-26.3.0.39832. The newest CrossOver release on the changelog is 26.3.0 (2026-07-21); no 26.3.x/26.4 or preview exists, so there is no newer CrossOver to try. 26.3.0 notes mention nothing about controllers. (2) Upstream wine has no fix for a winedevice IOHID spin: bus_iohid.c has no commit since 2025-08 (only "Quiet a log message", 2025-08-05) apart from device-ID/USB-interface work (2026-09-21, 2026-10-06), which is not a crash fix. No WineHQ bug matches a winedevice spin/IOHID callback fault; bug 60522 (2026-10-17, macOS arm, wine 11.20) is a winebus input report queue that never drops reports (lag, 830 reports/s from a Steam virtual pad); related only as unbounded report handling. (3) CANDIDATE: upstream commit e90cb1c257b8 (2026-10-26) "winebus: Preserve signal handlers when initializing SDL": pSDL_SetHint(SDL_HINT_NO_SIGNAL_HANDLERS,"1") before SDL_Init, message "SDL_QUIT does not stop winedevice". The shipped CrossOver 26.3.0 winebus.so has SDL_SetHint but no SDL_NO_SIGNAL_HANDLERS string, so it lacks the fix. SDL2 honours env var of the same name as a hint, and the bundled libSDL2 contains "SDL_NO_SIGNAL_HANDLERS", so it can be applied without a rebuild via the session env. Fit with our faults: run 3 faults started 1 ms after SDL opened the pad and wine's own handlers (SIGILL/SIGSEGV driven by ntdll.so handle_syscall_fault, sigtramp recursion) are exactly what a clobbered signal handler would disturb; unproven, since SDL's QuitInit normally only claims SIGINT/SIGTERM, so treat as a plausible but unconfirmed lead (the 10-29 IOHID-bus wedge occurred with SDL enabled by default too).
  implication: no newer binary to install; the only cheap actionable lead is env SDL_NO_SIGNAL_HANDLERS=1 (plus the earlier SDL_JOYSTICK_MFI=0 and the mapping) in the wine session. Live test pending, user needed.

- timestamp: 2026-10-31 14:29 (live Run A, pad plugged in, bottle GameLibSteamBridge-1119730 with DisableHidraw=1, /Applications CrossOver wine 26.3.0.39832, env SDL_NO_SIGNAL_HANDLERS=1 + SDL_GAMECONTROLLERCONFIG (powera.gcdb recreated, 2 lines) + SDL_LOGGING=*=verbose, joy.cpl with --debugmsg +plugplay,+hid,+dinput,err+all --cx-log; log scratchpad joycpl-runA.log)
  found: no wineserver beforehand; pad present (3 HID entries VendorID 8406). New winedevice 16229 (started 14:29:51 with the new wineserver 16043) was at 91-94% CPU on every 2 s poll for the full 20 s (spin, wedge NOT prevented). sample (scratchpad runA-winedevice-16229.sample.txt): CFRunLoopRun > -[IOHIDDeviceClass valueAvailableCallback:] > __IOHIDDeviceInputReportWithTimeStampCallback > __IOHIDDeviceInputReportApplier, the same signature as 10-29 and run 2. Log: bus_options_init "UDEV hidraw devices disabled" and sdl_bus_init environment mapping set, but no sdl_add_device / non-hidraw device for the pad, 0 c000001d faults, 0 "Unable to install a function driver" lines (same state as run 2: SDL never opens the pad, GameController/GCHID path spins). Side note: a second winedevice 78042 (started 13:44, another bottle/session) was also spinning ~97%; unattributed, not touched. Our bottle's wineserver was killed (wineserver -k) after sampling; joy.cpl listing was not checked by the user.
  implication: ELIMINATED SDL_NO_SIGNAL_HANDLERS=1 as a fix. The spin comes from the Apple GameController/GCHID in-process IOHID consumer (SDL MFI driver, run 2 vs run 3 differ only by SDL_JOYSTICK_MFI=0, which converts the spin into SDL IOKit enumeration plus c000001d faults). Signal-handler clobbering is not the mechanism. No env/registry lever found works; no newer CrossOver or upstream fix exists.

## Resolution

root_cause: CrossOver-internal defect. Any in-process consumer that opens the PowerA Switch 2 pad (20d6:a720) inside winedevice under CrossOver 26.3.0.39832 (Apple GameController/GCHID, winebus IOHID, or SDL IOKit) corrupts it, showing as a CPU spin or c000001d faults. A native IOHID probe, arm64 and x86_64 under Rosetta, is clean (8-byte reports, no overflow). No newer CrossOver exists (26.3.0, 2026-07-21 is latest) and upstream wine has no fix.
fix: none possible from GameLib. The existing stage retry in stageDrmBottle.ts stays as the mitigation for stage-time wedges. The pad is documented as unsupported in DRM mode.
verification: levers eliminated live: DisableHidraw=1, SDL_GAMECONTROLLERCONFIG mapping, SDL_JOYSTICK_MFI=0, SDL_NO_SIGNAL_HANDLERS=1.
files_changed: []
