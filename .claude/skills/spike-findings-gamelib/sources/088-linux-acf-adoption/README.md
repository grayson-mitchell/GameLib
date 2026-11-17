---
spike: 088
name: linux-acf-adoption
type: standard
validates: "Given native Linux Steam and a GameLib-written appmanifest (StateFlags 4), when Steam starts, keeps running signed in, or signs in from signed out, then Steam adopts the ACF at startup and at sign-in with no dialog, ignores it while running, and GameLib can see the adoption without the bridge helper"
verdict: VALIDATED
related: [001, 003, 047, 083, 087]
tags: [steam, linux, adoption, restart-hold, restart-on-play, phase-81, live]
---

# Spike 088: Linux Steam adopts a GameLib-written ACF 

Linux run of todo `2026-11-17-spike-steam-startup-and-sign-in-adoption-on-linux.md`.
Machine: Pop!_OS-style desktop, native Debian `steam` package (not Flatpak), client 1794536281,
auto sign-in with a remembered login. Test app: Steam Linux Runtime 3.0 (sniper), 1628350,
810 MB, files already on disk. Steam's own ACF is in `backup/`; the "GameLib" ACF is that same
field set (it has no Steam-only `LauncherPath`), written tmp + rename.

## How to Run

```bash
./watch.py <run> [appid] [seconds]   # NDJSON to runs/<run>.ndjson
./ctl.sh status|remove|write 4|write 1026|restore|quit|start|url-exit|url-run
```

## Results so far

| Run | Setup | What Steam did |
|---|---|---|
| r2 | ACF removed, Steam started (`Loaded 5 apps`), signed in. ACF written while running. | Nothing for 2 min: ACF untouched, no log line. Steam is unaware (Q2 YES). |
| r3 | Continued. `steam://exit`, then `steam://rungameid/1628350`. | Steam exited in ~4 s (`pids` empty at +4 s). The URL started Steam again in ~12 s with auto sign-in, `Loaded 6 apps` (5 → 6), no update or validation lines. |
| r4 | Steam quit, ACF removed, Steam started (`Loaded 5 apps`; `libraryfolders.vdf` no longer lists 1628350). Operator signed out, which **restarted `steam`** (new pid pair, `[U:1:0]`). ACF written while signed out. Operator signed in. | The ACF sat untouched while signed out. At sign-in the **same pid** logged `Loaded 6 apps` (20:05:05, 31 s after the write, immediately before `[Logged On`), and `libraryfolders.vdf` lists 1628350 again. Operator: no dialog. |

- **Q1 startup: adopted** by the r3 restart: no Update, Validation or download line.
  "No dialog" is not confirmed — no screenshot tool on this machine, operator to confirm.
- **Q2 running: YES, Steam stays unaware** until a restart.
- **Q5 restart: YES.** `steam://exit` quits in ~4 s. Any later `steam://` URL (or plain `steam`)
  relaunches Steam. sniper is a tool with no launch option, so the "game runs" half is untested.
- **Q4 evidence, differs from Windows:** Steam did **not** rewrite the ACF (sha, mtime and
  `LauncherPath` unchanged 90 s after adoption), so "ACF rewrite" is not available for an
  app like this. Usable without the helper: content_log `Loaded N apps from install folder`
  (N includes the app) and the `apps` map in `steamapps/libraryfolders.vdf` (Steam rewrites it
  on each load: 1628350 absent after a no-ACF start, present after adoption).
  `registry.vdf` has no `ActiveUser`/`Apps/<id>/Installed` on Linux. Signed-in state is the
  `[Logged On` line in `logs/connection_log.txt`.
- Linux process model: `steam` forks `steamrt64/steam` twice (two PIDs); `registry.vdf`
  `SteamPID` is the live one and is 0 when quit.

- **Q3 sign-in: YES.** Sign-in rescans every library folder and adopts the ACF with no Steam
  restart and no dialog (operator-confirmed). Linux sign-out restarts `steam`, as on Windows,
  so a pid change alone is not adoption evidence.

## Phase 81 consequence

Linux answers yes to Q1 and Q5, so it gets **restart-on-Play** (D-14), not the D-15 simplified
hold. Detection uses the `Loaded N apps` rescan line and the `libraryfolders.vdf` `apps` map; it
cannot rely on an ACF rewrite. Restart Steam alone with plain `steam`, which shows the window;
`steam -silent` starts it in the tray only (mistaken for "not running" in this spike).

## Not tested

- A real game: whether Steam rewrites that ACF (`LauncherPath`) and whether `rungameid` starts
  it after relaunch. Sniper is a tool with no launch option.
- A startup dialog: only the sign-in run was operator-watched.
- StateFlags 1026, a non-default library folder, Flatpak Steam, Steam Deck gaming mode.
