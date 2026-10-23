---
spike: 034
name: xcom-ceg-handshake-trace
type: standard
validates: "Given XComEW.exe in a clean bridge bottle with GameLib's shim in place, when traced with +sync,+reg,+file, then we see exactly which named objects, registry keys and files the CEG start stub waits on"
verdict: VALIDATED
related: [007, 008, 033, 035]
tags: [steam, macos, bridge, ceg, drm, xcom, proton, dipc]
---

# Spike 034: XCOM CEG handshake trace

## What This Validates

Given XCOM: Enemy Within (`XEW\Binaries\Win32\XComEW.exe`, app 200510) in a bridge bottle (no
Windows Steam client) with GameLib's generated x86 shim as `steam_api.dll`, when the launch is
traced, then the exact handshake the CEG start stub blocks on is visible and nameable.

## Research

- **Prior art in this repo.** 51-UAT item 5 found XCOM reads `STEAM_SPLIT_GUID`/`STEAM_GUIDD`/
  `STEAM_MINSTANCE`, writes `<exe>.<pid>.STEAMSTART`, idles ~30 s and exits without
  `SteamAPI_Init`. Item 17 found Enemy Within reaches its menu under bottled Windows Steam, and
  base Enemy Unknown crashes inside Wine on every route. So the target is Enemy Within.
- **Proton solves exactly this on Linux.** Valve added CEG support to Proton in late 2021
  ([GamingOnLinux](https://gamingonlinux.com/2021/10/valve-adds-support-for-games-using-ceg-drm-through-steam-play-proton)).
  Proton's stub `steam.exe` (`ValveSoftware/Proton` → `steam_helper/steam.c`) runs
  `steam_drm_thread`. It creates `STEAM_DIPC_CONSUME` (semaphore, 0/512) and `SREAM_DIPC_PRODUCE`
  (sic, 1/512), and loops: wait CONSUME → find `\BaseNamedObjects\Session\1\STEAM_START_ACK_EVENT*`
  → `SetEvent` → release PRODUCE. It also writes `HKCU\Software\Valve\Steam\ActiveProcess\pid`,
  creates the events `Steam3Master_SharedMemLock` and `Global\Valve_SteamIPC_Class`, and sets
  `SteamPath`/`ValvePlatformMutex` env. **Nothing in Proton reads the STEAMSTART file.**
- The macOS native Steam client is still a real, signed-in client that the bridge helper already
  proxies (005a). If the start stub just needs an ACK, the bridge can give one.

| Approach | Pros | Cons | Status |
|---|---|---|---|
| Trace in the bridge bottle only, Proton source as the spec | Cheap; one bottle; no bottled Steam boot | No Windows-Steam diff | **Chosen** |
| Also diff against bottled Windows Steam | Ground truth for what Steam answers | Boots the full bottled client; the Proton source already names the protocol | Skipped (trace and Proton agree exactly) |
| Patch the exe / strip CEG | — | DRM circumvention; **out of bounds for this spike** | Rejected |

## How to Run

```bash
./setup.sh                                   # GameLibSpikeXCOM bottle + shadow tree + build shim
WATCH=40 CXLOG=+sync,+reg,+file ./run.sh t2-trace
```

`setup.sh` APFS-clones a bridge bottle into `GameLibSpikeXCOM` and builds a **shadow tree** at
`drive_c\XCOM`: symlinks into the GameLibSteam install, except a real `XEW\Binaries\Win32`
holding GameLib's shim (built from `native/steam-bridge/generated` with the repo-pinned zig, the
same command as 033). The original install is never touched. `run.sh` starts the real
`steam-bridge-helper --appid 200510 --port 0`, writes `gamelib_bridge.cfg`, and launches the exe.

## What to Expect

The helper logs LISTEN + INIT, but the shim never logs HELLO. The process writes
`XComEW.exe.<pid>.STEAMSTART` and exits after 30 s.

## Investigation Trail

1. **t1-bare**: reproduced item 5 in the scratch bottle with the symlinked tree: STEAMSTART
   written, no HELLO, exited before 45 s. `WINEDEBUG` is ignored by CrossOver's `bin/wine`, so
   the log was empty. Use `--cx-log <file> --debugmsg <channels>` instead.
2. **STEAMSTART contents** (13 KB): three length-prefixed 16-byte GUIDs (the three PE
   resources), the exe name, the exe path (ANSI and UTF-16), the command line, then **the
   process's entire environment block**. It's a "start me properly" request, carrying
   everything a launcher would need to relaunch the process. ⚠ Because it holds the full env,
   **never commit a STEAMSTART file** (gitignored).
3. **t2-trace** (`evidence.txt`): the main thread, right after `steam_api.dll` maps and before
   any Steamworks call:
   1. `NtOpenKeyEx HKCU\Software\Valve\Steam`: succeeds; no value is read
   2. creates semaphore `STEAM_DIPC_CONSUME` (0/512) and `SREAM_DIPC_PRODUCE` (1/512, the same
      typo as Proton), and waits on PRODUCE (acquired immediately)
   3. creates events `STEAM_START_ACK_EVENT_<pid>_<n>` and `STEAM_TERM_EVENT_<pid>_<n>`
   4. writes `<exe>.<pid>.STEAMSTART` from the three PE resources plus path, cmdline and env
   5. `NtReleaseSemaphore` on CONSUME, i.e. "Steam, a request is waiting"
   6. `NtWaitForSingleObject` on one event with a **30 s timeout** → `0x102` (WAIT_TIMEOUT) →
      `LdrShutdownProcess`

## Results

**VALIDATED.** The CEG start stub's whole pre-init handshake is identified, and it is
**byte-for-byte the protocol Proton's `steam_drm_thread` answers**: the same object names,
including the `SREAM` typo, the same counts, the same CONSUME→ACK→PRODUCE order. Nothing in
this window reaches the bridge. The stub runs before `SteamAPI_Init`, so the shim and helper
were never given a chance; the helper sat at INIT the whole time.

- The blocker is **not** "needs a Windows Steam client". It's "needs someone to ACK the DIPC
  start request". Proton shows the ACK alone can be enough on the Windows side, with no
  STEAMSTART parsing.
- Open question for 035: does the ACK alone get it past this point, and what does CEG ask for
  after that (the real ownership and integrity check may come later, through steamclient or
  steam_api)?
- The handle mapping (which of ACK/TERM is waited on) is ambiguous from handle numbers alone;
  035's experiment decides it.
