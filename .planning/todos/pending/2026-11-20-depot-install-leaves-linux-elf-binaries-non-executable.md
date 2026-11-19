---
created: 2026-11-20T00:00:00.000Z
title: 'Depot install leaves Linux ELF game binaries non-executable (ADOM and Amnesia fail to launch)'
area: steam-depot-download
severity: major
platform: linux
ready: code
files:
  - src-tauri/crates/gamelib-depot/src/post.rs
  - src-tauri/crates/gamelib-depot/src/download.rs
---

## Problem

Found during the Phase 81 live gate, item 11(a) on Linux (`81-HUMAN-UAT.md`, 2026-11-20);
not caused by Phase 81. Native Debian Steam install (`~/.steam/debian-installation`), games
installed through GameLib's depot path.

- ADOM (333300): `common/ADOM/adom` is an ELF 32-bit executable installed `-rw-rw-r--`.
  Steam showed `App Running` then `Fully Installed` about a second later in `content_log.txt`
  (04:34:56 to 04:34:57, and again 04:35:03 to 04:35:04): the launch died at once. It could not
  be started from Steam either.
- Amnesia: The Dark Descent (57300): every binary (`Amnesia.bin.x86_64`, `Amnesia.bin.x86`,
  the `_NOSTEAM` variants, `Launcher.bin.x86_64`, `Launcher.bin.x86`) is `-rw-rw-r--`;
  `find . -maxdepth 2 -type f -perm -u+x` printed nothing. After a manual `chmod +x` the game
  launched from Steam.

Two games in a row, so this is not one title's packaging. The depot crate sets the exec bit
from the manifest's `EXECUTABLE_FLAG` / `CUSTOM_EXECUTABLE_FLAG` (`post.rs`,
`apply_file_modes`) and the Mach-O probe fallback (`macho_wants_exec`,
`apply_macho_fallback`); the macOS shebang fallback from quick 261119-8rf is also
path-gated to `*.app/Contents/MacOS/`. Nothing handles ELF. The log line for the Amnesia
install, `[depot-rust] outcome appId=57300 ... macho=0 shebang=0`, has no ELF counter.
Why these manifests do not carry the exec flag is not verified; Steam's own client
presumably chmods on its installs.

Caveat on the live run: the first Play after the chmod showed Steam's first-run EULA and
"do you want to play" prompts and the game did not start from GameLib's press. That is a
Steam first-run dialog, not this defect, and is recorded in item 11(a).

## Direction

Add an ELF fallback beside the Mach-O one: a file whose first four bytes are `0x7F 'E' 'L'
'F'` is a candidate. Keep the content-AND-path invariant (`post.rs`, the 23-08 rule: a path
never grants +x on its own); decide the path gate for Linux (for example top-level and
`bin/` files, excluding `.so` shared objects and `lib/`/`lib64/`, which do not need +x to be
loaded). Mirror the Mach-O probe's shape (bounded read, report counter, for example
`stats.elfExecApplied` and `elf=N` in the `[depot-rust] outcome` line) and add a unit test
with an ELF-header fixture. Confirm live: a fresh GameLib install of 57300 and of 333300 on
Linux shows `-rwxr-xr-x` on the launch binary and launches through Steam with no manual
chmod.
