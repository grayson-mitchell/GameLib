---
spike: 087
name: windows-acf-adoption
type: standard
validates: "Given native Windows Steam and a GameLib-written appmanifest (StateFlags 4 or 1026), when Steam starts, keeps running signed in, or signs in from signed out, then Steam adopts the ACF at startup and at sign-in with no dialog and no verify, ignores it while running, and GameLib can see the adoption without the bridge helper"
verdict: VALIDATED
related: [001, 003, 047, 083]
tags: [steam, windows, adoption, restart-hold, restart-on-play, phase-81, live]
---

# Spike 087: Windows Steam adopts a GameLib-written ACF at startup and at sign-in

## What This Validates

This is the Windows run of todo `2026-11-16-spike-steam-startup-and-sign-in-adoption-on-windows.md`,
which Phase 81 D-14 requires before planning. Every earlier adoption spike (001/003, 047, 083)
ran on macOS only. The test machine is real Windows 11 with native Steam (client 1794536281).

## Research

Prior art, carried forward rather than re-spiked:

- 001/003: Mac Steam adopts a GameLib ACF at startup, and StateFlags 4 is accepted with no
  verify.
- 047a: a running, signed-in Mac Steam ignores an ACF written after it started. Do not
  re-spike `steam://install`, because it needs a click (047/048).
- 083: Mac sign-in reloads every `appmanifest_*.acf`. A 1026 ACF whose manifest matches gets a
  zero-file commit, not a verify.
- Production writer: `gamelib-steamfiles/src/acf.rs` `build_app_manifest_text`. It writes
  StateFlags 4 when the `can_write_full_ownership` gate passes, otherwise 1026, and writes the
  file atomically (tmp + rename). `gamelib-4.acf` and `gamelib-1026.acf` reproduce that field
  set and order byte for byte. They use WazHack's real Windows depot 264161, manifest
  4716738664447498691, buildid 9044149 and LastOwner.

## How to Run

```powershell
.\watch.ps1 -Run <name> [-AppId 264160] [-Seconds 600]   # NDJSON to runs\<name>.ndjson
.\ctl.ps1 status|remove|write 4|write 1026|restore|quit|start
```

The watcher polls once a second and logs only on change, plus a 30 s heartbeat. It records:

- `steam.exe` PIDs;
- HKCU `Software\Valve\Steam\ActiveProcess` (`pid`, `ActiveUser`);
- HKCU `Apps\264160` (`Installed`/`Updating`/`Running`);
- the ACF (exists, mtime, StateFlags, `LauncherPath` present, sha256 prefix);
- every new `logs\content_log.txt` line.

`ctl.ps1 quit` runs `steam.exe -shutdown`. `write` copies the file to a temp file and renames
it into place, the same way production writes it. After each write, the run set the ACF's
mtime to now.

Test game: WazHack (264160, 116 MB), installed in the default library. Steam's original ACF is
in `backup\`, and each removed ACF is in `out\`.

## Investigation Trail

| Run | Setup | What Steam did |
|---|---|---|
| r1 | Steam quit. Steam's ACF swapped for `gamelib-4`. Steam started. | `Loaded 11 apps` at startup. Auto sign-in at +23 s. ACF rewritten 1 s later (adds `LauncherPath`, keeps 4). `Dependency added: parent 228980, child 264160`. No Update or Validation lines. Operator saw no dialogs. |
| r2 | Steam restarted with **no** ACF (`Loaded 10 apps`), signed in. `gamelib-4` written while running. | Nothing for 2 min: ACF untouched, no content_log line. The tile shows Play, but the game page shows it is **Remote Play streaming from the Mac**, not a local install. Steam is unaware. |
| r3 | Continued from r2. `steam://exit`, then `steam://rungameid/264160`. | Steam exited gracefully in 2 s. The URL relaunched Steam, which logged `Loaded 11 apps`, then `Dependency added`, then `state changed : Fully Installed,App Running`. Local `WazHack.exe` running 15 s after the URL. No game file newer than the ACF. |
| r4 | Steam restarted with no ACF, then **operator signed out**. `gamelib-4` written while signed out (`ActiveUser` 0). Operator signed in. | **Signing out restarted `steam.exe`** (PID 34560 → 29668). While signed out, the ACF sat untouched for about 90 s. At sign-in the **same PID** logged `Loaded 11 apps` (06:12:16), then `ActiveUser` was set at about +10 s, then the ACF was rewritten +1 s later, then `Dependency added`. Operator: game page shows a local Play button, no dialogs. |
| r5 | Steam quit. `gamelib-1026` written. Steam started. | `Update Required,Update Queued,Update Started`, then `has no changes, 1 active: 264161 (…), 1 target: 264161 (…)`, then `starting commit … : 0 updated, 0 moved, 0 deleted files`, then `Fully Installed`. ACF rewritten to 4 with `TargetBuildID 9044149`. No Validation line, and no files touched. Identical to Mac 083. |

Side findings:

- **HKCU `Apps\<id>\Installed` is useless as an oracle.** It stayed 1 through every run,
  including while Steam was running signed in with no ACF and showed the game as not installed.
  `Running` is reliable: it was 1 while WazHack ran.
- **HKCU `ActiveProcess.ActiveUser` is a clean signed-in signal.** It is 0 while signed out or
  quit, and the account ID once signed in. `ActiveProcess.pid` is the live Steam PID, and 0
  once Steam has quit.
- **On Windows, sign-out restarts the Steam process; sign-in does not.** A hold that is released
  when "the recorded Steam pid exits" (D-15) would be released by a mere sign-out, before
  Steam has adopted anything.
- The Remote Play tile can show Play for a game that is not installed locally. A UI check of
  "is it installed" needs the game page.

## Results

**VALIDATED. Windows behaves like macOS on every question:**

1. **Startup: YES.** Steam adopted a StateFlags 4 ACF with no dialog, no verify and no
   download (r1). It also did so when this Steam had last seen the game as not installed (r3).
   A 1026 ACF got a zero-file commit, not a verify (r5).
2. **Running: YES, Steam stays unaware.** An ACF written into a running, signed-in Steam is
   ignored until Steam restarts or signs in again (r2).
3. **Sign-in: YES.** Sign-in reloads every library folder and adopts the ACF, with no restart,
   in about 11 s from the rescan line to the ACF rewrite (r4).
4. **Evidence without the helper:**
   - **Primary: Steam rewrites the ACF.** The sha or mtime changes, and the Steam-only key
     `LauncherPath` appears, within about 1 s of adoption. For a 1026 ACF, StateFlags also
     becomes 4.
   - **content_log `Dependency added: parent 228980, child <id>`** appears at adoption for
     this game. It is a dependency of the Steamworks Common Redistributables, so do not rely on
     it for every app.
   - For 1026: `AppID <id> state changed : Fully Installed,` after the zero-file commit.
   - **content_log `Loaded N apps from install folder "<lib>\steamapps\appmanifest_*.acf"`**
     marks every rescan (startup or sign-in). N includes the app once it is adopted.
   - HKCU `ActiveUser` gives the signed-in state, and `ActiveProcess.pid` gives the Steam PID.
     HKCU `Installed` must **not** be used.
5. **Restart: YES.** `steam://exit` quits gracefully in 2 s, and `steam://rungameid/<id>` then
   relaunches Steam with the game, which ran locally after 15 s. **Restart Steam alone:** start
   `<SteamPath>\steam.exe` with no arguments (SteamExe from HKCU `Software\Valve\Steam`). It
   ran 5 times in this spike with no dialog and an automatic sign-in. `steam.exe -shutdown` is
   an equivalent graceful quit (2–5 s).

**Phase 81 consequence:** Windows gets **restart-on-Play** (D-14 yes on Q1 and Q5), not the
D-15 simplified hold. Detection uses the Q4 non-helper evidence: the ACF rewrite is primary,
`ActiveUser` gives sign-in, and the content_log rescan line gives timing. It does not use a PID
change alone, because a Windows sign-out also changes the PID.

**Not tested:**

- a non-default library folder (D:\);
- `buildid "0"`;
- a game with no redistributable dependency, to check the `Dependency added` line;
- Steam started minimised or in Big Picture;
- Offline Mode;
- Linux, which is a separate todo.

State left behind: WazHack is adopted, with a Steam-rewritten StateFlags 4 ACF. The original is
in `backup\`.
