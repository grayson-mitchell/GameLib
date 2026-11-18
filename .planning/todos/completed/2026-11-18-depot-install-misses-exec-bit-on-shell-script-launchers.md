---
created: 2026-11-18T00:00:00.000Z
title: 'Depot install leaves shell-script launchers non-executable (Bastion opens in TextEdit)'
area: steam-depot-download
severity: major
platform: macos
ready: code
files:
  - src-tauri/crates/gamelib-depot/src/post.rs
  - src-tauri/crates/gamelib-depot/src/download.rs
---

## Problem

Found during the Phase 81 live gate, item 3 (`81-HUMAN-UAT.md`, launch L2, 2026-11-18);
not caused by Phase 81. GameLib depot-installed Bastion (107100) on macOS. Its launcher
`Bastion.app/Contents/MacOS/Bastion` is a bash script, and it was installed `-rw-r--r--`.
Pressing Play: Steam launched it, macOS opened the script in TextEdit, Steam then tracked
TextEdit as the running game and refused the next launch with `AppError_16` ("already
running"). After a manual `chmod +x` and quitting TextEdit the game ran (bash, then
`Bastion.bin.osx`).

The depot crate sets the exec bit from only two sources: the manifest's
`EXECUTABLE_FLAG` / `CUSTOM_EXECUTABLE_FLAG` (`post.rs`, `apply_file_modes`) and the
Mach-O probe fallback (`post.rs`, `macho_wants_exec` / `apply_macho_fallback`). Bastion's
manifest does not flag the script and the script is not Mach-O, so it stays 0644. Steam's
own client presumably makes such launchers executable on its own installs (not
verified at the gate).

## Direction

Extend the fallback: treat a file that starts with `#!` as executable, at least for the
file named by the bundle's `Contents/Info.plist` `CFBundleExecutable` and for files under
`*.app/Contents/MacOS/`. Mirror the Mach-O probe's shape (bounded read, report counter)
and add a unit test with a shebang fixture. Confirm live afterwards: a fresh GameLib
install of 107100 launches through Steam without a manual `chmod`.

## Resolution

Fixed by quick 261119-8rf (commits 25487537d, fc4d35a8b, ade7147ab). Scope decision: the
shebang fallback needs content AND path, a file starting with `#!` whose resolved destination
is inside `*.app/Contents/MacOS/`; a path never grants +x on its own. No `Info.plist` parse,
because `CFBundleExecutable` always names a file in that directory, and it avoids a
cross-file ordering dependency between concurrently landing files. The count is reported as
`stats.shebangExecApplied` and `shebang=N` in the `[depot-rust] outcome` log line.

**Follow-up (human, live):** a fresh GameLib depot install of 107100 on the Mac launches
through Steam with no manual chmod. `ls -l` on `Bastion.app/Contents/MacOS/Bastion` shows
`-rwxr-xr-x`, and gamelib.log's `[depot-rust] outcome appId=107100` line shows `shebang=1`.
The Phase 81 live gate re-run of `81-HUMAN-UAT.md` item 3 (launch L2) can carry this.
